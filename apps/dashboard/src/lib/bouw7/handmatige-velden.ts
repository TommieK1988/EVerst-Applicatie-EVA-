/**
 * Bescherming van EVA-invoer tegen de Bouw7-lees-sync.
 *
 * Elke tabel die uit Bouw7 gevuld wordt én in EVA bewerkbaar is, heeft een kolom
 * `handmatige_velden text[]`. Zodra een gebruiker zo'n veld in EVA aanpast, komt de
 * kolomnaam in die lijst; de sync schrijft voor die kolommen de EVA-waarde terug in
 * plaats van de Bouw7-waarde. Zonder dit mechanisme zette de ochtendsync (06:30) elke
 * EVA-wijziging stilzwijgend terug — dat is in augustus 2026 bij relaties misgegaan en
 * bleek daarna ook bij dossiers en medewerkers het geval.
 *
 * Twee spelregels:
 *  1. **Eenrichtingsvelden** (EVA schrijft ze niet naar Bouw7): bij bewerken markeren,
 *     en de sync laat ze daarna met rust tot iemand expliciet "weer bijwerken vanuit
 *     Bouw7" kiest (`herstel…`-actions leggen de lijst leeg).
 *  2. **Tweerichtingsvelden** (EVA schrijft ze wél terug: rollen, statussen): alleen
 *     markeren als de write-back naar Bouw7 mislukte, en ontmarkeren zodra een latere
 *     write-back slaagt. Blijvend markeren zou een latere wijziging in Bouw7 voor altijd
 *     buiten de deur houden; zonder markering gooit de eerstvolgende sync de EVA-waarde
 *     weg na een Bouw7-storing. Zie `lib/dossiers/bouw7-retry.ts` voor de herkansing.
 *
 * De veldlijsten staan hier centraal zodat de server actions (die markeren) en de sync
 * (die respecteert) van dezelfde waarheid uitgaan. Relaties en contactpersonen hebben
 * hun lijsten in `lib/relaties/sync-velden.ts` — dat was de eerste toepassing van dit
 * patroon en die lijsten worden daar ook door de UI gelezen.
 */

/** Dossierkolommen die `syncProjects` uit Bouw7 zet én die in EVA bewerkbaar zijn. */
export const BOUW7_DOSSIER_VELDEN = [
  // Eenrichting (geen write-back naar Bouw7).
  'titel',
  'klant_id',
  'contactpersoon_id',
  'categorie',
  'referentie',
  'opmerkingen',
  'werkadres_straat',
  'werkadres_postcode',
  'werkadres_stad',
  'verwacht_startdatum',
  'verwacht_einddatum',
  'object_id',
  'servicedesk_substatus',
  // Tweerichting: alleen gemarkeerd zolang een write-back naar Bouw7 openstaat.
  'project_manager_id',
  'uitvoerder_id',
  'calculator_id',
  'werkvoorbereider_id',
  'controller_id',
  'hoofdstatus',
  'aanvraag_substatus',
  'offerte_substatus',
  'opdracht_substatus',
] as const

/** Rolkolommen: gemarkeerd = de Bouw7-write van deze rollen is nog niet gelukt. */
export const BOUW7_DOSSIER_ROL_VELDEN = [
  'project_manager_id', 'uitvoerder_id', 'calculator_id', 'werkvoorbereider_id', 'controller_id',
] as const

/** Statuskolommen: gemarkeerd = de Bouw7-write van de status is nog niet gelukt. */
export const BOUW7_DOSSIER_STATUS_VELDEN = [
  'hoofdstatus', 'aanvraag_substatus', 'offerte_substatus', 'opdracht_substatus',
] as const

/** Medewerkerkolommen die `syncEmployees` uit Bouw7 zet. `functie`/`afdeling` zijn al EVA-eigen. */
export const BOUW7_MEDEWERKER_VELDEN = [
  'voornaam',
  'tussenvoegsel',
  'achternaam',
  'email',
  'telefoon',
  'adres_straat',
  'adres_postcode',
  'adres_plaats',
  'actief',
  'extern',
  'geboortedatum',
  'in_dienst_vanaf',
  'uit_dienst_per',
  'uurtarief_verkoop',
  'uurtarief_kostprijs',
] as const

/** Bankgegevens: alleen het IBAN komt uit Bouw7. */
export const BOUW7_BANK_VELDEN = ['iban'] as const

/** Kolomnamen uit een patch die door de sync overschreven zouden worden. */
export function beschermdeVelden(
  patch: Record<string, unknown>,
  toegestaan: readonly string[],
): string[] {
  return Object.keys(patch).filter(k => patch[k] !== undefined && toegestaan.includes(k))
}

/**
 * Schrijft voor elk gemarkeerd veld de bestaande EVA-waarde terug in de sync-payload.
 *
 * De sleutel wordt bewust niet weggelaten maar overschreven: een PostgREST-bulk-upsert
 * eist dat alle rijen precies dezelfde kolommen hebben. `toegestaan` begrenst dit tot
 * inhoudelijke kolommen — de bouw7_*-administratie (hash, sync-status) loopt altijd mee,
 * anders loopt de incrementele sync vast op een verouderde fingerprint.
 */
export function metBehoudVanHandmatigeVelden(
  row: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  bestaand: any,
  toegestaan: readonly string[],
): Record<string, unknown> {
  const velden = bestaand?.handmatige_velden as string[] | undefined
  if (!velden?.length) return row
  const uit = { ...row }
  for (const veld of velden) {
    if (toegestaan.includes(veld) && veld in row) uit[veld] = bestaand[veld]
  }
  return uit
}

/**
 * Voegt `velden` toe aan `handmatige_velden` van één rij. Geeft de samengevoegde lijst
 * terug zodat de aanroeper hem in dezelfde update mee kan schrijven (één DB-write), of
 * `null` als er niets te markeren valt.
 */
export async function markeerHandmatig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tabel: string,
  id: string,
  velden: string[],
): Promise<string[] | null> {
  if (velden.length === 0) return null
  const { data } = await supabase
    .from(tabel)
    .select('handmatige_velden')
    .eq('id', id)
    .maybeSingle()
  return [...new Set([...((data?.handmatige_velden as string[] | null) ?? []), ...velden])]
}

/**
 * Markeert `velden` als handmatig én schrijft de lijst meteen weg. Voor aanroepers die
 * de rij zelf al hebben bijgewerkt en alleen nog de markering hoeven te zetten.
 */
export async function markeerHandmatigEnBewaar(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tabel: string,
  id: string,
  velden: string[],
): Promise<void> {
  const lijst = await markeerHandmatig(supabase, tabel, id, velden)
  if (!lijst) return
  await supabase.from(tabel).update({ handmatige_velden: lijst }).eq('id', id)
}

/**
 * Haalt `velden` uit `handmatige_velden` van één rij — het pad "write-back naar Bouw7
 * geslaagd, Bouw7 mag weer leidend zijn". Een rij zonder markering blijft ongemoeid.
 */
export async function ontmarkeerHandmatig(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tabel: string,
  id: string,
  velden: readonly string[],
): Promise<void> {
  const { data } = await supabase
    .from(tabel)
    .select('handmatige_velden')
    .eq('id', id)
    .maybeSingle()
  const huidig = (data?.handmatige_velden as string[] | null) ?? []
  if (huidig.length === 0) return
  const nieuw = huidig.filter(v => !velden.includes(v))
  if (nieuw.length === huidig.length) return
  await supabase.from(tabel).update({ handmatige_velden: nieuw }).eq('id', id)
}
