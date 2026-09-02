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
// 5,5 uur tijd voor tijd erbij precies die 5,5 uur saldo. Er is geen aparte overuren-regel: die
// zou naast de gewerkte uren staan en in Bouw7 dubbel tellen.

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

/**
 * Waarom een week (nog) niet ingediend kan worden, of `null` als het mag.
 * De tekst is voor de medewerker bedoeld en zegt wat hij moet doen.
 */
export function indienBlokkade(
  totalen: WeekTotalen,
  contracturen: number,
  ongecodeerdeWerkregels = 0,
): string | null {
  if (contracturen <= 0) {
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
