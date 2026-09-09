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
import type { DetailplanningKop } from './detailplanning-gegevens'

// ─── Maatvoering (mm, liggende A3) ────────────────────────────────────────────

const PAGINA = { breedte: 420, hoogte: 297 }
const MARGE = 10
/** Kopzone: dossiernummer, titel, opdrachtgever, projectleider, logo. */
const KOP_H = 20
/** Tijdas-header: spanrij (maanden/jaren) boven de kolomrij (dagen/weken/maanden). */
const TIJDAS_H = 11
/** Voetzone: legenda links, bladnummering rechts. */
const VOET_H = 9
/** Linkerkolom met volgnummer, activiteitnaam en duur. */
const LABEL_W = 72

const TIJDAS_W = PAGINA.breedte - MARGE * 2 - LABEL_W
const RIJZONE_Y = MARGE + KOP_H + TIJDAS_H
const RIJZONE_H = PAGINA.hoogte - RIJZONE_Y - VOET_H - MARGE

/**
 * Rijhoogtes waaruit gekozen wordt, van comfortabel naar de ondergrens. Onder de
 * 5 mm is een regel op een meter afstand niet meer te lezen, en dat is precies
 * waar zo'n vel voor hangt.
 */
const RIJHOOGTES = [7.5, 7.0, 6.5, 6.0, 5.5, 5.0]
/** Een fase-rij is lager dan een activiteitrij — zelfde verhouding als op het scherm (36 vs 48 px). */
const FASE_FACTOR = 0.75
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

const BRAND = '#009439'
const FG = '#161b20'
const FG_SOFT = '#364048'
const FG_MUTED = '#6b757c'
const BORDER = '#e3e8ea'
const BORDER_ZACHT = '#f1f4f5'
const WEEKEND = '#f1f4f5'
const FASE_BALK = '#c4cad2'
const BALK_FALLBACK = '#4a7c9e'

type Rgb = [number, number, number]

/** '#009439' → [0, 148, 57]. Korte vorm (#abc) wordt ook geaccepteerd. */
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
 */
export function bouwRijen(
  fasen: PlanningFase[],
  activiteiten: PlanningActiviteit[],
  uursoortKleuren: Record<string, string>,
): Rij[] {
  const gesorteerd = [...activiteiten].sort((a, b) => a.volgorde - b.volgorde)
  const fSorted = [...fasen].sort((a, b) => a.volgorde - b.volgorde)
  const rijen: Rij[] = []
  let nr = 0

  const voegToe = (a: PlanningActiviteit) => {
    const { start, eind } = activiteitBereik(a)
    rijen.push({
      soort: 'activiteit',
      nr: ++nr,
      titel: a.titel ?? '',
      start,
      eind,
      kleur: (a.uursoort_id && uursoortKleuren[a.uursoort_id]) || BALK_FALLBACK,
    })
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
  return rijen
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
 * korrel aankan (± 2,7 jaar) wordt over meerdere vellen naast elkaar verdeeld.
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
  fasen: PlanningFase[]
  activiteiten: PlanningActiviteit[]
  uursoorten: Pick<PlanningUursoort, 'id' | 'naam' | 'kleur'>[]
  bedrijfsnaam: string | null
  /** Logo als data-URI + formaat, of null. */
  logo: { dataUrl: string; format: string } | null
}

const datumLang = (d: Date) => format(d, 'd MMMM yyyy', { locale: nl })
const datumKort = (d: Date) => format(d, 'd MMM yyyy', { locale: nl })

export function bouwDetailplanningPdf(invoer: DetailplanningPdfInvoer): ArrayBuffer {
  const { kop, fasen, activiteiten, uursoorten, bedrijfsnaam, logo } = invoer

  const kleuren: Record<string, string> = {}
  for (const u of uursoorten) if (u.kleur) kleuren[u.id] = u.kleur

  const rijen = bouwRijen(fasen, activiteiten, kleuren)
  const { hoogte, blokken } = kiesRijhoogte(rijen)
  const bereik = bepaalBereik(rijen)
  const periodes = verdeelPeriode(bereik.vs, bereik.ve)

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const totaalBladen = periodes.length * blokken.length
  const uitgedraaid = datumLang(new Date())

  let blad = 0
  for (const periode of periodes) {
    const as = maakTijdas(periode.vs, periode.ve)
    for (const rijBlok of blokken) {
      if (blad > 0) doc.addPage()
      blad++
      // Het raster stopt onder de laatste regel. Bij een korte planning zou een
      // rijzone op volle hoogte een half vel grijze weekendbanen opleveren.
      const inhoudH = Math.min(RIJZONE_H, rijBlok.reduce((s, r) => s + rijHoogte(r, hoogte), 0))
      tekenKop(doc, kop, as, bedrijfsnaam, logo)
      tekenTijdas(doc, as, inhoudH)
      tekenAchtergrond(doc, as, inhoudH)
      tekenRijen(doc, rijBlok, as, hoogte, inhoudH)
      // Ná de rijen: de fase-balken zijn gevulde vlakken en zouden de vlag anders overtekenen.
      tekenVandaag(doc, as, inhoudH)
      tekenVoet(doc, uursoorten, blad, totaalBladen, rijBlok, as, uitgedraaid)
    }
  }

  return doc.output('arraybuffer')
}

function tekenKop(
  doc: jsPDF,
  kop: DetailplanningKop,
  as: Tijdas,
  bedrijfsnaam: string | null,
  logo: { dataUrl: string; format: string } | null,
) {
  const y = MARGE
  const rechts = PAGINA.breedte - MARGE

  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, rechts - 34, y, 34, 12, undefined, 'FAST')
    } catch {
      /* logo optioneel */
    }
  } else if (bedrijfsnaam) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.setTextColor(...rgb(BRAND))
    doc.text(veilig(bedrijfsnaam), rechts, y + 6, { align: 'right' })
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...rgb(FG))
  doc.text(veilig([kop.dossiernummer, kop.titel].filter(Boolean).join('  ')), MARGE, y + 6, { maxWidth: 300 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...rgb(FG_MUTED))
  const regel = [
    'Detailplanning',
    kop.opdrachtgever ? `Opdrachtgever: ${kop.opdrachtgever}` : null,
    kop.projectleider ? `Projectleider: ${kop.projectleider}` : null,
    `${datumLang(as.vs)} t/m ${datumLang(as.ve)}`,
  ].filter(Boolean).join('   ·   ')
  doc.text(veilig(regel), MARGE, y + 12, { maxWidth: 340 })

  doc.setDrawColor(...rgb(BRAND))
  doc.setLineWidth(0.6)
  doc.line(MARGE, y + KOP_H - 3, rechts, y + KOP_H - 3)
  doc.setLineWidth(0.2)
}

