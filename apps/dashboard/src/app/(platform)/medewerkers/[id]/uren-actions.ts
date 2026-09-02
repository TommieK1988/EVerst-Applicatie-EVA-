'use server'

// Correcties op het tijd-voor-tijdsaldo van een medewerker.
//
// Het saldo rekent zichzelf uit over de goedgekeurde weken (view `uren_saldo_per_medewerker`).
// Een correctie is voor wat daar per definitie buiten valt: de beginstand bij ingebruikname, en
// losse afspraken zoals uitbetalen of kwijtschelden. Altijd met een reden, want een saldo dat
// verspringt zonder uitleg levert een discussie op die niemand kan naslaan.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht } from '@/lib/auth/rechten'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function voegSaldoCorrectieToe(
  medewerkerId: string, uren: number, reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Het saldo van een collega bijstellen is medewerkersbeheer, geen urenwerk.
  const { medewerker } = await vereisRecht('medewerkers', 'beheren')

  if (!Number.isFinite(uren) || uren === 0) {
    return { ok: false, error: 'Vul een aantal uren in (mag negatief zijn).' }
  }
  if (Math.abs(uren) > 2000) {
    return { ok: false, error: 'Dat lijkt geen realistische correctie.' }
  }
  if (!reden.trim()) return { ok: false, error: 'Geef een reden op.' }

  const nu = new Date()
  const datum = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`

  const { error } = await db().from('uren_saldo_correcties').insert({
    medewerker_id: medewerkerId,
    datum,
    uren: Math.round(uren * 100) / 100,
    reden: reden.trim(),
    door: medewerker.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/medewerkers/${medewerkerId}`)
  return { ok: true }
}

export async function verwijderSaldoCorrectie(
  correctieId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('medewerkers', 'beheren')

  const supabase = db()
  const { data: c } = await supabase
    .from('uren_saldo_correcties').select('medewerker_id').eq('id', correctieId).maybeSingle()
  if (!c) return { ok: false, error: 'Correctie niet gevonden.' }

  const { error } = await supabase.from('uren_saldo_correcties').delete().eq('id', correctieId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/medewerkers/${c.medewerker_id}`)
  return { ok: true }
}
