import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { haalVorigeSignalen, onthoudSignaal, type VorigSignaal } from '@/lib/notificaties/signalen'
import { getUrenInstellingen } from '@/lib/uren/instellingen'
import { isoWeekdag, weekDagen, weekStartVan } from '@/lib/uren/rooster'
import { haalOpenstaandeUren } from '@/lib/uren/openstaande-uren'
import { periodeBereik } from '@/lib/uren/types'
import { dagVanTijdstip } from '@/lib/agenda/agenda-model'
import {
  planningSleutel, planningVerschil, sorteerPlanning, type PlanRegel,
} from '@/lib/notificaties/planning-verschil'
import { bepaalTaakMelding } from '@/lib/notificaties/taak-signaal'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import type { CronLogboek } from '@/lib/cron/logboek'

/**
 * De dagelijkse signalen: wat er van je verwacht wordt, op je telefoon.
 *
 * Aanleiding: EVA maakte wél meldingen over debiteuren en het wagenpark, maar niets
 * over de dingen waar de buitendienst elke dag mee werkt. Acties, planning en uren
 * stonden alleen op een scherm, en wie niet kijkt ziet ze niet.
 *
 * ── Waarom een cron en geen melding op het moment zelf ──────────────────────────
 * Deze vier signalen hebben geen moment. Een deadline "gebeurt" niet; een planning
 * die uit Bouw7 komt is een herbouw waarbij elke rij nieuw lijkt; een weekstaat die
 * niet is ingediend is een afwezigheid. Alle vier zijn ze een *toestand*, en daar
 * hoort een moment van kijken bij.
 *
 * ── Waarom het niet dubbel meldt ────────────────────────────────────────────────
 * Niet de klok bepaalt of er iets uitgaat, maar `melding_signalen`: per medewerker
 * en soort ligt de laatst gemelde toestand vast als korte `sleutel`. Is die gelijk,
 * dan blijft de telefoon stil. Daarmee is de frequentie van de cron ongevaarlijk —
 * vaker draaien geeft niet meer meldingen, alleen een snellere reactie.
 *
 * ── Wanneer wat ────────────────────────────────────────────────────────────────
 * De cron draait twee keer per werkdag (07:00 en 15:00 lokaal). Niet elk signaal
 * hoort bij beide momenten:
 *
 *   * deadlines      — 's ochtends; een lijst voor de dag die net begint
 *   * planning       — beide; de Bouw7-planningsync draait 's nachts én rond het
 *                      middaguur, dus een middagwijziging hoort niet tot morgen te
 *                      wachten
 *   * weekstaat      — 's ochtends de te late weken, 's middags op de indien-dag
 *                      (standaard vrijdag) de herinnering vóór de deadline
 *   * fiatteren      — alleen 's ochtends op de goedkeurdag (standaard maandag)
 *
 * Die laatste is de enige die Bouw7 aanroept; buiten de goedkeurdag wordt die call
 * niet eens gedaan.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type Run = 'ochtend' | 'middag'

export type DagsignalenResultaat = {
  run: Run
  medewerkers: number
  taakDeadlines: number
  planning: number
  planningEersteKeer: number
  urenWeken: number
  urenFiatteren: number
  offertebewaking: number
  fouten: string[]
}

type Medewerker = { id: string; auth_user_id: string; voornaam: string | null }

/* ── Hulpjes ──────────────────────────────────────────────────────── */

/** Vandaag in Amsterdam. Niet `toISOString()`: op Vercel draait de server in UTC. */
function vandaagLokaal(nu = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(nu)
}

function verschuif(dag: string, dagen: number): string {
  const d = new Date(`${dag}T12:00:00`)
  d.setDate(d.getDate() + dagen)
  return d.toISOString().slice(0, 10)
}

/** Begrensd door het aantal medewerkers van het bedrijf; ruim onder de PostgREST-grens. */
async function haalMedewerkers(): Promise<Medewerker[]> {
  const { data } = await db()
    .from('medewerkers')
    .select('id, auth_user_id, voornaam')
    .eq('actief', true)
    .not('auth_user_id', 'is', null)
  return (data ?? []) as Medewerker[]
}

/* ── 1. Acties met een deadline ───────────────────────────────────── */

