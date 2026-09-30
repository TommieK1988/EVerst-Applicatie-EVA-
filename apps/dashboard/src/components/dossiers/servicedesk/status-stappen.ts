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
 */
export type StatusStap = {
  /** Waar de bon heen gaat. */
  naar: ServicedeskSubstatus
  label: string
  /** Eén zin: wat deze stap betekent. Komt onder of naast de knop te staan. */
  uitleg: string
}

const STAPPEN: Partial<Record<ServicedeskSubstatus, StatusStap>> = {
  in_voorbereiding: {
    naar: 'loopt',
    label: 'Werk gestart',
    uitleg: 'Het werk is uitgezet of ingepland en de uitvoering loopt.',
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
 * Standen waarin het werk nog aan niemand is toegewezen. Alleen vanuit deze twee schuift een
 * bon door zodra er een opdracht uitgaat of iemand wordt ingepland; staat hij al op Onderhanden of
 * verder, dan is een tweede opdracht gewoon extra werk en geen stap terug.
 *
 * Wachten op opdrachtgever hoort erbij: wie in die stand toch al uitzet of inplant, heeft kennelijk
 * het akkoord binnen.
 */
const NOG_NIET_TOEGEWEZEN: ServicedeskSubstatus[] = ['nieuw', 'wacht_op_opdrachtgever']

/**
 * Waar een bon heen gaat zodra het werk wordt toegewezen (opdracht verstuurd of iemand
 * ingepland) — of niets, als hij niet hoort te verschuiven.
 *
 * Tot oktober 2026 waren dat twee kolommen (Uitgezet en Ingepland) die alleen op het bord voor
 * dagelijks onderhoud bestonden. Nu is het voor elke bon In voorbereiding.
 */
export function standNaToewijzing(
  substatus: ServicedeskSubstatus | null | undefined,
): ServicedeskSubstatus | undefined {
  if (!substatus || !NOG_NIET_TOEGEWEZEN.includes(substatus)) return undefined
  return 'in_voorbereiding'
}
