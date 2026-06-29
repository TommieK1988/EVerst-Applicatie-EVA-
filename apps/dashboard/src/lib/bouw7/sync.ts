'use server'

import { createAdminClient } from '@everts/database/server'
import { Bouw7Client, type Bouw7Contact, type Bouw7ContactPerson, type Bouw7Employee, type Bouw7Project, type Bouw7Quotation, type Bouw7QuotationDetail, type Bouw7VatTariff, type Bouw7ListResponse, type Bouw7ProjectFinancial, type Bouw7SalesInvoice } from './client'
import { verwerkDossierTriggers } from '@/app/(platform)/taken/actions/sjablonen'
import { fingerprint } from './fingerprint'
import { deriveBtwTarieven } from './derive-stamdata'
import { OPDRACHT_PREFIX_NAAR_SUBSTATUS } from './status-map'
import type { OrganisatieType, BtwSplitsingItem } from '@everts/database'

export type SyncResult = {
  nieuw: number
  bijgewerkt: number
  fouten: number
  /** Aantal records dat ongewijzigd was en bij incrementele sync is overgeslagen. */
  overgeslagen?: number
  foutMelding?: string
}

/**
 * Sync-modus.
 * - `incremental` (default): alleen nieuwe/gewijzigde records doen de dure detail-calls + DB-writes;
 *   ongewijzigde records (gelijke `bouw7_sync_hash`) worden overgeslagen.
 * - `full`: alles opnieuw ophalen en wegschrijven (eerste run / vangnet tegen drift).
 */
export type SyncMode = 'incremental' | 'full'

/** ISO-datumstring → "YYYY-MM-DD" voor `date`-kolommen (bv. "1965-04-04T00:00:00+01:00" → "1965-04-04"). */
function toDate(dt?: string | null): string | null {
  if (!dt) return null
  return dt.slice(0, 10)
}

