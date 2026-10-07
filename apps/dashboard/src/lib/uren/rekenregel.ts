// De rekenregel van de urenverantwoording, als pure functies.
//
// Bewust los van `weekstaat.ts`: die is een `'use server'`-module en daar kan alleen async uit
// geëxporteerd worden. Hier staat de logica die zowel de weekstaat als de goedkeurschermen
// nodig hebben, en die zonder request-context te toetsen is.
//
// DE REGEL. Een week is indienbaar zodra de som van alle regels de contracturen haalt — de norm
// is een ondergrens, geen exacte match, want meer uren draaien mag. Het tijd-voor-tijdsaldo groeit
// met alles behalve tijd voor tijd zelf:
//
//   indienbaar    : som(alle regels) >= contracturen - tolerantie
//   saldo-mutatie : som(alle regels) - som(tijd voor tijd) - contracturen
//
// Zo bouwt 45 uur werk bij een contract van 37,5 een saldo van +7,5 op, en kost 32 uur werk met
// 5,5 uur tijd voor tijd erbij precies die 5,5 uur saldo.
//
// OVERUREN. Voor de vierkantscontrole (Bouw7, loonadministratie) moet een week precies op de
// contracturen uitkomen. Overuren krijgen daarom een automatische regel tijd voor tijd met MIN de
// overuren (`verdeelOveruren`): 45 uur werk + (-7,5) tijd voor tijd = 37,5. Aan het saldo verandert
// niets -- tijd voor tijd telt daar niet mee, dus het blijft 45 - 37,5 = +7,5.

export type UrenCategorie = 'werk' | 'afwezig' | 'tijd_voor_tijd' | 'feestdag'

export type TelbareRegel = {
  uren: number
  categorie: UrenCategorie
}

export type WeekTotalen = {
  totaalUren: number
  tijdVoorTijdUren: number
  /** Hoeveel er nog te verantwoorden is; 0 als de norm gehaald is. */
  tekort: number
  /** Wat deze week met het tijd-voor-tijdsaldo doet. Kan negatief zijn. */
  saldoMutatie: number
}

/** Cent-nauwkeurig afronden; uren komen als numeric(5,2) uit de database. */
export const rondUren = (n: number) => Math.round(n * 100) / 100

export function berekenWeekTotalen(
  regels: TelbareRegel[],
  contracturen: number,
  tolerantie = 0,
): WeekTotalen {
  const totaalUren = rondUren(regels.reduce((s, r) => s + r.uren, 0))
  const tijdVoorTijdUren = rondUren(
    regels.filter(r => r.categorie === 'tijd_voor_tijd').reduce((s, r) => s + r.uren, 0),
  )
  return {
    totaalUren,
    tijdVoorTijdUren,
    tekort: rondUren(Math.max(0, contracturen - tolerantie - totaalUren)),
    saldoMutatie: rondUren(totaalUren - tijdVoorTijdUren - contracturen),
  }
}

/** `uren_regels.bron` van de automatische overurenregel; die zet EVA neer, niet de medewerker. */
export const OVERUREN_BRON = 'auto_overuren'

export type OverurenRegel = { datum: string; uren: number }

/**
 * De automatische tijd-voor-tijdregels voor de overuren van een week (uren negatief), of `[]`.
 *
 * `regels` zijn alle regels van de week BEHALVE eerdere automatische overurenregels. Overuren
 * gelden per week: wie maandag 10 en dinsdag 6 uur werkt bij 8 per dag, heeft er geen. Wat er
 * per week over is, gaat op de dagen waarop meer gewerkt is dan de roosterdag (`dagNormen`; een
 * dag zonder norm, zoals zaterdag, telt helemaal als meer). Van achter naar voren: de laatste
 * dagen vullen de week aan. Blijft er dan nog iets over -- de bevroren weeknorm wijkt af van de
 * som van de roosterdagen -- dan komt dat op de laatste dag met uren.
 */
export function verdeelOveruren(
  regels: Array<{ datum: string; uren: number }>,
  dagNormen: Record<string, number>,
  contracturen: number,
): OverurenRegel[] {
  const totaal = rondUren(regels.reduce((s, r) => s + r.uren, 0))
  let rest = rondUren(totaal - contracturen)
  if (contracturen <= 0 || rest <= 0) return []

  const perDag = new Map<string, number>()
  for (const r of regels) perDag.set(r.datum, rondUren((perDag.get(r.datum) ?? 0) + r.uren))
  const dagen = [...perDag.keys()].sort().reverse()

  const uit = new Map<string, number>()
  for (const datum of dagen) {
    if (rest <= 0) break
    const meer = rondUren((perDag.get(datum) ?? 0) - (dagNormen[datum] ?? 0))
    if (meer <= 0) continue
    const deel = Math.min(meer, rest)
    uit.set(datum, deel)
    rest = rondUren(rest - deel)
  }
  if (rest > 0 && dagen.length) uit.set(dagen[0], rondUren((uit.get(dagen[0]) ?? 0) + rest))

  return [...uit.entries()]
    .map(([datum, uren]) => ({ datum, uren: -uren }))
    .sort((a, b) => a.datum.localeCompare(b.datum))
}

/**
 * Waarom een week (nog) niet ingediend kan worden, of `null` als het mag.
 * De tekst is voor de medewerker bedoeld en zegt wat hij moet doen.
 */
export function indienBlokkade(
  totalen: WeekTotalen,
  contracturen: number,
  ongecodeerdeWerkregels = 0,
  /** Externen (ZZP) hebben geen norm: elke week met uren is indienbaar. */
  zonderNorm = false,
): string | null {
  if (contracturen <= 0 && !zonderNorm) {
    return 'Er staan geen contracturen voor je ingesteld. Vraag de planning om je rooster in te vullen.'
  }
  if (totalen.totaalUren <= 0) return 'Je hebt nog geen uren ingevuld.'
  if (totalen.tekort > 0) {
    return `Nog ${totalen.tekort.toLocaleString('nl-NL')} uur te verantwoorden.`
  }
  if (ongecodeerdeWerkregels > 0) {
    return ongecodeerdeWerkregels === 1
      ? '1 regel mist nog een project of bewakingscode.'
      : `${ongecodeerdeWerkregels} regels missen nog een project of bewakingscode.`
  }
  return null
}
