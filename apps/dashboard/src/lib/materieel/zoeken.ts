import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { signPaden } from './bestanden'
import { leesScan, zoektermen } from './qr'
import {
  ALGEMEEN_GEBRUIK, CATEGORIE_LABELS, MATERIEEL_CATEGORIEEN, MATERIEEL_STATUSSEN, STATUS_META,
  type MaterieelObject,
} from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Kolommen die de mobiele schermen nodig hebben — niet de hele rij. */
const KORT =
  'id, omschrijving, categorie, merk, type, serienummer, status, qr_code, inventarisnummer, ' +
  'hoofdfoto_path, toewijzing_niveau, toegewezen_medewerker_id, toegewezen_team_id, actief, details'

export type MaterieelKort = Pick<
  MaterieelObject,
  | 'id' | 'omschrijving' | 'categorie' | 'merk' | 'type' | 'serienummer' | 'status'
  | 'qr_code' | 'inventarisnummer' | 'hoofdfoto_path'
  | 'toewijzing_niveau' | 'toegewezen_medewerker_id' | 'toegewezen_team_id' | 'actief'
> & { details?: Record<string, unknown> | null }

/** Materieel plus de naam waar het op staat — "Algemeen gebruik" als het vrij is. */
export type MaterieelTreffer = MaterieelKort & {
  toegewezen_naam: string
  /** Nummer van de keuringssticker, als het object er een heeft. */
  keuringsnummer: string | null
  /** Kortstondige signed URL van de hoofdfoto (de bucket is privé). */
  foto_url: string | null
}

/** `%`, `_` en `\` zijn jokers in ilike en moeten letterlijk gezocht worden. */
function escapeIlike(waarde: string): string {
  return waarde.replace(/[\\%_]/g, (t) => `\\${t}`)
}

/**
 * Zoek het object dat bij een gescande (of ingetypte) code hoort.
 *
 * Volgorde is bewust:
 *  1. Een QR die EVA zelf printte bevat de object-id → direct raak.
 *  2. Anders: de kandidaten uit `zoektermen()`, van meest naar minst specifiek,
 *     tegen `qr_code` en `inventarisnummer`. Hoofdletterongevoelig, want een
 *     handmatig ingetypte code komt zelden precies zo binnen als hij op de
 *     sticker staat.
 *
 * Geeft `null` als niets past — dat is bij een verse sticker de normale uitkomst
 * en geen fout: het is precies het startsein om materieel toe te voegen.
 */
export async function zoekOpCode(payload: string): Promise<MaterieelKort | null> {
  const gelezen = leesScan(payload)
  if (!gelezen) return null
  const client = db()

  if (gelezen.soort === 'eva') {
    const { data } = await client
      .from('materieel_objecten').select(KORT).eq('id', gelezen.objectId).maybeSingle()
    if (data) return data as MaterieelKort
    // Een uuid die geen object (meer) is: alsnog als losse code proberen.
  }

  // Bewust losse queries per kolom en géén `.or(...)`: die filter wordt als
  // kale string naar PostgREST gestuurd, en een payload met een komma of haakje
  // erin — heel gewoon in een URL — breekt dan de filter-syntax. Via `.ilike()`
  // gaat de waarde netjes als parameter mee.
  const termen = zoektermen(payload)
  for (const kolom of ['qr_code', 'inventarisnummer'] as const) {
    for (const term of termen) {
      const { data } = await client
        .from('materieel_objecten')
        .select(KORT)
        .ilike(kolom, escapeIlike(term))
        .limit(1)
      const rij = (data ?? [])[0]
      if (rij) return rij as MaterieelKort
    }
  }

  return null
}

/* ── Vrij zoeken over alle velden ───────────────────────────────────── */

/**
 * Namen van medewerkers en teams, om op te zoeken én om bij een treffer te tonen.
 *
 * Beide tabellen zijn klein (tientallen rijen) maar worden toch gepagineerd
 * opgehaald: een `.select()` zonder harde grens kapt stil af op 1000 rijen, en
 * dat is precies het soort fout dat je pas merkt als het te laat is. Ook
 * inactieve medewerkers doen mee — er staat gereedschap op naam van mensen die
 * inmiddels weg zijn, en juist dát wil je kunnen vinden.
 */
type NaamKaarten = { medewerkers: Map<string, string>; teams: Map<string, string> }

