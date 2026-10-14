import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { getBouw7Client } from '@/lib/bouw7/sync'
import type { Bouw7EmployeeHourLogResponse } from '@/lib/bouw7/client'
import { getAppVertaler, getAppLocale } from '@/i18n/server'
import { getUrenInstellingen, goedkeurDeadline } from './instellingen'
import { OVERUREN_BRON, rondUren } from './rekenregel'
import { bewerkbaar } from './week-guard'

// Wijzigen ná indienen.
//
// Een ingediende week blijft van de medewerker zolang de goedkeurder er nog niets van heeft
// goedgekeurd, en uiterlijk tot de goedkeurdeadline (standaard maandag 12:00 ná de week). Daarna
// ligt hij vast. Een vergissing die hij zelf ziet hoeft dan niet via de goedkeurder te lopen.
//
// "Iets goedgekeurd" betekent: één regel is genoeg. Een teamleider-akkoord telt ook, al is de
// regel in Bouw7 nog niet geaccordeerd -- de teamleider heeft er dan naar gekeken, en wat hij
// gezien heeft mag niet onder zijn handen veranderen.
//
// In de Bouw7-route staan de uren na indienen al in Bouw7 (approved = false). Elke wijziging gaat
// er dus meteen achteraan (`stuurWijzigingNaarBouw7`), en een verwijderde regel wordt daar eerst
// verwijderd. Vóór elke wijziging kijken we ook live in Bouw7: daar kan iemand rechtstreeks
// geaccordeerd hebben, wat EVA pas bij de volgende sync zou zien -- en ons opnieuw versturen met
// approved = false zou die goedkeuring stilletjes terugdraaien.

const db = () => createAdminClient()

type WeekRij = { id: string; week_start: string; status: string; medewerker_id: string }

export type WijzigVenster = {
  /** Mag de medewerker regels en kosten nog toevoegen, wijzigen en verwijderen? */
  wijzigbaar: boolean
  /** Alleen bij een ingediende week die nog open staat: tot wanneer (ISO). */
  tot: string | null
  /** Waarom niet, als het een ingediende week betreft. */
  reden: 'goedgekeurd' | 'deadline' | null
}

/** Heeft de goedkeurder al iets van deze week goedgekeurd? Alleen wat EVA zelf weet. */
async function heeftGoedkeuringInEva(weekId: string): Promise<{ akkoord: boolean; hourLogIds: number[] }> {
  const supabase = db()
  // Eén week van één medewerker: een handvol regels.
  const { data: regels } = await supabase
    .from('uren_regels')
    .select('bouw7_hour_log_id, bouw7_goedgekeurd')
    .eq('week_id', weekId)
  const rij = (regels ?? []) as Array<{ bouw7_hour_log_id: number | null; bouw7_goedgekeurd: boolean | null }>
  const hourLogIds = rij.map(r => r.bouw7_hour_log_id).filter((id): id is number => id != null)
  if (rij.some(r => r.bouw7_goedgekeurd)) return { akkoord: true, hourLogIds }
  if (!hourLogIds.length) return { akkoord: false, hourLogIds }

  // Bij intrekken worden beide stempels leeggemaakt; een gevulde stempel is dus een geldig akkoord.
  const { data: beoordeeld } = await supabase
    .from('uren_bouw7_beoordeling')
    .select('bouw7_hour_log_id')
    .in('bouw7_hour_log_id', hourLogIds)
    .or('tl_akkoord_op.not.is.null,pl_akkoord_op.not.is.null')
    .limit(1)
  return { akkoord: (beoordeeld ?? []).length > 0, hourLogIds }
}

/**
 * Het wijzigvenster zoals EVA het kent, zonder Bouw7 te bevragen. Voor het scherm: de knoppen
 * tonen of verbergen. De echte controle bij een wijziging is `vereisWijzigbaar`.
 */
export async function wijzigVenster(week: WeekRij, nu = new Date()): Promise<WijzigVenster> {
  if (bewerkbaar(week.status)) return { wijzigbaar: true, tot: null, reden: null }
  if (week.status !== 'ingediend') return { wijzigbaar: false, tot: null, reden: null }

  const deadline = goedkeurDeadline(week.week_start, await getUrenInstellingen())
  if (nu >= deadline) return { wijzigbaar: false, tot: null, reden: 'deadline' }
  if ((await heeftGoedkeuringInEva(week.id)).akkoord) return { wijzigbaar: false, tot: null, reden: 'goedgekeurd' }
  return { wijzigbaar: true, tot: deadline.toISOString(), reden: null }
}

/**
 * De poort voor elke wijziging aan regels of kosten. Levert `null` als het mag, anders de reden
 * als sleutel onder `uren.fout.*`.
 *
 * Bij een ingediende week in de Bouw7-route kijkt hij ook live in Bouw7. Is Bouw7 niet bereikbaar,
 * dan weigert hij: liever even niet wijzigen dan een goedkeuring overschrijven die we niet zagen.
 */
