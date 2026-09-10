/**
 * De detailplanning van één dossier tekenen op liggende A3.
 *
 * Los van de route en los van de database, zodat de opmaak zonder inlogsessie
 * te bekijken is — een gantt met balken op de verkeerde dag valt in geen enkele
 * type-check op, alleen op papier. Zelfde afspraak als `wagenpark/werktijden-pdf.ts`.
 *
 * De tijdas komt uit `components/planning/layout/tijdas`: dezelfde functies die
 * het scherm zijn maandgrenzen, weeknummers en dagbreedtes geven. Die laag rekent
 * in "eenheden per dag" zonder te weten welke eenheid dat is; het scherm geeft
 * pixels mee, wij millimeters. Zo kunnen papier en beeldscherm niet uiteenlopen.
 *
 * HUISSTIJL (huisstijlgids 2024): alle tekst in Montserrat, de drie groenen uit
 * de gids, en het logo ruim boven de ondergrens van 25 mm breed.
 *
 * WAT ER NIET OP KOMT: medewerkers, onderaannemers en leveranciers. De uitdraai
 * toont het werk en wanneer het staat, niet wie het doet of bij wie het is
 * ingekocht. `detailplanning-gegevens.ts` haalt die gegevens daarom niet eens op.
 */
import jsPDF from 'jspdf'
import {
  addDays, differenceInCalendarDays, endOfISOWeek, format,
  isWeekend, startOfDay, startOfISOWeek, startOfMonth,
} from 'date-fns'
import { nl } from 'date-fns/locale'
import type { PlanningActiviteit, PlanningFase, PlanningUursoort } from '@everts/database/platform-types'
import { buildGridUnits, buildHeader, dagOffset, type View } from '@/components/planning/layout/tijdas'
import { veilig } from '@/lib/pdf/tekst'
import type { PdfLogo } from '@/lib/pdf/logo'
import { registreerMontserrat } from '@/lib/pdf/montserrat'
import type { DetailplanningBedrijf, DetailplanningKop } from './detailplanning-gegevens'

// ─── Maatvoering (mm, liggende A3) ────────────────────────────────────────────

const PAGINA = { breedte: 420, hoogte: 297 }
const MARGE = 12
/** Kopzone: titelblok links, veldjes eronder, logo rechts. */
const KOP_H = 30
/** Tijdas-header: spanrij (maanden/jaren) boven de kolomrij (dagen/weken/maanden). */
const TIJDAS_H = 12
const SPAN_H = 5.5
/** Voetzone: legenda links, bladnummering rechts. */
const VOET_H = 9
/** Linkerkolom: nr, activiteit, start, eind, dagen. */
const LABEL_W = 104

/**
 * Kolomindeling binnen de labelkolom, als offset vanaf de linkermarge. De
 * dagen-kolom eindigt op 100 en niet op 104: op de 104 staat de scheidingslijn
 * met de tijdas, en een rechts uitgelijnd getal loopt daar anders dwars doorheen.
 */
const KOL = {
  nr:    { x: 2,    w: 6  },
  titel: { x: 9.5,  w: 58 },
  start: { x: 69,   w: 12 },
  eind:  { x: 82,   w: 12 },
  dagen: { x: 94,   w: 6  },
}

const TIJDAS_W = PAGINA.breedte - MARGE * 2 - LABEL_W
const RIJZONE_Y = MARGE + KOP_H + TIJDAS_H
const RIJZONE_H = PAGINA.hoogte - RIJZONE_Y - VOET_H - MARGE

/**
 * Rijhoogtes waaruit gekozen wordt, van comfortabel naar de ondergrens. Onder de
 * 5 mm is een regel op een meter afstand niet meer te lezen, en dat is precies
 * waar zo'n vel voor hangt.
 */
const RIJHOOGTES = [7.5, 7.0, 6.5, 6.0, 5.5, 5.0]
/** Een fase-rij is iets lager dan een activiteitrij, maar moet wel opvallen. */
const FASE_FACTOR = 0.85
/** Balken smaller dan dit verdwijnen van het vel; bij maandkorrel is één dag 0,33 mm. */
const MIN_BALK_W = 1.2

/**
 * Korrels van de tijdas, van fijn naar grof, met de dagbreedte waaronder de
 * kolomkoppen niet meer leesbaar zijn. De view-namen zijn die van het scherm:
 * 'maand' geeft kolommen per dag, 'kwartaal' per week, 'jaar' per maand.
 */
const KORRELS: { view: View; minMmPerDag: number }[] = [
  { view: 'maand',    minMmPerDag: 3.5  },
  { view: 'kwartaal', minMmPerDag: 1.25 },
  { view: 'jaar',     minMmPerDag: 0.33 },
]

const GROFSTE = KORRELS[KORRELS.length - 1]

// ─── Huisstijl ────────────────────────────────────────────────────────────────

