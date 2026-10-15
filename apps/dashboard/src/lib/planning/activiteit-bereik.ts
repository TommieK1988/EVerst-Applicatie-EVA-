// Een activiteit omspant altijd haar planitems.
//
// De balk van een activiteit tekent `gewenste_start` t/m `deadline`; de fasebalk is het bereik
// van haar activiteiten. Die datums worden niet uit de planitems afgeleid, dus een planitem
// dat verplaatst, gekopieerd of vanuit de Medewerkerplanning ingepland werd, kon buiten beide
// balken komen te staan. Komt een planitem buiten zijn activiteit, dan groeit de activiteit
// mee — en daarmee de fase. Andersom (inkorten) gebeurt hier nooit: een activiteit inkorten is
// een bewuste keuze van de planner, en die snoeit zelf de planitems bij.

import { nlDelen } from './nl-tijd'

type Bereik = { gewenste_start: string | null; deadline: string | null }
type Blok = { start_dt: string; eind_dt: string }

/** De NL-kalenderdagen die een planitem raakt. Een eind om middernacht hoort bij de dag ervóór. */
export function dagenVanBlok(blok: Blok): { van: string; tot: string } {
  const van = nlDelen(blok.start_dt).datum
  const laatsteMoment = new Date(new Date(blok.eind_dt).getTime() - 1).toISOString()
  const tot = nlDelen(laatsteMoment).datum
  return { van, tot: tot < van ? van : tot }
}

/**
 * Wat er aan de activiteit moet veranderen om deze blokken te omspannen, of `null` als ze er
 * al binnen vallen. Een ontbrekende start of deadline wordt ingevuld.
 */
export function verbredingVoorBlokken(activiteit: Bereik, blokken: Blok[]): Partial<Bereik> | null {
  let start = activiteit.gewenste_start
  let deadline = activiteit.deadline
  for (const blok of blokken) {
    const { van, tot } = dagenVanBlok(blok)
    if (!start || van < start) start = van
    if (!deadline || tot > deadline) deadline = tot
  }
  const patch: Partial<Bereik> = {}
  if (start !== activiteit.gewenste_start) patch.gewenste_start = start
  if (deadline !== activiteit.deadline) patch.deadline = deadline
  return Object.keys(patch).length > 0 ? patch : null
}

/**
 * Verbreedt de activiteiten van deze planitems zodat ze hun planitems omspannen. Fail-soft:
 * het planitem staat er al, en een mislukte verbreding mag de planner niet tegenhouden — dan
 * staat het item hooguit buiten de balk tot de volgende wijziging.
 */
export async function verbreedActiviteitenTotItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  itemIds: string[],
): Promise<void> {
  if (itemIds.length === 0) return
  // Begrensd door de meegegeven ids (één tot twee planitems per aanroep).
  const { data, error } = await supabase
    .from('planning_items')
    .select('start_dt, eind_dt, planning_activiteiten!activiteit_id ( id, gewenste_start, deadline )')
    .in('id', itemIds)
  if (error) { console.error('[planning] activiteit verbreden mislukt:', error.message); return }

  const perActiviteit = new Map<string, { activiteit: Bereik; blokken: Blok[] }>()
  for (const r of (data ?? []) as (Blok & { planning_activiteiten: (Bereik & { id: string }) | null })[]) {
    const act = r.planning_activiteiten
    if (!act) continue
    const groep = perActiviteit.get(act.id) ?? { activiteit: act, blokken: [] }
    groep.blokken.push({ start_dt: r.start_dt, eind_dt: r.eind_dt })
    perActiviteit.set(act.id, groep)
  }

  for (const [id, { activiteit, blokken }] of perActiviteit) {
    const patch = verbredingVoorBlokken(activiteit, blokken)
    if (!patch) continue
    const { error: updErr } = await supabase.from('planning_activiteiten').update(patch).eq('id', id)
    if (updErr) console.error('[planning] activiteit verbreden mislukt:', updErr.message)
  }
}
