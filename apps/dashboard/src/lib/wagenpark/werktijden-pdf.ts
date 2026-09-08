/**
 * De werktijden-uitdraai van één medewerker tekenen.
 *
 * Los van de route zodat de opmaak zonder database en zonder inlogsessie te
 * bekijken is — een PDF met over elkaar heen vallende kolommen valt in geen
 * enkele type-check op, alleen op papier.
 */
import jsPDF from 'jspdf'
import { datumKort, MAAND_LABEL, maandenInPeriode, type Periode } from '@/lib/wagenpark/periode'
import { bouwSamenvatting } from '@/lib/wagenpark/werktijd-samenvatting'
import {
  minutenLabel, urenLabel, teltMee, omrekening, UREN_PER_WERKDAG, SOORT_LABEL,
} from '@/lib/wagenpark/werktijd'
import type { WerktijdRij } from '@/components/wagenpark/werktijden/WerktijdenTabel'

/** Zelfde woorden als op het scherm; zie WerktijdenTabel. */
const STATUS_LABEL: Record<string, string> = {
  open: 'Te controleren',
  geaccepteerd_uitzondering: 'Verklaard',
  afgewezen: 'Bespreken',
  opgelost: 'Opgelost',
}

const tijd = (t: string | null) => (t ? t.slice(0, 5) : '—')

const WEEKDAG = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']

/** "ma 13 jul 2026" — de dagnaam erbij, want een gesprek gaat over maandagen. */
function datumMetDag(datum: string): string {
  const dag = new Date(datum + 'T12:00:00Z').getUTCDay()
  return `${WEEKDAG[dag]} ${datumKort(datum)}`
}

export type WerktijdenPdfInvoer = {
  naam: string
  periode: Periode
  /** Alle rijen van deze medewerker; verklaarde regels horen erbij. */
  rijen: WerktijdRij[]
  /** Handmatige signalen zonder minuten; alleen om te vermelden. */
  handmatigAantal: number
  bedrijfsnaam: string | null
  /** Logo als data-URI + formaat, of null. */
  logo: { dataUrl: string; format: string } | null
}

