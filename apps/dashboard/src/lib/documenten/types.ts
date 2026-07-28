/**
 * types.ts — documenten-module.
 *
 * Client-veilig (geen server-only imports): zowel het beheerscherm, de
 * genereermodal als de server-actions gebruiken deze types.
 *
 * De tabellen `document_sjablonen` / `dossier_documenten` staan niet in de
 * gegenereerde `database.types.ts` (die is stale) — dit is de handgeschreven
 * waarheid, conform het bestaande patroon in deze codebase.
 */

/** Soorten documenten; stuurt de standaard-bestandsnaam en de filtering in de UI. */
export const DOCUMENTSOORTEN = ['opdrachtbevestiging', 'bewonersbrief', 'garantiecertificaat', 'informatiebrief', 'overig'] as const
export type Documentsoort = (typeof DOCUMENTSOORTEN)[number]

export const documentsoortLabels: Record<Documentsoort, string> = {
  opdrachtbevestiging:'Opdrachtbevestiging',
  bewonersbrief:      'Bewonersbrief',
  garantiecertificaat:'Garantiecertificaat',
  informatiebrief:    'Tussentijdse informatiebrief',
  overig:             'Overig',
}

/** Veldtypen voor de per-document invoervelden. */
export const VELD_TYPES = ['tekst', 'meerregelig', 'datum', 'getal', 'keuze', 'checkbox', 'feedback_link'] as const
export type VeldType = (typeof VELD_TYPES)[number]

export const veldTypeLabels: Record<VeldType, string> = {
  tekst:         'Tekst (één regel)',
  meerregelig:   'Tekst (meerdere regels)',
  datum:         'Datum',
  getal:         'Getal',
  keuze:         'Keuzelijst',
  checkbox:      'Ja/nee',
  // Bijzonder veld: bij het opstellen kies/maak je een feedback-link (bewoners). De
  // waarde is de gekozen URL; die voedt {feedback.url}, de QR-code {%feedback_qr} en
  // de klik-knop in de brief.
  feedback_link: 'Feedback-link (bewoners)',
}

/**
 * Eén invoerveld dat bij het genereren wordt gevraagd. In de Word-template aan te
 * spreken als `{invoer.<sleutel>}`.
 */
export interface DocumentVeld {
  /** Tag-sleutel; a-z, 0-9 en _ (wordt {invoer.<sleutel>}). */
  sleutel: string
  label: string
  type: VeldType
  verplicht?: boolean
  standaard?: string
  /** Alleen bij type 'keuze'. */
  opties?: string[]
  hint?: string
}

export interface DocumentSjabloon {
  id: string
  naam: string
  beschrijving: string | null
  documentsoort: Documentsoort
  docx_template_url: string | null
  docx_template_bron: 'bucket' | 'sharepoint' | 'onedrive' | null
  docx_template_drive_id: string | null
  docx_template_item_id: string | null
  docx_template_web_url: string | null
  briefpapier_pdf_url: string | null
  velden: DocumentVeld[]
  mail_onderwerp: string | null
  mail_body_html: string | null
  categorie_filter: string[] | null
  hoofdstatus_filter: string[] | null
  werkmaatschappij_id: string | null
  bestandsnaam_sjabloon: string | null
  actief: boolean
  volgorde: number
  created_at?: string
  updated_at?: string
}

export interface DossierDocument {
  id: string
  dossier_id: string
  sjabloon_id: string | null
  documentsoort: string
  bestandsnaam: string
  invoer: Record<string, unknown>
  sharepoint_drive_id: string | null
  sharepoint_item_id: string | null
  sharepoint_web_url: string | null
  gegenereerd_door: string | null
  gegenereerd_op: string
  gemaild_op: string | null
  gemaild_naar: string[] | null
  /** Alleen in lijstweergaven: opgeloste naam van de opsteller. */
  gegenereerd_door_naam?: string | null
}

/** Heeft dit sjabloon een bruikbaar Word-template gekoppeld? */
export function heeftTemplate(s: Pick<DocumentSjabloon, 'docx_template_url' | 'docx_template_bron' | 'docx_template_drive_id' | 'docx_template_item_id'>): boolean {
  if ((s.docx_template_bron === 'sharepoint' || s.docx_template_bron === 'onedrive')
      && s.docx_template_drive_id && s.docx_template_item_id) return true
  return !!s.docx_template_url
}

/**
 * Combining diacritical marks (U+0300..U+036F). Als teken-range opgebouwd i.p.v.
 * letterlijk in een regex: die tekens zijn onzichtbaar in een editor.
 */
const DIAKRIETEN = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

/** Maakt van een vrije naam een geldige tag-sleutel ("Garantie (jaren)" -> "garantie_jaren"). */
export function naarSleutel(naam: string): string {
  return naam
    .toLowerCase()
    .normalize('NFD').replace(DIAKRIETEN, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
}
