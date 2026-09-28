'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getEffectieveRechten, vereisRecht, vereisSessie, GeenToegangError } from '@/lib/auth/rechten'
import { isBeheerder } from '@/lib/auth/rechten-shared'

/**
 * Standaard losse factuurregels: een bedrijfsbrede kieslijst voor de regiefactuur (voorrijkosten,
 * opstartkosten, klein materiaal). Beheer onder Instellingen → Facturatie.
 *
 * Een keuze wordt gekopieerd naar een losse regel op de factuur; de factuur verwijst niet terug.
 * Zo verandert een prijswijziging hier nooit een factuur die al is opgesteld.
 */

export type Standaardregel = {
  id: string
  omschrijving: string
  eenheid: string | null
  prijs: number | null
  btw_tarief_id: string | null
  volgorde: number
  actief: boolean
}

/** Eén keuze in het venster "Losse regel toevoegen". */
export type LosseRegelKeuze = {
  sleutel: string
  omschrijving: string
  eenheid: string | null
  prijs: number | null
  /** Bouw7-id van het btw-tarief; leeg = de btw van de factuur. */
  btwTariefBouw7Id: number | null
  btwLabel: string | null
}

type Resultaat = { ok: true } | { ok: false; error: string }

/** Zelfde gate als de rest van Instellingen → Facturatie: `financieel: beheren`, of beheerder. */
async function magBeheren(): Promise<boolean> {
  try {
    await vereisRecht('financieel', 'beheren')
    return true
  } catch (e) {
    if (!(e instanceof GeenToegangError)) throw e
    return isBeheerder(await getEffectieveRechten())
  }
}

const naarGetal = (v: unknown): number | null => (v == null ? null : Number(v))

export async function getStandaardregels(opts?: { inclusiefInactief?: boolean }): Promise<Standaardregel[]> {
  await vereisSessie()
  return leesStandaardregels(opts)
}

async function leesStandaardregels(opts?: { inclusiefInactief?: boolean }): Promise<Standaardregel[]> {
  const supabase = createAdminClient()
  let q = supabase
    .from('factuur_standaardregels')
    .select('id, omschrijving, eenheid, prijs, btw_tarief_id, volgorde, actief')
    .order('volgorde').order('omschrijving')
    // Een kieslijst voor mensen; honderden regels is al onwerkbaar. Bewuste bovengrens.
    .limit(500)
  if (!opts?.inclusiefInactief) q = q.eq('actief', true)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ ...r, prijs: naarGetal(r.prijs) }))
}

