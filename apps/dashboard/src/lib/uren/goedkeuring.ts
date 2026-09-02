'use server'

// Goedkeuring van weekstaten — twee routes naast elkaar.
//
// Accorderen gebeurt vandaag in Bouw7 (de vlag `isApproved` op een uurregel). Dat blijft werken
// zolang de overstap loopt; de modus bepaalt welke route een week volgt:
//
//   'bouw7' — indienen stuurt de uren meteen naar Bouw7 met approved = false, accorderen gebeurt
//             daar, en EVA leest `isApproved` terug. De EVA-schermen kijken mee maar beslissen niet.
//   'eva'   — indienen -> teamleider accordeert de week -> elke projectleider accordeert de regels
//             op zijn eigen dossiers -> pas dan gaan de uren naar Bouw7, met approved = true.
//
// De modus wordt bij indienen op de week bevroren. Zet iemand de instelling halverwege om, dan
// blijft een lopende week op zijn eigen route — anders zou een week die op de teamleider wacht
// ineens op een Bouw7-vlag gaan wachten die nooit komt.

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { getUrenInstellingen } from './instellingen'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type GoedkeuringModus = 'eva' | 'bouw7'

/**
 * Welke route geldt voor deze medewerker: de ploeg mag de bedrijfsinstelling overschrijven,
 * zodat je met één ploeg kunt proefdraaien.
 */
export async function bepaalModus(medewerkerId: string): Promise<GoedkeuringModus> {
  const supabase = db()
  const [{ data: mw }, inst] = await Promise.all([
    supabase
      .from('medewerkers')
      .select('ploeg_id, ploegen!medewerkers_ploeg_id_fkey(goedkeuring_modus)')
      .eq('id', medewerkerId)
      .maybeSingle(),
    getUrenInstellingen(),
  ])
  const perPloeg = mw?.ploegen?.goedkeuring_modus as GoedkeuringModus | null | undefined
  return perPloeg ?? (inst.goedkeuring_modus as GoedkeuringModus)
}

/**
 * Wie de week van deze medewerker beoordeelt in de EVA-route.
 *
 * De teamleider van de ploeg is de normale route. 32 van de 52 actieve medewerkers zitten in geen
 * ploeg, dus zonder terugval zou hun week nergens heen kunnen; daarom de instelbare
 * terugvalgoedkeurder, en als laatste redmiddel iemand van Directie. Levert null op als er
 * werkelijk niemand is — dat moet als blokkade zichtbaar worden, niet stilzwijgend doorlopen.
 */
export async function bepaalTeamleider(medewerkerId: string): Promise<string | null> {
  const supabase = db()
  const { data: mw } = await supabase
    .from('medewerkers')
    .select('ploeg_id, ploegen!medewerkers_ploeg_id_fkey(teamleider_id)')
    .eq('id', medewerkerId)
    .maybeSingle()

  const teamleider = mw?.ploegen?.teamleider_id as string | null | undefined
  // Je eigen week goedkeuren gaat niet: een teamleider die zelf in zijn ploeg zit valt terug.
  if (teamleider && teamleider !== medewerkerId) return teamleider

  const inst = await getUrenInstellingen()
  if (inst.terugval_goedkeurder_id && inst.terugval_goedkeurder_id !== medewerkerId) {
    return inst.terugval_goedkeurder_id
  }

  const { data: directie } = await supabase
    .from('medewerkers')
    .select('id')
    .eq('actief', true)
    .eq('afdeling', 'Directie')
    .neq('id', medewerkerId)
    .limit(1)
    .maybeSingle()
  return directie?.id ?? null
}

/* ── Overzichten voor de goedkeurder ──────────────────────────────── */

export type TeWeek = {
  weekId: string
  medewerkerNaam: string
  jaar: number
  weekNr: number
  weekStart: string
  status: string
  modus: GoedkeuringModus
  contracturen: number
  totaalUren: number
  regels: number
  openProjectleiders: number
}

