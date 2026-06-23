'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'
import type { Materiaal, MateriaalBron, MateriaalStatus } from '@/lib/everts-calc/types'

// De tabel `evc_materialen` staat (nog) niet in de gegenereerde Database-types.
// Daarom benaderen we de client als `any` — zelfde pragmatische aanpak als in
// services/calculaties.ts voor dossiers.everts_calc_project_id.
async function db() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await createClient()) as any
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowNaarMateriaal(r: any): Materiaal {
  return {
    id: r.id,
    leverancier: r.leverancier ?? undefined,
    artikelnummer: r.artikelnummer ?? undefined,
    omschrijving: r.omschrijving ?? '',
    materiaalgroep: r.materiaalgroep ?? undefined,
    eenheid: r.eenheid ?? 'ltr',
    kostprijs: Number(r.kostprijs ?? 0),
    status: (r.status ?? 'actief') as MateriaalStatus,
    aangepast_op: r.aangepast_op ?? r.created_at ?? new Date().toISOString(),
    merk: r.merk ?? undefined,
    gtin: r.gtin ?? undefined,
    etim_klasse: r.etim_klasse ?? undefined,
    leverancier_gln: r.leverancier_gln ?? undefined,
    leverancier_productgroep: r.leverancier_productgroep ?? undefined,
    bron: (r.bron ?? 'handmatig') as MateriaalBron,
    externe_ref: r.externe_ref ?? undefined,
    gesynct_op: r.gesynct_op ?? null,
  }
}

// Bouwt een schrijfbare DB-payload uit (een deel van) een Materiaal.
function materiaalNaarRow(m: Partial<Materiaal>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  const set = (k: keyof Materiaal, v: unknown) => { if (v !== undefined) row[k] = v }
  set('leverancier', m.leverancier ?? null)
  set('artikelnummer', m.artikelnummer ?? null)
  set('omschrijving', m.omschrijving)
  set('materiaalgroep', m.materiaalgroep ?? null)
  set('eenheid', m.eenheid)
  set('kostprijs', m.kostprijs)
  set('status', m.status)
  set('merk', m.merk ?? null)
  set('gtin', m.gtin ?? null)
  set('etim_klasse', m.etim_klasse ?? null)
  set('leverancier_gln', m.leverancier_gln ?? null)
  set('leverancier_productgroep', m.leverancier_productgroep ?? null)
  set('bron', m.bron)
  set('externe_ref', m.externe_ref ?? null)
  set('gesynct_op', m.gesynct_op)
  return row
}

// ─── Lezen ──────────────────────────────────────────────────────────────────

// PostgREST geeft standaard max. 1000 rijen per request. Paginated ophalen zodat
// de volledige bibliotheek (>1000 artikelen, bv. na DICO-import) zichtbaar blijft.
const PAGINA = 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function haalAlles(opts: { alleenActief?: boolean; select?: string; leverancier?: string } = {}): Promise<any[]> {
  const supabase = await db()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alle: any[] = []
  for (let van = 0; ; van += PAGINA) {
    let q = supabase
      .from('evc_materialen')
      .select(opts.select ?? '*')
      .order('omschrijving', { ascending: true })
      .range(van, van + PAGINA - 1)
    if (opts.alleenActief) q = q.eq('status', 'actief')
    if (opts.leverancier) q = q.eq('leverancier', opts.leverancier)
    const { data, error } = await q
    if (error) throw new Error(`Materialen ophalen mislukt: ${error.message}`)
    alle.push(...(data ?? []))
    if (!data || data.length < PAGINA) break
  }
  return alle
}

export async function getMaterialen(): Promise<Materiaal[]> {
  return (await haalAlles()).map(rowNaarMateriaal)
}

export async function getActieveMaterialen(): Promise<Materiaal[]> {
  return (await haalAlles({ alleenActief: true })).map(rowNaarMateriaal)
}

// ─── Schrijven ────────────────────────────────────────────────────────────────

