/**
 * Werkgeheugen van de calculatiemodule (calculatie, meetstaat, werkbegroting).
 *
 * Bewust géén localStorage meer: gegevens die alleen op één apparaat staan lopen
 * uit de pas met de rest van EVA — een collega of een tweede browser zag iets
 * anders, of niets. De bron van waarheid is Supabase. Dit bestand is puur de
 * synchrone werkkopie van één sessie: bij het openen van een calculatie/werk-
 * begroting wordt hij gevuld door hydrateCalculatie()/hydrateWerkbegroting(), en
 * elke wijziging wordt door het scherm weer naar Supabase weggeschreven.
 *
 * Gevolg: wat niet is opgeslagen, overleeft een harde herlaadbeurt niet. De
 * schermen slaan daarom automatisch op (debounce + flush bij wegnavigeren) en
 * waarschuwen bij het sluiten met openstaande wijzigingen.
 */
import type {
  Scenario,
  Groep, Calculatieregel, Componentregel, Instellingen, EenheidConfig,
  Meetstaat, Meetregel, MeetregelAggregaat,
  Werkbegroting, WerkbegrotingRegel, WerkbegrotingComponent,
  WerkbegrotingWijziging, WerkbegrotingBestelling,
} from './types'
import { isTekstregel } from './types'
import { nieuweId } from './utils'

const KEYS = {
  werkbegrotingen: 'werkbegrotingen',
  werkbegroting_regels: 'werkbegroting_regels',
  werkbegroting_componenten: 'werkbegroting_componenten',
  werkbegroting_wijzigingen: 'werkbegroting_wijzigingen',
  werkbegroting_bestellingen: 'werkbegroting_bestellingen',
  scenarios: 'scenarios',
  groepen: 'groepen',
  calculatieregels: 'calculatieregels',
  componentregels: 'componentregels',
  meetstaten: 'meetstaten',
  meetregels: 'meetregels',
  meetregel_aggregaten: 'meetregel_aggregaten',
}

// Standaard-eenheden met afkorting + volledige omschrijving.
// 'STP' (Stelpost) en 'VRR' (Verrekenbaar) zetten automatisch het bijbehorende vinkje aan.
const STANDAARD_EENHEDEN: EenheidConfig[] = [
  { afkorting: 'm²',  omschrijving: 'Vierkante meter' },
  { afkorting: 'm¹',  omschrijving: 'Strekkende meter' },
  { afkorting: 'st',  omschrijving: 'Stuks' },
  { afkorting: 'uur', omschrijving: 'Uur' },
  { afkorting: 'dag', omschrijving: 'Dag' },
  { afkorting: 'm³',  omschrijving: 'Kubieke meter' },
  { afkorting: 'ltr', omschrijving: 'Liter' },
  { afkorting: 'kg',  omschrijving: 'Kilogram' },
  { afkorting: 'set', omschrijving: 'Set' },
  { afkorting: 'STP', omschrijving: 'Stelpost' },
  { afkorting: 'VRR', omschrijving: 'Verrekenbaar' },
]

const STANDAARD_INSTELLINGEN: Instellingen = {
  // BTW-tarieven staan hier bewust niet meer: die komen uit de stamgegevenstabel
  // `btw_tarieven` (afgeleid uit Bouw7). Een kopie hier liep onvermijdelijk uit de pas.
  // Uurtarieven komen uit EVA → Bedrijfsinstellingen → Planning (geen demo-data hier).
  uurtarieven: [],
  eenheden: STANDAARD_EENHEDEN,
  categorieen: ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig'],
  categorieCodes: {
    Schilderwerk: 'SC', Timmerwerk: 'TI', Metselwerk: 'ME',
    Dakwerk: 'DA', Voegwerk: 'VO', Overig: 'OV',
  },
}

/** Normaliseert eenheden: oude opslag was string[] → converteer naar EenheidConfig[]. */
function normaliseerEenheden(raw: unknown): EenheidConfig[] {
  if (!Array.isArray(raw)) return STANDAARD_EENHEDEN
  const uit: EenheidConfig[] = []
  for (const e of raw) {
    if (typeof e === 'string') {
      const s = e.trim()
      if (s) uit.push({ afkorting: s, omschrijving: s })
    } else if (e && typeof e === 'object' && typeof (e as EenheidConfig).afkorting === 'string') {
      const c = e as EenheidConfig
      uit.push({ afkorting: c.afkorting.trim(), omschrijving: (c.omschrijving ?? '').trim() || c.afkorting.trim() })
    }
  }
  return uit.length ? uit : STANDAARD_EENHEDEN
}

/** Normaliseert een ruwe Instellingen (zoals hij uit Supabase komt). */
function normaliseerInstellingen(raw: Partial<Instellingen> | null | undefined): Instellingen {
  // Vervallen sleutel opruimen zodat de oude percentagelijst niet blijft rondzwerven.
  const { btw_tarieven: _vervallen, ...rest } = (raw ?? {}) as Partial<Instellingen> & { btw_tarieven?: unknown }
  return {
    ...STANDAARD_INSTELLINGEN,
    ...rest,
    eenheden: normaliseerEenheden(raw?.eenheden),
  }
}

