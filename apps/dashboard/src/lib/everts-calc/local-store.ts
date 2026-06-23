import type {
  Project, Deelproject, Locatie, Element, Activiteit,
  CalculatieLijn, Scenario, BibliotheekActiviteit,
  Groep, Calculatieregel, Componentregel, Instellingen,
  Meetstaat, Meetregel, MeetregelAggregaat,
  Werkbegroting, WerkbegrotingRegel, WerkbegrotingComponent,
  WerkbegrotingWijziging, WerkbegrotingBestelling,
} from './types'
import { nieuweId } from './utils'

const KEYS = {
  werkbegrotingen: 'evc_werkbegrotingen',
  werkbegroting_regels: 'evc_werkbegroting_regels',
  werkbegroting_componenten: 'evc_werkbegroting_componenten',
  werkbegroting_wijzigingen: 'evc_werkbegroting_wijzigingen',
  werkbegroting_bestellingen: 'evc_werkbegroting_bestellingen',
  projecten: 'evc_projecten',
  deelprojecten: 'evc_deelprojecten',
  locaties: 'evc_locaties',
  elementen: 'evc_elementen',
  activiteiten: 'evc_activiteiten',
  lijnen: 'evc_lijnen',
  scenarios: 'evc_scenarios',
  bibliotheek: 'evc_bibliotheek',
  projectvolgnummer: 'evc_projectvolgnummer',
  // Nieuwe structuur
  groepen: 'evc_groepen',
  calculatieregels: 'evc_calculatieregels',
  componentregels: 'evc_componentregels',
  instellingen: 'evc_instellingen',
  meetstaten: 'evc_meetstaten',
  meetregels: 'evc_meetregels',
  meetregel_aggregaten: 'evc_meetregel_aggregaten',
}

const STANDAARD_INSTELLINGEN: Instellingen = {
  btw_tarieven: [0, 9, 21],
  uurtarieven: [
    { label: 'Schilder A',       tarief: 58 },
    { label: 'Timmerman',        tarief: 62 },
    { label: 'Metselaar',        tarief: 65 },
    { label: 'Dakdekker',        tarief: 68 },
    { label: 'Hulp / Assistent', tarief: 45 },
  ],
  eenheden: ['m²', 'm¹', 'st', 'uur', 'dag', 'm³', 'ltr', 'kg', 'set'],
  categorieen: ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig'],
  categorieCodes: {
    Schilderwerk: 'SC', Timmerwerk: 'TI', Metselwerk: 'ME',
    Dakwerk: 'DA', Voegwerk: 'VO', Overig: 'OV',
  },
}

function lees<T>(key: string, fallback: T[]): T[] {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function sla<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(data))
}

// ─── Projectvolgnummer ────────────────────────────────────────────────────────

export function getProjectVolgnummer(): number {
  if (typeof window === 'undefined') return 1
  return parseInt(localStorage.getItem(KEYS.projectvolgnummer) || '1', 10)
}

export function incrementProjectVolgnummer(): number {
  const huidig = getProjectVolgnummer()
  const nieuw = huidig + 1
  localStorage.setItem(KEYS.projectvolgnummer, String(nieuw))
  return nieuw
}

// ─── Projecten ────────────────────────────────────────────────────────────────

export function getProjecten(): Project[] {
  return lees<Project>(KEYS.projecten, [])
}

export function getProject(id: string): Project | undefined {
  return getProjecten().find(p => p.id === id)
}

export function slaProjectOp(project: Project): void {
  const lijst = getProjecten().filter(p => p.id !== project.id)
  sla(KEYS.projecten, [...lijst, { ...project, bijgewerkt_op: new Date().toISOString() }])
}

export function verwijderProject(id: string): void {
  sla(KEYS.projecten, getProjecten().filter(p => p.id !== id))
  // Cascade
  const dps = getDeelprojecten().filter(d => d.project_id === id)
  dps.forEach(dp => verwijderDeelproject(dp.id))
  sla(KEYS.scenarios, getScenarios().filter(s => s.project_id !== id))
}

