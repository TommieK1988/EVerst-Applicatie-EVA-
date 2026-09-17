/**
 * Herkomst van een actie: wie hem heeft aangemaakt, of waar hij vandaan komt.
 *
 * Niet elke actie komt van een mens. De Bouw7-sync, het postvak en de
 * herberekening van herhalende acties schrijven `aangemaakt_door` niet, en bij
 * een sjabloon dat via een trigger wordt geactiveerd is er per definitie niemand
 * die op de knop drukte. Zonder terugval zag je daar een streepje terwijl de
 * herkomst wél vastligt; vandaar deze afleiding, gedeeld door het detailpaneel
 * en de actie-tabellen zodat ze niet uit elkaar lopen.
 */
export type HerkomstBron = {
  aangemaakt_door: string | null
  bouw7_todo_id?: number | null
  mailintake_bericht_id?: string | null
}

/**
 * Leesbaar label voor "aangemaakt door". `naam` is de medewerkersnaam bij
 * `aangemaakt_door` (leeg als die niet te vinden is).
 *
 * Zonder naam is de actie niet met de hand aangemaakt: EVA schrijft
 * `aangemaakt_door` bij élke actie die iemand zelf aanmaakt of via een sjabloon
 * activeert. Wat overblijft komt uit een automatische route — een trigger, de
 * goedkeuringsketen, offertebewaking, debiteurenbeheer — en heet dus
 * "Automatisch", met Bouw7 en het postvak apart omdat die herkomst wél
 * herkenbaar op de actie staat.
 */
export function aanmakerLabel(bron: HerkomstBron, naam?: string | null): string {
  if (naam) return naam
  if (bron.bouw7_todo_id != null) return 'Bouw7'
  if (bron.mailintake_bericht_id) return 'Postvak'
  return 'Automatisch'
}

/**
 * `aanmakerLabel` als volzin voor het detailpaneel. De systeembronnen lezen niet
 * allemaal even soepel achter "Aangemaakt door", vandaar de eigen formulering.
 */
export function aanmakerZin(label: string | null): string | null {
  if (!label) return null
  if (label === 'Automatisch') return 'Automatisch aangemaakt'
  if (label === 'Bouw7')       return 'Aangemaakt in Bouw7'
  if (label === 'Postvak')     return 'Aangemaakt vanuit het postvak'
  return `Aangemaakt door ${label}`
}
