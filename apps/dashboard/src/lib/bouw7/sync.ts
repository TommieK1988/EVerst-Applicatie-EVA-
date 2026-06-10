'use server'

import { createAdminClient } from '@everts/database/server'
import { Bouw7Client, type Bouw7Contact, type Bouw7ContactPerson, type Bouw7Employee, type Bouw7Project, type Bouw7Quotation, type Bouw7ListResponse, type Bouw7ProjectFinancial } from './client'
import type { OrganisatieType } from '@everts/database'

export type SyncResult = {
  nieuw: number
  bijgewerkt: number
  fouten: number
  foutMelding?: string
}

/** Haal de Bouw7 API key op uit de integraties-tabel. */
async function getBouw7Client(): Promise<Bouw7Client> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('integraties')
    .select('config')
    .eq('naam', 'bouw7')
    .maybeSingle()

  if (error) throw new Error(`Kan integratie-config niet laden: ${error.message}`)
  if (!data) throw new Error('Bouw7 integratie niet geconfigureerd. Ga naar Instellingen → Integraties.')

  const config = data.config as Record<string, string>
  const apiKey = config.api_key
  if (!apiKey) throw new Error('Bouw7 API key ontbreekt in de integratie-config.')
  const appName = config.app_name
  if (!appName) throw new Error('Bouw7 app-naam ontbreekt. Ga naar Instellingen → Integraties en vul de app-naam in.')

  return new Bouw7Client(apiKey, appName)
}

/** Log sync-resultaat naar sync_log tabel. */
async function logSync(
  entiteit: string,
  richting: 'in' | 'out',
  result: SyncResult,
  duurMs: number
) {
  const supabase = createAdminClient()
  await supabase.from('sync_log').insert({
    integratie: 'bouw7',
    entiteit,
    richting,
    aantal_nieuw: result.nieuw,
    aantal_bijgewerkt: result.bijgewerkt,
    aantal_fout: result.fouten,
    duur_ms: duurMs,
    fout_melding: result.foutMelding ?? null,
  })
}

/**
 * Haal alle pagina's op van een Bouw7 lijst-endpoint.
 * Eerste aanroep zonder paginatieparameters (voor compatibiliteit).
 * Als de API paginatie-info meegeeft, worden vervolgslagen opgehaald.
 * Ondersteunt ook endpoints die direct een array teruggeven.
 */
async function fetchAllPages<T>(
  client: Bouw7Client,
  path: string,
  pageSize = 100
): Promise<T[]> {
  const first = await client.get<Bouw7ListResponse<T>>(path)
  const firstItems: T[] = first.items ?? []

  if (firstItems.length >= first.count) {
    return firstItems
  }

  const all: T[] = [...firstItems]
  let offset = firstItems.length
  while (all.length < first.count) {
    const raw = await client.get<Bouw7ListResponse<T>>(path, {
      limit: String(pageSize),
      offset: String(offset),
    })
    const items: T[] = raw.items ?? []
    if (!items.length) break
    all.push(...items)
    offset += items.length
  }
  return all
}

/**
 * Fallback: haal contactpersonen op voor één Bouw7-contact.
 * Wordt alleen gebruikt als de bulk-call (/list/contactpersons zonder filter) niet beschikbaar is.
 */
