// Bedrijfsbrede instellingen voor de urenverantwoording: deadlines, de terugvalgoedkeurder, wie
// welk verlof beoordeelt, en het dossier waar niet-projectgebonden uren op landen.

import { createAdminClient } from '@everts/database/server'
import { isoWeekdag, weekDagen } from './rooster'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type UrenInstellingen = {
  terugval_goedkeurder_id: string | null
  /**
   * Wie de niet-gewerkte uren (verlof, ziek, vakantie, feestdag, tijd-voor-tijd) beoordeelt van
   * medewerkers die zelf geen goedkeurder op hun profiel hebben staan.
   *
   * Bewust iets ANDERS dan `terugval_goedkeurder_id` hierboven: die hoort bij de EVA-weekstaat en
   * bij verlofaanvragen zonder pool. Deze gaat alleen over de urenregels uit Bouw7, en voorkomt
   * dat iemands vakantie bij de projectleider belandt van het project waarop die dag toevallig
   * geboekt staat.
   */
  niet_gewerkt_goedkeurder_id: string | null
  /**
   * Dossiers waarop ÁLLE uren naar de eigen goedkeurder van de medewerker gaan, ook de gewerkte.
   * Op een indirecte-urenproject is gewerkte tijd geen projectwerk maar overhead -- er valt voor
   * een projectleider inhoudelijk niets te beoordelen. Op een echt project blijft gewerkte tijd
   * bij de teamleider en de projectleider: dat is hun budget.
   */
  indirecte_dossier_ids: string[]
  /**
   * Afdelingen die nooit een project kiezen: al hun gewerkte uren zijn overhead en landen op het
   * gewerkte indirecte project van hun werkmaatschappij (zie `getUrenBestemming`).
   */
  indirecte_afdelingen: string[]
  /**
   * Waar de gewerkte uren van externen op een kantoorafdeling landen. Externen (ZZP) hebben geen
   * werkmaatschappij, dus het kantoorproject van een werkmaatschappij geldt voor hen niet.
   */
  extern_kantoor_dossier_id: string | null
  tolerantie_uren: number
  indien_deadline_dag: number
  indien_deadline_tijd: string
  goedkeur_deadline_dag: number
  goedkeur_deadline_tijd: string
  /**
   * Waar weekstaten geaccordeerd worden. Standaard 'bouw7' — dat is de huidige praktijk en die
   * moet blijven werken zolang de overstap loopt. Per ploeg te overschrijven, zie `bepaalModus`.
   */
  goedkeuring_modus: 'eva' | 'bouw7'
  /**
   * Welke afdeling het verlof van welke afdeling beoordeelt: {"Uitvoering":"Projectbureau", ...}.
   * Een afdeling die hier niet in staat komt bij Directie uit, zie `bepaalBeoordelendeAfdeling`.
   */
  verlof_routes: Record<string, string>
  /**
   * Kilometervergoeding bij reiskosten op eigen gelegenheid, in euro per kilometer. Een
   * bedrijfsafspraak en geen wetgeving, dus instelbaar: een tariefwijziging hoort geen release
   * te vragen. Hier staat alleen het getal; het rekenen zit in `lib/uren/onkosten.ts`.
   */
  km_vergoeding_auto: number
  km_vergoeding_bromfiets: number
}

const STANDAARD: UrenInstellingen = {
  terugval_goedkeurder_id: null,
  niet_gewerkt_goedkeurder_id: null,
  indirecte_dossier_ids: [],
  indirecte_afdelingen: ['Projectbureau', 'Ondersteunend', 'Directie'],
  extern_kantoor_dossier_id: null,
  tolerantie_uren: 0,
  indien_deadline_dag: 5,
  indien_deadline_tijd: '17:00:00',
  goedkeur_deadline_dag: 1,
  goedkeur_deadline_tijd: '12:00:00',
  goedkeuring_modus: 'bouw7',
  verlof_routes: {},
  km_vergoeding_auto: 0.3,
  km_vergoeding_bromfiets: 0.11,
}

/** De singleton-rij. Valt terug op de standaarden als de rij (nog) ontbreekt. */
export async function getUrenInstellingen(): Promise<UrenInstellingen> {
  const supabase = db()
  const { data } = await supabase
    .from('uren_instellingen')
    .select('terugval_goedkeurder_id, niet_gewerkt_goedkeurder_id, indirecte_dossier_ids, indirecte_afdelingen, extern_kantoor_dossier_id, tolerantie_uren, indien_deadline_dag, indien_deadline_tijd, goedkeur_deadline_dag, goedkeur_deadline_tijd, goedkeuring_modus, verlof_routes, km_vergoeding_auto, km_vergoeding_bromfiets')
    .eq('id', true)
    .maybeSingle()
  if (!data) return STANDAARD
  return {
    ...data,
    indirecte_dossier_ids: (data.indirecte_dossier_ids ?? []) as string[],
    indirecte_afdelingen: (data.indirecte_afdelingen ?? STANDAARD.indirecte_afdelingen) as string[],
    tolerantie_uren: Number(data.tolerantie_uren ?? 0),
    verlof_routes: (data.verlof_routes ?? {}) as Record<string, string>,
    km_vergoeding_auto: Number(data.km_vergoeding_auto ?? STANDAARD.km_vergoeding_auto),
    km_vergoeding_bromfiets: Number(data.km_vergoeding_bromfiets ?? STANDAARD.km_vergoeding_bromfiets),
  }
}

