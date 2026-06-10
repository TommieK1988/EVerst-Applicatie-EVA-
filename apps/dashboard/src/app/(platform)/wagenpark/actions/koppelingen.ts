'use server'

import { revalidatePath } from 'next/cache'
import { getPgPool } from '@/lib/wagenpark/db'

export async function setVoertuigBestuurderAction(
  voertuig_id: string,
  ulu_user_id: number | null,
  start_datum?: string,
): Promise<{ ok: boolean; error?: string }> {
  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('begin')
    // Eindig alle huidige actieve koppelingen voor dit voertuig
    await client.query(
      `update public.voertuig_bestuurders
          set eind_datum = current_date, updated_at = now()
        where voertuig_id = $1 and eind_datum is null`,
      [voertuig_id],
    )
    // Maak nieuwe koppeling (tenzij ulu_user_id = null = 'ontkoppelen')
    if (ulu_user_id != null) {
      const start = start_datum ?? new Date().toISOString().slice(0, 10)
      await client.query(
        `insert into public.voertuig_bestuurders
           (voertuig_id, ulu_user_id, medewerker_id, start_datum, is_primair)
         values ($1, $2, null, $3, true)`,
        [voertuig_id, ulu_user_id, start],
      )
    }
    await client.query('commit')
    revalidatePath(`/wagenpark/voertuigen/${voertuig_id}`)
    revalidatePath('/wagenpark/voertuigen')
    revalidatePath('/wagenpark/bestuurders')
    return { ok: true }
  } catch (err) {
    await client.query('rollback')
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    client.release()
  }
}
