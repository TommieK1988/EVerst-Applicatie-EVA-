import 'server-only'
import { createAdminClient } from '@everts/database/server'
import type { CurrentMedewerker } from '@/lib/auth/rechten'
import { haalAgendaVenster, haalMijnTaakItems } from '@/lib/agenda/mijn-agenda'
import { dagSleutel, sorteerDagItems, type AgendaItem } from '@/lib/agenda/agenda-model'
import { getUrenInstellingen, indienDeadline } from '@/lib/uren/instellingen'
import { weekStartVan } from '@/lib/uren/rooster'
import { isFiatteerder } from './keuren'

/**
 * Datalaag van het mobiele startscherm (`/m`).
 *
 * Dit is het eerste scherm dat na het inloggen laadt, en het enige dat iedereen
 * elke dag opent. Daarom geldt hier één harde regel: **geen Bouw7-call**. Alles
 * hieronder komt uit de eigen database. Wat wél een Bouw7-call kost (het aantal
 * uurregels dat op jouw fiattering wacht) haalt het scherm ná het renderen op —
 * zie `HomeSignalen`, zelfde patroon als de desktop-GoedkeurenWidget.
 */

/* ── Planning voor vandaag ────────────────────────────────────────── */

/**
 * De agenda-items van vandaag: eigen planitems, verlof, bedrijfsagenda en eigen
 * taken met deadline — dezelfde vier bronnen als `/m/planning`, zodat het blok op
 * de startpagina nooit iets anders vertelt dan de agenda zelf.
 *
 * Bewust hetzelfde `haalAgendaVenster` en niet een eigen, snellere query: één
 * definitie van "wat staat er op mijn dag" is meer waard dan de paar millisecond
 * die een aparte query zou schelen.
 */
export async function haalVandaag(
  medewerker: CurrentMedewerker,
): Promise<{ dag: string; items: AgendaItem[] }> {
  const dag = dagSleutel(new Date())

  const [venster, taken] = await Promise.all([
    haalAgendaVenster(medewerker, dag, dag).catch(() => [] as AgendaItem[]),
    haalMijnTaakItems(medewerker.auth_user_id).catch(() => [] as AgendaItem[]),
  ])

  // `haalMijnTaakItems` levert álle open taken met een deadline, niet alleen die van
  // vandaag; hier houden we alleen de dag over. Achterstallige deadlines blijven
  // bewust weg — die horen bij de Acties-tegel, niet in een dagplanning.
  const items = [...venster, ...taken].filter(i => i.startDag <= dag && dag <= i.eindDag)

  return { dag, items: sorteerDagItems(items) }
}

/* ── Wat er van je verwacht wordt ─────────────────────────────────── */

export type UrenSignaal = {
  /** Weekrij-id; stabiel genoeg als React-sleutel. */
  id: string
  titel: string
  sub: string
  href: string
  /**
   * Rood in plaats van oranje. Een week die net over de indien-deadline heen is,
   * is een herinnering; een afgekeurde week of een week die al een week te laat
   * is, is een probleem. Zonder dat onderscheid staat alles rood en zegt rood
   * niets meer.
   */
  urgent: boolean
}

export type HomeSignalen = {
  uren: UrenSignaal[]
  /** Of het zin heeft het aantal te fiatteren uurregels na te laden — zie `isFiatteerder`. */
  magFiatteren: boolean
}

/** Hoeveel weken terug we kijken naar openstaande weekstaten. */
const WEKEN_TERUG = 6

/**
 * Hoeveel weekstaat-regels het blok toont. Wie er zes heeft laten liggen heeft
 * geen lijstje nodig maar een middag; drie regels zeggen dat ook, zonder de
 * tegels van het scherm te duwen.
 */
const MAX_SIGNALEN = 3

/**
 * Weekstaten die nog iets van je vragen.
 *
 * Bewust alleen weken waarvoor al een rij bestaat — dus weken die je zelf een keer
 * geopend hebt. De weekstaat is nog niet de officiële urenroute (die loopt via
 * Bouw7), dus iedereen aanspreken op een week die hij nooit geopend heeft zou 40
 * mensen een taak geven die ze niet hebben. Zodra de weekstaat de vaste route is,
 * kan deze grens verruimd worden naar "elke week met contracturen".
 */
async function haalUrenSignalen(medewerkerId: string): Promise<UrenSignaal[]> {
  const nu = new Date()
  const grens = new Date(nu)
  grens.setDate(grens.getDate() - WEKEN_TERUG * 7)
  const vanWeek = weekStartVan(grens)

  type WeekRij = { id: string; week_start: string; week_nr: number; status: string }

  const [{ data, error }, inst] = await Promise.all([
    createAdminClient()
      .from('uren_weken')
      .select('id, week_start, week_nr, status')
      .eq('medewerker_id', medewerkerId)
      .in('status', ['concept', 'afgekeurd'])
      .gte('week_start', vanWeek)
      .order('week_start', { ascending: true })
      .overrideTypes<WeekRij[]>(),
    getUrenInstellingen(),
  ])
  if (error) return []

  const signalen: UrenSignaal[] = []
  for (const week of data ?? []) {
    const href = `/m/uren?week=${week.week_start}`

    if (week.status === 'afgekeurd') {
      signalen.push({
        id: week.id,
        titel: `Week ${week.week_nr} is afgekeurd`,
        sub: 'Pas je uren aan en dien de week opnieuw in',
        href,
        urgent: true,
      })
      continue
    }

    // Een concept-week die nog loopt is geen taak — pas als de indien-deadline
    // verstreken is (standaard vrijdag 17:00) hoor je erop aangesproken te worden.
    const deadline = indienDeadline(week.week_start, inst)
    if (deadline > nu) continue

    const dagenTeLaat = Math.floor((nu.getTime() - deadline.getTime()) / 86_400_000)

    signalen.push({
      id: week.id,
      titel: `Week ${week.week_nr} nog niet ingediend`,
      sub: dagenTeLaat >= 7
        ? `De deadline was ${dagenTeLaat} dagen geleden`
        : 'Vul je uren aan en dien de week in',
      href,
      urgent: dagenTeLaat >= 7,
    })
  }

  // Oudste eerst (de query sorteert al op week_start): wie moet inhalen begint
  // vooraan, niet bij de week van gisteren.
  return signalen.slice(0, MAX_SIGNALEN)
}

export async function haalHomeSignalen(medewerkerId: string): Promise<HomeSignalen> {
  const [uren, fiatteren] = await Promise.all([
    haalUrenSignalen(medewerkerId).catch(() => [] as UrenSignaal[]),
    isFiatteerder(medewerkerId).catch(() => false),
  ])
  return { uren, magFiatteren: fiatteren }
}
