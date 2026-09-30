/**
 * dossier-lijsten.ts — de taken en notities van een dossier als herhaalbare lijsten
 * voor een documentsjabloon ({#projecttaken}…{/projecttaken}, {#projectnotities}…).
 *
 * Bedoeld voor een voorblad dat op één A4 moet passen (het calculatie-opnameblad).
 * Daarom zijn beide lijsten begrensd — maar nooit stilzwijgend: naast de lijst staat
 * altijd hoeveel er in totaal zijn en een kant-en-klare regel "en nog 4 taken in EVA",
 * zodat het sjabloon kan laten zien dat er meer is.
 *
 * De grens komt uit een invoerveld met sleutel `max_taken` / `max_notities` als het
 * sjabloon dat heeft; anders gelden de standaarden hieronder. Zo kiest de beheerder
 * per sjabloon, zonder codewijziging.
 *
 * Alle taken of alleen de openstaande? Beide: {#projecttaken} geeft open én afgevinkte
 * taken (open eerst), {#projecttaken_open} alleen de openstaande. Vervallen taken
 * staan in geen van beide; die zijn geschrapt, niet gedaan.
 */

import { datumNL, datumISO, afkappen } from './format'
import { nlDelen } from '@/lib/planning/nl-tijd'

/** Lengte van {tekst_kort}: ruim twee regels op een A4 in 9 pt. */
export const NOTITIE_KORT_MAX = 220
export const STANDAARD_MAX_TAKEN = 10
export const STANDAARD_MAX_NOTITIES = 5
export const MAX_TAKEN_SLEUTEL = 'max_taken'
export const MAX_NOTITIES_SLEUTEL = 'max_notities'

const STATUS_LABELS: Record<string, string> = {
  open: 'Open', in_behandeling: 'In behandeling',
  wacht_op: 'Wacht op', gereed: 'Gereed', vervallen: 'Vervallen',
}

/** Wat de lijstbouwer van een taak nodig heeft; een deelverzameling van `DossierTaakRegel`. */
export interface TaakBron {
  titel: string
  status: string
  deadline: string | null
  assignee_naam: string | null
}

/** Wat de lijstbouwer van een notitie nodig heeft; een deelverzameling van `DossierNotitie`. */
export interface NotitieBron {
  inhoud: string
  created_at: string
  auteur_naam: string
  /** null = geen auteur (een notitie uit de Bouw7-sync). */
  medewerker_id?: string | null
}

export interface TaakRegel {
  titel: string
  status: string
  /** Vinkje als tekst: ☒ of ☐. */
  afgevinkt: string
  is_afgevinkt: boolean
  is_open: boolean
  actiehouder: string
  deadline: string
  deadline_iso: string
}

export interface NotitieRegel {
  tekst: string
  /** Op één regel en afgekapt, voor een voorblad dat op één A4 moet blijven. */
  tekst_kort: string
  datum: string
  datum_iso: string
  auteur: string
}

export type ProjectLijstenBlok = {
  projecttaken: TaakRegel[]
  projecttaken_totaal: number
  projecttaken_meer: string
  projecttaken_heeft_meer: boolean
  projecttaken_open: TaakRegel[]
  projecttaken_open_totaal: number
  projecttaken_open_meer: string
  projecttaken_open_heeft_meer: boolean
  projectnotities: NotitieRegel[]
  projectnotities_totaal: number
  projectnotities_meer: string
  projectnotities_heeft_meer: boolean
}

export const LEEG_PROJECT_LIJSTEN: ProjectLijstenBlok = bouwProjectLijsten([], [], {})

/** Leest een grens uit de invoer; leeg of onzin → de standaard, 0 mag (lijst uit). */
export function leesMax(waarde: unknown, standaard: number): number {
  const s = String(waarde ?? '').trim()
  if (!s) return standaard
  const n = Math.floor(Number(s.replace(',', '.')))
  return Number.isFinite(n) && n >= 0 ? n : standaard
}

function meerRegel(rest: number, enkel: string, meervoud: string): string {
  if (rest <= 0) return ''
  return `En nog ${rest} ${rest === 1 ? enkel : meervoud} in EVA.`
}

function naarTaakRegel(t: TaakBron): TaakRegel {
  const af = t.status === 'gereed'
  return {
    titel: t.titel ?? '',
    status: STATUS_LABELS[t.status] ?? t.status ?? '',
    afgevinkt: af ? '☒' : '☐',
    is_afgevinkt: af,
    is_open: !af,
    actiehouder: t.assignee_naam ?? '',
    deadline: datumNL(t.deadline),
    deadline_iso: datumISO(t.deadline),
  }
}

function naarNotitieRegel(n: NotitieBron): NotitieRegel {
  // created_at is een UTC-tijdstempel; de kalenderdag moet de Nederlandse zijn,
  // anders krijgt een notitie van 00:30 de datum van gisteren.
  const dag = n.created_at ? nlDelen(n.created_at).datum : ''
  const tekst = (n.inhoud ?? '').trim()
  return {
    tekst,
    tekst_kort: afkappen(tekst.replace(/\s+/g, ' '), NOTITIE_KORT_MAX),
    datum: datumNL(dag),
    datum_iso: dag,
    // Een notitie zonder medewerker (uit de Bouw7-sync) heet op het scherm "Onbekend";
    // op papier blijft de auteur dan gewoon leeg.
    auteur: n.medewerker_id === null ? '' : n.auteur_naam ?? '',
  }
}

/**
 * Bouwt de lijsten. Pure functie: `taken` in de volgorde van het dossier (op deadline),
 * `notities` nieuwste eerst. Grenzen uit `invoer` ({@link MAX_TAKEN_SLEUTEL} en
 * {@link MAX_NOTITIES_SLEUTEL}).
 */
export function bouwProjectLijsten(
  taken: TaakBron[],
  notities: NotitieBron[],
  invoer: Record<string, unknown>,
): ProjectLijstenBlok {
  const maxTaken = leesMax(invoer[MAX_TAKEN_SLEUTEL], STANDAARD_MAX_TAKEN)
  const maxNotities = leesMax(invoer[MAX_NOTITIES_SLEUTEL], STANDAARD_MAX_NOTITIES)

  const levend = taken.filter(t => t.status !== 'vervallen')
  const open = levend.filter(t => t.status !== 'gereed')
  // Open eerst: als de lijst wordt afgekapt, valt het afgevinkte werk weg en niet het openstaande.
  const alle = [...open, ...levend.filter(t => t.status === 'gereed')]

  const echteNotities = notities.filter(n => (n.inhoud ?? '').trim())

  return {
    projecttaken: alle.slice(0, maxTaken).map(naarTaakRegel),
    projecttaken_totaal: alle.length,
    projecttaken_meer: meerRegel(alle.length - maxTaken, 'taak', 'taken'),
    projecttaken_heeft_meer: alle.length > maxTaken,
    projecttaken_open: open.slice(0, maxTaken).map(naarTaakRegel),
    projecttaken_open_totaal: open.length,
    projecttaken_open_meer: meerRegel(open.length - maxTaken, 'openstaande taak', 'openstaande taken'),
    projecttaken_open_heeft_meer: open.length > maxTaken,
    projectnotities: echteNotities.slice(0, maxNotities).map(naarNotitieRegel),
    projectnotities_totaal: echteNotities.length,
    projectnotities_meer: meerRegel(echteNotities.length - maxNotities, 'notitie', 'notities'),
    projectnotities_heeft_meer: echteNotities.length > maxNotities,
  }
}