// Werkgeheugen van deze sessie. Op de server (SSR van client-componenten) leest en
// schrijft dit niets: anders zou de module-state tussen requests gedeeld worden.
const _geheugen = new Map<string, unknown[]>()

function lees<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback
  return (_geheugen.get(key) as T[] | undefined) ?? fallback
}

function sla<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return
  _geheugen.set(key, data)
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

export function getScenarios(project_id?: string): Scenario[] {
  const alle = lees<Scenario>(KEYS.scenarios, [])
  return project_id ? alle.filter(s => s.project_id === project_id) : alle
}

export function getScenario(id: string): Scenario | undefined {
  return getScenarios().find(s => s.id === id)
}

export function slaScenarioOp(scenario: Scenario): void {
  const lijst = getScenarios().filter(s => s.id !== scenario.id)
  sla(KEYS.scenarios, [...lijst, scenario])
}

export function verwijderScenario(id: string): void {
  sla(KEYS.scenarios, getScenarios().filter(s => s.id !== id))
}

export function maakStandaardScenario(project_id: string): Scenario {
  const bestaand = getScenarios(project_id)
  if (bestaand.length > 0) return bestaand.find(s => s.is_standaard) || bestaand[0]

  const inst = getInstellingen()
  const favorietTarief = inst.uurtarieven?.find(t => t.is_favoriet)?.tarief

  const nieuw: Scenario = {
    id: nieuweId(),
    project_id,
    naam: 'Basisvariant',
    is_standaard: true,
    opslag_pct: 0,
    btw_pct_default: 21,
    standaard_uurtarief: favorietTarief,
  }
  slaScenarioOp(nieuw)
  return nieuw
}

/**
 * Dupliceert een scenario (calculatie) volledig: het scenario zelf (incl.
 * opslagen, betalingsconditie en algemene voorwaarden) plus de hele boom
 * groepen → calculatieregels → componentregels, met verse id's en geremapte
 * parent/foreign-keys. De kopie is nooit de standaard. Retourneert het nieuwe
 * scenario (of null als het bronscenario niet bestaat).
 */
export function kopieerScenario(scenarioId: string, naam?: string): Scenario | null {
  const bron = getScenario(scenarioId)
  if (!bron) return null

  const nieuwScenario: Scenario = {
    ...bron,
    id: nieuweId(),
    naam: naam ?? `Kopie van ${bron.naam}`,
    is_standaard: false,
    nummer: null,       // kopie krijgt een eigen offertenummer (niet dat van de bron)
    bevroren_op: null,  // een kopie is altijd weer bewerkbaar concept
  }
  slaScenarioOp(nieuwScenario)

  // Groepen kopiëren; eerst alle nieuwe id's bepalen zodat parent_id remapt.
  const bronGroepen = getGroepen(scenarioId)
  const groepIdMap = new Map<string, string>()
  for (const g of bronGroepen) groepIdMap.set(g.id, nieuweId())
  for (const g of bronGroepen) {
    slaGroepOp({
      ...g,
      id: groepIdMap.get(g.id)!,
      scenario_id: nieuwScenario.id,
      parent_id: g.parent_id ? (groepIdMap.get(g.parent_id) ?? null) : null,
    })
  }

  // Calculatieregels + componentregels kopiëren met geremapte foreign-keys.
  for (const g of bronGroepen) {
    for (const r of getCalculatieregels(g.id)) {
      const nieuweRegelId = nieuweId()
      slaCalculatieregelOp({ ...r, id: nieuweRegelId, groep_id: groepIdMap.get(g.id)! })
      for (const c of getComponentregels(r.id)) {
        slaComponentregelOp({ ...c, id: nieuweId(), calculatieregel_id: nieuweRegelId })
      }
    }
  }

  return nieuwScenario
}

// ─── Groepen (nieuwe structuur) ───────────────────────────────────────────────

export function getGroepen(scenario_id?: string): Groep[] {
  const alle = lees<Groep>(KEYS.groepen, [])
  return scenario_id ? alle.filter(g => g.scenario_id === scenario_id) : alle
}

export function slaGroepOp(groep: Groep): void {
  const lijst = getGroepen().filter(g => g.id !== groep.id)
  sla(KEYS.groepen, [...lijst, groep])
}

export function verwijderGroep(id: string): void {
  // Cascade: verwijder subgroepen, calculatieregels + componentregels
  const kinderen = getGroepen().filter(g => g.parent_id === id)
  kinderen.forEach(k => verwijderGroep(k.id))
  const regels = getCalculatieregels(id)
  regels.forEach(r => verwijderCalculatieregel(r.id))
  sla(KEYS.groepen, getGroepen().filter(g => g.id !== id))
}

export function hernodigGroepen(scenario_id: string): void {
  // Herbereken volgorde na drag & drop (wordt buiten aangeroepen)
  // No-op placeholder — volgorde wordt direct per groep opgeslagen
}

// ─── Calculatieregels (nieuwe structuur) ──────────────────────────────────────

