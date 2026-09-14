import 'server-only'
import jsPDF from 'jspdf'
import { createAdminClient } from '@everts/database/server'
import { laadPdfAfzender } from '@/lib/pdf/afzender'
import { laadPdfLogo } from '@/lib/pdf/logo'
import { registreerMontserrat } from '@/lib/pdf/montserrat'
import { veilig } from '@/lib/pdf/tekst'
import { isZichtbaar } from './kenmerken'
import type { Bijlage, Blok, Sectie } from './types'

/**
 * Het handboek als papieren versie.
 *
 * Waarom dit bestaat naast het scherm: niet iedereen heeft een account, en een
 * nieuwe medewerker krijgt bij zijn eerste dag liever iets in handen dan een
 * link. De pdf is dus geen afdruk van de webpagina maar een op zichzelf staand
 * document — met een titelblad, een inhoudsopgave en paginanummers.
 *
 * Montserrat en niet het ingebouwde Helvetica: het is de huisstijlletter en hij
 * staat er als ingesloten TTF in. Maar dat is een Latin-1-subset, dus ook hier
 * moet elke string door `veilig()`: de handboekteksten staan vol krul-apostroffen
 * ("collega's") en beletseltekens ("Wat te doen bij..."), en die vallen anders
 * stil weg of komen er als een verkeerde glyph uit. Vandaar `tk()` hieronder —
 * één plek waar alle tekst langs moet.
 */

/**
 * Tekst klaar voor de letter: krultekens worden rechte, em-dash een streepje,
 * beletselteken drie punten. Het echte minteken (U+2212) staat niet in
 * `veilig()` maar valt hier wél buiten de subset, dus dat ruilen we er zelf bij
 * om — zie lib/wagenpark/werktijden-pdf.ts, waar dat "-0,4 u" op papier uit
 * elkaar trok.
 */
function tk(tekst: unknown): string {
  return veilig(String(tekst ?? '').replace(/−/g, '-'))
}

const MARGE = 18
const REGEL = 5.2

type Onderdeel = Sectie & { blokken: Blok[] }

/** Alles wat bij deze kenmerkenset hoort, in leesvolgorde. */
async function haalVoorPdf(kenmerken: Set<string>): Promise<{
  hoofdstukken: Onderdeel[]
  situaties: Onderdeel[]
  bijlagen: Bijlage[]
}> {
  const db = createAdminClient()

  const [{ data: sr }, { data: br }, { data: jr }] = await Promise.all([
    db.from('personeelshandboek_secties')
      .select('id, slug, titel, samenvatting, icoon, volgorde, soort, zichtbaar_voor, verborgen_voor')
      .eq('status', 'gepubliceerd').order('soort').order('volgorde').limit(500),
    db.from('personeelshandboek_blokken')
      .select('id, sectie_id, volgorde, type, inhoud, zoektekst, zichtbaar_voor, verborgen_voor')
      .eq('status', 'gepubliceerd').order('sectie_id').order('volgorde').limit(2000),
    db.from('personeelshandboek_bijlagen')
      .select('id, sectie_id, titel, omschrijving, bestandsnaam, mimetype, grootte, volgorde, zichtbaar_voor, verborgen_voor')
      .eq('status', 'gepubliceerd').order('volgorde').limit(200),
  ])

  // Dezelfde filterregel als op de telefoon, alleen hier in TypeScript omdat we
  // met de admin-client lezen: de pdf moet het profiel van een ánder kunnen
  // tonen, en RLS kent alleen de ingelogde gebruiker.
  const secties = ((sr ?? []) as unknown as Sectie[]).filter((s) => isZichtbaar(s, kenmerken))
  const zichtbaar = new Set(secties.map((s) => s.id))
  const blokken = ((br ?? []) as unknown as Blok[]).filter(
    (b) => zichtbaar.has(b.sectie_id) && isZichtbaar(b, kenmerken),
  )

  const metBlokken = (soort: string) =>
    secties
      .filter((s) => s.soort === soort)
      .map((s) => ({ ...s, blokken: blokken.filter((b) => b.sectie_id === s.id) }))

  return {
    hoofdstukken: metBlokken('hoofdstuk'),
    situaties: metBlokken('situatie'),
    bijlagen: ((jr ?? []) as unknown as Bijlage[]).filter((b) => isZichtbaar(b, kenmerken)),
  }
}

