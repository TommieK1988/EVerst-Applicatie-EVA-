'use server'

/**
 * Lezen en beheren van de kwaliteitsbibliotheek: disciplines, controlepunten, projecteisen en
 * referentievlakken.
 *
 * Autorisatie: `kwaliteit` is bewust GEEN nieuwe rechten-key. De module valt onder de bestaande
 * `kam`, maar die staat nog niet in AFGEDWONGEN_MODULES. `vereisRecht('kam', ...)` zou daarmee
 * iedereen buitensluiten die het recht nog niet toegewezen heeft gekregen — precies waar de JSDoc
 * van `vereisSessie` voor waarschuwt. Lezen en uitvoeren gaan daarom via `vereisSessie()`; het
 * bijstellen van technische eisen zit achter `vereisKwaliteitBeheer()`. Zodra `kam` wordt
 * afgedwongen is dit één regel per functie.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  KwaliteitControlepunt,
  KwaliteitDiscipline,
  KwaliteitProjectEis,
  KwaliteitReferentievlak,
} from '@everts/database/kwaliteit-types'
import { getCurrentMedewerker, getEffectieveRechten, isBeheerder, GeenToegangError, vereisSessie } from '@/lib/auth/rechten'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Beheergate voor de technische bibliotheek. Een echte beheerder (instellingen = beheren) komt er
 * altijd door; daarnaast `kam: 'beheren'` voor wie die rol later krijgt.
 */
export async function vereisKwaliteitBeheer(): Promise<{ medewerkerId: string | null }> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  const rechten = await getEffectieveRechten(medewerker)
  if (!isBeheerder(rechten) && rechten.kam !== 'beheren') {
    throw new GeenToegangError('Alleen beheerders mogen de kwaliteitsbibliotheek wijzigen')
  }
  return { medewerkerId: medewerker.id }
}

/** Mag de ingelogde gebruiker de bibliotheek bewerken? Voor het tonen/verbergen van knoppen. */
export async function magKwaliteitBeheren(): Promise<boolean> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return false
  const rechten = await getEffectieveRechten(medewerker)
  return isBeheerder(rechten) || rechten.kam === 'beheren'
}

/* ────────────────────────────── Disciplines ──────────────────────────────── */

export async function getDisciplines(alleenActief = true): Promise<KwaliteitDiscipline[]> {
  await vereisSessie()
  let q = db().from('kwaliteit_disciplines').select('*').order('volgorde')
  if (alleenActief) q = q.eq('actief', true)
  const { data } = await q
  return (data ?? []) as KwaliteitDiscipline[]
}

/** Disciplines met het aantal actieve controlepunten erbij — voedt de selectietegels. */
export async function getDisciplinesMetAantal(): Promise<(KwaliteitDiscipline & { aantal: number })[]> {
  await vereisSessie()
  const supabase = db()
  const [{ data: disciplines }, { data: punten }] = await Promise.all([
    supabase.from('kwaliteit_disciplines').select('*').eq('actief', true).order('volgorde'),
    supabase.from('kwaliteit_controlepunten').select('discipline_code').eq('actief', true),
  ])
  const telling = new Map<string, number>()
  for (const p of (punten ?? []) as { discipline_code: string }[]) {
    telling.set(p.discipline_code, (telling.get(p.discipline_code) ?? 0) + 1)
  }
  return ((disciplines ?? []) as KwaliteitDiscipline[]).map(d => ({
    ...d,
    aantal: telling.get(d.code) ?? 0,
  }))
}

/* ───────────────────────────── Controlepunten ────────────────────────────── */

export async function getControlepunten(disciplineCodes?: string[]): Promise<KwaliteitControlepunt[]> {
  await vereisSessie()
  let q = db()
    .from('kwaliteit_controlepunten')
    .select('*')
    .eq('actief', true)
    .order('discipline_code')
    .order('volgorde')
  if (disciplineCodes && disciplineCodes.length > 0) q = q.in('discipline_code', disciplineCodes)
  const { data } = await q
  return (data ?? []) as KwaliteitControlepunt[]
}

/** Voor het beheerscherm: ook inactieve punten. */
export async function getAlleControlepunten(disciplineCode?: string): Promise<KwaliteitControlepunt[]> {
  await vereisSessie()
  let q = db().from('kwaliteit_controlepunten').select('*').order('discipline_code').order('volgorde')
  if (disciplineCode) q = q.eq('discipline_code', disciplineCode)
  const { data } = await q
  return (data ?? []) as KwaliteitControlepunt[]
}