export function getCalculatieregels(groep_id?: string): Calculatieregel[] {
  const alle = lees<Calculatieregel>(KEYS.calculatieregels, [])
  return groep_id ? alle.filter(r => r.groep_id === groep_id) : alle
}

export function getCalculatieregelsVoorScenario(scenario_id: string): Calculatieregel[] {
  const groepIds = new Set(getGroepen(scenario_id).map(g => g.id))
  return getCalculatieregels().filter(r => groepIds.has(r.groep_id))
}

export function slaCalculatieregelOp(regel: Calculatieregel): void {
  const lijst = getCalculatieregels().filter(r => r.id !== regel.id)
  sla(KEYS.calculatieregels, [...lijst, regel])
}

export function verwijderCalculatieregel(id: string): void {
  // Cascade: verwijder componentregels
  sla(KEYS.componentregels, getComponentregels().filter(c => c.calculatieregel_id !== id))
  sla(KEYS.calculatieregels, getCalculatieregels().filter(r => r.id !== id))
}

/**
 * Vult het werkgeheugen met de gedeelde calculatie van een project uit Supabase
 * (verliesloze JSONB-snapshot). Supabase is de bron van waarheid; deze functie
 * vervangt álle rijen van dit project (scenario's, groepen, calculatieregels,
 * componentregels én de meetstaten) door de server-versie, zodat elke gebruiker/
 * elk apparaat exact hetzelfde ziet. Aan te roepen bij het openen van de
 * calculatie, vóór het grid rendert. Spiegelt hydrateWerkbegroting().
 */
export function hydrateCalculatie(
  projectId: string,
  snapshot: {
    scenarios: Scenario[]; groepen: Groep[]; regels: Calculatieregel[]; componenten: Componentregel[]
    meetstaten?: Meetstaat[]; meetregels?: Meetregel[]; meetregel_aggregaten?: MeetregelAggregaat[]
  }
): void {
  if (typeof window === 'undefined') return
  const { scenarios, groepen, regels, componenten } = snapshot

  // Bepaal — vóór het schrijven — welke id's bij dit project horen: oud (lokaal)
  // én nieuw (server). Zo ruimen we ook server-verwijderde rijen lokaal op.
  const projectScenarioIds = new Set<string>([
    ...getScenarios(projectId).map(s => s.id),
    ...scenarios.map(s => s.id),
  ])
  const projectGroepIds = new Set<string>([
    ...getGroepen().filter(g => projectScenarioIds.has(g.scenario_id)).map(g => g.id),
    ...groepen.map(g => g.id),
  ])
  const projectRegelIds = new Set<string>([
    ...getCalculatieregels().filter(r => projectGroepIds.has(r.groep_id)).map(r => r.id),
    ...regels.map(r => r.id),
  ])

  sla(KEYS.scenarios,        [...getScenarios().filter(s => s.project_id !== projectId), ...scenarios])
  sla(KEYS.groepen,          [...getGroepen().filter(g => !projectScenarioIds.has(g.scenario_id)), ...groepen])
  sla(KEYS.calculatieregels, [...getCalculatieregels().filter(r => !projectGroepIds.has(r.groep_id)), ...regels])
  sla(KEYS.componentregels,  [...getComponentregels().filter(c => !projectRegelIds.has(c.calculatieregel_id)), ...componenten])

  // Meetstaten horen bij hetzelfde project en reizen mee in de snapshot; oudere
  // snapshots hebben ze nog niet (dan blijft de meetstaat van dit project leeg).
  const meetstaten = snapshot.meetstaten ?? []
  const projectMeetstaatIds = new Set<string>([
    ...getMeetstaten().filter(m => m.project_id === projectId).map(m => m.id),
    ...meetstaten.map(m => m.id),
  ])
  sla(KEYS.meetstaten, [
    ...getMeetstaten().filter(m => m.project_id !== projectId),
    ...meetstaten,
  ])
  sla(KEYS.meetregels, [
    ...getMeetregels().filter(r => !projectMeetstaatIds.has(r.meetstaat_id)),
    ...(snapshot.meetregels ?? []),
  ])
  sla(KEYS.meetregel_aggregaten, [
    ...getMeetregelAggregaten().filter(a => !projectMeetstaatIds.has(a.meetstaat_id)),
    ...(snapshot.meetregel_aggregaten ?? []),
  ])
}

// ─── Undo snapshot (nieuwe structuur) ────────────────────────────────────────

/** Herstel een volledig calculatie-snapshot voor een scenario (voor undo). */
export function herstelSnapshot(
  scenarioId: string,
  groepen: Groep[],
  regels: Calculatieregel[],
  componenten: Componentregel[]
): void {
  const andereGroepen    = getGroepen().filter(g => g.scenario_id !== scenarioId)
  const groepIds         = new Set(groepen.map(g => g.id))
  const andereRegels     = getCalculatieregels().filter(r => !groepIds.has(r.groep_id))
  const regelIds         = new Set(regels.map(r => r.id))
  const andereComponenten = getComponentregels().filter(c => !regelIds.has(c.calculatieregel_id))
  sla(KEYS.groepen,       [...andereGroepen, ...groepen])
  sla(KEYS.calculatieregels, [...andereRegels, ...regels])
  sla(KEYS.componentregels,  [...andereComponenten, ...componenten])
}