/**
 * Eén melding per medewerker over de acties die vandaag afmoeten en over wat er sinds
 * de vorige melding over zijn deadline is gegaan. Bewust gebundeld: vijf losse
 * pushmeldingen om 07:00 is geen lijstje maar een wekker die vijf keer afgaat.
 *
 * Wát er precies gemeld wordt (en wanneer juist niets) zit in `bepaalTaakMelding`;
 * lees daar waarom een bekende achterstand op zichzelf geen melding oplevert.
 */
async function meldTaakDeadlines(
  medewerkers: Medewerker[],
  vorige: Map<string, VorigSignaal>,
): Promise<number> {
  const vandaag = vandaagLokaal()

  type Rij = {
    id: string
    titel: string
    deadline: string
    task_assignees: { user_id: string }[] | null
  }

  // Begrensd op "deadline verstreken of vandaag" en open status; dat is een kleine
  // verzameling. Toch gepagineerd — de afspraak in dit project is dat geen enkele
  // select op zijn eigen grootte vertrouwt.
  const taken = await haalAlleRijen<Rij>((van, tot) =>
    db()
      .from('tasks')
      .select('id, titel, deadline, task_assignees ( user_id )')
      .not('deadline', 'is', null)
      .lte('deadline', vandaag)
      .not('status', 'in', '("gereed","vervallen")')
      .is('parent_task_id', null)
      .order('id')
      .range(van, tot),
  )

  type Emmer = { vandaag: Rij[]; teLaat: Rij[] }
  const perUser = new Map<string, Emmer>()
  for (const taak of taken) {
    for (const a of taak.task_assignees ?? []) {
      const emmer = perUser.get(a.user_id) ?? { vandaag: [], teLaat: [] }
      if (taak.deadline.slice(0, 10) === vandaag) emmer.vandaag.push(taak)
      else emmer.teLaat.push(taak)
      perUser.set(a.user_id, emmer)
    }
  }

  let verzonden = 0

  for (const mw of medewerkers) {
    const emmer = perUser.get(mw.auth_user_id) ?? { vandaag: [], teLaat: [] }
    const vorig = vorige.get(mw.id)
    const eerder = (vorig?.stand as string[] | null) ?? null

    const melding = bepaalTaakMelding(emmer.vandaag, emmer.teLaat, eerder)

    // Niets te melden, maar de stand moet wél mee: anders geldt de achterstand van
    // vandaag morgen alsnog als nieuw.
    if (!melding) {
      const ids = [...emmer.vandaag, ...emmer.teLaat].map(t => t.id)
      if (vorig || ids.length > 0) {
        await onthoudSignaal(mw.id, 'taak_deadline', `${vandaag}|stil`, ids)
      }
      continue
    }

    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'taak',
      titel: melding.titel,
      body: melding.body,
      url: '/mijn-taken',
    })
    await onthoudSignaal(mw.id, 'taak_deadline', `${vandaag}|${melding.gemeldeIds.length}`, melding.gemeldeIds)
    verzonden++
  }

  return verzonden
}

/* ── 2. Planning ──────────────────────────────────────────────────── */

/** Hoe ver vooruit een planningwijziging nog de moeite van een melding waard is. */
const PLANNING_HORIZON_DAGEN = 7

/**
 * Momentopname van ieders planning in het venster.
 *
 * Let op waaróm dit een momentopname is en geen "kijk naar nieuwe rijen": de
 * Bouw7-planningsync **herbouwt** alle rijen met bron='bouw7' — hij gooit ze weg en
 * zet ze opnieuw neer. Elke rij is na een sync dus "nieuw", ook als er niets is
 * veranderd. Op `created_at` of op de id afgaan zou daarom elke nacht melden dat je
 * hele planning is gewijzigd. Vergelijken van twee momentopnamen is het enige dat
 * overleeft.
 */
