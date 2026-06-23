/**
 * quote-renderer.ts
 *
 * Bouwt de render-context voor een offerte: alle variabelen die in een Word-
 * template (.docx) via docxtemplater beschikbaar zijn. De daadwerkelijke render
 * naar .docx/PDF gebeurt in `render-quote-docx.ts`.
 *
 * Beschikbare variabelen (in {tag}):
 *   offerte.*       - hoofdvelden van de offerte
 *   klant.*         - klantgegevens
 *   bedrijf.*       - bedrijfsgegevens
 *   secties[]       - secties met regels
 *   normale_secties[] - secties excl. opties
 *   optie_secties[] - alleen optie-secties
 *   stelpost_regels[] - alle stelpost-regels plat
 *   voorwaarden / uitsluitingen / opmerkingen
 *   totalen.*       - berekende totalen
 *   layout.*        - layout-instellingen
 */

import type { Quote, QuoteSection, QuoteLine } from './types-quotes'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BedrijfContext {
  naam: string
  adres?: string
  postcode_plaats?: string
  telefoon?: string
  email?: string
  website?: string
  kvk?: string
  btw?: string
  iban?: string
  logo_url?: string
}

export interface LayoutContext {
  primaire_kleur: string
  secundaire_kleur: string
  accent_kleur: string
  kleur_niveau_2: string
  kleur_niveau_3: string
  lettertype: string
  lettergrootte: number
  marge_boven: number
  marge_onder: number
  marge_links: number
  marge_rechts: number
  toon_voorblad: boolean
  toon_specificatie: boolean
  toon_voorwaarden: boolean
  toon_paginanummer: boolean
  voettekst: string
  koptekst: string
  footer_html: string
  papier_formaat: 'A4' | 'A3'
  papier_orientatie: 'portrait' | 'landscape'
}

export interface RenderContext {
  offerte: {
    nummer: string
    titel: string
    datum: string        // formatted
    datum_iso: string    // raw ISO
    geldig_tot: string   // formatted
    geldig_tot_iso: string
    referentie: string
    contactpersoon: string
    aanhef: string
    inleiding: string
    slottekst: string
    status: string
    type: string
    is_intern: boolean
    betalingscondities: string
  }
  klant: {
    naam: string
    bedrijfsnaam: string
    bedrijf_of_naam: string  // bedrijfsnaam ?? naam
    adres: string
    postcode: string
    plaats: string
    postcode_plaats: string
    email: string
    telefoon: string
  }
  bedrijf: BedrijfContext
  secties: SectieContext[]
  normale_secties: SectieContext[]
  normale_secties_niveau1: SectieContext[]
  normale_secties_niveau2: SectieContext[]
  normale_secties_niveau3: SectieContext[]
  optie_secties: SectieContext[]
  stelpost_regels: StelpostContext[]
  behandelingen_overzicht: string[]
  heeft_stelposten: boolean
  heeft_opties: boolean
  heeft_terms: boolean
  heeft_behandelingen: boolean
  voorwaarden: string
  uitsluitingen: string
  opmerkingen: string
  totalen: {
    subtotaal: string          // formatted
    subtotaal_raw: number
    btw_pct: number
    btw_bedrag: string         // formatted
    btw_bedrag_raw: number
    totaal: string             // formatted
    totaal_raw: number
    stelposten_subtotaal: string
    stelposten_subtotaal_raw: number
    stelposten_in_totaal: boolean
    opties_subtotaal: string
    opties_subtotaal_raw: number
  }
  layout: LayoutContext
}

interface SectieContext {
  id: string
  naam: string
  display_naam: string      // "1.2  Metselwerk"
  nummer: string
  discipline: string
  niveau: number
  subtotaal: string         // formatted
  subtotaal_raw: number
  toon_detail: boolean
  is_optioneel: boolean
  is_stelpost_sectie: boolean
  regels: RegelContext[]
  heeft_regels: boolean
  aantal_regels: number
}

interface RegelContext {
  id: string
  omschrijving: string
  omschrijving_volledig: string  // omschrijving + \n + werkomschrijving (indien gevuld)
  hoeveelheid: string       // formatted number
  eenheid: string
  eenheidsprijs: string     // formatted
  eenheidsprijs_raw: number
  totaal: string            // formatted
  totaal_raw: number
  btw_pct: number           // BTW percentage bijv. 21
  is_stelpost: boolean
  opmerking: string
  werkomschrijving: string  // alias voor opmerking (uitgebreide werkomschrijving)
  heeft_opmerking: boolean
  schilderbehandeling: string
  heeft_schilderbehandeling: boolean
  // intern
  kostprijs: string
  uren: string
  marge_pct: string
}

