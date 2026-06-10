/**
 * quote-renderer.ts
 *
 * Rendert een offerte als volledige HTML-pagina via Handlebars templates.
 * De HTML wordt daarna door Puppeteer omgezet naar PDF.
 *
 * Template variabelen (beschikbaar in {{...}}):
 *   offerte.*       - hoofdvelden van de offerte
 *   klant.*         - klantgegevens
 *   bedrijf.*       - bedrijfsgegevens (uit Supabase of localStorage)
 *   secties[]       - secties met regels
 *   normale_secties[] - secties excl. opties
 *   optie_secties[] - alleen optie-secties
 *   stelpost_regels[] - alle stelpost-regels plat
 *   voorwaarden     - voorwaardentekst
 *   uitsluitingen   - uitsluitingstekst
 *   opmerkingen     - opmerkingtekst
 *   totalen.*       - berekende totalen
 *   layout.*        - layout-instellingen (kleur, lettertype etc.)
 *
 * Helpers:
 *   {{euro bedrag}}         → € 1.234,56
 *   {{datum iso-string}}    → 15 januari 2024
 *   {{#if_heeft_detail sectie}} ... {{/if_heeft_detail}}
 *   {{#each_regel sectie}}  → itereert over regels
 */

import Handlebars from 'handlebars'
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
  return '€\u00a0' + num.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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
      display_naam: s.nummer ? `${s.nummer}\u00a0\u00a0${s.naam}` : s.naam,
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

// ─── Handlebars setup ─────────────────────────────────────────────────────────

// Registreer helpers één keer
let helpersRegistered = false

function ensureHelpers() {
  if (helpersRegistered) return
  helpersRegistered = true

  // {{euro waarde}} — al geformatteerd in context, maar handig voor directe waardes
  Handlebars.registerHelper('euro', (n: number) => euro(Number(n) || 0))

  // {{datum iso}} — datum formatteren
  Handlebars.registerHelper('datum', (iso: string) => datumNL(iso))

  // {{#if_truthy waarde}} ... {{/if_truthy}}
  Handlebars.registerHelper('if_truthy', function(this: unknown, val: unknown, options: Handlebars.HelperOptions) {
    return val ? options.fn(this) : options.inverse(this)
  })

  // {{#if_eq a b}} ... {{/if_eq}}
  Handlebars.registerHelper('if_eq', function(this: unknown, a: unknown, b: unknown, options: Handlebars.HelperOptions) {
    return a === b ? options.fn(this) : options.inverse(this)
  })

  // {{#if_gt a b}} ... {{/if_gt}} (greater than)
  Handlebars.registerHelper('if_gt', function(this: unknown, a: number, b: number, options: Handlebars.HelperOptions) {
    return Number(a) > Number(b) ? options.fn(this) : options.inverse(this)
  })

  // {{nl2br tekst}} — newlines naar <br>
  Handlebars.registerHelper('nl2br', (text: string) => {
    if (!text) return ''
    return new Handlebars.SafeString(String(text).replace(/\n/g, '<br>'))
  })

  // {{raw tekst}} — HTML veilig doorgeven (al gesaneerd in context)
  Handlebars.registerHelper('raw', (text: string) => new Handlebars.SafeString(text ?? ''))
}

// ─── Render functie ───────────────────────────────────────────────────────────

/**
 * Rendert een Handlebars HTML template naar volledige HTML string.
 * Wrappet automatisch in een complete HTML-pagina met print CSS als
 * de template geen <html> tag bevat.
 */
// ─── CalcBlok kolom-definities ────────────────────────────────────────────────

const CALC_KOLOM_DEF: Record<string, { label: string; v: string; align?: string }> = {
  omschrijving: { label: 'Omschrijving', v: '{{omschrijving}}' },
  eenheid:      { label: 'Eenheid',      v: '{{eenheid}}',           align: 'center' },
  aantal:       { label: 'Aantal',       v: '{{aantal}}',            align: 'right' },
  prijs:        { label: 'Prijs p/e',    v: '{{eenheids_prijs_fmt}}',align: 'right' },
  totaal:       { label: 'Totaal',       v: '{{totaal_prijs_fmt}}',  align: 'right' },
  btw:          { label: 'BTW %',        v: '{{btw_pct}}%',          align: 'center' },
  marge:        { label: 'Marge %',      v: '{{marge_pct}}%',        align: 'center' },
}

/**
 * Vervangt <div data-calc-blok="..."> placeholders door de volledige Handlebars tabeltemplate.
 * Wordt aangeroepen VÓÓR Handlebars-compilatie.
 */