export async function bouwHandboekPdf(
  kenmerken: Set<string>,
  profielNaam: string,
): Promise<{ bytes: Uint8Array; bestandsnaam: string }> {
  const [{ hoofdstukken, situaties, bijlagen }, afzender] = await Promise.all([
    haalVoorPdf(kenmerken),
    laadPdfAfzender(),
  ])
  const logo = await laadPdfLogo(afzender.logoUrl)

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

  /** Past `benodigd` mm nog op deze pagina? Zo niet: nieuwe pagina. */
  function ruimte(benodigd: number) {
    if (y + benodigd > onderMarge) nieuwePagina()
  }

  function alinea(tekst: string, opties?: { stijl?: 'normal' | 'semibold' | 'bold'; grootte?: number; inspring?: number; na?: number }) {
    const stijl = opties?.stijl ?? 'normal'
    const grootte = opties?.grootte ?? 9.5
    const inspring = opties?.inspring ?? 0
    font(stijl, grootte)
    const regels: string[] = doc.splitTextToSize(tk(tekst), tekstBreedte - inspring)
    for (const regel of regels) {
      // Per regel kijken en niet per alinea: een lange alinea die niet meer
      // past zou anders in zijn geheel naar de volgende pagina springen en een
      // half leeg vel achterlaten.
      ruimte(REGEL)
      doc.text(regel, MARGE + inspring, y)
      y += REGEL
    }
    y += opties?.na ?? 2
  }

  // ── Titelblad ──────────────────────────────────────────────────────
  if (logo) {
    const b = 46
    const h = (logo.hoogte / logo.breedte) * b
    try { doc.addImage(logo.dataUrl, logo.format, MARGE, y, b, h, undefined, 'FAST') } catch { /* logo is optioneel */ }
    y += h + 26
  } else {
    y += 20
  }

  font('bold', 26, 20)
  doc.text(tk('Medewerkershandboek'), MARGE, y)
  y += 12

  font('normal', 12, 90)
  doc.text(tk(afzender.naam ?? 'Everts'), MARGE, y)
  y += 8
  doc.text(tk(profielNaam), MARGE, y)
  y += 8
  font('normal', 9.5, 130)
  doc.text(
    tk(`Uitdraai van ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`),
    MARGE, y,
  )
  y += 14

  font('normal', 9, 130)
  const voorbehoud =
    'Deze uitdraai is een momentopname. De actuele versie staat altijd in EVA op je telefoon; ' +
    'bij verschil geldt die.'
  for (const regel of doc.splitTextToSize(tk(voorbehoud), tekstBreedte) as string[]) {
    doc.text(regel, MARGE, y)
    y += REGEL
  }

  // ── Inhoudsopgave ──────────────────────────────────────────────────
  nieuwePagina()
  font('bold', 15, 20)
  doc.text(tk('Inhoud'), MARGE, y)
  y += 10

  for (const h of hoofdstukken) {
    ruimte(REGEL)
    font('normal', 10, 45)
    doc.text(tk(h.titel), MARGE, y)
    y += REGEL + 1
  }
  if (situaties.length) {
    y += 4
    ruimte(REGEL)
    font('semibold', 10, 45)
    doc.text(tk('Wat te doen bij...'), MARGE, y)
    y += REGEL + 1
    for (const s of situaties) {
      ruimte(REGEL)
      font('normal', 10, 45)
      doc.text(tk(s.titel), MARGE + 5, y)
      y += REGEL + 1
    }
  }

  // ── Hoofdstukken ───────────────────────────────────────────────────
  for (const h of hoofdstukken) {
    nieuwePagina()
    font('bold', 16, 20)
    const kopRegels: string[] = doc.splitTextToSize(tk(h.titel), tekstBreedte)
    for (const regel of kopRegels) { doc.text(regel, MARGE, y); y += 7 }
    y += 3
    if (h.samenvatting) alinea(h.samenvatting, { grootte: 9, na: 4 })
    for (const blok of h.blokken) tekenBlok(blok)
  }

  // ── Wat te doen bij… ───────────────────────────────────────────────
  if (situaties.length) {
    nieuwePagina()
    font('bold', 20, 20)
    doc.text(tk('Wat te doen bij...'), MARGE, y)
    y += 12

    for (const s of situaties) {
      ruimte(24)
      font('bold', 13, 20)
      doc.text(tk(s.titel), MARGE, y)
      y += 7
      let nummer = 1
      for (const blok of s.blokken) {
        if (blok.type === 'stap') {
          const tekst = `${nummer++}.  ${blok.inhoud?.tekst ?? ''}`
          alinea(tekst, { inspring: 4, na: 1 })
        } else {
          tekenBlok(blok)
        }
      }
      y += 5
    }
  }

  // ── Bijlagen ───────────────────────────────────────────────────────
  if (bijlagen.length) {
    nieuwePagina()
    font('bold', 16, 20)
    doc.text(tk('Bijlagen'), MARGE, y)
    y += 10
    alinea(
      'Deze documenten horen bij het handboek. Ze zitten niet in deze uitdraai; ' +
      'je vindt ze in EVA op je telefoon of vraag ze op bij kantoor.',
      { grootte: 9, na: 5 },
    )
    for (const b of bijlagen) {
      ruimte(12)
      alinea(b.titel, { stijl: 'semibold', grootte: 10.5, na: 0 })
      if (b.omschrijving) alinea(b.omschrijving, { grootte: 9, na: 4 })
      else y += 4
    }
  }

  // ── Voettekst op elke pagina behalve het titelblad ──────────────────
  const paginas = doc.getNumberOfPages()
  for (let p = 2; p <= paginas; p++) {
    doc.setPage(p)
    font('normal', 8, 140)
    doc.text(tk(`Medewerkershandboek - ${profielNaam}`), MARGE, hoogte - 10)
    doc.text(`${p - 1} / ${paginas - 1}`, breedte - MARGE, hoogte - 10, { align: 'right' })
  }

  function tekenBlok(blok: Blok) {
    const i = blok.inhoud ?? {}
    switch (blok.type) {
      case 'kop':
        ruimte(12)
        y += 3
        alinea(i.tekst ?? '', { stijl: 'semibold', grootte: 11, na: 1 })
        break

      case 'tekst':
        alinea(i.tekst ?? '', { na: 3 })
        break

      case 'lijst': {
        const genummerd = i.stijl === 'nummer'
        ;(i.items ?? []).forEach((item: string, n: number) => {
          alinea(`${genummerd ? `${n + 1}.` : '-'}  ${item}`, { inspring: 4, na: 0.5 })
        })
        y += 2.5
        break
      }

      case 'tabel': {
        const kolommen: string[] = i.kolommen ?? []
        for (const rij of (i.rijen ?? []) as string[][]) {
          ruimte(REGEL * 2)
          alinea(rij[0] ?? '', { stijl: 'semibold', grootte: 9.5, na: 0 })
          const rest = rij.slice(1)
            .map((cel, n) => (cel ? (kolommen[n + 1] ? `${kolommen[n + 1]}: ${cel}` : cel) : ''))
            .filter(Boolean)
          if (rest.length) alinea(rest.join(' - '), { grootte: 9, inspring: 4, na: 1.5 })
          else y += 1.5
        }
        y += 2
        break
      }

      case 'let-op':
        ruimte(10)
        alinea(`Let op - ${i.tekst ?? ''}`, { stijl: 'semibold', grootte: 9.5, na: 3 })
        break

      case 'stap':
        alinea(i.tekst ?? '', { inspring: 4, na: 1 })
        break

      default:
        // afbeelding, bijlage en contact hebben op papier geen zinvolle vorm:
        // een belknop werkt niet en een bijlage staat verderop in de lijst.
        break
    }
  }

  const bestandsnaam = `Medewerkershandboek - ${profielNaam}.pdf`.replace(/[^\w\s.-]/g, '')
  return { bytes: new Uint8Array(doc.output('arraybuffer')), bestandsnaam }
}
