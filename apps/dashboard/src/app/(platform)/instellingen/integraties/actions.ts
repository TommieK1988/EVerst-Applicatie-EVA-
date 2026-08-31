'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { syncContacts, syncEmployees, syncDaysOff, syncProjects, syncDebiteuren, syncOfferteHerinneringen, syncBouw7Todos, syncDossierNotities, syncMeerwerk, type SyncResult, type SyncContactsResult, type SyncMode } from '@/lib/bouw7/sync'
import { syncAllPlanning, syncDossierPlanning } from '@/lib/bouw7/sync-planning'
import { ververseSubstatussen, type SubstatusVerversResult } from '@/lib/bouw7/substatus-attr'
import { vergeetBouw7Config } from '@/lib/bouw7/config'

type Integratie = {
  id: string
  naam: string
  actief: boolean
  config: Record<string, string>
  laatst_sync: string | null
  laatst_sync_status: string | null
}

export type LoadResult =
  | { ok: true; data: Integratie | null }
  | { ok: false; error: string; missingTable?: boolean }

export async function loadBouw7Config(): Promise<LoadResult> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('integraties')
    .select('*')
    .eq('naam', 'bouw7')
    .maybeSingle()

  if (error) {
    const missing = /does not exist|not found in the schema/i.test(error.message)
    return { ok: false, error: error.message, missingTable: missing }
  }
  return { ok: true, data: data as Integratie | null }
}

export type SaveResult = { ok: true } | { ok: false; error: string }

export async function saveBouw7Config(formData: FormData): Promise<SaveResult> {
  const apiKey = (formData.get('api_key') as string || '').trim()
  if (!apiKey) return { ok: false, error: 'API key is verplicht.' }
  const appName = (formData.get('app_name') as string || '').trim()
  if (!appName) return { ok: false, error: 'App-naam is verplicht.' }

  const existingId = formData.get('id') as string | null
  const supabase = createAdminClient()

  const payload = {
    naam: 'bouw7',
    actief: true,
    config: { api_key: apiKey, app_name: appName },
  }

  const query = existingId
    ? supabase.from('integraties').update(payload).eq('id', existingId)
    : supabase.from('integraties').insert(payload)

  const { error } = await query
  if (error) return { ok: false, error: error.message }

  // De config wordt per serverinstantie kort gecachet; na een wijziging meteen laten vallen zodat
  // een nieuwe sleutel niet pas na de TTL in gebruik wordt genomen.
  vergeetBouw7Config()
  revalidatePath('/instellingen/integraties')
  return { ok: true }
}

export async function testBouw7Connection(): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()

    if (!data) return { ok: false, error: 'Bouw7 is nog niet geconfigureerd.' }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)
    await client.login()

    const org = await client.get<{ name: string }>('/organization')

    // Update laatst_sync
    await supabase
      .from('integraties')
      .update({ laatst_sync: new Date().toISOString(), laatst_sync_status: 'verbonden' })
      .eq('naam', 'bouw7')

    revalidatePath('/instellingen/integraties')
    return { ok: true, message: `Verbonden met: ${org.name ?? 'Bouw7 organisatie'}` }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verbinding mislukt' }
  }
}

export type RunSyncResult =
  | { ok: true; contacts: SyncContactsResult; employees: SyncResult; daysOff: SyncResult; projects: SyncResult; planning: SyncResult; debiteuren: SyncResult; herinneringen: SyncResult; todos: SyncResult; notities: SyncResult; meerwerk: SyncResult }
  | { ok: false; error: string }

