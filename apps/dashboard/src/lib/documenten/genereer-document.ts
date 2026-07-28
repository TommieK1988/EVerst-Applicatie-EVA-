/**
 * genereer-document.ts
 *
 * De pijplijn van sjabloon → ingevuld .docx → PDF → (archief). Eén plek, zodat de
 * drie routes (preview/pdf/docx) en de mail-action niet elk hun eigen variant
 * krijgen die uit elkaar loopt.
 *
 * Alles wat hier wordt aangeroepen bestaat al en is bewezen in de offerteflow:
 * renderDocx + loadTemplateBuffer (documenten/render-docx), convertDocxToPdf
 * (o365), fetchBriefpapier/mergeBriefpapierBackground (everts-calc).
 *
 * Bewust NIET overgenomen uit de offerte-PDF-route: het CONCEPT-watermerk en de
 * algemene-voorwaarden-bijlage. Dat is offerte-goedkeuringslogica; een brief kent
 * geen goedkeuringsronde.
 */

import 'server-only'
import { renderDocx, loadTemplateBuffer, GeenTemplateError, FEEDBACK_LINK_PLACEHOLDER } from './render-docx'
import { buildDocumentContext, documentImageMax, ontbrekendeVelden } from './document-context'
import { buildDemoDocumentContext } from './demo-document'
import type { DocumentSjabloon } from './types'
import { documentsoortLabels, type Documentsoort } from './types'

export { GeenTemplateError }

/** Sjabloon-id 'demo' bestaat niet; previews met testgegevens gebruiken DEMO_DOSSIER. */
export const DEMO_DOSSIER = 'demo'

/** Fout met een boodschap die veilig aan de gebruiker getoond mag worden. */
export class DocumentInvoerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentInvoerError'
  }
}

export interface GenereerOpties {
  /** Overschrijft het template van het sjabloon (live preview bij uploaden). */
  templateOverride?: {
    docx_template_url?: string | null
    docx_template_bron?: string | null
    docx_template_drive_id?: string | null
    docx_template_item_id?: string | null
  } | null
  /** Overschrijft het briefpapier van het sjabloon (live preview). */
  briefpapierOverride?: string | null
}

/**
 * Rendert het sjabloon voor een dossier tot een ingevuld .docx.
 * `dossierId === DEMO_DOSSIER` → testgegevens, geen database-lookup.
 */
export async function genereerDocumentDocx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sjabloon: DocumentSjabloon,
  dossierId: string,
  invoer: Record<string, unknown>,
  ondertekenaarId?: string | null,
  opties: GenereerOpties = {},
): Promise<Buffer> {
  const ctx =
    dossierId === DEMO_DOSSIER
      ? buildDemoDocumentContext(sjabloon)
      : await buildDocumentContext(supabase, dossierId, sjabloon, invoer, ondertekenaarId)

  const templateBron = opties.templateOverride?.docx_template_url || opties.templateOverride?.docx_template_item_id
    ? { ...sjabloon, ...opties.templateOverride }
    : sjabloon

  const templateBuffer = await loadTemplateBuffer(templateBron)

  // Klik-knop: het sentinel-adres in de template wordt het echte feedback-adres.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const feedbackUrl = (ctx as any)?.feedback?.url as string | undefined
  const hyperlinks = feedbackUrl ? { [FEEDBACK_LINK_PLACEHOLDER]: feedbackUrl } : undefined

  return renderDocx(templateBuffer, ctx, { imageMax: documentImageMax(), hyperlinks })
}

/**
 * Rendert het sjabloon tot een PDF: .docx via Graph → PDF, briefpapier eronder.
 * Briefpapier-merge is best-effort: mislukt hij, dan komt de PDF zonder briefpapier
 * terug (beter dan geen document).
 */
export async function genereerDocumentPdf(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sjabloon: DocumentSjabloon,
  dossierId: string,
  invoer: Record<string, unknown>,
  ondertekenaarId?: string | null,
  opties: GenereerOpties = {},
): Promise<Uint8Array> {
  const docx = await genereerDocumentDocx(supabase, sjabloon, dossierId, invoer, ondertekenaarId, opties)

  const { convertDocxToPdf } = await import('../o365/docx-to-pdf')
  let pdf: Uint8Array = await convertDocxToPdf(docx)

  const briefpapierUrl = opties.briefpapierOverride ?? sjabloon.briefpapier_pdf_url ?? null
  if (briefpapierUrl) {
    const { fetchBriefpapier, mergeBriefpapierBackground } = await import('../everts-calc/briefpapier')
    const briefpapier = await fetchBriefpapier(briefpapierUrl)
    if (briefpapier) {
      try {
        pdf = await mergeBriefpapierBackground(pdf, briefpapier)
      } catch (err) {
        console.warn('Briefpapier-merge mislukt, document zonder briefpapier:', err)
      }
    }
  }
  return pdf
}

/**
 * Bestandsnaam voor het document. Sjabloon-eigen patroon wint; anders
 * "<Documentsoort> <dossiernummer>". Zonder extensie.
 */
export function bestandsnaamVoor(
  sjabloon: DocumentSjabloon,
  dossiernummer: string | null | undefined,
): string {
  const soortLabel = documentsoortLabels[sjabloon.documentsoort as Documentsoort] ?? sjabloon.naam
  const ruw = sjabloon.bestandsnaam_sjabloon?.trim()
    ? sjabloon.bestandsnaam_sjabloon
        .replace(/\{documentsoort\}/g, soortLabel)
        .replace(/\{sjabloon\}/g, sjabloon.naam)
        .replace(/\{dossier\.dossiernummer\}|\{dossiernummer\}/g, dossiernummer ?? '')
    : [soortLabel, dossiernummer].filter(Boolean).join(' ')

  // Tekens die Windows/SharePoint niet accepteren in een bestandsnaam.
  return (ruw || 'Document').replace(/[\\/:*?"<>|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 120)
}

/** Gooit een DocumentInvoerError als een verplicht veld ontbreekt. */
export function assertInvoerCompleet(sjabloon: DocumentSjabloon, invoer: Record<string, unknown>): void {
  const ontbreekt = ontbrekendeVelden(sjabloon.velden ?? [], invoer)
  if (ontbreekt.length) {
    throw new DocumentInvoerError(`Vul eerst in: ${ontbreekt.join(', ')}.`)
  }
}

/**
 * Haalt een sjabloon op. Admin-client: sjablonen zijn beheerdata en de aanroepende
 * routes doen hun eigen rechtencheck.
 */
export async function laadSjabloon(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  sjabloonId: string,
): Promise<DocumentSjabloon | null> {
  const { data } = await supabase
    .from('document_sjablonen')
    .select('*')
    .eq('id', sjabloonId)
    .maybeSingle()
  if (!data) return null
  return { ...data, velden: Array.isArray(data.velden) ? data.velden : [] } as DocumentSjabloon
}
