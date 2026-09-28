import 'server-only'
import jsPDF from 'jspdf'
import { laadPdfAfzender } from '@/lib/pdf/afzender'
import { laadPdfLogo } from '@/lib/pdf/logo'
import { registreerMontserrat } from '@/lib/pdf/montserrat'
import { veilig } from '@/lib/pdf/tekst'
import {
  HANDLEIDING_HOOFDSTUKKEN, HANDLEIDING_ONDERTITEL, HANDLEIDING_TITEL,
  type HandleidingBlok, type HandleidingHoofdstuk,
} from './inhoud'

/**
 * De mobiele handleiding als PDF.
 *
 * Waarom papier naast het scherm: deze uitdraai gaat mee als bijlage bij de uitnodigingsmail. Op
 * dat moment heeft de ontvanger nog geen account en dus geen enkele manier om in EVA te kijken —
 * een link naar een scherm in de app zou hem precies daar naartoe sturen waar hij nog niet in kan.
 *
 * Opbouw en maatvoering volgen `lib/handboek/pdf.ts`; dat is dezelfde soort uitdraai voor dezelfde
 * lezer, en twee verschillende vellen in dezelfde tas zien er slordig uit. Ook hier geldt dat
 * Montserrat een Latin-1-subset is: elke string moet door `tk()`, anders vallen de krul-apostrof
 * in "foto's" en het beletselteken in "Wat te doen bij..." stil weg.
 */

/** Tekst klaar voor de letter; zie lib/handboek/pdf.ts voor het waarom van het minteken. */
function tk(tekst: unknown): string {
  return veilig(String(tekst ?? '').replace(/−/g, '-'))
}

const MARGE = 18
const REGEL = 5.2