/** De drie groenen uit de huisstijlgids 2024 (p. 6). */
const GROEN_DONKER = '#154e2f'
const GROEN = '#0a7a35'

const FG = '#161b20'
const FG_SOFT = '#49535b'
const FG_MUTED = '#7a848c'
const BORDER = '#d9dfe3'
const BORDER_ZACHT = '#eceff1'
const ZEBRA = '#f7f9fa'
const WEEKEND = '#eef1f3'
const FASE_BALK = '#e6ebee'
const BALK_FALLBACK = '#4a7c9e'

/**
 * Kleuren voor de balken wanneer een dossier geen uursoorten gebruikt — dan
 * kleuren we per fase. Zonder dat is het hele vel één kleur, en dat leest op een
 * A3 als een blok in plaats van als een planning. De meeste dossiers hebben
 * namelijk geen uursoort op hun activiteiten staan.
 */
const FASE_PALET = [
  '#1f7a8c', '#c46a1f', '#5c7a3f', '#8650c4',
  '#b03a48', '#2b6cb0', '#7a6a1f', '#3f7d6a',
]

type Rgb = [number, number, number]

/** '#0a7a35' → [10, 122, 53]. Korte vorm (#abc) wordt ook geaccepteerd. */
function rgb(hex: string): Rgb {
  const h = (hex || '').replace('#', '').trim()
  const vol = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(vol.slice(0, 6), 16)
  if (!Number.isFinite(n)) return [0, 0, 0]
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Zwarte of witte tekst, afhankelijk van hoe donker de balk is. */
function leesbaarOp(hex: string): Rgb {
  const [r, g, b] = rgb(hex)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? rgb(FG) : [255, 255, 255]
}

// ─── Rijen ────────────────────────────────────────────────────────────────────

export type Rij =
  | { soort: 'fase'; naam: string; start: string | null; eind: string | null }
  | { soort: 'activiteit'; nr: number; titel: string; start: string | null; eind: string | null; kleur: string }

export type Legenda = { label: string; kleur: string }[]

/**
 * Activiteitbalk: `gewenste_start` en `deadline` van de activiteit zelf — niet de
 * planitems eronder. Zo tekent het scherm hem ook (ActiviteitGantt, `ActiviteitBalk`),
 * en het vel hoort te tonen wat de werkvoorbereider heeft ingetekend.
 *
 * Let op: het klantportaal rekent hier bewust ánders (daar zijn de planitems
 * leidend). Die twee horen niet naar elkaar toe te groeien.
 */
function activiteitBereik(a: PlanningActiviteit): { start: string | null; eind: string | null } {
  const s = a.gewenste_start ?? a.deadline
  const e = a.deadline ?? a.gewenste_start
  return { start: s ?? null, eind: e ?? null }
}

/**
 * De rijen in schermvolgorde: eerst de activiteiten zonder fase, daarna elke fase
 * met de activiteiten die eronder hangen. Het volgnummer loopt door over het geheel.
 *
 * Kleurbron: de uursoort als het dossier die gebruikt, anders de fase.
 */
export function bouwRijen(
  fasen: PlanningFase[],
  activiteiten: PlanningActiviteit[],
  uursoorten: Pick<PlanningUursoort, 'id' | 'naam' | 'kleur'>[],
): { rijen: Rij[]; legenda: Legenda } {
  const gesorteerd = [...activiteiten].sort((a, b) => a.volgorde - b.volgorde)
  const fSorted = [...fasen].sort((a, b) => a.volgorde - b.volgorde)

  const uursoortKleur: Record<string, string> = {}
  for (const u of uursoorten) if (u.kleur) uursoortKleur[u.id] = u.kleur

  // Kleuren op uursoort heeft alleen zin als die kleuren ook uit elkaar te houden
  // zijn. In de praktijk staan uursoorten geregeld allemaal op hetzelfde groen —
  // dan zegt de kleur niets en kleuren we liever per fase, want dat geeft het vel
  // wél structuur.
  const gebruikteKleuren = new Set(
    gesorteerd.map(a => (a.uursoort_id ? uursoortKleur[a.uursoort_id] : null)).filter(Boolean),
  )
  const opUursoort = gebruikteKleuren.size >= 2

  const faseKleur: Record<string, string> = {}
  fSorted.forEach((f, i) => { faseKleur[f.id] = FASE_PALET[i % FASE_PALET.length] })

  const kleurVan = (a: PlanningActiviteit): string => {
    if (opUursoort) return (a.uursoort_id && uursoortKleur[a.uursoort_id]) || BALK_FALLBACK
    return (a.fase_id && faseKleur[a.fase_id]) || BALK_FALLBACK
  }

  const rijen: Rij[] = []
  let nr = 0

  const voegToe = (a: PlanningActiviteit) => {
    const { start, eind } = activiteitBereik(a)
    rijen.push({ soort: 'activiteit', nr: ++nr, titel: a.titel ?? '', start, eind, kleur: kleurVan(a) })
  }

  for (const a of gesorteerd.filter(a => !a.fase_id)) voegToe(a)
  for (const f of fSorted) {
    // Fasebalk = vroegste start en laatste einde van haar activiteiten, exact zoals
    // `faseBereik` in ActiviteitGantt: de start kijkt alleen naar gewenste_start.
    let start: string | null = null
    let eind: string | null = null
    const eigen = gesorteerd.filter(a => a.fase_id === f.id)
    for (const a of eigen) {
      if (a.gewenste_start && (!start || a.gewenste_start < start)) start = a.gewenste_start
      const e = a.deadline ?? a.gewenste_start
      if (e && (!eind || e > eind)) eind = e
    }
    rijen.push({ soort: 'fase', naam: f.naam ?? '', start, eind })
    for (const a of eigen) voegToe(a)
  }

  const legenda: Legenda = opUursoort
    ? uursoorten.filter(u => u.kleur && gebruikteKleuren.has(u.kleur))
        .map(u => ({ label: u.naam ?? '', kleur: u.kleur }))
    : fSorted
        .filter(f => gesorteerd.some(a => a.fase_id === f.id))
        .map(f => ({ label: f.naam ?? '', kleur: faseKleur[f.id] }))

  // Activiteiten die buiten elke fase vallen krijgen de terugvalkleur. Die staat
  // dan wél op het vel, dus hoort hij ook in de legenda verklaard te worden.
  const heeftLosse = gesorteerd.some(a => !a.fase_id)
  if (heeftLosse && (!opUursoort || gesorteerd.some(a => !a.uursoort_id || !uursoortKleur[a.uursoort_id]))) {
    legenda.push({ label: 'Overig', kleur: BALK_FALLBACK })
  }

  return { rijen, legenda }
}

const rijHoogte = (r: Rij, h: number) => (r.soort === 'fase' ? h * FASE_FACTOR : h)

/**
 * Rijen over vellen verdelen bij een gegeven rijhoogte.
 *
 * Een fase-kop die als laatste regel op een vel belandt, schuift mee naar het
 * volgende: een kop zonder iets eronder zegt niets.
 */
function verdeelRijen(rijen: Rij[], h: number): Rij[][] {
  const blokken: Rij[][] = []
  let huidig: Rij[] = []
  let hoogte = 0
  for (const r of rijen) {
    const rh = rijHoogte(r, h)
    if (hoogte + rh > RIJZONE_H && huidig.length) {
      if (huidig[huidig.length - 1].soort === 'fase') {
        const kop = huidig.pop()!
        blokken.push(huidig)
        huidig = [kop]
        hoogte = rijHoogte(kop, h)
      } else {
        blokken.push(huidig)
        huidig = []
        hoogte = 0
      }
    }
    huidig.push(r)
    hoogte += rh
  }
  if (huidig.length) blokken.push(huidig)
  return blokken
}

/**
 * De grootste rijhoogte die het minimale aantal vellen oplevert.
 *
 * Verkleinen mag, maar alleen als het een vel scheelt. Anders zou een planning
 * die tóch al doorloopt naar een tweede blad ook nog eens in kleine letters staan.
 */
function kiesRijhoogte(rijen: Rij[]): { hoogte: number; blokken: Rij[][] } {
  let beste = RIJHOOGTES[0]
  let besteBlokken = verdeelRijen(rijen, beste)
  for (const h of RIJHOOGTES.slice(1)) {
    const blokken = verdeelRijen(rijen, h)
    if (blokken.length < besteBlokken.length) {
      beste = h
      besteBlokken = blokken
    }
  }
  return { hoogte: beste, blokken: besteBlokken }
}

// ─── Tijdas ───────────────────────────────────────────────────────────────────

/** Een yyyy-mm-dd uit de database als lokale datum, middags — nooit via toISOString. */
const alsDatum = (yyyymmdd: string) => new Date(`${yyyymmdd.slice(0, 10)}T12:00:00`)

/**
 * Het volledige bereik van de planning, uitgebreid naar hele ISO-weken zodat de
 * tijdas op een maandag begint. Zonder enige datum valt hij terug op de maand
 * waarin we nu zitten — dan staan er alleen rijen zonder balk, en dat is precies
 * wat het scherm ook laat zien.
 */
function bepaalBereik(rijen: Rij[]): { vs: Date; ve: Date } {
  let min: string | null = null
  let max: string | null = null
  for (const r of rijen) {
    if (r.start && (!min || r.start < min)) min = r.start
    if (r.eind && (!max || r.eind > max)) max = r.eind
  }
  if (!min || !max) {
    const nu = new Date()
    return { vs: startOfISOWeek(startOfMonth(nu)), ve: endOfISOWeek(addDays(startOfMonth(nu), 30)) }
  }
  return { vs: startOfISOWeek(alsDatum(min)), ve: endOfISOWeek(alsDatum(max)) }
}

const dagenIn = (vs: Date, ve: Date) => differenceInCalendarDays(startOfDay(ve), startOfDay(vs)) + 1

/**
 * Periodeblokken: normaal één, maar een planning die langer loopt dan de grofste
 * korrel aankan (± 2,5 jaar) wordt over meerdere vellen naast elkaar verdeeld.
 * De snede ligt op een maandgrens, zodat geen enkele maandkop halverwege breekt.
 */
function verdeelPeriode(vs: Date, ve: Date): { vs: Date; ve: Date }[] {
  const maxDagen = Math.floor(TIJDAS_W / GROFSTE.minMmPerDag)
  const totaal = dagenIn(vs, ve)
  if (totaal <= maxDagen) return [{ vs, ve }]

  const aantal = Math.ceil(totaal / maxDagen)
  const perBlok = Math.ceil(totaal / aantal)
  const blokken: { vs: Date; ve: Date }[] = []
  let start = vs
  while (start <= ve) {
    const ruw = addDays(start, perBlok - 1)
    // Naar de eerste van de volgende maand knippen; het blok eindigt de dag ervoor.
    const gesneden = ruw >= ve ? ve : addDays(startOfMonth(addDays(ruw, 1)), -1)
    const eind = gesneden < start ? start : gesneden
    blokken.push({ vs: start, ve: eind })
    start = addDays(eind, 1)
  }
  return blokken
}

/** Korrel + geometrie voor één periodeblok. */
function maakTijdas(vs: Date, ve: Date) {
  const dagen = dagenIn(vs, ve)
  const mmPerDag = TIJDAS_W / dagen
  const korrel = KORRELS.find(k => mmPerDag >= k.minMmPerDag) ?? GROFSTE
  // weekendFactor 1: de gantt op het scherm tekent weekenden even breed als werkdagen.
  const { spans, cols } = buildHeader(korrel.view, vs, ve, mmPerDag, 1)
  const gridUnits = buildGridUnits(korrel.view, vs, ve, mmPerDag, 1)
  return { vs, ve, dagen, mmPerDag, view: korrel.view, spans, cols, gridUnits }
}

type Tijdas = ReturnType<typeof maakTijdas>

// ─── Tekenen ──────────────────────────────────────────────────────────────────

export type DetailplanningPdfInvoer = {
  kop: DetailplanningKop
  bedrijf: DetailplanningBedrijf
  fasen: PlanningFase[]
  activiteiten: PlanningActiviteit[]
  uursoorten: Pick<PlanningUursoort, 'id' | 'naam' | 'kleur'>[]
  logo: PdfLogo | null
}

const datumLang = (d: Date) => format(d, 'd MMMM yyyy', { locale: nl })
const datumKort = (d: Date) => format(d, 'd MMM yyyy', { locale: nl })
const datumCel = (iso: string) => format(alsDatum(iso), 'd MMM', { locale: nl })

/** Doorlooptijd in hele weken, voor het kopveld. */
function doorlooptijd(vs: Date, ve: Date): string {
  const dagen = dagenIn(vs, ve)
  const weken = Math.round(dagen / 7)
  return weken >= 2 ? `${weken} weken` : `${dagen} dagen`
}

export function bouwDetailplanningPdf(invoer: DetailplanningPdfInvoer): ArrayBuffer {
  const { kop, bedrijf, fasen, activiteiten, uursoorten, logo } = invoer

  const accent = bedrijf.kleurPrimair || GROEN
  const { rijen, legenda } = bouwRijen(fasen, activiteiten, uursoorten)
  const { hoogte, blokken } = kiesRijhoogte(rijen)
  const bereik = bepaalBereik(rijen)
  const periodes = verdeelPeriode(bereik.vs, bereik.ve)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  registreerMontserrat(doc)

  const totaalBladen = periodes.length * blokken.length
  const uitgedraaid = datumLang(new Date())

  let blad = 0
  for (const periode of periodes) {
    const as = maakTijdas(periode.vs, periode.ve)
    for (const rijBlok of blokken) {
      if (blad > 0) doc.addPage()
      blad++
      // Het raster stopt onder de laatste regel. Bij een korte planning zou een
      // rijzone op volle hoogte een half vel lege weekendbanen opleveren.
      const inhoudH = Math.min(RIJZONE_H, rijBlok.reduce((s, r) => s + rijHoogte(r, hoogte), 0))
      tekenKop(doc, kop, bedrijf, bereik, logo, accent)
      tekenTijdas(doc, as, inhoudH, accent)
      tekenAchtergrond(doc, as, inhoudH)
      tekenRijen(doc, rijBlok, as, hoogte, inhoudH, accent)
      // Ná de rijen: de fase-balken zijn gevulde vlakken en zouden de vlag anders overtekenen.
      const toonVandaag = tekenVandaag(doc, as, inhoudH, accent)
      tekenVoet(doc, legenda, blad, totaalBladen, rijBlok, as, uitgedraaid, accent, toonVandaag)
    }
  }

  return doc.output('arraybuffer')
}

/** Label in kleine kapitalen met de waarde eronder — het kopveld-patroon. */
function veldje(doc: jsPDF, x: number, y: number, label: string, waarde: string, maxW: number) {
  doc.setFont('Montserrat', 'semibold')
  doc.setFontSize(5.4)
  doc.setTextColor(...rgb(FG_MUTED))
  doc.text(veilig(label.toUpperCase()), x, y, { charSpace: 0.12 })

  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...rgb(FG))
  const regels = doc.splitTextToSize(veilig(waarde), maxW) as string[]
  doc.text(regels[0] ?? '', x, y + 3.9)
}

