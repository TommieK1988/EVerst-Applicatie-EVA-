'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { RechtenSet } from '@everts/database/platform-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActionResult = { ok: true } | { ok: false; error: string }

export async function getGebruikers() {
  const { data, error } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, email, afdeling, gebruiker_type, rechten_override, o365_email, auth_user_id, actief')
    .neq('gebruiker_type', 'geen')
    .eq('actief', true)
    .order('achternaam')

  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, data: data ?? [] }
}

export async function getAfdelingenMetRechten() {
  const { data, error } = await db()
    .from('medewerker_afdelingen')
    .select('id, naam, volgorde, actief, standaard_rechten')
    .eq('actief', true)
    .order('volgorde')
    .order('naam')

  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, data: data ?? [] }
}

const rechtenSetSchema = z.record(
  z.enum(['medewerkers', 'planning', 'dossiers', 'financieel', 'wagenpark', 'houtrotherstel', 'everts_calc', 'instellingen']),
  z.enum(['lezen', 'schrijven', 'beheren']).nullable()
)

export async function updateAfdelingRechten(
  afdeling_id: string,
  rechten: RechtenSet
): Promise<ActionResult> {
  const parsed = rechtenSetSchema.safeParse(rechten)
  if (!parsed.success) return { ok: false, error: 'Ongeldige rechten' }

  const { error } = await db()
    .from('medewerker_afdelingen')
    .update({ standaard_rechten: parsed.data })
    .eq('id', afdeling_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/gebruikers')
  revalidatePath('/medewerkers')
  return { ok: true }
}
