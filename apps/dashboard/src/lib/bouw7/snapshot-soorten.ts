/**
 * Namen van de Bouw7-snapshotbronnen en wie ze leest.
 *
 * Bewust los van `snapshot-bronnen.ts`: dáár staan de loaders, en die zijn `server-only` omdat ze
 * de Bouw7-client aanroepen. De "Vernieuwen"-knop draait in de browser en heeft alleen deze namen
 * nodig; zou hij de registry importeren, dan trok hij de hele serverkant het clientbundel in (en
 * dat weigert de Next-build, terecht).
 */

/** Eén Bouw7-bron van één dossier. De snapshotsleutel wordt `dossier:{uuid}:{soort}`. */
export type DossierSoort =
  | 'athena_financial'
  | 'athena_control'
  | 'apollo_inkoopfacturen'
  | 'contract_order_lines'
  | 'inkooporders'
  | 'oa_contracten'
  | 'heimdall_inkoopfacturen'
  | 'hour_logs'
  | 'verkoopfacturen'
  | 'termijnen'
  | 'project_files'
  | 'security_links'

/** Bedrijfsbrede bronnen; niet aan één dossier gebonden. */
export type GlobaleSoort =
  | 'uren_venster'
  | 'stam_project_statuses'
  | 'stam_custom_attributes'
  | 'stam_project_categories'
  | 'stam_branches'

/** Alle dossierbronnen — de set achter de dossier-brede "Vernieuwen"-knop. */
export const ALLE_DOSSIER_SOORTEN: DossierSoort[] = [
  'athena_financial',
  'athena_control',
  'apollo_inkoopfacturen',
  'contract_order_lines',
  'inkooporders',
  'oa_contracten',
  'heimdall_inkoopfacturen',
  'hour_logs',
  'verkoopfacturen',
  'termijnen',
  'project_files',
  'security_links',
]

/**
 * Welke bronnen een tab nodig heeft. Voedt zowel de "Vernieuwen"-knop (haal precies deze op)
 * als de standregel bovenaan het tab (toon de oudste van deze).
 */
export const SOORTEN_PER_TAB = {
  financieel: ['athena_financial', 'athena_control', 'apollo_inkoopfacturen', 'contract_order_lines'],
  inkoop: ['inkooporders', 'oa_contracten', 'apollo_inkoopfacturen', 'heimdall_inkoopfacturen', 'athena_control'],
  verkoop: ['athena_financial', 'verkoopfacturen', 'termijnen'],
  uren: ['hour_logs', 'athena_control'],
  bestanden: ['project_files'],
  werkbegroting: [
    'athena_control',
    'contract_order_lines',
    'inkooporders',
    'oa_contracten',
    'apollo_inkoopfacturen',
    'security_links',
  ],
} as const satisfies Record<string, readonly DossierSoort[]>

export type SnapshotTab = keyof typeof SOORTEN_PER_TAB

/**
 * Wat de cron per dossier warmt. Een aanvraag of offerte heeft geen inkoop, uren of bewaking —
 * die tabs bestaan daar niet — dus die halen we ook niet op. Dat scheelt het leeuwendeel van het
 * werk: 552 van de 676 dossiers zitten in die twee groepen.
 */
export const WARM_SET: Record<'opdracht' | 'offerte' | 'aanvraag', DossierSoort[]> = {
  opdracht: ALLE_DOSSIER_SOORTEN,
  offerte: ['athena_financial', 'project_files'],
  aanvraag: ['athena_financial', 'project_files'],
}

/**
 * Financieel afgesloten opdrachten zijn alleen-lezen en veranderen niet meer. Alleen de cijfers
 * die het Verkoop-tab toont blijven interessant; de rest haalt de knop desgewenst op.
 */
export const WARM_SET_AFGESLOTEN: DossierSoort[] = ['athena_financial', 'verkoopfacturen']
