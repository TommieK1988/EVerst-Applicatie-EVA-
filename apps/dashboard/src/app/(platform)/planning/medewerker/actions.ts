'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { MedewerkerAfwezigheid } from '@everts/database/platform-types'
import { vereisRecht } from '@/lib/auth/rechten'
import { werkDayOffBijInBouw7, verwijderDayOffInBouw7 } from '@/lib/bouw7/verlof-write'
import { berekenVerlofUren } from '@/lib/uren/verlof'

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

export async function wijzigAfwezigheid(
  id: string,
  input: z.infer<typeof afwezigheidSchema>,
): Promise<{ ok: true; data: MedewerkerAfwezigheid } | { ok: false; error: string }> {
  await vereisRecht('planning', 'schrijven')
  const parsed = afwezigheidSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  if (parsed.data.eind_datum < parsed.data.start_datum)
    return { ok: false, error: 'Einddatum mag niet vóór startdatum liggen' }

  const { data: bestaand } = await db()
    .from('medewerker_afwezigheid')
    .select('bron, bouw7_id, type')
    .eq('id', id)
    .maybeSingle()
  if (!bestaand) return { ok: false, error: 'Deze afwezigheid bestaat niet meer.' }

  const v = parsed.data
  const heleDag   = !v.start_tijd
  const startTijd = heleDag ? null : v.start_tijd ?? null
  const eindTijd  = heleDag ? null : v.eind_tijd  ?? null
  // Bouw7 kent geen soort: een gesynct verlof wordt bij elke sync weer 'verlof'. Een andere
  // soort kiezen zou dus stil terugspringen — daarom blijft hij hier staan zoals hij was.
  const type = bestaand.bron === 'bouw7' ? bestaand.type : v.type

  // Staat het verlof in Bouw7, dan eerst daar bijwerken. Lukt dat niet, dan EVA niet aanraken:
  // de sync zou de wijziging anders ongedaan maken en de twee lopen uiteen.
  const uren = await verlofUren(v.medewerker_id, v.start_datum, v.eind_datum, startTijd, eindTijd)
  if (bestaand.bouw7_id) {
    const { data: med } = await db()
      .from('medewerkers').select('bouw7_id').eq('id', v.medewerker_id).maybeSingle()
    const employeeId = Number(med?.bouw7_id)
    if (!employeeId) return { ok: false, error: 'Deze medewerker is niet aan Bouw7 gekoppeld.' }
    try {
      await werkDayOffBijInBouw7({
        bouw7Id: bestaand.bouw7_id, employeeId,
        startDatum: v.start_datum, eindDatum: v.eind_datum,
        startTijd, eindTijd, uren, opmerking: v.opmerking ?? null,
      })
    } catch (e) {
      console.error('[verlof] bijwerken in Bouw7 mislukt:', e)
      return { ok: false, error: 'Bouw7 nam de wijziging niet aan; er is niets gewijzigd. Probeer het later opnieuw.' }
    }
  }

  const { data, error } = await db()
    .from('medewerker_afwezigheid')
    .update({
      medewerker_id: v.medewerker_id,
      type,
      start_datum: v.start_datum,
      eind_datum:  v.eind_datum,
      start_tijd:  startTijd,
      eind_tijd:   eindTijd,
      opmerking:   v.opmerking ?? null,
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error) return { ok: false, error: error.message }

  // Kwam dit verlof uit een goedgekeurde aanvraag, dan de aanvraag meenemen: een herkansing
  // naar Bouw7 leest zijn datums uit de aanvraag en zou de wijziging anders terugzetten.
  await db()
    .from('verlof_aanvragen')
    .update({
      start_datum: v.start_datum,
      eind_datum:  v.eind_datum,
      hele_dagen:  heleDag,
      start_tijd:  startTijd,
      eind_tijd:   eindTijd,
      uren_totaal: uren,
    })
    .eq('afwezigheid_id', id)

  revalidatePath('/planning/medewerker')
  return { ok: true, data }
}

/** Uren die het verlof kost: roosterdagen bij hele dagen, anders het tijdvenster per dag. */
async function verlofUren(
  medewerkerId: string, start: string, eind: string, startTijd: string | null, eindTijd: string | null,
): Promise<number> {
  if (!startTijd || !eindTijd) return (await berekenVerlofUren(medewerkerId, start, eind)).uren
  const minuten = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
  const perDag = Math.max(0, minuten(eindTijd) - minuten(startTijd)) / 60
  const dagen = Math.round((Date.parse(eind) - Date.parse(start)) / 86_400_000) + 1
  return Math.round(perDag * dagen * 100) / 100
}

export async function verwijderAfwezigheid(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisRecht('planning', 'schrijven')
  const { data: bestaand } = await db()
    .from('medewerker_afwezigheid')
    .select('bouw7_id')
    .eq('id', id)
    .maybeSingle()

  // Eerst uit Bouw7: zolang de day-off daar staat, zet de sync hem terug in EVA.
  if (bestaand?.bouw7_id) {
    try {
      await verwijderDayOffInBouw7(bestaand.bouw7_id)
    } catch (e) {
      console.error('[verlof] verwijderen in Bouw7 mislukt:', e)
      return { ok: false, error: 'Bouw7 nam het verwijderen niet aan; het verlof staat er nog. Probeer het later opnieuw.' }
    }
    // Een aanvraag die naar deze day-off wees, mag bij een herkansing geen dood id meer gebruiken.
    await db().from('verlof_aanvragen').update({ bouw7_day_off_id: null }).eq('afwezigheid_id', id)
  }

  const { error } = await db()
    .from('medewerker_afwezigheid')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning/medewerker')
  return { ok: true }
}