function tekenKop(
  doc: jsPDF,
  kop: DetailplanningKop,
  bedrijf: DetailplanningBedrijf,
  bereik: { vs: Date; ve: Date },
  logo: PdfLogo | null,
  accent: string,
) {
  const y = MARGE
  const rechts = PAGINA.breedte - MARGE

  // Logo rechtsboven. De huisstijlgids houdt 25 mm aan als ondergrens voor de
  // breedte en vraagt gelijke witruimte rondom; 34 mm zit daar comfortabel boven.
  let logoGeplaatst = false
  if (logo) {
    const w = 34
    const h = (logo.hoogte / logo.breedte) * w
    try {
      doc.addImage(logo.dataUrl, logo.format, rechts - w, y + 1, w, h, undefined, 'FAST')
      logoGeplaatst = true
    } catch {
      /* logo optioneel */
    }
  }
  if (!logoGeplaatst && bedrijf.naam) {
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...rgb(accent))
    doc.text(veilig(bedrijf.naam), rechts, y + 7, { align: 'right' })
  }

  // Dossiernummer klein boven de titel: het nummer is een etiket, niet de kop.
  const titelBreedte = PAGINA.breedte - MARGE * 2 - 44
  if (kop.dossiernummer) {
    doc.setFont('Montserrat', 'semibold')
    doc.setFontSize(7.2)
    doc.setTextColor(...rgb(accent))
    doc.text(veilig(kop.dossiernummer), MARGE, y + 4.2, { charSpace: 0.18 })
  }

  doc.setFont('Montserrat', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...rgb(GROEN_DONKER))
  const titelRegels = doc.splitTextToSize(veilig(kop.titel), titelBreedte) as string[]
  doc.text(titelRegels[0] ?? '', MARGE, y + 11)

  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(7.4)
  doc.setTextColor(...rgb(FG_MUTED))
  doc.text('Detailplanning', MARGE, y + 15.4, { charSpace: 0.06 })

  // Veldjes op één lijn: label boven, waarde eronder.
  const velden: { label: string; waarde: string }[] = [
    { label: 'Opdrachtgever', waarde: kop.opdrachtgever ?? '—' },
    { label: 'Projectleider', waarde: kop.projectleider ?? '—' },
  ]
  if (kop.werkmaatschappij) velden.push({ label: 'Werkmaatschappij', waarde: kop.werkmaatschappij })
  velden.push({
    label: 'Doorlooptijd',
    waarde: `${datumKort(bereik.vs)} – ${datumKort(bereik.ve)}  (${doorlooptijd(bereik.vs, bereik.ve)})`,
  })

  const veldY = y + 21
  const veldW = 70
  velden.forEach((v, i) => {
    const x = MARGE + i * (veldW + 8)
    if (x + veldW > rechts) return
    veldje(doc, x, veldY, v.label, v.waarde, veldW)
  })

  doc.setDrawColor(...rgb(accent))
  doc.setLineWidth(0.7)
  doc.line(MARGE, y + KOP_H - 2, rechts, y + KOP_H - 2)
  doc.setLineWidth(0.2)
}