// ─── Componentregels (nieuwe structuur) ───────────────────────────────────────

export function getComponentregels(calculatieregel_id?: string): Componentregel[] {
  const alle = lees<Componentregel>(KEYS.componentregels, [])
  return calculatieregel_id ? alle.filter(c => c.calculatieregel_id === calculatieregel_id) : alle
}

export function getComponentregelsVoorScenario(scenario_id: string): Componentregel[] {
  const regelIds = new Set(getCalculatieregelsVoorScenario(scenario_id).map(r => r.id))
  return getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))
}

export function slaComponentregelOp(comp: Componentregel): void {
  const lijst = getComponentregels().filter(c => c.id !== comp.id)
  sla(KEYS.componentregels, [...lijst, comp])
}

export function upsertComponentregel(
  calculatieregel_id: string,
  type: Componentregel['type'],
  norm_hoeveelheid: number,
  tarief: number
): void {
  const bestaand = getComponentregels(calculatieregel_id).find(c => c.type === type)
  // Patchen, niet opnieuw opbouwen: de snelinvoerkolommen in het rekenblad kennen alleen
  // norm en tarief. Bouwde je het component hier van nul op, dan wiste één tik in de
  // prijskolom stilzwijgend de eenheid, omschrijving, leverancier, aannemersnaam,
  // offertenummer en de eigen opslag van de detailregel eronder.
  const comp: Componentregel = {
    ...bestaand,
    id: bestaand?.id ?? nieuweId(),
    calculatieregel_id,
    type,
    norm_hoeveelheid,
    tarief,
  }
  slaComponentregelOp(comp)
}

export function verwijderComponentregel(id: string): void {
  sla(KEYS.componentregels, getComponentregels().filter(c => c.id !== id))
}

export function voegComponentregelToe(
  calculatieregel_id: string,
  type: Componentregel['type']
): Componentregel {
  const comp: Componentregel = { id: nieuweId(), calculatieregel_id, type, norm_hoeveelheid: type === 'arbeid' ? 0 : 1, tarief: 0 }
  slaComponentregelOp(comp)
  return comp
}

// ─── Kostprijs berekening nieuwe structuur ────────────────────────────────────

export function berekenScenarioKostprijsNieuw(scenario_id: string): number {
  const regels    = getCalculatieregelsVoorScenario(scenario_id)
  const comps     = getComponentregelsVoorScenario(scenario_id)
  return regels.reduce((totaal, regel) => {
    const regelComps = comps.filter(c => c.calculatieregel_id === regel.id)
    const kp_pe = regelComps.reduce((s, c) => s + c.norm_hoeveelheid * c.tarief, 0)
    return totaal + kp_pe * regel.hoeveelheid
  }, 0)
}

// ─── Instellingen ─────────────────────────────────────────────────────────────

// In-memory cache zodat getInstellingen() synchroon blijft. Bron van waarheid is
// Supabase. De cache wordt gevuld door hydrateInstellingen() (bij opstart, vanuit
// de platform-layout) en door slaInstellingenOp().
//
// De cache is tegelijk een mini-store: componenten die eenheden/categorieën tonen
// abonneren zich via useInstellingen() (zie use-instellingen.ts). Zonder abonnement
// leest een component de waarde bij de eerste render en mist het de hydratie die
// een tel later uit Supabase binnenkomt.
let _instellingenCache: Instellingen | null = null

const _luisteraars = new Set<() => void>()

/** Abonneer op wijzigingen in de instellingen. Retourneert een opzeg-functie. */
export function subscribeInstellingen(fn: () => void): () => void {
  _luisteraars.add(fn)
  return () => { _luisteraars.delete(fn) }
}

function meldWijziging(): void {
  for (const fn of _luisteraars) fn()
}

export function getInstellingen(): Instellingen {
  if (typeof window === 'undefined') return STANDAARD_INSTELLINGEN
  // Vóór de hydratie uit Supabase: de standaardlijst. Componenten die de
  // instellingen tonen gebruiken useInstellingen() en renderen opnieuw zodra de
  // echte lijst binnen is.
  return _instellingenCache ?? STANDAARD_INSTELLINGEN
}

/** Stabiele snapshot voor server-rendering (useSyncExternalStore vereist referentie-gelijkheid). */
export function getInstellingenServerSnapshot(): Instellingen {
  return STANDAARD_INSTELLINGEN
}

/** Vul de cache met instellingen uit Supabase (aangeroepen bij opstart). */
export function hydrateInstellingen(raw: Partial<Instellingen> | null): void {
  if (typeof window === 'undefined') return
  _instellingenCache = normaliseerInstellingen(raw)
  meldWijziging()
}

// Optionele persist-callback (Supabase). Wordt gezet door de client-provider zodat
// local-store geen directe afhankelijkheid op de server-action heeft.
let _persist: ((inst: Instellingen) => Promise<void>) | null = null
export function setInstellingenPersister(fn: (inst: Instellingen) => Promise<void>): void {
  _persist = fn
}

