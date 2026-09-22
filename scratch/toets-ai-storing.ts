/**
 * Toets op het onderscheid tussen "de AI ligt eruit" en "deze mail lukt niet".
 *
 *   npx tsx scratch/toets-ai-storing.ts
 *
 * Het onderscheid bepaalt wat er met de post gebeurt. Fout geraden en het gaat
 * beide kanten op mis: een storing die als mislukking telt souppert drie pogingen
 * per mail op en legt de hele stapel bij een mens neer met een brok JSON erbij;
 * een mail die echt onleesbaar is en als storing telt, blokkeert de hele wachtrij.
 */

import { bepaalAiStoring } from '../apps/dashboard/src/lib/mailintake/ai-storing'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

console.log('\n── De fout die dit heeft aangezwengeld ──────────────────────')
// Letterlijk zoals hij in mailintake_berichten.laatste_fout stond.
const ECHT = '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit '
  + 'balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or '
  + 'purchase credits."},"request_id":"req_011CfJAhm6TfdxkbpNMLf9eU"}'
const s = bepaalAiStoring(ECHT)
toets('wordt herkend als storing', s !== null)
toets('en wel als tegoed', s?.soort === 'tegoed', s?.soort)
toets('de uitleg noemt geen statuscode of JSON',
  Boolean(s && !/[{}]|\b400\b/.test(s.uitleg)), s?.uitleg)

console.log('\n── Andere storingen ─────────────────────────────────────────')
const soort = (f: string) => bepaalAiStoring(f)?.soort ?? null
toets('ontbrekende sleutel', soort('ANTHROPIC_API_KEY ontbreekt') === 'sleutel')
toets('401', soort('401 {"error":{"message":"invalid x-api-key"}}') === 'sleutel')
toets('403', soort('403 Forbidden') === 'sleutel')
toets('429 rate limit', soort('429 rate_limit_error: rate limit exceeded') === 'te_druk')
toets('overloaded', soort('Overloaded') === 'te_druk')
toets('529', soort('529 overloaded_error') === 'te_druk')
toets('500', soort('500 Internal Server Error') === 'onbereikbaar')
toets('netwerk weg', soort('fetch failed') === 'onbereikbaar')
toets('timeout', soort('ETIMEDOUT') === 'onbereikbaar')

console.log('\n── Wat aan de mail ligt, blijft aan de mail liggen ──────────')
toets('antwoord paste niet in de ruimte',
  bepaalAiStoring('Het model kwam niet uit met de ruimte voor het antwoord; het formulier zou half ingevuld zijn.') === null)
toets('geen formulier terug',
  bepaalAiStoring('Het model leverde geen ingevuld formulier.') === null)
toets('schema klopt niet',
  bepaalAiStoring('Antwoord voldeed niet aan het schema: klant_naam verwacht string') === null)
toets('bijlage te groot',
  bepaalAiStoring('request too large: 40 MB') === null)
toets('lege fout', bepaalAiStoring(null) === null)
toets('lege tekst', bepaalAiStoring('') === null)

console.log('\n── De tekst wint van de code ────────────────────────────────')
// "credit balance" komt binnen als een 400, en een kale 400 is juist wél een
// probleem met het verzoek zelf. Zou de code voorgaan, dan was dit een mislukking.
toets('400 met credit balance is een storing',
  soort('400 credit balance is too low') === 'tegoed')
toets('400 zonder meer is geen storing',
  bepaalAiStoring('400 invalid_request_error: messages.0.content too long') === null)

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