function tekenTijdas(doc: jsPDF, as: Tijdas, inhoudH: number, accent: string) {
  const x0 = MARGE + LABEL_W
  const y0 = MARGE + KOP_H
  const colH = TIJDAS_H - SPAN_H

  // Afwisselende tint per maand (of jaar): op een tijdas van maanden lang is dit
  // het enige dat het oog houvast geeft bij het aflezen van een balk.
  as.spans.forEach((s, i) => {
    if (i % 2 === 1) return
    doc.setFillColor(...rgb(BORDER_ZACHT))
    doc.rect(x0 + s.left, y0, s.width, TIJDAS_H, 'F')
  })

  // Kolomkoppen boven de labelkolom.
  doc.setFont('Montserrat', 'semibold')
  doc.setFontSize(5.4)
  doc.setTextColor(...rgb(FG_MUTED))
  const basis = y0 + TIJDAS_H - 2.4
  doc.text('NR', MARGE + KOL.nr.x + KOL.nr.w, basis, { align: 'right', charSpace: 0.1 })
  doc.text('ACTIVITEIT', MARGE + KOL.titel.x, basis, { charSpace: 0.1 })
  doc.text('START', MARGE + KOL.start.x, basis, { charSpace: 0.1 })
  doc.text('EIND', MARGE + KOL.eind.x, basis, { charSpace: 0.1 })
  doc.text('DGN', MARGE + KOL.dagen.x + KOL.dagen.w, basis, { align: 'right', charSpace: 0.1 })

  // Spanrij: maanden (of jaren bij de grofste korrel).
  doc.setFontSize(6.4)
  for (const s of as.spans) {
    if (s.width < 7) continue
    doc.setDrawColor(...rgb(BORDER))
    doc.line(x0 + s.left, y0, x0 + s.left, y0 + TIJDAS_H)
    doc.setTextColor(...rgb(GROEN_DONKER))
    doc.text(veilig(s.label.toUpperCase()), x0 + s.left + 1.4, y0 + SPAN_H - 1.6, {
      maxWidth: Math.max(1, s.width - 2.4), charSpace: 0.1,
    })
  }

  // Kolomrij: dagen, weken of maanden.
  for (const c of as.cols) {
    if (c.width < 1.8) continue
    const midden = x0 + c.left + c.width / 2
    doc.setFont('Montserrat', c.isToday ? 'semibold' : 'normal')
    doc.setFontSize(6)
    doc.setTextColor(...rgb(c.isToday ? accent : c.isWeekend ? FG_MUTED : FG_SOFT))
    doc.text(veilig(c.label), midden, y0 + SPAN_H + colH - 3.4, { align: 'center' })
    if (c.subLabel && c.width >= 3.2) {
      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(4.4)
      doc.setTextColor(...rgb(FG_MUTED))
      doc.text(veilig(c.subLabel), midden, y0 + SPAN_H + colH - 0.9, { align: 'center' })
    }
  }

  doc.setDrawColor(...rgb(FG_SOFT))
  doc.setLineWidth(0.3)
  doc.line(MARGE, y0 + TIJDAS_H, PAGINA.breedte - MARGE, y0 + TIJDAS_H)
  doc.setLineWidth(0.2)
  doc.setDrawColor(...rgb(BORDER))
  doc.line(x0, y0, x0, RIJZONE_Y + inhoudH)
}

