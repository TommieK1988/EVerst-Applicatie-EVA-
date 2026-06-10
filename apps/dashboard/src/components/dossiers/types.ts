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
  teamleider_naam: string | null
  werkvoorbereider_naam: string | null
  calculator_naam: string | null
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
