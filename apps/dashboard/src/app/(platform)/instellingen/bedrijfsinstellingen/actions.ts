'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Bedrijfsinstellingen, Uurtarief } from '@everts/database/platform-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export async function getBedrijfsinstellingen(): Promise<Bedrijfsinstellingen> {
  const { data, error } = await db()
    .from('bedrijfsinstellingen')
    .select('*')
    .eq('id', 1)
    .single()

  if (error || !data) {
    // btw_tarieven is een vervallen kolom (zie de tabel `btw_tarieven`); leeg laten.
    return { id: 1, uurtarieven: [], btw_tarieven: [], overige: {}, updated_at: new Date().toISOString() }
  }
  return data as Bedrijfsinstellingen
}

export async function updateBedrijfsinstellingen(
  patch: Partial<Pick<Bedrijfsinstellingen, 'uurtarieven' | 'btw_tarieven' | 'overige'>>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('bedrijfsinstellingen')
    .update(patch)
    .eq('id', 1)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/bedrijfsinstellingen')
  revalidatePath('/instellingen/planning')
  return { ok: true }
}

export async function setUurtarieven(
  uurtarieven: Uurtarief[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateBedrijfsinstellingen({ uurtarieven })
}

// setBtwTarieven() is vervallen: BTW-tarieven staan in de tabel `btw_tarieven` (afgeleid
// uit Bouw7), niet meer als losse percentagelijst in de bedrijfsinstellingen.

/** Instelbaar drempelbedrag (excl. btw) waarboven Mutatie/Dagelijks-onderhoud-offertes goedkeuring vereisen. */
export async function getGoedkeuringDrempelOfferte(): Promise<number> {
  const inst = await getBedrijfsinstellingen()
  const v = (inst.overige as any)?.goedkeuring_drempel_offerte
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 1000
}

/**
 * Opslag (in procenten) op geboekte kosten bij regie-facturatie en bij het verrekenen van een
 * stelpost op geboekte kosten. Stond eerder als constante 25 in `lib/dossiers/servicedesk.ts`,
 * waar hij ongemerkt in elk verrekensaldo meerekende.
 */
export async function getRegieOpslagPct(): Promise<number> {
  const inst = await getBedrijfsinstellingen()
  const v = (inst.overige as any)?.regie_opslag_pct
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : 25
}

export async function setRegieOpslagPct(
  pct: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!Number.isFinite(pct) || pct < 0) return { ok: false, error: 'Vul een percentage van 0 of hoger in.' }
  const inst = await getBedrijfsinstellingen()
  const res = await updateBedrijfsinstellingen({
    overige: { ...(inst.overige as any), regie_opslag_pct: pct },
  })
  if (res.ok) revalidatePath('/instellingen/facturatie')
  return res
}

export async function setGoedkeuringDrempelOfferte(
  bedrag: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inst = await getBedrijfsinstellingen()
  return updateBedrijfsinstellingen({
    overige: { ...(inst.overige as any), goedkeuring_drempel_offerte: bedrag },
  })
}

/**
 * Eenheden (st, m¹, m², uur, …) horen bij de bedrijfsinstellingen, zodat de
 * calculatie, de recepten en de houtrotregistratie dezelfde lijst gebruiken.
 * Stonden eerder los in de calculatie-instellingen (`everts_calc_instellingen`).
 */
export type Eenheid = { afkorting: string; omschrijving?: string }

const STANDAARD_EENHEDEN: Eenheid[] = [
  { afkorting: 'st' }, { afkorting: 'm¹' }, { afkorting: 'm²' }, { afkorting: 'm³' },
  { afkorting: 'uur' }, { afkorting: 'dag' }, { afkorting: 'ltr' }, { afkorting: 'kg' },
  { afkorting: 'set' },
]

export async function getEenheden(): Promise<Eenheid[]> {
  const { data } = await db()
    .from('bedrijfsinstellingen')
    .select('eenheden')
    .eq('id', 1)
    .maybeSingle()

  const lijst = data?.eenheden
  return Array.isArray(lijst) && lijst.length > 0 ? (lijst as Eenheid[]) : STANDAARD_EENHEDEN
}

export async function setEenheden(
  eenheden: Eenheid[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('bedrijfsinstellingen')
    .update({ eenheden })
    .eq('id', 1)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/bedrijfsinstellingen')
  revalidatePath('/everts-calc/instellingen')
  revalidatePath('/everts-calc/bibliotheek/recepten')
  return { ok: true }
}

export async function getDossierCategorieen(): Promise<string[]> {
  const inst = await getBedrijfsinstellingen()
  const cats = (inst.overige as any)?.dossier_categorieen
  return Array.isArray(cats) ? cats : []
}

export async function setDossierCategorieen(
  categorieen: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const inst = await getBedrijfsinstellingen()
  const result = await updateBedrijfsinstellingen({
    overige: { ...(inst.overige as any), dossier_categorieen: categorieen },
  })
  if (result.ok) revalidatePath('/instellingen/dossier-categorieen')
  return result
}
