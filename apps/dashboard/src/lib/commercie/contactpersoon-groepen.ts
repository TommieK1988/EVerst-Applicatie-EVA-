/**
 * De dossiers van één contactpersoon, verdeeld zoals je ze aan de telefoon bespreekt:
 * aanvragen, offertes, opdrachten en servicedesk — plus wat niet doorging, apart.
 *
 * Indeling op de ruwe statuskolommen, niet op `fase`: die zet een financieel afgesloten
 * opdracht en een verloren offerte allebei op `afgesloten`. Hier hoort de eerste gewoon bij de
 * opdrachten van deze persoon (afgerond, onderaan) en de tweede bij wat niet doorging. Anders
 * dan op het klantbeeld is er geen apart blok voor uitgevoerd werk: een contactpersoon heeft er
 * hooguit een paar tientallen, en "alles wat we met hém deden" is hier juist de vraag.
 *
 * Niet-doorgegaan staat los zodat de totalen kloppen: een verloren offerte van een ton in het
 * offertetotaal maakt van dat getal een fantasie.
 *
 * Pure module (geen `server-only`): de test rekent ermee, en de types gaan naar de client.
 */
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import { isNietDoorgegaan, isWerkGereed } from './klantbeeld-types'

export type ContactDossier = RelatieDossier & {
  /**
   * Excl. btw. Lopend werk: de waarde volgens dezelfde rekenregel als de borden. Een afgeronde
   * servicedeskbon: het gefactureerde bedrag. `null` = geen bedrag bekend.
   */
  bedragExclBtw: number | null
}

export type ContactDossierGroepen = {
  aanvragen: ContactDossier[]
  offertes: ContactDossier[]
  opdrachten: ContactDossier[]
  servicedesk: ContactDossier[]
  nietDoorgegaan: ContactDossier[]
}

/** Is er op dit dossier nog iets gaande? Afgerond werk zakt in zijn blok naar onderen. */
export function isAfgerond(d: RelatieDossier): boolean {
  return d.fase === 'afgesloten' || isWerkGereed(d)
}

export function groepeerContactDossiers(dossiers: ContactDossier[]): ContactDossierGroepen {
  const groepen: ContactDossierGroepen = {
    aanvragen: [], offertes: [], opdrachten: [], servicedesk: [], nietDoorgegaan: [],
  }
  for (const d of dossiers) {
    if (isNietDoorgegaan(d)) groepen.nietDoorgegaan.push(d)
    // Een servicedeskbon draagt ook een hoofdstatus (meestal 'aanvraag'); de substatus wint.
    else if (d.servicedesk_substatus) groepen.servicedesk.push(d)
    else if (d.hoofdstatus === 'opdracht') groepen.opdrachten.push(d)
    else if (d.hoofdstatus === 'offerte') groepen.offertes.push(d)
    else groepen.aanvragen.push(d)
  }
  // Lopend vóór afgerond; binnen elk deel blijft de volgorde van de leeslaag (laatst gewijzigd
  // eerst) staan — `sort` is stabiel.
  for (const sleutel of ['aanvragen', 'offertes', 'opdrachten', 'servicedesk'] as const) {
    groepen[sleutel].sort((a, b) => Number(isAfgerond(a)) - Number(isAfgerond(b)))
  }
  return groepen
}

/** Som van de bekende bedragen; `null` als geen enkel dossier een bedrag heeft. */
export function totaalExclBtw(dossiers: ContactDossier[]): number | null {
  const bedragen = dossiers.map(d => d.bedragExclBtw).filter((b): b is number => b != null)
  if (bedragen.length === 0) return null
  return Math.round(bedragen.reduce((s, b) => s + b, 0) * 100) / 100
}