export async function runFullSync(mode: SyncMode = 'incremental'): Promise<RunSyncResult> {
  try {
    // Sync in volgorde: contacts → employees → projects → planning → debiteuren
    // (projects en planning hebben FK refs naar medewerkers/dossiers; debiteuren koppelt
    // facturen aan dossier/projectleider en moet dus ná projects draaien).
    // `incremental` (default): alleen gewijzigde records doen detail-calls + writes.
    const contacts = await syncContacts({ mode })
    const employees = await syncEmployees({ mode })
    const daysOff = await syncDaysOff({ mode })
    const projects = await syncProjects({ mode })
    const planning = await syncAllPlanning({ mode })
    const debiteuren = await syncDebiteuren({ mode })
    // Bouw7-aantekeningen op het dossier (koppelen op bouw7_id → ná syncProjects).
    // Herinneringen + to-do's zijn goedkope bulk; notities alleen bij full-sync (detail-call per dossier).
    const herinneringen = await syncOfferteHerinneringen({ mode })
    const todos = await syncBouw7Todos({ mode })
    const notities = await syncDossierNotities({ mode })
    const meerwerk = await syncMeerwerk({ mode })

    const totaalNieuw = contacts.organisaties.nieuw + contacts.contactpersonen.nieuw + employees.nieuw + daysOff.nieuw + projects.nieuw + planning.nieuw + debiteuren.nieuw + herinneringen.nieuw + todos.nieuw + notities.nieuw + meerwerk.nieuw
    const totaalBijgewerkt = contacts.organisaties.bijgewerkt + contacts.contactpersonen.bijgewerkt + employees.bijgewerkt + daysOff.bijgewerkt + projects.bijgewerkt + planning.bijgewerkt + debiteuren.bijgewerkt + herinneringen.bijgewerkt + todos.bijgewerkt + notities.bijgewerkt + meerwerk.bijgewerkt

    const supabase = createAdminClient()
    await supabase
      .from('integraties')
      .update({
        laatst_sync: new Date().toISOString(),
        laatst_sync_status: `${totaalNieuw} nieuw, ${totaalBijgewerkt} bijgewerkt`,
      })
      .eq('naam', 'bouw7')

    revalidatePath('/instellingen/integraties')
    return { ok: true, contacts, employees, daysOff, projects, planning, debiteuren, herinneringen, todos, notities, meerwerk }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sync mislukt' }
  }
}

export type SyncEnkelDossierResult =
  | { ok: true; projects: SyncResult; planning: SyncResult }
  | { ok: false; error: string }

/**
 * Ververs één dossier direct vanuit Bouw7 (knop op de dossierpagina). Forceert de sync van precies
 * dit dossier — dossiervelden + financiën + offerte én de planning — zonder de hele set over te halen.
 * Hergebruikt syncProjects (scoped op dit ene bouw7_id) en syncDossierPlanning (mode 'full').
 */
export async function syncEnkelDossier(dossierId: string): Promise<SyncEnkelDossierResult> {
  try {
    const supabase = createAdminClient()
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('bouw7_id')
      .eq('id', dossierId)
      .maybeSingle()

    const bouw7Id = (dossier as { bouw7_id: string | null } | null)?.bouw7_id
    if (!bouw7Id) return { ok: false, error: 'Dit dossier heeft geen Bouw7-koppeling.' }

    const ids = [String(bouw7Id)]
    const projects = await syncProjects({ onlyBouw7Ids: ids })
    const planning = await syncDossierPlanning(dossierId, { mode: 'full' })
    // Bouw7-aantekeningen op dit dossier meepakken (scoped op dit ene bouw7_id).
    await syncOfferteHerinneringen({ onlyBouw7Ids: ids })
    await syncBouw7Todos({ onlyBouw7Ids: ids })
    await syncDossierNotities({ onlyBouw7Ids: ids })
    await syncMeerwerk({ onlyBouw7Ids: ids })

    revalidatePath(`/dossiers/${dossierId}`)
    return { ok: true, projects, planning }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verversen mislukt' }
  }
}

/**
 * Ververs alleen het gedeelde substatusveld ("Offerte Sub-status") van de aanvraag-/offerte-dossiers.
 * Wordt afgevuurd bij het openen van de Aanvragen- en Offertes-pagina: de tweede Bouw7-app schrijft
 * hetzelfde veld en kan niet op de cron wachten, dus moet de lijst bij openen de verse stand tonen.
 * Eén Bouw7-call, geen detail-calls — zie `lib/bouw7/substatus-attr.ts`.
 */
/**
 * Hoe lang een verse read uit Bouw7 meegaat voordat het openen van een lijst er weer een doet.
 * De read kost een `GET /list/projects` over álle projecten (~1,3 MB, bijna een seconde); dat bij
 * elk paginabezoek doen betekende dat wie tussen Aanvragen en Offertes heen en weer klikt Bouw7
 * blijft bevragen voor een veld dat hooguit een paar keer per dag verandert.
 */
