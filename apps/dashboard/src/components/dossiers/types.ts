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
  contactpersoon_naam:     string | null
  contactpersoon_email:    string | null
  contactpersoon_telefoon: string | null
}

/** Geeft de actieve substatus terug voor een dossier, ongeacht de fase. */
export function getDossierSubstatus(dossier: Dossier): DossierSubstatus {
  if (dossier.hoofdstatus === 'aanvraag') return dossier.aanvraag_substatus!
  if (dossier.hoofdstatus === 'offerte')  return dossier.offerte_substatus!
  return dossier.opdracht_substatus!
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

/** Kanban-statussen voor opdrachten: excl. financieel_gereed én financieel_afgesloten.
 *  financieel_gereed is bereikbaar via de "Financieel gereed melden" knop in de detail-view. */
export const OPDRACHT_KANBAN_STATUSSEN: StatusDef<OpdrachtSubstatus>[] =
  OPDRACHT_STATUSSEN.filter(s => s.key !== 'financieel_afgesloten' && s.key !== 'financieel_gereed')

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
 * in Bouw7). `aanvraag` blijft volledig EVA-stuurbaar: veel aanvraag-dossiers hebben (nog) geen
 * Bouw7-offerte, dus handmatig naar Vervallen/Afgewezen slepen moet mogelijk blijven — de sync
 * overschrijft alleen wanneer er wél een gemapte Bouw7-offertestatus is.
 */
export const BOUW7_EIGEN_SUBSTATUSSEN: Record<DossierSectie, string[]> = {
  aanvraag:    [],
  offerte:     ['verzonden', 'mondelinge_toezegging', 'gewonnen', 'verloren', 'vervallen'],
  opdracht:    ['nieuwe_opdracht', 'werkvoorbereiding', 'onderhanden', 'uitvoering_gereed', 'financieel_gereed', 'financieel_afgesloten'],
  servicedesk: ['nieuw', 'offerte_uitgebracht', 'loopt', 'uitgevoerd', 'financieel_gereed'],
}

/** True als `key` een door Bouw7 beheerde substatus is binnen de gegeven sectie. */
export function isBouw7Substatus(sectie: DossierSectie, key: string): boolean {
  return BOUW7_EIGEN_SUBSTATUSSEN[sectie]?.includes(key) ?? false
}
