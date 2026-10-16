import 'server-only'
import { periodeBereik, type UrenPeriode } from './types'
import { haalKostenInPeriode, haalKostenTeKeuren, type KostenPost } from './onkosten-goedkeuring'

/**
 * De ingediende kosten voor het bedrijfsbrede urenoverzicht (`/uren`).
 *
 * Los van `getAlleUren`: die haalt urenregels uit Bouw7, dit leest EVA's eigen tabel. Onkosten
 * gaan bewust niet naar Bouw7 (de hour-log daar kent geen geldbedragen), dus er is geen bron om
 * ze aan vast te knopen — het zijn twee lijsten naast elkaar over hetzelfde tijdvak.
 *
 * Elke post draagt zijn goedkeuring mee: open, goedgekeurd of afgekeurd, en bij wie hij ligt.
 * Uitbetalen doet de administratie op de goedgekeurde.
 */

export type OnkostenRegel = KostenPost

export type OnkostenOverzicht = {
  regels: OnkostenRegel[]
  totaal: number
}

export async function getOnkosten(periode: UrenPeriode): Promise<OnkostenOverzicht> {
  const { van, tot } = periodeBereik(periode)
  const regels = await haalKostenInPeriode(van, tot)
  return { regels, totaal: regels.reduce((s, r) => s + r.bedrag, 0) }
}

/** Wat er bij deze medewerker ligt om goed te keuren, los van de gekozen periode. */
export async function getKostenTeKeuren(medewerkerId: string): Promise<OnkostenRegel[]> {
  return haalKostenTeKeuren(medewerkerId)
}