function tekenAchtergrond(doc: jsPDF, as: Tijdas, inhoudH: number) {
  const x0 = MARGE + LABEL_W

  // Weekendarcering alleen bij de dagkorrel; smaller dan dat is een weekendvlak
  // een streepje dat het beeld eerder vuil maakt dan verduidelijkt.
  if (as.view === 'maand') {
    doc.setFillColor(...rgb(WEEKEND))
    for (let i = 0; i < as.dagen; i++) {
      if (!isWeekend(addDays(as.vs, i))) continue
      doc.rect(x0 + i * as.mmPerDag, RIJZONE_Y, as.mmPerDag, inhoudH, 'F')
    }
  }

  // Verticale scheidingen: de zware lijnen uit de gedeelde layout-laag (maandagen
  // bij dagkorrel, de eerste van de maand bij de grovere korrels).
  doc.setDrawColor(...rgb(BORDER_ZACHT))
  for (const u of as.gridUnits) {
    if (u.borderStrength !== 'major') continue
    doc.line(x0 + u.left, RIJZONE_Y, x0 + u.left, RIJZONE_Y + inhoudH)
  }
}

/**
 * Vandaaglijn met vlag. Wordt ná de rijen getekend: de fase-balken zijn gevulde
 * vlakken over de volle breedte en zouden de vlag anders onder zich begraven.
 */
