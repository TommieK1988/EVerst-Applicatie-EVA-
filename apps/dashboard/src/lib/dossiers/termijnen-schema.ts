/**
 * dossiers/termijnen-schema.ts
 *
 * De omzetting van een termijnschema naar de regels die Bouw7 krijgt. Pure
 * functies, geen database en geen netwerk.
 *
 * WAAROM DIT EEN EIGEN BESTAND IS
 * Deze rekenregel stond alleen in TermijnschemaVenster.tsx, een 'use client'-
 * component. Zodra de mailintake termijnen zelf aanmaakt, moet die exact hetzelfde
 * rekenen. Kopiëren zou werken tot iemand één van de twee aanpast — en een
 * afwijking in de btw-splitsing is onzichtbaar tot de eerste factuur de deur uit is.
 *
 * **Btw splitst het schema.** Een Bouw7-termijn draagt precies één tarief. Kent de
 * opdracht er meer — 9% over arbeid, 21% over materiaal — dan valt elke termijn
 * uiteen in een termijn per tarief, in de verhouding die in de offerte staat. Eén
 * tarief over de hele staat zetten zou btw opleveren die niemand zo heeft
 * geoffreerd, en dat rolt door naar de factuur.
 */

/* De typen staan hier en niet in termijnen.ts: dat bestand draagt 'use server', en
 * daar hoort geen module van af te hangen die ook vanuit de intake wordt gebruikt. */

/** Eén regel van een termijnschema: wat er verschuldigd is, en welk deel van de grondslag. */
export type TermijnschemaRegel = { omschrijving: string; percentage: number }

/** Eén btw-tarief met het deel van de offerte dat eronder valt. */
export type BtwAandeel = {
  /** `btw_tarieven.bouw7_id` — waar Bouw7 de termijn aan ophangt. */
  bouw7TariefId: number | null
  label: string
  /** Te heffen percentage (verlegd heft hier zijn nominale tarief; zie lib/stamdata/btw). */
  pct: number
  /** Deel van de offertegrondslag onder dit tarief, 0–1. */
  aandeel: number
}

/** Eén termijn zoals hij in Bouw7 komt te staan: eigen bedrag, eigen btw-tarief. */
export type TermijnRij = TermijnschemaRegel & { btwTariefBouw7Id: number | null }

/**
 * Zet een termijnschema om in de termijnen die Bouw7 krijgt.
 *
 * Kent de offerte meerdere btw-tarieven, dan valt elke schema-regel uiteen in een
 * regel per tarief: "Aanbetaling" met 30% wordt bij een verdeling 40/60 een regel
 * van 12% tegen het ene tarief en 18% tegen het andere. De laatste regel neemt het
 * afrondingsverschil op, zodat het totaal exact 100% blijft.
 */
export function bouwTermijnrijen(
  schema: TermijnschemaRegel[],
  verdeling: BtwAandeel[],
  standaardTariefId: number | null,
): TermijnRij[] {
  if (schema.length === 0) return []

  const groepen = verdeling.length > 0
    ? verdeling
    : [{ bouw7TariefId: standaardTariefId, label: '', pct: 0, aandeel: 1 } as BtwAandeel]

  const rijen: TermijnRij[] = []
  for (const regel of schema) {
    for (const groep of groepen) {
      rijen.push({
        omschrijving: groepen.length > 1 && groep.label
          ? `${regel.omschrijving || 'Termijn'} (${groep.label})`
          : regel.omschrijving,
        percentage: Math.round(regel.percentage * groep.aandeel * 10000) / 10000,
        btwTariefBouw7Id: groep.bouw7TariefId,
      })
    }
  }

  const somOpEen = rijen.slice(0, -1).reduce((s, r) => s + r.percentage, 0)
  const laatste = rijen[rijen.length - 1]
  laatste.percentage = Math.round((100 - somOpEen) * 10000) / 10000
  return rijen
}

/**
 * Verdeelt de grondslag over de termijnen. De laatste termijn absorbeert het
 * afrondingsverschil — anders blijft er een cent over die op geen enkele factuur
 * terechtkomt.
 */
export function termijnBedragen(rijen: TermijnRij[], grondslag: number): number[] {
  const centen = Math.round(grondslag * 100)
  let verdeeld = 0
  return rijen.map((r, i) => {
    const eigen = i === rijen.length - 1 ? centen - verdeeld : Math.round(centen * r.percentage / 100)
    verdeeld += eigen
    return eigen / 100
  })
}
