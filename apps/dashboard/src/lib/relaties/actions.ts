'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  Relatie,
  RelatieFactuuradres,
  OrganisatieType,
  RelatieBankgegevens,
  RelatieFacturatie,
  RelatieInkoop,
  RelatieVerkoopPrijsafspraak,
  RelatieInkoopKortingsafspraak,
  RelatieInkoopPrijsafspraak,
  OmzetData,
} from '@everts/database'
import { BOUW7_RELATIE_VELDEN, beschermdeVelden } from './sync-velden'

type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Voegt kolomnamen toe aan `handmatige_velden`, zodat de Bouw7-lees-sync ze niet
 * meer overschrijft. Geeft de samengevoegde lijst terug zodat de aanroeper hem in
 * dezelfde update kan meenemen.
 */
async function metHandmatigeVelden(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tabel: 'relaties' | 'contactpersonen',
  id: string,
  velden: string[],
): Promise<string[] | null> {
  if (velden.length === 0) return null
  const { data } = await supabase
    .from(tabel)
    .select('handmatige_velden')
    .eq('id', id)
    .single()
  return [...new Set([...(data?.handmatige_velden ?? []), ...velden])]
}

/* ─── Organisaties ─────────────────────────────────────────────────── */

export async function getRelatieById(id: string): Promise<Relatie | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('relaties')
    .select('*')
    .eq('id', id)
    .single()
  return (data ?? null) as Relatie | null
}

export async function createOrganisatie(input: {
  naam: string
  types: OrganisatieType[]
  kvk_nummer?: string | null
  btw_nummer?: string | null
  email?: string | null
  telefoon?: string | null
  website?: string | null
  adres_straat?: string | null
  adres_postcode?: string | null
  adres_plaats?: string | null
  adres_land?: string | null
  opmerkingen?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('relaties')
    .insert({
      ...input,
      actief: true,
      kenmerken: {},
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  // Direct in Bouw7 aanmaken (best-effort): het Bouw7-id is nodig om later een project aan
  // deze relatie te koppelen. Faalt de Bouw7-kant, dan blijft de EVA-relatie gewoon bestaan.
  try {
    const { maakBouw7Relatie } = await import('@/lib/bouw7/create-contact')
    const bouw7Id = await maakBouw7Relatie({
      naam: input.naam,
      types: input.types,
      kvk_nummer: input.kvk_nummer,
      btw_nummer: input.btw_nummer,
      email: input.email,
      telefoon: input.telefoon,
      adres_straat: input.adres_straat,
      adres_postcode: input.adres_postcode,
      adres_plaats: input.adres_plaats,
      adres_land: input.adres_land,
      opmerkingen: input.opmerkingen,
    })
    if (bouw7Id) {
      await supabase.from('relaties').update({ bouw7_id: String(bouw7Id), bouw7_sync_status: 'synced' }).eq('id', data.id)
    }
  } catch {
    // Bouw7 optioneel bij aanmaken; niet blokkerend.
  }

  revalidatePath('/relaties')
  return { ok: true, id: data.id }
}

export async function updateOrganisatieGegevens(
  id: string,
  patch: {
    naam?: string
    kvk_nummer?: string | null
    btw_nummer?: string | null
    email?: string | null
    telefoon?: string | null
    website?: string | null
    adres_straat?: string | null
    adres_postcode?: string | null
    adres_plaats?: string | null
    adres_land?: string | null
    betalingstermijn_dagen?: number | null
    opmerkingen?: string | null
  }
): Promise<ActionResult> {
  const supabase = createAdminClient() as any

  // Handmatig gewijzigde velden vastleggen; anders zet de Bouw7-sync ze terug.
  const handmatig = await metHandmatigeVelden(
    supabase, 'relaties', id, beschermdeVelden(patch, BOUW7_RELATIE_VELDEN),
  )

  const { error } = await supabase
    .from('relaties')
    .update(handmatig ? { ...patch, handmatige_velden: handmatig } : patch)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${id}`)
  return { ok: true }
}

/**
 * Laat de gemarkeerde velden weer meelopen met de Bouw7-sync. De eerstvolgende
 * volledige sync zet ze terug op de waarden uit Bouw7.
 */
export async function herstelBouw7Velden(id: string): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relaties')
    .update({ handmatige_velden: [] })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${id}`)
  return { ok: true }
}

export async function updateOrganisatieTypes(
  id: string,
  types: OrganisatieType[]
): Promise<ActionResult> {
  if (types.length === 0) return { ok: false, error: 'Selecteer minimaal één type.' }
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relaties')
    .update({ types })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${id}`)
  return { ok: true }
}

export async function toggleOrganisatieActief(
  id: string,
  actief: boolean
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const handmatig = await metHandmatigeVelden(supabase, 'relaties', id, ['actief'])
  const { error } = await supabase
    .from('relaties')
    .update({ actief, handmatige_velden: handmatig ?? ['actief'] })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${id}`)
  revalidatePath('/relaties')
  return { ok: true }
}

/* ─── Factuuradressen ─────────────────────────────────────────────── */

export async function upsertFactuuradres(input: {
  id?: string
  relatie_id: string
  label: string
  straat?: string | null
  postcode?: string | null
  plaats?: string | null
  land?: string | null
  opmerkingen?: string | null
}): Promise<{ ok: true; data: RelatieFactuuradres } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { id, ...rest } = input
  const payload = id ? { id, ...rest } : rest

  const { data, error } = await supabase
    .from('relatie_factuuradressen')
    .upsert(payload)
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${input.relatie_id}`)
  return { ok: true, data: data as RelatieFactuuradres }
}

export async function deleteFactuuradres(
  id: string,
  relatieId: string
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_factuuradressen')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatieId}`)
  return { ok: true }
}

