'use server'

import { revalidatePath } from 'next/cache'
import { getPgPool } from '@/lib/wagenpark/db'

export async function toggleRegelAction(code: string, actief: boolean) {
  const pool = getPgPool()
  await pool.query(
    `update public.handboek_regels set actief = $1, gewijzigd_op = now() where code = $2`,
    [actief, code],
  )
  revalidatePath('/wagenpark/instellingen')
}

export async function updateRegelConfigAction(
  code: string,
  jsonText: string,
): Promise<{ ok: boolean; error?: string }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    return { ok: false, error: 'Ongeldige JSON: ' + (e instanceof Error ? e.message : String(e)) }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'JSON moet een object zijn, bv. {"key": value}' }
  }

  const pool = getPgPool()
  try {
    await pool.query(
      `update public.handboek_regels
          set drempel_config = $1::jsonb, gewijzigd_op = now()
        where code = $2`,
      [JSON.stringify(parsed), code],
    )
    revalidatePath('/wagenpark/instellingen')
    revalidatePath('/wagenpark/bevindingen')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
