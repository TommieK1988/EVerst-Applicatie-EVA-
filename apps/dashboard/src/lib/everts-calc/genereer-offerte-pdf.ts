import 'server-only'
import { createClient } from './supabase/server'
import {
  STANDAARD_LAYOUT,
  buildRenderContext,
  type BedrijfContext,
  type DossierContext,
  type LayoutContext,
  type RenderContext,
} from './quote-renderer'
import { renderQuoteDocx, loadQuoteTemplateBuffer } from './render-quote-docx'
import { laadBedrijfEnDossier } from './offerte-bronnen'
import { convertDocxToPdf } from '@/lib/o365/docx-to-pdf'
import { fetchBriefpapier, mergeBriefpapierBackground } from './briefpapier'

export interface OffertePdfResultaat {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any
  bedrijf: BedrijfContext
  dossier: DossierContext
  ctx: RenderContext
  quoteNummer: string
  /** Offerte-PDF met briefpapier, zónder voorwaarden-append en zónder watermerk. */
  offertePdf: Uint8Array
  /** Losse algemene-voorwaarden-PDF (of null als niet gekoppeld). */
  voorwaardenPdf: Uint8Array | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapLayout(rawLayout: any): LayoutContext {
  return {
    primaire_kleur: rawLayout.primaire_kleur ?? STANDAARD_LAYOUT.primaire_kleur,
    secundaire_kleur: rawLayout.secundaire_kleur ?? STANDAARD_LAYOUT.secundaire_kleur,
    accent_kleur: rawLayout.accent_kleur ?? STANDAARD_LAYOUT.accent_kleur,
    kleur_niveau_2: rawLayout.kleur_niveau_2 ?? STANDAARD_LAYOUT.kleur_niveau_2,
    kleur_niveau_3: rawLayout.kleur_niveau_3 ?? STANDAARD_LAYOUT.kleur_niveau_3,
    lettertype: rawLayout.lettertype ?? STANDAARD_LAYOUT.lettertype,
    lettergrootte: rawLayout.lettergrootte ?? STANDAARD_LAYOUT.lettergrootte,
    marge_boven: rawLayout.marge_boven ?? STANDAARD_LAYOUT.marge_boven,
    marge_onder: rawLayout.marge_onder ?? STANDAARD_LAYOUT.marge_onder,
    marge_links: rawLayout.marge_links ?? STANDAARD_LAYOUT.marge_links,
    marge_rechts: rawLayout.marge_rechts ?? STANDAARD_LAYOUT.marge_rechts,
    toon_voorblad: rawLayout.toon_voorblad ?? STANDAARD_LAYOUT.toon_voorblad,
    toon_specificatie: rawLayout.toon_specificatie ?? STANDAARD_LAYOUT.toon_specificatie,
    toon_voorwaarden: rawLayout.toon_voorwaarden ?? STANDAARD_LAYOUT.toon_voorwaarden,
    toon_paginanummer: rawLayout.toon_paginanummer ?? STANDAARD_LAYOUT.toon_paginanummer,
    voettekst: rawLayout.voettekst ?? STANDAARD_LAYOUT.voettekst,
    koptekst: rawLayout.koptekst ?? STANDAARD_LAYOUT.koptekst,
    footer_html: rawLayout.footer_html ?? STANDAARD_LAYOUT.footer_html,
    papier_formaat: rawLayout.papier_formaat ?? STANDAARD_LAYOUT.papier_formaat,
    papier_orientatie: rawLayout.papier_orientatie ?? STANDAARD_LAYOUT.papier_orientatie,
  }
}

export interface OfferteContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawLayout: any
  layout: LayoutContext
  bedrijf: BedrijfContext
  dossier: DossierContext
  ctx: RenderContext
}

/** Laadt de offerte + bedrijf/dossier en bouwt de render-context (zonder PDF). */
export async function laadOfferteContext(quoteId: string): Promise<OfferteContext> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await createClient()) as any

  const { data: quote, error } = await supabase
    .from('quotes')
    .select(`
      *,
      client:clients(*),
      sections:quote_sections(*, lines:quote_lines(*)),
      terms:quote_terms(*),
      layout:quote_layouts(*),
      betalingsconditie:betalingscondities(*),
      algemene_voorwaarden:algemene_voorwaarden(*)
    `)
    .eq('id', quoteId)
    .order('volgorde', { referencedTable: 'quote_sections', ascending: true })
    .order('volgorde', { referencedTable: 'quote_sections.quote_lines', ascending: true })
    .order('volgorde', { referencedTable: 'quote_terms', ascending: true })
    .single()
  if (error || !quote) throw new Error('Offerte niet gevonden')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawLayout: any = quote.layout ?? {}
  const layout = mapLayout(rawLayout)
  const { bedrijf, dossier } = await laadBedrijfEnDossier(supabase, quote)
  const ctx = buildRenderContext(quote, bedrijf, layout, dossier)
  return { quote, rawLayout, layout, bedrijf, dossier, ctx }
}

/**
 * Genereert de definitieve offerte-PDF voor verzending: briefpapier eronder, de
 * algemene voorwaarden apart (losse bijlage) en géén CONCEPT-watermerk. Geeft ook
 * de render-context terug voor de mailvariabelen.
 */
export async function genereerOffertePdfMetBijlagen(quoteId: string): Promise<OffertePdfResultaat> {
  const { quote, rawLayout, layout, bedrijf, dossier, ctx } = await laadOfferteContext(quoteId)

  const templateBuffer = await loadQuoteTemplateBuffer(rawLayout)
  const docxBuffer = await renderQuoteDocx(
    quote as Parameters<typeof renderQuoteDocx>[0], bedrijf, layout, templateBuffer, { dossier },
  )

  let offertePdf: Uint8Array = await convertDocxToPdf(docxBuffer)
  const briefpapier = await fetchBriefpapier(rawLayout.briefpapier_pdf_url ?? null)
  if (briefpapier) {
    try { offertePdf = await mergeBriefpapierBackground(offertePdf, briefpapier) }
    catch (e) { console.warn('Briefpapier-merge mislukt:', e) }
  }

  // Algemene voorwaarden als losse bijlage.
  let voorwaardenPdf: Uint8Array | null = null
  const av = quote.algemene_voorwaarden
  if (av?.bestand_url) {
    try {
      const r = await fetch(av.bestand_url)
      if (r.ok) voorwaardenPdf = new Uint8Array(await r.arrayBuffer())
    } catch (e) { console.warn('Voorwaarden ophalen mislukt:', e) }
  }

  return { quote, bedrijf, dossier, ctx, quoteNummer: quote.quote_nummer, offertePdf, voorwaardenPdf }
}
