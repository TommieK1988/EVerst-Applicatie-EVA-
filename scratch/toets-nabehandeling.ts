/**
 * Toets op wat er in Outlook met een bericht gebeurt.
 *
 *   npx tsx scratch/toets-nabehandeling.ts
 *
 * Dit is de enige stap in de hele module die iets verandert in de mailbox van een
 * ander. Er is één regel die daarbij telt en die niet stil mag verschuiven:
 *
 *   **"Geen aanvraag" blijft in Postvak IN staan, en blijft ongelezen.**
 *
 * Dat oordeel betekent "hier hoeft niets mee" — en dat is precies het oordeel dat
 * fout kán zijn. Verdwijnt zo'n mail naar een submap, dan is een gemiste aanvraag
 * onzichtbaar: er is geen tweede signaal dat hem terugbrengt. Genegeerd is iets
 * anders; daar heeft iemand een reden bij getypt en mag hij weg.
 */

import { bepaalNabehandeling } from '../apps/dashboard/src/lib/mailintake/nabehandeling'
import type { BerichtStatus, BerichtBesluit } from '../apps/dashboard/src/lib/mailintake/types'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

const plan = (s: string, b: string | null, nr: string | null = null) =>
  bepaalNabehandeling(s as BerichtStatus, b as BerichtBesluit | null, nr)

console.log('\n── Geen aanvraag blijft staan ───────────────────────────────')
// Ook als een mens erop klikt. Het oordeel is hetzelfde oordeel, en de reden om
// het zichtbaar te houden ook: een gemiste aanvraag is de duurste fout.
const geen = plan('geen_aanvraag', 'geen_aanvraag')
toets('wordt niet verplaatst', geen?.verplaatsen === false)
toets('blijft ongelezen', geen?.gelezen === false)
toets('krijgt wel een categorie', (geen?.categorieen ?? []).includes('EVA: geen aanvraag'))

console.log('\n── Wat wél uit het zicht mag ────────────────────────────────')
const genegeerd = plan('genegeerd', 'genegeerd')
toets('genegeerd verhuist', genegeerd?.verplaatsen === true)
toets('genegeerd wordt gelezen', genegeerd?.gelezen === true)

const verwerkt = plan('verwerkt', 'handmatig_aangemaakt', '2026-0412')
toets('verwerkt verhuist', verwerkt?.verplaatsen === true)
toets('verwerkt draagt het dossiernummer', (verwerkt?.categorieen ?? []).includes('EVA: 2026-0412'))
toets('verwerkt zonder dossiernummer blijft werken',
  (plan('verwerkt', 'gekoppeld_bestaand')?.categorieen ?? []).length > 0)

console.log('\n── Onaangeroerd zolang er niets besloten is ─────────────────')
for (const s of ['nieuw', 'bezig', 'wacht_op_mens', 'mislukt']) {
  toets(`${s}: Outlook blijft met rust`, plan(s, null) === null)
}

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
