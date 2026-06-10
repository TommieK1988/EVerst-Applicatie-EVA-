'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { MedewerkerAfwezigheid } from '@everts/database/platform-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const tijdRegex = /^\d{2}:\d{2}$/

const afwezigheidSchema = z.object({
  medewerker_id: z.string().uuid(),
  type: z.enum(['verlof', 'ziek', 'training', 'overig']),
  start_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  eind_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_tijd: z.string().regex(tijdRegex).nullable().optional(),
  eind_tijd: z.string().regex(tijdRegex).nullable().optional(),
  opmerking: z.string().nullable().optional(),
})

export async function maakAfwezigheid(
  input: z.infer<typeof afwezigheidSchema>,
): Promise<{ ok: true; data: MedewerkerAfwezigheid } | { ok: false; error: string }> {
  const parsed = afwezigheidSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  if (parsed.data.eind_datum < parsed.data.start_datum)
    return { ok: false, error: 'Einddatum mag niet vóór startdatum liggen' }

  const { data, error } = await db()
    .from('medewerker_afwezigheid')
    .insert({
      ...parsed.data,
      start_tijd: parsed.data.start_tijd ?? null,
      eind_tijd:  parsed.data.eind_tijd  ?? null,
      opmerking:  parsed.data.opmerking  ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning/medewerker')
  return { ok: true, data }
}

export async function verwijderAfwezigheid(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('medewerker_afwezigheid')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning/medewerker')
  return { ok: true }
}

export async function haalAfwezigheidInPeriode(
  start: string,
  einde: string,
): Promise<MedewerkerAfwezigheid[]> {
  const { data } = await db()
    .from('medewerker_afwezigheid')
    .select('*')
    .gte('eind_datum', start)
    .lte('start_datum', einde)
    .order('start_datum')

  return data ?? []
}
