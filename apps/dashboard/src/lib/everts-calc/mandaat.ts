/**
 * De vaste tekstregels van een mandaatopdracht aan een onderaannemer.
 *
 * Een mandaat is een bovengrens, geen prijs: de partij werkt in regie en mag doorwerken tot het
 * bedrag, daarboven eerst overleggen. Bouw7 kent alleen contracten tegen vaste prijs, dus het
 * mandaat staat daar als contractbedrag. Zonder deze zinnen leest een onderaannemer dat bedrag als
 * aanneemsom en rekent hij het volledig af, ook als hij half zoveel uren maakte.
 *
 * Eén bron voor alle plekken waar de tekst landt: het voorbeeld in het opdrachtvenster, het
 * document ({bestelling.mandaat_regels} en vooraan in {bestelling.afspraken}) en de omschrijving
 * van het Bouw7-contract. Zo leest de partij overal precies hetzelfde.
 *
 * Bewust zonder server-only: het opdrachtvenster toont de regels live terwijl je typt.
 */

const EUR = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** Datum zoals hij op een opdracht hoort te staan: 4 oktober 2026. Leeg bij een onleesbare datum. */
function nlDatum(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Een bruikbaar mandaatbedrag, of null. Afgerond op centen; nul of negatief telt niet. */
export function geldigMandaat(n: unknown): number | null {
  const v = typeof n === 'string' ? Number(n) : typeof n === 'number' ? n : NaN
  if (!Number.isFinite(v) || v <= 0) return null
  return Math.round(v * 100) / 100
}

export function mandaatTekstregels(mandaat: number, opleverDatum?: string | null): string[] {
  const deadline = nlDatum(opleverDatum)
  return [
    'Deze opdracht wordt in regie uitgevoerd, op basis van werkelijk bestede uren en gebruikte materialen.',
    `Het mandaat bedraagt ${EUR.format(mandaat)} exclusief btw. Tot dit bedrag kan zonder overleg worden doorgewerkt.`,
    'Dreigt het mandaat overschreden te worden, stem dan eerst af met de uitvoerder voordat u verdergaat. Werk boven het mandaat zonder schriftelijk akkoord wordt niet vergoed.',
    ...(deadline ? [`Het werk moet uiterlijk ${deadline} gereed zijn.`] : []),
    'Het mandaat is een bovengrens en geen aanneemsom. Factureer de werkelijke kosten, met een urenverantwoording als bijlage.',
  ]
}

/** Dezelfde regels als één tekstblok, één regel per zin. */
export function mandaatTekst(mandaat: number, opleverDatum?: string | null): string {
  return mandaatTekstregels(mandaat, opleverDatum).join('\n')
}
