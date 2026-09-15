/**
 * Fase van een dossier zoals de gebruiker hem kent — de noemer waarop object-, relatie- en
 * contactpersoonschermen hun dossierlijsten groeperen en filteren.
 *
 * `hoofdstatus` kent alleen aanvraag/offerte/opdracht; "servicedesk" en "afgesloten" zijn
 * overlays daarbovenop. De regels hieronder zijn dezelfde als in `isActiefDossier`
 * (`lib/dossiers/actief.ts`), waar ze de bron van waarheid zijn.
 *
 * Pure helpers (géén 'server-only' en géén 'use server'): zowel de leeslagen op de server als
 * de tabellen in client-componenten rekenen hiermee, en de labels horen bij de fase zelf.
 */
import type { Hoofdstatus } from '@everts/database'

export type DossierFase = 'aanvraag' | 'offerte' | 'opdracht' | 'servicedesk' | 'afgesloten'

export type FaseVelden = {
  hoofdstatus: Hoofdstatus
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  gearchiveerd: boolean | null
}

/** Offertestatussen waarna er niets meer loopt — gelijk aan `isActiefDossier`. */
const OFFERTE_EIND = new Set(['gewonnen', 'verloren', 'vervallen'])

export function bepaalFase(d: FaseVelden): DossierFase {
  if (d.gearchiveerd === true) return 'afgesloten'
  if (d.hoofdstatus === 'opdracht' && d.opdracht_substatus === 'financieel_afgesloten') return 'afgesloten'
  if (d.servicedesk_substatus) {
    return d.servicedesk_substatus === 'financieel_gereed' ? 'afgesloten' : 'servicedesk'
  }
  // Een gewonnen offerte is inmiddels een opdracht, een verloren of vervallen offerte is
  // afgehandeld — in beide gevallen loopt er niets meer op dit dossier.
  if (d.hoofdstatus === 'offerte' && OFFERTE_EIND.has(d.offerte_substatus ?? '')) return 'afgesloten'
  return d.hoofdstatus
}

/** Kolommen die `bepaalFase` nodig heeft — één plek, zodat de selects niet uit elkaar lopen. */
export const FASE_KOLOMMEN =
  'hoofdstatus, offerte_substatus, opdracht_substatus, servicedesk_substatus, gearchiveerd'

export const FASE_LABEL: Record<DossierFase, string> = {
  aanvraag: 'Aanvraag', offerte: 'Offerte', opdracht: 'Opdracht',
  servicedesk: 'Servicedesk', afgesloten: 'Afgesloten',
}

/** Volgorde waarin fases horen te staan in filters en tellingen. */
export const FASE_VOLGORDE: DossierFase[] = ['aanvraag', 'offerte', 'opdracht', 'servicedesk', 'afgesloten']

/** Fase 'afgesloten' is het enige echte eindpunt; de rest loopt nog. */
export const isLopend = (fase: DossierFase): boolean => fase !== 'afgesloten'

/**
 * Jaar waarin het dossier is ontstaan.
 *
 * `created_at` is uitdrukkelijk de laatste keus: dat is de dag waarop de bulk-sync het dossier
 * in EVA zette. Die datums vallen op een handvol importdagen, dus daarop groeperen zou een
 * verzonnen jaarverdeling geven. `bouw7_aanmaakdatum` is de echte aanmaakdatum van het project
 * en is overal gevuld.
 */
export function jaarVan(
  d: { bouw7_aanmaakdatum: string | null; aanvraagdatum: string | null; created_at: string },
): number | null {
  const bron = d.bouw7_aanmaakdatum ?? d.aanvraagdatum ?? d.created_at
  const jaar = Number(String(bron ?? '').slice(0, 4))
  return Number.isFinite(jaar) && jaar > 1990 ? jaar : null
}
