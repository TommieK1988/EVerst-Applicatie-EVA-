/**
 * De werktijden-uitdraai van één medewerker tekenen.
 *
 * Los van de route zodat de opmaak zonder database en zonder inlogsessie te
 * bekijken is — een PDF met over elkaar heen vallende kolommen valt in geen
 * enkele type-check op, alleen op papier.
 *
 * LIGGEND, en dat is geen smaakkwestie. Staand paste de tabel precies tot en met
 * de uursoorten; met de aanwezigheid, de arbeidsuren en het saldo erbij komen er
 * drie kolommen bij die er staand alleen in passen door de uursoorten weg te
 * knijpen — en juist díe kolom verklaart een saldo ("5,0 verlof · 3,0 gewerkt").
 * Liggend past alles zonder dat er ergens iets wordt afgekapt.
 */
import jsPDF from 'jspdf'
import { datumKort, MAAND_LABEL, maandenInPeriode, type Periode } from '@/lib/wagenpark/periode'
import { bouwSamenvatting } from '@/lib/wagenpark/werktijd-samenvatting'
import type { PdfLogo } from '@/lib/pdf/logo'
import {
  minutenLabel, urenLabel, teltMee, omrekening, UREN_PER_WERKDAG,
  dagSaldoUren, saldoLabel,
} from '@/lib/wagenpark/werktijd'
import {
  heeftSignaal, dagVerklaard, dagStatus,
  type WerktijdAfwijking, type WerktijdRij,
} from '@/lib/wagenpark/werktijd-dag'

/** Zelfde woorden als op het scherm; zie WerktijdenTabel. */
const STATUS_LABEL: Record<string, string> = {
  geen_signaal: '—',
  open: 'Te controleren',
  geaccepteerd_uitzondering: 'Verklaard',
  afgewezen: 'Bespreken',
  opgelost: 'Opgelost',
}

const tijd = (t: string | null) => (t ? t.slice(0, 5) : '—')

/**
 * Tekst geschikt maken voor de ingebouwde Helvetica van jsPDF.
 *
 * Die font gebruikt WinAnsi, en daar zit het echte minteken (U+2212) NIET in.
 * jsPDF valt er stil op terug met een verkeerde glyph: "−0,4 u" kwam als
 * teken-voor-teken uit elkaar getrokken `" 0 , 4 u` op papier. Op het scherm is
 * U+2212 juist het goede teken — het lijnt uit met de cijfers waar een
 * koppelteken dat niet doet — dus we ruilen hem pas hier om, niet in
 * `saldoLabel` zelf. Het gewone koppelteken staat wel in WinAnsi.
 *
 * En- en em-streepjes (– —) en de punt (·) zitten er wel in en blijven dus staan.
 */
