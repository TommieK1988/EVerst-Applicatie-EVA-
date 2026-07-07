'use server'

import { revalidatePath } from 'next/cache'
import { getOfferteMailSjabloon, setOfferteMailSjabloon, type OfferteMailSjabloon } from '@/lib/everts-calc/offerte-mail'
import { vereisBeheerder } from '@/lib/auth/rechten'

export async function laadOfferteMailSjabloon(): Promise<OfferteMailSjabloon> {
  return getOfferteMailSjabloon()
}

export async function bewaarOfferteMailSjabloon(sjabloon: OfferteMailSjabloon): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await vereisBeheerder()
    await setOfferteMailSjabloon(sjabloon)
    revalidatePath('/instellingen/offerte-mail')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Opslaan mislukt' }
  }
}
