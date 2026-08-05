/**
 * bestelling-pdf.ts
 *
 * Genereert de order-/contract-PDF die naar de leverancier gaat, rechtstreeks met pdf-lib.
 *
 * Waarom in code en niet via het Word-sjabloonpad (zoals offertes/documenten): Bouw7 levert géén
 * order-PDF die EVA kan ophalen (de `files`/`attachments`-endpoints geven leeg), en een
 * inkooporder is een gestandaardiseerd, tekstueel document — geen sjabloon dat de business per
 * dossier wil aanpassen. Zo hoeft er geen `.docx` ontworpen te worden en is het volledig in code
 * beheersbaar. Het Everts-briefpapier komt er onder via hetzelfde `mergeBriefpapierBackground` als
 * bij de offerte, zodat de huisstijl-kop klopt.
 */

import 'server-only'

export type BestellingPdfRegel = {
  omschrijving: string
  aantal: string
  eenheid: string
  stukprijs: number
  bedrag: number
}

export type BestellingPdfData = {
  soort: 'inkooporder' | 'oa_contract'
  /** Bouw7-contract-/ordernummer, bv. "20261.00357OA002". */
  documentnummer: string
  /** Weergavedatum, bv. "05-08-2026". */
  datum: string
  leverancier: { naam: string; adres?: string | null; postcodePlaats?: string | null }
  project: { nummer?: string | null; naam?: string | null; werkadres?: string | null }
  regels: BestellingPdfRegel[]
  totaal: number
  isWinkel: boolean
  leverdatum?: string | null
  betaalafspraak?: string | null
  notitie?: string | null
  /** Naam van de medewerker die de order verstuurt. */
  afzender: string
  /** Bedrijfsnaam voor de kop als er géén briefpapier is. */
  bedrijfsnaam?: string
}

const euro = (n: number) =>
  '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Bouwt de order-PDF (A4). Laat bovenaan ruimte vrij voor het briefpapier (dat er later onder
 * wordt gemerged) en tekent daaronder de order-inhoud.
 */
