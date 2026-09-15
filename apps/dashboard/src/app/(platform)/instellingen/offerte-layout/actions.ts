'use server'

import { revalidatePath } from 'next/cache'
import {
  getLayouts as _getLayouts,
  getLayout as _getLayout,
  maakLayout as _maakLayout,
  updateLayout as _updateLayout,
  kopieerLayout as _kopieerLayout,
  verwijderLayout as _verwijderLayout,
  setStandaardLayout as _setStandaardLayout,
} from '@/app/(platform)/everts-calc/actions/quote-instellingen'

/** De editor-route; de lijst zelf is een tabblad van /instellingen/offertes. */
const PAD = '/instellingen/offerte-layout'
const LIJST = '/instellingen/offertes'

export async function getLayouts(soort?: Parameters<typeof _getLayouts>[0]) {
  return _getLayouts(soort)
}

export async function getLayout(id: string) {
  return _getLayout(id)
}

export async function maakLayout(data: Parameters<typeof _maakLayout>[0]): Promise<string> {
  const id = await _maakLayout(data)
  revalidatePath(LIJST)
  return id
}

export async function updateLayout(id: string, data: Record<string, unknown>): Promise<void> {
  await _updateLayout(id, data)
  revalidatePath(LIJST)
  revalidatePath(`${PAD}/${id}`)
}

export async function kopieerLayout(id: string): Promise<{ id: string; waarschuwing: string | null }> {
  const resultaat = await _kopieerLayout(id)
  revalidatePath(LIJST)
  return resultaat
}

export async function verwijderLayout(id: string): Promise<void> {
  await _verwijderLayout(id)
  revalidatePath(LIJST)
}

export async function setStandaardLayout(id: string): Promise<void> {
  await _setStandaardLayout(id)
  revalidatePath(LIJST)
}