/**
 * Schrijft de instellingen weg. De cache wordt meteen bijgewerkt zodat de UI
 * responsief blijft; daarna volgt Supabase. Faalt die schrijfactie, dan gooit deze
 * functie — de aanroeper hoort dat als fout te tonen en mag niet "opgeslagen"
 * melden, anders denkt de gebruiker dat de wijziging bewaard is terwijl alleen deze
 * sessie hem kent.
 */
export async function slaInstellingenOp(inst: Instellingen): Promise<void> {
  if (typeof window === 'undefined') return
  const genormaliseerd = normaliseerInstellingen(inst)
  _instellingenCache = genormaliseerd
  meldWijziging()
  if (!_persist) {
    throw new Error('Instellingen konden niet centraal worden opgeslagen (geen verbinding met de server).')
  }
  await _persist(genormaliseerd)
}

// ─── MEETSTATEN ──────────────────────────────────────────────────────────────

export function getMeetstaten(scenario_id?: string): Meetstaat[] {
  const alle = lees<Meetstaat>(KEYS.meetstaten, [])
  return scenario_id ? alle.filter(m => m.scenario_id === scenario_id) : alle
}

export function getMeetstaat(id: string): Meetstaat | undefined {
  return getMeetstaten().find(m => m.id === id)
}

export function slaMeetstaatOp(ms: Meetstaat): void {
  const lijst = getMeetstaten().filter(m => m.id !== ms.id)
  sla(KEYS.meetstaten, [...lijst, { ...ms, aangepast_op: new Date().toISOString() }])
}

export function verwijderMeetstaat(id: string): void {
  sla(KEYS.meetstaten, getMeetstaten().filter(m => m.id !== id))
  sla(KEYS.meetregels, getMeetregels().filter(r => r.meetstaat_id !== id))
  sla(KEYS.meetregel_aggregaten, getMeetregelAggregaten().filter(a => a.meetstaat_id !== id))
}

export function maakNieuweMeetstaat(project_id: string, scenario_id: string): Meetstaat {
  const bestaande = getMeetstaten(scenario_id)
  const volgnr = bestaande.length + 1
  const nu = new Date().toISOString()
  const ms: Meetstaat = {
    id: nieuweId(),
    project_id,
    scenario_id,
    naam: `Meetstaat ${volgnr}`,
    code: `MS-${new Date().getFullYear()}-${String(volgnr).padStart(3, '0')}`,
    status: 'concept',
    aangemaakt_op: nu,
    aangepast_op: nu,
  }
  slaMeetstaatOp(ms)
  return ms
}

// ─── MEETREGELS ──────────────────────────────────────────────────────────────

export function getMeetregels(meetstaat_id?: string): Meetregel[] {
  const alle = lees<Meetregel>(KEYS.meetregels, [])
  return meetstaat_id ? alle.filter(r => r.meetstaat_id === meetstaat_id) : alle
}

export function slaMeetregelOp(mr: Meetregel): void {
  const lijst = getMeetregels().filter(r => r.id !== mr.id)
  sla(KEYS.meetregels, [...lijst, { ...mr, aangepast_op: new Date().toISOString() }])
}

export function verwijderMeetregel(id: string): void {
  sla(KEYS.meetregels, getMeetregels().filter(r => r.id !== id))
}

// ─── MEETREGEL AGGREGATEN ────────────────────────────────────────────────────

export function getMeetregelAggregaten(meetstaat_id?: string): MeetregelAggregaat[] {
  const alle = lees<MeetregelAggregaat>(KEYS.meetregel_aggregaten, [])
  return meetstaat_id ? alle.filter(a => a.meetstaat_id === meetstaat_id) : alle
}

export function slaMeetregelAggregaatOp(agg: MeetregelAggregaat): void {
  const lijst = getMeetregelAggregaten().filter(a => a.id !== agg.id)
  sla(KEYS.meetregel_aggregaten, [...lijst, { ...agg, aangepast_op: new Date().toISOString() }])
}

export function verwijderMeetregelAggregaat(id: string): void {
  sla(KEYS.meetregel_aggregaten, getMeetregelAggregaten().filter(a => a.id !== id))
}

// ─── WERKBEGROTINGEN ──────────────────────────────────────────────────────────

export function getWerkbegrotingen(project_id?: string): Werkbegroting[] {
  const alle = lees<Werkbegroting>(KEYS.werkbegrotingen, [])
  return project_id ? alle.filter(w => w.project_id === project_id) : alle
}

export function getWerkbegroting(id: string): Werkbegroting | undefined {
  return getWerkbegrotingen().find(w => w.id === id)
}

export function getWerkbegrotingVoorScenario(scenario_id: string): Werkbegroting | undefined {
  return getWerkbegrotingen().find(w => w.scenario_id === scenario_id)
}

export function slaWerkbegrotingOp(wb: Werkbegroting): void {
  const lijst = getWerkbegrotingen().filter(w => w.id !== wb.id)
  sla(KEYS.werkbegrotingen, [...lijst, { ...wb, bijgewerkt_op: new Date().toISOString() }])
}