const winAnsi = (t: string) => t.replace(/−/g, '-')

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
  /** Logo als PNG-data-URI met zijn pixelmaten, of null. Zie `lib/pdf/logo.ts`. */
  logo: PdfLogo | null
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

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margeL = 16
  const margeR = pageW - 16

  // ── Kop ────────────────────────────────────────────────────────────
  let y = 16
  if (logo) {
    // Breedte vast, hoogte uit de beeldverhouding. Een vaste 34 × 12 mm
    // perste het woordmerk (± 1,6 : 1) plat.
    const logoB = 34
    const logoH = (logo.hoogte / logo.breedte) * logoB
    try { doc.addImage(logo.dataUrl, logo.format, margeR - logoB, y, logoB, logoH, undefined, 'FAST') } catch { /* logo optioneel */ }
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
  const signalen = rijen.filter(heeftSignaal)
  const meetellend = signalen.filter((r) => !dagVerklaard(r)).length
  const saldoTotaal = totalen?.saldo ?? null
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
    // Het aantal dagen hoort onlosmakelijk bij dit getal: −8 uur over vier dagen
    // is iets heel anders dan −8 uur over een heel kwartaal.
    [
      'Saldo aanwezig - geboekt',
      saldoTotaal && saldoTotaal.dagen > 0 ? winAnsi(saldoLabel(saldoTotaal.saldoUren)) : '—',
      saldoTotaal && saldoTotaal.dagen > 0
        ? `${getal(saldoTotaal.aanwezigUren)} aanwezig · ${getal(saldoTotaal.arbeidsuren)} arbeidsuren · ${saldoTotaal.dagen} dagen`
        : 'geen dag met ritvenster én arbeidsuren',
    ],
    [
      'Tijd voor tijd',
      saldoTotaal && saldoTotaal.tvtDagen > 0 ? winAnsi(saldoLabel(saldoTotaal.tvtUren)) : '—',
      saldoTotaal && saldoTotaal.tvtDagen > 0
        ? `gereserveerd over ${saldoTotaal.tvtDagen} dagen · niet in Bouw7 geboekt`
        : 'niets gereserveerd',
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
    // De subregel afbreken op de blokbreedte in plaats van hem te laten
    // doorlopen: de saldo-toelichting ("8.498,1 aanwezig - 8.268,5 arbeidsuren
    // - 1116 dagen") is breder dan een blok en liep anders dwars over zijn buur
    // heen. Twee regels is genoeg; langer wordt het niet.
    const subRegels = (doc.splitTextToSize(sub, blokBreedte - 3) as string[]).slice(0, 2)
    subRegels.forEach((regel, j) => doc.text(regel, x, y + 11.5 + j * 3.6))
  })
  y += 21

  doc.setFontSize(8); doc.setTextColor(120, 128, 134)
  doc.text(
    `${rijen.length} werkdagen, waarvan ${signalen.length} met een afwijking; ${meetellend} daarvan telt mee. ` +
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
  // De offsets zijn opgemeten, niet geschat: elke kolom heeft minstens 3 mm
  // speling ten opzichte van zijn eigen kop en zijn breedste waarde. De koppen
  // zijn hier maatgevend, niet de getallen — "ARBEIDSUREN" is breder dan elk
  // urenbedrag dat eronder komt te staan.
  const kolDatum = margeL
  const kolRooster = margeL + 24
  const kolTeLaat = margeL + 47
  const kolTeVroeg = margeL + 61
  const kolAanwezig = margeL + 78
  const kolVenster = margeL + 96
  const kolArbeid = margeL + 113
  const kolSaldo = margeL + 136
  const kolTvt = margeL + 150
  const kolGeboekt = margeL + 174
  const kolUursoort = margeL + 191
  // De status staat rechts uitgelijnd tegen de marge: dan kan een lange
  // uursoorten-omschrijving er nooit overheen lopen. De 22 mm die hier wordt
  // vrijgehouden is de breedte van het langste label ("Te controleren").
  const uursoortBreedte = margeR - 22 - kolUursoort
  const rijH = 6.5

  function tekenTabelkop() {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 134)
    doc.text('DATUM', kolDatum, y)
    doc.text('ROOSTER', kolRooster, y)
    doc.text('TE LAAT', kolTeLaat, y)
    doc.text('TE VROEG', kolTeVroeg, y)
    doc.text('AANWEZIG', kolAanwezig, y)
    doc.text('VENSTER', kolVenster, y)
    doc.text('ARBEIDSUREN', kolArbeid, y)
    doc.text('SALDO', kolSaldo, y)
    doc.text('TIJD VOOR TIJD', kolTvt, y)
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
  /**
   * Eén afwijkingscel: de minuten, vet als de dag nog openstaat.
   *
   * De werkelijke tijd staat er bewust niet bij — die is af te leiden uit de
   * roostertijd plus de afwijking, en er is op papier geen plek voor twee
   * tijden per afwijking.
   */
  function afwijkingCel(a: WerktijdAfwijking | null, x: number): void {
    if (!a) {
      doc.text('—', x, y)
      return
    }
    const weg = !teltMee(a.status)
    doc.setFont('helvetica', weg ? 'normal' : 'bold')
    doc.text(minutenLabel(a.minuten), x, y)
    doc.setFont('helvetica', 'normal')
  }

  tekenTabelkop()

  for (const r of rijen) {
    if (y + rijH > pageH - 18) {
      doc.addPage(); y = 16; tekenTabelkop()
    }
    // Verklaarde dagen staan er grijs bij: zichtbaar, maar duidelijk anders dan
    // de regels waar het gesprek over gaat. Een dag zonder afwijking ook — die
    // hoort in de lijst voor het saldo, maar is niet het gespreksonderwerp.
    const signaal = heeftSignaal(r)
    const verklaard = dagVerklaard(r)
    const gedempt = verklaard || !signaal
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    if (gedempt) doc.setTextColor(150, 156, 161)
    else doc.setTextColor(22, 27, 32)

    doc.text(datumMetDag(r.datum), kolDatum, y)
    const benadering = r.teLaat?.benadering || r.teVroeg?.benadering
    doc.text(
      r.roosterStart || r.roosterEind
        ? `${tijd(r.roosterStart)}-${tijd(r.roosterEind)}${benadering ? ' ~' : ''}`
        : '—',
      kolRooster, y,
    )

    afwijkingCel(r.teLaat, kolTeLaat)
    afwijkingCel(r.teVroeg, kolTeVroeg)

    // Aanwezig volgens de auto. Een streepje betekent dat de dag geen bruikbaar
    // venster opleverde (bijvoorbeeld maar één ritketen) — niet dat er nul uur
    // gewerkt is; de voetnoot onder de tabel zegt dat er expliciet bij.
    doc.text(r.aanwezigMinuten == null ? '—' : minutenLabel(r.aanwezigMinuten), kolAanwezig, y)
    doc.text(r.arbeidsuren == null ? '—' : `${urenLabel(r.arbeidsuren)} u`, kolArbeid, y)

    const saldo = dagSaldoUren(r.aanwezigMinuten, r.arbeidsuren)
    // Een saldo van een half uur of meer krijgt vet: dat zijn de regels waar het
    // gesprek over gaat. Geen kleur — de uitdraai gaat vaak zwart-wit mee.
    doc.setFont('helvetica', !verklaard && saldo != null && Math.abs(saldo) >= 0.5 ? 'bold' : 'normal')
    doc.text(saldo == null ? '—' : winAnsi(saldoLabel(saldo)), kolSaldo, y)
    doc.setFont('helvetica', 'normal')

    doc.text(r.tvtUren == null ? '—' : winAnsi(saldoLabel(r.tvtUren)), kolTvt, y)
    doc.text(r.geboekt == null ? '—' : `${urenLabel(r.geboekt)} u`, kolGeboekt, y)

    // Twee toelichtende cellen, allebei klein en grijs: het venster waar de
    // aanwezigheid uit volgt, en de uursoorten waar de arbeidsuren uit volgen.
    // Samen getekend zodat de lettergrootte maar één keer heen en weer gaat.
    doc.setFontSize(7); doc.setTextColor(120, 128, 134)
    // Je moet kunnen navertellen waar "7u41" vandaan komt, maar het venster is
    // niet het getal zelf — vandaar kleiner dan de kolom ernaast.
    doc.text(r.aankomst && r.vertrek ? `${r.aankomst}–${r.vertrek}` : '—', kolVenster, y)
    // De uursoorten verklaren de geboekte uren ("6,0 normaal · 2,0 verlof"): dat
    // is precies wat een signaal verklaart of juist niet. Te lang voor de
    // kolombreedte wordt hij afgekapt; de volledige tekst staat op het scherm en
    // in de Excel-export.
    doc.text(pasIn(r.uursoorten ?? '—', uursoortBreedte), kolUursoort, y)

    doc.setFontSize(7.5)
    const st = dagStatus(r)
    doc.text(STATUS_LABEL[st] ?? st, margeR, y, { align: 'right' })

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
    'Ritten die bij elkaar horen tellen als een aankomst of vertrek. "Geboekt" zijn alle uren die die dag in Bouw7 zijn geschreven; een streepje betekent dat ze niet opgehaald konden worden.',
    '"Venster" is de tijd tussen de aankomst op het werk en het vertrek naar huis; "Aanwezig" is dat venster min de pauzes uit het rooster. "Arbeidsuren" zijn alleen de geschreven uren die als werk gelden — vakantie, ziek, feestdag, verlof en opgenomen tijd voor tijd tellen daar niet in mee. "Saldo" is aanwezig min arbeidsuren.',
    'Een streepje bij Aanwezig of Saldo betekent dat de dag niet te meten was, niet dat er niet gewerkt is: dat gebeurt als er maar één ritketen bekend is, of als de medewerker die dag niet met de bedrijfsauto reed (meegereden, op de fiets, of de hele dag op één adres). Zulke dagen tellen niet mee in het saldo hierboven.',
    'De kolom "Tijd voor tijd" is het saldo van die dag dat als tijd voor tijd is vastgelegd. Dat is een afspraak in EVA en geen urenboeking: er is niets in Bouw7 gewijzigd. Zulke dagen tellen niet meer mee in het saldo hierboven.',
    'Een saldo is geen oordeel. Zowel een plus als een min kan een goede verklaring hebben; het getal is bedoeld als begin van een gesprek, niet als uitkomst ervan.',
    'Regels met status "Verklaard" staan er ter informatie bij en tellen niet mee in de afwijkingstotalen.',
  ]
  if (saldoTotaal && saldoTotaal.overgeslagen > 0) {
    voetnoten.push(
      `${saldoTotaal.overgeslagen} van de dagen hierboven tellen niet mee in het saldo omdat de aanwezigheid of de arbeidsuren van die dag ontbreken.`,
    )
  }
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