export function bouwWerktijdenPdf({
  naam,
  periode,
  rijen: ongesorteerd,
  handmatigAantal,
  bedrijfsnaam,
  logo,
}: WerktijdenPdfInvoer): ArrayBuffer {
  // Oudste bovenaan: een gesprek loopt van toen naar nu.
  const rijen = [...ongesorteerd].sort((a, b) => a.datum.localeCompare(b.datum))
  const totalen = bouwSamenvatting(rijen)[0] ?? null

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margeL = 16
  const margeR = pageW - 16

  // ── Kop ────────────────────────────────────────────────────────────
  let y = 16
  if (logo) {
    try { doc.addImage(logo.dataUrl, logo.format, margeR - 34, y, 34, 12, undefined, 'FAST') } catch { /* logo optioneel */ }
  }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(22, 27, 32)
  doc.text('Werktijden', margeL, y + 6)
  doc.setFontSize(13)
  doc.text(naam, margeL, y + 14)

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(120, 128, 134)
  doc.text(
    [
      `${periode.label} · ${datumKort(periode.van)} t/m ${datumKort(periode.tot)}`,
      `Gegenereerd: ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    ].join('   ·   '),
    margeL, y + 20,
  )

  y += 27
  doc.setDrawColor(220, 224, 227); doc.line(margeL, y, margeR, y)
  y += 8

  // ── Totalen ────────────────────────────────────────────────────────
  const totaalMinuten = totalen?.totaalMinuten ?? 0
  const om = omrekening(totaalMinuten)
  const meetellend = rijen.filter((r) => teltMee(r.status)).length
  const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

  const cijfers: [string, string, string][] = [
    [
      'Totaal afwijking',
      minutenLabel(totaalMinuten),
      `${getal(om.uren)} uur · ${getal(om.dagen)} werkdagen`,
    ],
    ['Te laat', minutenLabel(totalen?.minutenLaat ?? 0), `${totalen?.dagenLaat ?? 0} dagen`],
    ['Te vroeg weg', minutenLabel(totalen?.minutenVroeg ?? 0), `${totalen?.dagenVroeg ?? 0} dagen`],
    [
      'Verklaard',
      totalen && totalen.verklaardDagen > 0 ? minutenLabel(totalen.verklaardMinuten) : '—',
      totalen && totalen.verklaardDagen > 0
        ? `${totalen.verklaardDagen} dagen · telt niet mee`
        : 'niets weggestreept',
    ],
  ]

  const blokBreedte = (margeR - margeL) / cijfers.length
  cijfers.forEach(([label, waarde, sub], i) => {
    const x = margeL + i * blokBreedte
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 134)
    doc.text(label.toUpperCase(), x, y)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(22, 27, 32)
    doc.text(waarde, x, y + 7)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 134)
    doc.text(sub, x, y + 11.5)
  })
  y += 18

  doc.setFontSize(8); doc.setTextColor(120, 128, 134)
  doc.text(
    `${meetellend} van ${rijen.length} gemarkeerde dagen telt mee. ` +
      `Werkdagen omgerekend bij ${UREN_PER_WERKDAG} uur per dag.`,
    margeL, y,
  )
  y += 6

  // ── Verdeling per maand ────────────────────────────────────────────
  if (totalen) {
    const perMaand = maandenInPeriode(periode)
      .map((m) => `${MAAND_LABEL[m]} ${totalen.perMaand[m] ? minutenLabel(totalen.perMaand[m]) : '—'}`)
      .join('   ·   ')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(90, 100, 108)
    for (const regel of doc.splitTextToSize(perMaand, margeR - margeL) as string[]) {
      doc.text(regel, margeL, y)
      y += 4.5
    }
    y += 2
  }

  doc.setDrawColor(220, 224, 227); doc.line(margeL, y, margeR, y)
  y += 6

  // ── Tabel ──────────────────────────────────────────────────────────
  const kolDatum = margeL
  const kolSoort = margeL + 30
  const kolRooster = margeL + 46
  const kolWerkelijk = margeL + 61
  const kolAfwijking = margeL + 79
  const kolGeboekt = margeL + 95
  const kolUursoort = margeL + 110
  // De status staat rechts uitgelijnd tegen de marge: dan kan een lange
  // uursoorten-omschrijving er nooit overheen lopen. De 22 mm die hier wordt
  // vrijgehouden is de breedte van het langste label ("Te controleren").
  const uursoortBreedte = margeR - 22 - kolUursoort
  const rijH = 6.5

  function tekenTabelkop() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 134)
    doc.text('DATUM', kolDatum, y)
    doc.text('SOORT', kolSoort, y)
    doc.text('ROOSTER', kolRooster, y)
    doc.text('WERKELIJK', kolWerkelijk, y)
    doc.text('AFWIJKING', kolAfwijking, y)
    doc.text('GEBOEKT', kolGeboekt, y)
    doc.text('UURSOORTEN', kolUursoort, y)
    doc.text('STATUS', margeR, y, { align: 'right' })
    y += 2.5
    doc.setDrawColor(220, 224, 227); doc.line(margeL, y, margeR, y)
    y += 4
  }

  /** Kort een tekst af tot hij binnen `breedte` past, met een beletselteken. */
  function pasIn(tekst: string, breedte: number): string {
    if (doc.getTextWidth(tekst) <= breedte) return tekst
    let kort = tekst
    while (kort.length > 1 && doc.getTextWidth(kort + '...') > breedte) kort = kort.slice(0, -1)
    return kort.trimEnd() + '...'
  }
  tekenTabelkop()

  for (const r of rijen) {
    if (y + rijH > pageH - 18) {
      doc.addPage(); y = 16; tekenTabelkop()
    }
    // Verklaarde dagen staan er grijs bij: zichtbaar, maar duidelijk anders dan
    // de regels waar het gesprek over gaat.
    const verklaard = !teltMee(r.status)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    if (verklaard) doc.setTextColor(150, 156, 161)
    else doc.setTextColor(22, 27, 32)

    doc.text(datumMetDag(r.datum), kolDatum, y)
    doc.text(SOORT_LABEL[r.soort], kolSoort, y)
    doc.text(tijd(r.verwacht) + (r.benadering ? ' ~' : ''), kolRooster, y)
    doc.text(tijd(r.werkelijk), kolWerkelijk, y)

    doc.setFont('helvetica', verklaard ? 'normal' : 'bold')
    doc.text(minutenLabel(r.minuten), kolAfwijking, y)
    doc.setFont('helvetica', 'normal')

    doc.text(r.geboekt == null ? '—' : `${urenLabel(r.geboekt)} u`, kolGeboekt, y)

    // De uursoorten verklaren de geboekte uren ("6,0 normaal · 2,0 verlof"): dat
    // is precies wat een signaal verklaart of juist niet. Te lang voor de
    // kolombreedte wordt hij afgekapt; de volledige tekst staat op het scherm en
    // in de Excel-export.
    doc.setFontSize(7); doc.setTextColor(120, 128, 134)
    doc.text(pasIn(r.uursoorten ?? '—', uursoortBreedte), kolUursoort, y)

    doc.setFontSize(7.5)
    doc.text(STATUS_LABEL[r.status] ?? r.status, margeR, y, { align: 'right' })

    y += rijH
    doc.setDrawColor(240, 242, 244); doc.line(margeL, y - 2, margeR, y - 2)
  }

  if (rijen.length === 0) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(10); doc.setTextColor(120, 128, 134)
    doc.text('Geen te late aankomsten of vroege vertrekken in deze periode.', margeL, y + 4)
    y += 10
  }

  // Uitleg onder de tabel: zonder deze regels is een uitdraai niet te verdedigen
  // in een gesprek — je moet kunnen uitleggen wat er gemeten is en wat niet.
  if (y + 22 > pageH - 18) { doc.addPage(); y = 16 }
  y += 4
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(140, 146, 151)
  const voetnoten = [
    'Gemeten aan de hand van de zakelijke ritten van de bedrijfsauto, afgezet tegen het geldende rooster. Een tilde (~) bij de roostertijd betekent dat op die datum nog geen rooster gold en het dichtstbijzijnde is gebruikt.',
    'Ritten die bij elkaar horen tellen als een aankomst of vertrek. "Geboekt" zijn de uren die die dag in Bouw7 zijn geschreven; een streepje betekent dat ze niet opgehaald konden worden.',
    'Regels met status "Verklaard" staan er ter informatie bij en tellen niet mee in de totalen.',
  ]
  if (handmatigAantal > 0) {
    voetnoten.push(
      `${handmatigAantal} handmatig toegekende signalen in deze periode hebben geen tijd en staan hier niet bij.`,
    )
  }
  for (const noot of voetnoten) {
    for (const regel of doc.splitTextToSize(noot, margeR - margeL) as string[]) {
      if (y > pageH - 16) { doc.addPage(); y = 16 }
      doc.text(regel, margeL, y)
      y += 3.4
    }
    y += 1
  }

  // ── Voettekst op elke pagina ───────────────────────────────────────
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(150, 156, 161)
    doc.text(`${bedrijfsnaam ?? ''} · vertrouwelijk — personeelsgegevens`, margeL, pageH - 10)
    doc.text(`${p} / ${paginas}`, margeR, pageH - 10, { align: 'right' })
  }

  return doc.output('arraybuffer')
}

/** Bestandsnaam zonder rare tekens: "werktijden-jan-de-vries-2026-07-01-2026-09-30.pdf". */
export function werktijdenPdfBestandsnaam(naam: string, periode: Periode): string {
  const veilig = naam.replace(/[^a-z0-9]/gi, '-').toLowerCase()
  return `werktijden-${veilig}-${periode.van}-${periode.tot}.pdf`
}