async function fetchContactpersonenVoorContact(
  bouw7: Bouw7Client,
  contactId: number,
): Promise<Bouw7ContactPerson[]> {
  try {
    const result = await bouw7.get<Bouw7ListResponse<Bouw7ContactPerson>>(
      '/list/contactpersons',
      { contactId: String(contactId) },
    )
    if (result.items?.length) return result.items
  } catch { /* endpoint bestaat niet of retourneert fout */ }

  try {
    const detail = await bouw7.get<{ contactPersons?: Bouw7ContactPerson[] }>(
      `/contacts/${contactId}`,
    )
    return detail.contactPersons ?? []
  } catch { return [] }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SYNC: Contacts → Relaties + Contactpersonen
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type SyncContactsResult = {
  organisaties: SyncResult
  contactpersonen: SyncResult
}

export async function syncContacts(): Promise<SyncContactsResult> {
  const start = Date.now()
  const orgResult: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }
  const cpResult: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }

  try {
    const bouw7 = await getBouw7Client()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // 1. Haal alle organisaties op via paginatie
    const allContacts = await fetchAllPages<Bouw7Contact>(bouw7, '/list/contacts')
    const bouw7IdsInResponse = new Set(allContacts.map(c => String(c.id)))

    // 2. Probeer alle contactpersonen in één bulk-call op te halen (vermijdt N API-calls)
    let bulkCps: Bouw7ContactPerson[] = []
    try {
      bulkCps = await fetchAllPages<Bouw7ContactPerson>(bouw7, '/list/contactpersons')
    } catch { /* bulk endpoint niet beschikbaar; fallback naar per-contact */ }

    const cpByContactId = new Map<number, Bouw7ContactPerson[]>()
    for (const cp of bulkCps) {
      if (cp.contactId == null) continue
      if (!cpByContactId.has(cp.contactId)) cpByContactId.set(cp.contactId, [])
      cpByContactId.get(cp.contactId)!.push(cp)
    }
    const bulkCpsAvailable = bulkCps.length > 0 && bulkCps.some(cp => cp.contactId != null)

    // 3. Pre-fetch bestaande relaties (één DB-query i.p.v. N)
    const { data: dbRelaties, error: selectErr } = await supabase
      .from('relaties')
      .select('id, bouw7_id, sync_vergrendeld')
      .not('bouw7_id', 'is', null)
    if (selectErr) throw new Error(`Schema cache fout bij ophalen relaties: ${selectErr.message}`)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const relatieMap = new Map<string, any>(
      (dbRelaties ?? []).map((r: any) => [r.bouw7_id as string, r])
    )

    // 4. Bouw relaties-rows (skip vergrendelde)
    const relatieRows: Record<string, unknown>[] = []
    for (const c of allContacts) {
      const bouw7IdStr = String(c.id)
      if (relatieMap.get(bouw7IdStr)?.sync_vergrendeld) continue

      const orgType = mapContactType(c.type?.name)
      const straat = [c.streetName, c.houseNumber].filter(Boolean).join(' ') || null
      relatieRows.push({
        naam:              c.name,
        types:             [orgType],
        kvk_nummer:        c.cocNumber ?? null,
        btw_nummer:        c.vatNumber ?? null,
        email:             c.emailAddress ?? null,
        telefoon:          c.phoneNumber ?? null,
        mobiel:            c.mobilePhoneNumber ?? null,
        opmerkingen:       c.information ?? null,
        adres_straat:      straat,
        adres_postcode:    c.zipCode ?? null,
        adres_plaats:      c.city ?? null,
        adres_land:        c.countryCode ?? 'Nederland',
        actief:            c.isActive !== false,
        bouw7_id:          bouw7IdStr,
        bouw7_laatst_sync: new Date().toISOString(),
        bouw7_sync_status: 'synced',
        bouw7_sync_fout:   null,
      })
    }

    // Splits in nieuw en bestaand voor batch-schrijven
    // relaties heeft een partiële unique index op bouw7_id — upsert via primary key voor bestaande
    const nieuweRelaties = relatieRows.filter(r => !relatieMap.has(r.bouw7_id as string))
    const bestaandeRelaties = relatieRows
      .filter(r => relatieMap.has(r.bouw7_id as string))
      .map(r => ({ ...r, id: relatieMap.get(r.bouw7_id as string)?.id as string }))

    orgResult.nieuw = nieuweRelaties.length
    orgResult.bijgewerkt = bestaandeRelaties.length

    // 5. Batch insert nieuwe relaties
    for (let i = 0; i < nieuweRelaties.length; i += 500) {
      const { error } = await supabase.from('relaties').insert(nieuweRelaties.slice(i, i + 500))
      if (error) { orgResult.fouten++; orgResult.foutMelding = error.message }
    }

    // 6. Batch upsert bestaande relaties via primary key (omzeilt partiële unique index)
    for (let i = 0; i < bestaandeRelaties.length; i += 500) {
      const { error } = await supabase
        .from('relaties')
        .upsert(bestaandeRelaties.slice(i, i + 500), { onConflict: 'id' })
      if (error) { orgResult.fouten++; orgResult.foutMelding = error.message }
    }

    // 7. Re-fetch relatie IDs (nieuwe records hebben nu een id)
    const { data: relatiesNaUpsert } = await supabase
      .from('relaties')
      .select('id, bouw7_id')
      .in('bouw7_id', allContacts.map(c => String(c.id)))

    const relatieIdMap = new Map<string, string>(
      (relatiesNaUpsert ?? []).map((r: { id: string; bouw7_id: string }) => [r.bouw7_id, r.id])
    )

    // 8. IBAN batch upsert
    const ibanRows: { relatie_id: string; iban: string }[] = []
    for (const c of allContacts) {
      if (!c.iban) continue
      const relatieId = relatieIdMap.get(String(c.id))
      if (relatieId) ibanRows.push({ relatie_id: relatieId, iban: c.iban })
    }
    for (let i = 0; i < ibanRows.length; i += 500) {
      await supabase
        .from('relatie_bankgegevens')
        .upsert(ibanRows.slice(i, i + 500), { onConflict: 'relatie_id', ignoreDuplicates: false })
    }

    // 9. Pre-fetch bestaande contactpersonen (één DB-query i.p.v. N)
    const { data: dbCps } = await supabase
      .from('contactpersonen')
      .select('id, bouw7_id, sync_vergrendeld')
      .not('bouw7_id', 'is', null)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cpMap = new Map<string, any>(
      (dbCps ?? []).map((cp: any) => [cp.bouw7_id as string, cp])
    )

    // 10. Bouw contactpersonen-rows (bulk API of N+1 fallback)
    const cpRows: Record<string, unknown>[] = []
    const cpOrgKoppels: { cpBouw7Id: string; orgBouw7Id: string; functie: string | null }[] = []

    for (const c of allContacts) {
      const contactpersonen = bulkCpsAvailable
        ? (cpByContactId.get(c.id) ?? [])
        : await fetchContactpersonenVoorContact(bouw7, c.id)

      for (const cp of contactpersonen) {
        const cpBouw7Id = String(cp.id)
        if (cpMap.get(cpBouw7Id)?.sync_vergrendeld) continue

        cpRows.push({
          voornaam:          cp.firstName ?? '',
          achternaam:        cp.lastName ?? '',
          email:             cp.email ?? null,
          telefoon:          cp.phone ?? null,
          bouw7_id:          cpBouw7Id,
          bouw7_laatst_sync: new Date().toISOString(),
          bouw7_sync_status: 'synced',
        })
        cpOrgKoppels.push({ cpBouw7Id, orgBouw7Id: String(c.id), functie: cp.function ?? null })
      }
    }

    // Splits in nieuw en bestaand (contactpersonen heeft ook partiële unique index)
    const nieuweCps = cpRows.filter(r => !cpMap.has(r.bouw7_id as string))
    const bestaandeCps = cpRows
      .filter(r => cpMap.has(r.bouw7_id as string))
      .map(r => ({ ...r, id: cpMap.get(r.bouw7_id as string)?.id as string }))

    cpResult.nieuw = nieuweCps.length
    cpResult.bijgewerkt = bestaandeCps.length

    // 11. Batch insert nieuwe contactpersonen
    for (let i = 0; i < nieuweCps.length; i += 500) {
      const { error } = await supabase.from('contactpersonen').insert(nieuweCps.slice(i, i + 500))
      if (error) { cpResult.fouten++; cpResult.foutMelding = error.message }
    }

    // 12. Batch upsert bestaande contactpersonen via primary key
    for (let i = 0; i < bestaandeCps.length; i += 500) {
      const { error } = await supabase
        .from('contactpersonen')
        .upsert(bestaandeCps.slice(i, i + 500), { onConflict: 'id' })
      if (error) { cpResult.fouten++; cpResult.foutMelding = error.message }
    }

    // 13. Contactpersoon-organisatie koppels batch upsert
    if (cpOrgKoppels.length > 0) {
      const cpBouw7Ids = [...new Set(cpOrgKoppels.map(k => k.cpBouw7Id))]
      const { data: cpIds } = await supabase
        .from('contactpersonen')
        .select('id, bouw7_id')
        .in('bouw7_id', cpBouw7Ids)

      const cpIdMap = new Map<string, string>(
        (cpIds ?? []).map((cp: { id: string; bouw7_id: string }) => [cp.bouw7_id, cp.id])
      )

      const koppelRows = cpOrgKoppels
        .map(k => ({
          contactpersoon_id: cpIdMap.get(k.cpBouw7Id),
          organisatie_id:    relatieIdMap.get(k.orgBouw7Id),
          functie:           k.functie,
        }))
        .filter((k): k is { contactpersoon_id: string; organisatie_id: string; functie: string | null } =>
          k.contactpersoon_id != null && k.organisatie_id != null
        )

      for (let i = 0; i < koppelRows.length; i += 500) {
        await supabase
          .from('contactpersoon_organisaties')
          .upsert(koppelRows.slice(i, i + 500), { onConflict: 'contactpersoon_id,organisatie_id', ignoreDuplicates: false })
      }
    }

    // 14. Soft-delete: markeer organisaties die niet meer in Bouw7 staan als inactief
    const toDeactivate = (dbRelaties ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((r: any) => !bouw7IdsInResponse.has(r.bouw7_id) && !r.sync_vergrendeld)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => r.id)

    if (toDeactivate.length > 0) {
      await supabase
        .from('relaties')
        .update({ actief: false, bouw7_sync_status: 'inactief_in_bouw7' })
        .in('id', toDeactivate)
    }

  } catch (e: unknown) {
    orgResult.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
    orgResult.fouten++
  }

  await logSync('relaties', 'in', orgResult, Date.now() - start)
  await logSync('contactpersonen', 'in', cpResult, Date.now() - start)
  return { organisaties: orgResult, contactpersonen: cpResult }
}

