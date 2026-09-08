'use server'

import { vereisRecht } from '@/lib/auth/rechten'
import { voerUluSync, type UluSyncResult } from '@/lib/wagenpark/ulu-sync-kern'

export type { UluSyncResult }

/**
 * De ULU-sync starten vanaf de knop in de app.
 *
 * Het werk staat in `lib/wagenpark/ulu-sync-kern.ts`, zodat de nachtelijke cron
 * dezelfde ronde kan draaien zonder ingelogde gebruiker. Hier staat alleen de
 * rechtencontrole omheen.
 *
 * @param periodeStart  ISO datum YYYY-MM-DD (default: 1 jan huidig jaar)
 * @param periodeEind   ISO datum YYYY-MM-DD (default: vandaag)
 */
export async function syncUluAction(
  periodeStart?: string,
  periodeEind?: string,
): Promise<UluSyncResult> {
  try {
    await vereisRecht('wagenpark', 'schrijven')
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }
  return voerUluSync(periodeStart, periodeEind)
}
