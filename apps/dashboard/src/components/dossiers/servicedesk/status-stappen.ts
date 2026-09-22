import type { ServicedeskSubstatus } from '../types'

/**
 * De vervolgstap die uit een stand volgt: één knop, die zegt wat er gebeurd is.
 *
 * Alleen de overgangen die niets méér zijn dan een vaststelling. "Het werk is begonnen" en "het
 * is klaar" zijn dat; ze vragen geen scherm, alleen iemand die het weet. Wat wél een scherm
 * vraagt staat hier bewust niet in:
 *
 * - **Uitzetten en inplannen** volgen uit een handeling (een opdracht versturen, iemand op de
 *   planning zetten), niet uit een knop. Die status hoort bij de daad, niet bij de klik.
 * - **Financieel gereed** heeft al een eigen weg met vier controles en een verplichte
 *   toelichting (`FinancieelGereedDialog`). Die hier nabouwen zou een tweede, lossere route
 *   naast een bestaande strengere zetten — precies hoe twee waarheden ontstaan.
 *
 * Beide ladders delen deze sleutels, dus één tabel volstaat; alleen de labels op het bord
 * verschillen per ladder (zie `SERVICEDESK_MUTATIE_STATUSSEN`).
 */
export type StatusStap = {
  /** Waar de bon heen gaat. */
  naar: ServicedeskSubstatus
  label: string
  /** Eén zin: wat deze stap betekent. Komt onder of naast de knop te staan. */
  uitleg: string
}

const STAPPEN: Partial<Record<ServicedeskSubstatus, StatusStap>> = {
  uitgezet: {
    naar: 'loopt',
    label: 'Werk gestart',
    uitleg: 'De onderaannemer is begonnen.',
  },
  ingepland: {
    naar: 'loopt',
    label: 'Werk gestart',
    uitleg: 'De eerste monteur staat op de bon.',
  },
  in_voorbereiding: {
    naar: 'loopt',
    label: 'Werk gestart',
    uitleg: 'De voorbereiding is rond en de uitvoering loopt.',
  },
  loopt: {
    naar: 'uitgevoerd',
    label: 'Gereedmelden',
    uitleg: 'Het werk op locatie is klaar.',
  },
  uitgevoerd: {
    naar: 'kosten_compleet',
    label: 'Kosten compleet',
    uitleg: 'Alle uren en facturen staan erop; de bon kan naar de facturatie.',
  },
}

/** De vervolgstap vanuit deze stand, of niets als er geen vaste volgende stap is. */
export function volgendeStap(substatus: ServicedeskSubstatus | null | undefined): StatusStap | undefined {
  return substatus ? STAPPEN[substatus] : undefined
}

/**
 * Standen waarin het werk nog aan niemand is toegewezen. Alleen vanuit deze drie schuift een
 * bon door zodra er een opdracht uitgaat of iemand wordt ingepland; staat hij al op Loopt of
 * verder, dan is een tweede opdracht gewoon extra werk en geen stap terug.
 */
const NOG_NIET_TOEGEWEZEN: ServicedeskSubstatus[] = ['nieuw', 'mandaat_verhoging', 'offerte_uitgebracht']

/**
 * Waar een bon heen gaat zodra het werk wordt toegewezen — of niets, als hij niet hoort te
 * verschuiven.
 *
 * **De reden dat dit een functie is en geen regel in de aanroeper:** `uitgezet` en `ingepland`
 * bestaan alleen in de onderhoudsladder. Zou een mutatiebon op zo'n stand worden gezet, dan valt
 * hij van het bord: het mutatiebord kent die kolommen niet en toont hem dus nergens meer. Dat is
 * geen zichtbare fout maar een verdwenen dossier.
 *
 * Mutatiewerk heeft die stap ook niet nodig: daar gaat uitbesteden en inplannen binnen
 * "In voorbereiding" en is Onderhanden de volgende kolom.
 */
export function standNaToewijzing(
  soort: 'uitgezet' | 'ingepland',
  { isMutatie, substatus }: { isMutatie: boolean; substatus: ServicedeskSubstatus | null | undefined },
): ServicedeskSubstatus | undefined {
  if (isMutatie) return undefined
  if (!substatus || !NOG_NIET_TOEGEWEZEN.includes(substatus)) return undefined
  return soort
}