function tekenVandaag(doc: jsPDF, as: Tijdas, inhoudH: number, accent: string): boolean {
  const vandaag = startOfDay(new Date())
  if (vandaag < startOfDay(as.vs) || vandaag > startOfDay(as.ve)) return false

  // Alleen een lijn, geen vlag met "VANDAAG" erop: waar je zo'n vlag ook zet, hij
  // drukt altijd een dag-, week- of maandkop weg. De lijn wordt in de legenda
  // onderaan verklaard, en dat kost geen enkel label.
  const x = MARGE + LABEL_W + (differenceInCalendarDays(vandaag, startOfDay(as.vs)) + 0.5) * as.mmPerDag
  doc.setDrawColor(...rgb(accent))
  doc.setLineWidth(0.5)
  doc.line(x, MARGE + KOP_H, x, RIJZONE_Y + inhoudH)
  doc.setLineWidth(0.2)
  return true
}

function tekenRijen(doc: jsPDF, rijen: Rij[], as: Tijdas, hoogte: number, inhoudH: number, accent: string) {
  const x0 = MARGE + LABEL_W
  const tekstPt = 6.6 + ((hoogte - 5.0) / 2.5) * 1.9
  const basislijn = tekstPt * 0.13
  let y = RIJZONE_Y
  let zebra = false

  for (const r of rijen) {
    const h = rijHoogte(r, hoogte)
    const midden = y + h / 2 + basislijn

    if (r.soort === 'fase') {
      zebra = false
      doc.setFillColor(...rgb(FASE_BALK))
      doc.rect(MARGE, y, PAGINA.breedte - MARGE * 2, h, 'F')
      // Accentstreepje links maakt de sectiekop herkenbaar zonder een zwaar vlak.
      doc.setFillColor(...rgb(accent))
      doc.rect(MARGE, y, 1.8, h, 'F')

      doc.setFont('Montserrat', 'semibold')
      doc.setFontSize(tekstPt)
      doc.setTextColor(...rgb(GROEN_DONKER))
      doc.text(veilig(r.naam.toUpperCase()), MARGE + KOL.titel.x, midden, {
        maxWidth: KOL.start.x - KOL.titel.x - 2, charSpace: 0.08,
      })

      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(tekstPt - 1.3)
      doc.setTextColor(...rgb(FG_MUTED))
      if (r.start) doc.text(datumCel(r.start), MARGE + KOL.start.x, midden)
      if (r.eind) doc.text(datumCel(r.eind), MARGE + KOL.eind.x, midden)
      // De doorlooptijd van de fase zelf — onder een kolom die "DGN" heet hoort
      // een aantal dagen te staan, niet het aantal activiteiten eronder.
      const faseDagen = duurInDagen(r.start, r.eind)
      if (faseDagen != null) {
        doc.text(String(faseDagen), MARGE + KOL.dagen.x + KOL.dagen.w, midden, { align: 'right' })
      }

      const balk = balkGeometrie(r.start, r.eind, as)
      if (balk) {
        doc.setFillColor(...rgb(FG_MUTED))
        doc.rect(x0 + balk.left, y + h * 0.44, balk.breedte, Math.max(0.9, h * 0.14), 'F')
      }
    } else {
      if (zebra) {
        doc.setFillColor(...rgb(ZEBRA))
        doc.rect(MARGE, y, PAGINA.breedte - MARGE * 2, h, 'F')
      }
      zebra = !zebra

      doc.setFont('Montserrat', 'normal')
      doc.setFontSize(tekstPt - 0.8)
      doc.setTextColor(...rgb(FG_MUTED))
      doc.text(String(r.nr), MARGE + KOL.nr.x + KOL.nr.w, midden, { align: 'right' })

      // splitTextToSize is de jsPDF-tegenhanger van `wikkel` uit lib/pdf/tekst:
      // het rekent met de actieve font en grootte, dus geen eigen breedtemeting.
      doc.setFontSize(tekstPt)
      doc.setTextColor(...rgb(FG))
      const regels = doc.splitTextToSize(veilig(r.titel), KOL.titel.w) as string[]
      const tonen = regels.slice(0, h >= 6.5 ? 2 : 1)
      if (regels.length > tonen.length) {
        tonen[tonen.length - 1] = `${tonen[tonen.length - 1].replace(/\s+\S*$/, '')}…`
      }
      const regelH = tekstPt * 0.36
      const startY = y + h / 2 - ((tonen.length - 1) * regelH) / 2 + basislijn
      tonen.forEach((t, i) => doc.text(t, MARGE + KOL.titel.x, startY + i * regelH))

      doc.setFontSize(tekstPt - 0.9)
      doc.setTextColor(...rgb(FG_SOFT))
      if (r.start) doc.text(datumCel(r.start), MARGE + KOL.start.x, midden)
      if (r.eind) doc.text(datumCel(r.eind), MARGE + KOL.eind.x, midden)
      const dagen = duurInDagen(r.start, r.eind)
      if (dagen != null) {
        doc.setTextColor(...rgb(FG_MUTED))
        doc.text(String(dagen), MARGE + KOL.dagen.x + KOL.dagen.w, midden, { align: 'right' })
      }

      const balk = balkGeometrie(r.start, r.eind, as)
      if (balk) {
        const bh = Math.min(h * 0.56, 4.4)
        const by = y + (h - bh) / 2
        doc.setFillColor(...rgb(r.kleur))
        doc.roundedRect(x0 + balk.left, by, balk.breedte, bh, 0.6, 0.6, 'F')
        // Het volgnummer in de balk, zolang hij breed genoeg is om het te dragen.
        if (balk.breedte >= 5.5 && bh >= 2.8) {
          doc.setFont('Montserrat', 'semibold')
          doc.setFontSize(Math.min(tekstPt - 1.6, bh * 1.5))
          doc.setTextColor(...leesbaarOp(r.kleur))
          doc.text(String(r.nr), x0 + balk.left + balk.breedte / 2, by + bh / 2 + bh * 0.26, { align: 'center' })
        }
      }
    }

    doc.setDrawColor(...rgb(BORDER_ZACHT))
    doc.line(MARGE, y + h, PAGINA.breedte - MARGE, y + h)
    y += h
  }

  doc.setDrawColor(...rgb(BORDER))
  doc.rect(MARGE, RIJZONE_Y, PAGINA.breedte - MARGE * 2, inhoudH, 'S')
}

