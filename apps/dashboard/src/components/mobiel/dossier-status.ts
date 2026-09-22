import {
  getDossierSubstatus, servicedeskLadder, isAfsluitendeSubstatus,
  AANVRAAG_STATUSSEN, OFFERTE_STATUSSEN, OPDRACHT_STATUSSEN, SERVICEDESK_ALLE_STATUSSEN,
} from '@/components/dossiers/types'
import type { DossierSectie, StatusDef } from '@/components/dossiers/types'
import type { Dossier } from '@everts/database'

const ALLE_STATUSSEN: StatusDef<string>[] = [
  ...AANVRAAG_STATUSSEN, ...OFFERTE_STATUSSEN, ...OPDRACHT_STATUSSEN, ...SERVICEDESK_ALLE_STATUSSEN,
]

/**
 * De fase waarin dit dossier zit. Op de desktop volgt die uit de route je erheen bracht
 * (/aanvragen, /offertes, …); mobiel heeft één dossierpagina, dus hij wordt hier afgeleid.
 *
 * Servicedesk eerst: die dossiers staan op `hoofdstatus = 'aanvraag'` maar hebben een eigen
 * ladder in een eigen kolom. Zelfde volgorde als `updateDossierSubstatus` in
 * `lib/dossiers/actions.ts`, anders schrijft het scherm naar een andere kolom dan het leest.
 */
export function dossierSectie(dossier: {
  hoofdstatus?: string | null
  servicedesk_substatus?: string | null
}): DossierSectie {
  if (dossier.servicedesk_substatus != null) return 'servicedesk'
  if (dossier.hoofdstatus === 'offerte') return 'offerte'
  if (dossier.hoofdstatus === 'opdracht') return 'opdracht'
  return 'aanvraag'
}

/** De substatus die bij deze fase hoort — voor servicedesk dus de servicedesk-kolom. */
export function actieveSubstatus(dossier: Dossier): string {
  const sd = (dossier as { servicedesk_substatus?: string | null }).servicedesk_substatus
  return sd ?? getDossierSubstatus(dossier)
}

/** Kleur bij een substatus-sleutel. Concrete hex, zodat color-mix in elke scope werkt. */
export function substatusKleur(s: string): string {
  if (['verloren', 'vervallen', 'afgewezen'].includes(s)) return '#e8453b'
  if (['gewonnen', 'offerte_gereed', 'financieel_afgesloten'].includes(s)) return '#009439'
  if ([
    'verzonden', 'nabellen', 'in_behandeling', 'mondelinge_toezegging',
    'onderhanden', 'uitvoering_gereed', 'loopt', 'ingepland', 'uitgezet',
  ].includes(s)) return '#2e90fa'
  return '#6b757c'
}

/**
 * Label + kleur voor een dossier-substatus (mobiele StatusBadge).
 *
 * Bij een servicedeskdossier hoort het label uit de ladder van dát dossier: `loopt` heet
 * op mutatiewerk "Onderhanden" en op dagelijks onderhoud "Loopt".
 */
export function dossierStatusBadge(dossier: Dossier): { label: string; color: string } {
  const s = actieveSubstatus(dossier)
  const lijst = dossierSectie(dossier) === 'servicedesk'
    ? servicedeskLadder(dossier as never)
    : ALLE_STATUSSEN
  const label = (lijst as StatusDef<string>[]).find(x => x.key === s)?.label
    ?? ALLE_STATUSSEN.find(x => x.key === s)?.label
    ?? s
  return { label, color: substatusKleur(s) }
}

/**
 * De statussen die je op een telefoon mag kiezen, met dezelfde fase-gating als de
 * statuskiezer op de desktop (`InformatieTab`): de huidige waarde staat er altijd bij, en
 * elke fase is in EVA te sturen — ook de servicedesk-statussen die de Bouw7-sync vult.
 *
 * Twee opdrachtstatussen ontbreken hier bewust. `financieel_gereed` loopt op de desktop
 * altijd langs de vier compleetheidscontroles (`FinancieelGereedDialog`) met een verplichte
 * verantwoording; dat scherm past niet op een telefoon, en zonder dat scherm zou de controle
 * met één tik te omzeilen zijn. `financieel_afgesloten` sluit het dossier definitief af en
 * hoort daarom net als op de desktop niet in een keuzelijst thuis.
 */
export function mobieleStatusopties(dossier: Dossier): StatusDef<string>[] {
  const sectie = dossierSectie(dossier)
  const huidig = actieveSubstatus(dossier)

  const basis: StatusDef<string>[] =
    sectie === 'aanvraag'    ? AANVRAAG_STATUSSEN :
    sectie === 'offerte'     ? OFFERTE_STATUSSEN  :
    sectie === 'servicedesk' ? servicedeskLadder(dossier as never) :
    OPDRACHT_STATUSSEN

  return basis.filter(s => {
    // De huidige stand staat er altijd bij, ook als je hem hier niet mag kiezen — anders
    // leest de kiezer een andere status voor dan het dossier heeft.
    if (s.key === huidig) return true
    if (sectie === 'opdracht') {
      return s.key !== 'financieel_gereed' && s.key !== 'financieel_afgesloten'
    }
    return true
  })
}

/** True als deze keuze het dossier definitief afsluit; het scherm vraagt dan door. */
export function sluitDossierAf(dossier: Dossier, substatus: string): boolean {
  return isAfsluitendeSubstatus(dossierSectie(dossier), substatus)
}
