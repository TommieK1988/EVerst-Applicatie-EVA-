import 'server-only'
import type { PDFDocument, PDFImage, PDFPage, RGB } from 'pdf-lib'
import { veilig, wikkel, type PdfFont as Font } from '@/lib/pdf/tekst'
import { haalAfbeelding } from '@/lib/pdf/afbeelding'
import { splitsFotos, bewijsOntbreekt } from './oplever-fotos'
import type { OpleverPuntView } from './oplevering'

/**
 * Teken-bouwstenen voor het opleverrapport (pdf-lib): het "canvas" met paginabeheer en de kaart
 * van één punt.
 *
 * Bladspiegel: altijd binnen de veilige zone van het briefpapier (42 mm boven, 26 mm onder; zelfde
 * als het meerwerkoverzicht), ook als er geen briefpapier is — dan ziet elk rapport er hetzelfde uit.
 *
 * Kaart: vaste hoogte, precies drie per pagina. Bovenin de kopbalk, daaronder foto vooraf en foto
 * na herstel naast elkaar (elk een even groot vak van een halve breedte), en daaronder over de volle
 * breedte de omschrijving, de details en de laatste reactie. Foto's worden bewust níét bijgesneden (er kan precies in de rand zitten
 * waar het om gaat): ze passen in hun geheel in het vak, op een lichte achtergrond. Tekst die niet
 * past wordt afgekapt (het volledige punt staat in EVA).
 */

export const A4 = { breedte: 595.28, hoogte: 841.89 }
/** Smalle zijmarge: de foto's krijgen zo veel mogelijk ruimte. */
export const MARGE = 30
export const KOLOM = A4.breedte - MARGE * 2
/**
 * Vrije zone van het briefpapier: boven de groene balk (ca. 26 mm), onder de contactgegevens
 * (ca. 17 mm), elk met wat lucht. Er staat bewust geen eigen voettekst onder.
 */
export const BOVEN = (34 / 25.4) * 72
export const ONDER = (25 / 25.4) * 72
/** Bovenkant en onderkant van het beschrijfbare vlak. */
export const TOP_Y = A4.hoogte - BOVEN
const ONDERGRENS = ONDER

/** Aantal punten per pagina. */
export const PUNTEN_PER_PAGINA = 3
/** Hoogte van een sectiekop met uitlegregel (zie `Canvas.kop`). */
const SECTIEKOP_H = 40
const KAART_TUSSEN = 8
/** Vaste kaarthoogte: drie kaarten plus één sectiekop vullen precies het beschrijfbare vlak. */
const KAART_H = Math.floor(
  (TOP_Y - ONDERGRENS - SECTIEKOP_H - (PUNTEN_PER_PAGINA - 1) * KAART_TUSSEN) / PUNTEN_PER_PAGINA,
)

const PAD = 6
const TUSSEN = 10
const KOP_H = 16
/** Tekst onder de foto's: omschrijving, details en laatste reactie. */
const TEKST_H = 44
/** Twee fotovakken naast elkaar, elk een halve kaartbreedte; de hoogte is wat overblijft. */
const VAK_B = (KOLOM - 2 * PAD - TUSSEN) / 2
const VAK_H = KAART_H - KOP_H - PAD - 5 - TEKST_H - PAD
const TEKST_B = KOLOM - 2 * PAD

export type Kleuren = { groen: RGB; grijs: RGB; lichtgrijs: RGB; zwart: RGB; rood: RGB; vlak: RGB; wit: RGB }

/** Langste zijde van een foto in pixels. */
export type FotoMaat = { px: number }

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
    this.y = TOP_Y
  }

  nieuwePagina() {
    this.pagina = this.doc.addPage([A4.breedte, A4.hoogte])
    this.y = TOP_Y
  }

  /** Zorgt dat er nog `nodig` punten verticale ruimte is; zo niet: nieuwe pagina. */
  ruimte(nodig: number) {
    if (this.y - Math.min(nodig, TOP_Y - ONDERGRENS) < ONDERGRENS) this.nieuwePagina()
  }

  /** Ruimte tot de onderkant van het beschrijfbare vlak. */
  get rest() {
    return this.y - ONDERGRENS
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

  /** Haalt een foto op (verkleind, niet bijgesneden) en sluit hem in. Onbruikbaar → null. */
  async foto(url: string): Promise<PDFImage | null> {
    if (this.fotoCache.has(url)) return this.fotoCache.get(url) ?? null
    let img: PDFImage | null = null
    const bron = await haalAfbeelding(url, this.fotoMaat.px)
    if (bron) {
      try { img = await this.doc.embedJpg(bron.bytes) } catch { img = null }
    }
    this.fotoCache.set(url, img)
    return img
  }

  /** Foto in zijn geheel, gecentreerd in een vak van vaste maat op een lichte achtergrond. */
  fotoInVak(img: PDFImage, x: number, topY: number, b: number, h: number, achtergrond = true) {
    if (achtergrond) this.pagina.drawRectangle({ x, y: topY - h, width: b, height: h, color: this.kleur.vlak })
    const s = Math.min(b / img.width, h / img.height)
    const fb = img.width * s
    const fh = img.height * s
    this.pagina.drawImage(img, { x: x + (b - fb) / 2, y: topY - h + (h - fh) / 2, width: fb, height: fh })
  }

  /**
   * Sectiekop met lijn eronder. Met uitlegregel altijd precies `SECTIEKOP_H` hoog, zodat de kaarten
   * eronder vast staan; zonder uitleg (tekstpagina) compacter.
   */
  kop(titel: string, uitleg?: string) {
    const start = this.y
    this.y -= 12
    this.tekst(titel, { grootte: 12, font: this.vet })
    this.y -= 6
    this.lijn(0.8)
    this.y -= 12
    if (uitleg) this.tekst(uitleg, { grootte: 8.5, kleur: this.kleur.grijs })
    this.y = start - (uitleg ? SECTIEKOP_H : SECTIEKOP_H - 14)
  }

  /** Vrije tekst met behoud van regeleinden (veilig() zou ze anders wegpoetsen). */
  alinea(tekst: string, grootte = 10, breedte = KOLOM) {
    for (const regel of wikkelAlineas(tekst, this.normaal, grootte, breedte)) {
      this.ruimte(grootte + 4)
      this.tekst(regel, { grootte })
      this.y -= grootte + 4
    }
  }
}

