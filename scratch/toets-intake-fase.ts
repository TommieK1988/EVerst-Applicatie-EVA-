/**
 * Toets op de drie bestemmingen van een nieuw intakedossier.
 *
 *   npx tsx scratch/toets-intake-fase.ts
 *
 * De vraag die hier beantwoord wordt is niet "schrijft de code de goede kolommen
 * weg" -- dat is een tabel overtikken. De vraag is: **blijft het dossier staan waar
 * de behandelaar het neerzette?**
 *
 * Want de Bouw7-lees-sync leidt elke ronde opnieuw af waar een dossier hoort, uit de
 * projectstatus en de categorie (`mapBouw7NaarEvaStatus`). Zet de intake het dossier
 * ergens neer waar die afleiding het niet zou plaatsen, dan staat het de volgende
 * ochtend ergens anders -- zonder melding, zonder spoor. Dat is precies hoe een
 * servicedeskbon op "Offerte uitgebracht" belandt terwijl er nooit een offerte was.
 *
 * Elke regel hieronder voert dus de plaatsing door de sync-afleiding heen en legt de
 * uitkomst naast wat de intake bedoelde.
 */

import { FASE_PLAATSINGEN, type DossierFase } from '../apps/dashboard/src/components/dossiers/fase-plaatsing'
import { mapBouw7NaarEvaStatus } from '../apps/dashboard/src/lib/bouw7/status-afleiding'

let fouten = 0
const toets = (naam: string, gelukt: boolean, detail = '') => {
  if (!gelukt) fouten++
  console.log(`  ${gelukt ? 'ok   ' : 'FOUT '} ${naam}${gelukt ? '' : ` — ${detail}`}`)
}

/** Categorie waarmee de fase in de praktijk gekozen wordt. */
const CATEGORIE: Record<DossierFase, string> = {
  aanvraag:    'Renovatie',
  opdracht:    'Bouwkundig Onderhoud',
  servicedesk: 'Dagelijks onderhoud',
}

console.log('\n── De sync laat het dossier staan waar de intake het neerzette ──')

for (const fase of Object.keys(FASE_PLAATSINGEN) as DossierFase[]) {
  const p = FASE_PLAATSINGEN[fase]
  const k = p.kolommen

  // Wat de eerstvolgende sync ervan zou maken, met de stand zoals de intake hem
  // achterlaat als bestaande waarden.
  const na = mapBouw7NaarEvaStatus(
    p.bouw7Status,
    CATEGORIE[fase],
    k.aanvraag_substatus,
    null,   // offerte_substatus
    null,   // verzonden_op
    null,   // offertestatusNaam
    null,   // caOfferteSubstatus
  )

  console.log(`\n  ${p.fase} (${CATEGORIE[fase]} → ${p.bouw7Status})`)
  toets('hoofdstatus blijft', na.hoofdstatus === k.hoofdstatus,
    `intake ${k.hoofdstatus}, sync ${na.hoofdstatus}`)
  toets('aanvraag-substatus blijft', (na.aanvraag_substatus ?? null) === k.aanvraag_substatus,
    `intake ${k.aanvraag_substatus}, sync ${na.aanvraag_substatus}`)
  toets('opdracht-substatus blijft', (na.opdracht_substatus ?? null) === k.opdracht_substatus,
    `intake ${k.opdracht_substatus}, sync ${na.opdracht_substatus}`)
  toets('servicedesk-substatus blijft', (na.servicedesk_substatus ?? null) === k.servicedesk_substatus,
    `intake ${k.servicedesk_substatus}, sync ${na.servicedesk_substatus}`)
}

console.log('\n── Een verse servicedeskbon gaat naar LB ──')
// Vroeger ging een bon naar 02. Nieuwe opdracht, omdat 01 in de servicedeskladder naar
// 'offerte_uitgebracht' vertaalde. Sinds september 2026 staan bonnen in Bouw7 op
// LB. Lopende bonnen, en LB vertaalt (sinds 30-09-2026) naar 'nieuw'.
const opLB = mapBouw7NaarEvaStatus('LB. Lopende bonnen', 'Dagelijks onderhoud', 'nieuw', null, null, null, null)
toets('LB. Lopende bonnen zet de bon op "nieuw"',
  opLB.servicedesk_substatus === 'nieuw', String(opLB.servicedesk_substatus))
toets('de plaatsing schrijft LB. Lopende bonnen',
  FASE_PLAATSINGEN.servicedesk.bouw7Status === 'LB. Lopende bonnen', FASE_PLAATSINGEN.servicedesk.bouw7Status)

console.log('\n── Precies één substatuskolom per fase ──')
// De check-constraint op `dossiers` eist dat de kolom van de hoofdstatus gevuld is.
// Servicedesk is de uitzondering: die draait een eigen ladder náást de aanvraagfase.
for (const fase of Object.keys(FASE_PLAATSINGEN) as DossierFase[]) {
  const k = FASE_PLAATSINGEN[fase].kolommen
  const bijHoofdstatus = k.hoofdstatus === 'aanvraag' ? k.aanvraag_substatus : k.opdracht_substatus
  const andere = k.hoofdstatus === 'aanvraag' ? k.opdracht_substatus : k.aanvraag_substatus
  toets(`${fase}: kolom van de hoofdstatus is gevuld`, bijHoofdstatus != null)
  toets(`${fase}: de andere fasekolom is leeg`, andere == null, String(andere))
}
toets('alleen servicedesk heeft een ladderwaarde',
  FASE_PLAATSINGEN.servicedesk.kolommen.servicedesk_substatus != null
  && FASE_PLAATSINGEN.aanvraag.kolommen.servicedesk_substatus == null
  && FASE_PLAATSINGEN.opdracht.kolommen.servicedesk_substatus == null)

console.log(fouten === 0 ? '\nAlles goed\n' : `\n${fouten} fout(en)\n`)
process.exit(fouten === 0 ? 0 : 1)
