import { createAdminClient } from '@everts/database/server'
import type { MedewerkerAfwezigheidType } from '@everts/database/platform-types'

/**
 * Het verlof van één medewerker zoals de Medewerkerplanning het kent, voor de Verlof-pagina in
 * EVA Mobiel.
 *
 * WAAROM. Mobiel toonde alleen aanvragen die via de app waren gedaan. Verlof dat kantoor of de
 * medewerker zelf in Bouw7 had gezet (verreweg het meeste: de sync haalt het binnen als
 * bron='bouw7') stond wel in de planning, maar niet op de telefoon — "ik heb toch vrij volgende
 * week, waarom zie ik het niet?".
 *
 * Rijen die uit een goedgekeurde app-aanvraag komen slaan we over: die staan al als aanvraag in
 * de lijst, met status en beoordelaar erbij. Zelfde venster als de planning (vanaf 1 januari van
 * vorig jaar); per medewerker zijn dat er tientallen, ruim onder de 1000-rijengrens.
 */
export type IngeplandVerlof = {
  id: string
  type: MedewerkerAfwezigheidType
  startDatum: string
  eindDatum: string
  /** Alleen gevuld bij een deel van de dag; 'HH:MM'. */
  startTijd: string | null
  eindTijd: string | null
  opmerking: string | null
}

type Rij = {
  id: string; type: MedewerkerAfwezigheidType; start_datum: string; eind_datum: string
  start_tijd: string | null; eind_tijd: string | null; opmerking: string | null
}

export async function getIngeplandVerlof(medewerkerId: string): Promise<IngeplandVerlof[]> {
  const supabase = createAdminClient()
  const vanaf = `${new Date().getFullYear() - 1}-01-01`
  const [{ data: rijen }, { data: gekoppeld }] = await Promise.all([
    supabase.from('medewerker_afwezigheid')
      .select('id, type, start_datum, eind_datum, start_tijd, eind_tijd, opmerking')
      .eq('medewerker_id', medewerkerId)
      .gte('eind_datum', vanaf)
      .order('start_datum', { ascending: false }),
    supabase.from('verlof_aanvragen')
      .select('afwezigheid_id')
      .eq('medewerker_id', medewerkerId)
      .not('afwezigheid_id', 'is', null),
  ])
  const uitAanvraag = new Set(((gekoppeld ?? []) as Array<{ afwezigheid_id: string }>).map(r => r.afwezigheid_id))

  return ((rijen ?? []) as Rij[])
    .filter(r => !uitAanvraag.has(r.id))
    .map(r => ({
      id: r.id,
      type: r.type,
      startDatum: r.start_datum,
      eindDatum: r.eind_datum,
      // Postgres geeft een `time` terug als '13:00:00'; de UI wil 'HH:MM'.
      startTijd: r.start_tijd ? String(r.start_tijd).slice(0, 5) : null,
      eindTijd: r.eind_tijd ? String(r.eind_tijd).slice(0, 5) : null,
      opmerking: r.opmerking,
    }))
}