/**
 * Waar de uren van een medewerker landen als hij zelf geen project kiest.
 *
 * Per werkmaatschappij twee projecten: één voor de niet-gewerkte uren (verlof, ziek, feestdag,
 * tijd voor tijd -- Bouw7 eist een project op elke hour-log) en één voor gewerkte overhead. Wie op
 * een kantoorafdeling zit (`indirecte_afdelingen`) kiest nooit een project: al zijn gewerkte uren
 * zijn overhead.
 *
 * Externen (ZZP) hebben geen werkmaatschappij: zij boeken alleen gewerkte uren, zonder norm, en
 * op kantoor komt dat op het vaste `extern_kantoor_dossier_id`.
 *
 * Bewust géén terugval op "de eerste werkmaatschappij die er een heeft": die koos willekeurig, en
 * zette zo het verlof van Everts-schilders op het project van Morgenstond. Ontbreekt de
 * werkmaatschappij, dan is dat een melding, geen gok.
 */
export type UrenBestemming = {
  extern: boolean
  kantoor: boolean
  werkmaatschappijId: string | null
  gewerktDossierId: string | null
  nietGewerktDossierId: string | null
}

export async function getUrenBestemming(medewerkerId: string): Promise<UrenBestemming> {
  const supabase = db()
  const [{ data: mw }, inst] = await Promise.all([
    supabase
      .from('medewerkers')
      .select('afdeling, extern, werkmaatschappij_id, bedrijfsgegevens(indirect_uren_dossier_id, indirect_gewerkt_dossier_id)')
      .eq('id', medewerkerId)
      .maybeSingle(),
    getUrenInstellingen(),
  ])
  const wm = mw?.bedrijfsgegevens as
    | { indirect_uren_dossier_id: string | null; indirect_gewerkt_dossier_id: string | null }
    | null
    | undefined
  const extern = !!mw?.extern
  return {
    extern,
    kantoor: !!mw?.afdeling && inst.indirecte_afdelingen.includes(mw.afdeling),
    werkmaatschappijId: mw?.werkmaatschappij_id ?? null,
    gewerktDossierId: extern ? inst.extern_kantoor_dossier_id : wm?.indirect_gewerkt_dossier_id ?? null,
    nietGewerktDossierId: extern ? null : wm?.indirect_uren_dossier_id ?? null,
  }
}

/**
 * Het moment waarop een week ingediend moet zijn: de ingestelde weekdag+tijd ná de maandag van
 * die week. Bij de standaard (dag 5, 17:00) is dat vrijdag 17:00 van diezelfde week.
 */
export function indienDeadline(weekStart: string, inst: UrenInstellingen): Date {
  return deadlineVan(weekStart, inst.indien_deadline_dag, inst.indien_deadline_tijd, false)
}

/**
 * Het moment waarop de goedkeuring rond moet zijn. De standaard is maandag 12:00 — dat is de
 * maandag ná de week, niet de maandag waarop de week begon; vandaar `volgendeWeek`.
 */
export function goedkeurDeadline(weekStart: string, inst: UrenInstellingen): Date {
  return deadlineVan(weekStart, inst.goedkeur_deadline_dag, inst.goedkeur_deadline_tijd, true)
}

function deadlineVan(weekStart: string, dag: number, tijd: string, volgendeWeek: boolean): Date {
  const dagen = weekDagen(weekStart)
  let datum = dagen.find(d => isoWeekdag(d) === dag) ?? dagen[dagen.length - 1]
  if (volgendeWeek) {
    const d = new Date(`${datum}T12:00:00`)
    d.setDate(d.getDate() + 7)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    datum = `${d.getFullYear()}-${mm}-${dd}`
  }
  const [uu = '0', mi = '0'] = tijd.split(':')
  const dt = new Date(`${datum}T00:00:00`)
  dt.setHours(Number(uu), Number(mi), 0, 0)
  return dt
}

/**
 * Alle dossiers die als indirecte-urenproject gelden: wat in de instellingen is aangevinkt én
 * de twee projecten die per werkmaatschappij voor indirecte uren zijn aangewezen.
 *
 * Hierop is een bewakingscode niet verplicht. Een bewakingscode hoort bij een begroting die
 * bewaakt wordt; op een indirecte-urendossier staat geen begroting, dus valt er geen code te
 * kiezen en heeft het geen zin er een te eisen. Op een echt project blijft hij verplicht --
 * daar is de code de bewaking zelf.
 */
export async function getIndirecteDossierIds(): Promise<Set<string>> {
  const supabase = db()
  const [inst, { data: wm }] = await Promise.all([
    getUrenInstellingen(),
    // Een handvol rijen: één per werkmaatschappij.
    supabase
      .from('bedrijfsgegevens')
      .select('indirect_uren_dossier_id, indirect_gewerkt_dossier_id'),
  ])
  const ids = new Set(inst.indirecte_dossier_ids)
  if (inst.extern_kantoor_dossier_id) ids.add(inst.extern_kantoor_dossier_id)
  type Rij = { indirect_uren_dossier_id: string | null; indirect_gewerkt_dossier_id: string | null }
  for (const r of (wm ?? []) as Rij[]) {
    if (r.indirect_uren_dossier_id) ids.add(r.indirect_uren_dossier_id)
    if (r.indirect_gewerkt_dossier_id) ids.add(r.indirect_gewerkt_dossier_id)
  }
  return ids
}