export async function genereerBestellingPdf(
  data: BestellingPdfData,
  briefpapier?: Buffer | Uint8Array | null,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)

  const A4 = { w: 595.28, h: 841.89 }
  const marge = 56
  const contentBreedte = A4.w - marge * 2
  const kleurTekst = rgb(0.13, 0.13, 0.15)
  const kleurGrijs = rgb(0.45, 0.45, 0.48)
  const kleurLijn = rgb(0.85, 0.86, 0.88)

  const heeftBriefpapier = !!briefpapier
  let page = doc.addPage([A4.w, A4.h])
  // Met briefpapier: ruimte vrijlaten voor de gedrukte kop. Zonder briefpapier: zelf een
  // eenvoudige bedrijfskop tekenen, anders staat de order in een leeg vlak.
  let y = A4.h - (heeftBriefpapier ? 170 : 64)

  const nieuwePagina = () => { page = doc.addPage([A4.w, A4.h]); y = A4.h - 170 }
  const ruimte = (h: number) => { if (y - h < 70) nieuwePagina() }

  const tekst = (
    s: string, x: number, opties: { size?: number; font?: typeof font; kleur?: typeof kleurTekst } = {},
  ) => {
    page.drawText(s ?? '', { x, y, size: opties.size ?? 10, font: opties.font ?? font, color: opties.kleur ?? kleurTekst })
  }

  /** Breekt tekst af op woordgrens binnen `breedte`. */
  const wikkel = (s: string, f: typeof font, size: number, breedte: number): string[] => {
    const woorden = (s ?? '').split(/\s+/).filter(Boolean)
    const regels: string[] = []
    let huidig = ''
    for (const w of woorden) {
      const kandidaat = huidig ? `${huidig} ${w}` : w
      if (f.widthOfTextAtSize(kandidaat, size) > breedte && huidig) {
        regels.push(huidig); huidig = w
      } else huidig = kandidaat
    }
    if (huidig) regels.push(huidig)
    return regels.length ? regels : ['']
  }

  // ── Bedrijfskop (alleen zonder briefpapier) ──────────────────────────────
  if (!heeftBriefpapier) {
    tekst(data.bedrijfsnaam || 'Everts Onderhoudsschilders B.V.', marge, { size: 13, font: bold })
    y -= 30
  }

  // ── Titel ───────────────────────────────────────────────────────────────
  const titel = data.soort === 'oa_contract' ? 'Onderaannemersopdracht' : 'Inkooporder'
  tekst(titel, marge, { size: 18, font: bold })
  tekst(data.documentnummer, A4.w - marge - bold.widthOfTextAtSize(data.documentnummer, 12), { size: 12, font: bold, kleur: kleurGrijs })
  y -= 18
  tekst(`Datum: ${data.datum}`, marge, { size: 9, kleur: kleurGrijs })
  y -= 26

  // ── Leverancier + project, twee kolommen ─────────────────────────────────
  const kolBreedte = (contentBreedte - 24) / 2
  const yStart = y
  const blok = (x: number, kop: string, regels: (string | null | undefined)[]) => {
    y = yStart
    tekst(kop, x, { size: 8, font: bold, kleur: kleurGrijs })
    y -= 14
    for (const r of regels) {
      if (!r) continue
      for (const wr of wikkel(r, font, 10, kolBreedte)) { tekst(wr, x, { size: 10 }); y -= 13 }
    }
    return y
  }
  const yLev = blok(marge, data.soort === 'oa_contract' ? 'ONDERAANNEMER' : 'LEVERANCIER', [
    data.leverancier.naam, data.leverancier.adres, data.leverancier.postcodePlaats,
  ])
  const yProj = blok(marge + kolBreedte + 24, 'PROJECT', [
    [data.project.nummer, data.project.naam].filter(Boolean).join(' — ') || null,
    data.project.werkadres,
  ])
  y = Math.min(yLev, yProj) - 20

  // ── Regeltabel ───────────────────────────────────────────────────────────
  const kolOms = marge
  const kolAantal = marge + contentBreedte - 210
  const kolPrijs = marge + contentBreedte - 130
  const kolBedrag = marge + contentBreedte
  const omsBreedte = kolAantal - kolOms - 10
  const rechts = (s: string, rechterX: number, f: typeof font, size: number) =>
    tekst(s, rechterX - f.widthOfTextAtSize(s, size), { size, font: f })

  const kopRij = () => {
    tekst('Omschrijving', kolOms, { size: 8, font: bold, kleur: kleurGrijs })
    tekst('Aantal', kolAantal, { size: 8, font: bold, kleur: kleurGrijs })
    tekst('Stukprijs', kolPrijs, { size: 8, font: bold, kleur: kleurGrijs })
    rechts('Bedrag', kolBedrag, bold, 8)
    y -= 6
    page.drawLine({ start: { x: marge, y }, end: { x: marge + contentBreedte, y }, thickness: 0.7, color: kleurLijn })
    y -= 14
  }
  ruimte(60); kopRij()

  for (const r of data.regels) {
    const omsRegels = wikkel(r.omschrijving || '—', font, 10, omsBreedte)
    ruimte(omsRegels.length * 13 + 6)
    const yRij = y
    omsRegels.forEach((wr, i) => { y = yRij - i * 13; tekst(wr, kolOms, { size: 10 }) })
    y = yRij
    if (!data.isWinkel) {
      tekst(`${r.aantal} ${r.eenheid}`.trim(), kolAantal, { size: 10 })
      rechts(euro(r.stukprijs), kolPrijs + 60, font, 10)
    }
    rechts(euro(r.bedrag), kolBedrag, font, 10)
    y = yRij - Math.max(omsRegels.length, 1) * 13 - 4
  }

  // ── Totaal ────────────────────────────────────────────────────────────────
  ruimte(30)
  y -= 4
  page.drawLine({ start: { x: kolPrijs, y }, end: { x: marge + contentBreedte, y }, thickness: 0.7, color: kleurLijn })
  y -= 16
  tekst('Totaal (excl. btw)', kolPrijs, { size: 10, font: bold })
  rechts(euro(data.totaal), kolBedrag, bold, 10)
  y -= 28

  // ── Afspraken ─────────────────────────────────────────────────────────────
  const afspraak = (label: string, waarde?: string | null) => {
    if (!waarde) return
    ruimte(28)
    tekst(label, marge, { size: 8, font: bold, kleur: kleurGrijs })
    y -= 13
    for (const wr of wikkel(waarde, font, 10, contentBreedte)) { ruimte(14); tekst(wr, marge, { size: 10 }); y -= 13 }
    y -= 8
  }
  afspraak(data.soort === 'oa_contract' ? 'STARTDATUM' : 'LEVERDATUM', data.leverdatum)
  afspraak('BETAALAFSPRAAK', data.betaalafspraak)
  afspraak('OPMERKING', data.notitie)
  if (data.isWinkel) {
    afspraak('WINKELBUDGET',
      'Dit is een budgetreservering. Er mag tot het bovenstaande bedrag op afroep geleverd worden; ' +
      'facturering op basis van de daadwerkelijke leveringen.')
  }

  // ── Ondertekening ─────────────────────────────────────────────────────────
  ruimte(40)
  y -= 6
  tekst('Met vriendelijke groet,', marge, { size: 10 })
  y -= 15
  tekst(data.afzender, marge, { size: 10, font: bold })

  const pdf = await doc.save()
  if (!briefpapier) return pdf
  try {
    const { mergeBriefpapierBackground } = await import('../everts-calc/briefpapier')
    return await mergeBriefpapierBackground(pdf, briefpapier)
  } catch {
    return pdf
  }
}