/**
 * Balkpositie in mm binnen de tijdas, of null als hij buiten dit periodeblok valt.
 * Zelfde rekenregel als het scherm: de einddatum telt als hele dag mee.
 */
function balkGeometrie(start: string | null, eind: string | null, as: Tijdas): { left: number; breedte: number } | null {
  if (!start || !eind) return null
  const vanaf = dagOffset(start, as.vs)
  const totEnMet = dagOffset(eind, as.vs) + 1
  if (totEnMet <= 0 || vanaf >= as.dagen) return null
  const left = Math.max(0, vanaf) * as.mmPerDag
  const right = Math.min(as.dagen, totEnMet) * as.mmPerDag
  return { left, breedte: Math.max(MIN_BALK_W, right - left) }
}

function duurInDagen(start: string | null, eind: string | null): number | null {
  if (!start || !eind) return null
  return differenceInCalendarDays(alsDatum(eind), alsDatum(start)) + 1
}

function tekenVoet(
  doc: jsPDF,
  legenda: Legenda,
  blad: number,
  totaal: number,
  rijBlok: Rij[],
  as: Tijdas,
  uitgedraaid: string,
  accent: string,
  toonVandaag: boolean,
) {
  const y = PAGINA.hoogte - MARGE - VOET_H + 5.5
  const rechts = PAGINA.breedte - MARGE

  doc.setDrawColor(...rgb(BORDER))
  doc.line(MARGE, y - 5, rechts, y - 5)
  // Accentstreepje linksonder — dezelfde afsluiting als de lijn onder de kop.
  doc.setFillColor(...rgb(accent))
  doc.rect(MARGE, y - 5.35, 16, 0.7, 'F')

  doc.setFont('Montserrat', 'normal')
  doc.setFontSize(6)

  // De volgnummers die op dit blad staan — dat is wat de lezer in de linkerkolom
  // ziet. Rijen tellen zou de fase-koppen meerekenen en dus niet kloppen.
  const nrs = rijBlok.filter(r => r.soort === 'activiteit').map(r => (r as Extract<Rij, { soort: 'activiteit' }>).nr)
  const nrBereik = nrs.length
    ? nrs.length === 1 ? `activiteit ${nrs[0]}` : `activiteiten ${nrs[0]}–${nrs[nrs.length - 1]}`
    : null

  const rechterRegel = [
    totaal > 1 ? `Blad ${blad} van ${totaal}` : null,
    nrBereik,
    `${datumKort(as.vs)} – ${datumKort(as.ve)}`,
    `uitgedraaid ${uitgedraaid}`,
  ].filter(Boolean).join('   ·   ')
  const rechterBreedte = doc.getTextWidth(rechterRegel)

  // Legenda van links, tot waar de bladregel rechts begint.
  let x = MARGE
  for (const l of legenda) {
    const label = veilig(l.label)
    if (!label) continue
    const breedte = doc.getTextWidth(label) + 9
    if (x + breedte > rechts - rechterBreedte - 10) break
    doc.setFillColor(...rgb(l.kleur || BALK_FALLBACK))
    doc.roundedRect(x, y - 2.3, 3.2, 3.2, 0.5, 0.5, 'F')
    doc.setTextColor(...rgb(FG_SOFT))
    doc.text(label, x + 4.8, y)
    x += breedte
  }

  // Verklaart de groene verticale lijn in het raster.
  if (toonVandaag && x + 22 < rechts - rechterBreedte - 10) {
    doc.setDrawColor(...rgb(accent))
    doc.setLineWidth(0.5)
    doc.line(x + 1.6, y - 2.4, x + 1.6, y + 0.6)
    doc.setLineWidth(0.2)
    doc.setTextColor(...rgb(FG_SOFT))
    doc.text('vandaag', x + 4.8, y)
  }

  doc.setTextColor(...rgb(FG_MUTED))
  doc.text(veilig(rechterRegel), rechts, y, { align: 'right' })
}

/** "Detailplanning 25-123 Renovatie Kerkstraat.pdf" */
export function detailplanningBestandsnaam(dossiernummer: string | null, titel: string): string {
  const kern = [dossiernummer, titel]
    .filter(Boolean)
    .join(' ')
    .replace(/[\\/:*?"<>|]/g, '-')
    .trim()
  return `Detailplanning ${kern || 'dossier'}.pdf`.replace(/\s+/g, ' ')
}
