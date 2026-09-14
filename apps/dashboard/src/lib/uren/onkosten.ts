/**
 * De kostensoorten van de weekstaat, en de regels die eruit volgen.
 *
 * Bewust één bestand voor zowel de sheet als de server-action: welke velden verplicht zijn en
 * hoe een kilometervergoeding gerekend wordt stond eerder verspreid over de migratie, twee
 * unions en twee labellijsten. De sheet gebruikt deze functies om de knop te blokkeren en het
 * bedrag alvast te tonen; de server-action gebruikt dezelfde functies als de echte poort.
 *
 * Geen 'server-only': dit draait ook in de browser.
 */

export type OnkostenSoort = 'parkeren' | 'reiskosten' | 'overig'
export type Vervoermiddel = 'auto' | 'bromfiets' | 'ov'

export const ONKOSTEN_SOORTEN = [
  { waarde: 'parkeren', label: 'Parkeren' },
  { waarde: 'reiskosten', label: 'Reiskosten' },
  { waarde: 'overig', label: 'Overig' },
] as const satisfies readonly { waarde: OnkostenSoort; label: string }[]

export const VERVOERMIDDELEN = [
  { waarde: 'auto', label: 'Auto', perKm: true },
  { waarde: 'bromfiets', label: 'Bromfiets', perKm: true },
  { waarde: 'ov', label: 'OV', perKm: false },
] as const satisfies readonly { waarde: Vervoermiddel; label: string; perKm: boolean }[]

export const ONKOSTEN_LABEL: Record<OnkostenSoort, string> = {
  parkeren: 'Parkeren',
  reiskosten: 'Reiskosten',
  overig: 'Overige kosten',
}

export const VERVOERMIDDEL_LABEL: Record<Vervoermiddel, string> = {
  auto: 'Auto',
  bromfiets: 'Bromfiets',
  ov: 'OV',
}

/** De kilometervergoedingen uit de uren-instellingen. */
export type KmTarieven = { auto: number; bromfiets: number }

export function isOnkostenSoort(v: unknown): v is OnkostenSoort {
  return v === 'parkeren' || v === 'reiskosten' || v === 'overig'
}

export function isVervoermiddel(v: unknown): v is Vervoermiddel {
  return v === 'auto' || v === 'bromfiets' || v === 'ov'
}

/** Reist de medewerker op eigen gelegenheid? Dan rekent EVA per kilometer. */
export function rekentPerKm(vervoermiddel: Vervoermiddel | null): boolean {
  return vervoermiddel === 'auto' || vervoermiddel === 'bromfiets'
}

/**
 * Vult de medewerker het bedrag zelf in?
 *
 * Bij auto en bromfiets niet: daar is het bedrag een uitkomst van kilometers × tarief, en een
 * zelf ingevuld bedrag zou die afspraak stilzwijgend omzeilen.
 */
export function bedragZelfInvullen(soort: OnkostenSoort, vervoermiddel: Vervoermiddel | null): boolean {
  return !(soort === 'reiskosten' && rekentPerKm(vervoermiddel))
}

/**
 * Is een foto van het bonnetje verplicht?
 *
 * Overal waar de medewerker zelf een bedrag noemt, dus alles behalve auto en bromfiets — daar
 * is de kilometerstand het bewijs en bestaat er geen bon.
 */
export function bonVerplicht(soort: OnkostenSoort, vervoermiddel: Vervoermiddel | null): boolean {
  return bedragZelfInvullen(soort, vervoermiddel)
}

/** Kilometers × tarief, afgerond op centen. De enige plek waar dat gerekend wordt. */
export function berekenKmBedrag(
  km: number,
  vervoermiddel: Vervoermiddel | null,
  tarieven: KmTarieven,
): number {
  if (!rekentPerKm(vervoermiddel)) return 0
  const tarief = vervoermiddel === 'auto' ? tarieven.auto : tarieven.bromfiets
  return Math.round(km * tarief * 100) / 100
}

/**
 * Wat er nog mist voordat deze kostenpost opgeslagen mag worden, of null als hij klaar is.
 *
 * Eén lijst met eisen voor de sheet én de server-action, zodat het scherm nooit iets toestaat
 * wat de server daarna afwijst — of andersom.
 */
export function controleerOnkosten(invoer: {
  soort: OnkostenSoort
  vervoermiddel: Vervoermiddel | null
  km: number | null
  bedrag: number | null
  heeftBon: boolean
}): string | null {
  const { soort, vervoermiddel, km, bedrag, heeftBon } = invoer

  if (soort === 'reiskosten' && !vervoermiddel) return 'Kies waarmee je gereisd hebt.'
  if (soort !== 'reiskosten' && vervoermiddel) return 'Een vervoermiddel hoort alleen bij reiskosten.'

  if (rekentPerKm(vervoermiddel)) {
    if (km == null || !(km > 0)) return 'Vul het aantal kilometers in.'
  } else {
    if (bedrag == null || !(bedrag > 0)) return 'Vul een bedrag in.'
  }

  if (bonVerplicht(soort, vervoermiddel) && !heeftBon) {
    return vervoermiddel === 'ov'
      ? 'Voeg een foto van je kaartje of bonnetje toe.'
      : 'Voeg een foto van het bonnetje toe.'
  }

  return null
}