function tekenTijdas(doc: jsPDF, as: Tijdas, inhoudH: number) {
  const x0 = MARGE + LABEL_W
  const y0 = MARGE + KOP_H
  const spanH = 5
  const colH = TIJDAS_H - spanH

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...rgb(FG_MUTED))
  doc.text('ACTIVITEIT', MARGE + 1.5, y0 + TIJDAS_H - 2)
  doc.text('DAGEN', MARGE + LABEL_W - 1.5, y0 + TIJDAS_H - 2, { align: 'right' })

  // Spanrij: maanden (of jaren bij de grofste korrel).
  for (const s of as.spans) {
    if (s.width < 6) continue
    doc.setDrawColor(...rgb(BORDER))
    doc.line(x0 + s.left, y0, x0 + s.left, y0 + spanH)
    doc.setTextColor(...rgb(FG_MUTED))
    doc.text(veilig(s.label.toUpperCase()), x0 + s.left + 1.2, y0 + spanH - 1.4, { maxWidth: Math.max(1, s.width - 2) })
  }

  // Kolomrij: dagen, weken of maanden.
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  for (const c of as.cols) {
    if (c.width < 1.8) continue
    const midden = x0 + c.left + c.width / 2
    doc.setTextColor(...rgb(c.isToday ? BRAND : c.isWeekend ? FG_MUTED : FG_SOFT))
    if (c.isToday) doc.setFont('helvetica', 'bold')
    doc.text(veilig(c.label), midden, y0 + spanH + colH - 3.6, { align: 'center' })
    if (c.isToday) doc.setFont('helvetica', 'normal')
    if (c.subLabel && c.width >= 3.2) {
      doc.setFontSize(4.6)
      doc.setTextColor(...rgb(FG_MUTED))
      doc.text(veilig(c.subLabel), midden, y0 + spanH + colH - 1, { align: 'center' })
      doc.setFontSize(6)
    }
  }

  doc.setDrawColor(...rgb(BORDER))
  doc.line(MARGE, y0 + TIJDAS_H, PAGINA.breedte - MARGE, y0 + TIJDAS_H)
  doc.line(MARGE + LABEL_W, y0, MARGE + LABEL_W, RIJZONE_Y + inhoudH)
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
 * Vandaaglijn met vlag, zoals op het scherm. Wordt ná de rijen getekend: de
 * fase-balken zijn gevulde vlakken over de volle breedte en zouden de vlag
 * anders onder zich begraven.
 */