const AUTO_VERVERS_MARGE_MS = 5 * 60_000

/** Sleutel waaronder het moment van de laatste automatische verse read in `sync_log` staat. */
const AUTO_VERVERS_ENTITEIT = 'substatus-auto'

/** Wanneer draaide de automatische verse read voor het laatst? Null = nog nooit. */
async function laatsteAutoVervers(): Promise<Date | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('sync_log')
    .select('uitgevoerd_op')
    .eq('integratie', 'bouw7')
    .eq('entiteit', AUTO_VERVERS_ENTITEIT)
    .order('uitgevoerd_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  const iso = data?.uitgevoerd_op
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

export async function ververseSubstatussenActie(
  scope: 'aanvraag' | 'offerte',
  /**
   * Automatische verversing bij het openen van een lijst: sla over als de vorige nog vers is.
   * De handmatige route ("Bouw7 volgen" bij een conflict) laat dit uit — daar vráágt iemand
   * expliciet om de actuele stand en mag een marker van vier minuten geleden niets blokkeren.
   */
  opties: { alleenBijVerouderd?: boolean } = {},
): Promise<SubstatusVerversResult> {
  if (opties.alleenBijVerouderd) {
    const laatste = await laatsteAutoVervers()
    if (laatste && Date.now() - laatste.getTime() < AUTO_VERVERS_MARGE_MS) {
      return { ok: true, bijgewerkt: 0 }
    }
    // Marker vóór de Bouw7-call wegschrijven, niet erna: twee collega's die tegelijk de lijst
    // openen zouden anders allebei de volledige projectlijst ophalen.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    await supabase.from('sync_log').insert({
      integratie: 'bouw7',
      entiteit:   AUTO_VERVERS_ENTITEIT,
      richting:   'in',
    })
  }

  const res = await ververseSubstatussen(scope)
  if (res.ok && res.bijgewerkt > 0) {
    revalidatePath('/aanvragen')
    revalidatePath('/offertes')
  }
  return res
}

export type QuotationDebugResult =
  | { ok: true; endpoint: string; totaal: number; gemapped: number; velden: string; sample: unknown }
  | { ok: false; error: string }

export async function debugBouw7Quotations(): Promise<QuotationDebugResult> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()
    if (!data) return { ok: false, error: 'Bouw7 niet geconfigureerd.' }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)

    for (const endpoint of ['/list/quotations', '/list/offers', '/list/calculaties', '/list/offertes']) {
      try {
        const res = await client.get<{ items?: unknown[]; count?: number }>(endpoint, { limit: '5', offset: '0' })
        const items: unknown[] = Array.isArray(res) ? res : (res.items ?? [])
        const velden = items[0] ? Object.keys(items[0] as object).join(', ') : 'geen records'
        const gemapped = items.filter((q: unknown) => (q as Record<string,unknown>)?.projectId != null).length
        return { ok: true, endpoint, totaal: res.count ?? items.length, gemapped, velden, sample: items[0] ?? null }
      } catch { continue }
    }
    return { ok: false, error: 'Geen werkend quotation-endpoint gevonden (/list/quotations, /list/offers, /list/calculaties, /list/offertes)' }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fout' }
  }
}

export type ProjectDebugResult =
  | { ok: true; velden: string; sample: unknown }
  | { ok: false; error: string }

export async function debugBouw7Projects(): Promise<ProjectDebugResult> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()
    if (!data) return { ok: false, error: 'Bouw7 niet geconfigureerd.' }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)

    // Haal eerste project-id op uit Heimdall om te gebruiken bij Athena
    const results: string[] = []
    let projectId: number | null = 3814667 // bekende VvE Hoefbladlaan id als fallback

    try {
      const list = await client.get<{ items?: { id: number }[]; count?: number }>('/list/projects', { limit: '1', offset: '0' })
      const firstId = (Array.isArray(list) ? (list as { id: number }[])[0] : list?.items?.[0])?.id
      if (firstId) projectId = firstId
    } catch (e) { results.push(`list: ${e instanceof Error ? e.message : String(e)}`) }

    // Probeer Athena project-financial endpoint (budgetAmount zit hier)
    for (const path of [
      `/project-financial/${projectId}`,
      `/project-control/${projectId}/cost-type/total`,
    ]) {
      try {
        const item = await client.getAthena<unknown>(path)
        if (!item || typeof item !== 'object') continue
        const velden = Object.keys(item as object).join(', ')
        const hasBudget = velden.toLowerCase().includes('budget')
        return { ok: true, velden: `[athena${path}] ${velden}${hasBudget ? ' ✓ BUDGET GEVONDEN' : ''}`, sample: item }
      } catch (e) { results.push(`athena${path}: ${e instanceof Error ? e.message : String(e)}`); continue }
    }

    return { ok: false, error: results.join(' | ') }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fout' }
  }
}

