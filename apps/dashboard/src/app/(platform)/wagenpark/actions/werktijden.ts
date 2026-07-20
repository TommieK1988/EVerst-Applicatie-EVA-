'use server'

import { revalidatePath } from 'next/cache'
import { GeenToegangError } from '@/lib/auth/rechten'
import { magPriveRittenZien } from '@/lib/wagenpark/privacy'
import { geocodeReferentieadressen } from '@/lib/wagenpark/geocode'
import { stuurWagenparkDagoverzicht } from '@/lib/wagenpark/dagoverzicht'
import { genereerWagenparkMaandrapporten } from '@/lib/wagenpark/maandrapport'

/**
 * Server-acties voor de werktijd-analyse. Alle acties zijn AVG-gevoelig
 * (woonadres-nabijheid, deels privé-ritten) en daarom afgeschermd voor
 * uitsluitend Directie/beheer via magPriveRittenZien().
 */

async function vereisDirectieBeheer(): Promise<void> {
  if (!(await magPriveRittenZien())) {
    throw new GeenToegangError('Alleen Directie/beheer heeft toegang tot de werktijd-analyse.')
  }
}

export async function geocodeAdressenAction() {
  await vereisDirectieBeheer()
  const res = await geocodeReferentieadressen()
  revalidatePath('/wagenpark/werktijden')
  return res
}

export async function runDagoverzichtAction(datum?: string) {
  await vereisDirectieBeheer()
  const res = await stuurWagenparkDagoverzicht(new Date(), datum)
  revalidatePath('/wagenpark/werktijden')
  return res
}

export async function runMaandrapportAction(jaar?: number, maand?: number) {
  await vereisDirectieBeheer()
  const override = jaar && maand ? { jaar, maand } : undefined
  const res = await genereerWagenparkMaandrapporten(new Date(), override)
  revalidatePath('/wagenpark/werktijden')
  return res
}