function tekenVandaag(doc: jsPDF, as: Tijdas, inhoudH: number) {
  const vandaag = startOfDay(new Date())
  if (vandaag < startOfDay(as.vs) || vandaag > startOfDay(as.ve)) return

  const x = MARGE + LABEL_W + (differenceInCalendarDays(vandaag, startOfDay(as.vs)) + 0.5) * as.mmPerDag
  doc.setDrawColor(...rgb(BRAND))
  doc.setLineWidth(0.4)
  doc.line(x, RIJZONE_Y, x, RIJZONE_Y + inhoudH)
  doc.setLineWidth(0.2)
  doc.setFillColor(...rgb(BRAND))
  doc.roundedRect(x - 7, RIJZONE_Y - 3.6, 14, 3.6, 0.6, 0.6, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(5)
  doc.setTextColor(255, 255, 255)
  doc.text('VANDAAG', x, RIJZONE_Y - 1.2, { align: 'center' })
}

function tekenRijen(doc: jsPDF, rijen: Rij[], as: Tijdas, hoogte: number, inhoudH: number) {
  const x0 = MARGE + LABEL_W
  const tekstPt = 6.5 + ((hoogte - 5.0) / 2.5) * 2.0
  const basislijn = tekstPt * 0.13
  let y = RIJZONE_Y

  for (const r of rijen) {
    const h = rijHoogte(r, hoogte)

    if (r.soort === 'fase') {
      doc.setFillColor(...rgb(BORDER_ZACHT))
      doc.rect(MARGE, y, PAGINA.breedte - MARGE * 2, h, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(tekstPt)
      doc.setTextColor(...rgb(FG))
      doc.text(veilig(r.naam.toUpperCase()), MARGE + 1.5, y + h / 2 + basislijn, { maxWidth: LABEL_W - 3 })

      const balk = balkGeometrie(r.start, r.eind, as)
      if (balk) {
        doc.setFillColor(...rgb(FASE_BALK))
        doc.rect(x0 + balk.left, y + h * 0.32, balk.breedte, h * 0.36, 'F')
      }
    } else {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(tekstPt)
      doc.setTextColor(...rgb(FG_MUTED))
      doc.text(String(r.nr), MARGE + 1.5, y + h / 2 + basislijn)

      // splitTextToSize is de jsPDF-tegenhanger van `wikkel` uit lib/pdf/tekst:
      // het rekent met de actieve font en grootte, dus geen eigen breedtemeting.
      doc.setTextColor(...rgb(FG))
      const regels = doc.splitTextToSize(veilig(r.titel), LABEL_W - 19) as string[]
      const tonen = regels.slice(0, h >= 6.5 ? 2 : 1)
      if (regels.length > tonen.length) {
        tonen[tonen.length - 1] = `${tonen[tonen.length - 1].replace(/\s+\S*$/, '')}…`
      }
      const regelH = tekstPt * 0.36
      const startY = y + h / 2 - ((tonen.length - 1) * regelH) / 2 + basislijn
      tonen.forEach((t, i) => doc.text(t, MARGE + 7, startY + i * regelH))

      const dagen = duurInDagen(r.start, r.eind)
      if (dagen != null) {
        doc.setTextColor(...rgb(FG_MUTED))
        doc.text(String(dagen), MARGE + LABEL_W - 1.5, y + h / 2 + basislijn, { align: 'right' })
      }

      const balk = balkGeometrie(r.start, r.eind, as)
      if (balk) {
        const bh = h * 0.56
        const by = y + (h - bh) / 2
        doc.setFillColor(...rgb(r.kleur))
        doc.roundedRect(x0 + balk.left, by, balk.breedte, bh, 0.5, 0.5, 'F')
        // Het volgnummer in de balk, zolang hij breed genoeg is om het te dragen.
        if (balk.breedte >= 5 && bh >= 3) {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(Math.min(tekstPt - 1.2, bh * 1.9))
          doc.setTextColor(...leesbaarOp(r.kleur))
          doc.text(String(r.nr), x0 + balk.left + balk.breedte / 2, by + bh / 2 + bh * 0.28, { align: 'center' })
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
  uursoorten: Pick<PlanningUursoort, 'id' | 'naam' | 'kleur'>[],
  blad: number,
  totaal: number,
  rijBlok: Rij[],
  as: Tijdas,
  uitgedraaid: string,
) {
  const y = PAGINA.hoogte - MARGE - VOET_H + 4.5
  const rechts = PAGINA.breedte - MARGE

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)

  // De volgnummers die op dit blad staan — dat is wat de lezer in de linkerkolom
  // ziet. Rijen tellen zou de fase-koppen meerekenen en dus niet kloppen.
  const nrs = rijBlok.filter(r => r.soort === 'activiteit').map(r => (r as Extract<Rij, { soort: 'activiteit' }>).nr)
  const bereik = nrs.length
    ? nrs.length === 1 ? `activiteit ${nrs[0]}` : `activiteiten ${nrs[0]}–${nrs[nrs.length - 1]}`
    : null

  const rechterRegel = [
    totaal > 1 ? `Blad ${blad} van ${totaal}` : null,
    bereik,
    `${datumKort(as.vs)} – ${datumKort(as.ve)}`,
    `uitgedraaid ${uitgedraaid}`,
  ].filter(Boolean).join('   ·   ')
  const rechterBreedte = doc.getTextWidth(rechterRegel)

  // Legenda van links, tot waar de bladregel rechts begint.
  let x = MARGE
  for (const u of uursoorten) {
    const label = veilig(u.naam ?? '')
    if (!label) continue
    const breedte = doc.getTextWidth(label) + 8
    if (x + breedte > rechts - rechterBreedte - 8) break
    doc.setFillColor(...rgb(u.kleur || BALK_FALLBACK))
    doc.roundedRect(x, y - 2.4, 3, 3, 0.4, 0.4, 'F')
    doc.setTextColor(...rgb(FG_MUTED))
    doc.text(label, x + 4.2, y)
    x += breedte
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
