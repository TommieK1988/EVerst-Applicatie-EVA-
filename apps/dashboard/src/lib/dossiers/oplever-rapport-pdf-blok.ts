import 'server-only'
import type { PDFDocument, PDFImage, PDFPage, RGB } from 'pdf-lib'
import { veilig, wikkel, type PdfFont as Font } from '@/lib/pdf/tekst'
import { haalAfbeelding } from '@/lib/pdf/afbeelding'
import { splitsFotos, bewijsOntbreekt } from './oplever-fotos'
import type { OpleverPuntView } from './oplevering'

/**
 * Teken-bouwstenen voor het opleverrapport (pdf-lib): het "canvas" met paginabeheer en het blok
 * van één punt, in drie kolommen: foto vooraf, foto na herstel, omschrijving.
 */

export const A4 = { breedte: 595.28, hoogte: 841.89 }
export const MARGE = 48
export const KOLOM = A4.breedte - MARGE * 2
/** Onderkant van het beschrijfbare vlak: daaronder staat de voettekst. */
const ONDERGRENS = MARGE + 28

const TUSSEN = 14
/** Drie kolommen: voor-foto | na-foto | omschrijving. Elk ca. 5,5 cm breed. */
const KOL = (KOLOM - 2 * TUSSEN) / 3
/** Maximale fotohoogte in een kolom; staande foto's worden hierdoor smaller, niet langer. */
const FOTO_H = KOL * 1.25
/** Goed punt zonder na-foto: één foto mag over de eerste twee kolommen (zoals het Word-voorbeeld). */
const BREED = KOL * 2 + TUSSEN
const BREED_H = BREED * 0.75
const DUIM = 60
const MAX_DUIMEN = 7

export type Kleuren = { groen: RGB; grijs: RGB; lichtgrijs: RGB; zwart: RGB; rood: RGB }

export type FotoMaat = { hoofdPx: number; duimPx: number }

export class Canvas {
  pagina: PDFPage
  y: number
  private fotoCache = new Map<string, PDFImage | null>()

  constructor(
    readonly doc: PDFDocument,
    readonly normaal: Font,
    readonly vet: Font,
    readonly kleur: Kleuren,
    readonly fotoMaat: FotoMaat,
  ) {
    this.pagina = doc.addPage([A4.breedte, A4.hoogte])
    this.y = A4.hoogte - MARGE
  }

  nieuwePagina() {
    this.pagina = this.doc.addPage([A4.breedte, A4.hoogte])
    this.y = A4.hoogte - MARGE
  }

  /** Zorgt dat er nog `nodig` punten verticale ruimte is; zo niet: nieuwe pagina. */
  ruimte(nodig: number) {
    const max = A4.hoogte - MARGE - ONDERGRENS
    if (this.y - Math.min(nodig, max) < ONDERGRENS) this.nieuwePagina()
  }

  tekst(s: string, o: { x?: number; y?: number; grootte?: number; font?: Font; kleur?: RGB } = {}) {
    this.pagina.drawText(veilig(s), {
      x: o.x ?? MARGE, y: o.y ?? this.y, size: o.grootte ?? 10,
      font: o.font ?? this.normaal, color: o.kleur ?? this.kleur.zwart,
    })
  }

  lijn(dikte = 0.5, kleur = this.kleur.lichtgrijs) {
    this.pagina.drawRectangle({ x: MARGE, y: this.y, width: KOLOM, height: dikte, color: kleur })
  }

  /** Haalt, verkleint en sluit een foto in. Eén keer per url+maat; onbruikbaar → null. */
  async foto(url: string, px: number): Promise<PDFImage | null> {
    const sleutel = `${px}|${url}`
    if (this.fotoCache.has(sleutel)) return this.fotoCache.get(sleutel) ?? null
    let img: PDFImage | null = null
    const bron = await haalAfbeelding(url, px)
    if (bron) {
      try { img = await this.doc.embedJpg(bron.bytes) } catch { img = null }
    }
    this.fotoCache.set(sleutel, img)
    return img
  }

