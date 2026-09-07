/**
 * rapport-fotos.ts — de gedeelde fotopijplijn voor rapportages op de documentenpijplijn.
 *
 * Uitgetrokken uit `houtrot-rapport.ts` en `kwaliteit-rapport.ts`, waar dezelfde sharp-keten
 * en dezelfde grenzen twee keer stonden. De twee verschilden op één punt dat je makkelijk
 * over het hoofd ziet, en dat verschil is hier een parameter geworden in plaats van dat het
 * stilzwijgend is gladgestreken:
 *
 *  - houtrot **weigert** bij budgetoverschrijding (een halve rapportage is daar geen
 *    rapportage), en slaat die controle over in preview;
 *  - kwaliteit **laat de resterende foto's vallen** zodat de conversie niet klapt.
 *
 * Zie `pasFotoBudgetToe`.
 *
 * Bewust NIET hierheen verplaatst: `haalAfbeelding` uit `lib/dossiers/oplever-rapport-pdf.ts`.
 * Die levert een kale `Uint8Array` voor pdf-lib (dat sluit bytes in, geen base64), schaalt op
 * 900 px bij kwaliteit 72 en heeft een eigen budget van 25 MB omdat het resultaat een
 * mailbijlage is. Samenvoegen zou daar gedrag veranderen.
 */

import 'server-only'
import { bufferNaarDataUrl } from './render-docx'

/**
 * Grenzen aan het fotogebruik in een rapportage. Verplaatst, niet gewijzigd: deze waarden
 * stonden identiek in beide modules.
 */
export const FOTO_GRENZEN = {
  /** Bronfoto's groter dan dit worden overgeslagen (kapotte upload / rauw bestand). */
  MAX_BRON_BYTES: 12 * 1024 * 1024,
  /** JPEG's comprimeren nauwelijks in een zip; boven deze som loopt de Graph-conversie vast. */
  MAX_TOTAAL_BYTES: 35 * 1024 * 1024,
  /** Gelijktijdig opgehaalde foto's. Niet Promise.all over honderden: dat trekt sharp leeg. */
  PARALLEL: 6,
  /** Ingesloten fotobreedte in px. Getoond op ~180 px → ±200 dpi op papier. */
  PX: 380,
  JPEG_KWALITEIT: 70,
} as const

export type FotoResultaat = { dataUrl: string; bytes: number }

const GEEN_FOTO: FotoResultaat = { dataUrl: '', bytes: 0 }

/**
 * Voert `fn` uit over `items` met hooguit `limiet` tegelijk, met behoud van volgorde.
 * Verbatim overgenomen; de twee kopieën waren identiek.
 */
export async function mapMetLimiet<T, R>(
  items: T[],
  limiet: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const uit = new Array<R>(items.length)
  let volgende = 0
  const werker = async () => {
    for (;;) {
      const i = volgende++
      if (i >= items.length) return
      uit[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limiet, items.length) }, werker))
  return uit
}

/**
 * Alleen foto's uit onze eigen publieke storage-bucket mogen worden opgehaald.
 *
 * `kwaliteit_fotos.url` en `oplever_fotos.url` zijn vrije tekstkolommen met een volledige
 * URL, en hieronder doet de server daar een `fetch` op. Zonder deze controle is dat een pad
 * waarlangs een geprepareerde rij de server een willekeurig adres laat benaderen — en het
 * resultaat belandt in een rapport dat naar de klant gaat. Houtrot had dit probleem niet:
 * die bouwt de URL zelf op uit een storage-pad.
 *
 * Onbekende herkomst → lege string → de LEGE_PIXEL-tak; de bevinding blijft gewoon staan.
 */
export function veiligeFotoUrl(url: string | null | undefined): string {
  const u = String(url ?? '').trim()
  if (!u) return ''
  const basis = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!basis) return ''
  const toegestaan = `${basis.replace(/\/+$/, '')}/storage/v1/object/public/`
  return u.startsWith(toegestaan) ? u : ''
}