export async function bewaarStandaardregel(input: {
  id?: string
  omschrijving: string
  eenheid: string | null
  prijs: number | null
  btw_tarief_id: string | null
}): Promise<Resultaat> {
  if (!(await magBeheren())) return { ok: false, error: 'Geen rechten om standaardregels te beheren.' }
  const omschrijving = input.omschrijving.trim()
  if (!omschrijving) return { ok: false, error: 'Geef de regel een omschrijving; die komt zo op de factuur.' }
  if (input.prijs != null && (!Number.isFinite(input.prijs) || Math.abs(input.prijs) >= 1_000_000)) {
    return { ok: false, error: 'De prijs is geen geldig bedrag.' }
  }
  const supabase = createAdminClient()
  const velden = {
    omschrijving,
    eenheid: input.eenheid?.trim() || null,
    prijs: input.prijs != null ? Math.round(input.prijs * 100) / 100 : null,
    btw_tarief_id: input.btw_tarief_id || null,
    updated_at: new Date().toISOString(),
  }
  if (input.id) {
    const { error } = await supabase.from('factuur_standaardregels').update(velden).eq('id', input.id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: laatste } = await supabase
      .from('factuur_standaardregels').select('volgorde')
      .order('volgorde', { ascending: false }).limit(1).maybeSingle()
    const { error } = await supabase
      .from('factuur_standaardregels').insert({ ...velden, volgorde: (laatste?.volgorde ?? 0) + 1 })
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/instellingen/facturatie')
  return { ok: true }
}

/** Soft-delete: een uitgezette regel verdwijnt uit de kiezer, maar is terug te zetten. */
export async function zetStandaardregelActief(id: string, actief: boolean): Promise<Resultaat> {
  if (!(await magBeheren())) return { ok: false, error: 'Geen rechten om standaardregels te beheren.' }
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('factuur_standaardregels')
    .update({ actief, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/facturatie')
  return { ok: true }
}

/** Actieve btw-tarieven voor de keuzelijst in het beheer. */
export async function getBtwKeuzes(): Promise<{ id: string; label: string }[]> {
  await vereisSessie()
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('btw_tarieven').select('id, label, percentage').eq('actief', true).order('percentage')
  return ((data ?? []) as { id: string; label: string | null; percentage: number | null }[])
    .map(t => ({ id: t.id, label: t.label ?? `${t.percentage}%` }))
}

/**
 * Wat er te kiezen valt bij "Losse regel toevoegen" op de regiefactuur van een dossier: de
 * prijsafspraken met de opdrachtgever die vandaag gelden, en de bedrijfsbrede standaardregels.
 *
 * De opdrachtgever is `dossiers.klant_id` — dezelfde relatie waar het afgesproken uurtarief
 * vandaan komt (zie `getServicedeskRegie`).
 */
export async function getLosseRegelKeuzes(dossierId: string): Promise<{
  klantNaam: string | null
  afspraken: LosseRegelKeuze[]
  standaard: LosseRegelKeuze[]
}> {
  // Alleen lezen, en wie dit venster opent mag de factuur al samenstellen: een sessie volstaat.
  await vereisSessie()
  const supabase = createAdminClient()
  const { data: dossier } = await supabase
    .from('dossiers').select('klant_id').eq('id', dossierId).maybeSingle()
  const klantId: string | null = dossier?.klant_id ?? null

  const vandaag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' })
  const [klantRes, afsprakenRes, standaard, btwRes] = await Promise.all([
    klantId
      ? supabase.from('relaties').select('naam').eq('id', klantId).maybeSingle()
      : Promise.resolve({ data: null }),
    klantId
      ? supabase.from('relatie_verkoop_prijsafspraken')
          .select('id, omschrijving, eenheid, prijs, geldig_vanaf, geldig_tot')
          .eq('relatie_id', klantId).order('omschrijving')
      : Promise.resolve({ data: [] }),
    leesStandaardregels(),
    supabase.from('btw_tarieven').select('id, bouw7_id, label'),
  ])

  const btw = new Map<string, { bouw7_id: number | null; label: string | null }>(
    ((btwRes.data ?? []) as { id: string; bouw7_id: number | null; label: string | null }[]).map(t => [t.id, t]),
  )

  const afspraken = (afsprakenRes.data ?? [])
    .filter(a => (!a.geldig_vanaf || a.geldig_vanaf <= vandaag) && (!a.geldig_tot || a.geldig_tot >= vandaag))
    .map(a => ({
      sleutel: `afspraak:${a.id}`,
      omschrijving: a.omschrijving,
      eenheid: a.eenheid ?? null,
      prijs: naarGetal(a.prijs),
      btwTariefBouw7Id: null,
      btwLabel: null,
    }))

  return {
    klantNaam: klantRes.data?.naam ?? null,
    afspraken,
    standaard: standaard.map(s => {
      const t = s.btw_tarief_id ? btw.get(s.btw_tarief_id) : undefined
      return {
        sleutel: `standaard:${s.id}`,
        omschrijving: s.omschrijving,
        eenheid: s.eenheid,
        prijs: s.prijs,
        btwTariefBouw7Id: t?.bouw7_id ?? null,
        btwLabel: t?.label ?? null,
      }
    }),
  }
}