  /** Sectiekop met lijn eronder. */
  kop(titel: string, uitleg?: string) {
    this.y -= 12
    this.ruimte(uitleg ? 60 : 44)
    this.tekst(titel, { grootte: 11, font: this.vet })
    this.y -= 6
    this.lijn(0.8)
    this.y -= 14
    if (uitleg) {
      this.tekst(uitleg, { grootte: 8.5, kleur: this.kleur.grijs })
      this.y -= 16
    }
  }

  /** Vrije tekst met behoud van regeleinden (veilig() zou ze anders wegpoetsen). */
  alinea(tekst: string, grootte = 10, breedte = KOLOM) {
    for (const regel of wikkelAlineas(tekst, this.normaal, grootte, breedte)) {
      this.ruimte(grootte + 4)
      this.tekst(regel, { grootte })
      this.y -= grootte + 3
    }
  }
}

export function wikkelAlineas(tekst: string, font: Font, grootte: number, breedte: number): string[] {
  return tekst.split(/\r?\n/).flatMap(a => (a.trim() ? wikkel(a, font, grootte, breedte) : ['']))
}

/** Schaalt binnen een vak zonder te vervormen. */
function pas(img: PDFImage, maxB: number, maxH: number) {
  const s = Math.min(maxB / img.width, maxH / img.height)
  return { b: img.width * s, h: img.height * s }
}

export type PuntWeergave = {
  nummer: string
  statusLabel: string
  statusKleur: RGB
  /** Regels onder de omschrijving (deadline, extra werk, …), al samengesteld. */
  meta: string[]
}

/**
 * Tekent één punt als blok dat nooit over een paginagrens breekt:
 *
 *   OP03  Ruimte                                          Status
 *   [voor-foto]        [na-foto]          omschrijving / meta / reacties
 *   [overige foto's als duimnagels]
 *
 * Een goed uitgevoerd punt kent geen voor/na: één foto beslaat dan de eerste twee kolommen, twee
 * foto's staan naast elkaar. Zonder foto's loopt de tekst over de volle breedte.
 */