/**
 * Haalt een foto op en maakt er een compacte JPEG-data-URL van.
 *
 * Sharp doet drie dingen die geen van alle optioneel zijn: verkleinen (scheelt megabytes per
 * foto), EXIF-rotatie toepassen (telefoonfoto's staan anders op hun kant) en transparantie op
 * wit zetten. De uitkomst gaat door `bufferNaarDataUrl`: de image-module ziet een kale Buffer
 * aan voor een al-verwerkte afbeelding en crasht dan — alleen een base64-string doorloopt het
 * echte insluit-pad.
 *
 * Een lege URL geeft een leeg resultaat in plaats van een fout; dat scheelt de aanroepers een
 * ternary bij elke opdracht.
 */
export async function haalRapportFoto(url: string): Promise<FotoResultaat> {
  if (!url) return GEEN_FOTO
  try {
    const res = await fetch(url)
    if (!res.ok) return GEEN_FOTO
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > FOTO_GRENZEN.MAX_BRON_BYTES) return GEEN_FOTO

    const sharp = (await import('sharp')).default
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: FOTO_GRENZEN.PX, height: FOTO_GRENZEN.PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: FOTO_GRENZEN.JPEG_KWALITEIT, mozjpeg: true })
      .toBuffer()
    return { dataUrl: bufferNaarDataUrl(jpeg), bytes: jpeg.byteLength }
  } catch {
    // Onleesbaar of niet-ondersteund formaat (bv. HEIC zonder libheif) → geen foto.
    // Een lege string activeert de LEGE_PIXEL-tak; de rij blijft gewoon staan.
    return GEEN_FOTO
  }
}

/** Haalt een reeks foto's op met de standaard-parallelliteit. */
export function haalRapportFotos(urls: string[]): Promise<FotoResultaat[]> {
  return mapMetLimiet(urls, FOTO_GRENZEN.PARALLEL, haalRapportFoto)
}

/**
 * Wat er moet gebeuren zodra de foto's samen boven het budget uitkomen.
 *
 * - `'laat_vallen'` — lopende som; alles daarboven wordt een lege string. De rapportage komt
 *   er dus altijd, maar zonder de laatste foto's.
 * - `'weiger'` — som over álles, en boven het budget een `Error`. Voor rapportages waar een
 *   deel van de foto's ontbreken erger is dan geen rapportage.
 */
export type BudgetModus = 'laat_vallen' | 'weiger'

export interface BudgetOpties {
  /** `false` slaat de controle helemaal over (preview-pad). Standaard `true`. */
  actief?: boolean
  /** Fouttekst bij `'weiger'`; krijgt het totaal in hele MB's mee. */
  melding?: (mb: number) => string
}

/**
 * Past het fotobudget toe en geeft de data-URL's terug in dezelfde volgorde.
 */
export function pasFotoBudgetToe(
  resultaten: FotoResultaat[],
  modus: BudgetModus,
  opties: BudgetOpties = {},
): string[] {
  const actief = opties.actief !== false

  if (modus === 'weiger') {
    const totaal = resultaten.reduce((s, f) => s + f.bytes, 0)
    if (actief && totaal > FOTO_GRENZEN.MAX_TOTAAL_BYTES) {
      const mb = Math.round(totaal / 1024 / 1024)
      throw new Error(
        opties.melding?.(mb)
        ?? `De foto's in deze rapportage zijn samen ${mb} MB; dat is te groot om om te zetten naar PDF.`,
      )
    }
    return resultaten.map(f => f.dataUrl)
  }

  // 'laat_vallen': boven de bytelimiet vallen de resterende foto's weg in plaats van dat de
  // hele conversie klapt.
  let som = 0
  return resultaten.map(f => {
    if (!f.dataUrl) return ''
    if (actief && som + f.bytes > FOTO_GRENZEN.MAX_TOTAAL_BYTES) return ''
    som += f.bytes
    return f.dataUrl
  })
}
