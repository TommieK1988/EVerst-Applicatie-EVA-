// Hoeveel tijd voor tijd iemand nog kan opnemen.
//
// Het saldo (view uren_saldo_per_medewerker) telt alleen goedgekeurde weken plus correcties. Dat
// is bewust de basis: overuren in een week die nog niet is goedgekeurd kunnen nog wegvallen.
// Daar gaat af wat al onderweg is en nog niet in dat saldo zit:
//
//   - tijd voor tijd die de medewerker zelf in een nog niet goedgekeurde week boekte (bron 'eva');
//   - tijd-voor-tijdverlof dat is aangevraagd of goedgekeurd, zolang de week waarin het eindigt
//     nog niet is goedgekeurd.
//
// Voorgevulde verlofregels (bron 'bouw7_verlof') tellen niet apart: dat zijn de uren van een
// aanvraag die hierboven al meetelt. Zo gaat niets dubbel van het saldo af.

import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { rondUren } from './rekenregel'
import { weekStartVan } from './rooster'

const db = () => createAdminClient()

export type TvtSaldo = {
  /** Uit goedgekeurde weken en correcties. */
  saldo: number
  /** Al geboekt of aangevraagd, maar nog niet verwerkt. */
  onderweg: number
  beschikbaar: number
}

export async function getTvtUursoortIds(): Promise<string[]> {
  const { data } = await db()
    .from('planning_uursoorten').select('id').eq('uren_categorie', 'tijd_voor_tijd')
  return ((data ?? []) as Array<{ id: string }>).map(s => s.id)
}

export async function berekenTvtSaldo(
  medewerkerId: string,
  /** Een regel die net gewijzigd wordt telt niet mee; zijn nieuwe uren worden er los tegen gezet. */
  opts: { negeerRegelId?: string } = {},
): Promise<TvtSaldo> {
  const supabase = db()
  const tvtIds = await getTvtUursoortIds()

  const [{ data: saldoRij }, { data: regels }, { data: aanvragen }] = await Promise.all([
    supabase.from('uren_saldo_per_medewerker').select('saldo_uren').eq('medewerker_id', medewerkerId).maybeSingle(),
    // Begrensd door medewerker + soort + open week: hooguit enkele tientallen.
    tvtIds.length
      ? supabase
          .from('uren_regels')
          .select('id, uren, uren_weken!inner(status)')
          .eq('medewerker_id', medewerkerId)
          .eq('bron', 'eva')
          .gt('uren', 0)
          .in('uursoort_id', tvtIds)
          .neq('uren_weken.status', 'goedgekeurd')
          .order('id')
          .limit(1000)
      : Promise.resolve({ data: [] }),
    tvtIds.length
      ? supabase
          .from('verlof_aanvragen')
          .select('eind_datum, uren_totaal')
          .eq('medewerker_id', medewerkerId)
          .in('status', ['aangevraagd', 'goedgekeurd'])
          .in('uursoort_id', tvtIds)
          .order('eind_datum')
          .limit(1000)
      : Promise.resolve({ data: [] }),
  ])

  const geboekt = ((regels ?? []) as Array<{ id: string; uren: number | string }>)
    .filter(r => r.id !== opts.negeerRegelId)
    .reduce((s, r) => s + Number(r.uren), 0)

  // Een aanvraag is verwerkt zodra de week waarin hij eindigt is goedgekeurd: dan zitten zijn
  // uren in het saldo.
  const lijst = (aanvragen ?? []) as Array<{ eind_datum: string; uren_totaal: number | string }>
  const weekStarts = [...new Set(lijst.map(a => weekStartVan(a.eind_datum)))]
  const { data: klaar } = weekStarts.length
    ? await supabase
        .from('uren_weken')
        .select('week_start')
        .eq('medewerker_id', medewerkerId)
        .eq('status', 'goedgekeurd')
        .in('week_start', weekStarts)
    : { data: [] }
  const goedgekeurd = new Set(((klaar ?? []) as Array<{ week_start: string }>).map(w => w.week_start))
  const aangevraagd = lijst
    .filter(a => !goedgekeurd.has(weekStartVan(a.eind_datum)))
    .reduce((s, a) => s + Number(a.uren_totaal), 0)

  const saldo = rondUren(Number(saldoRij?.saldo_uren ?? 0))
  const onderweg = rondUren(geboekt + aangevraagd)
  return { saldo, onderweg, beschikbaar: rondUren(saldo - onderweg) }
}