export function wikkelAlineas(tekst: string, font: Font, grootte: number, breedte: number): string[] {
  return tekst.split(/\r?\n/).flatMap(a => (a.trim() ? wikkel(a, font, grootte, breedte) : ['']))
}

export type PuntWeergave = {
  nummer: string
  statusLabel: string
  statusKleur: RGB
  /** Regels in de detailkolom (deadline, extra werk, …), al samengesteld. */
  meta: string[]
}

/**
 * Tekent een reeks punten als kaarten, precies drie per pagina, onder een sectiekop die op elke
 * nieuwe pagina terugkomt (met "vervolg"). De sectie begint altijd op een nieuwe pagina.
 */
export async function tekenSectie(
  c: Canvas,
  titel: string,
  uitleg: string,
  punten: OpleverPuntView[],
  weergave: (p: OpleverPuntView, i: number) => PuntWeergave,
  leeg?: string,
) {
  c.nieuwePagina()
  c.kop(titel, uitleg)
  if (punten.length === 0 && leeg) {
    c.tekst(leeg, { grootte: 10, kleur: c.kleur.grijs })
    c.y -= 16
    return
  }
  for (const [i, p] of punten.entries()) {
    if (i > 0 && i % PUNTEN_PER_PAGINA === 0) {
      c.nieuwePagina()
      c.kop(`${titel} (vervolg)`, uitleg)
    }
    await tekenPunt(c, p, weergave(p, i))
  }
}

type Regel = { tekst: string; font: Font; grootte: number; kleur: RGB }

/**
 *   ┌ OP03  Ruimte ──────────────────────────────────────── Status ┐
 *   │ [foto vooraf, halve breedte]   [foto na herstel, halve breedte] │
 *   │ Omschrijving                                                  │
 *   │ Deadline · extra werk · …   /   laatste reactie               │
 *   └──────────────────────────────────────────────────────────────┘
 *
 * Een goed uitgevoerd punt kent geen voor/na: zijn eerste twee foto's staan in de twee fotovakken.
 */