export async function bouwMobieleHandleidingPdf(): Promise<{
  bytes: Uint8Array
  bestandsnaam: string
}> {
  const afzender = await laadPdfAfzender()
  const logo = await laadPdfLogo(afzender.logoUrl)
  const bedrijf = afzender.naam ?? 'Everts'

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  registreerMontserrat(doc)

  const breedte = doc.internal.pageSize.getWidth()
  const hoogte = doc.internal.pageSize.getHeight()
  const tekstBreedte = breedte - MARGE * 2
  const onderMarge = hoogte - MARGE - 8

  let y = MARGE

  function font(stijl: 'normal' | 'semibold' | 'bold', grootte: number, grijs = 30) {
    doc.setFont('Montserrat', stijl)
    doc.setFontSize(grootte)
    doc.setTextColor(grijs, grijs + 5, grijs + 8)
  }

  function nieuwePagina() {
    doc.addPage()
    y = MARGE
  }

  function ruimte(benodigd: number) {
    if (y + benodigd > onderMarge) nieuwePagina()
  }

  function alinea(
    tekst: string,
    opties?: { stijl?: 'normal' | 'semibold' | 'bold'; grootte?: number; inspring?: number; na?: number },
  ) {
    const grootte = opties?.grootte ?? 9.5
    const inspring = opties?.inspring ?? 0
    font(opties?.stijl ?? 'normal', grootte)
    const regels: string[] = doc.splitTextToSize(tk(tekst), tekstBreedte - inspring)
    for (const regel of regels) {
      // Per regel en niet per alinea: anders springt een lange alinea die net niet meer past in
      // zijn geheel naar de volgende pagina en blijft er een half vel leeg achter.
      ruimte(REGEL)
      doc.text(regel, MARGE + inspring, y)
      y += REGEL
    }
    y += opties?.na ?? 2
  }

  /**
   * Een opsommings- of stapregel: het bolletje of het nummer staat links van de tekst, en de
   * vervolgregels lijnen uit onder de tekst en niet onder het bolletje. Dat is het verschil tussen
   * een leesbare lijst en een blok waarin je de regels niet meer uit elkaar houdt.
   */
  function opsomRegel(merk: string, tekst: string, grootte = 9.5) {
    const inspringTekst = 7
    font('normal', grootte)
    const regels: string[] = doc.splitTextToSize(tk(tekst), tekstBreedte - inspringTekst)
    regels.forEach((regel, n) => {
      ruimte(REGEL)
      if (n === 0) {
        font('semibold', grootte, 60)
        doc.text(tk(merk), MARGE + 1, y)
        font('normal', grootte)
      }
      doc.text(regel, MARGE + inspringTekst, y)
      y += REGEL
    })
    y += 1
  }

  function tekenBlok(blok: HandleidingBlok) {
    switch (blok.type) {
      case 'kop':
        // Een kop mag niet alleen onderaan een vel achterblijven. Reserveer daarom niet alleen de
        // kop zelf maar ook de eerste drie regels van wat eronder komt: anders lees je "Op je
        // beginscherm zetten" met één zin, en staan de stappen op het volgende vel. Drie regels is
        // de gangbare ondergrens en genoeg om te zien waar het heen gaat.
        ruimte(16 + REGEL * 3)
        y += 3
        alinea(blok.tekst, { stijl: 'semibold', grootte: 11, na: 1.5 })
        break

      case 'tekst':
        alinea(blok.tekst, { na: 3 })
        break

      case 'lijst':
        for (const item of blok.items) opsomRegel('-', item)
        y += 2
        break

      case 'stappen':
        blok.items.forEach((item, n) => opsomRegel(`${n + 1}.`, item))
        y += 2
        break

      case 'let-op':
        ruimte(REGEL * 2)
        alinea(`Let op - ${blok.tekst}`, { stijl: 'semibold', grootte: 9.5, na: 3 })
        break
    }
  }

  function tekenHoofdstuk(h: HandleidingHoofdstuk) {
    nieuwePagina()
    font('bold', 16, 20)
    for (const regel of doc.splitTextToSize(tk(h.titel), tekstBreedte) as string[]) {
      doc.text(regel, MARGE, y)
      y += 7
    }
    y += 2
    if (h.intro) alinea(h.intro, { grootte: 9.5, na: 4 })
    for (const blok of h.blokken) tekenBlok(blok)
  }

  // ── Titelblad ────────────────────────────────────────────────────────
  if (logo) {
    const b = 46
    const h = (logo.hoogte / logo.breedte) * b
    try { doc.addImage(logo.dataUrl, logo.format, MARGE, y, b, h, undefined, 'FAST') } catch { /* logo is optioneel */ }
    y += h + 26
  } else {
    y += 20
  }

  font('bold', 26, 20)
  doc.text(tk(HANDLEIDING_TITEL), MARGE, y)
  y += 12

  font('normal', 12, 90)
  doc.text(tk(HANDLEIDING_ONDERTITEL), MARGE, y)
  y += 8
  doc.text(tk(bedrijf), MARGE, y)
  y += 14

  font('normal', 9.5, 130)
  const voorbehoud =
    'EVA verandert mee met het werk, dus schermen kunnen er net iets anders uitzien dan hier '
    + 'beschreven. Bij verschil geldt wat er in de app staat. Kom je er niet uit, bel dan kantoor.'
  for (const regel of doc.splitTextToSize(tk(voorbehoud), tekstBreedte) as string[]) {
    doc.text(regel, MARGE, y)
    y += REGEL
  }

  // ── Inhoudsopgave ────────────────────────────────────────────────────
  nieuwePagina()
  font('bold', 15, 20)
  doc.text(tk('Inhoud'), MARGE, y)
  y += 10

  for (const h of HANDLEIDING_HOOFDSTUKKEN) {
    ruimte(REGEL)
    font('normal', 10, 45)
    doc.text(tk(h.titel), MARGE, y)
    y += REGEL + 1.5
  }

  // ── Hoofdstukken ─────────────────────────────────────────────────────
  for (const h of HANDLEIDING_HOOFDSTUKKEN) tekenHoofdstuk(h)

  // ── Voettekst op elke pagina behalve het titelblad ────────────────────
  const paginas = doc.getNumberOfPages()
  for (let p = 2; p <= paginas; p++) {
    doc.setPage(p)
    font('normal', 8, 140)
    doc.text(tk(`${HANDLEIDING_TITEL} - ${bedrijf}`), MARGE, hoogte - 10)
    doc.text(`${p - 1} / ${paginas - 1}`, breedte - MARGE, hoogte - 10, { align: 'right' })
  }

  // Alleen letters, cijfers, spatie, punt en streepje: dit wordt een bestandsnaam op een telefoon
  // én de naam van een mailbijlage.
  const bestandsnaam = `${HANDLEIDING_TITEL} - ${HANDLEIDING_ONDERTITEL}.pdf`.replace(/[^\w\s.-]/g, '')
  return { bytes: new Uint8Array(doc.output('arraybuffer')), bestandsnaam }
}
