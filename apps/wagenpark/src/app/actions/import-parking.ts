'use server'

import { revalidatePath } from 'next/cache'
import { runParkingImport } from '@/lib/parking-import-core'

export type { ParkingImportResult } from '@/lib/parking-import-core'

export async function importParkingAction(formData: FormData) {
  const file = formData.get('parking') as File | null
  if (!file || file.size === 0) {
    return { ok: false, error: 'Geen bestand geselecteerd.' }
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer())
    const result = await runParkingImport(buf, file.name)
    if (result.ok) {
      revalidatePath('/ritten')
      revalidatePath('/dashboard')
    }
    return result
  } catch (err) {
    console.error('[parking import] fout', err)
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
