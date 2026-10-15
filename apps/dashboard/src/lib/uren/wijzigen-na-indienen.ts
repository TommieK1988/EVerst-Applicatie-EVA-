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
// Een ingediende week blijft van de medewerker tot de goedkeurdeadline (standaard maandag 15:00
// ná de week). Daarna ligt hij vast. Een vergissing die hij zelf ziet -- of een te vroege tik op
// Indienen -- hoeft dan niet via de goedkeurder te lopen.
//
// HET SLOT ZIT OP DE REGEL, NIET OP DE WEEK. Goedkeuren gebeurt per uurregel (een Bouw7 hour-log
// met zijn eigen teamleider- en projectleiderstempel), dus vergrendelen doen we ook per regel:
// een goedgekeurde regel ligt vast, de rest van de week blijft aan te passen. Vroeger ging bij
// het eerste akkoord de hele week op slot, en zat een extern die maandag nog een fout zag vast
// aan regels waar nog niemand naar gekeken had.
//
// "Goedgekeurd" betekent: geaccordeerd in Bouw7 óf een teamleider- of projectleiderakkoord in
// EVA. Een teamleider-akkoord telt ook, al is de regel in Bouw7 nog niet geaccordeerd -- de
// teamleider heeft er dan naar gekeken, en wat hij gezien heeft mag niet onder zijn handen
// veranderen.
//
// Twee dingen hebben geen eigen goedkeuring en lenen die daarom van iets anders:
// - Kostenposten hangen aan een dag. Is er van die dag een uurregel goedgekeurd, dan heeft de
//   goedkeurder die dag (met zijn kosten) bekeken en ligt de kostenpost ook vast.
// - De automatische overurenregel verschuift mee met de andere regels. Zou een wijziging een al
//   goedgekeurde overurenregel laten verdwijnen, dan weigeren we de wijziging (zie
//   `overurenDieVervallen` in ./overuren).
//
// In de Bouw7-route staan de uren na indienen al in Bouw7 (approved = false). Elke wijziging gaat
// er dus meteen achteraan (`stuurWijzigingNaarBouw7`; die stuurt alleen regels die nog niet
// verzonden zijn, een goedgekeurde regel blijft dus onaangeroerd), en een verwijderde regel wordt
// daar eerst verwijderd. Vóór elke wijziging kijken we ook live in Bouw7: daar kan iemand
// rechtstreeks geaccordeerd hebben, wat EVA pas bij de volgende sync zou zien -- en ons opnieuw
// versturen met approved = false zou die goedkeuring stilletjes terugdraaien.

const db = () => createAdminClient()

type WeekRij = { id: string; week_start: string; status: string; medewerker_id: string }

export type WijzigVenster = {
  /** Mag de medewerker nog regels en kosten toevoegen? Per regel kan er nog een slot op zitten. */
  wijzigbaar: boolean
  /** Alleen bij een ingediende week die nog open staat: tot wanneer (ISO). */
  tot: string | null
}

/** Wat een wijziging raakt; bepaalt welke goedkeuringen ertoe doen. */
export type WijzigDoel = {
  /** De regel die gewijzigd of verwijderd wordt. */
  regelId?: string
  /** Automatische overurenregels die door de wijziging zouden verdwijnen. */
  overurenIds?: string[]
  /** De dag van een kostenpost die erbij komt of verdwijnt. */
  datum?: string
}

export type Weigering =
  | 'weekAlIngediend' | 'wijzigTermijnVerstreken' | 'regelAlGoedgekeurd' | 'overurenAlGoedgekeurd'
  | 'dagAlGoedgekeurd' | 'goedkeuringNietTeControleren'

type RegelRij = { id: string; datum: string; bouw7_hour_log_id: number | null; bouw7_goedgekeurd: boolean | null }

async function regelsVanWeek(weekId: string): Promise<RegelRij[]> {
  // Eén week van één medewerker: een handvol regels.
  const { data } = await db()
    .from('uren_regels')
    .select('id, datum, bouw7_hour_log_id, bouw7_goedgekeurd')
    .eq('week_id', weekId)
  return (data ?? []) as RegelRij[]
}

/** Welke van deze regels zijn goedgekeurd, voor zover EVA dat weet. */
async function goedgekeurdInEva(regels: RegelRij[]): Promise<Set<string>> {
  const akkoord = new Set(regels.filter(r => r.bouw7_goedgekeurd).map(r => r.id))
  const open = regels.filter(r => !r.bouw7_goedgekeurd && r.bouw7_hour_log_id != null)
  if (!open.length) return akkoord

  // Bij intrekken worden beide stempels leeggemaakt; een gevulde stempel is dus een geldig akkoord.
  // Begrensd door de id-lijst: de regels van één week.
  const { data: beoordeeld } = await db()
    .from('uren_bouw7_beoordeling')
    .select('bouw7_hour_log_id')
    .in('bouw7_hour_log_id', open.map(r => r.bouw7_hour_log_id as number))
    .or('tl_akkoord_op.not.is.null,pl_akkoord_op.not.is.null')
  const ids = new Set((beoordeeld ?? []).map(b => b.bouw7_hour_log_id))
  for (const r of open) if (r.bouw7_hour_log_id != null && ids.has(r.bouw7_hour_log_id)) akkoord.add(r.id)
  return akkoord
}