// ─── Deelprojecten ────────────────────────────────────────────────────────────

export function getDeelprojecten(project_id?: string): Deelproject[] {
  const alle = lees<Deelproject>(KEYS.deelprojecten, [])
  return project_id ? alle.filter(d => d.project_id === project_id) : alle
}

export function slaDeelprojectOp(dp: Deelproject): void {
  const lijst = getDeelprojecten().filter(d => d.id !== dp.id)
  sla(KEYS.deelprojecten, [...lijst, dp])
}

export function verwijderDeelproject(id: string): void {
  sla(KEYS.deelprojecten, getDeelprojecten().filter(d => d.id !== id))
  const locs = getLocaties().filter(l => l.deelproject_id === id)
  locs.forEach(l => verwijderLocatie(l.id))
}

// ─── Locaties ─────────────────────────────────────────────────────────────────

export function getLocaties(deelproject_id?: string): Locatie[] {
  const alle = lees<Locatie>(KEYS.locaties, [])
  return deelproject_id ? alle.filter(l => l.deelproject_id === deelproject_id) : alle
}

export function slaLocatieOp(locatie: Locatie): void {
  const lijst = getLocaties().filter(l => l.id !== locatie.id)
  sla(KEYS.locaties, [...lijst, locatie])
}

export function verwijderLocatie(id: string): void {
  sla(KEYS.locaties, getLocaties().filter(l => l.id !== id))
  const elms = getElementen().filter(e => e.locatie_id === id)
  elms.forEach(e => verwijderElement(e.id))
}

// ─── Elementen ────────────────────────────────────────────────────────────────

export function getElementen(locatie_id?: string): Element[] {
  const alle = lees<Element>(KEYS.elementen, [])
  return locatie_id ? alle.filter(e => e.locatie_id === locatie_id) : alle
}

export function slaElementOp(element: Element): void {
  const lijst = getElementen().filter(e => e.id !== element.id)
  sla(KEYS.elementen, [...lijst, element])
}

export function verwijderElement(id: string): void {
  sla(KEYS.elementen, getElementen().filter(e => e.id !== id))
  const acts = getActiviteiten().filter(a => a.element_id === id)
  acts.forEach(a => verwijderActiviteit(a.id))
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
    opslag_algemene_kosten: 8,
    opslag_winst_risico: 10,
    opslag_overhead: 0,
    btw_pct_default: 21,
    standaard_uurtarief: favorietTarief,
  }
  slaScenarioOp(nieuw)
  return nieuw
}

// ─── Activiteiten ─────────────────────────────────────────────────────────────

export function getActiviteiten(element_id?: string, scenario_id?: string): Activiteit[] {
  const alle = lees<Activiteit>(KEYS.activiteiten, [])
  return alle.filter(a =>
    (!element_id || a.element_id === element_id) &&
    (!scenario_id || a.scenario_id === scenario_id)
  )
}

export function slaActiviteitOp(activiteit: Activiteit): void {
  const lijst = getActiviteiten().filter(a => a.id !== activiteit.id)
  sla(KEYS.activiteiten, [...lijst, activiteit])
}

export function verwijderActiviteit(id: string): void {
  sla(KEYS.activiteiten, getActiviteiten().filter(a => a.id !== id))
  sla(KEYS.lijnen, getLijnen().filter(l => l.activiteit_id !== id))
}

// ─── Calculatielijnen ─────────────────────────────────────────────────────────

export function getLijnen(activiteit_id?: string): CalculatieLijn[] {
  const alle = lees<CalculatieLijn>(KEYS.lijnen, [])
  return activiteit_id ? alle.filter(l => l.activiteit_id === activiteit_id) : alle
}

export function slaLijnOp(lijn: CalculatieLijn): void {
  const lijst = getLijnen().filter(l => l.id !== lijn.id)
  sla(KEYS.lijnen, [...lijst, lijn])
}