/**
 * Fase-0 schrijftest (zie WRITE-ENDPOINTS.md). Toetst of onze Bouw7 API-key
 * schrijfrechten heeft, **zonder data te wijzigen**: leest de huidige interne
 * notitie van een (test)project en schrijft exact dezelfde waarde terug via
 * `POST /project/set-internal-note`. Slaagt → write-scope aanwezig. 401/403 → niet.
 */
export type WriteCheckResult =
  | { ok: true; projectId: number; message: string }
  | { ok: false; error: string }

export async function verifyBouw7WriteAccess(projectId?: number): Promise<WriteCheckResult> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()
    if (!data) return { ok: false, error: 'Bouw7 is nog niet geconfigureerd.' }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)

    // Kies een testproject: meegegeven id, anders het eerste uit de lijst.
    let id = projectId ?? null
    if (id == null) {
      const list = await client.get<{ items?: { id: number }[] }>('/list/projects', { limit: '1', offset: '0' })
      id = (Array.isArray(list) ? (list as { id: number }[])[0] : list?.items?.[0])?.id ?? null
    }
    if (id == null) return { ok: false, error: 'Geen project gevonden om de schrijftest op uit te voeren.' }

    // Huidige interne notitie lezen, zodat we 'm onveranderd kunnen terugschrijven.
    // Response kan het project direct zijn of in `items[0]` zitten.
    const project = await client.get<Record<string, unknown>>(`/project/${id}`)
    const root = (Array.isArray(project.items) ? project.items[0] : project) as Record<string, unknown>
    const current = (root?.note as string | null | undefined) ?? null

    // Zelfde waarde terugschrijven — idempotent, geen feitelijke wijziging.
    await client.post('/project/set-internal-note', { id, note: current })

    return {
      ok: true,
      projectId: id,
      message: `Schrijftoegang bevestigd op project ${id} (interne notitie ongewijzigd teruggeschreven).`,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    // 401/403 = geen write-scope op de key.
    if (/\b40[13]\b/.test(msg)) {
      return { ok: false, error: `Geen schrijfrechten op de API-key (${msg}). Genereer in Bouw7 een key mét schrijf-scope.` }
    }
    return { ok: false, error: msg }
  }
}

/**
 * Schrijft één of meer **bestelregels** (verwachte-kosten-regels) naar Bouw7 via het
 * ongedocumenteerde `POST /contract-order-line` (Heimdall). Dit is exact het regeltype dat de
 * EVA Financieel-tab al teruglez­t als "Verwachte kosten" (`GET /list/contract-order-lines`),
 * gesommeerd per `projectSecurityLink.code`. Door een PSL-id mee te geven landt de regel
 * op de juiste bewakingscode en telt 'ie mee in de verwachte kosten van die code.
 *
 * LET OP: gebruik NIET `POST /project/{project}/contract-order-line` (het gedocumenteerde,
 * deprecated endpoint) — dat is material-only en weigert een arbeid-/OA-PSL. Zie
 * WRITE-ENDPOINTS.md §2b. Bouw7 berekent `totalPrice` zelf uit quantity × unitPrice.
 */
export type Bestelregel = {
  description: string
  /** Aantal als string, bv. "1". */
  quantity: string
  /** Stukprijs (kostprijs) als string, bv. "100.00". */
  unitPrice: string
  unit?: string
  articleNumber?: string
  /** Bewakingscode-koppeling (PSL-id) — zo landt de regel op de juiste code. */
  projectSecurityLinkId?: number
  /** Optioneel: leverancier (contact-id). */
  contactId?: number
  /**
   * Kostentype van de regel (eigen, nul-gebaseerde enum: 0 Materiaal · 1 Onderaanneming ·
   * 2 Arbeid · 3 Materieel · 4 Overig). Moet passen bij de kostensoort van de PSL
   * (0→ct5, 1→ct3, 2→ct1, 3→ct4). Weggelaten = 0 (Materiaal).
   */
  costType?: number
}