/**
 * Bijwerken van één controlepunt vanuit het beheerscherm.
 *
 * `code` en `id` zijn bewust niet te wijzigen: de code is de sleutel waarmee bestaande afwijkingen
 * en verzonden rapporten naar dit punt verwijzen.
 */
export async function updateControlepunt(
  id: string,
  patch: Partial<Omit<KwaliteitControlepunt, 'id' | 'code'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisKwaliteitBeheer()
  const { error } = await db().from('kwaliteit_controlepunten').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kam/kwaliteit/bibliotheek')
  return { ok: true }
}

export async function maakControlepunt(
  invoer: Partial<KwaliteitControlepunt> & { code: string; discipline_code: string; titel: string; korte_vraag: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await vereisKwaliteitBeheer()
  const { data, error } = await db().from('kwaliteit_controlepunten').insert(invoer).select('id').single()
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kam/kwaliteit/bibliotheek')
  return { ok: true, id: data.id }
}

/* ────────────────────────────── Projecteisen ─────────────────────────────── */

export async function getProjectEisen(dossierId: string): Promise<KwaliteitProjectEis[]> {
  await vereisSessie()
  const { data } = await db()
    .from('kwaliteit_project_eisen')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('label')
  return (data ?? []) as KwaliteitProjectEis[]
}

/**
 * De projecteis-sleutels die op dit project daadwerkelijk gebruikt worden, met de bijbehorende
 * controlepunten erbij. Voedt het instelscherm: je ziet welke eis nog leeg is en welk controlepunt
 * daardoor niet automatisch getoetst kan worden.
 */
export async function getProjectEisOverzicht(dossierId: string): Promise<{
  sleutel: string
  punten: { code: string; titel: string; discipline_code: string; eenheid: string | null }[]
  eis: KwaliteitProjectEis | null
}[]> {
  await vereisSessie()
  const supabase = db()
  const [{ data: punten }, { data: eisen }] = await Promise.all([
    supabase
      .from('kwaliteit_controlepunten')
      .select('code, titel, discipline_code, eenheid, project_eis_sleutel')
      .eq('actief', true)
      .not('project_eis_sleutel', 'is', null),
    supabase.from('kwaliteit_project_eisen').select('*').eq('dossier_id', dossierId),
  ])

  const perSleutel = new Map<string, { code: string; titel: string; discipline_code: string; eenheid: string | null }[]>()
  for (const p of (punten ?? []) as (KwaliteitControlepunt & { project_eis_sleutel: string })[]) {
    const lijst = perSleutel.get(p.project_eis_sleutel) ?? []
    lijst.push({ code: p.code, titel: p.titel, discipline_code: p.discipline_code, eenheid: p.eenheid })
    perSleutel.set(p.project_eis_sleutel, lijst)
  }

  const eisPerSleutel = new Map<string, KwaliteitProjectEis>()
  for (const e of (eisen ?? []) as KwaliteitProjectEis[]) eisPerSleutel.set(e.sleutel, e)

  return [...perSleutel.entries()]
    .map(([sleutel, lijst]) => ({ sleutel, punten: lijst, eis: eisPerSleutel.get(sleutel) ?? null }))
    .sort((a, b) => a.sleutel.localeCompare(b.sleutel))
}

export async function bewaarProjectEis(
  dossierId: string,
  eis: Omit<KwaliteitProjectEis, 'id' | 'dossier_id'>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const { error } = await db()
    .from('kwaliteit_project_eisen')
    .upsert({ ...eis, dossier_id: dossierId }, { onConflict: 'dossier_id,sleutel' })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/vca`)
  return { ok: true }
}

export async function verwijderProjectEis(id: string, dossierId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const { error } = await db().from('kwaliteit_project_eisen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/vca`)
  return { ok: true }
}

/* ──────────────────────────── Referentievlakken ──────────────────────────── */

export async function getReferentievlakken(dossierId: string): Promise<KwaliteitReferentievlak[]> {
  await vereisSessie()
  const { data } = await db()
    .from('kwaliteit_referentievlakken')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false })
  return (data ?? []) as KwaliteitReferentievlak[]
}

export async function maakReferentievlak(
  dossierId: string,
  invoer: Partial<KwaliteitReferentievlak> & { omschrijving: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const { data, error } = await db()
    .from('kwaliteit_referentievlakken')
    .insert({ ...invoer, dossier_id: dossierId, created_by: medewerker.id })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/vca`)
  return { ok: true, id: data.id }
}

export async function verwijderReferentievlak(
  id: string,
  dossierId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const { error } = await db().from('kwaliteit_referentievlakken').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/vca`)
  return { ok: true }
}