export function verwijderWerkbegroting(id: string): void {
  sla(KEYS.werkbegrotingen, getWerkbegrotingen().filter(w => w.id !== id))
  getWerkbegrotingRegels(id).forEach(r => verwijderWerkbegrotingRegel(r.id))
  sla(KEYS.werkbegroting_bestellingen, getWerkbegrotingBestellingen().filter(b => b.werkbegroting_id !== id))
  // Volledige wijzigingshistorie (incl. historie van verwijderde regels) van deze WB leegmaken.
  const alleWijzigingen = lees<WerkbegrotingWijziging>(KEYS.werkbegroting_wijzigingen, [])
  sla(KEYS.werkbegroting_wijzigingen, alleWijzigingen.filter(w => w.werkbegroting_id !== id))
}

/**
 * Vult het werkgeheugen met een gedeelde werkbegroting uit Supabase.
 * Supabase is de bron van waarheid; deze functie vervangt álle lokale rijen van
 * deze werkbegroting (regels, componenten, wijzigingen, bestellingen) door de
 * server-versie zodat elke gebruiker/elk apparaat exact hetzelfde ziet. Wordt
 * aangeroepen bij het openen van de werkbegroting, vóór het grid rendert.
 */
export function hydrateWerkbegroting(snapshot: {
  wb: Werkbegroting
  regels: WerkbegrotingRegel[]
  componenten: WerkbegrotingComponent[]
  wijzigingen: WerkbegrotingWijziging[]
  bestellingen: WerkbegrotingBestelling[]
}): void {
  if (typeof window === 'undefined') return
  const { wb, regels, componenten, wijzigingen, bestellingen } = snapshot

  // Header
  const andereWb = getWerkbegrotingen().filter(w => w.id !== wb.id)
  sla(KEYS.werkbegrotingen, [...andereWb, wb])

  // Regels — vervang alle regels van deze WB.
  const andereRegels = getWerkbegrotingRegels().filter(r => r.werkbegroting_id !== wb.id)
  sla(KEYS.werkbegroting_regels, [...andereRegels, ...regels])

  // Componenten — vervang alle componenten die bij regels van deze WB horen.
  const regelIds = new Set(regels.map(r => r.id))
  const andereComps = getWerkbegrotingComponenten().filter(c => !regelIds.has(c.werkbegroting_regel_id))
  sla(KEYS.werkbegroting_componenten, [...andereComps, ...componenten])

  // Wijzigingen (audit) — vervang de historie van deze WB.
  const andereWijz = lees<WerkbegrotingWijziging>(KEYS.werkbegroting_wijzigingen, [])
    .filter(w => w.werkbegroting_id !== wb.id)
  sla(KEYS.werkbegroting_wijzigingen, [...andereWijz, ...wijzigingen])

  // Bestellingen — vervang de bestellingen van deze WB.
  const andereBest = getWerkbegrotingBestellingen().filter(b => b.werkbegroting_id !== wb.id)
  sla(KEYS.werkbegroting_bestellingen, [...andereBest, ...bestellingen])
}

// ─── WERKBEGROTING REGELS ────────────────────────────────────────────────────

export function getWerkbegrotingRegels(werkbegroting_id?: string): WerkbegrotingRegel[] {
  const alle = lees<WerkbegrotingRegel>(KEYS.werkbegroting_regels, [])
  return werkbegroting_id ? alle.filter(r => r.werkbegroting_id === werkbegroting_id) : alle
}

export function slaWerkbegrotingRegelOp(r: WerkbegrotingRegel): void {
  const lijst = getWerkbegrotingRegels().filter(x => x.id !== r.id)
  sla(KEYS.werkbegroting_regels, [...lijst, r])
}

export function verwijderWerkbegrotingRegel(id: string): void {
  getWerkbegrotingComponenten(id).forEach(c => verwijderWerkbegrotingComponent(c.id))
  sla(KEYS.werkbegroting_regels, getWerkbegrotingRegels().filter(r => r.id !== id))
}

// ─── WERKBEGROTING COMPONENTEN ───────────────────────────────────────────────

export function getWerkbegrotingComponenten(werkbegroting_regel_id?: string): WerkbegrotingComponent[] {
  const alle = lees<WerkbegrotingComponent>(KEYS.werkbegroting_componenten, [])
  return werkbegroting_regel_id ? alle.filter(c => c.werkbegroting_regel_id === werkbegroting_regel_id) : alle
}

export function slaWerkbegrotingComponentOp(c: WerkbegrotingComponent): void {
  const lijst = getWerkbegrotingComponenten().filter(x => x.id !== c.id)
  sla(KEYS.werkbegroting_componenten, [...lijst, c])
}

export function verwijderWerkbegrotingComponent(id: string): void {
  sla(KEYS.werkbegroting_componenten, getWerkbegrotingComponenten().filter(c => c.id !== id))
}

// ─── WERKBEGROTING WIJZIGINGEN (append-only auditlog) ────────────────────────

export function getWerkbegrotingWijzigingen(werkbegroting_regel_id?: string): WerkbegrotingWijziging[] {
  const alle = lees<WerkbegrotingWijziging>(KEYS.werkbegroting_wijzigingen, [])
  return werkbegroting_regel_id
    ? alle.filter(w => w.werkbegroting_regel_id === werkbegroting_regel_id)
    : alle
}