export function verwijderLijn(id: string): void {
  sla(KEYS.lijnen, getLijnen().filter(l => l.id !== id))
}

// ─── Bibliotheek ──────────────────────────────────────────────────────────────

export function getBibliotheek(discipline?: string): BibliotheekActiviteit[] {
  const alle = lees<BibliotheekActiviteit>(KEYS.bibliotheek, [])
  return discipline ? alle.filter(b => b.discipline === discipline || b.discipline === 'algemeen') : alle
}

export function slaBibliotheekActiviteitOp(act: BibliotheekActiviteit): void {
  const lijst = getBibliotheek().filter(b => b.id !== act.id)
  sla(KEYS.bibliotheek, [...lijst, act])
}

// ─── Helpers: activiteit aanmaken vanuit bibliotheek ─────────────────────────

export function voegBibliotheekActiviteitToe(
  element_id: string,
  scenario_id: string,
  bib_act: BibliotheekActiviteit,
  hoeveelheid: number
): Activiteit {
  const volgorde = getActiviteiten(element_id, scenario_id).length + 1
  const activiteit: Activiteit = {
    id: nieuweId(),
    element_id,
    scenario_id,
    naam: bib_act.naam,
    eenheid: bib_act.eenheid,
    hoeveelheid,
    bibliotheek_activiteit_id: bib_act.id,
    volgorde,
  }
  slaActiviteitOp(activiteit)

  // Maak calculatielijnen aan vanuit bibliotheekregels
  bib_act.regels.forEach(regel => {
    const lijn: CalculatieLijn = {
      id: nieuweId(),
      activiteit_id: activiteit.id,
      lijn_type: regel.lijn_type,
      omschrijving: regel.omschrijving,
      hoeveelheid: regel.hoeveelheid_per_eenheid,
      eenheid: regel.eenheid,
      eenheidsprijs: regel.eenheidsprijs,
      normtijd: regel.normtijd_per_eenheid,
      verliesfactor: regel.verliesfactor,
    }
    slaLijnOp(lijn)
  })

  return activiteit
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
  const comp: Componentregel = {
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

export function getInstellingen(): Instellingen {
  if (typeof window === 'undefined') return STANDAARD_INSTELLINGEN
  try {
    const raw = localStorage.getItem(KEYS.instellingen)
    return raw ? { ...STANDAARD_INSTELLINGEN, ...JSON.parse(raw) } : STANDAARD_INSTELLINGEN
  } catch { return STANDAARD_INSTELLINGEN }
}

export function slaInstellingenOp(inst: Instellingen): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEYS.instellingen, JSON.stringify(inst))
}

// ─── Kostprijs berekening voor heel project ───────────────────────────────────

export function berekenProjectKostprijs(project_id: string, scenario_id: string): number {
  const dps = getDeelprojecten(project_id)
  let totaal = 0

  for (const dp of dps) {
    const locaties = getLocaties(dp.id)
    for (const loc of locaties) {
      const elementen = getElementen(loc.id)
      for (const elm of elementen) {
        const activiteiten = getActiviteiten(elm.id, scenario_id)
        for (const act of activiteiten) {
          const lijnen = getLijnen(act.id)
          const lijnTotaal = lijnen.reduce((s, l) => s + l.hoeveelheid * l.eenheidsprijs * l.verliesfactor, 0)
          totaal += lijnTotaal * act.hoeveelheid
        }
      }
    }
  }

  return totaal
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
  sla(KEYS.werkbegroting_bestellingen, getWerkbegrotingBestellingen(id).filter(() => false))
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
  const regels = getCalculatieregels().filter(r => groepIds.has(r.groep_id))

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
  const calcRegels = getCalculatieregels().filter(r => groepIds.has(r.groep_id))

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
        btw_pct: regel.btw_pct, opmerking: regel.opmerking,
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
          btw_pct: calcRegel.btw_pct, opmerking: calcRegel.opmerking,
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
