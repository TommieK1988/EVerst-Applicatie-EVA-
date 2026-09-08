/**
 * Lokale-tijd-guard voor Vercel Cron.
 *
 * Vercel Cron draait uitsluitend in UTC en volgt geen zomer-/wintertijd. Een cron die "elke dag
 * om 06:30 Amsterdam" moet draaien, verschuift daardoor een uur zodra de klok verzet wordt.
 *
 * De oplossing die EVA overal gebruikt: laat de cron op béide kandidaat-UTC-uren vuren en laat
 * alleen de firing door die op het bedoelde lokale uur valt. De andere is een bewuste no-op.
 */

/** Huidig uur in Europe/Amsterdam (0-23), DST-correct via Intl. */
export function amsterdamUur(now: Date = new Date()): number {
  const uur = new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'Europe/Amsterdam',
    hourCycle: 'h23',
    hour: '2-digit',
  }).format(now)
  return Number(uur)
}

/**
 * Valt dit moment binnen een van de bedoelde lokale uren? Zo nee, dan is dit de tegenhanger-firing
 * en hoort de cron over te slaan (met een 200, anders markeert Vercel de run als mislukt).
 */
export function binnenLokaalUur(doelUren: number[], now: Date = new Date()): boolean {
  return doelUren.includes(amsterdamUur(now))
}
