/**
 * render-docx.ts
 *
 * Generieke Word-render-engine: vult een .docx-template via docxtemplater met een
 * willekeurige context en geeft een ingevuld .docx terug. Deze module kent géén
 * offertes en géén documenten — alleen templates, tags en afbeeldingen.
 *
 * Consumenten:
 *  - `lib/everts-calc/render-quote-docx.ts` (offertes)
 *  - `lib/documenten/*` (bewonersbrief, garantiecertificaat, informatiebrief)
 *
 * Deze code is één-op-één uit render-quote-docx.ts gelicht. Let op drie details die
 * er niet uitzien als veel, maar waarvan het weglaten stilletjes alles sloopt:
 *  - `dottedTagParser` — zonder deze parser blijft ELKE dotted tag ({klant.naam})
 *    leeg, zónder foutmelding.
 *  - `fixSplitDocxTags` — Word knipt tags op over meerdere runs.
 *  - `getImage`/`getSize` — elke tak daarin is een opgeloste bug.
 */

import { fixSplitDocxTags } from '../everts-calc/docx-utils'
import { appGraphGetRaw } from '../o365/graph'

/** Gegooid wanneer een layout/sjabloon (nog) geen Word-template heeft gekoppeld. */
export class GeenTemplateError extends Error {
  constructor() {
    super('Geen Word-template geconfigureerd voor deze layout.')
    this.name = 'GeenTemplateError'
  }
}

/**
 * Haalt de .docx-template-buffer op. SharePoint/OneDrive-templates worden via
 * Microsoft Graph (app-only) opgehaald; anders uit de Supabase-storage-URL.
 *
 * Werkt voor elke rij met de vijf `docx_template_*`-velden — zowel `quote_layouts`
 * als `document_sjablonen` (die de kolomnamen bewust identiek houdt).
 *
 * @throws GeenTemplateError als er geen template gekoppeld is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadTemplateBuffer(rij: any): Promise<Buffer> {
  const bron: string | null = rij?.docx_template_bron ?? null

  if ((bron === 'sharepoint' || bron === 'onedrive') && rij?.docx_template_drive_id && rij?.docx_template_item_id) {
    return appGraphGetRaw(
      `/drives/${rij.docx_template_drive_id}/items/${rij.docx_template_item_id}/content`,
    )
  }

  const url: string | null = rij?.docx_template_url ?? null
  if (url) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Template ophalen mislukt: HTTP ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }

  throw new GeenTemplateError()
}

// 1×1 transparante PNG — gebruikt als een image-tag in het template staat maar er
// geen afbeelding beschikbaar is, zodat de image-module niet crasht.
const LEGE_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

/** Max afmetingen (px @96dpi) waarbinnen een afbeelding wordt geschaald. */
export const LOGO_MAX = { w: 240, h: 120 }
/** Max afmetingen voor werkomschrijving-foto's (groter dan een logo). */
export const PHOTO_MAX = { w: 480, h: 360 }
/**
 * Kleiner max-kader voor foto's binnen een tabelcel (tag {%foto_klein}). 3,7 inch
 * breed @96dpi, zodat de foto in een tabelkolom past en niet wordt afgesneden.
 * Zelfde 4:3-verhouding als PHOTO_MAX.
 */
export const PHOTO_MAX_KLEIN = { w: 355, h: 266 }

/** Standaard max-kaders per image-tagnaam; alles wat hier niet in staat krijgt LOGO_MAX. */
const STANDAARD_IMAGE_MAX: Record<string, { w: number; h: number }> = {
  foto: PHOTO_MAX,
  foto_klein: PHOTO_MAX_KLEIN,
}

export interface RenderDocxOpties {
  /** Max-kader per image-tagnaam. Aangevuld op (niet vervangend voor) de standaarden. */
  imageMax?: Record<string, { w: number; h: number }>
  /** Kader voor image-tags zonder eigen instelling. Default: LOGO_MAX. */
  standaardImageMax?: { w: number; h: number }
}