export async function maakMateriaal(partial: Partial<Materiaal> = {}): Promise<Materiaal> {
  const supabase = await db()
  const payload = materiaalNaarRow({
    omschrijving: '',
    eenheid: 'ltr',
    kostprijs: 0,
    status: 'actief',
    bron: 'handmatig',
    ...partial,
    aangepast_op: new Date().toISOString(),
  })
  const { data, error } = await supabase
    .from('evc_materialen')
    .insert(payload)
    .select('*')
    .single()
  if (error) throw new Error(`Materiaal aanmaken mislukt: ${error.message}`)
  revalidatePath('/everts-calc/bibliotheek/materialen')
  return rowNaarMateriaal(data)
}

export async function wijzigMateriaal(id: string, patch: Partial<Materiaal>): Promise<void> {
  const supabase = await db()
  const payload = { ...materiaalNaarRow(patch), aangepast_op: new Date().toISOString() }
  const { error } = await supabase.from('evc_materialen').update(payload).eq('id', id)
  if (error) throw new Error(`Materiaal bijwerken mislukt: ${error.message}`)
  revalidatePath('/everts-calc/bibliotheek/materialen')
}

export async function verwijderMateriaal(id: string): Promise<void> {
  const supabase = await db()
  const { error } = await supabase.from('evc_materialen').delete().eq('id', id)
  if (error) throw new Error(`Materiaal verwijderen mislukt: ${error.message}`)
  revalidatePath('/everts-calc/bibliotheek/materialen')
}

// ─── Bulk import (Excel én DICO) ────────────────────────────────────────────────

export type ImportResultaat = { aangemaakt: number; bijgewerkt: number; fouten: string[] }

/**
 * Importeert/synchroniseert een set materialen. Bestaande regels worden gematcht op
 * (gtin) of anders op (artikelnummer + leverancier); een match wordt bijgewerkt,
 * anders wordt een nieuwe regel aangemaakt. Gebruikt door de Excel-import en de
 * DICO-bestand-/API-import (via `bron`).
 */
