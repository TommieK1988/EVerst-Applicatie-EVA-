import type {
  Dossier,
  Hoofdstatus,
  AanvraagSubstatus,
  OfferteSubstatus,
  OpdrachtSubstatus,
  ServicedeskSubstatus,
} from '@everts/database'

export type { Dossier, Hoofdstatus, AanvraagSubstatus, OfferteSubstatus, OpdrachtSubstatus, ServicedeskSubstatus }

export type DossierSectie = 'aanvraag' | 'offerte' | 'opdracht' | 'servicedesk'

export type DossierSubstatus = AanvraagSubstatus | OfferteSubstatus | OpdrachtSubstatus | ServicedeskSubstatus

export type StatusDef<K extends string> = { key: K; label: string }

/** Dossier verrijkt met opgeloste namen (via join met relaties + medewerkers + contactpersoon). */
export type DossierRij = Dossier & {
  klant_naam: string | null
  projectleider_naam: string | null
  projectleider_kleur: string | null
  teamleider_naam: string | null
  werkvoorbereider_naam: string | null
  werkvoorbereider_kleur: string | null
  calculator_naam: string | null
  calculator_kleur: string | null
  uitvoerder_naam: string | null
  controller_naam: string | null
  controller_kleur: string | null
  contactpersoon_naam:     string | null
  contactpersoon_email:    string | null
  contactpersoon_telefoon: string | null
  /** Bewaking-vlaggen (tijdens Bouw7-sync berekend; nog niet in de gegenereerde Dossier-types). */
  bouw7_bestelregels_afwijking?: boolean | null
  bouw7_uren_overschrijding?:    boolean | null
  /** Werkbegroting is geaccordeerd geweest maar bevat nu niet-geaccordeerde wijzigingen (WB!-badge). */
  wb_ongeaccordeerde_wijzigingen?: boolean | null
  /** Aantal Bouw7-offertes met status "Verstuurd" (sync). >1 → indicator + som op de offerte-kaart. */
  offerte_verstuurd_aantal?: number | null
  /** Som van de subtotalen (excl. btw) van alle offertes met status "Verstuurd". */
  offerte_verstuurd_som_excl_btw?: number | null
  /** Taken-tellers (server-side geteld over losse taken + actielijst-taken; zie verrijkDossiers). */
  taken_open?: number
  taken_totaal?: number
  /** "Intern"-toggle (sleutel 'intern') aan → dossier wordt verborgen op de borden/lijsten. */
  intern: boolean
}

/** Geeft de actieve substatus terug voor een dossier, ongeacht de fase. */
export function getDossierSubstatus(dossier: Dossier): DossierSubstatus {
  if (dossier.hoofdstatus === 'aanvraag') return dossier.aanvraag_substatus!
  if (dossier.hoofdstatus === 'offerte')  return dossier.offerte_substatus!
  return dossier.opdracht_substatus!
}

/**
 * True als een dossier definitief is afgesloten en daarmee overal **alleen-lezen**:
 * Afgewezen/Vervallen (aanvraag), Verloren/Vervallen (offerte), Financieel afgesloten
 * (opdracht), of een Bouw7-projectstatus in de 07-reeks (afgesloten projecten).
 * Structureel getypeerd zodat zowel een volledige `DossierRij` als een kale status-select
 * (zie `lib/dossiers/guards.ts`) hierin passen.
 */
export function isDossierAfgesloten(dossier: {
  hoofdstatus?: Hoofdstatus | null
  aanvraag_substatus?: AanvraagSubstatus | null
  offerte_substatus?: OfferteSubstatus | null
  opdracht_substatus?: OpdrachtSubstatus | null
  bouw7_projectstatus_naam?: string | null
}): boolean {
  const b7 = dossier.bouw7_projectstatus_naam?.trim()
  if (b7 && b7.startsWith('07')) return true
  switch (dossier.hoofdstatus) {
    case 'aanvraag': return dossier.aanvraag_substatus === 'afgewezen' || dossier.aanvraag_substatus === 'vervallen'
    case 'offerte':  return dossier.offerte_substatus === 'verloren'  || dossier.offerte_substatus === 'vervallen'
    case 'opdracht': return dossier.opdracht_substatus === 'financieel_afgesloten'
    default:         return false
  }
}

export const AANVRAAG_STATUSSEN: StatusDef<AanvraagSubstatus>[] = [
  { key: 'nieuw',               label: 'Nieuw'               },
  { key: 'inlezen_aanvraag',    label: 'Inlezen aanvraag'    },
  { key: 'werkopname',          label: 'Werkopname'          },
  { key: 'uitwerken_begroting', label: 'Uitwerken begroting' },
  { key: 'controle_begroting',  label: 'Controle begroting'  },
  { key: 'offerte_gereed',      label: 'Offerte gereed'      },
  { key: 'verzonden',           label: 'Verzonden'           },
  { key: 'afgewezen',           label: 'Afgewezen'           },
  { key: 'vervallen',           label: 'Vervallen'           },
]

