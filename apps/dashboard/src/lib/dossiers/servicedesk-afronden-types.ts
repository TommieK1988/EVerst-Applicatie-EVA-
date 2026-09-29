/**
 * Types voor het afronden van een servicedeskbon vanaf de telefoon (gereedmelding + pakbonnen).
 * Los van `servicedesk-afronden.ts`: dat is een 'use server'-module en die mag alleen async
 * functies exporteren.
 */

export type ServicedeskGereedmelding = {
  id: string
  uitgevoerdeWerkzaamheden: string
  handtekeningUrl: string | null
  getekendDoor: string | null
  gemeldDoorNaam: string | null
  gemeldOp: string
}

export type DossierPakbon = {
  id: string
  fotoUrl: string
  opmerking: string | null
  geuploadDoorNaam: string | null
  /** Van de ingelogde gebruiker zelf — alleen die mag hem op de telefoon weer weghalen. */
  isEigen: boolean
  geuploadOp: string
}

export type ServicedeskAfronding = {
  /** De laatste gereedmelding; eerdere blijven in de tabel als historie. */
  gereedmelding: ServicedeskGereedmelding | null
  pakbonnen: DossierPakbon[]
}
