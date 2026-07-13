'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getPgPool } from '@/lib/wagenpark/db'
import { vereisRecht } from '@/lib/auth/rechten'

export async function toggleBestuurderBijtellingAction(
  ulu_user_id: number,
  waarde: boolean,
): Promise<void> {
  await vereisRecht('wagenpark', 'schrijven')
  const pool = getPgPool()
  await pool.query(
    `update public.ulu_users set bijtelling_betaald = $1, updated_at = now() where id = $2`,
    [waarde, ulu_user_id],
  )
  revalidatePath('/wagenpark/bestuurders')
  revalidatePath(`/wagenpark/bestuurders/${ulu_user_id}`)
  revalidatePath('/wagenpark/dashboard')
}

export async function toggleBestuurderActiefAction(
  ulu_user_id: number,
  waarde: boolean,
): Promise<void> {
  await vereisRecht('wagenpark', 'schrijven')
  const pool = getPgPool()
  await pool.query(
    `update public.ulu_users set actief = $1, updated_at = now() where id = $2`,
    [waarde, ulu_user_id],
  )
  revalidatePath('/wagenpark/bestuurders')
  revalidatePath(`/wagenpark/bestuurders/${ulu_user_id}`)
}

const editSchema = z.object({
  prive_limiet_km_jaar: z.coerce.number().int().nullable().optional(),
  zakelijk_verwacht_km_jaar: z.coerce.number().int().nullable().optional(),
  opmerkingen: z.string().nullable().optional(),
  werktijd_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)),
  werktijd_eind: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional().or(z.literal('').transform(() => null)),
})

export async function updateBestuurderFieldsAction(
  ulu_user_id: number,
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  try { await vereisRecht('wagenpark', 'schrijven') } catch { return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' } }
  const raw = {
    prive_limiet_km_jaar: formData.get('prive_limiet_km_jaar') || null,
    zakelijk_verwacht_km_jaar: formData.get('zakelijk_verwacht_km_jaar') || null,
    opmerkingen: formData.get('opmerkingen')?.toString() || null,
    werktijd_start: (formData.get('werktijd_start')?.toString() || '') || null,
    werktijd_eind: (formData.get('werktijd_eind')?.toString() || '') || null,
  }
  const parsed = editSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Validatie' }

  const pool = getPgPool()
  await pool.query(
    `update public.ulu_users
        set prive_limiet_km_jaar     = $1,
            zakelijk_verwacht_km_jaar = $2,
            opmerkingen              = $3,
            werktijd_start           = $4::time,
            werktijd_eind            = $5::time,
            updated_at               = now()
      where id = $6`,
    [
      parsed.data.prive_limiet_km_jaar ?? null,
      parsed.data.zakelijk_verwacht_km_jaar ?? null,
      parsed.data.opmerkingen ?? null,
      parsed.data.werktijd_start ?? null,
      parsed.data.werktijd_eind ?? null,
      ulu_user_id,
    ],
  )
  revalidatePath('/wagenpark/bestuurders')
  revalidatePath(`/wagenpark/bestuurders/${ulu_user_id}`)
  return { ok: true }
}

/**
 * Koppel een medewerker aan deze ULU-bestuurder (spiegelbeeld van de koppeling
 * vanaf de medewerker-detailpagina). `medewerker_id = null` = ontkoppelen.
 * Eén bestuurder per medewerker: een bestaande koppeling van díe medewerker
 * wordt eerst losgemaakt.
 */
export async function koppelMedewerkerAanBestuurderAction(
  ulu_user_id: number,
  medewerker_id: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try { await vereisRecht('wagenpark', 'schrijven') } catch { return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' } }
  const pool = getPgPool()
  try {
    if (medewerker_id == null) {
      await pool.query(
        `update public.ulu_users set medewerker_id = null, updated_at = now() where id = $1`,
        [ulu_user_id],
      )
    } else {
      await pool.query(
        `update public.ulu_users set medewerker_id = null, updated_at = now() where medewerker_id = $1`,
        [medewerker_id],
      )
      await pool.query(
        `update public.ulu_users set medewerker_id = $2, updated_at = now() where id = $1`,
        [ulu_user_id, medewerker_id],
      )
    }
    revalidatePath(`/wagenpark/bestuurders/${ulu_user_id}`)
    revalidatePath('/wagenpark/bestuurders')
    if (medewerker_id) revalidatePath(`/medewerkers/${medewerker_id}`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
