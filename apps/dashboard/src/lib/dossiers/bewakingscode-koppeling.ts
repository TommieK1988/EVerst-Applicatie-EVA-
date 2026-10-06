import 'server-only'

import { createAdminClient } from '@everts/database/server'

/**
 * Welke bewakingscodes van een dossier aan de Hoofdopdracht gekoppeld zijn.
 *
 * Alleen een indeling: de werkbegroting sorteert erop ("Per post") en Verwacht resultaat groepeert
 * de bewakingscodes onder de Hoofdopdracht. Geen enkel bedrag of totaal hangt ervan af.
 *
 * Per codetekst, zoals de werkbegroting codes kent (zonder hoofdstuk). Dit is de kale lezer;
 * `bewakingscode-koppeling-actions.ts` is de variant met sessiecontrole voor clientschermen.
 */

/** Bewakingscode uit een kostengroep "CODE — omschrijving" (zelfde regel als de werkbegroting). */
export const kaleBewakingscode = (kg: string | null | undefined): string =>
  (kg ?? '').split(/\s[—-]\s/)[0].trim()

export async function leesKoppelingen(dossierId: string): Promise<Set<string>> {
  const { data } = await createAdminClient()
    .from('bewakingscode_koppelingen')
    .select('bewakingscode')
    .eq('dossier_id', dossierId)
    .eq('doel', 'hoofdopdracht')
  return new Set((data ?? []).map(r => r.bewakingscode))
}
