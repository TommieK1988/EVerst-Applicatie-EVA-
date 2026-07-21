'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { bepaalVcaStatus, type VcaRij, type VcaSoort } from '@/lib/kam/vca'

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient()
}

/**
 * Alle actieve medewerkers met hun meest actuele VCA-diploma (de rij met de
 * verste geldig_tot). Medewerkers zonder diploma komen mee met status 'geen',
 * want juist die wil KAM zien.
 */
export async function getVcaOverzicht(): Promise<VcaRij[]> {
  await vereisSessie()
  const supabase = db()

  const [{ data: medewerkers }, { data: diplomas }] = await Promise.all([
    supabase
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, functie, afdeling')
      .eq('actief', true)
      .order('achternaam', { ascending: true }),
    supabase
      .from('vca_diplomas')
      .select('id, medewerker_id, soort, diplomanummer, behaald_op, geldig_tot'),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const perMedewerker = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (diplomas ?? []) as any[]) {
    const huidig = perMedewerker.get(d.medewerker_id)
    if (!huidig) { perMedewerker.set(d.medewerker_id, d); continue }
    if ((d.geldig_tot ?? '') > (huidig.geldig_tot ?? '')) perMedewerker.set(d.medewerker_id, d)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((medewerkers ?? []) as any[]).map((m) => {
    const d = perMedewerker.get(m.id)
    const { status, dagen } = bepaalVcaStatus(d?.geldig_tot ?? null, !!d)
    return {
      medewerker_id: m.id,
      naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') || '—',
      functie: m.functie ?? null,
      afdeling: m.afdeling ?? null,
      diploma_id: d?.id ?? null,
      soort: (d?.soort as VcaSoort) ?? null,
      diplomanummer: d?.diplomanummer ?? null,
      behaald_op: d?.behaald_op ?? null,
      geldig_tot: d?.geldig_tot ?? null,
      status,
      dagen_tot_verval: dagen,
    }
  })
}

export async function bewaarDiploma(input: {
  diplomaId?: string | null
  medewerkerId: string
  soort: VcaSoort
  diplomanummer?: string | null
  behaaldOp?: string | null
  geldigTot?: string | null
}): Promise<ActionResult> {
  await vereisSessie()
  const supabase = db()

  const waarden = {
    medewerker_id: input.medewerkerId,
    soort: input.soort,
    diplomanummer: input.diplomanummer?.trim() || null,
    behaald_op: input.behaaldOp || null,
    geldig_tot: input.geldigTot || null,
  }

  const { error } = input.diplomaId
    ? await supabase.from('vca_diplomas').update(waarden).eq('id', input.diplomaId)
    : await supabase.from('vca_diplomas').insert(waarden)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/kam/vca-diplomas')
  return { ok: true, data: undefined }
}

export async function verwijderDiploma(diplomaId: string): Promise<ActionResult> {
  await vereisSessie()
  const { error } = await db().from('vca_diplomas').delete().eq('id', diplomaId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/kam/vca-diplomas')
  return { ok: true, data: undefined }
}
