'use server'

import { revalidatePath } from 'next/cache'
import { getPgPool } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'

/**
 * Voeg een "altijd toestaan" regel toe voor een bestuurder.
 * Zelflerend: toekomstige bevindingen die matchen worden automatisch als
 * 'geaccepteerd_uitzondering' gemarkeerd.
 *
 * Bij aanroep wordt de huidige bevinding direct ook op 'uitzondering' gezet.
 */
export async function addAllowanceAction(opts: {
  bevinding_id?: string | null
  ulu_user_id: number | null
  regel_code: string
  categorie?: string | null
  reden?: string | null
}): Promise<{ ok: boolean; error?: string }> {
  try { await vereisRecht('wagenpark', 'schrijven') } catch { return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' } }
  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    await client.query(
      `insert into public.compliance_allowances
         (ulu_user_id, regel_code, categorie, reden)
       values ($1, $2, $3, $4)
       on conflict (ulu_user_id, regel_code, categorie) do update set
         actief = true,
         reden = coalesce(excluded.reden, public.compliance_allowances.reden),
         ingetrokken_op = null`,
      [opts.ulu_user_id, opts.regel_code, opts.categorie ?? null, opts.reden ?? null],
    )

    // Direct: alle open bevindingen die matchen → 'geaccepteerd_uitzondering'
    // (voor de huidige én alle vergelijkbare).
    await client.query(
      `
      update public.compliance_bevindingen b
         set status = 'geaccepteerd_uitzondering', updated_at = now()
       where status = 'open'
         and b.regel_code = $2
         and (
           $1::bigint is null
           or (select t.user_id_ulu from public.ulu_trips t where t.id = b.trip_id limit 1) = $1::bigint
           or (b.data->>'user_id_ulu')::bigint = $1::bigint
         )
         and (
           $3::text is null
           or b.data->>'reden_prive' = $3::text
           or b.data->>'categorie' = $3::text
         )
      `,
      [opts.ulu_user_id, opts.regel_code, opts.categorie ?? null],
    )

    // Feedback-log voor audit
    if (opts.bevinding_id) {
      await client.query(
        `insert into public.compliance_feedback (bevinding_id, actie, toelichting)
         values ($1, 'allowance_aangemaakt', $2)`,
        [opts.bevinding_id, opts.reden ?? null],
      )
    }

    await client.query('commit')
    revalidatePath('/wagenpark/ritten')
    revalidatePath(`/wagenpark/bestuurders/${opts.ulu_user_id}`)
    revalidatePath('/wagenpark/bestuurders')
    revalidatePath('/wagenpark/instellingen')
    return { ok: true }
  } catch (err) {
    await client.query('rollback')
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    client.release()
  }
}

/** Trek een allowance weer in. */
export async function removeAllowanceAction(id: string): Promise<void> {
  await vereisRecht('wagenpark', 'schrijven')
  const pool = getPgPool()
  await pool.query(
    `update public.compliance_allowances
        set actief = false, ingetrokken_op = now()
      where id = $1`,
    [id],
  )
  revalidatePath('/wagenpark/ritten')
  revalidatePath('/wagenpark/bestuurders')
  revalidatePath('/wagenpark/instellingen')
}
