'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@everts/database/server'
import { getPgPool } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'

export type HandmatigeBevindingInput = {
  trip_id: string
  regel_code: string
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  toelichting: string
}

/** Auth-user-id van de ingelogde gebruiker; compliance_feedback.gebruiker_id wijst naar auth.users. */
async function huidigeAuthUserId(): Promise<string | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id ?? null
  } catch {
    return null
  }
}

/**
 * Ken handmatig een afwijking toe aan een rit.
 *
 * De bevinding krijgt `bron = 'handmatig'` en wordt daarmee niet opgeruimd door
 * een volgende compliance-run (zie de delete in runComplianceAction). Er komt
 * altijd een `compliance_feedback`-regel bij, zodat ook zichtbaar blijft wie
 * het signaal toekende; de toelichting daarin is optioneel.
 *
 * De fingerprint krijgt een eigen `handmatig|`-namespace: zo botst een
 * handmatige toekenning nooit met de automatische fingerprint voor dezelfde
 * rit + regel, en kan dezelfde regel niet twee keer aan één rit hangen.
 */
export async function voegHandmatigeBevindingToe(
  input: HandmatigeBevindingInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await vereisRecht('wagenpark', 'schrijven')
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }

  // Toelichting is optioneel: de regelcode zelf zegt vaak al genoeg.
  const toelichting = input.toelichting.trim()

  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')

    // De rit levert de datum en het voertuig; zonder rit heeft een afwijking
    // geen context en hoort hij hier niet thuis.
    const trip = await client.query<{
      start_datum: string
      kenteken: string
      voertuig_id: string | null
      bestuurder_naam_raw: string | null
      user_id_ulu: number | null
    }>(
      `select start_datum::text, kenteken, voertuig_id::text,
              bestuurder_naam_raw, user_id_ulu
         from public.ulu_trips where id = $1 limit 1`,
      [input.trip_id],
    )
    if (trip.rowCount === 0) {
      await client.query('rollback')
      return { ok: false, error: 'Rit niet gevonden.' }
    }
    const t = trip.rows[0]

    // Staat de engine hier al op? Dan is een handmatige kopie ruis.
    const bestaat = await client.query(
      `select 1 from public.compliance_bevindingen
        where trip_id = $1 and regel_code = $2 and status = 'open' limit 1`,
      [input.trip_id, input.regel_code],
    )
    if ((bestaat.rowCount ?? 0) > 0) {
      await client.query('rollback')
      return {
        ok: false,
        error: `Deze rit heeft al een open ${input.regel_code}-signaal.`,
      }
    }

    // Zonder toelichting valt de omschrijving terug op de titel van de regel —
    // een bevinding met een lege omschrijving zegt in de lijst niets.
    const regel = await client.query<{ titel: string }>(
      `select titel from public.handboek_regels where code = $1 limit 1`,
      [input.regel_code],
    )
    const fingerprint = `handmatig|${input.regel_code}|trip|${input.trip_id}`
    const omschrijving =
      `Handmatig toegekend: ` +
      (toelichting || regel.rows[0]?.titel || input.regel_code)

    const ins = await client.query<{ id: string }>(
      `insert into public.compliance_bevindingen
         (fingerprint, regel_code, voertuig_id, medewerker_id, trip_id,
          periode_start, periode_eind, ernst, omschrijving, data, status, bron)
       values ($1, $2, $3, null, $4, $5::date, $5::date, $6, $7, $8::jsonb, 'open', 'handmatig')
       on conflict (fingerprint) do nothing
       returning id`,
      [
        fingerprint,
        input.regel_code,
        t.voertuig_id,
        input.trip_id,
        t.start_datum,
        input.ernst,
        omschrijving,
        JSON.stringify({
          handmatig: true,
          ...(toelichting ? { toelichting } : {}),
          kenteken: t.kenteken,
          bestuurder: t.bestuurder_naam_raw,
          user_id_ulu: t.user_id_ulu,
          uitleg_regel:
            'Dit signaal is niet door de compliance-engine gevonden maar handmatig ' +
            'toegekend, omdat een medewerker vond dat deze rit afwijkt. Het blijft ' +
            'staan bij volgende compliance-checks.',
        }),
      ],
    )
    if (ins.rowCount === 0) {
      await client.query('rollback')
      return {
        ok: false,
        error: `Deze rit heeft al een handmatig ${input.regel_code}-signaal.`,
      }
    }

    await client.query(
      `insert into public.compliance_feedback (bevinding_id, gebruiker_id, actie, toelichting)
       values ($1, $2, 'handmatig_toegekend', $3)`,
      [ins.rows[0].id, await huidigeAuthUserId(), toelichting || null],
    )

    await client.query('commit')
    revalidatePath('/wagenpark/ritten')
    revalidatePath('/wagenpark/bestuurders')
    return { ok: true }
  } catch (err) {
    await client.query('rollback')
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    client.release()
  }
}

/**
 * Trek een handmatig toegekende afwijking weer in.
 *
 * Alleen handmatige bevindingen: signalen van de engine horen via de normale
 * afhandeling (uitzondering / bevestigen) te lopen, niet via verwijderen.
 */
export async function verwijderHandmatigeBevinding(
  bevinding_id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await vereisRecht('wagenpark', 'schrijven')
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }

  const pool = getPgPool()
  try {
    const res = await pool.query(
      `delete from public.compliance_bevindingen where id = $1 and bron = 'handmatig'`,
      [bevinding_id],
    )
    if (res.rowCount === 0) {
      return { ok: false, error: 'Alleen handmatig toegekende afwijkingen kunnen worden ingetrokken.' }
    }
    revalidatePath('/wagenpark/ritten')
    revalidatePath('/wagenpark/bestuurders')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
