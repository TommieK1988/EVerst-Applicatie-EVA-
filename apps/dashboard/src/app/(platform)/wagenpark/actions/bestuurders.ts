'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getPgPool } from '@/lib/wagenpark/db'

export async function toggleBestuurderBijtellingAction(
  ulu_user_id: number,
  waarde: boolean,
): Promise<void> {
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
