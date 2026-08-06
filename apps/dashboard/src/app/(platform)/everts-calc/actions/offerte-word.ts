'use server'

/**
 * Server-actions rond het bewerkbare Word-document van een offerte.
 * Het opstellen zelf loopt via de route `/everts-calc/api/quotes/[id]/word-online`
 * (de browser moet het tabblad synchroon bij de klik openen).
 */

import { revalidatePath } from 'next/cache'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import {
  getOfferteWordStatus as leesStatus,
  ontkoppelOfferteWord,
  type OfferteWordStatus,
} from '@/lib/everts-calc/offerte-word'

export type { OfferteWordStatus }

export async function getOfferteWordStatus(quoteId: string): Promise<OfferteWordStatus> {
  await vereisRecht('everts_calc', 'lezen')
  return leesStatus(quoteId)
}

/**
 * Verbreekt de koppeling — de offerte wordt weer uit het layout-sjabloon opgemaakt.
 * Het bestand blijft in de SharePoint-dossiermap staan.
 */
export async function ontkoppelWord(quoteId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Geen toegang' }
    throw e
  }

  await ontkoppelOfferteWord(quoteId)
  revalidatePath(`/everts-calc/quotes/${quoteId}`)
  return { ok: true }
}