interface StelpostContext {
  omschrijving: string
  sectie_naam: string
  totaal: string
  totaal_raw: number
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function euro(n: number | null | undefined): string {
  const num = n == null ? 0 : Number(n)
  if (isNaN(num)) return '—'
  return '€ ' + num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function datumNL(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function numNL(n: number | null | undefined, dec = 3): string {
  const num = n == null ? 0 : Number(n)
  if (isNaN(num)) return '—'
  return num.toLocaleString('nl-NL', { maximumFractionDigits: dec })
}

// ─── Context builder ─────────────────────────────────────────────────────────

export function buildRenderContext(
  quote: Quote,
  bedrijf: BedrijfContext,
  layout: LayoutContext,
): RenderContext {
  const sections = quote.sections ?? []
  const terms = quote.terms ?? []
  const isIntern = quote.type === 'interne_calculatie'

  function mapRegel(line: QuoteLine): RegelContext {
    const kp = line.kostprijs_pe ?? 0
    const vp = line.eenheidsprijs
    const marge = kp > 0 ? ((vp - kp) / vp * 100) : null
    return {
      id: line.id,
      omschrijving: line.omschrijving,
      omschrijving_volledig: line.opmerking
        ? `${line.omschrijving}\n${line.opmerking}`
        : line.omschrijving,
      hoeveelheid: numNL(line.hoeveelheid),
      eenheid: line.eenheid,
      eenheidsprijs: euro(line.eenheidsprijs),
      eenheidsprijs_raw: line.eenheidsprijs,
      totaal: euro(line.line_total),
      totaal_raw: line.line_total,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      btw_pct: (line as any).btw_pct ?? 21,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_stelpost: (line as any).is_stelpost ?? false,
      opmerking: line.opmerking ?? '',
      werkomschrijving: line.opmerking ?? '',
      heeft_opmerking: !!line.opmerking,
      schilderbehandeling: line.schilderbehandeling ?? '',
      heeft_schilderbehandeling: !!line.schilderbehandeling,
      kostprijs: kp > 0 ? euro(kp) : '—',
      uren: line.uren_pe != null ? numNL(line.uren_pe) : '—',
      marge_pct: marge != null ? marge.toFixed(1) + '%' : '—',
    }
  }

  function mapSectie(s: QuoteSection): SectieContext {
    const regels = (s.lines ?? []).map(mapRegel)
    return {
      id: s.id,
      naam: s.naam,
      display_naam: s.nummer ? `${s.nummer}  ${s.naam}` : s.naam,
      nummer: s.nummer ?? '',
      discipline: s.discipline ?? '',
      niveau: s.niveau,
      subtotaal: euro(s.subtotaal),
      subtotaal_raw: s.subtotaal,
      toon_detail: s.toon_detail,
      is_optioneel: s.is_optioneel,
      is_stelpost_sectie: regels.some(r => r.is_stelpost),
      regels,
      heeft_regels: regels.length > 0,
      aantal_regels: regels.length,
    }
  }

  const secties = sections.map(mapSectie)
  const normale_secties = secties.filter(s => !s.is_optioneel && s.regels.length > 0)
  const normale_secties_niveau1 = normale_secties.filter(s => s.niveau === 1)
  const normale_secties_niveau2 = normale_secties.filter(s => s.niveau === 2)
  const normale_secties_niveau3 = normale_secties.filter(s => s.niveau === 3)
  const optie_secties = secties.filter(s => s.is_optioneel && s.regels.length > 0)

  const stelpost_regels: StelpostContext[] = []
  for (const s of normale_secties) {
    for (const r of s.regels) {
      if (r.is_stelpost) {
        stelpost_regels.push({
          omschrijving: r.omschrijving,
          sectie_naam: s.naam,
          totaal: r.totaal,
          totaal_raw: r.totaal_raw,
        })
      }
    }
  }

  // Deduplicated schilderbehandeling descriptions across all secties
  const behandelingenSet = new Set<string>()
  for (const s of secties) {
    for (const r of s.regels) {
      if (r.schilderbehandeling) behandelingenSet.add(r.schilderbehandeling)
    }
  }
  const behandelingen_overzicht = Array.from(behandelingenSet)

  const voorwaarden   = terms.find(t => t.type === 'voorwaarden')?.inhoud   ?? ''
  const uitsluitingen = terms.find(t => t.type === 'uitsluitingen')?.inhoud ?? ''
  const opmerkingen   = terms.find(t => t.type === 'opmerkingen')?.inhoud   ?? ''

  const klant = quote.client
  const postcode_plaats = [klant?.postcode, klant?.plaats].filter(Boolean).join(' ')

  return {
    offerte: {
      nummer: quote.quote_nummer,
      titel: quote.titel,
      datum: datumNL(quote.datum),
      datum_iso: quote.datum,
      geldig_tot: datumNL(quote.geldig_tot),
      geldig_tot_iso: quote.geldig_tot ?? '',
      referentie: quote.referentie ?? '',
      contactpersoon: quote.contactpersoon ?? '',
      aanhef: quote.aanhef,
      inleiding: quote.inleiding ?? '',
      slottekst: quote.slottekst ?? '',
      status: quote.status,
      type: quote.type,
      is_intern: isIntern,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      betalingscondities: (quote as any).betalingsconditie?.tekst ?? '',
    },
    klant: {
      naam: klant?.naam ?? '',
      bedrijfsnaam: klant?.bedrijfsnaam ?? '',
      bedrijf_of_naam: klant?.bedrijfsnaam ?? klant?.naam ?? '',
      adres: klant?.adres ?? '',
      postcode: klant?.postcode ?? '',
      plaats: klant?.plaats ?? '',
      postcode_plaats,
      email: klant?.email ?? '',
      telefoon: klant?.telefoon ?? '',
    },
    bedrijf,
    secties,
    normale_secties,
    normale_secties_niveau1,
    normale_secties_niveau2,
    normale_secties_niveau3,
    optie_secties,
    stelpost_regels,
    behandelingen_overzicht,
    heeft_stelposten: stelpost_regels.length > 0,
    heeft_opties: optie_secties.length > 0,
    heeft_behandelingen: behandelingen_overzicht.length > 0,
    heeft_terms: !!(voorwaarden || uitsluitingen || opmerkingen),
    voorwaarden,
    uitsluitingen,
    opmerkingen,
    totalen: {
      subtotaal: euro(quote.subtotaal_ex_btw),
      subtotaal_raw: quote.subtotaal_ex_btw,
      btw_pct: quote.btw_pct,
      btw_bedrag: euro(quote.btw_bedrag),
      btw_bedrag_raw: quote.btw_bedrag,
      totaal: euro(quote.totaal_inc_btw),
      totaal_raw: quote.totaal_inc_btw,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_subtotaal: euro((quote as any).stelposten_subtotaal ?? 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_subtotaal_raw: Number((quote as any).stelposten_subtotaal ?? 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stelposten_in_totaal: (quote as any).stelposten_in_totaal ?? true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opties_subtotaal: euro((quote as any).opties_subtotaal ?? 0),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      opties_subtotaal_raw: Number((quote as any).opties_subtotaal ?? 0),
    },
    layout,
  }
}

// ─── Standaard layout context ─────────────────────────────────────────────────

export const STANDAARD_LAYOUT: LayoutContext = {
  primaire_kleur: '#1a56db',
  secundaire_kleur: '#f8fafc',
  accent_kleur: '#009439',
  kleur_niveau_2: '#475569',
  kleur_niveau_3: '#e2e8f0',
  lettertype: 'system-ui, -apple-system, sans-serif',
  lettergrootte: 10,
  marge_boven: 15,
  marge_onder: 15,
  marge_links: 18,
  marge_rechts: 18,
  toon_voorblad: true,
  toon_specificatie: true,
  toon_voorwaarden: true,
  toon_paginanummer: true,
  voettekst: 'Pagina {{paginanummer}} van {{totaal_paginas}}',
  koptekst: '',
  footer_html: '',
  papier_formaat: 'A4',
  papier_orientatie: 'portrait',
}

export const BEDRIJF_FALLBACK: BedrijfContext = {
  naam: 'Everts Groep B.V.',
  adres: 'Voorbeeldstraat 1',
  postcode_plaats: '1234 AB Amstelveen',
  telefoon: '020-1234567',
  email: 'info@evertsgroep.nl',
  website: 'www.evertsgroep.nl',
  kvk: '12345678',
  btw: 'NL123456789B01',
  iban: 'NL00 BANK 0000 0000 00',
}
