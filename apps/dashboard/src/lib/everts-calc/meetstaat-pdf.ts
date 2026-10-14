/**
 * De afgedrukte meetstaat als PDF: A4 liggend, Montserrat, alle groepen onder
 * elkaar met per groep de meetregels en de totalen.
 *
 * Een PDF en geen print-CSS. Twee eerdere versies lieten de browser de pagina zelf
 * afdrukken (eerst de app met print-CSS, daarna een verborgen iframe); in Safari
 * werd het scherm daarbij zwart en reageerde EVA niet meer, en kwam er bij
 * "Liggend" een leeg voorbeeld uit. Safari negeert bovendien `@page { size:
 * landscape }`. Een PDF ligt vast: liggend, overal dezelfde opmaak, en het printen
 * gebeurt in de PDF-weergave van de browser in plaats van in EVA.
 *
 * Wordt in de browser gebouwd (de meetregels staan daar) en pas bij de klik
 * geladen, zodat het ingebedde lettertype niet in de bundel van het scherm zit.
 */
import jsPDF from 'jspdf'
import { registreerMontserrat } from '@/lib/pdf/montserrat'
import type { Meetstaat } from './types'
import type { AfdrukRegel, MeetstaatAfdruk } from './meetstaat-afdruk'

/**
 * Alleen tekens die in de Montserrat-subset zitten (zie lib/pdf/montserrat.ts);
 * de rest zou als lege doos op papier komen.
 */
const veilig = (t: string) =>
  t.replace(/[^\x20-\x7E\xA0-\xFFŒœ–—‘-‚“-„•…€™]/g, '')

interface Kolom {
  kop: string
  breedte: number
  rechts?: boolean
  waarde: (r: AfdrukRegel) => string
}

// A4 liggend is 297 mm; min 2 × 12 mm marge blijft 273 mm. De opmerking krijgt
// wat overblijft: die is het langst en mag over meerdere regels lopen.
const VAST: Kolom[] = [
  { kop: '#', breedte: 7, waarde: r => String(r.nr) },
  { kop: 'Element', breedte: 32, waarde: r => r.element },
  { kop: 'Onderdeel', breedte: 34, waarde: r => r.onderdeel },
  { kop: 'Type', breedte: 30, waarde: r => r.type },
  { kop: 'Code', breedte: 22, waarde: r => r.code },
]
// Zelfde volgorde en namen als op het invoerscherm (MeetregelGrid).
const GETALLEN: Kolom[] = [
  { kop: 'B (m)', breedte: 15, rechts: true, waarde: r => r.breedte },
  { kop: 'H (m)', breedte: 15, rechts: true, waarde: r => r.hoogte },
  { kop: 'B aant.', breedte: 15, rechts: true, waarde: r => r.breedteAantal },
  { kop: 'H aant.', breedte: 15, rechts: true, waarde: r => r.hoogteAantal },
  // Koppen zoals in het invoerscherm: `factor` heet daar Aantal, `aantal` heet x.
  { kop: 'Aantal', breedte: 12, rechts: true, waarde: r => r.factor },
  { kop: 'x', breedte: 12, rechts: true, waarde: r => r.aantal },
  { kop: 'Hoeveelheid', breedte: 24, rechts: true, waarde: r => `${r.hoeveelheid}${r.handmatig ? ' *' : ''}` },
]

