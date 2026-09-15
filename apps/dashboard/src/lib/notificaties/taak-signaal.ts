/**
 * Wát er over je acties gemeld moet worden — en vooral: wanneer niet.
 *
 * WAAROM DIT BESTAAT. De eerste versie telde simpelweg "vandaag" en "over de datum"
 * en zette die telling in de sleutel, samen met de datum. Op echte data ging dat
 * meteen mis: vier mensen kregen op de eerste ochtend `44 over de datum`,
 * `43 over de datum`, `35 over de datum`, `16 over de datum` — zonder één actie die
 * die dag afmoest. Omdat de datum in de sleutel zat, zouden ze dat élke ochtend
 * opnieuw krijgen. Een melding die elke dag hetzelfde zegt over iets wat je allang
 * weet, is binnen een week behang; daarna leest niemand de andere meldingen meer.
 *
 * De regel die daaruit volgt: **een melding gaat over wat er verandert**. Een
 * bekende achterstand hoort op het scherm (Mijn taken), niet elke ochtend op je
 * telefoon. Gemeld wordt dus alleen:
 *
 *   * acties die vandaag afmoeten — dat is per definitie nieuws van vandaag;
 *   * acties die sinds de vorige melding over hun deadline zijn gegaan.
 *
 * Is er van allebei niets, dan blijft het stil, hoe groot de stapel ook is. De
 * stapel wordt wél als staartzin genoemd zodra er tóch een melding uitgaat, zodat
 * hij niet onzichtbaar wordt.
 *
 * Bewust los van `dagsignalen.ts` en zonder `server-only`: zo is deze afweging te
 * testen zonder database. Zie `taak-signaal.test.ts`.
 */

export type TaakKort = { id: string; titel: string }

export type TaakMelding = {
  titel: string
  body: string | null
  /** De ids die met deze melding zijn afgedaan; gaan als `stand` het geheugen in. */
  gemeldeIds: string[]
}

/**
 * @param vandaag   acties met deadline vandaag
 * @param teLaat    acties waarvan de deadline verstreken is
 * @param eerder    ids die een vorige melding al heeft afgedekt; `null` = nog nooit
 *                  gemeld, en dan geldt de bestaande achterstand als bekend. Zonder
 *                  die uitzondering krijgt iedereen bij de eerste run zijn hele
 *                  historie als "nieuw over de datum" op zijn telefoon.
 */
export function bepaalTaakMelding(
  vandaag: TaakKort[],
  teLaat: TaakKort[],
  eerder: string[] | null,
): TaakMelding | null {
  const alleIds = [...vandaag, ...teLaat].map(t => t.id)

  // Eerste keer: alles wat er nu ligt geldt als bekend, behalve wat vandaag afmoet.
  const bekend = new Set(eerder ?? teLaat.map(t => t.id))
  const nieuwTeLaat = teLaat.filter(t => !bekend.has(t.id))
  const restTeLaat = teLaat.length - nieuwTeLaat.length

  if (vandaag.length === 0 && nieuwTeLaat.length === 0) return null

  // Eén enkele actie en verder niets open: dan zegt de titel van die actie meer dan
  // een telling.
  if (vandaag.length + nieuwTeLaat.length === 1 && restTeLaat === 0) {
    const enige = vandaag[0] ?? nieuwTeLaat[0]
    return {
      titel: vandaag.length === 1 ? `Actie vandaag: ${enige.titel}` : `Actie over de datum: ${enige.titel}`,
      body: null,
      gemeldeIds: alleIds,
    }
  }

  const delen: string[] = []
  if (vandaag.length > 0) {
    delen.push(`${vandaag.length} ${vandaag.length === 1 ? 'actie' : 'acties'} met deadline vandaag`)
  }
  if (nieuwTeLaat.length > 0) {
    delen.push(`${nieuwTeLaat.length} ${nieuwTeLaat.length === 1 ? 'actie is' : 'acties zijn'} over de deadline`)
  }
  if (restTeLaat > 0) {
    delen.push(`nog ${restTeLaat} ouder openstaand`)
  }

  return {
    titel: vandaag.length > 0 ? 'Je acties van vandaag' : 'Acties over de deadline',
    body: delen.join(' · '),
    gemeldeIds: alleIds,
  }
}