export const OFFERTE_STATUSSEN: StatusDef<OfferteSubstatus>[] = [
  { key: 'verzonden',             label: 'Verzonden'             },
  { key: 'nabellen',              label: 'Nabellen'              },
  { key: 'in_behandeling',        label: 'In behandeling'        },
  { key: 'mondelinge_toezegging', label: 'Mondelinge toezegging' },
  { key: 'gewonnen',              label: 'Gewonnen'              },
  { key: 'verloren',              label: 'Verloren'              },
  { key: 'vervallen',             label: 'Vervallen'             },
]

export const OPDRACHT_STATUSSEN: StatusDef<OpdrachtSubstatus>[] = [
  { key: 'nieuwe_opdracht',       label: 'Nieuwe opdracht'       },
  { key: 'werkvoorbereiding',     label: 'Werkvoorbereiding'     },
  { key: 'onderhanden',           label: 'Onderhanden'           },
  { key: 'uitvoering_gereed',     label: 'Uitvoering gereed'     },
  { key: 'financieel_gereed',     label: 'Financieel gereed'     },
  { key: 'financieel_afgesloten', label: 'Financieel afgesloten' },
]

export const OPDRACHT_ACTIEF_STATUSSEN: StatusDef<OpdrachtSubstatus>[] =
  OPDRACHT_STATUSSEN.filter(s => s.key !== 'financieel_afgesloten')

/** Kanban-statussen voor opdrachten: excl. financieel_afgesloten (definitieve afsluiting via knop).
 *  financieel_gereed is óók een kolom zodat je een opdracht ernaartoe kunt slepen (schrijft naar Bouw7);
 *  de "Financieel gereed melden" knop in de detail-view doet hetzelfde. */
export const OPDRACHT_KANBAN_STATUSSEN: StatusDef<OpdrachtSubstatus>[] =
  OPDRACHT_STATUSSEN.filter(s => s.key !== 'financieel_afgesloten')

export const SERVICEDESK_STATUSSEN: StatusDef<ServicedeskSubstatus>[] = [
  { key: 'nieuw',               label: 'Nieuw'                         },
  { key: 'mandaat_verhoging',   label: 'Mandaat verhoging aangevraagd' },
  { key: 'offerte_uitgebracht', label: 'Offerte uitgebracht'           },
  { key: 'uitgezet',            label: 'Uitgezet'                      },
  { key: 'ingepland',           label: 'Ingepland'                     },
  { key: 'loopt',               label: 'Loopt'                         },
  { key: 'uitgevoerd',          label: 'Uitgevoerd'                    },
  { key: 'kosten_compleet',     label: 'Kosten compleet'               },
  { key: 'financieel_gereed',   label: 'Financieel gereed'             },
]

/**
 * Substatussen die de Bouw7-sync zelf zet/overschrijft (zie `mapBouw7NaarEvaStatus` +
 * `BOUW7_NAAR_SERVICEDESK_SUBSTATUS` in `lib/bouw7/sync.ts`). Voor dossiers die uit Bouw7
 * komen (`bouw7_id != null`) zijn deze in EVA **alleen-lezen** — je kunt een dossier wél naar
 * EVA-eigen substatussen verplaatsen, maar niet naar een Bouw7-eigen substatus (die wijzig je
 * in Bouw7).
 *
 * De aanvraag- én offerte-ladder zijn volledig EVA-stuurbaar: elke substatus wordt naar het
 * Bouw7-maatwerkveld "Offerte Sub-status" teruggeschreven (`lib/bouw7/substatus-attr.ts`). De drie
 * eindstatussen trekken daar ook de projectstatus mee — Gewonnen → `02. Nieuwe opdracht`,
 * Verloren/Vervallen → `08. Afgewezen` zodra álle offertes van het project afgeketst zijn.
 * Alleen opdracht en servicedesk houden nog Bouw7-eigen substatussen.
 */
export const BOUW7_EIGEN_SUBSTATUSSEN: Record<DossierSectie, string[]> = {
  aanvraag:    [],
  offerte:     [],
  opdracht:    ['nieuwe_opdracht', 'werkvoorbereiding', 'onderhanden', 'uitvoering_gereed', 'financieel_gereed', 'financieel_afgesloten'],
  servicedesk: ['nieuw', 'offerte_uitgebracht', 'loopt', 'uitgevoerd', 'financieel_gereed'],
}

/**
 * True als het zetten van deze substatus het dossier **definitief afsluit** — daarna is het overal
 * alleen-lezen (zie `isDossierAfgesloten` + `lib/dossiers/guards.ts`) en is het niet meer via de UI
 * terug te draaien. Deze substatussen worden bovendien naar Bouw7 teruggeschreven en kunnen daar de
 * projectstatus op `08. Afgewezen` zetten. Vandaar een bevestiging vóór de wijziging.
 */
export function isAfsluitendeSubstatus(sectie: DossierSectie, key: string): boolean {
  if (sectie === 'aanvraag') return key === 'afgewezen' || key === 'vervallen'
  if (sectie === 'offerte')  return key === 'verloren'  || key === 'vervallen'
  return false
}

/** True als `key` een door Bouw7 beheerde substatus is binnen de gegeven sectie. */
export function isBouw7Substatus(sectie: DossierSectie, key: string): boolean {
  return BOUW7_EIGEN_SUBSTATUSSEN[sectie]?.includes(key) ?? false
}