export function bouwMeetstaatPdf({ meetstaat, afdruk, projectNaam, projectNummer }: {
  meetstaat: Meetstaat
  afdruk: MeetstaatAfdruk
  projectNaam?: string
  projectNummer?: string
}): ArrayBuffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  registreerMontserrat(doc)
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margeL = 12
  const margeR = pageW - 12
  const onder = pageH - 16

  const vastBreed = [...VAST, ...GETALLEN].reduce((s, k) => s + k.breedte, 0)
  const kolommen: Kolom[] = [
    ...VAST,
    { kop: 'Opmerking', breedte: margeR - margeL - vastBreed, waarde: r => r.opmerking },
    ...GETALLEN,
  ]
  const xVan: number[] = []
  kolommen.reduce((x, k) => { xVan.push(x); return x + k.breedte }, margeL)

  const lettertype = (stijl: 'normal' | 'semibold' | 'bold', grootte: number, kleur: [number, number, number]) => {
    doc.setFont('Montserrat', stijl); doc.setFontSize(grootte); doc.setTextColor(...kleur)
  }
  const ZWART: [number, number, number] = [22, 27, 32]
  const GRIJS: [number, number, number] = [107, 117, 124]
  const regelH = 3.6

  // ── Kop ────────────────────────────────────────────────────────────
  let y = 14
  lettertype('normal', 7.5, GRIJS)
  doc.text('MEETSTAAT', margeL, y)
  lettertype('bold', 14, ZWART)
  doc.text(veilig(meetstaat.naam), margeL, y + 6.5)
  const project = [projectNummer, projectNaam].filter(Boolean).join(' · ')
  if (project) {
    lettertype('normal', 9.5, [54, 64, 72])
    doc.text(veilig(project), margeL, y + 12)
  }
  lettertype('normal', 8, GRIJS)
  doc.text(veilig(`${meetstaat.code} · ${meetstaat.status}`), margeR, y + 6.5, { align: 'right' })
  doc.text(
    `Afgedrukt ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    margeR, y + 11, { align: 'right' },
  )
  y += 15
  doc.setDrawColor(0, 148, 57); doc.setLineWidth(0.6); doc.line(margeL, y, margeR, y)
  doc.setLineWidth(0.2)
  y += 7

  // ── Tabel ──────────────────────────────────────────────────────────
  function tekenTabelkop() {
    lettertype('semibold', 7, [77, 87, 94])
    kolommen.forEach((k, i) => {
      const x = k.rechts ? xVan[i] + k.breedte - 1 : xVan[i] + 1
      // Hoofdletters, maar niet de eenheid: "B (m)" mag geen "B (M)" worden.
      const kop = k.kop.replace(/^[^(]+/, d => d.toUpperCase())
      doc.text(kop, x, y, { align: k.rechts ? 'right' : 'left' })
    })
    y += 1.8
    doc.setDrawColor(154, 164, 171); doc.line(margeL, y, margeR, y)
    y += 3.6
  }
  const nieuwePagina = () => { doc.addPage(); y = 14 }
  /** Loopt een groep door op een nieuwe pagina, dan zegt de kop bij welke groep de regels horen. */
  const vervolgPagina = (groepsnaam: string) => {
    nieuwePagina()
    lettertype('semibold', 9, GRIJS)
    doc.text(veilig(`${groepsnaam} (vervolg)`), margeL, y)
    y += 5
    tekenTabelkop()
  }

  if (afdruk.blokken.length === 0) {
    lettertype('normal', 10, GRIJS)
    doc.text('Deze meetstaat heeft nog geen ingevulde regels.', margeL, y)
  }

  for (const blok of afdruk.blokken) {
    // Een groepskop nooit los onderaan een pagina: kop + tabelkop + één regel moet passen.
    if (y + 16 > onder) nieuwePagina()
    lettertype('bold', blok.diepte === 0 ? 10.5 : 9.5, ZWART)
    doc.text(veilig(blok.naam), margeL + blok.diepte * 4, y)
    y += 5
    if (blok.regels.length === 0) { y += 1; continue }
    tekenTabelkop()

    for (const r of blok.regels) {
      lettertype('normal', 8, ZWART)
      const cellen = kolommen.map(k => doc.splitTextToSize(veilig(k.waarde(r)), k.breedte - 2) as string[])
      const hoogte = Math.max(1, ...cellen.map(c => c.length)) * regelH
      if (y + hoogte > onder) vervolgPagina(blok.naam)
      cellen.forEach((regels, i) => {
        const k = kolommen[i]
        const laatste = i === kolommen.length - 1
        if (i === 0) lettertype('normal', 8, GRIJS)
        else if (laatste) lettertype('semibold', 8, ZWART)
        else lettertype('normal', 8, ZWART)
        regels.forEach((regel, j) => {
          const x = k.rechts ? xVan[i] + k.breedte - 1 : xVan[i] + 1
          doc.text(regel, x, y + j * regelH, { align: k.rechts ? 'right' : 'left' })
        })
      })
      y += hoogte - regelH + 1.6
      doc.setDrawColor(227, 232, 234); doc.line(margeL, y, margeR, y)
      y += 3.6
    }

    for (const t of blok.totalen) {
      if (y + 5 > onder) vervolgPagina(blok.naam)
      doc.setFillColor(241, 244, 245); doc.rect(margeL, y - 3.4, margeR - margeL, 5.2, 'F')
      lettertype('semibold', 8, ZWART)
      doc.text(veilig(`Totaal ${t.omschrijving}`), xVan[1] + 1, y)
      lettertype('bold', 8, ZWART)
      doc.text(veilig(t.hoeveelheid), margeR - 1, y, { align: 'right' })
      y += 5.2
    }
    y += 4
  }

  if (afdruk.heeftHandmatig) {
    if (y + 5 > onder) nieuwePagina()
    lettertype('normal', 7.5, GRIJS)
    doc.text('* Hoeveelheid handmatig ingevuld, niet berekend uit de maten.', margeL, y)
  }

  // ── Voettekst op elke pagina ───────────────────────────────────────
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    lettertype('normal', 7.5, [150, 156, 161])
    doc.text(veilig(`Meetstaat ${meetstaat.code}${project ? ` · ${project}` : ''}`), margeL, pageH - 8)
    doc.text(`${p} / ${paginas}`, margeR, pageH - 8, { align: 'right' })
  }

  return doc.output('arraybuffer')
}

/** "meetstaat-MS-2026-014.pdf" */
export function meetstaatPdfBestandsnaam(meetstaat: Meetstaat): string {
  return `meetstaat-${meetstaat.code.replace(/[^a-z0-9-]/gi, '-')}.pdf`
}