export type CreateBestelregelsResult =
  | { ok: true; aangemaakt: number; resultaten: unknown[]; message: string }
  | { ok: false; error: string; aangemaakt: number }

export async function createBouw7Bestelregels(projectId: number, regels: Bestelregel[]): Promise<CreateBestelregelsResult> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()
    if (!data) return { ok: false, error: 'Bouw7 is nog niet geconfigureerd.', aangemaakt: 0 }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)

    const resultaten: unknown[] = []
    // Het endpoint accepteert één regel per call → sequentieel posten zodat we precies
    // weten hoeveel er gelukt zijn als er halverwege iets misgaat.
    for (const r of regels) {
      const body = {
        project: { id: projectId },
        description: r.description,
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        ...(r.unit ? { unit: r.unit } : {}),
        ...(r.articleNumber ? { articleNumber: r.articleNumber } : {}),
        ...(r.projectSecurityLinkId != null ? { projectSecurityLink: { id: r.projectSecurityLinkId } } : {}),
        ...(r.contactId != null ? { contact: { id: r.contactId } } : {}),
        ...(r.costType != null ? { costType: r.costType } : {}),
      }
      resultaten.push(await client.post<unknown>('/contract-order-line', body))
    }

    return {
      ok: true,
      aangemaakt: resultaten.length,
      resultaten,
      message: `${resultaten.length} bestelregel(s) aangemaakt op project ${projectId}. Verschijnen als "Verwachte kosten" in Bouw7. (Losse regel verwijderen kan alleen in de Bouw7-UI; DELETE /project/${projectId}/contract-order-lines wist ze állemaal.)`,
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return { ok: false, error: /\b40[13]\b/.test(msg) ? `Geweigerd (${msg}) — key mist schrijfrechten of ids niet toegestaan.` : msg, aangemaakt: 0 }
  }
}

/**
 * Read-only ontdek-helper voor bestelregels (zie WRITE-ENDPOINTS.md, fase "inkoop").
 * Aligned op de juiste write-route `POST /project/{project}/contract-order-line`: haalt voor
 * een (test)project de bestaande bestelregels op (`GET /list/contract-order-lines`) — daarin
 * zie je de exacte regel-vorm én geldige `projectSecurityLink`-ids/codes — plus de
 * bewakingscodes uit project-control kostensoort 1 (Arbeid) als referentie. Schrijft niets.
 */
export type BestelregelRefsResult =
  | {
      ok: true
      projectId: number
      bestaandeRegels: unknown
      bewakingscodes: unknown
    }
  | { ok: false; error: string }

export async function discoverBouw7Bestelregels(projectId?: number): Promise<BestelregelRefsResult> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()
    if (!data) return { ok: false, error: 'Bouw7 is nog niet geconfigureerd.' }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)

    // Bepaal een project: meegegeven id, anders het eerste uit de lijst.
    let id = projectId ?? null
    if (id == null) {
      const list = await client.get<{ items?: { id: number }[] }>('/list/projects', { limit: '1', offset: '0' })
      id = (Array.isArray(list) ? (list as { id: number }[])[0] : list?.items?.[0])?.id ?? null
    }
    if (id == null) return { ok: false, error: 'Geen project gevonden.' }

    const tryGet = async <T>(fn: () => Promise<T>) => { try { return await fn() } catch (e) { return { error: e instanceof Error ? e.message : String(e) } } }

    const [bestaandeRegels, bewakingscodes] = await Promise.all([
      // Bestaande bestelregels van dit project — toont vorm + geldige PSL-ids/codes.
      tryGet(() => client.get<unknown>('/list/contract-order-lines', { q: `project.id = ${id} SORT(description, ASC) LIMIT 25` })),
      // Bewakingscodes (security codes) van dit project via project-control kostensoort 1.
      tryGet(() => client.getAthena<unknown>(`/project-control/${id}/cost-type/1/chapters?include_subprojects=false`)),
    ])

    return { ok: true, projectId: id, bestaandeRegels, bewakingscodes }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