async function haalPlanningStand(van: string, tot: string): Promise<Map<string, PlanRegel[]>> {
  type Rij = {
    medewerker_id: string
    start_dt: string
    planning_activiteiten: {
      titel: string | null
      dossiers: { dossiernummer: string | null; titel: string | null } | null
    } | null
  }

  const rijen = await haalAlleRijen<Rij>((van_, tot_) =>
    db()
      .from('planning_items')
      .select(`
        medewerker_id, start_dt,
        planning_activiteiten ( titel, dossiers ( dossiernummer, titel ) )
      `)
      .gte('start_dt', `${van}T00:00:00`)
      .lt('start_dt', `${verschuif(tot, 1)}T00:00:00`)
      .order('id')
      .range(van_, tot_),
  )

  const perMedewerker = new Map<string, PlanRegel[]>()
  for (const rij of rijen) {
    const activiteit = rij.planning_activiteiten
    const dossier = activiteit?.dossiers
    const wat = [activiteit?.titel ?? 'Werk', dossier?.dossiernummer ?? dossier?.titel]
      .filter(Boolean).join(' · ')
    // Dezelfde dagbepaling als de agenda (`dagVanTijdstip`), zodat de melding niet
    // een andere dag noemt dan het scherm waar hij naartoe wijst.
    const dag = dagVanTijdstip(rij.start_dt)
    if (!dag) continue
    const lijst = perMedewerker.get(rij.medewerker_id) ?? []
    lijst.push({ dag, wat })
    perMedewerker.set(rij.medewerker_id, lijst)
  }

  for (const [id, lijst] of perMedewerker) perMedewerker.set(id, sorteerPlanning(lijst))
  return perMedewerker
}

async function meldPlanningWijzigingen(
  medewerkers: Medewerker[],
  vorige: Map<string, VorigSignaal>,
): Promise<{ verzonden: number; eersteKeer: number }> {
  const van = vandaagLokaal()
  const tot = verschuif(van, PLANNING_HORIZON_DAGEN)
  const stand = await haalPlanningStand(van, tot)

  let verzonden = 0
  let eersteKeer = 0

  for (const mw of medewerkers) {
    const nieuw = stand.get(mw.id) ?? []
    const sleutel = planningSleutel(van, nieuw)

    const vorig = vorige.get(mw.id)

    // Eerste keer: alleen vastleggen. Zonder dit krijgt iedereen bij de eerste run
    // "je planning is gewijzigd" voor planning die al weken vaststond.
    if (!vorig) {
      await onthoudSignaal(mw.id, 'planning', sleutel, nieuw)
      eersteKeer++
      continue
    }
    if (vorig.sleutel === sleutel) continue

    const regels = planningVerschil((vorig.stand as PlanRegel[] | null) ?? [], nieuw)
    // Wel een andere sleutel maar geen zichtbaar verschil? Dan is alleen de horizon
    // opgeschoven. Stand bijwerken, mond houden.
    if (regels.length === 0) {
      await onthoudSignaal(mw.id, 'planning', sleutel, nieuw)
      continue
    }

    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'planning',
      titel: 'Je planning is gewijzigd',
      body: regels.slice(0, 3).join(' · ') + (regels.length > 3 ? ` · +${regels.length - 3} dagen` : ''),
      url: '/planning',
    })
    await onthoudSignaal(mw.id, 'planning', sleutel, nieuw)
    verzonden++
  }

  return { verzonden, eersteKeer }
}

/* ── 3. Weekstaten ────────────────────────────────────────────────── */

/** Hoeveel weken terug we kijken naar openstaande weekstaten. */
const WEKEN_TERUG = 6

/** De datum waarop een weekstaat ingediend moet zijn. Alleen de dag, geen tijd —
 *  een tijd vergelijken vraagt om een tijdzone en die klopt op Vercel niet. */
function indienDatum(weekStart: string, deadlineDag: number): string {
  const dagen = weekDagen(weekStart)
  return dagen.find(d => isoWeekdag(d) === deadlineDag) ?? dagen[dagen.length - 1]
}

