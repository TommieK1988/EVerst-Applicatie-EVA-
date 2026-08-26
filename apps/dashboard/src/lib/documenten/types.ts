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
export const DOCUMENTSOORTEN = [
  'opdrachtbevestiging', 'bewonersbrief', 'garantiecertificaat', 'informatiebrief',
  'houtrot_rapportage', 'kwaliteitsrapport', 'inkooporder', 'oa_contract', 'overig',
] as const
export type Documentsoort = (typeof DOCUMENTSOORTEN)[number]

export const documentsoortLabels: Record<Documentsoort, string> = {
  opdrachtbevestiging:'Opdrachtbevestiging',
  bewonersbrief:      'Bewonersbrief',
  garantiecertificaat:'Garantiecertificaat',
  informatiebrief:    'Tussentijdse informatiebrief',
  houtrot_rapportage: 'Houtrot-rapportage',
  kwaliteitsrapport:  'Kwaliteitscontrole-rapport',
  inkooporder:        'Inkooporder',
  oa_contract:        'Onderaannemerscontract',
  overig:             'Overig',
}

/**
 * De twee inkoopsoorten. Ze verschillen van de brieven: de geadresseerde is de
 * leverancier (niet de bewoner/opdrachtgever) en de inhoud komt uit een bestelling.
 * De sleutels zijn gelijk aan `ContractSoort` in `lib/bouw7/contracten`, zodat de
 * soort van een bestelling rechtstreeks de documentsoort selecteert.
 */
export const INKOOP_DOCUMENTSOORTEN = ['inkooporder', 'oa_contract'] as const
export type InkoopDocumentsoort = (typeof INKOOP_DOCUMENTSOORTEN)[number]

export function isInkoopSoort(s: string | null | undefined): s is InkoopDocumentsoort {
  return s === 'inkooporder' || s === 'oa_contract'
}

/** Veldtypen voor de per-document invoervelden. */
export const VELD_TYPES = ['tekst', 'meerregelig', 'datum', 'getal', 'keuze', 'checkbox', 'feedback_link', 'houtrot_opties', 'kwaliteit_opties'] as const
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
  // Bijzonder veld voor de houtrot-rapportage: bij het opstellen kies je hier het
  // groeperingsniveau, de tak, het statusfilter, het aantal registraties per pagina
  // en of verkoopprijzen mee mogen. De waarde is een JSON-tekst.
  houtrot_opties:'Houtrot-rapportage (filters)',
  // Bijzonder veld voor het kwaliteitsrapport: bij het opstellen kies je welke inspectie het
  // betreft en of de positieve waarnemingen en de opvolging van eerdere rondes mee moeten.
  // De waarde is een JSON-tekst.
  kwaliteit_opties: 'Kwaliteitsrapport (inspectie kiezen)',
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
