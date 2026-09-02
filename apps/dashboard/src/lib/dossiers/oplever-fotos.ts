import type { OpleverFoto, OpleverPuntStatus } from '@everts/database'

/**
 * Voor/na-bewijs bij een opleverpunt.
 *
 * Deze module is bewust géén server-action: dezelfde regels worden toegepast op het mobiele
 * scherm (client), in het HTML-rapport en in de PDF. Eén plek dus, anders lopen die drie na de
 * eerste wijziging uit elkaar.
 */

export type VoorNaFotos = {
  voor: OpleverFoto[]
  na: OpleverFoto[]
}

/**
 * Splitst de foto's van een punt in een voor- en een na-kolom.
 *
 * `algemeen` telt als "voor". Dat is geen aanname over de inhoud maar een weergavekeuze: alle
 * foto's van vóór juli 2026 staan op `algemeen` omdat het `soort`-veld toen nog nergens werd
 * gevuld. Ze alsnog omzetten zou historie herschrijven die niemand meer kan controleren, en al
 * verzonden rapporten met terugwerkende kracht veranderen. Onbekend hoort dus links, bij het
 * probleem — niet rechts, waar het als bewijs van herstel zou lezen.
 */
export function splitsFotos(fotos: OpleverFoto[]): VoorNaFotos {
  return {
    voor: fotos.filter(f => f.soort !== 'na'),
    na: fotos.filter(f => f.soort === 'na'),
  }
}

/** Statussen waarbij je een na-foto verwacht: het punt is afgemeld als klaar. */
const AFGEROND: OpleverPuntStatus[] = ['opgelost', 'geaccepteerd']

/**
 * Is dit punt afgemeld zonder bewijs dat het verholpen is?
 *
 * Levert alleen een signaal op — nergens een blokkade. Er zijn punten waar een foto niets
 * toevoegt (een administratieve correctie, een afspraak die is nagekomen); de status blijft
 * daarmee vrij te zetten.
 */
export function bewijsOntbreekt(status: OpleverPuntStatus, fotos: OpleverFoto[]): boolean {
  return AFGEROND.includes(status) && !fotos.some(f => f.soort === 'na')
}
