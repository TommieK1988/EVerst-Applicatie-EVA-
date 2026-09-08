'use server'

import { revalidatePath } from 'next/cache'
import { vereisRecht } from '@/lib/auth/rechten'
import {
  verwerkParkingBestand,
  type ParkingImportResult,
} from '@/lib/wagenpark/parking-import-kern'
import { voerParkeerToewijzingUit } from '@/lib/wagenpark/parkeren-toewijzing'

export type { ParkingImportResult }

/**
 * Handmatige upload van een ULU parkeer-export (xlsx of csv).
 *
 * Het inlezen zelf staat in `parking-import-kern.ts`, zodat de mail-cron
 * dezelfde weg loopt zonder een ingelogde gebruiker nodig te hebben.
 */
export async function importParkingAction(formData: FormData): Promise<ParkingImportResult> {
  try {
    await vereisRecht('wagenpark', 'schrijven')
  } catch {
    return { ok: false, error: 'Onvoldoende rechten voor wagenpark.' }
  }

  const file = formData.get('parking') as File | null
  if (!file || file.size === 0) {
    return { ok: false, error: 'Geen bestand geselecteerd.' }
  }

  const buf = Buffer.from(await file.arrayBuffer())
  const result = await verwerkParkingBestand(buf, file.name, 'excel')

  // Meteen beoordelen wat er net is binnengekomen, zodat de werkvoorraad klopt
  // zonder op de nachtelijke ronde te wachten. Mislukt dat, dan is de import zelf
  // wél geslaagd — de cron pakt de beoordeling later alsnog op.
  if (result.ok && result.nieuweIds?.length) {
    try {
      await voerParkeerToewijzingUit({ parkingIds: result.nieuweIds })
    } catch (err) {
      console.error('[parking import] toewijzing na import mislukt', err)
    }
  }

  if (result.ok) {
    revalidatePath('/wagenpark/parkeren')
    revalidatePath('/wagenpark/parkeren/toewijzen')
    revalidatePath('/wagenpark/ritten')
    revalidatePath('/wagenpark/dashboard')
  }
  return result
}