async function naamKaarten(): Promise<NaamKaarten> {
  type Mw = { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }
  type Tm = { id: string; naam: string }

  const [mw, tm] = await Promise.all([
    haalAlleRijen<Mw>((van, tot) =>
      db().from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').order('id').range(van, tot)),
    haalAlleRijen<Tm>((van, tot) =>
      db().from('materieel_teams').select('id, naam').order('id').range(van, tot)),
  ])

  return {
    medewerkers: new Map(mw.map((m) => [m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')])),
    teams: new Map(tm.map((t) => [t.id, t.naam])),
  }
}

/**
 * Zoekterm veilig maken voor een PostgREST `or`-filter.
 *
 * Die filter gaat als kale string over de lijn: een komma of haakje in de term
 * breekt de syntax, en `%`, `_` en `*` zouden als joker werken. Ze eruit halen is
 * hier geen verlies — niemand zoekt een boormachine op een haakje — en het houdt
 * de filter voorspelbaar. Punten blijven staan: die zitten in keuringsnummers
 * (`398.112`) en PostgREST leest de waarde als de rest van de clausule.
 */
function veiligeTerm(ruw: string): string {
  return ruw.replace(/[,()"'\\%*_[\]{}:]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Keys in `details` waar een keurings- of tagnummer in kan zitten. */
const NUMMER_DETAILS = ['aidc_tagnummer', 'apk_nummer'] as const

/** Het nummer van de keuringssticker, als het object er een heeft. */
export function keuringsnummerVan(o: { details?: Record<string, unknown> | null }): string | null {
  for (const key of NUMMER_DETAILS) {
    const waarde = o.details?.[key]
    if (typeof waarde === 'string' && waarde.trim()) return waarde.trim()
  }
  return null
}

/**
 * Alle manieren waarop één zoekwoord een object kan aanwijzen, als
 * PostgREST-clausules. Ze worden met OR aan elkaar geknoopt: het woord mag in
 * elk van deze velden zitten.
 */
function clausulesVoor(woord: string, kaarten: NaamKaarten): string[] {
  const patroon = `*${woord}*`
  const clausules = [
    'omschrijving', 'merk', 'type', 'serienummer', 'inventarisnummer', 'qr_code',
    'leverancier', 'opmerkingen',
  ].map((kolom) => `${kolom}.ilike.${patroon}`)

  for (const key of NUMMER_DETAILS) clausules.push(`details->>${key}.ilike.${patroon}`)

  const kleine = woord.toLowerCase()

  const categorieen = MATERIEEL_CATEGORIEEN.filter(
    (c) => CATEGORIE_LABELS[c].toLowerCase().includes(kleine) || c.includes(kleine),
  )
  if (categorieen.length > 0) clausules.push(`categorie.in.(${categorieen.join(',')})`)

  const statussen = MATERIEEL_STATUSSEN.filter(
    (s) => STATUS_META[s].label.toLowerCase().includes(kleine) || s.includes(kleine),
  )
  if (statussen.length > 0) clausules.push(`status.in.(${statussen.join(',')})`)

  const medewerkerIds = [...kaarten.medewerkers]
    .filter(([, naam]) => naam.toLowerCase().includes(kleine)).map(([id]) => id)
  if (medewerkerIds.length > 0) clausules.push(`toegewezen_medewerker_id.in.(${medewerkerIds.join(',')})`)

  const teamIds = [...kaarten.teams]
    .filter(([, naam]) => naam.toLowerCase().includes(kleine)).map(([id]) => id)
  if (teamIds.length > 0) clausules.push(`toegewezen_team_id.in.(${teamIds.join(',')})`)

  // "Algemeen gebruik" is geen waarde in de rij maar de afwezigheid van een
  // toewijzing; zoeken op die woorden moet dus wél iets opleveren.
  if (ALGEMEEN_GEBRUIK.toLowerCase().includes(kleine)) clausules.push('toewijzing_niveau.eq.algemeen')

  return clausules
}

/**
 * Vrij zoeken in het materieel — over álle velden die op het scherm staan.
 *
 * Waar het over gaat: het scherm toont omschrijving, merk, type, categorie,
 * status, serienummer, inventaris-/keuringsnummer en op wiens naam het staat.
 * Op elk van die dingen moet je ook kunnen zoeken, want dat is wat er op de
 * sticker of op het gereedschap zelf staat. Zoeken op alléén de omschrijving
 * betekende in de praktijk scrollen door 400 regels.
 *
 * Twee dingen kunnen niet rechtstreeks in de filter:
 *  - **de toewijzing** staat als id in de rij, niet als naam. De naam wordt eerst
 *    tegen de (kleine) medewerkers- en teamlijst gelegd en de treffers gaan als
 *    id-lijst mee de filter in.
 *  - **categorie en status** zijn enums; er wordt gezocht op het Nederlandse
 *    label dat de gebruiker ziet ("ladder", "defect"), niet op de enum-waarde.
 *
 * Meerdere woorden werken als een filter dat steeds verder inperkt: elk woord
 * moet érgens passen, niet allemaal in hetzelfde veld.
 *
 * Altijd begrensd met een `limiet`: er gaat nooit een onbegrensde select naar
 * PostgREST.
 */
export async function zoekMaterieel(
  zoekterm?: string | null,
  opties: { alleenZonderSticker?: boolean; limiet?: number } = {},
): Promise<MaterieelTreffer[]> {
  const { alleenZonderSticker = false, limiet = 50 } = opties
  const kaarten = await naamKaarten()

  let query = db()
    .from('materieel_objecten')
    .select(KORT)
    .eq('actief', true)
    .order('omschrijving')
    .limit(limiet)

  if (alleenZonderSticker) query = query.is('qr_code', null)

  // Elk woord apart: twee keer `.or()` op dezelfde query wordt in PostgREST een
  // `and(or(…),or(…))`. "makita slijper" vindt daarmee ook een Makita die in de
  // omschrijving "slijper" heet — met één patroon over de hele zin zou dat niets
  // opleveren, want die woorden staan in verschillende kolommen. Vijf woorden is
  // de grens: daarboven wordt de filter-URL onnodig lang en zoekt niemand meer.
  for (const woord of veiligeTerm(zoekterm ?? '').split(' ').filter(Boolean).slice(0, 5)) {
    query = query.or(clausulesVoor(woord, kaarten).join(','))
  }

  const { data, error } = await query
  if (error) throw new Error(`Zoeken in materieel mislukt: ${error.message}`)

  const rijen = (data ?? []) as MaterieelKort[]
  // De foto's hier al ondertekenen: de treffers gaan naar een client-component
  // en die kan zelf geen signed URL maken. Eén aanroep voor de hele pagina.
  const fotos = await signPaden(rijen.map((o) => o.hoofdfoto_path).filter(Boolean) as string[])

  return rijen.map((o) => ({
    ...o,
    toegewezen_naam:
      (o.toegewezen_medewerker_id && kaarten.medewerkers.get(o.toegewezen_medewerker_id))
      || (o.toegewezen_team_id && kaarten.teams.get(o.toegewezen_team_id))
      || ALGEMEEN_GEBRUIK,
    keuringsnummer: keuringsnummerVan(o),
    foto_url: (o.hoofdfoto_path && fotos.get(o.hoofdfoto_path)) || null,
  }))
}

/**
 * Materieel dat op naam van deze medewerker staat, plus dat van de teams waar
 * hij teamleider van is (een servicebus is zo'n team). Begrensd op medewerker en
 * team, dus geen paginering nodig.
 */
export async function getMijnMaterieel(medewerkerId: string): Promise<MaterieelKort[]> {
  const client = db()

  const { data: teamRijen } = await client
    .from('materieel_teams').select('id').eq('teamleider_id', medewerkerId).eq('actief', true)
  const teamIds = ((teamRijen ?? []) as { id: string }[]).map((t) => t.id)

  const filter = [`toegewezen_medewerker_id.eq.${medewerkerId}`]
  if (teamIds.length > 0) filter.push(`toegewezen_team_id.in.(${teamIds.join(',')})`)

  const { data } = await client
    .from('materieel_objecten')
    .select(KORT)
    .eq('actief', true)
    .or(filter.join(','))
    .order('omschrijving')

  return (data ?? []) as MaterieelKort[]
}

/**
 * Materieel waar nog geen sticker op zit — de werkvoorraad bij het stickeren van
 * een bestaande inventaris: kantoor voert de lijst in, de bus plakt de stickers.
 *
 * `qr_code is null` is hier de volledige toets: sinds migratie 20260908j vult
 * niets die kolom meer automatisch, dus leeg betekent "nog te stickeren".
 */
export async function getZonderSticker(zoekterm?: string | null, limiet = 200): Promise<MaterieelTreffer[]> {
  return zoekMaterieel(zoekterm, { alleenZonderSticker: true, limiet })
}

/** Hoeveel stuks materieel wachten nog op een sticker? */
export async function telZonderSticker(): Promise<number> {
  const { count } = await db()
    .from('materieel_objecten')
    .select('id', { count: 'exact', head: true })
    .eq('actief', true)
    .is('qr_code', null)
  return count ?? 0
}

/** De laatste stukken materieel die deze medewerker zelf heeft toegevoegd. */
export async function getRecentToegevoegd(medewerkerId: string, aantal = 10): Promise<MaterieelKort[]> {
  const { data } = await db()
    .from('materieel_objecten')
    .select(KORT)
    .eq('actief', true)
    .eq('created_by', medewerkerId)
    .order('created_at', { ascending: false })
    .limit(aantal)
  return (data ?? []) as MaterieelKort[]
}