/** Haal de Bouw7 API key op uit de integraties-tabel. */
export async function getBouw7Client(): Promise<Bouw7Client> {
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
export async function logSync(
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
export async function fetchAllPages<T>(
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

export async function syncContacts(opts?: { mode?: SyncMode }): Promise<SyncContactsResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const orgResult: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const cpResult: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }

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
      .select('id, bouw7_id, sync_vergrendeld, bouw7_sync_hash')
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
      const hash = fingerprint({
        naam: c.name ?? null, type: orgType, kvk: c.cocNumber ?? null, btw: c.vatNumber ?? null,
        em: c.emailAddress ?? null, tel: c.phoneNumber ?? null, mob: c.mobilePhoneNumber ?? null,
        opm: c.information ?? null, str: straat, pc: c.zipCode ?? null, pl: c.city ?? null,
        land: c.countryCode ?? 'Nederland', act: c.isActive !== false, iban: c.iban ?? null,
        // Uurtarieven per uurtype in de fingerprint zodat tariefwijzigingen incrementeel meegaan.
        htp: c.hourTypePrices?.length ? JSON.stringify(c.hourTypePrices) : null,
      })
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
        bouw7_sync_hash:   hash,
        bouw7_laatst_sync: new Date().toISOString(),
        bouw7_sync_status: 'synced',
        bouw7_sync_fout:   null,
      })
    }

    // Incrementeel: alleen nieuwe/gewijzigde relaties schrijven (gelijke hash → overslaan).
    const changedRelatieRows = mode === 'full'
      ? relatieRows
      : relatieRows.filter(r => relatieMap.get(r.bouw7_id as string)?.bouw7_sync_hash !== r.bouw7_sync_hash)
    orgResult.overgeslagen = relatieRows.length - changedRelatieRows.length

    // Splits in nieuw en bestaand voor batch-schrijven
    // relaties heeft een partiële unique index op bouw7_id — upsert via primary key voor bestaande
    const nieuweRelaties = changedRelatieRows.filter(r => !relatieMap.has(r.bouw7_id as string))
    const bestaandeRelaties = changedRelatieRows
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

    // 8b. Uurtarief per uurtype → relatie_uurtarieven (verkooptarief per relatie × uursoort).
    //     Bouw7 hourType.id koppelt aan planning_uursoorten via bouw7_id. Geen-op als de
    //     /list/contacts-response geen hourTypePrices levert (dan via detail-endpoint te bevestigen).
    try {
      const { data: uursoorten } = await supabase
        .from('planning_uursoorten')
        .select('id, bouw7_id')
        .not('bouw7_id', 'is', null)
      const uursoortByBouw7 = new Map<string, string>(
        (uursoorten ?? []).map((u: { id: string; bouw7_id: string }) => [String(u.bouw7_id), u.id])
      )
      const num = (v: unknown): number | null => {
        if (v == null) return null
        const n = typeof v === 'string' ? parseFloat(v) : Number(v)
        return isNaN(n) ? null : n
      }
      const tariefRows: Record<string, unknown>[] = []
      for (const c of allContacts) {
        const relatieId = relatieIdMap.get(String(c.id))
        if (!relatieId || !c.hourTypePrices?.length) continue
        for (const p of c.hourTypePrices) {
          const hourTypeId = p.hourType?.id ?? p.hourTypeId
          if (hourTypeId == null) continue
          const uursoortId = uursoortByBouw7.get(String(hourTypeId))
          if (!uursoortId) continue // uursoort nog niet bekend in EVA (komt via derive-stamdata)
          tariefRows.push({
            relatie_id:        relatieId,
            uursoort_id:       uursoortId,
            tarief_verkoop:    num(p.sellingPrice ?? p.price),
            tarief_kostprijs:  num(p.costPrice),
            bouw7_hourtype_id: String(hourTypeId),
            bron:              'bouw7',
            updated_at:        new Date().toISOString(),
          })
        }
      }
      for (let i = 0; i < tariefRows.length; i += 500) {
        await supabase
          .from('relatie_uurtarieven')
          .upsert(tariefRows.slice(i, i + 500), { onConflict: 'relatie_id,uursoort_id' })
      }
    } catch { /* tarief-sync is best-effort; faalt nooit de hele contact-sync */ }

    // 9. Pre-fetch bestaande contactpersonen (één DB-query i.p.v. N)
    const { data: dbCps } = await supabase
      .from('contactpersonen')
      .select('id, bouw7_id, sync_vergrendeld, bouw7_sync_hash')
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
          bouw7_sync_hash:   fingerprint({
            v: cp.firstName ?? '', a: cp.lastName ?? '', em: cp.email ?? null, tel: cp.phone ?? null,
          }),
          bouw7_laatst_sync: new Date().toISOString(),
          bouw7_sync_status: 'synced',
        })
        cpOrgKoppels.push({ cpBouw7Id, orgBouw7Id: String(c.id), functie: cp.function ?? null })
      }
    }

    // Incrementeel: alleen nieuwe/gewijzigde contactpersonen schrijven (gelijke hash → overslaan).
    const changedCpRows = mode === 'full'
      ? cpRows
      : cpRows.filter(r => cpMap.get(r.bouw7_id as string)?.bouw7_sync_hash !== r.bouw7_sync_hash)
    cpResult.overgeslagen = cpRows.length - changedCpRows.length

    // Splits in nieuw en bestaand (contactpersonen heeft ook partiële unique index)
    const nieuweCps = changedCpRows.filter(r => !cpMap.has(r.bouw7_id as string))
    const bestaandeCps = changedCpRows
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
export async function syncEmployees(opts?: { mode?: SyncMode }): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }

  try {
    const bouw7 = await getBouw7Client()
    const employees = await fetchAllPages<Bouw7Employee>(bouw7, '/list/employees')
    // De gegenereerde types lopen achter op de bouw7_sync_hash-kolom; admin-client als any, net als elders.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // Pre-fetch bestaande bouw7_ids + hashes (één query) voor telling en change-detectie.
    const { data: bestaand } = await supabase
      .from('medewerkers')
      .select('bouw7_id, bouw7_sync_hash')
      .not('bouw7_id', 'is', null)
    const hashByBouw7Id = new Map<string, string | null>(
      (bestaand ?? [])
        .filter((m: { bouw7_id: string | null }) => m.bouw7_id != null)
        .map((m: { bouw7_id: string; bouw7_sync_hash: string | null }) => [m.bouw7_id, m.bouw7_sync_hash])
    )

    const allRows = employees.map(e => {
      const bouw7Id = String(e.id)
      // Verkoop = sellingHourlyRate, kostprijs = hourlyRate (komen als string binnen).
      const uurtariefVerkoop   = e.sellingHourlyRate != null ? Number(e.sellingHourlyRate) : null
      const uurtariefKostprijs = e.hourlyRate != null ? Number(e.hourlyRate) : null
      // Geen top-level isActive in de API: "uit dienst"-datum gevuld → niet meer actief.
      const actief = !e.dateOfResignation
      const hash = fingerprint({
        v: e.firstName ?? '', tv: e.prefix ?? null, a: e.lastName ?? '',
        em: e.emailAddress ?? null, tel: e.phoneNumber ?? null, fn: e.functionTitle ?? null,
        afd: e.department?.name ?? null, act: actief, ext: e.external ?? false,
        gb: e.birthDate ?? null, dvd: e.dateOfEmployment ?? null, udp: e.dateOfResignation ?? null,
        hr: uurtariefVerkoop, cr: uurtariefKostprijs,
      })
      return {
        voornaam:            e.firstName ?? '',
        tussenvoegsel:       e.prefix ?? null,
        achternaam:          e.lastName ?? '',
        email:               e.emailAddress ?? null,
        telefoon:            e.phoneNumber ?? null,
        functie:             e.functionTitle ?? null,
        afdeling:            e.department?.name ?? null,
        actief,
        extern:              e.external ?? false,
        geboortedatum:       toDate(e.birthDate),
        in_dienst_vanaf:     toDate(e.dateOfEmployment),
        uit_dienst_per:      toDate(e.dateOfResignation),
        uurtarief_verkoop:   uurtariefVerkoop,
        uurtarief_kostprijs: uurtariefKostprijs,
        bouw7_id:            bouw7Id,
        bouw7_sync_hash:     hash,
        bouw7_laatst_sync:   new Date().toISOString(),
        bouw7_sync_status:   'synced',
        bouw7_sync_fout:     null,
      }
    })

    // Incrementeel: alleen nieuwe/gewijzigde rijen schrijven (gelijke hash → overslaan).
    const rows = mode === 'full'
      ? allRows
      : allRows.filter(r => hashByBouw7Id.get(r.bouw7_id) !== r.bouw7_sync_hash)

    result.nieuw = rows.filter(r => !hashByBouw7Id.has(r.bouw7_id)).length
    result.bijgewerkt = rows.filter(r => hashByBouw7Id.has(r.bouw7_id)).length
    result.overgeslagen = allRows.length - rows.length

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

/**
 * Haal een positief getal op uit een Bouw7 financieel veld.
 * Het Athena-veld kan een number, een string, of een object {budgeted, prognosis, ...} zijn
 * als de API zijn schema wijzigt. Deze helper behandelt alle drie gevallen.
 */
function extractFinNum(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number') return v > 0 ? v : null
  if (typeof v === 'string') {
    const n = parseFloat(v)
    return !isNaN(n) && n > 0 ? n : null
  }
  if (typeof v === 'object') {
    // API stuurt object met budgeted/prognosis/realised — gebruik budgeted als primaire waarde
    return extractFinNum((v as Record<string, unknown>).budgeted)
  }
  return null
}

/** Financiële cijfers afgeleid uit een Bouw7 offerte-detail (/quotation/{id}). */
type QuoteCijfers = {
  /** Som van calculationTotal over niet-optionele regels — null als niets gecalculeerd is. */
  kostprijs: number | null
  /** Som van de regel-subtotalen (verkoop, excl. AK/W&R) — null zonder regels. */
  regelsom: number | null
  /** BTW per tarief, incl. AK/W&R in de grondslag — null zonder regels. */
  btwSplitsing: BtwSplitsingItem[] | null
}

/**
 * Bereken kostprijs, regelsom en BTW-splitsing uit een offerte-detail.
 * De grondslag per tarief = regel-subtotalen per tarief + AK- en W&R-bedrag bij hun
 * eigen tarief. Het afrondingsverschil t.o.v. (quote.total − quote.subtotal) wordt
 * verrekend met het grootste tarief zodat de splitsing exact optelt.
 */
function berekenQuoteCijfers(det: Bouw7QuotationDetail, quote: Bouw7Quotation): QuoteCijfers {
  const num = (v: unknown): number => {
    const n = parseFloat(String(v ?? ''))
    return isNaN(n) ? 0 : n
  }
  const rond = (v: number) => Math.round(v * 100) / 100

  // Meerwerk-hoofdstukken (additionalWork) en optionele regels tellen niet mee in de
  // aanneemsom (quote.subtotal) — dus ook niet in kostprijs, regelsom en BTW-grondslag.
  const lines = (det.chapters ?? [])
    .filter(c => !c.additionalWork)
    .flatMap(c => c.lines ?? [])
    .filter(l => !l.option)
  if (!lines.length) return { kostprijs: null, regelsom: null, btwSplitsing: null }

  const kostprijsSom = rond(lines.reduce((s, l) => s + num(l.calculationTotal), 0))
  const regelsom     = rond(lines.reduce((s, l) => s + num(l.subtotal), 0))

  // Grondslag per tarief — key op label zodat 'Verlegd 21%' (0%) en 'Geen' apart blijven.
  const tarieven = new Map<string, { label: string; percentage: number; grondslag: number }>()
  const telMee = (tarief: Bouw7VatTariff | null | undefined, pctFallback: unknown, grondslag: number) => {
    if (!grondslag) return
    const percentage = num(tarief?.percentage ?? pctFallback)
    const label = tarief?.label ?? `${percentage}%`
    const cur = tarieven.get(label) ?? { label, percentage, grondslag: 0 }
    cur.grondslag += grondslag
    tarieven.set(label, cur)
  }
  for (const l of lines) telMee(l.vatTariffObject, l.vatTariffPercentage, num(l.subtotal))
  telMee(det.overheadsVatTariff,     undefined, regelsom * num(det.overheads) / 100)
  telMee(det.profitAndRiskVatTariff, undefined, regelsom * num(det.profitAndRisk) / 100)

  const splitsing: BtwSplitsingItem[] = [...tarieven.values()]
    .map(t => ({
      label:      t.label,
      percentage: t.percentage,
      grondslag:  rond(t.grondslag),
      bedrag:     rond(t.grondslag * t.percentage / 100),
    }))
    .sort((a, b) => b.percentage - a.percentage)

  // Afrondingsverschil verrekenen met het grootste BTW-bedrag (max ±2 cent).
  // Telt de splitsing daarna nog steeds niet op tot (total − subtotal), dan klopt onze
  // reconstructie niet (onbekende korting/uitzondering) → liever géén splitsing dan een foute.
  let splitsingOk = true
  const doelBtw = quote.total != null && quote.subtotal != null
    ? rond(Number(quote.total) - Number(quote.subtotal))
    : null
  if (doelBtw != null && splitsing.length) {
    const som = rond(splitsing.reduce((s, t) => s + t.bedrag, 0))
    const verschil = rond(doelBtw - som)
    if (verschil !== 0 && Math.abs(verschil) <= 0.02) {
      const grootste = splitsing.reduce((a, b) => (b.bedrag > a.bedrag ? b : a))
      grootste.bedrag = rond(grootste.bedrag + verschil)
    } else if (verschil !== 0) {
      splitsingOk = false
    }
  }

  return {
    kostprijs:    kostprijsSom > 0 ? kostprijsSom : null,
    regelsom,
    btwSplitsing: splitsingOk ? splitsing : null,
  }
}

type EvaStatusVelden = {
  hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
  aanvraag_substatus: string | null
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  verzonden_op?: string | null
}

/**
 * Map de Bouw7-offertestatus (quotationStatus.name) naar een EVA offerte-substatus.
 * Match op naamdeel (niet op nummerprefix) zodat hernummering in Bouw7 de mapping niet breekt.
 * Bekende Bouw7-statussen: 01. Nieuw, 02. Onderhanden, 03. Te controleren, 03. Verstuurd,
 * 04. Gewonnen, 05. Verloren, 06. Vervallen, 07. Mondelinge toezegging.
 * Nieuw/Onderhanden/Te controleren → null (EVA-substatus blijft staan).
 */
function mapOffertestatusNaarSubstatus(naam: string | null | undefined): string | null {
  if (!naam) return null
  const n = naam.toLowerCase()
  if (n.includes('gewonnen'))   return 'gewonnen'
  if (n.includes('verloren'))   return 'verloren'
  if (n.includes('vervallen'))  return 'vervallen'
  if (n.includes('mondelinge')) return 'mondelinge_toezegging'
  if (n.includes('verstuurd'))  return 'verzonden'
  return null
}

/** De vier offertestatus-eindstatussen — deze overschrijven altijd de EVA-substatus. */
const OFFERTE_EINDSTATUSSEN = ['gewonnen', 'verloren', 'vervallen', 'mondelinge_toezegging']

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
 * Leidt de EVA-statusvelden af uit de Bouw7 projectstatus, categorie en offertestatus.
 * Categorie DO/MU wint altijd — die projecten gaan naar Servicedesk.
 * Opdracht-substatussen worden altijd overschreven vanuit Bouw7.
 * Offerte-substatussen: de vier eindstatussen uit de Bouw7-offertestatus (gewonnen, verloren,
 * vervallen, mondelinge toezegging) overschrijven altijd; anders blijft de bestaande staan.
 * Servicedesk-substatussen worden altijd overschreven vanuit BOUW7_NAAR_SERVICEDESK_SUBSTATUS.
 */
function mapBouw7NaarEvaStatus(
  bouw7StatusNaam: string | null | undefined,
  bouw7CategorieNaam: string | null | undefined,
  bestaandeAanvraagSub: string | null,
  bestaandeOfferteSub: string | null,
  bestaandeVerzondenOp: string | null,
  offertestatusNaam: string | null = null,
): EvaStatusVelden {
  const naam = bouw7StatusNaam ?? ''
  const cat  = bouw7CategorieNaam ?? ''

  const offerteSub  = mapOffertestatusNaarSubstatus(offertestatusNaam)
  const eindstatus  = offerteSub && OFFERTE_EINDSTATUSSEN.includes(offerteSub) ? offerteSub : null

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
    // Offertestatus Gewonnen/Mondelinge toezegging: dossier verhuist naar de Offertes-tab
    // (de Aanvragen-kanban heeft voor deze statussen geen kolom).
    if (eindstatus === 'gewonnen' || eindstatus === 'mondelinge_toezegging') {
      return {
        hoofdstatus:           'offerte',
        aanvraag_substatus:    null,
        offerte_substatus:     eindstatus,
        opdracht_substatus:    null,
        servicedesk_substatus: null,
      }
    }
    // Offertestatus Verstuurd/Verloren/Vervallen: in de juiste aanvraag-kolom zetten.
    const aanvraagOverride =
      offerteSub === 'verzonden' ? 'verzonden'
      : eindstatus === 'verloren'  ? 'afgewezen'
      : eindstatus === 'vervallen' ? 'vervallen'
      : null
    return {
      hoofdstatus:           'aanvraag',
      aanvraag_substatus:    aanvraagOverride ?? bestaandeAanvraagSub ?? 'nieuw',
      offerte_substatus:     null,
      opdracht_substatus:    null,
      servicedesk_substatus: null,
    }
  }

  // Offerte — 08. Afgewezen → offertestatus-eindstatus (onderscheidt verloren/vervallen), anders 'verloren'
  if (naam.startsWith('08.')) {
    return {
      hoofdstatus:           'offerte',
      aanvraag_substatus:    null,
      offerte_substatus:     eindstatus ?? 'verloren',
      opdracht_substatus:    null,
      servicedesk_substatus: null,
    }
  }

  // Offerte — 09. Verzonden Offertes (offertes-tab, ook 7 dagen op aanvragen-tab).
  // Alleen de vier eindstatussen overschrijven — 'Verstuurd' mag een handmatig gesleepte
  // nabellen/in_behandeling niet terugzetten.
  if (naam.startsWith('09.')) {
    return {
      hoofdstatus:           'offerte',
      aanvraag_substatus:    null,
      offerte_substatus:     eindstatus ?? bestaandeOfferteSub ?? 'verzonden',
      opdracht_substatus:    null,
      servicedesk_substatus: null,
      verzonden_op:          bestaandeVerzondenOp ?? new Date().toISOString(),
    }
  }

  // Opdrachten — 02 t/m 07 (substatus altijd overschrijven vanuit Bouw7).
  // Mapping leeft in lib/bouw7/status-map.ts — gedeeld met de terugschrijf-helper.
  for (const [prefix, substatus] of Object.entries(OPDRACHT_PREFIX_NAAR_SUBSTATUS)) {
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

export async function syncProjects(opts?: { mode?: SyncMode; onlyBouw7Ids?: string[] }): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  // Scoped run (ververs één dossier): alleen deze bouw7_ids, geforceerd, en geen soft-delete.
  const scoped = opts?.onlyBouw7Ids ? new Set(opts.onlyBouw7Ids.map(String)) : null
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }

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
      .select('id, bouw7_id, voornaam, tussenvoegsel, achternaam')
      .not('bouw7_id', 'is', null)
    const medewerkerMap = new Map<string, string>(
      (medewerkerData ?? []).map((m: { id: string; bouw7_id: string }) => [m.bouw7_id, m.id])
    )

    // Naam → medewerker-id, voor het matchen van vrije-tekst-namen uit Bouw7-maatwerkvelden
    // (bv. custom attribute "Eindverantwoordelijke offerte" → rol Controller). Normaliseer naar
    // lowercase, non-breaking spaces → spatie, witruimte inklappen. Keys voor zowel
    // "voornaam achternaam" als "voornaam tussenvoegsel achternaam". Namen die naar meerdere
    // medewerkers wijzen worden ambigu en niet gematcht.
    const normNaam = (s: string | null | undefined) =>
      (s ?? '').replace(/ /g, ' ').toLowerCase().replace(/\s+/g, ' ').trim()
    const naamMap = new Map<string, string | null>() // null = ambigu
    for (const m of (medewerkerData ?? []) as {
      id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null
    }[]) {
      const keys = new Set([
        normNaam([m.voornaam, m.achternaam].filter(Boolean).join(' ')),
        normNaam([m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')),
      ])
      for (const k of keys) {
        if (!k) continue
        if (naamMap.has(k) && naamMap.get(k) !== m.id) naamMap.set(k, null) // ambigu
        else naamMap.set(k, m.id)
      }
    }
    /** Match een vrije-tekstnaam (custom attribute) op een medewerker-id; null als leeg/onbekend/ambigu. */
    const matchControllerUitCa = (raw: string | null | undefined): string | null => {
      const key = normNaam(raw)
      if (!key) return null
      const hit = naamMap.get(key)
      if (hit) return hit
      console.warn(`[sync] Controller-naam "${raw}" niet gematcht op een medewerker`)
      return null
    }

    const { data: dossierData } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, aanvraag_substatus, offerte_substatus, servicedesk_substatus, verzonden_op, controller_id, bouw7_sync_hash')
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

    // Haal alle offertes op en bouw een map op projectId (meest recente versie per project).
    // Dit is een goedkope lijst-call en gebeurt vóór de fingerprint-bepaling, want de offerte-velden
    // bepalen mede of een dossier is gewijzigd.
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

    // ── Fingerprint + changed-set ─────────────────────────────────────
    // Bereken per project een stabiele fingerprint uit de goedkope lijstvelden (project + gematchte
    // offerte). Is die gelijk aan de opgeslagen `bouw7_sync_hash`, dan is het dossier ongewijzigd en
    // slaan we de dure Athena-/offerte-detail-calls + upsert over. In `full`-modus doen we alles.
    const hashMap = new Map<string, string>()
    const changedIds = new Set<string>()
    for (const p of projects) {
      const key = String(p.id)
      const q = quotationMap.get(key)
      const fp = fingerprint({
        pn:        p.fullProjectNumber ?? p.projectCode ?? p.projectNumber ?? null,
        name:      p.name ?? null,
        contact:   p.contact?.id ?? null,
        pl:        p.projectLeader?.id ?? null,
        wp:        p.workPlanner?.id ?? null,
        ex:        p.executor?.id ?? null,
        cp:        p.contactPerson?.id ?? null,
        start:     p.startDate ?? null,
        end:       p.endDate ?? null,
        street:    p.streetName ?? null,
        hnr:       p.houseNumber ?? null,
        zip:       p.zipCode ?? null,
        city:      p.city ?? null,
        notes:     p.notes ?? null,
        ref:       p.reference ?? null,
        statusId:  p.status?.id ?? null,
        statusNm:  p.status?.name ?? null,
        catId:     p.category?.id ?? null,
        catNm:     p.category?.name ?? null,
        price:     p.fixedPrice ?? null,
        ctrl:      p.caEindverantwoordelijkeOfferte ?? null,
        q:         q ? { id: q.id, date: q.quotationDate ?? null, st: q.quotationStatus?.name ?? null, sub: q.subtotal ?? null, tot: q.total ?? null, emp: q.employee?.id ?? null } : null,
      })
      hashMap.set(key, fp)
      const existing = dossierMap.get(key)
      if (scoped) {
        if (scoped.has(key)) changedIds.add(key) // geforceerd, ongeacht hash
      } else if (mode === 'full' || !existing || existing.bouw7_sync_hash !== fp) {
        changedIds.add(key)
      }
    }
    const changedProjects = projects.filter(p => changedIds.has(String(p.id)))
    result.overgeslagen = scoped ? 0 : projects.length - changedProjects.length

    // Haal Athena project-financial data op — alléén voor changed/new projecten (parallel, batch van 10).
    // budgetAmount / fixedPrice zit in de Athena API, niet in Heimdall.
    const financialMap = new Map<string, Bouw7ProjectFinancial>()
    const ATHENA_BATCH = 10
    for (let i = 0; i < changedProjects.length; i += ATHENA_BATCH) {
      const batch = changedProjects.slice(i, i + ATHENA_BATCH)
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

    // Offerte-details per project: kostprijs (calculationTotal), regelsom en BTW-splitsing
    // uit het detail-endpoint /quotation/{id}. Alléén voor changed/new projecten met een offerte.
    const quoteDetailMap = new Map<string, QuoteCijfers>()
    const quoteDetailsRaw: Bouw7QuotationDetail[] = []
    {
      const entries = changedProjects
        .map(p => [String(p.id), quotationMap.get(String(p.id))] as const)
        .filter((e): e is readonly [string, Bouw7Quotation] => e[1] != null)
      const QUOTE_BATCH = 10
      for (let i = 0; i < entries.length; i += QUOTE_BATCH) {
        const batch = entries.slice(i, i + QUOTE_BATCH)
        const results = await Promise.allSettled(
          batch.map(([, q]) => bouw7.get<Bouw7QuotationDetail>(`/quotation/${q.id}`))
        )
        for (let j = 0; j < batch.length; j++) {
          const r = results[j]
          if (r.status !== 'fulfilled' || !r.value?.chapters) continue
          quoteDetailsRaw.push(r.value)
          quoteDetailMap.set(batch[j][0], berekenQuoteCijfers(r.value, batch[j][1]))
        }
      }
    }

    // BTW-tarieven (Bouw7 leidend) afleiden uit de zojuist opgehaalde offerte-details.
    // Liften mee op deze calls — geen extra API-sweep. Faalt stil zodat de project-sync nooit hangt.
    if (quoteDetailsRaw.length) {
      try {
        const btw = await deriveBtwTarieven(quoteDetailsRaw)
        await supabase.from('sync_log').insert({
          integratie: 'bouw7', entiteit: 'btw_tarieven', richting: 'in',
          aantal_nieuw: btw.nieuw, aantal_bijgewerkt: btw.bijgewerkt, aantal_fout: 0,
          duur_ms: 0, fout_melding: `${btw.gevonden} unieke tarieven uit ${quoteDetailsRaw.length} offertes`,
        })
      } catch (e) {
        await supabase.from('sync_log').insert({
          integratie: 'bouw7', entiteit: 'btw_tarieven', richting: 'in',
          aantal_nieuw: 0, aantal_bijgewerkt: 0, aantal_fout: 1,
          duur_ms: 0, fout_melding: `Fout BTW-afleiding: ${e instanceof Error ? e.message : String(e)}`,
        })
      }
    }
    // Log quotation-diagnose apart zodat fouten zichtbaar zijn in sync_log
    await supabase.from('sync_log').insert({
      integratie: 'bouw7', entiteit: 'quotations', richting: 'in',
      aantal_nieuw: 0, aantal_bijgewerkt: quoteDetailMap.size, aantal_fout: quotationLogInfo.startsWith('Fout') ? 1 : 0,
      duur_ms: 0, fout_melding: `${quotationLogInfo} (${mode}, ${changedProjects.length} changed)`,
    })

    // ── Medewerker-stubs ──────────────────────────────────────────────
    // Zorg dat élke door een project gerefereerde rol-medewerker een EVA-record heeft, ook als
    // /list/employees hem niet teruggaf (bv. inactieve oud-medewerkers). De projectpayload bevat
    // de naam embedded, dus we maken een stub aan en breiden medewerkerMap uit. Zo wordt de
    // rolnaam ALTIJD overgenomen, onafhankelijk van of de medewerker ook een EVA-gebruiker is.
    const medStubs = new Map<string, Record<string, unknown>>()
    const noteMed = (emp?: { id?: number; firstName?: string; lastName?: string; prefix?: string } | null) => {
      if (!emp?.id) return
      const key = String(emp.id)
      if (medewerkerMap.has(key) || medStubs.has(key)) return
      medStubs.set(key, {
        voornaam:          emp.firstName ?? '',
        tussenvoegsel:     emp.prefix ?? null,
        achternaam:        emp.lastName ?? '',
        bouw7_id:          key,
        actief:            true,
        bouw7_laatst_sync: new Date().toISOString(),
        bouw7_sync_status: 'synced',
      })
    }
    for (const p of changedProjects) {
      noteMed(p.projectLeader)
      noteMed(p.workPlanner)
      noteMed(p.executor)
      const q = quotationMap.get(String(p.id))
      if (q?.employee) noteMed(q.employee)
    }
    if (medStubs.size > 0) {
      const stubRows = [...medStubs.values()]
      // medewerkers heeft een volledige unique constraint op bouw7_id → upsert mag
      for (let i = 0; i < stubRows.length; i += 500) {
        await supabase.from('medewerkers').upsert(stubRows.slice(i, i + 500), { onConflict: 'bouw7_id' })
      }
      const { data: med2 } = await supabase
        .from('medewerkers')
        .select('id, bouw7_id')
        .in('bouw7_id', stubRows.map(r => r.bouw7_id as string))
      for (const m of (med2 ?? []) as { id: string; bouw7_id: string }[]) medewerkerMap.set(m.bouw7_id, m.id)
    }

    // ── Projectcontactpersoon-map + stubs ─────────────────────────────
    // Bouw7 levert de contactpersoon direct op het project (`p.contactPerson`). Map die op een
    // EVA-contactpersoon via bouw7_id; ontbreekt hij, maak een stub (uit embedded naam/email/tel)
    // en koppel aan de klant-organisatie. Veel betrouwbaarder dan de org-primair-gok.
    const { data: cpAllData } = await supabase
      .from('contactpersonen')
      .select('id, bouw7_id')
      .not('bouw7_id', 'is', null)
    const cpByBouw7 = new Map<string, string>(
      (cpAllData ?? []).map((c: { id: string; bouw7_id: string }) => [c.bouw7_id, c.id])
    )

    const cpStubs = new Map<string, { row: Record<string, unknown>; orgBouw7Id: string | null }>()
    for (const p of changedProjects) {
      const cp = p.contactPerson
      if (!cp?.id) continue
      const key = String(cp.id)
      if (cpByBouw7.has(key) || cpStubs.has(key)) continue
      cpStubs.set(key, {
        row: {
          voornaam:          cp.firstName ?? '',
          achternaam:        cp.lastName ?? '',
          email:             cp.emailAddress ?? null,
          telefoon:          cp.phoneNumber ?? null,
          bouw7_id:          key,
          bouw7_laatst_sync: new Date().toISOString(),
          bouw7_sync_status: 'synced',
        },
        orgBouw7Id: p.contact?.id ? String(p.contact.id) : null,
      })
    }
    if (cpStubs.size > 0) {
      // contactpersonen heeft een partiële unique index op bouw7_id → geen onConflict; plain insert
      // (stubs zijn per definitie nieuw, want ze ontbreken in cpByBouw7).
      const stubRows = [...cpStubs.values()].map(s => s.row)
      for (let i = 0; i < stubRows.length; i += 500) {
        await supabase.from('contactpersonen').insert(stubRows.slice(i, i + 500))
      }
      const { data: cp2 } = await supabase
        .from('contactpersonen')
        .select('id, bouw7_id')
        .in('bouw7_id', stubRows.map(r => r.bouw7_id as string))
      for (const c of (cp2 ?? []) as { id: string; bouw7_id: string }[]) cpByBouw7.set(c.bouw7_id, c.id)

      // Koppel nieuwe stubs aan hun klant-organisatie (voor het org-contactenoverzicht).
      const koppels = [...cpStubs.values()]
        .map(s => ({
          contactpersoon_id: cpByBouw7.get(s.row.bouw7_id as string),
          organisatie_id:    s.orgBouw7Id ? relatieMap.get(s.orgBouw7Id) : undefined,
          is_primair:        false,
        }))
        .filter((k): k is { contactpersoon_id: string; organisatie_id: string; is_primair: boolean } =>
          k.contactpersoon_id != null && k.organisatie_id != null)
      for (let i = 0; i < koppels.length; i += 500) {
        await supabase
          .from('contactpersoon_organisaties')
          .upsert(koppels.slice(i, i + 500), { onConflict: 'contactpersoon_id,organisatie_id', ignoreDuplicates: true })
      }
    }

    const bouw7IdsInResponse = new Set(projects.map(p => String(p.id)))
    const rows: Record<string, unknown>[] = []
    // Servicedesk-substatuswijzigingen voor de doorlooptijd-historie (na de upsert weggeschreven).
    const substatusWijzigingen: { bouw7_id: string; substatus: string }[] = []

    for (const p of changedProjects) {
      const bouw7IdStr = String(p.id)
      const existing = dossierMap.get(bouw7IdStr)

      const quote = quotationMap.get(bouw7IdStr)
      const fin   = financialMap.get(bouw7IdStr)

      const evaStatus = mapBouw7NaarEvaStatus(
        p.status?.name,
        p.category?.name,
        existing?.aanvraag_substatus ?? null,
        existing?.offerte_substatus ?? null,
        existing?.verzonden_op ?? null,
        quote?.quotationStatus?.name ?? null,
      )

      // Servicedesk: log een substatuswijziging (basis voor doorlooptijd-per-fase).
      if (evaStatus.servicedesk_substatus
          && existing?.servicedesk_substatus !== evaStatus.servicedesk_substatus) {
        substatusWijzigingen.push({ bouw7_id: bouw7IdStr, substatus: evaStatus.servicedesk_substatus })
      }

      const det = quoteDetailMap.get(bouw7IdStr)
      const finPrijs = extractFinNum(fin?.fixedPrice) ?? extractFinNum(fin?.revenue?.budgeted)
      const quoteSubtotal = extractFinNum(quote?.subtotal)
      // De offerte is de financiële bron als er geen Athena-contractbedrag is, of als dat
      // contractbedrag aansluit op deze offerte: gelijk aan het offerte-subtotaal, of gelijk
      // aan de regelsom (Athena fixedPrice is de regelsom zónder AK/W&R-opslagen).
      // Zo blijft een losse deelofferte/meerwerk-offerte buiten beschouwing.
      const quoteIsBron = quoteSubtotal != null && (
        finPrijs == null
        || Math.abs(finPrijs - quoteSubtotal) < 0.01
        || (det?.regelsom != null && Math.abs(finPrijs - det.regelsom) < 0.01)
      )
      // Verkoopprijs excl. BTW = offerte "Totaal excl. BTW" (incl. AK/W&R), anders contractbedrag.
      const verkoopExcl = quoteIsBron
        ? quoteSubtotal
        : (finPrijs ?? extractFinNum(p.fixedPrice) ?? null)
      const verkoopIncl = quoteIsBron ? extractFinNum(quote?.total) : null
      // Kostprijs en BTW-splitsing horen bij dezelfde offerte als de verkoopprijs.
      const kostprijs    = quoteIsBron ? (det?.kostprijs ?? null) : null
      const btwSplitsing = quoteIsBron ? (det?.btwSplitsing ?? null) : null

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
                                    // Voorkeur: de contactpersoon die direct op het Bouw7-project staat.
                                    if (p.contactPerson?.id) {
                                      const direct = cpByBouw7.get(String(p.contactPerson.id))
                                      if (direct) return direct
                                    }
                                    // Fallback: primaire contactpersoon van de klant-organisatie.
                                    const evaKlantId = p.contact?.id ? (relatieMap.get(String(p.contact.id)) ?? null) : null
                                    return evaKlantId ? (contactpersoonMap.get(evaKlantId) ?? null) : null
                                  })(),
        // Custom attribute "Eindverantwoordelijke offerte" (vrije tekst, alleen in de Offerte-fase)
        // → rol Controller. Vult/overschrijft bij een gevulde, matchende naam; valt anders terug op
        // de bestaande (eventueel handmatig gezette) controller. Het veld blijft in de UI bewerkbaar.
        controller_id:            matchControllerUitCa(p.caEindverantwoordelijkeOfferte) ?? existing?.controller_id ?? null,
        bedrag_excl_btw:          verkoopExcl,
        bedrag_incl_btw:          verkoopIncl,
        kostprijs_excl_btw:       kostprijs,
        btw_splitsing:            btwSplitsing,
        verwacht_startdatum:      p.startDate ?? null,
        verwacht_einddatum:       p.endDate ?? null,
        bouw7_aanmaakdatum:       p.createdAt ?? null,
        werkadres_straat:         [p.streetName, p.houseNumber].filter(Boolean).join(' ') || null,
        werkadres_postcode:       p.zipCode ?? null,
        werkadres_stad:           p.city ?? null,
        // Bouw7-`reference` hoort in het EVA-veld `referentie` (kenmerk opdrachtgever), niet als
        // opmerking. `notes` is in de praktijk altijd leeg maar blijft gemapt voor de toekomst.
        referentie:               p.reference ?? existing?.referentie ?? null,
        opmerkingen:              p.notes ?? null,
        bouw7_projectstatus_id:   p.status?.id ?? null,
        bouw7_projectstatus_naam: p.status?.name ?? null,
        bouw7_quotation_status:   quote?.quotationStatus?.name ?? null,
        bouw7_categorie_id:       p.category?.id ?? null,
        bouw7_categorie_naam:     p.category?.name ?? null,
        categorie:                p.category?.name ?? null,
        bouw7_id:                 bouw7IdStr,
        bouw7_sync_hash:          hashMap.get(bouw7IdStr) ?? null,
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

    // Doorlooptijd-historie: schrijf de servicedesk-substatuswijzigingen weg (bron='sync').
    if (substatusWijzigingen.length > 0) {
      const { data: dossierIds } = await supabase
        .from('dossiers')
        .select('id, bouw7_id')
        .in('bouw7_id', substatusWijzigingen.map(w => w.bouw7_id))
      const idMap = new Map<string, string>(
        (dossierIds ?? []).map((d: any) => [d.bouw7_id as string, d.id as string]),
      )
      const historieRows = substatusWijzigingen
        .map(w => ({ dossier_id: idMap.get(w.bouw7_id), substatus: w.substatus, bron: 'sync' }))
        .filter((r): r is { dossier_id: string; substatus: string; bron: string } => !!r.dossier_id)
      for (let i = 0; i < historieRows.length; i += 500) {
        await supabase.from('dossier_substatus_historie').insert(historieRows.slice(i, i + 500))
      }
    }

    // Zachte delete: dossiers die niet meer in Bouw7 staan markeren.
    // Overslaan bij een scoped run (ververs één dossier) — we keken dan niet naar de hele set.
    const toDeactivate = scoped ? [] : (dossierData ?? [])
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

    // De DB-trigger heeft dossier-events ge-enqueued voor dossiers die via de sync wijzigden;
    // evalueer alle triggers en activeer (write-path-onafhankelijk vangnet).
    await verwerkDossierTriggers().catch(() => {})
  } catch (e: unknown) {
    result.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
    result.fouten++
  }

  await logSync('dossiers', 'in', result, Date.now() - start)
  return result
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * SYNC: Verkoopfacturen → Debiteuren (openstaande verkoopfacturen)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Sync alle OPENSTAANDE verkoopfacturen uit Bouw7 naar `public.debiteuren`.
 *
 * Bron: globale `GET /list/invoices` met q-DSL `datePaid IS NULL AND isCredit = false`
 * (geverifieerd: de factuur bevat dan zélf het `project`-object → koppeling aan dossier/
 * projectleider zonder per-project calls). Concept-facturen (zonder `invoiceNumber`,
 * Bouw7 status 3 / "Lopende bonnen") zijn nog geen debiteur en worden overgeslagen.
 *
 * Belangrijk: de **opvolging-kolommen** (reden/actie/actiehouder/datums/opvolgstatus/
 * task_id/logboek) worden NOOIT door de sync aangeraakt — bij bestaande rijen werken we
 * uitsluitend de Bouw7-bronkolommen bij. Facturen die niet meer in de open-lijst staan
 * (betaald/gecrediteerd) worden zacht afgesloten (`status='betaald'`), niet verwijderd,
 * zodat opvolging + logboek bewaard blijven.
 */
export async function syncDebiteuren(opts?: { mode?: SyncMode }): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const nu = new Date()
  const vandaag = nu.toISOString().slice(0, 10)

  try {
    const bouw7 = await getBouw7Client()
    const resp = await bouw7.get<Bouw7ListResponse<Bouw7SalesInvoice>>('/list/invoices', {
      q: 'datePaid IS NULL AND isCredit = false SORT(dueDate, ASC) LIMIT 5000',
    })
    // Alleen daadwerkelijk uitgegeven facturen zijn debiteuren (concept = geen factuurnummer).
    const facturen = (resp.items ?? []).filter(inv => !!inv.invoiceNumber && !inv.isCredit && !inv.datePaid)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // Prefetch koppelmaps: project → dossier/projectleider, contact → relatie.
    const { data: dossierRows } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, titel, project_manager_id')
      .not('bouw7_id', 'is', null)
    const dossierByProject = new Map<string, { id: string; titel: string | null; project_manager_id: string | null }>(
      (dossierRows ?? [])
        .filter((d: { bouw7_id: string | null }) => d.bouw7_id != null)
        .map((d: { id: string; bouw7_id: string; titel: string | null; project_manager_id: string | null }) =>
          [d.bouw7_id, { id: d.id, titel: d.titel, project_manager_id: d.project_manager_id }])
    )

    const { data: relatieRows } = await supabase
      .from('relaties')
      .select('id, bouw7_id')
      .not('bouw7_id', 'is', null)
    const relatieByBouw7 = new Map<string, string>(
      (relatieRows ?? [])
        .filter((r: { bouw7_id: string | null }) => r.bouw7_id != null)
        .map((r: { id: string; bouw7_id: string }) => [r.bouw7_id, r.id])
    )

    // Bestaande debiteuren: id + hash + status, voor change-detectie en zacht afsluiten.
    const { data: bestaand } = await supabase
      .from('debiteuren')
      .select('id, bouw7_invoice_id, bouw7_sync_hash, status')
    const bestaandByInvoice = new Map<string, { id: string; bouw7_sync_hash: string | null; status: string }>(
      (bestaand ?? []).map((d: { id: string; bouw7_invoice_id: string; bouw7_sync_hash: string | null; status: string }) =>
        [d.bouw7_invoice_id, { id: d.id, bouw7_sync_hash: d.bouw7_sync_hash, status: d.status }])
    )

    const openInvoiceIds = new Set<string>()

    // Bouw rijen op (alleen Bouw7-bronkolommen).
    const allRows = facturen.map(inv => {
      const invoiceId = String(inv.id)
      openInvoiceIds.add(invoiceId)
      const projectId = inv.project?.id != null ? String(inv.project.id) : null
      const dossier = projectId ? dossierByProject.get(projectId) : undefined
      const relatieId = inv.contact?.id != null ? relatieByBouw7.get(String(inv.contact.id)) ?? null : null
      const bedrag = inv.total != null ? Number(inv.total) : null
      const hash = fingerprint({
        nr:   inv.invoiceNumber ?? null,
        st:   inv.status ?? null,
        cont: inv.contact?.id ?? null,
        proj: projectId,
        bed:  bedrag,
        fd:   toDate(inv.date),
        vd:   toDate(inv.dueDate),
      })
      return {
        invoiceId,
        bron: {
          bouw7_invoice_id:  invoiceId,
          bouw7_project_id:  projectId,
          factuurnummer:     inv.invoiceNumber ?? null,
          klant_naam:        inv.contact?.name ?? null,
          klant_relatie_id:  relatieId,
          project_titel:     inv.project?.name ?? dossier?.titel ?? null,
          dossier_id:        dossier?.id ?? null,
          projectleider_id:  dossier?.project_manager_id ?? null,
          bedrag,
          factuurdatum:      toDate(inv.date),
          vervaldatum:       toDate(inv.dueDate),
          datum_betaald:     toDate(inv.datePaid),
          is_credit:         false,
          bouw7_status:      inv.status ?? null,
          bouw7_sync_hash:   hash,
          bouw7_laatst_sync: nu.toISOString(),
        },
      }
    })

    // Splits in nieuw (insert) en bestaand (update). Bij bestaand: incrementeel overslaan bij gelijke hash.
    const nieuweRows = allRows.filter(r => !bestaandByInvoice.has(r.invoiceId))
    const bestaandeRows = allRows.filter(r => bestaandByInvoice.has(r.invoiceId))
    const teUpdaten = mode === 'full'
      ? bestaandeRows
      : bestaandeRows.filter(r => bestaandByInvoice.get(r.invoiceId)?.bouw7_sync_hash !== r.bron.bouw7_sync_hash)

    result.nieuw = nieuweRows.length
    result.bijgewerkt = teUpdaten.length
    result.overgeslagen = bestaandeRows.length - teUpdaten.length

    // Nieuwe debiteuren: insert mét status='open' + default opvolging.
    const inserts = nieuweRows.map(r => ({ ...r.bron, status: 'open' }))
    for (let i = 0; i < inserts.length; i += 500) {
      const { error } = await supabase.from('debiteuren').insert(inserts.slice(i, i + 500))
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // Bestaande debiteuren: update UITSLUITEND de Bouw7-bronkolommen (opvolging blijft ongemoeid).
    for (const r of teUpdaten) {
      const { error } = await supabase
        .from('debiteuren')
        .update(r.bron)
        .eq('bouw7_invoice_id', r.invoiceId)
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // Zacht afsluiten: openstaande debiteuren die niet meer in de Bouw7-open-lijst zitten → betaald.
    const teSluiten = (bestaand ?? [])
      .filter((d: { bouw7_invoice_id: string; status: string }) =>
        d.status === 'open' && !openInvoiceIds.has(d.bouw7_invoice_id))
      .map((d: { id: string }) => d.id)
    for (let i = 0; i < teSluiten.length; i += 500) {
      const { error } = await supabase
        .from('debiteuren')
        .update({ status: 'betaald', datum_betaald: vandaag, bouw7_laatst_sync: nu.toISOString() })
        .in('id', teSluiten.slice(i, i + 500))
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // ── Auto-taken (>60 dagen) + reminders (verlopen opvolgdatum) ───────────────
    await verwerkDebiteurTakenEnReminders(supabase, nu, vandaag, result)
  } catch (e: unknown) {
    result.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
    result.fouten++
  }

  await logSync('debiteuren', 'in', result, Date.now() - start)
  return result
}

/** Auth-id's van administratie/MT (financieel schrijven/beheren via afdeling óf override, of beheerder). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getAdministratieAuthIds(supabase: any): Promise<string[]> {
  const ids = new Set<string>()
  const { data: afd } = await supabase
    .from('medewerker_afdelingen').select('naam, standaard_rechten').eq('actief', true)
  const adminAfd = new Set<string>(
    (afd ?? [])
      .filter((a: { standaard_rechten: Record<string, string> | null }) =>
        ['schrijven', 'beheren'].includes(a.standaard_rechten?.financieel ?? ''))
      .map((a: { naam: string }) => a.naam))
  const { data: mws } = await supabase
    .from('medewerkers').select('auth_user_id, afdeling, rechten_override').eq('actief', true).not('auth_user_id', 'is', null)
  for (const m of mws ?? []) {
    const ro = (m.rechten_override ?? {}) as Record<string, string>
    const heeft = (m.afdeling && adminAfd.has(m.afdeling))
      || ['schrijven', 'beheren'].includes(ro.financieel ?? '')
      || ro.instellingen === 'beheren'
    if (heeft && m.auth_user_id) ids.add(m.auth_user_id as string)
  }
  return [...ids]
}

/**
 * Maakt automatisch een opvolgtaak (>60 dagen te laat, deadline +7) per openstaande debiteur die er
 * nog geen heeft, toegewezen aan de projectleider — of ontoegewezen mét administratie-signaal als er geen
 * projectleider is. Stuurt daarnaast in-app reminders zodra de opvolgdatum is verstreken. Dedupe via
 * `task_id` (taken) en `laatste_reminder_op` (reminders).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function verwerkDebiteurTakenEnReminders(supabase: any, nu: Date, vandaag: string, result: SyncResult): Promise<void> {
  const vandaagMs = Date.parse(`${vandaag}T00:00:00Z`)
  const deadline7 = new Date(nu.getTime() + 7 * 86_400_000).toISOString().slice(0, 10)

  const administratieAuthIds = await getAdministratieAuthIds(supabase)
  const { data: mwAuth } = await supabase
    .from('medewerkers').select('id, auth_user_id').not('auth_user_id', 'is', null)
  const authByMw = new Map<string, string>(
    (mwAuth ?? [])
      .filter((m: { auth_user_id: string | null }) => m.auth_user_id != null)
      .map((m: { id: string; auth_user_id: string }) => [m.id, m.auth_user_id]))

  const { data: openDeb } = await supabase
    .from('debiteuren')
    .select('id, factuurnummer, klant_naam, bedrag, vervaldatum, opvolgdatum, dossier_id, projectleider_id, task_id, laatste_reminder_op')
    .eq('status', 'open')

  type OpenDeb = {
    id: string; factuurnummer: string | null; klant_naam: string | null; bedrag: number | null
    vervaldatum: string | null; opvolgdatum: string | null; dossier_id: string | null
    projectleider_id: string | null; task_id: string | null; laatste_reminder_op: string | null
  }

  async function notify(userIds: string[], titel: string, body: string) {
    for (const uid of userIds) {
      await supabase.from('notificaties').insert({ user_id: uid, type: 'debiteur', titel, body, url: '/facturen', gelezen: false })
    }
  }

  for (const d of (openDeb ?? []) as OpenDeb[]) {
    const dagenTeLaat = d.vervaldatum ? Math.floor((vandaagMs - Date.parse(`${d.vervaldatum}T00:00:00Z`)) / 86_400_000) : 0
    const plAuth = d.projectleider_id ? (authByMw.get(d.projectleider_id) ?? null) : null

    // 1. Auto-taak bij >60 dagen zonder bestaande taak.
    if (dagenTeLaat > 60 && !d.task_id) {
      const titel = `Debiteur >60 dagen te laat: ${d.factuurnummer ?? 'factuur'}${d.klant_naam ? ' — ' + d.klant_naam : ''}`
      const { data: taak, error: taakErr } = await supabase
        .from('tasks')
        .insert({
          titel,
          dossier_id: d.dossier_id ?? null,
          status: 'open',
          prioriteit: 'hoog',
          deadline: deadline7,
          omschrijving: { bron: 'debiteurenbeheer', debiteur_id: d.id, bedrag: d.bedrag, vervaldatum: d.vervaldatum },
        })
        .select('id')
        .single()
      if (taakErr || !taak) { result.fouten++; result.foutMelding = taakErr?.message ?? 'Debiteurtaak aanmaken mislukt'; continue }

      if (plAuth) {
        await supabase.from('task_assignees').insert({ task_id: taak.id, user_id: plAuth, rol: 'verantwoordelijke' })
      }
      await supabase.from('debiteuren').update({ task_id: taak.id }).eq('id', d.id)

      const body = `Factuur ${d.factuurnummer ?? ''} (${d.klant_naam ?? ''}) is meer dan 60 dagen te laat. Vul de verplichte opvolging in.`
      if (plAuth) await notify([plAuth], 'Debiteur >60 dagen te laat', body)
      else await notify(administratieAuthIds, 'Onbeheerde debiteur >60 dagen te laat', `${body} (geen projectleider gekoppeld)`)
    }

    // 2. Reminder zodra de opvolgdatum is verstreken (dedupe via laatste_reminder_op).
    if (d.opvolgdatum && d.opvolgdatum < vandaag && (!d.laatste_reminder_op || d.laatste_reminder_op < d.opvolgdatum)) {
      const ontvangers = plAuth ? [plAuth] : administratieAuthIds
      await notify(ontvangers, 'Opvolgdatum debiteur verstreken',
        `De opvolgdatum (${d.opvolgdatum}) voor factuur ${d.factuurnummer ?? ''} (${d.klant_naam ?? ''}) is verstreken.`)
      await supabase.from('debiteuren').update({ laatste_reminder_op: vandaag }).eq('id', d.id)
    }
  }
}