export async function tekenPunt(c: Canvas, p: OpleverPuntView, w: PuntWeergave) {
  const { kleur, normaal, vet } = c
  const { voor, na } = splitsFotos(p.fotos)
  const mist = bewijsOntbreekt(p.status, p.fotos, p.is_goed)
  const px = c.fotoMaat.hoofdPx

  // Welke foto's in de twee fotokolommen komen, en welke als duimnagel eronder.
  let kolomFotos: (PDFImage | null)[] = []
  let gebruikt: string[] = []
  let breed = false
  if (p.is_goed) {
    gebruikt = voor.slice(0, 2).map(f => f.url)
    kolomFotos = await Promise.all(gebruikt.map(u => c.foto(u, px)))
    breed = kolomFotos.length === 1
  } else if (voor[0] || na[0] || mist) {
    const v = voor[0] ? await c.foto(voor[0].url, px) : null
    const n = na[0] ? await c.foto(na[0].url, px) : null
    kolomFotos = [v, n]
    gebruikt = [voor[0]?.url, na[0]?.url].filter((u): u is string => Boolean(u))
  }
  const overigeUrls = p.fotos.map(f => f.url).filter(u => !gebruikt.includes(u)).slice(0, MAX_DUIMEN)
  const duimen = (await Promise.all(overigeUrls.map(u => c.foto(u, c.fotoMaat.duimPx)))).filter(
    (d): d is PDFImage => d !== null,
  )

  const metFotos = kolomFotos.length > 0
  const tekstX = metFotos ? MARGE + 2 * (KOL + TUSSEN) : MARGE
  const tekstB = metFotos ? KOL : KOLOM
  const labels = metFotos && !p.is_goed

  // ── Alles eerst opmeten, dan één keer ruimte reserveren ──
  const omschrijving = wikkelAlineas(p.omschrijving, vet, 10, tekstB)
  const meta = w.meta.flatMap(m => wikkel(m, normaal, 8.5, tekstB))
  const reacties = p.reacties.flatMap(r => {
    const wie = r.auteur_naam ?? (r.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Everts')
    return wikkel(`${wie}: ${r.opmerking ?? '-'}`, normaal, 8.5, tekstB - 6)
  })
  const tekstH = omschrijving.length * 13 + meta.length * 11 + (reacties.length ? 4 + reacties.length * 11 : 0)

  const maten = kolomFotos.map(img => (img ? (breed ? pas(img, BREED, BREED_H) : pas(img, KOL, FOTO_H)) : null))
  const fotoH = metFotos ? (labels ? 11 : 0) + Math.max(50, ...maten.map(m => m?.h ?? 0)) : 0
  const duimH = duimen.length ? DUIM + 8 : 0
  const totaal = 16 + Math.max(fotoH, tekstH) + duimH + 14

  c.ruimte(totaal)

  // ── Kopregel ──
  c.tekst(w.nummer, { grootte: 8.5, font: vet, kleur: kleur.grijs })
  if (p.ruimte) c.tekst(p.ruimte, { x: MARGE + vet.widthOfTextAtSize(w.nummer, 8.5) + 8, grootte: 9.5, font: vet })
  const sw = vet.widthOfTextAtSize(veilig(w.statusLabel), 8.5)
  c.tekst(w.statusLabel, { x: A4.breedte - MARGE - sw, grootte: 8.5, font: vet, kleur: w.statusKleur })
  c.y -= 16
  const top = c.y

  // ── Fotokolommen ──
  for (const [i, img] of kolomFotos.entries()) {
    const x = MARGE + i * (KOL + TUSSEN)
    let fy = top
    if (labels) {
      const isNa = i === 1
      c.tekst(isNa ? 'NA HERSTEL' : 'VOOR', {
        x, y: fy - 7, grootte: 7, font: vet, kleur: isNa && mist ? kleur.rood : kleur.grijs,
      })
      fy -= 11
    }
    const m = maten[i]
    if (img && m) {
      c.pagina.drawImage(img, { x, y: fy - m.h, width: m.b, height: m.h })
    } else if (labels) {
      // Ontbrekend bewijs moet opvallen; een punt zonder voor-foto krijgt een rustig leeg vak.
      leegVak(c, x, fy, 50, i === 0 ? 'geen foto' : mist ? 'geen foto na herstel' : 'nog geen foto')
    }
  }

  // ── Omschrijving (derde kolom, of volle breedte zonder foto's) ──
  let ry = top - 9
  for (const r of omschrijving) { c.tekst(r, { x: tekstX, y: ry, grootte: 10, font: vet }); ry -= 13 }
  for (const r of meta) {
    const rood = r.startsWith('Afgewezen')
    c.tekst(r, { x: tekstX, y: ry, grootte: 8.5, kleur: rood ? kleur.rood : kleur.grijs }); ry -= 11
  }
  if (reacties.length) {
    ry -= 4
    for (const r of reacties) { c.tekst(r, { x: tekstX + 6, y: ry, grootte: 8.5, kleur: kleur.grijs }); ry -= 11 }
  }

  c.y = top - Math.max(fotoH, tekstH)

  // ── Overige foto's ──
  if (duimen.length) {
    c.y -= 8
    let x = MARGE
    for (const d of duimen) {
      const m = pas(d, DUIM, DUIM)
      c.pagina.drawImage(d, { x: x + (DUIM - m.b) / 2, y: c.y - DUIM + (DUIM - m.h) / 2, width: m.b, height: m.h })
      c.pagina.drawRectangle({ x, y: c.y - DUIM, width: DUIM, height: DUIM, borderColor: kleur.lichtgrijs, borderWidth: 0.6 })
      x += DUIM + 6
    }
    c.y -= DUIM
  }

  c.y -= 8
  c.lijn()
  c.y -= 14
}

/** Gestippeld vak: ontbrekend bewijs moet opvallen, niet stilletjes wegvallen. */
function leegVak(c: Canvas, x: number, topY: number, h: number, t: string) {
  c.pagina.drawRectangle({
    x, y: topY - h, width: KOL, height: h,
    borderColor: c.kleur.lichtgrijs, borderWidth: 0.8, borderDashArray: [3, 3],
  })
  c.tekst(t, {
    x: x + (KOL - c.normaal.widthOfTextAtSize(t, 8)) / 2, y: topY - h / 2 - 3,
    grootte: 8, kleur: c.kleur.grijs,
  })
}