export function voegWijzigingToe(wijziging: WerkbegrotingWijziging): void {
  const alle = lees<WerkbegrotingWijziging>(KEYS.werkbegroting_wijzigingen, [])
  sla(KEYS.werkbegroting_wijzigingen, [...alle, wijziging])
}

// ─── WERKBEGROTING BESTELLINGEN ───────────────────────────────────────────────

export function getWerkbegrotingBestellingen(werkbegroting_id?: string): WerkbegrotingBestelling[] {
  const alle = lees<WerkbegrotingBestelling>(KEYS.werkbegroting_bestellingen, [])
  return werkbegroting_id ? alle.filter(b => b.werkbegroting_id === werkbegroting_id) : alle
}

export function slaBestellingOp(b: WerkbegrotingBestelling): void {
  const lijst = getWerkbegrotingBestellingen().filter(x => x.id !== b.id)
  sla(KEYS.werkbegroting_bestellingen, [...lijst, b])
}

export function verwijderBestelling(id: string): void {
  sla(KEYS.werkbegroting_bestellingen, getWerkbegrotingBestellingen().filter(b => b.id !== id))
}

// ─── WERKBEGROTING AANMAKEN VANUIT CALCULATIE ─────────────────────────────────
// Kopieert alle calculatieregels en componenten; hoeveelheid wordt bevroren.
// Kan alleen aangemaakt worden als de offerte de status 'gewonnen' heeft.

export function maakWerkbegrotingVanCalculatie(
  projectId: string,
  scenarioId: string
): Werkbegroting {
  const bestaand = getWerkbegrotingVoorScenario(scenarioId)
  if (bestaand) return bestaand

  const nu = new Date().toISOString()
  const wb: Werkbegroting = {
    id: nieuweId(),
    project_id: projectId,
    scenario_id: scenarioId,
    naam: 'Werkbegroting',
    status: 'concept',
    aangemaakt_op: nu,
    bijgewerkt_op: nu,
  }
  slaWerkbegrotingOp(wb)

  const groepIds = new Set(getGroepen(scenarioId).map(g => g.id))
  // Tekstregels blijven achter in de calculatie: ze horen bij de offerte, niet bij
  // de uitvoering. Zo kunnen ze ook nooit als bestelregel in Bouw7 belanden.
  const regels = getCalculatieregels().filter(r => groepIds.has(r.groep_id) && !isTekstregel(r))

  for (const regel of regels) {
    const wbRegel: WerkbegrotingRegel = {
      id: nieuweId(),
      werkbegroting_id: wb.id,
      source_calculatieregel_id: regel.id,
      groep_id: regel.groep_id,
      omschrijving: regel.omschrijving,
      hoeveelheid: regel.hoeveelheid,  // bevroren — nooit aanpasbaar
      eenheid: regel.eenheid,
      kostengroep: regel.kostengroep,
      volgorde: regel.volgorde,
      opslag_pct: regel.opslag_pct,
      btw_pct: regel.btw_pct,
      btw_tarief_id: regel.btw_tarief_id,
      opmerking: regel.opmerking,
      is_stelpost: regel.is_stelpost,
    }
    slaWerkbegrotingRegelOp(wbRegel)

    const componenten = getComponentregels(regel.id)
    for (const comp of componenten) {
      const wbComp: WerkbegrotingComponent = {
        id: nieuweId(),
        werkbegroting_regel_id: wbRegel.id,
        source_component_id: comp.id,
        type: comp.type,
        norm_hoeveelheid: comp.norm_hoeveelheid,
        eenheid: comp.eenheid,
        tarief: comp.tarief,
        opslag_pct: comp.opslag_pct,
        omschrijving: comp.omschrijving,
        leverancier_naam: comp.leverancier,
        aannemersnaam: comp.aannemersnaam,
        offertenummer: comp.offertenummer,
      }
      slaWerkbegrotingComponentOp(wbComp)
    }
  }

  return wb
}

