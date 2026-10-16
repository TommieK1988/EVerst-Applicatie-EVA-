'use server'

/**
 * De Bouw7-offertes onder een dossier. Uit `actions.ts` gehaald om dat bestand onder de
 * 800 regels te houden; de bewakingstab is de enige gebruiker.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'

// ── Verstuurde offertes bij een dossier ──────────────────────────────────────

export type OfferteRegel = {
  id: string
  nummer: string | null
  onderwerp: string | null
  datum: string | null
  status: string | null
  bedrag: number | null
  calculator: string | null
}

/**
 * De Bouw7-offertes onder dit project, nieuwste eerst.
 *
 * Onder één project kunnen er meerdere hangen; zonder deze lijst zie je op de kaart alleen een
 * totaalbedrag en niet wélke offerte openstaat. Leesbron is `bouw7_offertes`, gevuld door
 * `syncBouw7Offertes` — dit zijn dus Bouw7-gegevens, geen EVA-administratie.
 */
export async function getOffertesVoorDossier(dossierId: string): Promise<OfferteRegel[]> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = createAdminClient()

  // Begrensd op één dossier; blijft ruim onder de PostgREST-grens.
  const { data } = await supabase
    .from('bouw7_offertes')
    .select('id,nummer,onderwerp,datum,status,subtotaal_excl_btw,calculator_naam')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false, nullsFirst: false })

  return (data ?? []).map(r => ({
    id: r.id,
    nummer: r.nummer,
    onderwerp: r.onderwerp,
    datum: r.datum,
    status: r.status,
    bedrag: r.subtotaal_excl_btw,
    calculator: r.calculator_naam,
  }))
}