async function tekenPunt(c: Canvas, p: OpleverPuntView, w: PuntWeergave) {
  const { kleur, normaal, vet } = c
  const { voor, na } = splitsFotos(p.fotos)
  const mist = bewijsOntbreekt(p.status, p.fotos, p.is_goed)

  const vakUrls = p.is_goed ? [voor[0]?.url, voor[1]?.url] : [voor[0]?.url, na[0]?.url]
  const vakken = await Promise.all(vakUrls.map(u => (u ? c.foto(u) : Promise.resolve(null))))
  const nietGetoond = p.fotos.length - vakUrls.filter(Boolean).length

  const top = c.y
  const x0 = MARGE

  // ── Kaart: kopbalk + rand ──
  c.pagina.drawRectangle({ x: x0, y: top - KOP_H, width: KOLOM, height: KOP_H, color: kleur.vlak })
  c.pagina.drawRectangle({
    x: x0, y: top - KAART_H, width: KOLOM, height: KAART_H, borderColor: kleur.lichtgrijs, borderWidth: 0.8,
  })
  const kopY = top - 11.5
  c.tekst(w.nummer, { x: x0 + PAD, y: kopY, grootte: 8.5, font: vet, kleur: kleur.grijs })
  const ruimteX = x0 + PAD + vet.widthOfTextAtSize(w.nummer, 8.5) + 8
  const sw = vet.widthOfTextAtSize(veilig(w.statusLabel), 8.5)
  if (p.ruimte) {
    c.tekst(pasIn(p.ruimte, vet, 9.5, KOLOM - (ruimteX - x0) - sw - 2 * PAD - 12),
      { x: ruimteX, y: kopY, grootte: 9.5, font: vet })
  }
  c.tekst(w.statusLabel, { x: x0 + KOLOM - PAD - sw, y: kopY, grootte: 8.5, font: vet, kleur: w.statusKleur })

  // ── Fotovakken ──
  const vakTop = top - KOP_H - PAD
  for (const [i, img] of vakken.entries()) {
    const x = x0 + PAD + i * (VAK_B + TUSSEN)
    if (img) {
      c.fotoInVak(img, x, vakTop, VAK_B, VAK_H)
      if (!p.is_goed) label(c, x, vakTop, i === 0 ? 'VOOR' : 'NA HERSTEL')
    } else if (!p.is_goed || i === 0) {
      // Bij een goed punt blijft het tweede vak gewoon leeg; bij een opleverpunt is een leeg vak
      // informatie (nog geen bewijs) en moet het opvallen.
      const t = i === 0 ? 'geen foto' : mist ? 'geen foto na herstel' : 'nog geen foto na herstel'
      leegVak(c, x, vakTop, t, i === 1 && mist)
    }
  }

  // ── Tekst onder de foto's: omschrijving, dan details, dan de laatste reactie ──
  const tekstTop = vakTop - VAK_H - 5
  const regels: Regel[] = wikkelAlineas(p.omschrijving, vet, 9.5, TEKST_B)
    .map(r => ({ tekst: r, font: vet, grootte: 9.5, kleur: kleur.zwart }))
  const meta = [...w.meta]
  if (nietGetoond > 0) meta.push(`+${nietGetoond} foto${nietGetoond > 1 ? "'s" : ''} in EVA`)
  const rood = meta.some(m => m.startsWith('Afgewezen'))
  if (meta.length) {
    for (const r of wikkel(meta.join('  -  '), normaal, 8, TEKST_B)) {
      regels.push({ tekst: r, font: normaal, grootte: 8, kleur: rood ? kleur.rood : kleur.grijs })
    }
  }
  // Alleen de laatste reactie: dat is de stand van zaken (afmelding, akkoord).
  const laatste = p.reacties[p.reacties.length - 1]
  if (laatste) {
    const wie = laatste.auteur_naam ?? (laatste.auteur_type === 'onderaannemer' ? 'Onderaannemer' : 'Everts')
    for (const r of wikkel(`${wie}: ${laatste.opmerking ?? '-'}`, normaal, 8, TEKST_B)) {
      regels.push({ tekst: r, font: normaal, grootte: 8, kleur: kleur.grijs })
    }
  }
  tekenRegels(c, regels, x0 + PAD, tekstTop - 8, tekstTop - TEKST_H, TEKST_B)

  c.y = top - KAART_H - KAART_TUSSEN
}

/** Tekent regels tot `bodem`; de laatste regel die nog past krijgt "..." als er meer was. */
function tekenRegels(c: Canvas, regels: Regel[], x: number, startY: number, bodem: number, breedte: number) {
  const posities: number[] = []
  let y = startY
  for (const r of regels) {
    if (y < bodem + 2) break
    posities.push(y)
    y -= r.grootte + 2.5
  }
  posities.forEach((py, i) => {
    const r = regels[i]
    const afgekapt = i === posities.length - 1 && posities.length < regels.length
    const t = afgekapt ? pasIn(`${r.tekst}...`, r.font, r.grootte, breedte, true) : r.tekst
    c.tekst(t, { x, y: py, grootte: r.grootte, font: r.font, kleur: r.kleur })
  })
}

/** Kort een tekst in tot hij in `breedte` past; met `puntjes` blijft "..." aan het eind staan. */
function pasIn(tekst: string, font: Font, grootte: number, breedte: number, puntjes = false): string {
  const t = veilig(tekst)
  if (font.widthOfTextAtSize(t, grootte) <= breedte) return t
  let kern = puntjes ? t.replace(/\.\.\.$/, '') : t
  while (kern.length > 1 && font.widthOfTextAtSize(`${kern}...`, grootte) > breedte) kern = kern.slice(0, -1)
  return `${kern.trimEnd()}...`
}

/** Klein label linksboven op een foto, wit op een halfdoorzichtig donker vlak. */
function label(c: Canvas, x: number, topY: number, t: string) {
  const b = c.vet.widthOfTextAtSize(t, 6.5) + 8
  c.pagina.drawRectangle({ x, y: topY - 12, width: b, height: 12, color: c.kleur.zwart, opacity: 0.65 })
  c.tekst(t, { x: x + 4, y: topY - 8.8, grootte: 6.5, font: c.vet, kleur: c.kleur.wit })
}

/** Gestippeld vak: ontbrekend bewijs moet opvallen, niet stilletjes wegvallen. */
function leegVak(c: Canvas, x: number, topY: number, t: string, nadruk: boolean) {
  c.pagina.drawRectangle({
    x, y: topY - VAK_H, width: VAK_B, height: VAK_H,
    borderColor: nadruk ? c.kleur.rood : c.kleur.lichtgrijs, borderWidth: 0.8, borderDashArray: [3, 3],
  })
  c.tekst(t, {
    x: x + (VAK_B - c.normaal.widthOfTextAtSize(t, 8)) / 2, y: topY - VAK_H / 2 - 3,
    grootte: 8, kleur: nadruk ? c.kleur.rood : c.kleur.grijs,
  })
}
