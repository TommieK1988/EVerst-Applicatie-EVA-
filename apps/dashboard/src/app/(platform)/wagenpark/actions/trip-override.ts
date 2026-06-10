'use server'

import { revalidatePath } from 'next/cache'
import { getPgPool } from '@/lib/wagenpark/db'

/**
 * Zet een rit op zakelijk/privé (handmatige override) of verwijder de override.
 * rit_type_override = null betekent: gebruik weer de automatische classificatie
 * (rit_type_berekend uit de trigger op basis van datum+tijd).
 */
export async function updateRitTypeAction(
  trip_id: string,
  nieuwType: 'zakelijk' | 'prive' | null,
): Promise<{ ok: boolean; error?: string }> {
  const pool = getPgPool()
  try {
    if (nieuwType === null) {
      // Reset naar automatisch
      await pool.query(
        `update public.ulu_trips
            set rit_type_override = null,
                rit_type_handmatig = false
          where id = $1`,
        [trip_id],
      )
    } else {
      await pool.query(
        `update public.ulu_trips
            set rit_type_override = $1::rit_type_berekend,
                rit_type_handmatig = true
          where id = $2`,
        [nieuwType, trip_id],
      )
    }
    // Revalidate alles wat trip-data toont
    revalidatePath('/wagenpark/bevindingen')
    revalidatePath('/wagenpark/bestuurders')
    revalidatePath('/wagenpark/voertuigen')
    revalidatePath('/wagenpark/ritten')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