function preprocessCalcBlokken(template: string): string {
  return template.replace(
    /<div[^>]*data-calc-blok="([^"]*)"[^>]*>[\s\S]*?<\/div>/g,
    (_, kolomStr: string) => {
      const kols = kolomStr.split(',').map(s => s.trim()).filter(Boolean)
      const thStyle = 'padding:6px 10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:0.85em;font-weight:600;text-align:left;'
      const tdStyle = (align?: string) => `padding:6px 10px;border:1px solid #e2e8f0;vertical-align:top;${align ? `text-align:${align};` : ''}`
      const headers = kols.map(k => `<th style="${thStyle}">${CALC_KOLOM_DEF[k]?.label ?? k}</th>`).join('')
      const cells   = kols.map(k => `<td style="${tdStyle(CALC_KOLOM_DEF[k]?.align)}">${CALC_KOLOM_DEF[k]?.v ?? ''}</td>`).join('')
      return `{{#each normale_secties}}<h3 style="font-size:1.1em;font-weight:600;margin:1em 0 0.4em;">{{naam}}</h3><table style="width:100%;border-collapse:collapse;margin-bottom:1em;"><thead><tr>${headers}</tr></thead><tbody>{{#each this.regels}}<tr>${cells}</tr>{{/each}}</tbody></table>{{/each}}`
    },
  )
}

export function renderQuoteHtml(
  templateHtml: string,
  context: RenderContext,
): string {
  ensureHelpers()

  // Vervang CalcBlok-placeholders door echte Handlebars-templates
  templateHtml = preprocessCalcBlokken(templateHtml)

  const compiled = Handlebars.compile(templateHtml, { noEscape: false })
  const body = compiled(context)

  // Als de template al een volledige HTML-pagina is, stuur direct terug
  if (body.trim().toLowerCase().startsWith('<!doctype') || body.trim().toLowerCase().startsWith('<html')) {
    return body
  }

  // Wrap in standaard HTML-shell met print-geoptimaliseerde CSS
  const { layout } = context
  const pageW = layout.papier_formaat === 'A3' ? '297mm' : '210mm'
  const pageH = layout.papier_formaat === 'A3'
    ? (layout.papier_orientatie === 'landscape' ? '420mm' : '297mm')
    : (layout.papier_orientatie === 'landscape' ? '297mm' : '210mm')

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    html, body {
      font-family: ${layout.lettertype};
      font-size: ${layout.lettergrootte}pt;
      color: #1e293b;
      background: white;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    p { margin-bottom: 0.75em; }
    p:last-child { margin-bottom: 0; }
    ul, ol { padding-left: 1.5em; margin-bottom: 0.75em; }
    li { margin-bottom: 0.25em; }
    h1 { font-size: 1.6em; font-weight: 700; margin: 0.8em 0 0.4em; }
    h2 { font-size: 1.3em; font-weight: 700; margin: 0.8em 0 0.4em; }
    h3 { font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
    h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
    @media print {
      @page {
        size: ${pageW} ${pageH};
        margin: 0;
      }
      .offerte-pagina {
        padding: ${layout.marge_boven}mm ${layout.marge_rechts}mm ${layout.marge_onder}mm ${layout.marge_links}mm;
      }
      .page-break,
      [data-page-break="true"],
      .wysiwyg-page-break { break-before: page; page-break-before: always; }
      .no-print { display: none !important; }
      .shell-footer { position: fixed; bottom: ${layout.marge_onder}mm; left: ${layout.marge_links}mm; right: ${layout.marge_rechts}mm; font-size: 8pt; color: #64748b; }
    }
    @media screen {
      body { background: #e5e7eb; padding: 20px; }
      .offerte-pagina {
        width: ${pageW};
        min-height: ${pageH};
        background: white;
        margin: 0 auto 20px;
        padding: ${layout.marge_boven}mm ${layout.marge_rechts}mm ${layout.marge_onder}mm ${layout.marge_links}mm;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
      }
      .page-break,
      [data-page-break="true"],
      .wysiwyg-page-break { border-top: 4px dashed #94a3b8; margin: 4px 0; height: 0; overflow: hidden; }
      .shell-footer { margin-top: 10mm; padding-top: 2mm; border-top: 1px solid #e2e8f0; font-size: 8pt; color: #64748b; width: ${pageW}; margin-left: auto; margin-right: auto; padding-left: ${layout.marge_links}mm; padding-right: ${layout.marge_rechts}mm; }
    }
  </style>
</head>
<body>
${body}${layout.footer_html ? `\n<div class="shell-footer">${layout.footer_html}</div>` : ''}
</body>
</html>`
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
