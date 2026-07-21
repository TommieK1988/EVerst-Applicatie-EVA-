import 'server-only'
import { afstandMeter, type GeoPunt } from '@everts/wagenpark-core/utils'
import { pgQuery } from './db'
import { geocodeQuery, adresQuery } from './geocode'

/**
 * Adres-bewuste werktijd-analyse per bestuurder, o.b.v. de rittenregistratie.
 *
 * Kern-idee: R9/R10 kijken alleen naar de eerste/laatste rit-TIJD van de dag —
 * dat is feitelijk "vertrek van huis" en "aankomst thuis", niet aankomst op /
 * vertrek van het werk. Deze module bepaalt aan de hand van de LOCATIE van de
 * ritten (binnen een straal rond de werkplek) de echte werktijden:
 *
 *   - Aankomst werk  = stop-tijd van de eerste rit die eindigt binnen straal van de werkplek
 *   - Vertrek werk   = start-tijd van de laatste rit die start binnen straal van de werkplek
 *   - Vertrek thuis  = start-tijd van de eerste rit die start binnen straal van huis
 *   - Aankomst thuis = stop-tijd van de laatste rit die eindigt binnen straal van huis
 *
 * DE WERKPLEK IS DE INGEPLANDE PROJECTLOCATIE VAN DIE DAG (niet een vast
 * bedrijfsadres): per (bestuurder × dag) worden de dossier-werkadressen gebruikt
 * waar de medewerker die dag is ingepland (planning_items → planning_activiteiten
 * → dossiers.werkadres_*). Meerdere sites op één dag mag: aankomst = eerste rit
 * bij één van die sites, vertrek = laatste rit bij één van die sites. Is er die
 * dag geen planning, dan valt de werkplek terug op het bedrijfs(post)adres.
 *
 * Verwachte tijden (grens voor te laat / te vroeg) komen uit het ROOSTER
 * (medewerker_roosters.dagstart/dageind), met terugval op ulu_users.werktijd_*.
 * Dag-uitzonderingen (verlof e.d.) uit medewerker_afwezigheid onderdrukken de
 * te-laat/te-vroeg-signalen voor die dag.
 *
 * Coördinaten (rit-eindpunten, woon-/werkadres, dossier-werkadres) worden lui
 * gegeocodeerd en gecachet in public.geocode_cache; rit-coördinaten worden
 * bovendien in ulu_trips teruggeschreven (self-warming).
 */

// --- Config -----------------------------------------------------------------

export type WerktijdConfig = {
  straal_meter: number
  thuis_straal_meter: number
  marge_aankomst_min: number
  marge_vertrek_min: number
}

const DEFAULT_CONFIG: WerktijdConfig = {
  straal_meter: 500,
  thuis_straal_meter: 500,
  marge_aankomst_min: 0,
  marge_vertrek_min: 0,
}

export async function laadWerktijdConfig(): Promise<WerktijdConfig> {
  const rows = await pgQuery<{ drempel_config: Partial<WerktijdConfig> | null }>(
    `select drempel_config from public.handboek_regels where code = 'R11'`,
  )
  const cfg = rows[0]?.drempel_config ?? {}
  return {
    straal_meter: num(cfg.straal_meter, DEFAULT_CONFIG.straal_meter),
    thuis_straal_meter: num(cfg.thuis_straal_meter, DEFAULT_CONFIG.thuis_straal_meter),
    marge_aankomst_min: num(cfg.marge_aankomst_min, DEFAULT_CONFIG.marge_aankomst_min),
    marge_vertrek_min: num(cfg.marge_vertrek_min, DEFAULT_CONFIG.marge_vertrek_min),
  }
}