/* ─── Bankgegevens (1:1 upsert) ──────────────────────────────────── */

export async function upsertBankgegevens(
  relatie_id: string,
  data: Pick<RelatieBankgegevens, 'iban' | 'bic' | 'tenaamstelling' | 'opmerkingen'>
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_bankgegevens')
    .upsert({ relatie_id, ...data }, { onConflict: 'relatie_id' })

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatie_id}`)
  return { ok: true }
}

/* ─── Facturatie-instellingen (1:1 upsert) ───────────────────────── */

export async function upsertFacturatie(
  relatie_id: string,
  data: Pick<RelatieFacturatie,
    'betaaltermijn_dagen' | 'facturatie_email' | 'inkoopnummer_verplicht' | 'kredietlimiet' |
    'g_rekening_tekst' | 'g_rekening_percentage' | 'loonkostenbestanddeel_pct' | 'n_rekening_tekst' |
    'opmerkingen'>
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_facturatie')
    .upsert({ relatie_id, ...data }, { onConflict: 'relatie_id' })

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatie_id}`)
  return { ok: true }
}

/* ─── Inkoop-instellingen (1:1 upsert) ───────────────────────────── */

export async function upsertInkoop(
  relatie_id: string,
  data: Pick<RelatieInkoop, 'leveranciernummer' | 'standaard_levertijd_dagen' | 'minimumbestelling' | 'opmerkingen'>
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_inkoop')
    .upsert({ relatie_id, ...data }, { onConflict: 'relatie_id' })

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatie_id}`)
  return { ok: true }
}

/* ─── Verkoop prijsafspraken (1:n) ───────────────────────────────── */

export async function upsertVerkoopPrijsafspraak(input: {
  id?: string
  relatie_id: string
  omschrijving: string
  eenheid?: string | null
  prijs?: number | null
  geldig_vanaf?: string | null
  geldig_tot?: string | null
  opmerkingen?: string | null
}): Promise<{ ok: true; data: RelatieVerkoopPrijsafspraak } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { id, ...rest } = input
  const { data, error } = await supabase
    .from('relatie_verkoop_prijsafspraken')
    .upsert(id ? { id, ...rest } : rest)
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${input.relatie_id}`)
  return { ok: true, data: data as RelatieVerkoopPrijsafspraak }
}

export async function deleteVerkoopPrijsafspraak(
  id: string,
  relatieId: string
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_verkoop_prijsafspraken')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatieId}`)
  return { ok: true }
}

