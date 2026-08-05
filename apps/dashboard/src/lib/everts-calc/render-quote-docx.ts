/**
 * render-quote-docx.ts
 *
 * Offerte-specifieke Word-render: bouwt de offerte-context op en laat de generieke
 * engine (`lib/documenten/render-docx.ts`) het template vullen.
 *
 * Wordt gebruikt door:
 *  - de /docx-endpoint (directe Word-download)
 *  - de /pdf-endpoint (via Microsoft Graph .docx → PDF)
 *
 * Afbeeldingen ({%logo}, {%handtekening}) via de gratis image-module.
 * Vrije-tekstvelden gaan als platte tekst mee (de Word-template bepaalt de opmaak);
 * `stripHtml` is een veiligheidsnet voor eventuele legacy-HTML in oude offertes.
 */

import { buildRenderContext, type BedrijfContext, type LayoutContext, type DossierContext } from './quote-renderer'
import { stripHtml, type OnderstreeptSplitsing } from './docx-utils'
import type { Quote } from './types-quotes'
import { renderDocx, loadTemplateBuffer, fetchImageDataUrl, bufferNaarDataUrl } from '../documenten/render-docx'

// De engine woont in lib/documenten/render-docx.ts. Deze re-exports houden alle
// bestaande import-paden (pdf/docx/pdf-preview/docx-preview-routes) ongewijzigd werkend.
export { formatDocxError, GeenTemplateError } from '../documenten/render-docx'

/**
 * Haalt de .docx-template-buffer op voor een offerte-layout.
 * Alias van de generieke `loadTemplateBuffer` — `quote_layouts` en `document_sjablonen`
 * delen bewust dezelfde `docx_template_*`-kolomnamen.
 *
 * @throws GeenTemplateError als er geen template gekoppeld is.
 */
export const loadQuoteTemplateBuffer = loadTemplateBuffer

/**
 * `{schilderbehandeling}` toont de naam van de behandeling met de werkomschrijving
 * eronder. De naam hoort altijd onderstreept te zijn, ook in templates die daar niets
 * voor zijn ingericht — daarom splitst de engine de tag in twee runs met de opmaak van
 * het template, waarvan alleen de eerste onderstreept wordt.
 */
const BEHANDELING_SPLITSING: OnderstreeptSplitsing = {
  tag: 'schilderbehandeling',
  onderstreept: 'behandeling_naam',
  normaal: 'behandeling_tekst',
}

/**
 * Hetzelfde voor de losse `{.}` in de behandelingen-lijst. Die tag betekent "de waarde
 * van deze lus" en komt in élke string-loop voor, dus de splitsing geldt uitsluitend
 * binnen `{#behandelingen_overzicht}`. Lukt het splitsen niet, dan wordt `{.}` daar
 * `{volledig}` — de platte naam-plus-tekst van dezelfde behandeling.
 */
const BEHANDELING_OVERZICHT_SPLITSING: OnderstreeptSplitsing = {
  tag: '.',
  onderstreept: 'naam',
  normaal: 'tekst',
  binnen: 'behandelingen_overzicht',
  terugval: 'volledig',
}

interface ExtraImages {
  /** Handtekening-bytes (optioneel; tag {%handtekening}). */
  handtekening?: Buffer | null
  /** Gekoppeld dossier (werkadres, calculator, referenties); leeg als niet gekoppeld. */
  dossier?: DossierContext
  /** True zolang de offerte niet is goedgekeurd; template kan {#is_concept}…{/is_concept} tonen. */
  is_concept?: boolean
}

/**
 * Rendert een offerte naar een ingevuld .docx (Buffer) op basis van een
 * template-buffer.
 */
export async function renderQuoteDocx(
  quote: Quote,
  bedrijf: BedrijfContext,
  layout: LayoutContext,
  templateBuffer: ArrayBuffer | Buffer,
  extra: ExtraImages = {},
): Promise<Buffer> {
  const ctx = buildRenderContext(quote, bedrijf, layout, extra.dossier)

  // Logo's ophalen (best-effort) en image-context opbouwen. Als base64 data-URL, niet als
  // kale Buffer: de sync image-render van docxtemplater-image-module-free crasht op objecten
  // (zie bufferNaarDataUrl in render-docx.ts).
  const logo = await fetchImageDataUrl(bedrijf.logo_url)
  const logoWit = await fetchImageDataUrl(bedrijf.logo_wit_url)

  // Docx-vriendelijke context: HTML uit vrije-tekstvelden strippen naar platte tekst
  const docxCtx = {
    ...ctx,
    offerte: {
      ...ctx.offerte,
      inleiding: stripHtml(ctx.offerte.inleiding),
      slottekst: stripHtml(ctx.offerte.slottekst),
    },
    voorwaarden: stripHtml(ctx.voorwaarden),
    uitsluitingen: stripHtml(ctx.uitsluitingen),
    opmerkingen: stripHtml(ctx.opmerkingen),
    // Image-tags (base64 data-URLs — nooit kale Buffers, zie bufferNaarDataUrl)
    logo,
    logo_wit: logoWit,
    handtekening: bufferNaarDataUrl(extra.handtekening),
    // Conditioneel CONCEPT-blok in de Word-template.
    is_concept: extra.is_concept ?? false,
  }

  // Image-kaders blijven op de engine-defaults (LOGO_MAX, en PHOTO_MAX/PHOTO_MAX_KLEIN
  // voor {%foto}/{%foto_klein}) — precies het bestaande offerte-gedrag.
  return renderDocx(templateBuffer, docxCtx, {
    splitsOnderstreept: [BEHANDELING_SPLITSING, BEHANDELING_OVERZICHT_SPLITSING],
  })
}
