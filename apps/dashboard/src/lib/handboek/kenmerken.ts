/**
 * Kenmerken — wie ziet welk stuk van het personeelshandboek.
 *
 * Puur en client-veilig (géén 'server-only'): de beheer-UI rendert hier
 * checkboxen mee, en het mobiele scherm bouwt er zijn zoekindex mee.
 *
 * De inhoud verwijst nooit rechtstreeks naar een kolom uit `medewerkers`, maar
 * altijd naar een kenmerk-string. Dat is de verzekering tegen het moment waarop
 * `extern` te grof blijkt: komt er ooit een `contractvorm`-kolom (zzp vs.
 * uitzend), dan verandert alleen `handboek_kenmerken()` in de database — niet
 * de 162 blokken tekst.
 */

export const HANDBOEK_KENMERKEN = [
  {
    key: 'intern',
    label: 'Eigen personeel',
    uitleg: 'Iedereen behalve de flexkrachten op de bouw — dus ook ingehuurd kantoorpersoneel',
  },
  {
    key: 'extern',
    label: 'Flexkrachten op de bouw',
    // Bewust niet "iedereen die extern staat": `medewerkers.extern` gaat over de
    // contractvorm en staat ook aan bij ingehuurde directie- en
    // projectbureaumensen, voor wie het volledige handboek gewoon geldt. Het
    // Flexkrachten-handboek is geschreven voor ingehuurde vakmensen op de bouw.
    uitleg: 'Ingehuurd én op de afdeling Uitvoering (uitzend, zzp, onderaanneming)',
  },
  {
    key: 'kantoor',
    label: 'Kantoor',
    uitleg: 'Directie, Projectbureau en Ondersteunend — zij zien het volledige handboek',
  },
  {
    key: 'voertuig',
    label: 'Heeft auto of bus',
    uitleg: 'Staat in het wagenpark als bestuurder op een voertuig',
  },
] as const

export type VastKenmerk = (typeof HANDBOEK_KENMERKEN)[number]['key']

/**
 * Kenmerk voor een werkmaatschappij. De codes (001 Everts Onderhoudsschilders,
 * 004 Dakplan, 007 Morgenstond) staan in `bedrijfsgegevens`; de beheer-UI haalt
 * de lijst daar op in plaats van hem hier te herhalen.
 */
export function werkmaatschappijKenmerk(code: string): string {
  return `werkmaatschappij:${code}`
}

/** Alles wat zichtbaarheid kan sturen, draagt deze twee lijsten. */
export type Zichtbaarheid = {
  /** Leeg = iedereen. Anders: zichtbaar zodra de lezer ÉÉN van deze kenmerken heeft. */
  zichtbaar_voor: string[]
  /** Wint altijd van `zichtbaar_voor`. */
  verborgen_voor: string[]
}

/**
 * Mag deze lezer dit item zien?
 *
 * `zichtbaar_voor` is een OR. Een EN maak je met de uitsluitlijst: het
 * hoofdstuk "Auto of bus" staat op `zichtbaar_voor: ['voertuig']` plus
 * `verborgen_voor: ['extern']` en komt zo bij eigen personeel mét een auto
 * terecht. Verzin daar geen samengesteld kenmerk voor — dan groeit de lijst
 * met elke combinatie mee.
 *
 * Dit is de simulatie voor het "Bekijk als"-scherm en voor het bouwen van de
 * zoekindex. Voor echte lezers is de RLS-policy de poortwachter; zie
 * `handboek_kenmerken()` in migratie 20260914b.
 */
export function isZichtbaar(item: Zichtbaarheid, kenmerken: ReadonlySet<string>): boolean {
  if (item.verborgen_voor.some((k) => kenmerken.has(k))) return false
  return item.zichtbaar_voor.length === 0 || item.zichtbaar_voor.some((k) => kenmerken.has(k))
}

/** Leesbare omschrijving van een zichtbaarheidsregel, voor badges in het beheer. */
export function omschrijfZichtbaarheid(
  item: Zichtbaarheid,
  labels: Record<string, string> = {},
): string {
  const naam = (k: string) =>
    labels[k] ?? HANDBOEK_KENMERKEN.find((x) => x.key === k)?.label ?? k

  const toon = item.zichtbaar_voor.length
    ? `Alleen ${item.zichtbaar_voor.map(naam).join(' of ')}`
    : 'Iedereen'
  if (!item.verborgen_voor.length) return toon
  return `${toon}, behalve ${item.verborgen_voor.map(naam).join(' en ')}`
}
