'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { syncContacts, syncEmployees, syncProjects, type SyncResult, type SyncContactsResult } from '@/lib/bouw7/sync'
import { syncAllPlanning } from '@/lib/bouw7/sync-planning'

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
  | { ok: true; contacts: SyncContactsResult; employees: SyncResult; projects: SyncResult; planning: SyncResult }
  | { ok: false; error: string }

export async function runFullSync(): Promise<RunSyncResult> {
  try {
    // Sync in volgorde: contacts → employees → projects → planning
    // (projects en planning hebben FK refs naar medewerkers/dossiers).
    const contacts = await syncContacts()
    const employees = await syncEmployees()
    const projects = await syncProjects()
    const planning = await syncAllPlanning()

    const totaalNieuw = contacts.organisaties.nieuw + contacts.contactpersonen.nieuw + employees.nieuw + projects.nieuw + planning.nieuw
    const totaalBijgewerkt = contacts.organisaties.bijgewerkt + contacts.contactpersonen.bijgewerkt + employees.bijgewerkt + projects.bijgewerkt + planning.bijgewerkt

    const supabase = createAdminClient()
    await supabase
      .from('integraties')
      .update({
        laatst_sync: new Date().toISOString(),
        laatst_sync_status: `${totaalNieuw} nieuw, ${totaalBijgewerkt} bijgewerkt`,
      })
      .eq('naam', 'bouw7')

    revalidatePath('/instellingen/integraties')
    return { ok: true, contacts, employees, projects, planning }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Sync mislukt' }
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