/** De goedgekeurde regels van een week, voor het scherm: daar komt een slotje in plaats van de knoppen. */
export async function goedgekeurdeRegelIds(weekId: string): Promise<Set<string>> {
  return goedgekeurdInEva(await regelsVanWeek(weekId))
}

/**
 * Het wijzigvenster zoals EVA het kent, zonder Bouw7 te bevragen. Voor het scherm: de knoppen
 * tonen of verbergen. De echte controle bij een wijziging is `vereisWijzigbaar`.
 */
export async function wijzigVenster(week: WeekRij, nu = new Date()): Promise<WijzigVenster> {
  if (bewerkbaar(week.status)) return { wijzigbaar: true, tot: null }
  if (week.status !== 'ingediend') return { wijzigbaar: false, tot: null }

  const deadline = goedkeurDeadline(week.week_start, await getUrenInstellingen())
  if (nu >= deadline) return { wijzigbaar: false, tot: null }
  return { wijzigbaar: true, tot: deadline.toISOString() }
}

/**
 * De poort voor elke wijziging aan regels of kosten. Levert `null` als het mag, anders de reden
 * als sleutel onder `uren.fout.*`.
 *
 * Alleen de goedkeuring van wat `doel` raakt telt: de regel zelf, de overurenregels die zouden
 * verdwijnen, en bij een kostenpost de uurregels van die dag. Een nieuwe uurregel zonder
 * gevolgen voor de overuren raakt niets wat al goedgekeurd is en mag tot de deadline.
 *
 * Bij een ingediende week kijkt hij voor die regels ook live in Bouw7. Is Bouw7 niet bereikbaar,
 * dan weigert hij: liever even niet wijzigen dan een goedkeuring overschrijven die we niet zagen.
 */
export async function vereisWijzigbaar(
  week: WeekRij & { goedkeuring_modus?: string | null },
  doel: WijzigDoel = {},
): Promise<Weigering | null> {
  if (bewerkbaar(week.status)) return null
  if (week.status !== 'ingediend') return 'weekAlIngediend'

  const deadline = goedkeurDeadline(week.week_start, await getUrenInstellingen())
  if (new Date() >= deadline) return 'wijzigTermijnVerstreken'

  const regels = (await regelsVanWeek(week.id)).filter(r =>
    r.id === doel.regelId || doel.overurenIds?.includes(r.id) || (doel.datum != null && r.datum === doel.datum))
  if (!regels.length) return null

  const reden = (akkoord: Set<string>): Weigering | null => {
    if (doel.regelId && akkoord.has(doel.regelId)) return 'regelAlGoedgekeurd'
    if (doel.overurenIds?.some(id => akkoord.has(id))) return 'overurenAlGoedgekeurd'
    if (doel.datum != null && regels.some(r => r.datum === doel.datum && akkoord.has(r.id))) return 'dagAlGoedgekeurd'
    return null
  }

  const akkoord = await goedgekeurdInEva(regels)
  const volgensEva = reden(akkoord)
  if (volgensEva) return volgensEva

  const teControleren = regels.filter(r => !akkoord.has(r.id) && r.bouw7_hour_log_id != null)
  if (!teControleren.length) return null
  try {
    const live = await goedgekeurdInBouw7(week, teControleren.map(r => r.bouw7_hour_log_id as number))
    for (const r of teControleren) if (live.has(r.bouw7_hour_log_id as number)) akkoord.add(r.id)
  } catch (e) {
    console.error('[uren] goedkeuring in Bouw7 niet te controleren:', e)
    return 'goedkeuringNietTeControleren'
  }
  return reden(akkoord)
}

/** Welke van deze hour-logs zijn in Bouw7 geaccordeerd. */
async function goedgekeurdInBouw7(week: WeekRij, hourLogIds: number[]): Promise<Set<number>> {
  const { data: mw } = await db().from('medewerkers').select('bouw7_id').eq('id', week.medewerker_id).maybeSingle()
  if (!mw?.bouw7_id) return new Set()
  const client = await getBouw7Client()
  // Eén medewerker vanaf de maandag van de week: een paar weken uren, ruim onder de limiet.
  const resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
    q: `employee.id = ${mw.bouw7_id} AND logDate >= "${week.week_start}" SORT(logDate, ASC) LIMIT 500`,
  })
  const ids = new Set(hourLogIds)
  return new Set((resp?.items ?? [])
    .filter(l => l.id != null && ids.has(l.id) && l.isApproved === true)
    .map(l => l.id as number))
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
