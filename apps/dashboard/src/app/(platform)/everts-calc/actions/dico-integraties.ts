'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { parseDicoArtikelen } from '@/lib/everts-calc/dico/parse'
import { importMaterialen, type ImportResultaat } from './materialen'

// dico_integraties bevat credentials → uitsluitend server-/service-role-toegang.
function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any
}

export type DicoAuthType = 'none' | 'basic' | 'bearer' | 'apikey'

// Naar de client gestuurde vorm — zónder het geheim (alleen of er één ingesteld is).
export type DicoIntegratie = {
  id: string
  leverancier: string
  endpoint_url: string | null
  auth_type: DicoAuthType
  auth_gebruiker: string | null
  heeft_geheim: boolean
  actief: boolean
  laatst_gesynct: string | null
  laatste_status: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function naarClient(r: any): DicoIntegratie {
  return {
    id: r.id,
    leverancier: r.leverancier,
    endpoint_url: r.endpoint_url ?? null,
    auth_type: (r.auth_type ?? 'none') as DicoAuthType,
    auth_gebruiker: r.auth_gebruiker ?? null,
    heeft_geheim: !!r.auth_geheim,
    actief: !!r.actief,
    laatst_gesynct: r.laatst_gesynct ?? null,
    laatste_status: r.laatste_status ?? null,
  }
}

export async function getIntegraties(): Promise<DicoIntegratie[]> {
  const { data, error } = await db()
    .from('dico_integraties')
    .select('*')
    .order('leverancier', { ascending: true })
  if (error) throw new Error(`DICO-integraties ophalen mislukt: ${error.message}`)
  return (data ?? []).map(naarClient)
}

export type IntegratieInput = {
  id?: string
  leverancier: string
  endpoint_url?: string
  auth_type: DicoAuthType
  auth_gebruiker?: string
  auth_geheim?: string   // leeg laten bij bewerken = geheim ongewijzigd
  actief: boolean
}

export async function slaIntegratieOp(input: IntegratieInput): Promise<void> {
  const supabase = db()
  const payload: Record<string, unknown> = {
    leverancier: input.leverancier,
    endpoint_url: input.endpoint_url ?? null,
    auth_type: input.auth_type,
    auth_gebruiker: input.auth_gebruiker ?? null,
    actief: input.actief,
    updated_at: new Date().toISOString(),
  }
  // Alleen het geheim overschrijven als er een nieuwe waarde is opgegeven.
  if (input.auth_geheim) payload.auth_geheim = input.auth_geheim

  if (input.id) {
    const { error } = await supabase.from('dico_integraties').update(payload).eq('id', input.id)
    if (error) throw new Error(`Integratie opslaan mislukt: ${error.message}`)
  } else {
    const { error } = await supabase.from('dico_integraties').insert(payload)
    if (error) throw new Error(`Integratie aanmaken mislukt: ${error.message}`)
  }
  revalidatePath('/everts-calc/instellingen')
}

export async function verwijderIntegratie(id: string): Promise<void> {
  const { error } = await db().from('dico_integraties').delete().eq('id', id)
  if (error) throw new Error(`Integratie verwijderen mislukt: ${error.message}`)
  revalidatePath('/everts-calc/instellingen')
}

function bouwAuthHeaders(r: { auth_type: string; auth_gebruiker?: string | null; auth_geheim?: string | null }): Record<string, string> {
  switch (r.auth_type) {
    case 'basic': {
      const token = Buffer.from(`${r.auth_gebruiker ?? ''}:${r.auth_geheim ?? ''}`).toString('base64')
      return { Authorization: `Basic ${token}` }
    }
    case 'bearer':
      return { Authorization: `Bearer ${r.auth_geheim ?? ''}` }
    case 'apikey':
      return { [r.auth_gebruiker || 'X-API-Key']: r.auth_geheim ?? '' }
    default:
      return {}
  }
}

export type SyncResultaat = ImportResultaat & { gevonden: number }

/**
 * Haalt de DICO-catalogus van een geconfigureerde leverancier op via de live API,
 * parseert de artikelen en synchroniseert ze naar evc_materialen (bron 'dico_api').
 *
 * NB: het exacte endpoint-contract (URL, auth, response-formaat) verschilt per
 * leverancier/DICO-variant. Bevestig dit met een voorbeeldrespons; de parser-mapping
 * in lib/everts-calc/dico/parse.ts hoeft daar dan eventueel op te worden uitgebreid.
 */
export async function syncIntegratie(id: string): Promise<SyncResultaat> {
  const supabase = db()
  const { data: r, error } = await supabase.from('dico_integraties').select('*').eq('id', id).single()
  if (error || !r) throw new Error('Integratie niet gevonden')
  if (!r.endpoint_url) throw new Error('Geen endpoint-URL ingesteld voor deze integratie')

  const noteer = async (status: string) => {
    await supabase.from('dico_integraties')
      .update({ laatst_gesynct: new Date().toISOString(), laatste_status: status, updated_at: new Date().toISOString() })
      .eq('id', id)
  }

  try {
    const res = await fetch(r.endpoint_url, {
      headers: { Accept: 'application/xml, text/xml, */*', ...bouwAuthHeaders(r) },
      // catalogus-syncs kunnen groot/traag zijn
      cache: 'no-store',
    })
    if (!res.ok) {
      const status = `HTTP ${res.status} bij ophalen catalogus`
      await noteer(status)
      throw new Error(status)
    }
    const xml = await res.text()
    const { items, gevonden } = parseDicoArtikelen(xml, r.leverancier)
    if (!items.length) {
      await noteer(`0 artikelen herkend (${gevonden} elementen gevonden)`)
      return { gevonden, aangemaakt: 0, bijgewerkt: 0, fouten: ['Geen artikelen herkend'] }
    }
    const resultaat = await importMaterialen(items, 'dico_api')
    await noteer(`${resultaat.aangemaakt} nieuw, ${resultaat.bijgewerkt} bijgewerkt`)
    revalidatePath('/everts-calc/bibliotheek/materialen')
    return { gevonden, ...resultaat }
  } catch (err) {
    const bericht = err instanceof Error ? err.message : 'Onbekende sync-fout'
    await noteer(`Fout: ${bericht}`)
    throw new Error(bericht)
  }
}