/**
 * Rendert een .docx-template met de meegegeven context naar een ingevuld .docx.
 */
export async function renderDocx(
  templateBuffer: ArrayBuffer | Buffer,
  context: Record<string, unknown>,
  opties: RenderDocxOpties = {},
): Promise<Buffer> {
  const imageMax = { ...STANDAARD_IMAGE_MAX, ...(opties.imageMax ?? {}) }
  const standaardMax = opties.standaardImageMax ?? LOGO_MAX

  const PizZip = (await import('pizzip')).default
  const Docxtemplater = (await import('docxtemplater')).default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ImageModule = (await import('docxtemplater-image-module-free' as any)).default
  const { imageSize } = await import('image-size')

  const zip = new PizZip(templateBuffer as ArrayBuffer)
  fixSplitDocxTags(zip)

  const imageModule = new ImageModule({
    centered: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getImage(tagValue: any) {
      if (!tagValue) return LEGE_PIXEL
      if (Buffer.isBuffer(tagValue)) return tagValue
      // Foto's komen binnen als base64 data-URL ("data:image/…;base64,XXXX") of als
      // kale base64-string; beide moeten binair worden gedecodeerd (niet als utf8).
      if (typeof tagValue === 'string') {
        const komma = tagValue.indexOf(',')
        const base64 = tagValue.startsWith('data:') && komma >= 0 ? tagValue.slice(komma + 1) : tagValue
        try {
          const buf = Buffer.from(base64, 'base64')
          return buf.length > 0 ? buf : LEGE_PIXEL
        } catch {
          return LEGE_PIXEL
        }
      }
      return Buffer.from(tagValue)
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getSize(img: Buffer, tagValue: any, tagName?: string) {
      if (!tagValue) return [1, 1]
      const max = (tagName && imageMax[tagName]) || standaardMax
      try {
        const dim = imageSize(new Uint8Array(img))
        // Alleen schalen als beide werkelijke afmetingen bekend zijn — dan blijft
        // de verhouding gegarandeerd behouden. Bij onbekende afmeting NIET naar het
        // max-kader forceren (dat zou de foto uitrekken/vervormen).
        if (dim.width && dim.height) {
          return fitSize(dim.width, dim.height, max)
        }
      } catch {
        // valt door naar de veilige fallback hieronder
      }
      // Verhouding onbekend: kies een vierkant binnen de max zodat de foto niet
      // actief naar een afwijkende verhouding wordt uitgerekt.
      const veilig = Math.min(max.w, max.h)
      return [veilig, veilig]
    },
  })

  const doc = new Docxtemplater(zip, {
    modules: [imageModule],
    paragraphLoop: true,
    linebreaks: true,
    parser: dottedTagParser,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nullGetter: (part: any) => (part.module ? '' : ''),
  })

  try {
    doc.render(context)
  } catch (renderErr: unknown) {
    throw new Error(formatDocxError(renderErr))
  }

  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * Dotted-path parser voor docxtemplater.
 *
 * docxtemplater lost standaard alleen platte tags (`{naam}`) en scope-tags op —
 * NIET de dotted notatie (`{offerte.nummer}`, `{klant.naam}`, `{uitvoerder.mobiel}`)
 * waar het hele variabelenpaneel op is gebaseerd. Zonder deze parser bleven al die
 * variabelen leeg. De parser splitst op `.` en zoekt de waarde in de huidige scope
 * en — voor gebruik binnen loops — in de omliggende scopes. `{.}` geeft de scope
 * zelf terug (voor string-array-loops zoals `behandelingen_overzicht`).
 */
export function dottedTagParser(tag: string): {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  get: (scope: any, context?: any) => any
} {
  const naam = tag.trim()
  if (naam === '.') return { get: (scope) => scope }
  const path = naam.split('.')
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(scope: any, context?: any) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: any[] = (context && context.scopeList) || [scope]
      // Innermost scope eerst, dan naar buiten (voor tags binnen loops).
      for (let i = list.length - 1; i >= 0; i--) {
        let cur = list[i]
        let ok = true
        for (const key of path) {
          if (cur != null && typeof cur === 'object' && cur[key] !== undefined) cur = cur[key]
          else { ok = false; break }
        }
        if (ok) return cur
      }
      return undefined
    },
  }
}

