/**
 * Statuswaarden van een Bouw7-inkoopfactuur en van een stap in de goedkeuringsketen.
 *
 * **Deze mapping staat niet in de Bouw7-documentatie.** Hij is afgeleid door op 8 september 2026
 * alle 3040 facturen uit `GET /list/purchase-invoices` op te halen en de statussen te kruisen met
 * `datePaid`, `isBookedInExact` en het `approval`-object uit
 * `GET /purchase-invoicing/purchase-invoice/{id}`:
 *
 * | status | n    | betaald | approval                        | conclusie              |
 * |--------|------|---------|---------------------------------|------------------------|
 * | 0      | 28   | 0       | geen goedkeurder                | concept                |
 * | 1      | 150  | 5       | goedkeurder open (`status 0`)   | ter goedkeuring        |
 * | 2      | 375  | 1       | `isApproved: true`              | goedgekeurd/te betalen |
 * | 4      | 2481 | 2480    | keten afgerond                  | betaald                |
 * | 5      | 6    | 0       | goedkeurder `status 1` + reden  | afgekeurd/bezwaar      |
 *
 * Status 3 kwam niet voor. Wijkt het gedrag ooit af, meet dan opnieuw voordat je hier iets
 * verandert — deze constante stuurt de UI-badges, de sync-selectie én wat er in een betaalronde mag.
 *
 * Dezelfde toelichting staat als `comment on column` op `inkoopfacturen.bouw7_status`
 * (migratie `20260908g_inkoopfacturen.sql`); houd die twee gelijk.
 */

export const BOUW7_INKOOPSTATUS = {
  0: { key: 'concept',        label: 'Concept' },
  1: { key: 'ter_goedkeuring', label: 'Ter goedkeuring' },
  2: { key: 'goedgekeurd',    label: 'Goedgekeurd' },
  4: { key: 'betaald',        label: 'Betaald' },
  5: { key: 'afgekeurd',      label: 'Afgekeurd' },
} as const

export type Bouw7InkoopStatusCode = keyof typeof BOUW7_INKOOPSTATUS
export type Bouw7InkoopStatusKey = (typeof BOUW7_INKOOPSTATUS)[Bouw7InkoopStatusCode]['key']

/** Statussen waarin de goedkeuringsworkflow nog loopt — alleen hiervoor is een detail-call zinvol. */
export const INKOOP_STATUS_WORKFLOW_LOOPT: number[] = [1, 5]

/** Een factuur mag pas in een betaalronde als hij is goedgekeurd. */
export const INKOOP_STATUS_BETAALBAAR = 2

export function inkoopStatusLabel(status: number | null | undefined): string {
  if (status == null) return 'Onbekend'
  const rij = BOUW7_INKOOPSTATUS[status as Bouw7InkoopStatusCode]
  // Bewust de ruwe code tonen bij een onbekende status: liever zichtbaar vreemd dan stil verkeerd.
  return rij ? rij.label : `Status ${status}`
}

export function inkoopStatusKey(status: number | null | undefined): Bouw7InkoopStatusKey | 'onbekend' {
  if (status == null) return 'onbekend'
  return BOUW7_INKOOPSTATUS[status as Bouw7InkoopStatusCode]?.key ?? 'onbekend'
}

/**
 * `approvalStatus` van één stap in `approval.approvers[]`.
 * Gemeten op dezelfde dataset: 0 op openstaande stappen, 1 op de zes bezwaar-facturen
 * (met een ingevulde `comment`), 2 op afgeronde goedkeuringen (`isApproved: true`).
 */
export const BOUW7_APPROVAL_STATUS = {
  OPEN: 0,
  AFGEKEURD: 1,
  GOEDGEKEURD: 2,
} as const

export function approvalStatusLabel(status: number | null | undefined): string {
  if (status === BOUW7_APPROVAL_STATUS.OPEN) return 'Wacht'
  if (status === BOUW7_APPROVAL_STATUS.AFGEKEURD) return 'Bezwaar'
  if (status === BOUW7_APPROVAL_STATUS.GOEDGEKEURD) return 'Akkoord'
  return 'Onbekend'
}