/* ─── Kortingsafspraken (1:n, leverancier) ───────────────────────── */

export async function upsertKortingsafspraak(input: {
  id?: string
  relatie_id: string
  categorie?: string | null
  korting_pct?: number | null
  geldig_vanaf?: string | null
  geldig_tot?: string | null
  opmerkingen?: string | null
}): Promise<{ ok: true; data: RelatieInkoopKortingsafspraak } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { id, ...rest } = input
  const { data, error } = await supabase
    .from('relatie_inkoop_kortingsafspraken')
    .upsert(id ? { id, ...rest } : rest)
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${input.relatie_id}`)
  return { ok: true, data: data as RelatieInkoopKortingsafspraak }
}

export async function deleteKortingsafspraak(
  id: string,
  relatieId: string
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_inkoop_kortingsafspraken')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatieId}`)
  return { ok: true }
}

/* ─── Inkoop prijsafspraken (1:n, onderaannemer) ─────────────────── */

export async function upsertInkoopPrijsafspraak(input: {
  id?: string
  relatie_id: string
  omschrijving: string
  eenheid?: string | null
  prijs?: number | null
  geldig_vanaf?: string | null
  geldig_tot?: string | null
  opmerkingen?: string | null
}): Promise<{ ok: true; data: RelatieInkoopPrijsafspraak } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { id, ...rest } = input
  const { data, error } = await supabase
    .from('relatie_inkoop_prijsafspraken')
    .upsert(id ? { id, ...rest } : rest)
    .select()
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${input.relatie_id}`)
  return { ok: true, data: data as RelatieInkoopPrijsafspraak }
}

export async function deleteInkoopPrijsafspraak(
  id: string,
  relatieId: string
): Promise<ActionResult> {
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('relatie_inkoop_prijsafspraken')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/relaties/${relatieId}`)
  return { ok: true }
}

/* ─── Omzet (berekend uit dossiers) ─────────────────────────────── */

export async function getOmzetVoorRelatie(relatieId: string): Promise<OmzetData> {
  const supabase = createAdminClient() as any

  const [jaarRes, openstaandRes] = await Promise.all([
    // Gefactureerde omzet per boekjaar (opdrachten)
    supabase
      .from('dossiers')
      .select('created_at, bedrag_excl_btw')
      .eq('klant_id', relatieId)
      .eq('hoofdstatus', 'opdracht')
      .not('bedrag_excl_btw', 'is', null),

    // Openstaande opdrachten (niet financieel afgesloten)
    supabase
      .from('dossiers')
      .select('id, dossiernummer, titel, bedrag_excl_btw, opdracht_substatus')
      .eq('klant_id', relatieId)
      .eq('hoofdstatus', 'opdracht')
      .not('opdracht_substatus', 'in', '("financieel_afgesloten","financieel_gereed")')
      .not('bedrag_excl_btw', 'is', null)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  // Groepeer per jaar in JavaScript
  const jaarMap = new Map<number, { bedrag: number; aantalDossiers: number }>()
  for (const row of jaarRes.data ?? []) {
    const jaar = new Date(row.created_at).getFullYear()
    const huidig = jaarMap.get(jaar) ?? { bedrag: 0, aantalDossiers: 0 }
    jaarMap.set(jaar, {
      bedrag: huidig.bedrag + Number(row.bedrag_excl_btw ?? 0),
      aantalDossiers: huidig.aantalDossiers + 1,
    })
  }
  const perJaar = Array.from(jaarMap.entries())
    .map(([jaar, v]) => ({ jaar, ...v }))
    .sort((a, b) => b.jaar - a.jaar)
    .slice(0, 5)

  const openstaand = (openstaandRes.data ?? []).map((r: any) => ({
    id: r.id,
    dossiernummer: r.dossiernummer,
    titel: r.titel,
    bedrag: r.bedrag_excl_btw != null ? Number(r.bedrag_excl_btw) : null,
    substatus: r.opdracht_substatus ?? '',
  }))

  return { perJaar, openstaand }
}
