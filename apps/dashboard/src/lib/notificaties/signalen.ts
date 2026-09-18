import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * Het geheugen van de dagsignalen-cron: wat is er per medewerker al gemeld?
 *
 * Zonder dit zou elke run van de cron dezelfde melding opnieuw sturen. Met dit
 * geheugen bepaalt niet de klok maar de *toestand* of er een melding uitgaat:
 * dezelfde sleutel als vorige keer = niets nieuws = stil blijven. Daarmee is de
 * frequentie van de cron ongevaarlijk — vaker draaien geeft niet meer meldingen,
 * alleen een snellere reactie op een echte verandering.
 *
 * Zie `supabase/migrations/20260914d_melding_signalen.sql`.
 */

export type SignaalSoort =
  | 'taak_deadline' | 'planning' | 'uren_week' | 'uren_fiatteren' | 'offertebewaking'
  | 'verkoopkansen'

export type VorigSignaal = {
  sleutel: string
  stand: unknown
  laatstGemeldOp: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** De vorige stand van één soort, voor álle medewerkers in één keer. */
export async function haalVorigeSignalen(
  soort: SignaalSoort,
): Promise<Map<string, VorigSignaal>> {
  const { data, error } = await db()
    .from('melding_signalen')
    .select('medewerker_id, sleutel, stand, laatst_gemeld_op')
    .eq('soort', soort)

  const kaart = new Map<string, VorigSignaal>()
  if (error) return kaart

  for (const r of (data ?? []) as Array<{
    medewerker_id: string; sleutel: string; stand: unknown; laatst_gemeld_op: string
  }>) {
    kaart.set(r.medewerker_id, {
      sleutel: r.sleutel,
      stand: r.stand,
      laatstGemeldOp: r.laatst_gemeld_op,
    })
  }
  return kaart
}

/**
 * Leg vast dat deze toestand gemeld is.
 *
 * Ook aan te roepen wanneer er géén melding uitging maar de toestand wél
 * vastgelegd moet worden — bij de planning is de eerste run per medewerker
 * precies dat: er is niets om mee te vergelijken, dus we onthouden alleen.
 * Zonder die uitzondering zou de eerste run iedereen "je planning is gewijzigd"
 * sturen voor planning die al weken vaststond.
 */
export async function onthoudSignaal(
  medewerkerId: string,
  soort: SignaalSoort,
  sleutel: string,
  stand?: unknown,
): Promise<void> {
  await db()
    .from('melding_signalen')
    .upsert(
      {
        medewerker_id: medewerkerId,
        soort,
        sleutel,
        stand: stand ?? null,
        laatst_gemeld_op: new Date().toISOString(),
      },
      { onConflict: 'medewerker_id,soort' },
    )
    .then(() => {}, () => { /* een melding mag niet klappen op zijn eigen geheugen */ })
}