/** De weken die op mij als teamleider wachten. */
export async function getTeamWeken(): Promise<TeWeek[]> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data } = await supabase
    .from('uren_weken')
    .select('id, jaar, week_nr, week_start, status, contracturen, goedkeuring_modus, medewerkers!uren_weken_medewerker_id_fkey(voornaam, tussenvoegsel, achternaam)')
    .eq('tl_goedkeurder_id', medewerker.id)
    .in('status', ['ingediend', 'teamleider_akkoord'])
    .order('week_start', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const weken = (data ?? []) as any[]
  if (!weken.length) return []

  const ids = weken.map(w => w.id)
  const { data: regels } = await supabase
    .from('uren_regels')
    .select('week_id, uren, pl_status')
    .in('week_id', ids)

  const perWeek = new Map<string, { uren: number; aantal: number; open: number }>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of ((regels ?? []) as any[])) {
    const v = perWeek.get(r.week_id) ?? { uren: 0, aantal: 0, open: 0 }
    v.uren += Number(r.uren)
    v.aantal += 1
    if (r.pl_status === 'open') v.open += 1
    perWeek.set(r.week_id, v)
  }

  return weken.map(w => {
    const t = perWeek.get(w.id) ?? { uren: 0, aantal: 0, open: 0 }
    const m = w.medewerkers
    return {
      weekId: w.id,
      medewerkerNaam: [m?.voornaam, m?.tussenvoegsel, m?.achternaam].filter(Boolean).join(' '),
      jaar: w.jaar,
      weekNr: w.week_nr,
      weekStart: w.week_start,
      status: w.status,
      modus: (w.goedkeuring_modus ?? 'bouw7') as GoedkeuringModus,
      contracturen: Number(w.contracturen),
      totaalUren: Math.round(t.uren * 100) / 100,
      regels: t.aantal,
      openProjectleiders: t.open,
    }
  })
}

export type TeRegel = {
  id: string
  datum: string
  uren: number
  uursoortNaam: string
  bewakingscode: string | null
  opmerking: string | null
  medewerkerNaam: string
  dossierId: string
  dossierLabel: string
  afgewekenVanBron: boolean
}

/** De urenregels op mijn eigen dossiers die op mijn akkoord wachten. */
export async function getProjectRegels(): Promise<TeRegel[]> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: mijn } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel')
    .eq('project_manager_id', medewerker.id)
  const dossiers = (mijn ?? []) as Array<{ id: string; dossiernummer: string; titel: string }>
  if (!dossiers.length) return []

  const label = new Map(dossiers.map(d => [d.id, `${d.dossiernummer} · ${d.titel}`]))

  const { data } = await supabase
    .from('uren_regels')
    .select('id, datum, uren, bewakingscode, opmerking, dossier_id, afgeweken_van_bron, planning_uursoorten(naam), medewerkers!uren_regels_medewerker_id_fkey(voornaam, tussenvoegsel, achternaam)')
    .eq('pl_status', 'open')
    .in('dossier_id', [...label.keys()])
    .order('datum')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    datum: r.datum,
    uren: Number(r.uren),
    uursoortNaam: r.planning_uursoorten?.naam ?? '—',
    bewakingscode: r.bewakingscode,
    opmerking: r.opmerking,
    medewerkerNaam: [r.medewerkers?.voornaam, r.medewerkers?.tussenvoegsel, r.medewerkers?.achternaam]
      .filter(Boolean).join(' '),
    dossierId: r.dossier_id,
    dossierLabel: label.get(r.dossier_id) ?? '—',
    afgewekenVanBron: r.afgeweken_van_bron,
  }))
}

/** De regels van één week, om als goedkeurder na te lopen. */
export async function getWeekRegels(weekId: string): Promise<TeRegel[]> {
  const medewerker = await vereisSessie()
  const supabase = db()
  const { data: week } = await supabase
    .from('uren_weken').select('id, tl_goedkeurder_id').eq('id', weekId).maybeSingle()
  if (!week) return []
  if (week.tl_goedkeurder_id !== medewerker.id) {
    throw new Error('Je bent niet de goedkeurder van deze week.')
  }

  const { data } = await supabase
    .from('uren_regels')
    .select('id, datum, uren, bewakingscode, opmerking, dossier_id, afgeweken_van_bron, planning_uursoorten(naam), dossiers(dossiernummer, titel), medewerkers!uren_regels_medewerker_id_fkey(voornaam, tussenvoegsel, achternaam)')
    .eq('week_id', weekId)
    .order('datum')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    datum: r.datum,
    uren: Number(r.uren),
    uursoortNaam: r.planning_uursoorten?.naam ?? '—',
    bewakingscode: r.bewakingscode,
    opmerking: r.opmerking,
    medewerkerNaam: [r.medewerkers?.voornaam, r.medewerkers?.tussenvoegsel, r.medewerkers?.achternaam]
      .filter(Boolean).join(' '),
    dossierId: r.dossier_id,
    dossierLabel: r.dossiers ? `${r.dossiers.dossiernummer} · ${r.dossiers.titel}` : '—',
    afgewekenVanBron: r.afgeweken_van_bron,
  }))
}

