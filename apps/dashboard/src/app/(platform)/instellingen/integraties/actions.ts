'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { syncContacts, syncEmployees, syncDaysOff, syncProjects, syncDebiteuren, type SyncResult, type SyncContactsResult, type SyncMode } from '@/lib/bouw7/sync'
import { syncAllPlanning, syncDossierPlanning } from '@/lib/bouw7/sync-planning'

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
  | { ok: true; contacts: SyncContactsResult; employees: SyncResult; daysOff: SyncResult; projects: SyncResult; planning: SyncResult; debiteuren: SyncResult }
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

    const totaalNieuw = contacts.organisaties.nieuw + contacts.contactpersonen.nieuw + employees.nieuw + daysOff.nieuw + projects.nieuw + planning.nieuw + debiteuren.nieuw
    const totaalBijgewerkt = contacts.organisaties.bijgewerkt + contacts.contactpersonen.bijgewerkt + employees.bijgewerkt + daysOff.bijgewerkt + projects.bijgewerkt + planning.bijgewerkt + debiteuren.bijgewerkt

    const supabase = createAdminClient()
    await supabase
      .from('integraties')
      .update({
        laatst_sync: new Date().toISOString(),
        laatst_sync_status: `${totaalNieuw} nieuw, ${totaalBijgewerkt} bijgewerkt`,
      })
      .eq('naam', 'bouw7')

    revalidatePath('/instellingen/integraties')
    return { ok: true, contacts, employees, daysOff, projects, planning, debiteuren }
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

    const projects = await syncProjects({ onlyBouw7Ids: [String(bouw7Id)] })
    const planning = await syncDossierPlanning(dossierId, { mode: 'full' })

    revalidatePath(`/dossiers/${dossierId}`)
    return { ok: true, projects, planning }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verversen mislukt' }
  }
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
 * Schrijft één of meer **bestelregels** (verwachte-kosten-regels) naar Bouw7 via
 * `POST /project/{project}/contract-order-line`. Dit is exact het regeltype dat de
 * EVA Financieel-tab al teruglez­t als "Verwachte kosten" (`GET /list/contract-order-lines`),
 * gesommeerd per `projectSecurityLink.code`. Door een PSL-id mee te geven landt de regel
 * op de juiste bewakingscode en telt 'ie mee in de verwachte kosten van die code.
 *
 * LET OP: voor dit endpoint bestaat **geen API-delete** — een testregel verwijder je
 * in de Bouw7-UI. Bouw7 berekent `totalPrice` zelf uit quantity × unitPrice.
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
      }
      resultaten.push(await client.post<unknown>(`/project/${projectId}/contract-order-line`, body))
    }

    return {
      ok: true,
      aangemaakt: resultaten.length,
      resultaten,
      message: `${resultaten.length} bestelregel(s) aangemaakt op project ${projectId}. Verschijnen als "Verwachte kosten" in Bouw7. (Geen API-delete — verwijder testregels in de Bouw7-UI.)`,
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
