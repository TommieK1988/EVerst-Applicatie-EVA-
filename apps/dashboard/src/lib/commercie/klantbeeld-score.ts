/**
 * Scoringspercentage per klant: hoeveel van onze offertes worden er opdracht?
 *
 * ── De valkuil die dit bestand bestaat om te omzeilen ────────────────────────────────────
 *
 * Een gewonnen offerte is NIET te herkennen aan `offerte_substatus === 'gewonnen'`. De
 * database-trigger `tg_dossier_status_change` promoveert die waarde in dezelfde
 * BEFORE-UPDATE naar `hoofdstatus = 'opdracht'` en zet de substatus op `null`. Wie op de
 * substatus telt, telt altijd nul.
 *
 * De statushistorie helpt ook niet: er staan maar 29 overgangen offerte→opdracht in
 * `dossier_status_historie` en 23 gevulde `opdrachtdatum`-velden, tegen 183 opdrachten. De
 * trigger logt alleen bij UPDATE, en het meeste werk kwam als INSERT uit de Bouw7-sync of
 * dateert van vóór de trigger.
 *
 * Daarom tellen we op de huidige stand — dezelfde aanpak als `berekenFunnel` in
 * `lib/dashboard/aggregaties.ts`.
 *
 * ── Wat telt mee ─────────────────────────────────────────────────────────────────────────
 *
 * Kandidaat = een dossier dat de offertefase heeft bereikt. Servicedeskbonnen vallen af: dat
 * is onderhoudswerk op afroep, geen offerte die je wint of verliest, en meetellen zou de
 * score kunstmatig opblazen.
 *
 * Gewonnen = staat nu op `opdracht` (ook `financieel_afgesloten` — dat is nog steeds
 * hoofdstatus `opdracht`). Verloren = offerte met substatus `verloren` of `vervallen`.
 * Open telt niet mee: die zijn nog niet beslist.
 */

import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import { jaarVoorKlantbeeld, type KlantScore } from './klantbeeld-types'

/**
 * Tellen opdrachten mee waarvan EVA de offerte nooit heeft gezien?
 *
 * Van de 183 opdrachten in productie hebben er 54 een `verzonden_op`; de rest kwam
 * rechtstreeks als opdracht uit Bouw7. Dat maakt een groot verschil:
 *
 *   true  → 183 gewonnen / 314 verloren = 37 %  ("een opdracht is gewonnen werk, punt")
 *   false →  54 gewonnen / 314 verloren = 15 %  ("alleen wat aantoonbaar een offerte was")
 *
 * Voorlopig `true`: een opdracht die buiten EVA om binnenkwam is nog steeds werk dat we
 * hebben gekregen, en 15 % zou de verkoper een te somber beeld geven. Dit is een
 * bedrijfskeuze, geen technische — vandaar één constante, zodat omzetten één regel is.
 */
const TEL_OPDRACHT_ZONDER_OFFERTE_ALS_GEWONNEN = true

/** Offertestatussen waarop het antwoord "nee" was. */
const VERLOREN_SUBSTATUS = new Set(['verloren', 'vervallen'])

/**
 * Velden die de score nodig heeft. Structureel getypeerd zodat zowel een volledige
 * `RelatieDossier` als een kale status-select erin past — en de test geen dossierrij hoeft
 * na te bouwen.
 */
export type ScoreVelden = Pick<RelatieDossier, 'fase' | 'verzonden_op'> & {
  hoofdstatus: string | null
  offerte_substatus: string | null
  servicedesk_substatus: string | null
}

export function berekenScore(
  dossiers: (ScoreVelden & Partial<Pick<RelatieDossier,
    'bouw7_aanmaakdatum' | 'aanvraagdatum' | 'created_at'>>)[],
): KlantScore {
  let gewonnen = 0
  let verloren = 0
  let open = 0
  let vanafJaar: number | null = null

  for (const d of dossiers) {
    // Servicedesk is geen commercieel traject.
    if (d.servicedesk_substatus) continue

    // Heeft dit dossier de offertefase bereikt? Een aanvraag die nog in de begroting zit is
    // nog geen kans die je hebt gewonnen of verloren.
    const bereikteOfferte =
      d.hoofdstatus === 'offerte' || d.hoofdstatus === 'opdracht' || !!d.verzonden_op
    if (!bereikteOfferte) continue

    if (d.hoofdstatus === 'opdracht') {
      if (!TEL_OPDRACHT_ZONDER_OFFERTE_ALS_GEWONNEN && !d.verzonden_op) continue
      gewonnen++
    } else if (VERLOREN_SUBSTATUS.has(d.offerte_substatus ?? '')) {
      verloren++
    } else {
      open++
      // Een openstaande offerte zegt niets over de score, maar wel over de periode waarover
      // we iets weten — daarom telt hij wél mee voor het "sinds"-label.
    }

    const jaar = jaarVoorKlantbeeld({
      bouw7_aanmaakdatum: d.bouw7_aanmaakdatum ?? null,
      verzonden_op:       d.verzonden_op,
      aanvraagdatum:      d.aanvraagdatum ?? null,
      created_at:         d.created_at ?? '',
    })
    if (jaar !== null && (vanafJaar === null || jaar < vanafJaar)) vanafJaar = jaar
  }

  return { gewonnen, verloren, open, percentage: percentageVan(gewonnen, verloren), vanafJaar }
}

/**
 * Onder deze noemer tonen we geen percentage.
 *
 * Bij één gewonnen en één verloren offerte is "50 %" geen inzicht maar ruis — en het wordt
 * aan de telefoon wél uitgesproken alsof het iets betekent. Vier beslissingen is het minimum
 * waarbij een percentage niet volledig door toeval wordt bepaald.
 */
export const MIN_BESLIST_VOOR_PERCENTAGE = 4

function percentageVan(gewonnen: number, verloren: number): number | null {
  const beslist = gewonnen + verloren
  if (beslist < MIN_BESLIST_VOOR_PERCENTAGE) return null
  return Math.round((gewonnen / beslist) * 100)
}
