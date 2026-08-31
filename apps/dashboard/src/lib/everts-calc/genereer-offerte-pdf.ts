import 'server-only'
import type { BedrijfContext, DossierContext, RenderContext } from './quote-renderer'
import { renderQuoteDocx, loadQuoteTemplateBuffer } from './render-quote-docx'
import { laadOfferteContext } from './offerte-context'
import { haalBewerkteOfferteDocxVoorUitvoer } from './offerte-word'
import { convertDocxToPdf } from '@/lib/o365/docx-to-pdf'
import { fetchBriefpapier, mergeBriefpapierBackground } from './briefpapier'

// `laadOfferteContext` woont in offerte-context.ts (gedeeld met de Word Online-module);
// deze re-export houdt de bestaande import-paden werkend.
export { laadOfferteContext, mapLayout, type OfferteContext } from './offerte-context'

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

/**
 * De .docx die als bron voor deze offerte geldt.
 *
 * Is er een bewerkbaar Word-document aan de offerte gekoppeld (Bewerken in Word
 * Online), dan is dát bestand leidend — inclusief alle handmatige aanpassingen.
 * Anders wordt het layout-sjabloon gevuld zoals altijd.
 */
export async function laadOfferteDocx(
  quoteId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bronnen: { quote: any; rawLayout: any; layout: any; bedrijf: BedrijfContext; dossier?: DossierContext; is_concept?: boolean },
): Promise<{ docx: Buffer; bron: 'word' | 'sjabloon' }> {
  // `false`: een Word-watermerk hoort nooit in de PDF-pijplijn thuis. De PDF krijgt
  // zijn CONCEPT-stempel van pdf-lib, en de verzend-PDF krijgt hem helemaal niet.
  const bewerkt = await haalBewerkteOfferteDocxVoorUitvoer(quoteId, false)
  if (bewerkt) return { docx: bewerkt, bron: 'word' }

  const templateBuffer = await loadQuoteTemplateBuffer(bronnen.rawLayout)
  const docx = await renderQuoteDocx(
    bronnen.quote as Parameters<typeof renderQuoteDocx>[0],
    bronnen.bedrijf,
    bronnen.layout,
    templateBuffer,
    { dossier: bronnen.dossier, is_concept: bronnen.is_concept },
  )
  return { docx, bron: 'sjabloon' }
}

/**
 * Genereert de definitieve offerte-PDF voor verzending: briefpapier eronder, de
 * algemene voorwaarden apart (losse bijlage) en géén CONCEPT-watermerk. Geeft ook
 * de render-context terug voor de mailvariabelen.
 */
export async function genereerOffertePdfMetBijlagen(quoteId: string): Promise<OffertePdfResultaat> {
  const { quote, rawLayout, layout, bedrijf, dossier, ctx } = await laadOfferteContext(quoteId)

  const { docx: docxBuffer } = await laadOfferteDocx(quoteId, { quote, rawLayout, layout, bedrijf, dossier })

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