/* ── Beoordelen ───────────────────────────────────────────────────── */

/** Melding naar de medewerker; mag de goedkeuring nooit laten klappen. */
async function meldAanMedewerker(medewerkerId: string, titel: string, body: string) {
  try {
    const supabase = db()
    const { data } = await supabase
      .from('medewerkers').select('auth_user_id').eq('id', medewerkerId).maybeSingle()
    if (!data?.auth_user_id) return
    await maakNotificatie({
      user_id: data.auth_user_id,
      type: 'uren',
      titel,
      body,
      url: '/m/uren',
    })
  } catch {
    /* melding is bijzaak */
  }
}

/**
 * De teamleider accordeert de hele week. Daarna gaan de regels mét dossier naar de betrokken
 * projectleiders; zijn die er niet, dan is de week meteen rond.
 */
export async function keurWeekGoed(
  weekId: string,
): Promise<{ ok: true; volledig: boolean } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()

  const { data: week } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, status, tl_goedkeurder_id, week_nr, goedkeuring_modus')
    .eq('id', weekId)
    .maybeSingle()
  if (!week) return { ok: false, error: 'Week niet gevonden.' }
  if (week.tl_goedkeurder_id !== medewerker.id) {
    return { ok: false, error: 'Je bent niet de goedkeurder van deze week.' }
  }
  if (week.status !== 'ingediend') {
    return { ok: false, error: 'Deze week staat niet meer op jouw akkoord te wachten.' }
  }
  if (week.goedkeuring_modus !== 'eva') {
    return { ok: false, error: 'Deze week wordt in Bouw7 geaccordeerd, niet hier.' }
  }

  const nu = new Date().toISOString()
  await supabase.from('uren_weken').update({
    status: 'teamleider_akkoord',
    tl_beoordeeld_op: nu,
    tl_beoordeeld_door: medewerker.id,
  }).eq('id', weekId)

  // Regels op een dossier mét projectleider gaan naar hem toe. De rest (verlof, ziek, en werk op
  // dossiers zonder projectleider) heeft geen tweede beoordelaar en blijft 'nvt'.
  const { data: regels } = await supabase
    .from('uren_regels')
    .select('id, dossier_id, dossiers(project_manager_id)')
    .eq('week_id', weekId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const teBeoordelen = ((regels ?? []) as any[]).filter(r => r.dossiers?.project_manager_id)
  if (teBeoordelen.length) {
    await supabase.from('uren_regels')
      .update({ pl_status: 'open' })
      .in('id', teBeoordelen.map(r => r.id))
  }

  const volledig = teBeoordelen.length === 0
  if (volledig) await rondWeekAf(weekId)

  await meldAanMedewerker(
    week.medewerker_id,
    `Week ${week.week_nr} geaccordeerd`,
    volledig
      ? 'Je teamleider heeft je uren goedgekeurd. De week is rond.'
      : 'Je teamleider heeft je uren goedgekeurd. De projectleiders kijken er nog naar.',
  )

  revalidatePath('/uren/goedkeuren')
  return { ok: true, volledig }
}

