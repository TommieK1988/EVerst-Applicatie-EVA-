/**
 * De stand van het mandaat op een servicedeskbon: hoeveel er van het afgesproken maximum op is.
 *
 * Een bon voor dagelijks onderhoud komt binnen met een mandaat — het bedrag waarbinnen we zonder
 * verder overleg mogen uitvoeren. Tot september 2026 kende EVA alleen "binnen" en "overschreden",
 * en het overschrijden zag je pas als het al gebeurd was. Dat is precies te laat: op dat moment
 * staat het werk er al of is de opdracht al uitgezet.
 *
 * Daarom drie standen in plaats van twee, met een waarschuwing vóór de grens.
 *
 * **Signaleren, niet blokkeren.** Boven het mandaat wordt niets tegengehouden: het werk op straat
 * gaat door en de bon blijft bewerkbaar. Wie doorgaat weet wat hij doet; wie het niet wist, ziet
 * het nu op tijd. Blokkeren zou door de gedeelde bestelpoort heen moeten grijpen, die ook voor
 * opdrachten geldt.
 */

/** Vanaf welk percentage van het mandaat de balk waarschuwt. */
export const MANDAAT_WAARSCHUWING_PCT = 80

export type MandaatStand =
  /** Geen mandaat ingevuld — dan valt er niets te bewaken. */
  | 'geen'
  /** Ruim binnen het mandaat. */
  | 'binnen'
  /** Op of over de waarschuwingsgrens, maar nog binnen het mandaat. */
  | 'bijna'
  /** Boven het mandaat. */
  | 'over'

export type MandaatInvoer = {
  /** Het afgesproken maximum, excl. btw. */
  mandaat: number | null
  /** Wat er tot nu toe op de bon staat: geboekte verkoopwaarde + uitgezette opdrachten. */
  totaal: number
  /** Waarschuwingsgrens in procenten; leeg = `MANDAAT_WAARSCHUWING_PCT`. */
  waarschuwingPct?: number
}

/**
 * Een mandaat van nul of minder telt als "niet ingevuld".
 *
 * Nul is geen afspraak maar een leeg veld dat toevallig een getal werd — bijvoorbeeld doordat
 * iemand het invoerveld leegmaakte en er een 0 in achterbleef. Zou nul als echt mandaat gelden,
 * dan stond élke bon met een nulmandaat meteen op rood, en dan kijkt niemand meer naar de kleur.
 */
export function mandaatStand({ mandaat, totaal, waarschuwingPct }: MandaatInvoer): MandaatStand {
  if (mandaat == null || mandaat <= 0) return 'geen'
  if (totaal > mandaat) return 'over'
  const grens = mandaat * ((waarschuwingPct ?? MANDAAT_WAARSCHUWING_PCT) / 100)
  return totaal >= grens ? 'bijna' : 'binnen'
}

/**
 * Hoe vol de balk staat, 0–100.
 *
 * Afgekapt op 100: een balk die buiten zijn bak loopt zegt niets extra's, en het getal ernaast
 * vertelt al hoeveel het is. Het gaat om "vol", niet om "hoeveel te vol".
 */
export function mandaatVulling({ mandaat, totaal }: Pick<MandaatInvoer, 'mandaat' | 'totaal'>): number {
  if (mandaat == null || mandaat <= 0) return 0
  return Math.max(0, Math.min(100, (totaal / mandaat) * 100))
}

/** Wat er nog binnen het mandaat past; negatief als het eroverheen is. */
export function mandaatRuimte({ mandaat, totaal }: Pick<MandaatInvoer, 'mandaat' | 'totaal'>): number | null {
  if (mandaat == null || mandaat <= 0) return null
  return Math.round((mandaat - totaal) * 100) / 100
}
