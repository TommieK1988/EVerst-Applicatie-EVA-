'use server'

import { revalidatePath } from 'next/cache'
import { vereisBeheerder } from '@/lib/auth/rechten'
import {
  setBestellingMailSjablonen, type BestellingMailSjablonen,
} from '@/lib/bouw7/bestelling-mail-sjabloon'

export async function bewaarBestellingMailSjablonen(
  sjablonen: BestellingMailSjablonen,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await vereisBeheerder()
    await setBestellingMailSjablonen(sjablonen)
    revalidatePath('/instellingen/inkoop-mail')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Opslaan mislukt' }
  }
}
