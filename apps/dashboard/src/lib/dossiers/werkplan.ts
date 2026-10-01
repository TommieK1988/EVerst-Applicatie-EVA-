'use server'

/**
 * Werkplan bij een opdracht-dossier — de tab Werkplan in EVA en op de telefoon.
 *
 * Eén rij per dossier in `dossier_werkplannen`. Schema, standaardzinnen en het kopjessjabloon
 * staan in `werkplan-types.ts`; die gebruikt de mobiele weergave ook.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, getCurrentMedewerker, GeenToegangError } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import { werkplanSchema, kleurMateriaalSchema, type Werkplan, type WerkplanInvoer } from './werkplan-types'

type ActionResult = { ok: true } | { ok: false; error: string }

const db = () => createAdminClient()

const naamVan = (m: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null }) =>
  [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || null

/** Het werkplan van dit dossier, of `null` als er nog geen is. */
export async function getWerkplan(dossierId: string): Promise<Werkplan | null> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = db()

  const { data } = await supabase
    .from('dossier_werkplannen')
    .select('*')
    .eq('dossier_id', dossierId)
    .maybeSingle()
  if (!data) return null

  let bijgewerktDoorNaam: string | null = null
  if (data.bijgewerkt_door) {
    const { data: m } = await supabase
      .from('medewerkers')
      .select('voornaam, tussenvoegsel, achternaam')
      .eq('id', data.bijgewerkt_door)
      .maybeSingle()
    bijgewerktDoorNaam = m ? naamVan(m) : null
  }

  // De jsonb-kolom is in de gegenereerde types `Json`; hier pas terugvormen tot rijen.
  const rijen = kleurMateriaalSchema.array().safeParse(data.kleuren_materialen)

  return {
    dossier_id: data.dossier_id,
    werkomschrijving: data.werkomschrijving,
    werktijden_keuze: data.werktijden_keuze as Werkplan['werktijden_keuze'],
    werktijden_anders: data.werktijden_anders,
    reisuren_keuze: data.reisuren_keuze as Werkplan['reisuren_keuze'],
    reisuren_uren: data.reisuren_uren,
    reisuren_vertrektijd: data.reisuren_vertrektijd,
    reisuren_anders: data.reisuren_anders,
    reiskosten_keuze: data.reiskosten_keuze as Werkplan['reiskosten_keuze'],
    reiskosten_km: data.reiskosten_km,
    parkeren_keuze: data.parkeren_keuze as Werkplan['parkeren_keuze'],
    parkeren_max_per_dag: data.parkeren_max_per_dag,
    parkeren_anders: data.parkeren_anders,
    kleuren_materialen: rijen.success ? rijen.data : [],
    bijgewerkt_op: data.bijgewerkt_op,
    bijgewerkt_door_naam: bijgewerktDoorNaam,
  }
}

/** Opslaan (aanmaken of bijwerken) van het werkplan. */
export async function slaWerkplanOp(dossierId: string, invoer: WerkplanInvoer): Promise<ActionResult> {
  try {
    await vereisRecht('dossiers', 'schrijven')
    await assertDossierBewerkbaar(dossierId)
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message || 'Je hebt geen rechten om dit dossier te wijzigen.' }
    throw e
  }

  const parsed = werkplanSchema.safeParse(invoer)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Het werkplan is niet compleet.' }

  const medewerker = await getCurrentMedewerker().catch(() => null)

  const { error } = await db()
    .from('dossier_werkplannen')
    .upsert({
      dossier_id: dossierId,
      ...parsed.data,
      bijgewerkt_op: new Date().toISOString(),
      bijgewerkt_door: medewerker?.id ?? null,
    }, { onConflict: 'dossier_id' })

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/opdrachten/${dossierId}/werkplan`)
  revalidatePath(`/m/dossiers/${dossierId}/werkplan`)
  return { ok: true }
}