export async function importMaterialen(
  items: Partial<Materiaal>[],
  bron: MateriaalBron = 'excel',
): Promise<ImportResultaat> {
  const supabase = await db()
  const fouten: string[] = []

  // Bestaande regels (volledig, gepagineerd) ophalen voor matching — anders mist de
  // dedup bij >1000 bestaande materialen en ontstaan duplicaten.
  const bestaande = await haalAlles({ select: 'id, artikelnummer, leverancier, gtin' })

  // Koppeltabel laden: leveranciers-productgroep -> eigen materiaalgroep (per leverancier).
  // Bij import wordt de eigen materiaalgroep hieruit afgeleid zodat een herhaalde upload
  // meteen goed staat.
  const { data: mappingRows } = await supabase
    .from('dico_groep_mapping')
    .select('leverancier, leverancier_productgroep, materiaalgroep')
  const groepKey = (lev?: string | null, pg?: string | null) => `${lev ?? ''}\n${pg ?? ''}`
  const groepMap = new Map<string, string | null>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (mappingRows ?? []) as any[]) {
    groepMap.set(groepKey(r.leverancier, r.leverancier_productgroep), r.materiaalgroep ?? null)
  }

  // Matchindexen: op GTIN en op artikelnummer+leverancier.
  const opGtin = new Map<string, string>()
  const opArtLev = new Map<string, string>()
  const artLevKey = (art?: string | null, lev?: string | null) => `${art ?? ''} ${lev ?? ''}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const b of (bestaande ?? []) as any[]) {
    if (b.gtin) opGtin.set(b.gtin, b.id)
    if (b.artikelnummer) opArtLev.set(artLevKey(b.artikelnummer, b.leverancier), b.id)
  }
  const vindId = (m: Partial<Materiaal>): string | undefined => {
    if (m.gtin && opGtin.has(m.gtin)) return opGtin.get(m.gtin)
    if (m.artikelnummer) {
      return opArtLev.get(artLevKey(m.artikelnummer, m.leverancier))
        ?? opArtLev.get(artLevKey(m.artikelnummer, '')) // leverancier onbekend in DB
    }
    return undefined
  }

  const syncTijd = bron === 'dico_import' || bron === 'dico_api' ? new Date().toISOString() : undefined
  const nu = new Date().toISOString()

  // Partitioneer in updates (met id) en inserts (zonder id). Dedupliceer binnen het
  // bestand zodat één doelregel niet twee keer in dezelfde upsert-batch belandt.
  const updates = new Map<string, Record<string, unknown>>()
  const inserts = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < items.length; i++) {
    const m = items[i]
    if (!m.omschrijving || !m.omschrijving.trim()) {
      fouten.push(`Regel ${i + 1}: omschrijving ontbreekt`)
      continue
    }
    // Eigen materiaalgroep afleiden uit de koppeltabel (DICO), anders de meegegeven
    // waarde (Excel-import met handmatige groep).
    const k = groepKey(m.leverancier, m.leverancier_productgroep)
    const eigenGroep = m.leverancier_productgroep && groepMap.has(k)
      ? (groepMap.get(k) ?? undefined)
      : m.materiaalgroep
    const payload = materiaalNaarRow({
      eenheid: 'ltr', kostprijs: 0, status: 'actief',
      ...m, materiaalgroep: eigenGroep, bron, gesynct_op: syncTijd, aangepast_op: nu,
    })
    const id = vindId(m)
    if (id) {
      updates.set(id, { ...payload, id })
    } else {
      inserts.set(m.gtin || artLevKey(m.artikelnummer, m.leverancier) || `__${i}`, payload)
    }
  }

  // Chunked upsert (update op PK) en insert.
  const chunk = <T,>(arr: T[], n: number) => Array.from({ length: Math.ceil(arr.length / n) }, (_, k) => arr.slice(k * n, k * n + n))
  const GROOTTE = 500
  let bijgewerkt = 0
  let aangemaakt = 0

  for (const groep of chunk([...updates.values()], GROOTTE)) {
    const { error } = await supabase.from('evc_materialen').upsert(groep, { onConflict: 'id' })
    if (error) fouten.push(`Bijwerken (${groep.length}): ${error.message}`)
    else bijgewerkt += groep.length
  }
  for (const groep of chunk([...inserts.values()], GROOTTE)) {
    const { error } = await supabase.from('evc_materialen').insert(groep)
    if (error) fouten.push(`Aanmaken (${groep.length}): ${error.message}`)
    else aangemaakt += groep.length
  }

  revalidatePath('/everts-calc/bibliotheek/materialen')
  return { aangemaakt, bijgewerkt, fouten }
}

// ─── Eigen materiaalgroepen (beheerbaar) ────────────────────────────────────────

export async function getMateriaalgroepen(): Promise<string[]> {
  const supabase = await db()
  const { data, error } = await supabase
    .from('evc_materiaalgroepen')
    .select('naam')
    .eq('actief', true)
    .order('volgorde', { ascending: true })
    .order('naam', { ascending: true })
  if (error) throw new Error(`Materiaalgroepen ophalen mislukt: ${error.message}`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((r: any) => r.naam as string)
}

export async function maakMateriaalgroep(naam: string): Promise<void> {
  const supabase = await db()
  const schoon = naam.trim()
  if (!schoon) throw new Error('Naam is verplicht')
  const { error } = await supabase
    .from('evc_materiaalgroepen')
    .upsert({ naam: schoon, volgorde: 500 }, { onConflict: 'naam' })
  if (error) throw new Error(`Materiaalgroep aanmaken mislukt: ${error.message}`)
  revalidatePath('/everts-calc/bibliotheek/materialen')
}

// Hernoemen cascadeert naar materialen én koppeltabel zodat alles consistent blijft.
export async function hernoemMateriaalgroep(oud: string, nieuw: string): Promise<void> {
  const supabase = await db()
  const schoon = nieuw.trim()
  if (!schoon) throw new Error('Naam is verplicht')
  const { error: e1 } = await supabase.from('evc_materiaalgroepen').update({ naam: schoon }).eq('naam', oud)
  if (e1) throw new Error(`Hernoemen mislukt: ${e1.message}`)
  await supabase.from('evc_materialen').update({ materiaalgroep: schoon }).eq('materiaalgroep', oud)
  await supabase.from('dico_groep_mapping').update({ materiaalgroep: schoon }).eq('materiaalgroep', oud)
  revalidatePath('/everts-calc/bibliotheek/materialen')
}

// Verwijderen maakt verwijzingen leeg (materialen blijven bestaan, zonder groep).
export async function verwijderMateriaalgroep(naam: string): Promise<void> {
  const supabase = await db()
  await supabase.from('evc_materialen').update({ materiaalgroep: null }).eq('materiaalgroep', naam)
  await supabase.from('dico_groep_mapping').update({ materiaalgroep: null }).eq('materiaalgroep', naam)
  const { error } = await supabase.from('evc_materiaalgroepen').delete().eq('naam', naam)
  if (error) throw new Error(`Verwijderen mislukt: ${error.message}`)
  revalidatePath('/everts-calc/bibliotheek/materialen')
}

// ─── Productgroep-koppeling (leverancier-productgroep -> eigen materiaalgroep) ──────

export async function getLeveranciers(): Promise<string[]> {
  const rijen = await haalAlles({ select: 'leverancier' })
  const set = new Set<string>()
  for (const r of rijen) if (r.leverancier) set.add(r.leverancier)
  return [...set].sort((a, b) => a.localeCompare(b, 'nl'))
}

export type ProductgroepKoppeling = {
  leverancier_productgroep: string
  aantal: number
  materiaalgroep: string | null   // huidige eigen koppeling (null = niet gekoppeld)
}

// Alle leveranciers-productgroepen van één leverancier, met artikelaantal en de huidige
// koppeling naar een eigen materiaalgroep.
export async function getProductgroepKoppelingen(leverancier: string): Promise<ProductgroepKoppeling[]> {
  const supabase = await db()
  const rijen = await haalAlles({ select: 'leverancier_productgroep', leverancier })
  const aantallen = new Map<string, number>()
  for (const r of rijen) {
    const pg = r.leverancier_productgroep
    if (pg) aantallen.set(pg, (aantallen.get(pg) ?? 0) + 1)
  }
  const { data: mapping } = await supabase
    .from('dico_groep_mapping')
    .select('leverancier_productgroep, materiaalgroep')
    .eq('leverancier', leverancier)
  const gekoppeld = new Map<string, string | null>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (mapping ?? []) as any[]) gekoppeld.set(r.leverancier_productgroep, r.materiaalgroep ?? null)

  return [...aantallen.entries()]
    .map(([pg, aantal]) => ({
      leverancier_productgroep: pg,
      aantal,
      materiaalgroep: gekoppeld.get(pg) ?? null,
    }))
    .sort((a, b) => a.leverancier_productgroep.localeCompare(b.leverancier_productgroep, 'nl'))
}

// Slaat de koppelingen voor één leverancier op (onthouden voor volgende imports) én past
// ze direct toe op de bestaande materialen van die leverancier.
export async function slaProductgroepKoppelingenOp(
  leverancier: string,
  koppelingen: { leverancier_productgroep: string; materiaalgroep: string | null }[],
): Promise<void> {
  const supabase = await db()
  const nu = new Date().toISOString()

  // 1. Koppeltabel bijwerken (upsert op leverancier + productgroep).
  const rows = koppelingen.map(k => ({
    leverancier,
    leverancier_productgroep: k.leverancier_productgroep,
    materiaalgroep: k.materiaalgroep,
    updated_at: nu,
  }))
  if (rows.length) {
    const { error } = await supabase
      .from('dico_groep_mapping')
      .upsert(rows, { onConflict: 'leverancier,leverancier_productgroep' })
    if (error) throw new Error(`Koppeling opslaan mislukt: ${error.message}`)
  }

  // 2. Direct toepassen op bestaande materialen van deze leverancier.
  for (const k of koppelingen) {
    const { error } = await supabase
      .from('evc_materialen')
      .update({ materiaalgroep: k.materiaalgroep, aangepast_op: nu })
      .eq('leverancier', leverancier)
      .eq('leverancier_productgroep', k.leverancier_productgroep)
    if (error) throw new Error(`Toepassen op materialen mislukt: ${error.message}`)
  }

  revalidatePath('/everts-calc/bibliotheek/materialen')
}