async function meldOpenWeekstaten(
  medewerkers: Medewerker[],
  vorige: Map<string, VorigSignaal>,
  run: Run,
): Promise<number> {
  const vandaag = vandaagLokaal()
  const inst = await getUrenInstellingen()
  const grens = weekStartVan(verschuif(vandaag, -WEKEN_TERUG * 7))

  // Begrensd door (aantal medewerkers × WEKEN_TERUG): meer rijen kan deze query per
  // definitie niet opleveren, dus hier is pagineren niet nodig.
  type Rij = { medewerker_id: string; week_start: string; week_nr: number; status: string }
  const { data } = await db()
    .from('uren_weken')
    .select('medewerker_id, week_start, week_nr, status')
    .in('status', ['concept', 'afgekeurd'])
    .gte('week_start', grens)
    .order('week_start', { ascending: true })

  const perMedewerker = new Map<string, Rij[]>()
  for (const rij of (data ?? []) as Rij[]) {
    const lijst = perMedewerker.get(rij.medewerker_id) ?? []
    lijst.push(rij)
    perMedewerker.set(rij.medewerker_id, lijst)
  }

  let verzonden = 0

  for (const mw of medewerkers) {
    const weken = perMedewerker.get(mw.id) ?? []
    if (weken.length === 0) continue

    const punten: { sleutel: string; tekst: string }[] = []

    for (const week of weken) {
      if (week.status === 'afgekeurd') {
        punten.push({ sleutel: `${week.week_start}:afgekeurd`, tekst: `week ${week.week_nr} is afgekeurd` })
        continue
      }

      const deadline = indienDatum(week.week_start, inst.indien_deadline_dag)

      if (vandaag > deadline) {
        // Na een week is het geen herinnering meer; die trap krijgt een eigen
        // sleutel zodat hij één keer opnieuw langskomt, niet elke dag.
        const laat = vandaag > verschuif(deadline, 7)
        punten.push({
          sleutel: `${week.week_start}:telaat${laat ? '7' : ''}`,
          tekst: laat ? `week ${week.week_nr} staat al ruim een week open` : `week ${week.week_nr} is nog niet ingediend`,
        })
        continue
      }

      // Vóór de deadline alleen op de indien-dag zelf, en alleen 's middags:
      // 's ochtends om 07:00 melden dat je je week vóór 17:00 moet indienen is
      // een herinnering aan iets wat je nog de hele dag kunt doen.
      if (run === 'middag' && vandaag === deadline) {
        punten.push({
          sleutel: `${week.week_start}:bijna`,
          tekst: `dien week ${week.week_nr} vandaag nog in`,
        })
      }
    }

    if (punten.length === 0) continue

    const sleutel = punten.map(p => p.sleutel).sort().join(',')
    if (vorige.get(mw.id)?.sleutel === sleutel) continue

    const tekst = punten.map(p => p.tekst).join(' · ')
    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'uren',
      titel: punten.length === 1 && punten[0].sleutel.endsWith(':bijna')
        ? 'Vergeet je uren niet'
        : 'Je urenverantwoording',
      body: tekst.charAt(0).toUpperCase() + tekst.slice(1),
      url: '/uren',
    })
    await onthoudSignaal(mw.id, 'uren_week', sleutel)
    verzonden++
  }

  return verzonden
}

/* ── 4. Uren fiatteren ────────────────────────────────────────────── */

/**
 * De stapel uurregels die op jouw akkoord wacht.
 *
 * Eén keer per week, op de dag dat de goedkeuring rond moet zijn (standaard
 * maandag). Bewust niet dagelijks: die stapel groeit elke dag doordat monteurs
 * uren boeken, dus een melding "er wacht werk" zou élke ochtend afgaan en
 * daarmee binnen een week behang worden. De goedkeurdeadline is een echt moment
 * en verdient een echte melding.
 *
 * Dit is het enige signaal dat Bouw7 aanroept. Buiten de goedkeurdag gebeurt dat
 * niet eens — vandaar de controle vóór de ophaal en niet erna.
 */