/**
 * Read-only verkenning voor **inkooporders en OA-contracten** (`POST /contracts/purchase-order`
 * en `POST /contracts/subcontractor`). Schrijft niets.
 *
 * Haalt op wat je nodig hebt vóór de eerste schrijfactie:
 *  - de **statuslijsten** (`/contracts/{soort}/statuses`) — de concept-status-id mag je niet raden;
 *  - de **kostentypes** van een inkooporder (`/contracts/purchase-order/cost-types`);
 *  - van het nieuwste bestaande contract per soort het **detail** (`/contracts/{soort}/{id}`) plus
 *    zijn **termijnen** (`/list/{soort}-contract-terms`). Daarin zie je de echte veldvulling én —
 *    de kernvraag — of een termijn via `contractOrderLines` naar bestaande bestelregels verwijst.
 */
export type ContractRefsResult =
  | {
      ok: true
      inkooporderStatussen: unknown
      oaStatussen: unknown
      inkooporderKostentypes: unknown
      voorbeeldInkooporder: unknown
      voorbeeldInkooporderTermijnen: unknown
      voorbeeldOaContract: unknown
      voorbeeldOaTermijnen: unknown
    }
  | { ok: false; error: string }

export async function discoverBouw7Contracten(projectId?: number): Promise<ContractRefsResult> {
  try {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()
    if (!data) return { ok: false, error: 'Bouw7 is nog niet geconfigureerd.' }

    const { Bouw7Client } = await import('@/lib/bouw7/client')
    const config = data.config as Record<string, string>
    const client = new Bouw7Client(config.api_key, config.app_name)

    const tryGet = async <T>(fn: () => Promise<T>) => {
      try { return await fn() } catch (e) { return { error: e instanceof Error ? e.message : String(e) } }
    }

    const filter = projectId != null ? `project.id = ${projectId} ` : ''
    const nieuwste = async (pad: string) => {
      const res = await tryGet(() => client.get<{ items?: { id: number }[] }>(pad, { q: `${filter}SORT(id, DESC) LIMIT 1` }))
      return (res as { items?: { id: number }[] })?.items?.[0]?.id ?? null
    }

    const [inkooporderStatussen, oaStatussen, inkooporderKostentypes, poId, subId] = await Promise.all([
      tryGet(() => client.get<unknown>('/contracts/purchase-order/statuses')),
      tryGet(() => client.get<unknown>('/contracts/subcontractor/statuses')),
      tryGet(() => client.get<unknown>('/contracts/purchase-order/cost-types')),
      nieuwste('/list/purchase-order-contracts'),
      nieuwste('/list/subcontractor-contracts'),
    ])

    const [voorbeeldInkooporder, voorbeeldInkooporderTermijnen, voorbeeldOaContract, voorbeeldOaTermijnen] = await Promise.all([
      poId != null ? tryGet(() => client.get<unknown>(`/contracts/purchase-order/${poId}`)) : null,
      poId != null ? tryGet(() => client.get<unknown>('/list/purchase-order-contract-terms', { q: `contractId = ${poId} LIMIT 25` })) : null,
      subId != null ? tryGet(() => client.get<unknown>(`/contracts/subcontractor/${subId}`)) : null,
      subId != null ? tryGet(() => client.get<unknown>('/list/subcontractor-contract-terms', { q: `contractId = ${subId} LIMIT 25` })) : null,
    ])

    return {
      ok: true,
      inkooporderStatussen, oaStatussen, inkooporderKostentypes,
      voorbeeldInkooporder, voorbeeldInkooporderTermijnen,
      voorbeeldOaContract, voorbeeldOaTermijnen,
    }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

export type SyncRelatiesResult =
  | { ok: true; organisaties: SyncResult; contactpersonen: SyncResult }
  | { ok: false; error: string }

export async function syncRelaties(): Promise<SyncRelatiesResult> {
  try {
    const result = await syncContacts()
    revalidatePath('/relaties')
    return { ok: true, organisaties: result.organisaties, contactpersonen: result.contactpersonen }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sync mislukt' }
  }
}
