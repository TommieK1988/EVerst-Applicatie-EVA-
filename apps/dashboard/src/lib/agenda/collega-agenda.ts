import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getRechtenBundel, kiesKanaal, type CurrentMedewerker } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import type { AgendaEigenaar } from './mijn-agenda'

/**
 * De agenda van een collega op `/m/planning?wie=<medewerker-id>`.
 *
 * Je eigen agenda staat op geen enkel recht. Die van een ander wel: het mobiele
 * recht Planning (lezen). Bewust het mobiele kanaal en niet 'beide' zoals
 * `vereisRecht`: Uitvoering heeft op de desktop Planning op lezen staan, en wie
 * dat recht op mobiel weghaalt moet de collega-agenda daar écht kwijt zijn — ook
 * via de bijlaad-action, die vanaf elk pad aanroepbaar is.
 *
 * Hier, en alleen hier, komt een medewerker-id uit de client. Elke ingang loopt
 * daarom eerst door `magCollegaAgenda`.
 */

export type Collega = AgendaEigenaar & { naam: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function volledigeNaam(r: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }): string {
  return [r.voornaam, r.tussenvoegsel, r.achternaam].filter(Boolean).join(' ') || '—'
}

export async function magCollegaAgenda(medewerker: CurrentMedewerker): Promise<boolean> {
  const bundel = await getRechtenBundel(medewerker)
  return heeftModuleToegang(kiesKanaal(bundel, 'mobiel'), 'planning', 'lezen')
}

/** Eén actieve collega, of null bij een ongeldig of onbekend id. */
export async function haalCollega(id: string): Promise<Collega | null> {
  if (!UUID.test(id)) return null
  const { data } = await createAdminClient()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, afdeling')
    .eq('id', id)
    .eq('actief', true)
    .maybeSingle()
  return data ? { id: data.id, afdeling: data.afdeling, naam: volledigeNaam(data) } : null
}

/** Alle actieve medewerkers voor de kiezer. Ruim onder de 1000: het hele bedrijf is ~50 man. */
export async function haalCollegaLijst(): Promise<Array<{ id: string; naam: string; afdeling: string | null }>> {
  const { data } = await createAdminClient()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, afdeling')
    .eq('actief', true)
    .order('voornaam')
    .order('id')
    .limit(500)
  return (data ?? []).map(r => ({ id: r.id, naam: volledigeNaam(r), afdeling: r.afdeling ?? null }))
}