async function meldTeFiatteren(
  medewerkers: Medewerker[],
  vorige: Map<string, VorigSignaal>,
  log: CronLogboek,
): Promise<number> {
  const vandaag = vandaagLokaal()
  const inst = await getUrenInstellingen()
  if (isoWeekdag(vandaag) !== inst.goedkeur_deadline_dag) return 0

  log.stap('bouw7 openstaande uren ophalen')
  const { van, tot } = periodeBereik('te_keuren', new Date(`${vandaag}T12:00:00`))
  const res = await haalOpenstaandeUren(van, tot)
  if (res.fout) {
    // Fail-soft: geen melding is beter dan een melding met een verzonnen getal.
    log.stap('bouw7 niet bereikbaar, fiatteer-herinnering overgeslagen', { fout: res.fout })
    return 0
  }

  // Verdelen volgens dezelfde regel als `getMijnTeKeurenUren`: een vaste goedkeurder vervangt
  // de dossierroute, en zonder die goedkeurder mag de projectleider altijd en de teamleider
  // alleen zolang de projectleider nog niet akkoord is. Een regel waarop je beide bent telt
  // één keer.
  const perMedewerker = new Map<string, Set<number>>()
  const voegToe = (medewerkerId: string | null, regelId: number) => {
    if (!medewerkerId) return
    const set = perMedewerker.get(medewerkerId) ?? new Set<number>()
    set.add(regelId)
    perMedewerker.set(medewerkerId, set)
  }
  for (const r of res.regels) {
    if (r.status === 'niet_toe_te_wijzen') continue
    if (r.status === 'wacht_op_vaste_goedkeurder') { voegToe(r.vasteGoedkeurderId, r.id); continue }
    if (!r.plAkkoord) voegToe(r.projectleiderId, r.id)
    if (!r.tlAkkoord && !r.plAkkoord) voegToe(r.teamleiderId, r.id)
  }

  const weekSleutel = weekStartVan(vandaag)
  let verzonden = 0

  for (const mw of medewerkers) {
    const aantal = perMedewerker.get(mw.id)?.size ?? 0
    if (aantal === 0) continue

    // Sleutel op de week, niet op het aantal: één herinnering per week, ook als er
    // tussendoor regels bij komen.
    const sleutel = `${weekSleutel}:fiatteren`
    if (vorige.get(mw.id)?.sleutel === sleutel) continue

    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'uren',
      titel: `${aantal} ${aantal === 1 ? 'uurregel wacht' : 'uurregels wachten'} op je akkoord`,
      body: `De goedkeuring van vorige week moet vandaag rond zijn (uiterlijk ${inst.goedkeur_deadline_tijd.slice(0, 5)}).`,
      url: '/uren?periode=te_keuren',
    })
    await onthoudSignaal(mw.id, 'uren_fiatteren', sleutel)
    verzonden++
  }

  return verzonden
}


/* ── 5. Offertebewaking ───────────────────────────────────────────── */

/**
 * Eén melding per medewerker over de offertes waarvan hij actiehouder is en waarvan de
 * afgesproken datum vandaag is of al voorbij.
 *
 * Bewust via `getDossiersVoorOffertes()` en niet via een eigen query op `commercie_bewaking`:
 * dat is exact dezelfde databron als de werklijst op /offertes, inclusief dezelfde
 * bedragberekening. Een tweede query zou vroeg of laat een ander bedrag opleveren dan het
 * scherm, en dan is de melding erger dan geen melding.
 *
 * Wat hier NIET in zit: offertes die nog niet beoordeeld zijn. Die hebben per definitie geen
 * actiehouder — er is niemand om te porren. Ze staan als tegel en als groep in de werklijst,
 * waar het een teamafspraak is wie ze oppakt, geen persoonlijke achterstand.
 */