function num(v: unknown, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

// --- Resultaat-types --------------------------------------------------------

export type DagStatus =
  | 'ok'
  | 'te_laat'
  | 'te_vroeg'
  | 'te_laat_en_vroeg'
  | 'niet_op_locatie'
  | 'geen_ritten'
  | 'afwezig'
  | 'geen_werkdag'

/** Waar kwam de werkplek-referentie vandaan? */
export type WerkBron = 'planning' | 'bedrijf' | null

export type DagResultaat = {
  datum: string
  is_werkdag: boolean
  werk_bron: WerkBron
  verwacht_start: string | null
  verwacht_eind: string | null
  aankomst_werk: string | null
  vertrek_werk: string | null
  vertrek_thuis: string | null
  aankomst_thuis: string | null
  netto_minuten: number | null
  te_laat_minuten: number | null
  te_vroeg_minuten: number | null
  niet_op_locatie: boolean
  afwezigheid: string | null
  status: DagStatus
}

export type BestuurderResultaat = {
  user_id_ulu: number
  volledige_naam: string | null
  medewerker_id: string | null
  auth_user_id: string | null
  heeft_werk_coord: boolean
  heeft_woon_coord: boolean
  dagen: DagResultaat[]
  dagen_te_laat: number
  dagen_te_vroeg: number
  totaal_te_laat_minuten: number
  totaal_te_vroeg_minuten: number
  gewerkte_dagen: number
  gemiddelde_netto_minuten: number | null
}

// --- Helpers ----------------------------------------------------------------

function parseHM(t: string | null | undefined): number | null {
  if (!t) return null
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  if (!Number.isFinite(h)) return null
  return h * 60 + (m || 0)
}

/** ISO-weekdag: 1=ma .. 7=zo. */
function isoWeekdag(datum: string): number {
  const dow = new Date(datum + 'T12:00:00Z').getUTCDay() // 0=zo..6=za
  return dow === 0 ? 7 : dow
}

/** Laatste adres-component = plaats (evt. "(DE)" verwijderd). */
function plaatsUitAdres(adres: string | null | undefined): string | null {
  if (!adres) return null
  const delen = adres.split(',').map((s) => s.trim()).filter(Boolean)
  if (delen.length === 0) return null
  const laatste = delen[delen.length - 1].replace(/\(.*?\)/g, '').trim()
  return (laatste || delen[delen.length - 1]).toLowerCase()
}

/**
 * Straatnaam normaliseren: huisnummer(reeks) en toevoegingen eraf, lowercase.
 * "De Star 3" → "de star" · "Assendelftstraat  53-89" → "assendelftstraat"
 */
function normStraatnaam(v: string | null | undefined): string {
  return String(v ?? '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+\d+\s*[a-z]?(\s*[-–/]\s*\d+\s*[a-z]?)*\s*$/i, '') // huisnummer(reeks) achteraan
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Sleutel "straat|plaats" voor een referentie-adres (bedrijf, woonadres, dossier).
 * Null als straat of plaats ontbreekt.
 */
function straatPlaatsSleutel(
  straat: string | null | undefined,
  plaats: string | null | undefined,
): string | null {
  const s = normStraatnaam(straat)
  const p = String(plaats ?? '').replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return s && p ? `${s}|${p}` : null
}

/**
 * Sleutel "straat|plaats" voor een ULU-rit-adres ("Road, Plaats" of "Road, Plaats (DE)").
 *
 * ULU levert alleen een straatnaam, geen huisnummer. Geocoding van zo'n adres
 * geeft daarom het MIDDEN van de straat — bij een lange straat kan dat honderden
 * meters van het echte pand liggen (bv. "De Star" is 554 m van De Star 3). Door
 * ook op straat+plaats te matchen tellen die ritten alsnog als "op locatie".
 */
function tripSleutel(adres: string | null | undefined): string | null {
  if (!adres) return null
  const delen = adres.split(',').map((s) => s.trim()).filter(Boolean)
  if (delen.length < 2) return null
  const plaats = delen[delen.length - 1]
  const straat = delen.slice(0, delen.length - 1).join(' ')
  return straatPlaatsSleutel(straat, plaats)
}

function datesInRange(van: string, tot: string): string[] {
  const out: string[] = []
  const d = new Date(van + 'T12:00:00Z')
  const eind = new Date(tot + 'T12:00:00Z')
  while (d <= eind) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

function maxDatum(a: string, b: string): string {
  return a > b ? a : b
}
function minDatum(a: string, b: string): string {
  return a < b ? a : b
}

// --- Interne rij-types ------------------------------------------------------

type DriverRij = {
  user_id_ulu: number
  volledige_naam: string | null
  medewerker_id: string | null
  auth_user_id: string | null
  werktijd_start: string | null
  werktijd_eind: string | null
  woon_lat: number | null
  woon_lng: number | null
  woon_plaats: string | null
  woon_straat: string | null
  werk_lat: number | null
  werk_lng: number | null
  werk_plaats: string | null
  werk_straat: string | null
}

type TripRij = {
  id: string
  user_id_ulu: number
  start_datum: string
  start_tijd: string
  stop_tijd: string | null
  adres_start: string | null
  adres_stop: string | null
  start_lat: number | null
  start_lng: number | null
  stop_lat: number | null
  stop_lng: number | null
}

type RoosterRij = {
  medewerker_id: string
  geldig_vanaf: string
  geldig_tot: string | null
  werkdagen: number[]
  dagstart: string
  dageind: string
}

type AfwezigRij = {
  medewerker_id: string
  type: string
  start_datum: string
  eind_datum: string
  start_tijd: string | null
  eind_tijd: string | null
}

type PlanningRij = {
  medewerker_id: string
  start_dag: string
  eind_dag: string
  werkadres_straat: string | null
  werkadres_huisnummer: string | null
  werkadres_postcode: string | null
  werkadres_stad: string | null
  locatie_adres: string | null
}

// --- Hoofdfunctie -----------------------------------------------------------

export type AnalyseOpties = { userIds?: number[] }

export async function analyseerWerktijden(
  van: string,
  tot: string,
  opties: AnalyseOpties = {},
): Promise<BestuurderResultaat[]> {
  const config = await laadWerktijdConfig()

  // 1. Bestuurders + woon-coördinaat + bedrijfsadres-fallback (hoofdvestiging of werkmaatschappij).
  // NB: geef alleen parameters mee die de query ook echt gebruikt.
  const driverParams: unknown[] = []
  let driverFilter = ''
  if (opties.userIds?.length) {
    driverParams.push(opties.userIds)
    driverFilter = `and uu.id = any($1::bigint[])`
  }

  const drivers = await pgQuery<DriverRij>(
    `
    with hoofd as (
      select adres_lat, adres_lng, adres_plaats, adres_straat
        from public.bedrijfsgegevens
       where adres_lat is not null
       order by created_at nulls last, id
       limit 1
    )
    select uu.id as user_id_ulu,
           uu.volledige_naam,
           uu.medewerker_id::text as medewerker_id,
           m.auth_user_id::text as auth_user_id,
           uu.werktijd_start::text as werktijd_start,
           uu.werktijd_eind::text as werktijd_eind,
           m.adres_lat as woon_lat,
           m.adres_lng as woon_lng,
           lower(coalesce(m.adres_plaats, '')) as woon_plaats,
           m.adres_straat as woon_straat,
           coalesce(bg.adres_lat, (select adres_lat from hoofd)) as werk_lat,
           coalesce(bg.adres_lng, (select adres_lng from hoofd)) as werk_lng,
           lower(coalesce(bg.adres_plaats, (select adres_plaats from hoofd), '')) as werk_plaats,
           coalesce(bg.adres_straat, (select adres_straat from hoofd)) as werk_straat
      from public.ulu_users uu
      left join public.medewerkers m on m.id = uu.medewerker_id
      left join public.bedrijfsgegevens bg on bg.id = m.werkmaatschappij_id
     where uu.actief = true
       ${driverFilter}
     order by uu.volledige_naam nulls last, uu.id
    `,
    driverParams,
  )
  if (drivers.length === 0) return []

  const driverIds = drivers.map((d) => d.user_id_ulu)
  const medewerkerIds = drivers.map((d) => d.medewerker_id).filter((x): x is string => !!x)

  // 2. Ritten in de periode voor deze bestuurders.
  const trips = await pgQuery<TripRij>(
    `
    select id::text, user_id_ulu, start_datum::text, start_tijd::text, stop_tijd::text,
           adres_start, adres_stop, start_lat, start_lng, stop_lat, stop_lng
      from public.ulu_trips
     where user_id_ulu = any($1::bigint[])
       and start_datum between $2::date and $3::date
     order by user_id_ulu, start_datum, start_tijd
    `,
    [driverIds, van, tot],
  )

  // 3. Roosters, afwezigheid en PLANNING per medewerker.
  const roosters = medewerkerIds.length
    ? await pgQuery<RoosterRij>(
        `select medewerker_id::text, geldig_vanaf::text, geldig_tot::text,
                werkdagen, dagstart::text, dageind::text
           from public.medewerker_roosters
          where medewerker_id = any($1::uuid[])
          order by geldig_vanaf desc`,
        [medewerkerIds],
      )
    : []
  const afwezig = medewerkerIds.length
    ? await pgQuery<AfwezigRij>(
        `select medewerker_id::text, type::text, start_datum::text, eind_datum::text,
                start_tijd::text, eind_tijd::text
           from public.medewerker_afwezigheid
          where medewerker_id = any($1::uuid[])
            and start_datum <= $3::date and eind_datum >= $2::date`,
        [medewerkerIds, van, tot],
      )
    : []
  const planning = medewerkerIds.length
    ? await pgQuery<PlanningRij>(
        `
        select pi.medewerker_id::text as medewerker_id,
               (pi.start_dt at time zone 'Europe/Amsterdam')::date::text as start_dag,
               (pi.eind_dt  at time zone 'Europe/Amsterdam')::date::text as eind_dag,
               d.werkadres_straat, d.werkadres_huisnummer, d.werkadres_postcode, d.werkadres_stad,
               pa.locatie_adres
          from public.planning_items pi
          join public.planning_activiteiten pa on pa.id = pi.activiteit_id
          join public.dossiers d on d.id = pa.dossier_id
         where pi.medewerker_id = any($1::uuid[])
           and (pi.start_dt at time zone 'Europe/Amsterdam')::date <= $3::date
           and (pi.eind_dt   at time zone 'Europe/Amsterdam')::date >= $2::date
        `,
        [medewerkerIds, van, tot],
      )
    : []

  // Groepeer in maps.
  const tripsPerDriver = new Map<number, TripRij[]>()
  for (const t of trips) {
    const lijst = tripsPerDriver.get(t.user_id_ulu) ?? []
    lijst.push(t)
    tripsPerDriver.set(t.user_id_ulu, lijst)
  }
  const roostersPerMw = new Map<string, RoosterRij[]>()
  for (const r of roosters) {
    const lijst = roostersPerMw.get(r.medewerker_id) ?? []
    lijst.push(r)
    roostersPerMw.set(r.medewerker_id, lijst)
  }
  const afwezigPerMw = new Map<string, AfwezigRij[]>()
  for (const a of afwezig) {
    const lijst = afwezigPerMw.get(a.medewerker_id) ?? []
    lijst.push(a)
    afwezigPerMw.set(a.medewerker_id, lijst)
  }
  const planningPerMw = new Map<string, PlanningRij[]>()
  for (const p of planning) {
    const lijst = planningPerMw.get(p.medewerker_id) ?? []
    lijst.push(p)
    planningPerMw.set(p.medewerker_id, lijst)
  }

  // 4. Geocodeer alle distinct ingeplande werkadressen (cache). Map query → punt.
  const planAdresPunt = new Map<string, GeoPunt | null>()
  for (const p of planning) {
    const q = planAdresQuery(p)
    if (!q || planAdresPunt.has(q)) continue
    planAdresPunt.set(q, await geocodeQuery(q))
  }

  // 5. Verzamel per bestuurder de relevante plaatsen (woon + bedrijf + ingeplande steden)
  //    voor het plaats-voorfilter, en zorg dat rit-eindpunten daar coördinaten krijgen.
  const plaatsenPerDriver = new Map<number, Set<string>>()
  for (const d of drivers) {
    const set = new Set<string>()
    if (d.werk_plaats) set.add(d.werk_plaats)
    if (d.woon_plaats) set.add(d.woon_plaats)
    const planRows = d.medewerker_id ? planningPerMw.get(d.medewerker_id) ?? [] : []
    for (const p of planRows) {
      const stad = (p.werkadres_stad ?? plaatsUitAdres(p.locatie_adres) ?? '').trim().toLowerCase()
      if (stad) set.add(stad)
    }
    plaatsenPerDriver.set(d.user_id_ulu, set)
  }
  await verrijkTripCoordinaten(trips, plaatsenPerDriver)

  const alleDatums = datesInRange(van, tot)
  const resultaten: BestuurderResultaat[] = []

  for (const d of drivers) {
    const companyPunt: GeoPunt | null =
      d.werk_lat != null && d.werk_lng != null ? { lat: d.werk_lat, lng: d.werk_lng } : null
    const woonPunt: GeoPunt | null =
      d.woon_lat != null && d.woon_lng != null ? { lat: d.woon_lat, lng: d.woon_lng } : null

    // Werkpunten én straat|plaats-sleutels per dag uit de planning.
    const planRows = d.medewerker_id ? planningPerMw.get(d.medewerker_id) ?? [] : []
    const werkPuntenPerDatum = new Map<string, GeoPunt[]>()
    const werkSleutelsPerDatum = new Map<string, Set<string>>()
    for (const p of planRows) {
      const q = planAdresQuery(p)
      const punt = q ? planAdresPunt.get(q) ?? null : null
      const sleutel = straatPlaatsSleutel(p.werkadres_straat, p.werkadres_stad)
      if (!punt && !sleutel) continue
      const vanaf = maxDatum(p.start_dag, van)
      const totm = minDatum(p.eind_dag, tot)
      for (const datum of datesInRange(vanaf, totm)) {
        if (punt) {
          const lijst = werkPuntenPerDatum.get(datum) ?? []
          lijst.push(punt)
          werkPuntenPerDatum.set(datum, lijst)
        }
        if (sleutel) {
          const set = werkSleutelsPerDatum.get(datum) ?? new Set<string>()
          set.add(sleutel)
          werkSleutelsPerDatum.set(datum, set)
        }
      }
    }

    // Terugval-sleutels: bedrijfsadres en woonadres.
    const companySleutel = straatPlaatsSleutel(d.werk_straat, d.werk_plaats)
    const woonSleutel = straatPlaatsSleutel(d.woon_straat, d.woon_plaats)

    const driverTrips = tripsPerDriver.get(d.user_id_ulu) ?? []
    const tripsPerDag = new Map<string, TripRij[]>()
    for (const t of driverTrips) {
      const lijst = tripsPerDag.get(t.start_datum) ?? []
      lijst.push(t)
      tripsPerDag.set(t.start_datum, lijst)
    }

    const mwRoosters = d.medewerker_id ? roostersPerMw.get(d.medewerker_id) ?? [] : []
    const mwAfwezig = d.medewerker_id ? afwezigPerMw.get(d.medewerker_id) ?? [] : []

    const dagen: DagResultaat[] = []
    for (const datum of alleDatums) {
      dagen.push(
        analyseerDag(datum, tripsPerDag.get(datum) ?? [], {
          companyPunt,
          woonPunt,
          werkPuntenPerDatum,
          werkSleutelsPerDatum,
          companySleutel,
          woonSleutel,
          roosters: mwRoosters,
          afwezig: mwAfwezig,
          driver: d,
          config,
        }),
      )
    }

    const teLaatDagen = dagen.filter((x) => (x.te_laat_minuten ?? 0) > 0)
    const teVroegDagen = dagen.filter((x) => (x.te_vroeg_minuten ?? 0) > 0)
    const gewerkt = dagen.filter((x) => x.netto_minuten != null)
    const somNetto = gewerkt.reduce((s, x) => s + (x.netto_minuten ?? 0), 0)

    resultaten.push({
      user_id_ulu: d.user_id_ulu,
      volledige_naam: d.volledige_naam,
      medewerker_id: d.medewerker_id,
      auth_user_id: d.auth_user_id,
      heeft_werk_coord:
        companyPunt != null ||
        werkPuntenPerDatum.size > 0 ||
        werkSleutelsPerDatum.size > 0 ||
        companySleutel != null,
      heeft_woon_coord: woonPunt != null || woonSleutel != null,
      dagen,
      dagen_te_laat: teLaatDagen.length,
      dagen_te_vroeg: teVroegDagen.length,
      totaal_te_laat_minuten: teLaatDagen.reduce((s, x) => s + (x.te_laat_minuten ?? 0), 0),
      totaal_te_vroeg_minuten: teVroegDagen.reduce((s, x) => s + (x.te_vroeg_minuten ?? 0), 0),
      gewerkte_dagen: gewerkt.length,
      gemiddelde_netto_minuten: gewerkt.length ? Math.round(somNetto / gewerkt.length) : null,
    })
  }

  return resultaten
}

// --- Per-dag-analyse --------------------------------------------------------

type DagContext = {
  companyPunt: GeoPunt | null
  woonPunt: GeoPunt | null
  werkPuntenPerDatum: Map<string, GeoPunt[]>
  werkSleutelsPerDatum: Map<string, Set<string>>
  companySleutel: string | null
  woonSleutel: string | null
  roosters: RoosterRij[]
  afwezig: AfwezigRij[]
  driver: DriverRij
  config: WerktijdConfig
}

function verwachteTijden(
  datum: string,
  ctx: DagContext,
): { isWerkdag: boolean; start: string | null; eind: string | null } {
  const iso = isoWeekdag(datum)
  const rooster = ctx.roosters.find(
    (r) => r.geldig_vanaf <= datum && (r.geldig_tot == null || r.geldig_tot >= datum),
  )
  if (rooster) {
    const werkdag = Array.isArray(rooster.werkdagen) && rooster.werkdagen.includes(iso)
    return {
      isWerkdag: werkdag,
      start: werkdag ? rooster.dagstart.slice(0, 5) : null,
      eind: werkdag ? rooster.dageind.slice(0, 5) : null,
    }
  }
  const werkdag = iso >= 1 && iso <= 5
  return {
    isWerkdag: werkdag,
    start: werkdag ? ctx.driver.werktijd_start?.slice(0, 5) ?? null : null,
    eind: werkdag ? ctx.driver.werktijd_eind?.slice(0, 5) ?? null : null,
  }
}

function afwezigheidOpDag(datum: string, ctx: DagContext): AfwezigRij | null {
  return ctx.afwezig.find((a) => a.start_datum <= datum && a.eind_datum >= datum) ?? null
}

function analyseerDag(datum: string, trips: TripRij[], ctx: DagContext): DagResultaat {
  const { isWerkdag, start, eind } = verwachteTijden(datum, ctx)

  // Werkplek van de dag: ingeplande projectlocatie(s), anders het bedrijfsadres.
  // Zowel coördinaten (straal) als straat|plaats-sleutels tellen als referentie.
  const geplandeWerkPunten = ctx.werkPuntenPerDatum.get(datum) ?? []
  const geplandeWerkSleutels = ctx.werkSleutelsPerDatum.get(datum) ?? new Set<string>()
  const heeftPlanning = geplandeWerkPunten.length > 0 || geplandeWerkSleutels.size > 0

  const werkPunten = heeftPlanning
    ? geplandeWerkPunten
    : ctx.companyPunt
      ? [ctx.companyPunt]
      : []
  const werkSleutels = heeftPlanning
    ? geplandeWerkSleutels
    : new Set<string>(ctx.companySleutel ? [ctx.companySleutel] : [])

  const werkBron: WerkBron = heeftPlanning
    ? 'planning'
    : ctx.companyPunt || ctx.companySleutel
      ? 'bedrijf'
      : null

  const leeg = (status: DagStatus, afwezigheid: string | null = null): DagResultaat => ({
    datum,
    is_werkdag: isWerkdag,
    werk_bron: werkBron,
    verwacht_start: start,
    verwacht_eind: eind,
    aankomst_werk: null,
    vertrek_werk: null,
    vertrek_thuis: null,
    aankomst_thuis: null,
    netto_minuten: null,
    te_laat_minuten: null,
    te_vroeg_minuten: null,
    niet_op_locatie: false,
    afwezigheid,
    status,
  })

  if (!isWerkdag) return leeg('geen_werkdag')

  const afw = afwezigheidOpDag(datum, ctx)
  const heleDagAfwezig = afw != null && afw.start_tijd == null && afw.eind_tijd == null
  if (heleDagAfwezig) return leeg('afwezig', afw!.type)

  if (trips.length === 0) return leeg('geen_ritten')

  const werkStraal = ctx.config.straal_meter
  const thuisStraal = ctx.config.thuis_straal_meter

  // Match = binnen de straal ÓF zelfde straat+plaats. Dat tweede vangt de
  // straat-geocoding op: ULU geeft geen huisnummer, dus een lang straatmidden
  // kan buiten de straal vallen terwijl de rit wel degelijk op locatie was.
  const bijWerk = (adres: string | null, punt: GeoPunt | null): boolean => {
    if (punt && werkPunten.some((w) => afstandMeter(punt, w) <= werkStraal)) return true
    if (werkSleutels.size === 0) return false
    const k = tripSleutel(adres)
    return !!k && werkSleutels.has(k)
  }
  const bijThuis = (adres: string | null, punt: GeoPunt | null): boolean => {
    if (punt && ctx.woonPunt && afstandMeter(punt, ctx.woonPunt) <= thuisStraal) return true
    return !!ctx.woonSleutel && tripSleutel(adres) === ctx.woonSleutel
  }

  const startPunt = (t: TripRij): GeoPunt | null =>
    t.start_lat != null && t.start_lng != null ? { lat: t.start_lat, lng: t.start_lng } : null
  const stopPunt = (t: TripRij): GeoPunt | null =>
    t.stop_lat != null && t.stop_lng != null ? { lat: t.stop_lat, lng: t.stop_lng } : null

  const gesorteerd = [...trips].sort((a, b) => a.start_tijd.localeCompare(b.start_tijd))

  let aankomstWerk: string | null = null
  let vertrekWerk: string | null = null
  let vertrekThuis: string | null = null
  let aankomstThuis: string | null = null

  for (const t of gesorteerd) {
    if (aankomstWerk == null && bijWerk(t.adres_stop, stopPunt(t))) {
      aankomstWerk = (t.stop_tijd ?? t.start_tijd).slice(0, 5)
    }
    if (bijWerk(t.adres_start, startPunt(t))) {
      vertrekWerk = t.start_tijd.slice(0, 5)
    }
    if (vertrekThuis == null && bijThuis(t.adres_start, startPunt(t))) {
      vertrekThuis = t.start_tijd.slice(0, 5)
    }
    if (bijThuis(t.adres_stop, stopPunt(t))) {
      aankomstThuis = (t.stop_tijd ?? t.start_tijd).slice(0, 5)
    }
  }

  const nietOpLocatie = aankomstWerk == null && vertrekWerk == null

  const verwStart = parseHM(start)
  const verwEind = parseHM(eind)
  const aankMin = parseHM(aankomstWerk)
  const vertMin = parseHM(vertrekWerk)

  let teLaat: number | null = null
  let teVroeg: number | null = null
  if (!afw) {
    if (verwStart != null && aankMin != null) {
      const diff = aankMin - (verwStart + ctx.config.marge_aankomst_min)
      teLaat = diff > 0 ? diff : 0
    }
    if (verwEind != null && vertMin != null) {
      const diff = verwEind - ctx.config.marge_vertrek_min - vertMin
      teVroeg = diff > 0 ? diff : 0
    }
  }

  const nettoMin =
    aankMin != null && vertMin != null && vertMin >= aankMin ? vertMin - aankMin : null

  let status: DagStatus = 'ok'
  if (nietOpLocatie) status = 'niet_op_locatie'
  else if ((teLaat ?? 0) > 0 && (teVroeg ?? 0) > 0) status = 'te_laat_en_vroeg'
  else if ((teLaat ?? 0) > 0) status = 'te_laat'
  else if ((teVroeg ?? 0) > 0) status = 'te_vroeg'

  return {
    datum,
    is_werkdag: true,
    werk_bron: werkBron,
    verwacht_start: start,
    verwacht_eind: eind,
    aankomst_werk: aankomstWerk,
    vertrek_werk: vertrekWerk,
    vertrek_thuis: vertrekThuis,
    aankomst_thuis: aankomstThuis,
    netto_minuten: nettoMin,
    te_laat_minuten: teLaat,
    te_vroeg_minuten: teVroeg,
    niet_op_locatie: nietOpLocatie,
    afwezigheid: afw?.type ?? null,
    status,
  }
}

// --- Ingeplande werkadres → geocode-query -----------------------------------

/**
 * Bouw een geocode-query voor een ingeplande locatie: primair het
 * dossier-werkadres; is dat leeg, dan de vrije `locatie_adres` van de activiteit.
 */
function planAdresQuery(p: PlanningRij): string | null {
  const straat = [p.werkadres_straat, p.werkadres_huisnummer]
    .filter((x) => x && x.trim())
    .join(' ')
    .trim()
  const q = adresQuery(straat || null, p.werkadres_postcode, p.werkadres_stad)
  if (q) return q
  if (p.locatie_adres && p.locatie_adres.trim()) {
    return `${p.locatie_adres.replace(/\(.*?\)/g, '').trim()}, Nederland`
  }
  return null
}

// --- Trip-coördinaten verrijken (plaats-voorfilter + geocode + cache) -------

/**
 * Vul ontbrekende rit-coördinaten voor eindpunten waarvan de PLAATS overeenkomt
 * met een relevante plaats van de bestuurder (woon-, bedrijfs- of ingeplande
 * projectplaats). Zo geocoden we niet duizenden irrelevante adressen, maar
 * alleen de kandidaten voor "op locatie". Resultaat wordt teruggeschreven naar
 * ulu_trips (self-warming) én in het meegegeven trips-array bijgewerkt.
 */
async function verrijkTripCoordinaten(
  trips: TripRij[],
  plaatsenPerDriver: Map<number, Set<string>>,
): Promise<void> {
  for (const t of trips) {
    const plaatsen = plaatsenPerDriver.get(t.user_id_ulu)
    if (!plaatsen || plaatsen.size === 0) continue

    if (t.start_lat == null && t.adres_start) {
      const plaats = plaatsUitAdres(t.adres_start)
      if (plaats && plaatsen.has(plaats)) {
        const punt = await geocodeQuery(geocodeQueryVoorRit(t.adres_start))
        if (punt) {
          t.start_lat = punt.lat
          t.start_lng = punt.lng
          await pgQuery(
            `update public.ulu_trips set start_lat = $2, start_lng = $3 where id = $1`,
            [t.id, punt.lat, punt.lng],
          )
        }
      }
    }
    if (t.stop_lat == null && t.adres_stop) {
      const plaats = plaatsUitAdres(t.adres_stop)
      if (plaats && plaatsen.has(plaats)) {
        const punt = await geocodeQuery(geocodeQueryVoorRit(t.adres_stop))
        if (punt) {
          t.stop_lat = punt.lat
          t.stop_lng = punt.lng
          await pgQuery(
            `update public.ulu_trips set stop_lat = $2, stop_lng = $3 where id = $1`,
            [t.id, punt.lat, punt.lng],
          )
        }
      }
    }
  }
}

/** Maak van een ULU-rit-adres ("Road, Plaats") een geocode-query in NL-context. */
function geocodeQueryVoorRit(adres: string): string {
  const zonderLand = adres.replace(/\(.*?\)/g, '').trim()
  return `${zonderLand}, Nederland`
}