/**
 * Schaalt (w×h) proportioneel zodat het binnen `max` past. Er wordt nooit
 * vergroot (ratio ≤ 1), nooit bijgesneden en de verhouding wordt nooit gewijzigd:
 * dezelfde schaalfactor gaat op breedte én hoogte. Bij ongeldige invoer een
 * vierkant binnen de max i.p.v. het volledige (mogelijk vervormende) kader.
 */
export function fitSize(w: number, h: number, max: { w: number; h: number }): [number, number] {
  if (w <= 0 || h <= 0) {
    const veilig = Math.min(max.w, max.h)
    return [veilig, veilig]
  }
  const ratio = Math.min(max.w / w, max.h / h, 1)
  return [Math.round(w * ratio), Math.round(h * ratio)]
}

/** Haalt een afbeelding op als Buffer; faalt stil (null) zodat een kapotte URL niets sloopt. */
export async function fetchImage(url?: string | null): Promise<Buffer | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** Nederlandse labels per docxtemplater-fout-id. */
const DOCX_FOUT_LABELS: Record<string, string> = {
  unclosed_tag: 'Tag niet afgesloten (ontbrekende `}` of gesplitste tag)',
  unopened_tag: 'Sluit-teken zonder open-tag (losse `}` of gesplitste tag)',
  unclosed_loop: 'Loop niet afgesloten',
  unopened_loop: 'Loop-sluit zonder loop-start',
  closing_tag_does_not_match_opening_tag: 'Loop verkeerd genest / verkeerde sluit-tag',
  duplicate_open_tag: 'Dubbele `{` — Word heeft de tag opgeknipt',
  duplicate_close_tag: 'Dubbele `}` — Word heeft de tag opgeknipt',
  raw_tag_outer_invalid: 'Afbeeldings-/raw-tag op een ongeldige plek',
  raw_xml_tag_should_be_only_text_in_paragraph: 'Afbeeldings-tag ({%…}) moet alleen in een eigen alinea staan',
  scopeparser_execution_failed: 'Fout bij het verwerken van de variabele',
}

/** Kort de omringende template-tekst in tot een leesbaar venster rond de fout-tag. */
function docxContextSnippet(context: string, xtag: string): string {
  if (!context) return ''
  const clean = context.replace(/\s+/g, ' ').trim()
  const W = 48
  const zoek = xtag ? clean.indexOf(xtag) : -1
  let start = 0
  let end = Math.min(clean.length, 2 * W)
  if (zoek >= 0) {
    start = Math.max(0, zoek - W)
    end = Math.min(clean.length, zoek + xtag.length + W)
  }
  return (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '')
}

/**
 * Zet een docxtemplater-renderfout om in een leesbare, LOKALISEERBARE melding:
 * per fout het fouttype, de betreffende tag en een stukje omringende tekst
 * (uit `properties.context`) zodat de gebruiker het in Word kan terugzoeken.
 */
export function formatDocxError(renderErr: unknown): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = renderErr as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const subs: any[] = e?.properties?.errors?.length
    ? e.properties.errors
    : (e?.properties ? [e] : [])

  const blokken: string[] = []
  for (const sub of subs) {
    const p = sub?.properties ?? {}
    const label = DOCX_FOUT_LABELS[p.id as string] ?? (p.explanation ?? sub?.message ?? 'Onbekende fout')
    const xtag: string = p.xtag ?? ''
    const snippet = docxContextSnippet(p.context ?? '', xtag)
    let blok = `• ${label}`
    if (xtag) blok += `  —  tag {${xtag}}`
    if (snippet) blok += `\n   zoek in Word naar: "${snippet}"`
    blokken.push(blok)
  }
  return blokken.length ? blokken.join('\n\n') : String(renderErr)
}