async function meldOffertebewaking(
  medewerkers: Medewerker[],
  vorige: Map<string, VorigSignaal>,
): Promise<number> {
  const { getDossiersVoorOffertes } = await import('@/lib/dossiers/actions')
  const { bewakingsStatus } = await import('@/lib/commercie/types')

  const res = await getDossiersVoorOffertes()
  if (!res.ok) throw new Error(res.error)

  const vandaag = vandaagLokaal()

  type Emmer = { verlopen: number; vandaag: number; bedrag: number }
  const perMedewerker = new Map<string, Emmer>()

  for (const d of res.data) {
    const houder = d.bewaking_actiehouder_id
    if (!houder) continue

    const status = bewakingsStatus(
      {
        stap_soort: d.bewaking_stap_soort ?? null,
        stap_datum: d.bewaking_stap_datum ?? null,
        wacht_op:   d.bewaking_wacht_op ?? null,
      },
      { vandaag, afgerond: d.hoofdstatus === 'opdracht' },
    )
    if (status !== 'verlopen' && status !== 'nu') continue

    const emmer = perMedewerker.get(houder) ?? { verlopen: 0, vandaag: 0, bedrag: 0 }
    if (status === 'verlopen') emmer.verlopen++
    else emmer.vandaag++
    emmer.bedrag += berekenKaartBedrag(d, 'offerte').totaalExclBtw ?? 0
    perMedewerker.set(houder, emmer)
  }

  let verzonden = 0

  for (const mw of medewerkers) {
    const emmer = perMedewerker.get(mw.id)
    const sleutel = emmer ? `${vandaag}|${emmer.verlopen}|${emmer.vandaag}` : `${vandaag}|stil`

    // Niets te doen: stand wél onthouden, anders geldt dezelfde achterstand morgen als nieuw.
    if (!emmer || (emmer.verlopen === 0 && emmer.vandaag === 0)) {
      if (vorige.get(mw.id)) await onthoudSignaal(mw.id, 'offertebewaking', sleutel)
      continue
    }
    if (vorige.get(mw.id)?.sleutel === sleutel) continue

    const delen: string[] = []
    if (emmer.verlopen > 0) delen.push(`${emmer.verlopen} verlopen`)
    if (emmer.vandaag > 0) delen.push(`${emmer.vandaag} voor vandaag`)
    const bedrag = emmer.bedrag > 0
      ? ` · ${new Intl.NumberFormat('nl-NL', {
          style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
        }).format(emmer.bedrag)}`
      : ''

    await maakNotificatie({
      user_id: mw.auth_user_id,
      type: 'offertebewaking',
      titel: emmer.verlopen > 0 ? 'Offertebewaking: actie verlopen' : 'Offertebewaking vandaag',
      body: `${delen.join(' · ')}${bedrag}`,
      url: '/offertes',
    })
    await onthoudSignaal(mw.id, 'offertebewaking', sleutel)
    verzonden++
  }

  return verzonden
}

/* ── De run ───────────────────────────────────────────────────────── */

export async function stuurDagsignalen(run: Run, log: CronLogboek): Promise<DagsignalenResultaat> {
  const resultaat: DagsignalenResultaat = {
    run,
    medewerkers: 0,
    taakDeadlines: 0,
    planning: 0,
    planningEersteKeer: 0,
    urenWeken: 0,
    urenFiatteren: 0,
    offertebewaking: 0,
    fouten: [],
  }

  const medewerkers = await haalMedewerkers()
  resultaat.medewerkers = medewerkers.length
  if (medewerkers.length === 0) return resultaat

  // Elk onderdeel apart afvangen: valt de planning om, dan horen de uren er nog
  // steeds uit te gaan. Eén try om het geheel zou van één fout een stille dag maken.
  const onderdelen: [string, () => Promise<void>][] = [
    ['taak_deadline', async () => {
      if (run !== 'ochtend') return
      log.stap('acties met deadline')
      resultaat.taakDeadlines = await meldTaakDeadlines(medewerkers, await haalVorigeSignalen('taak_deadline'))
    }],
    ['planning', async () => {
      log.stap('planningwijzigingen')
      const r = await meldPlanningWijzigingen(medewerkers, await haalVorigeSignalen('planning'))
      resultaat.planning = r.verzonden
      resultaat.planningEersteKeer = r.eersteKeer
    }],
    ['uren_week', async () => {
      log.stap('openstaande weekstaten')
      resultaat.urenWeken = await meldOpenWeekstaten(medewerkers, await haalVorigeSignalen('uren_week'), run)
    }],
    ['uren_fiatteren', async () => {
      if (run !== 'ochtend') return
      log.stap('uren ter fiattering')
      resultaat.urenFiatteren = await meldTeFiatteren(medewerkers, await haalVorigeSignalen('uren_fiatteren'), log)
    }],
    ['offertebewaking', async () => {
      // Alleen 's ochtends: een offerte die vandaag nagebeld moet worden hoort in het lijstje
      // waarmee je de dag begint, niet in een tweede melding halverwege de middag.
      if (run !== 'ochtend') return
      log.stap('offertebewaking')
      resultaat.offertebewaking = await meldOffertebewaking(medewerkers, await haalVorigeSignalen('offertebewaking'))
    }],
  ]

  for (const [naam, doe] of onderdelen) {
    try {
      await doe()
    } catch (e) {
      resultaat.fouten.push(`${naam}: ${e instanceof Error ? e.message : 'onbekende fout'}`)
    }
  }

  return resultaat
}