/** De projectleider accordeert de regels op zijn eigen dossiers. */
export async function keurRegelsGoed(
  regelIds: string[],
): Promise<{ ok: true; afgeronde: number } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()
  if (!regelIds.length) return { ok: false, error: 'Geen regels geselecteerd.' }

  // Alleen regels op dossiers waar ik projectleider van ben. Zonder deze controle zou een geraden
  // regel-id de uren van een ander project accorderen.
  const { data: regels } = await supabase
    .from('uren_regels')
    .select('id, week_id, pl_status, dossiers(project_manager_id)')
    .in('id', regelIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const eigen = ((regels ?? []) as any[]).filter(
    r => r.dossiers?.project_manager_id === medewerker.id && r.pl_status === 'open',
  )
  if (!eigen.length) return { ok: false, error: 'Geen van deze regels staat op jouw akkoord te wachten.' }

  await supabase.from('uren_regels').update({
    pl_status: 'akkoord',
    pl_beoordeeld_op: new Date().toISOString(),
    pl_beoordeeld_door: medewerker.id,
  }).in('id', eigen.map(r => r.id))

  // Weken waarvan dit de laatste openstaande regels waren zijn nu rond.
  let afgeronde = 0
  for (const weekId of new Set(eigen.map(r => r.week_id))) {
    const { count } = await supabase
      .from('uren_regels')
      .select('id', { count: 'exact', head: true })
      .eq('week_id', weekId)
      .eq('pl_status', 'open')
    if ((count ?? 0) === 0) {
      await rondWeekAf(weekId as string)
      afgeronde++
    }
  }

  revalidatePath('/uren/goedkeuren')
  return { ok: true, afgeronde }
}

/**
 * Afkeuren zet de week terug bij de medewerker. Kan door de teamleider (hele week) of door een
 * projectleider (dan gaat de hele week terug — hij kan zijn regels niet los repareren).
 */
export async function keurAf(
  weekId: string, reden: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const medewerker = await vereisSessie()
  const supabase = db()
  if (!reden.trim()) return { ok: false, error: 'Geef aan waarom je de week afkeurt.' }

  const { data: week } = await supabase
    .from('uren_weken')
    .select('id, medewerker_id, status, tl_goedkeurder_id, week_nr')
    .eq('id', weekId)
    .maybeSingle()
  if (!week) return { ok: false, error: 'Week niet gevonden.' }
  if (['goedgekeurd', 'concept', 'afgekeurd'].includes(week.status)) {
    return { ok: false, error: 'Deze week is niet meer af te keuren.' }
  }

  const isTeamleider = week.tl_goedkeurder_id === medewerker.id
  let isProjectleider = false
  if (!isTeamleider) {
    const { count } = await supabase
      .from('uren_regels')
      .select('id, dossiers!inner(project_manager_id)', { count: 'exact', head: true })
      .eq('week_id', weekId)
      .eq('dossiers.project_manager_id', medewerker.id)
    isProjectleider = (count ?? 0) > 0
  }
  if (!isTeamleider && !isProjectleider) {
    return { ok: false, error: 'Je mag deze week niet beoordelen.' }
  }

  await supabase.from('uren_weken').update({
    status: 'afgekeurd',
    afkeur_reden: reden.trim(),
    tl_beoordeeld_op: new Date().toISOString(),
    tl_beoordeeld_door: medewerker.id,
  }).eq('id', weekId)

  // De tweede ronde begint schoon: alles wat openstond gaat terug naar 'nvt'.
  await supabase.from('uren_regels')
    .update({ pl_status: 'nvt' })
    .eq('week_id', weekId)
    .in('pl_status', ['open', 'akkoord', 'bezwaar'])

  await meldAanMedewerker(
    week.medewerker_id,
    `Week ${week.week_nr} afgekeurd`,
    `${reden.trim()} — pas je week aan en dien hem opnieuw in.`,
  )

  revalidatePath('/uren/goedkeuren')
  revalidatePath('/m/uren')
  return { ok: true }
}

/**
 * Zet de week op goedgekeurd en stuurt de uren naar Bouw7, met de goedkeurvlag er meteen op --
 * in deze route is er immers al twee keer naar gekeken.
 *
 * Het versturen mag de goedkeuring niet ophouden: gaat er iets mis met Bouw7, dan blijft de week
 * goedgekeurd en staan de mislukte regels klaar om opnieuw verstuurd te worden. Anders zou een
 * hapering bij Bouw7 het werk van de teamleider ongedaan maken.
 */
async function rondWeekAf(weekId: string) {
  const supabase = db()
  await supabase.from('uren_weken').update({ status: 'goedgekeurd' }).eq('id', weekId)
  try {
    const { stuurUrenWeekNaarBouw7 } = await import('./bouw7')
    await stuurUrenWeekNaarBouw7(weekId)
  } catch (e) {
    console.error('[uren] versturen naar Bouw7 na goedkeuring mislukt:', e)
  }
}