export function heroverhaalWerkbegroting(
  wb: Werkbegroting,
  scenarioId: string,
  modus: 'volledig' | 'gewijzigd'
): void {
  const groepIds   = new Set(getGroepen(scenarioId).map(g => g.id))
  // Idem als bij het aanmaken: tekstregels horen niet in de werkbegroting.
  const calcRegels = getCalculatieregels().filter(r => groepIds.has(r.groep_id) && !isTekstregel(r))

  if (modus === 'volledig') {
    // Verwijder alles en kopieer opnieuw
    getWerkbegrotingRegels(wb.id).forEach(r => verwijderWerkbegrotingRegel(r.id))

    for (const regel of calcRegels) {
      const wbRegel: WerkbegrotingRegel = {
        id: nieuweId(), werkbegroting_id: wb.id,
        source_calculatieregel_id: regel.id, groep_id: regel.groep_id,
        omschrijving: regel.omschrijving, hoeveelheid: regel.hoeveelheid,
        eenheid: regel.eenheid, kostengroep: regel.kostengroep,
        volgorde: regel.volgorde, opslag_pct: regel.opslag_pct,
        btw_pct: regel.btw_pct, btw_tarief_id: regel.btw_tarief_id,
        opmerking: regel.opmerking,
        is_stelpost: regel.is_stelpost,
      }
      slaWerkbegrotingRegelOp(wbRegel)
      for (const comp of getComponentregels(regel.id)) {
        slaWerkbegrotingComponentOp({
          id: nieuweId(), werkbegroting_regel_id: wbRegel.id,
          source_component_id: comp.id, type: comp.type,
          norm_hoeveelheid: comp.norm_hoeveelheid,
          eenheid: comp.type === 'arbeid' ? 'uur' : comp.eenheid,
          tarief: comp.tarief, opslag_pct: comp.opslag_pct,
          omschrijving: comp.omschrijving, leverancier_naam: comp.leverancier,
          aannemersnaam: comp.aannemersnaam, offertenummer: comp.offertenummer,
        })
      }
    }
  } else {
    // Gewijzigd: sync gewijzigde en nieuwe regels, behoud WB-aanpassingen
    const bestaandeWbRegels = getWerkbegrotingRegels(wb.id)

    for (const calcRegel of calcRegels) {
      const wbRegel = bestaandeWbRegels.find(r => r.source_calculatieregel_id === calcRegel.id)

      if (wbRegel) {
        // Bijwerken van calculatie-velden (hoeveelheid, omschrijving, eenheid, kostengroep)
        const patch: Partial<WerkbegrotingRegel> = {}
        if (wbRegel.hoeveelheid  !== calcRegel.hoeveelheid)  patch.hoeveelheid  = calcRegel.hoeveelheid
        if (wbRegel.omschrijving !== calcRegel.omschrijving) patch.omschrijving = calcRegel.omschrijving
        if (wbRegel.eenheid      !== calcRegel.eenheid)      patch.eenheid      = calcRegel.eenheid
        if (wbRegel.kostengroep  !== calcRegel.kostengroep)  patch.kostengroep  = calcRegel.kostengroep
        // BTW-tarief en -percentage horen bij elkaar: een correctie in de calculatie moet
        // ook in de werkbegroting landen, anders lopen de twee uiteen.
        if (wbRegel.btw_tarief_id !== calcRegel.btw_tarief_id || wbRegel.btw_pct !== calcRegel.btw_pct) {
          patch.btw_tarief_id = calcRegel.btw_tarief_id
          patch.btw_pct = calcRegel.btw_pct
        }
        if (Object.keys(patch).length > 0) slaWerkbegrotingRegelOp({ ...wbRegel, ...patch })

        // Voeg nieuwe componenten toe die nog niet in WB staan
        const bestaandeComps = getWerkbegrotingComponenten(wbRegel.id)
        for (const comp of getComponentregels(calcRegel.id)) {
          if (!bestaandeComps.find(c => c.source_component_id === comp.id)) {
            slaWerkbegrotingComponentOp({
              id: nieuweId(), werkbegroting_regel_id: wbRegel.id,
              source_component_id: comp.id, type: comp.type,
              norm_hoeveelheid: comp.norm_hoeveelheid,
              eenheid: comp.type === 'arbeid' ? 'uur' : comp.eenheid,
              tarief: comp.tarief, opslag_pct: comp.opslag_pct,
              omschrijving: comp.omschrijving, leverancier_naam: comp.leverancier,
              aannemersnaam: comp.aannemersnaam, offertenummer: comp.offertenummer,
            })
          }
        }
      } else {
        // Nieuwe calculatieregel — volledig toevoegen aan WB
        const nieuwWbRegel: WerkbegrotingRegel = {
          id: nieuweId(), werkbegroting_id: wb.id,
          source_calculatieregel_id: calcRegel.id, groep_id: calcRegel.groep_id,
          omschrijving: calcRegel.omschrijving, hoeveelheid: calcRegel.hoeveelheid,
          eenheid: calcRegel.eenheid, kostengroep: calcRegel.kostengroep,
          volgorde: calcRegel.volgorde, opslag_pct: calcRegel.opslag_pct,
          btw_pct: calcRegel.btw_pct, btw_tarief_id: calcRegel.btw_tarief_id,
          opmerking: calcRegel.opmerking,
          is_stelpost: calcRegel.is_stelpost,
        }
        slaWerkbegrotingRegelOp(nieuwWbRegel)
        for (const comp of getComponentregels(calcRegel.id)) {
          slaWerkbegrotingComponentOp({
            id: nieuweId(), werkbegroting_regel_id: nieuwWbRegel.id,
            source_component_id: comp.id, type: comp.type,
            norm_hoeveelheid: comp.norm_hoeveelheid,
            eenheid: comp.type === 'arbeid' ? 'uur' : comp.eenheid,
            tarief: comp.tarief, opslag_pct: comp.opslag_pct,
            omschrijving: comp.omschrijving, leverancier_naam: comp.leverancier,
            aannemersnaam: comp.aannemersnaam, offertenummer: comp.offertenummer,
          })
        }
      }
    }
  }
}