/** Splits "Voornaam [tussenvoegsel] Achternaam" in twee delen. */
function mapContactType(typeName?: string): OrganisatieType {
  if (!typeName) return 'opdrachtgever'
  switch (typeName.toLowerCase()) {
    case 'supplier':       return 'leverancier'
    case 'subcontractor':  return 'onderaannemer'
    default:               return 'opdrachtgever' // client, customer, adviesbureau, etc.
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SYNC: Employees → Medewerkers
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
export async function syncEmployees(): Promise<SyncResult> {
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }

  try {
    const bouw7 = await getBouw7Client()
    const employees = await fetchAllPages<Bouw7Employee>(bouw7, '/list/employees')
    const supabase = createAdminClient()

    // Pre-fetch bestaande bouw7_ids voor nieuw/bijgewerkt telling (één query)
    const { data: bestaand } = await supabase
      .from('medewerkers')
      .select('bouw7_id')
      .not('bouw7_id', 'is', null)
    const bestaandIds = new Set(
      (bestaand ?? [])
        .map((m: { bouw7_id: string | null }) => m.bouw7_id)
        .filter((id): id is string => id != null)
    )

    const rows = employees.map(e => ({
      voornaam:            e.firstName ?? '',
      tussenvoegsel:       e.prefix ?? null,
      achternaam:          e.lastName ?? '',
      email:               e.email ?? null,
      telefoon:            e.phone ?? null,
      functie:             e.function ?? null,
      afdeling:            e.department?.name ?? null,
      actief:              e.isActive !== false,
      uurtarief_verkoop:   e.hourlyRate ?? null,
      uurtarief_kostprijs: e.costRate ?? null,
      bouw7_id:            String(e.id),
      bouw7_laatst_sync:   new Date().toISOString(),
      bouw7_sync_status:   'synced',
      bouw7_sync_fout:     null,
    }))

    result.nieuw = rows.filter(r => !bestaandIds.has(r.bouw7_id)).length
    result.bijgewerkt = rows.filter(r => bestaandIds.has(r.bouw7_id)).length

    // Batch upsert — medewerkers heeft een volledige unique constraint op bouw7_id
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from('medewerkers')
        .upsert(rows.slice(i, i + 500), { onConflict: 'bouw7_id' })
      if (error) { result.fouten++; result.foutMelding = error.message }
    }
  } catch (e: unknown) {
    result.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
    result.fouten++
  }

  await logSync('medewerkers', 'in', result, Date.now() - start)
  return result
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SYNC: Projects → Dossiers
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type EvaStatusVelden = {
  hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
  aanvraag_substatus: string | null
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  verzonden_op?: string | null
}

// Mapping van Bouw7-projectstatusnaam naar servicedesk kanban-kolom.
// Altijd overschreven bij sync — handmatig slepen geldt tot de volgende sync.
const BOUW7_NAAR_SERVICEDESK_SUBSTATUS: Record<string, string> = {
  '01. Offerte':           'offerte_uitgebracht',
  '02. Nieuwe opdracht':   'nieuw',
  '03. Werkvoorbereiding': 'nieuw',
  '04. Onderhanden':       'loopt',
  '05. Uitvoering gereed': 'uitgevoerd',
  '06. Financieel gereed': 'financieel_gereed',
  '08. Afgewezen':         'financieel_gereed',
  '09.Verzonden offertes': 'offerte_uitgebracht',
  'LB. Lopende bonnen':    'loopt',
}

/**
 * Leidt de EVA-statusvelden af uit de Bouw7 projectstatus en categorie.
 * Categorie DO/MU wint altijd — die projecten gaan naar Servicedesk.
 * Opdracht-substatussen worden altijd overschreven vanuit Bouw7.
 * Offerte-substatussen worden alleen bij nieuwe records gezet (bestaande blijven).
 * Servicedesk-substatussen worden altijd overschreven vanuit BOUW7_NAAR_SERVICEDESK_SUBSTATUS.
 */
function mapBouw7NaarEvaStatus(
  bouw7StatusNaam: string | null | undefined,
  bouw7CategorieNaam: string | null | undefined,
  bestaandeAanvraagSub: string | null,
  bestaandeOfferteSub: string | null,
  bestaandeVerzondenOp: string | null,
): EvaStatusVelden {
  const naam = bouw7StatusNaam ?? ''
  const cat  = bouw7CategorieNaam ?? ''

  // Servicedesk: LB of categorie Dagelijks onderhoud/Mutatie (categorie wint over projectstatus)
  if (naam.toUpperCase().startsWith('LB.') || cat === 'Dagelijks onderhoud' || cat === 'Mutatie') {
    return {
      hoofdstatus:           'aanvraag',
      aanvraag_substatus:    'nieuw',
      offerte_substatus:     null,
      opdracht_substatus:    null,
      servicedesk_substatus: BOUW7_NAAR_SERVICEDESK_SUBSTATUS[naam] ?? 'nieuw',
    }
  }

  // Aanvraag — 01. Offerte (aanvragen-tab, intake/calculatie-fase)
  if (naam.startsWith('01.')) {
    return {
      hoofdstatus:           'aanvraag',
      aanvraag_substatus:    bestaandeAanvraagSub ?? 'nieuw',
      offerte_substatus:     null,
      opdracht_substatus:    null,
      servicedesk_substatus: null,
    }
  }

  // Offerte — 08. Afgewezen → altijd 'verloren'
  if (naam.startsWith('08.')) {
    return {
      hoofdstatus:           'offerte',
      aanvraag_substatus:    null,
      offerte_substatus:     'verloren',
      opdracht_substatus:    null,
      servicedesk_substatus: null,
    }
  }

  // Offerte — 09. Verzonden Offertes (offertes-tab, ook 7 dagen op aanvragen-tab)
  if (naam.startsWith('09.')) {
    return {
      hoofdstatus:           'offerte',
      aanvraag_substatus:    null,
      offerte_substatus:     bestaandeOfferteSub ?? 'verzonden',
      opdracht_substatus:    null,
      servicedesk_substatus: null,
      verzonden_op:          bestaandeVerzondenOp ?? new Date().toISOString(),
    }
  }

  // Opdrachten — 02 t/m 07 (substatus altijd overschrijven vanuit Bouw7)
  const opdrachtMap: Record<string, string> = {
    '02.': 'nieuwe_opdracht',
    '03.': 'werkvoorbereiding',
    '04.': 'onderhanden',
    '05.': 'uitvoering_gereed',
    '06.': 'financieel_gereed',
    '07.': 'financieel_afgesloten',
  }
  for (const [prefix, substatus] of Object.entries(opdrachtMap)) {
    if (naam.startsWith(prefix)) {
      return {
        hoofdstatus:           'opdracht',
        aanvraag_substatus:    null,
        offerte_substatus:     null,
        opdracht_substatus:    substatus,
        servicedesk_substatus: null,
      }
    }
  }

  // Onbekende status: standaard aanvraag
  return {
    hoofdstatus:           'aanvraag',
    aanvraag_substatus:    'nieuw',
    offerte_substatus:     null,
    opdracht_substatus:    null,
    servicedesk_substatus: null,
  }
}

export async function syncProjects(): Promise<SyncResult> {
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }

  try {
    const bouw7 = await getBouw7Client()
    const projects = await fetchAllPages<Bouw7Project>(bouw7, '/list/projects')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // Pre-fetch lookup maps (3 queries i.p.v. 3N)
    const { data: relatiesData } = await supabase
      .from('relaties')
      .select('id, bouw7_id')
      .not('bouw7_id', 'is', null)
    const relatieMap = new Map<string, string>(
      (relatiesData ?? []).map((r: { id: string; bouw7_id: string }) => [r.bouw7_id, r.id])
    )

    const { data: medewerkerData } = await supabase
      .from('medewerkers')
      .select('id, bouw7_id')
      .not('bouw7_id', 'is', null)
    const medewerkerMap = new Map<string, string>(
      (medewerkerData ?? []).map((m: { id: string; bouw7_id: string }) => [m.bouw7_id, m.id])
    )

    const { data: dossierData } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, aanvraag_substatus, offerte_substatus, servicedesk_substatus, verzonden_op')
      .not('bouw7_id', 'is', null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dossierMap = new Map<string, any>(
      (dossierData ?? []).map((d: any) => [d.bouw7_id as string, d])
    )

    // Primaire contactpersoon per organisatie (voor projectcontact op dossier).
    const { data: cpOrgData } = await supabase
      .from('contactpersoon_organisaties')
      .select('organisatie_id, contactpersoon_id, is_primair')
    const contactpersoonMap = new Map<string, string>()
    for (const row of (cpOrgData ?? []) as { organisatie_id: string; contactpersoon_id: string; is_primair: boolean }[]) {
      if (!contactpersoonMap.has(row.organisatie_id) || row.is_primair) {
        contactpersoonMap.set(row.organisatie_id, row.contactpersoon_id)
      }
    }

    // Haal Athena project-financial data op voor alle projecten (parallel, batch van 10).
    // budgetAmount / fixedPrice zit in de Athena API, niet in Heimdall.
    const financialMap = new Map<string, Bouw7ProjectFinancial>()
    const ATHENA_BATCH = 10
    for (let i = 0; i < projects.length; i += ATHENA_BATCH) {
      const batch = projects.slice(i, i + ATHENA_BATCH)
      const results = await Promise.allSettled(
        batch.map(p => bouw7.getAthena<Bouw7ProjectFinancial>(`/project-financial/${p.id}`))
      )
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
          financialMap.set(String(batch[j].id), r.value)
        }
      }
    }

    // Haal alle offertes op en bouw een map op projectId (meest recente versie per project).
    let quotationMap = new Map<string, Bouw7Quotation>()
    let quotationLogInfo = 'niet opgehaald'
    try {
      const quotations = await fetchAllPages<Bouw7Quotation>(bouw7, '/list/quotations')
      let mapped = 0
      for (const q of quotations) {
        const projId = q.project?.id
        if (!projId) continue
        const key = String(projId)
        const existing = quotationMap.get(key)
        // Meest recente offerte per project bewaren (op datum)
        if (!existing || (q.quotationDate ?? '') >= (existing.quotationDate ?? '')) {
          quotationMap.set(key, q)
          mapped++
        }
      }
      quotationLogInfo = `${quotations.length} opgehaald, ${mapped} gekoppeld`
    } catch (e: unknown) {
      quotationLogInfo = `Fout /list/quotations: ${e instanceof Error ? e.message : String(e)}`
    }
    // Log quotation-diagnose apart zodat fouten zichtbaar zijn in sync_log
    await supabase.from('sync_log').insert({
      integratie: 'bouw7', entiteit: 'quotations', richting: 'in',
      aantal_nieuw: 0, aantal_bijgewerkt: quotationMap.size, aantal_fout: quotationLogInfo.startsWith('Fout') ? 1 : 0,
      duur_ms: 0, fout_melding: quotationLogInfo,
    })

    const bouw7IdsInResponse = new Set(projects.map(p => String(p.id)))
    const rows: Record<string, unknown>[] = []

    for (const p of projects) {
      const bouw7IdStr = String(p.id)
      const existing = dossierMap.get(bouw7IdStr)

      const evaStatus = mapBouw7NaarEvaStatus(
        p.status?.name,
        p.category?.name,
        existing?.aanvraag_substatus ?? null,
        existing?.offerte_substatus ?? null,
        existing?.verzonden_op ?? null,
      )

      const quote = quotationMap.get(bouw7IdStr)
      const fin   = financialMap.get(bouw7IdStr)

      // Totaal begrote bedrag: fixedPrice (aanneemsom) > revenue.budgeted > subtotal offerte
      const kostprijs = fin?.fixedPrice
        ?? (fin?.revenue?.budgeted != null && Number(fin.revenue.budgeted) > 0 ? Number(fin.revenue.budgeted) : null)
        ?? quote?.subtotal
        ?? null

      rows.push({
        dossiernummer:            p.fullProjectNumber ?? p.projectCode ?? p.projectNumber ?? null,
        titel:                    p.name,
        klant_id:                 p.contact?.id ? (relatieMap.get(String(p.contact.id)) ?? null) : null,
        project_manager_id:       p.projectLeader?.id ? (medewerkerMap.get(String(p.projectLeader.id)) ?? null) : null,
        werkvoorbereider_id:      p.workPlanner?.id
                                    ? (medewerkerMap.get(String(p.workPlanner.id)) ?? null)
                                    : null,
        uitvoerder_id:            p.executor?.id
                                    ? (medewerkerMap.get(String(p.executor.id)) ?? null)
                                    : null,
        calculator_id:            quote?.employee?.id
                                    ? (medewerkerMap.get(String(quote.employee.id)) ?? null)
                                    : p.projectLeader?.id
                                      ? (medewerkerMap.get(String(p.projectLeader.id)) ?? null)
                                      : null,
        contactpersoon_id:        (() => {
                                    const evaKlantId = p.contact?.id ? (relatieMap.get(String(p.contact.id)) ?? null) : null
                                    return evaKlantId ? (contactpersoonMap.get(evaKlantId) ?? null) : null
                                  })(),
        bedrag_excl_btw:          p.totalExclVat ?? (p.fixedPrice ? parseFloat(p.fixedPrice) : null) ?? quote?.total ?? null,
        kostprijs_excl_btw:       kostprijs,
        verwacht_startdatum:      p.startDate ?? null,
        verwacht_einddatum:       p.endDate ?? null,
        werkadres_straat:         p.street ?? p.streetName ?? null,
        werkadres_postcode:       p.postCode ?? p.zipCode ?? null,
        werkadres_stad:           p.city ?? null,
        opmerkingen:              p.notes ?? p.reference ?? null,
        bouw7_projectstatus_id:   p.status?.id ?? null,
        bouw7_projectstatus_naam: p.status?.name ?? null,
        bouw7_categorie_id:       p.category?.id ?? null,
        bouw7_categorie_naam:     p.category?.name ?? null,
        categorie:                p.category?.name ?? null,
        bouw7_id:                 bouw7IdStr,
        bouw7_laatst_sync:        new Date().toISOString(),
        bouw7_sync_status:        'synced',
        bouw7_sync_fout:          null,
        ...evaStatus,
      })
    }

    result.nieuw = rows.filter(r => !dossierMap.has(r.bouw7_id as string)).length
    result.bijgewerkt = rows.filter(r => dossierMap.has(r.bouw7_id as string)).length

    // Batch upsert — dossiers heeft een volledige unique constraint op bouw7_id
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from('dossiers')
        .upsert(rows.slice(i, i + 500), { onConflict: 'bouw7_id' })
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // Zachte delete: dossiers die niet meer in Bouw7 staan markeren
    const toDeactivate = (dossierData ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((d: any) => !bouw7IdsInResponse.has(d.bouw7_id))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((d: any) => d.id)
    if (toDeactivate.length > 0) {
      await supabase
        .from('dossiers')
        .update({ bouw7_sync_status: 'inactief_in_bouw7' })
        .in('id', toDeactivate)
    }
  } catch (e: unknown) {
    result.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
    result.fouten++
  }

  await logSync('dossiers', 'in', result, Date.now() - start)
  return result
}