export async function vereisWijzigbaar(
  week: WeekRij & { goedkeuring_modus?: string | null },
): Promise<null | 'weekAlIngediend' | 'wijzigTermijnVerstreken' | 'alGoedgekeurd' | 'goedkeuringNietTeControleren'> {
  if (bewerkbaar(week.status)) return null
  if (week.status !== 'ingediend') return 'weekAlIngediend'

  const deadline = goedkeurDeadline(week.week_start, await getUrenInstellingen())
  if (new Date() >= deadline) return 'wijzigTermijnVerstreken'

  const { akkoord, hourLogIds } = await heeftGoedkeuringInEva(week.id)
  if (akkoord) return 'alGoedgekeurd'
  if (!hourLogIds.length) return null

  try {
    if (await heeftGoedkeuringInBouw7(week, hourLogIds)) return 'alGoedgekeurd'
  } catch (e) {
    console.error('[uren] goedkeuring in Bouw7 niet te controleren:', e)
    return 'goedkeuringNietTeControleren'
  }
  return null
}

async function heeftGoedkeuringInBouw7(week: WeekRij, hourLogIds: number[]): Promise<boolean> {
  const { data: mw } = await db().from('medewerkers').select('bouw7_id').eq('id', week.medewerker_id).maybeSingle()
  if (!mw?.bouw7_id) return false
  const client = await getBouw7Client()
  // Eén medewerker vanaf de maandag van de week: een paar weken uren, ruim onder de limiet.
  const resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `employee.id = ${mw.bouw7_id} AND logDate >= "${week.week_start}" SORT(logDate, ASC) LIMIT 500`,
  })
  const ids = new Set(hourLogIds)
  return (resp?.items ?? []).some(l => l.id != null && ids.has(l.id) && l.isApproved === true)
}

/** De weekvelden die `vereisWijzigbaar` en `tekortNaWijziging` nodig hebben, als join op een regel. */
export const WEEK_JOIN = 'uren_weken(id, medewerker_id, week_start, status, contracturen, goedkeuring_modus)'

/**
 * Een ingediende week moet ingediend blijven kunnen worden: een wijziging die er een tekort van
 * maakt, weigeren we. `regelId` gaat eruit, `nieuweUren` komt ervoor in de plaats (0 = verwijderd).
 * Geeft de melding terug, of null. Bij een concept-week toetst het indienen dat zelf.
 */
export async function tekortNaWijziging(
  week: { id: string; status: string; contracturen: number | string | null },
  regelId: string,
  nieuweUren: number,
): Promise<string | null> {
  if (week.status !== 'ingediend') return null
  const [{ data: regels }, inst] = await Promise.all([
    db().from('uren_regels').select('id, uren, bron').eq('week_id', week.id),
    getUrenInstellingen(),
  ])
  const som = rondUren(((regels ?? []) as Array<{ id: string; uren: number | string; bron: string }>)
    .filter(r => r.bron !== OVERUREN_BRON && r.id !== regelId)
    .reduce((s, r) => s + Number(r.uren), nieuweUren))
  const t = await getAppVertaler('uren')
  if (som <= 0) return t('fout.nogGeenUren')
  const tekort = rondUren(Number(week.contracturen ?? 0) - inst.tolerantie_uren - som)
  return tekort > 0 ? t('fout.tekort', { uren: tekort.toLocaleString(await getAppLocale()) }) : null
}

/**
 * Verwijdert uurregels in Bouw7. Een regel die daar al weg is telt als gelukt; elke andere fout
 * gooit, zodat de aanroeper de regel in EVA laat staan in plaats van een wees in Bouw7 achter te
 * laten die later alsnog wordt goedgekeurd en betaald.
 */
export async function verwijderUitBouw7(hourLogIds: number[]): Promise<void> {
  if (!hourLogIds.length) return
  const client = await getBouw7Client()
  for (const id of hourLogIds) {
    try {
      await client.del('/project/hour-log', { id })
    } catch (e) {
      if (e instanceof Error && /\b404\b|not found/i.test(e.message)) continue
      throw e
    }
  }
}

/**
 * Stuurt een wijziging in een ingediende week door naar Bouw7. Alleen in de Bouw7-route: in de
 * EVA-route gaan de uren pas naar Bouw7 als de keten rond is.
 */
export async function stuurWijzigingNaarBouw7(weekId: string): Promise<void> {
  const { data: week } = await db().from('uren_weken').select('status, goedkeuring_modus').eq('id', weekId).maybeSingle()
  if (week?.status !== 'ingediend' || week.goedkeuring_modus !== 'bouw7') return
  try {
    const { stuurUrenWeekNaarBouw7 } = await import('./bouw7')
    await stuurUrenWeekNaarBouw7(weekId)
  } catch (e) {
    console.error('[uren] wijziging na indienen niet naar Bouw7 gestuurd:', e)
  }
  // Het goedkeurscherm leest uit het bewaarde urenvenster; op de achtergrond verversen.
  try {
    const { after } = await import('next/server')
    after(async () => {
      const { ververseGlobaleBron } = await import('@/lib/bouw7/snapshot')
      await ververseGlobaleBron('uren_venster').catch(() => {})
    })
  } catch { /* buiten een request-context bestaat `after` niet */ }
}
