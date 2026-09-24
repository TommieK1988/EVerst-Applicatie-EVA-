// Op welke dossiers mag je uren boeken? Eén regel voor de weekstaat én de prikklok.
//
// Twee soorten werk:
//  - een lopende opdracht: van werkvoorbereiding tot en met uitvoering gereed. Ervóór is er nog
//    niets te doen, erna (financieel gereed/afgesloten) horen er geen nieuwe uren meer op;
//  - een open servicedeskbon. Die staan in EVA op hoofdstatus 'aanvraag' met een eigen
//    servicedesk-substatus, en werden daardoor eerder nergens aangeboden — terwijl de monteur er
//    gewoon op werkt. Pas bij "kosten compleet" is de bon dicht voor nieuwe uren.
//
// In beide gevallen is een Bouw7-project nodig: daar gaan de uren uiteindelijk naartoe.
//
// Bewust geen 'use server': dit zijn constanten en een pure functie, die ook in 'use server'-
// modules geïmporteerd moeten kunnen worden.

export const BOEKBARE_OPDRACHT_STATUSSEN = ['werkvoorbereiding', 'onderhanden', 'uitvoering_gereed'] as const

export const GESLOTEN_SERVICEDESK_STATUSSEN = ['kosten_compleet', 'financieel_gereed'] as const

/**
 * Hetzelfde als `isBoekbaarDossier`, als PostgREST-filter voor `.or(...)`. Combineer met
 * `.eq('gearchiveerd', false)` en `.not('bouw7_id', 'is', null)`.
 */
export const BOEKBAAR_FILTER = [
  `and(hoofdstatus.eq.opdracht,opdracht_substatus.in.(${BOEKBARE_OPDRACHT_STATUSSEN.join(',')}))`,
  `and(servicedesk_substatus.not.is.null,servicedesk_substatus.not.in.(${GESLOTEN_SERVICEDESK_STATUSSEN.join(',')}))`,
].join(',')

export type BoekbaarVelden = {
  hoofdstatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  gearchiveerd: boolean | null
  bouw7_id: string | number | null
}

export function isServicedeskBon(d: Pick<BoekbaarVelden, 'servicedesk_substatus'>): boolean {
  return d.servicedesk_substatus != null
}

export function isBoekbaarDossier(d: BoekbaarVelden): boolean {
  if (d.gearchiveerd || d.bouw7_id == null) return false
  if (isServicedeskBon(d)) {
    return !(GESLOTEN_SERVICEDESK_STATUSSEN as readonly string[]).includes(d.servicedesk_substatus ?? '')
  }
  return d.hoofdstatus === 'opdracht'
    && (BOEKBARE_OPDRACHT_STATUSSEN as readonly string[]).includes(d.opdracht_substatus ?? '')
}
