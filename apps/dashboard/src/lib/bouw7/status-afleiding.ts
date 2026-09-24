/**
 * Bouw7-projectstatus + categorie → de EVA-statusvelden (hoofdstatus, substatussen).
 *
 * Deze afleiding bepaalt in welke sectie een dossier thuishoort: Aanvragen, Offertes, Opdrachten
 * of Servicedesk. Ze draait op twee momenten en moet op allebei hetzelfde uitkomen:
 *
 *  * bij de **Bouw7-sync** (`sync.ts`), die de projecten periodiek ophaalt;
 *  * bij een **categoriewijziging in EVA** (`lib/dossiers/actions.ts`), zodat een dossier dat op
 *    "Dagelijks onderhoud" wordt gezet meteen op het servicedeskbord staat in plaats van pas na
 *    de eerstvolgende sync.
 *
 * Daarom staat de logica hier en niet in `sync.ts`: dit bestand is bewust puur (geen API- of
 * DB-imports), zodat beide kanten hem kunnen importeren zonder de hele sync mee te slepen.
 */

import { OPDRACHT_PREFIX_NAAR_SUBSTATUS } from './status-map'
import { bouw7SubstatusNaarEva } from './substatus-map'

export type EvaStatusVelden = {
  hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht'
  aanvraag_substatus: string | null
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  verzonden_op?: string | null
}

/**
 * Map de Bouw7-offertestatus (quotationStatus.name) naar een EVA offerte-substatus.
 * Match op naamdeel (niet op nummerprefix) zodat hernummering in Bouw7 de mapping niet breekt.
 * Bekende Bouw7-statussen: 01. Nieuw, 02. Onderhanden, 03. Te controleren, 03. Verstuurd,
 * 04. Gewonnen, 05. Verloren, 06. Vervallen, 07. Mondelinge toezegging.
 * Nieuw/Onderhanden/Te controleren → null (EVA-substatus blijft staan).
 */
export function mapOffertestatusNaarSubstatus(naam: string | null | undefined): string | null {
  if (!naam) return null
  const n = naam.toLowerCase()
  if (n.includes('gewonnen'))   return 'gewonnen'
  if (n.includes('verloren'))   return 'verloren'
  if (n.includes('vervallen'))  return 'vervallen'
  if (n.includes('mondelinge')) return 'mondelinge_toezegging'
  if (n.includes('verstuurd'))  return 'verzonden'
  return null
}

/** De vier offertestatus-eindstatussen — deze overschrijven altijd de EVA-substatus. */
export const OFFERTE_EINDSTATUSSEN = ['gewonnen', 'verloren', 'vervallen', 'mondelinge_toezegging']

/**
 * Mapping van Bouw7-projectstatusnaam naar servicedesk kanban-kolom.
 * Altijd overschreven bij sync — handmatig slepen geldt tot de volgende sync.
 *
 * **`01. Offerte` is geen verstuurde offerte.** In Bouw7 is 01 de fase waarin een aanvraag
 * binnenkomt en eventueel geprijsd wordt; pas `09.Verzonden offertes` betekent dat er iets de
 * deur uit is. De afleiding voor aanvragen/offertes hieronder gaat daar ook van uit (01 → de
 * Aanvragen-tab). Deze tabel zei het omgekeerde en zette elke verse bon meteen op "Offerte
 * uitgebracht" — een kolom waar niemand op wacht en waar hij met de hand uit gesleept moest
 * worden. Is er wél een offerte de deur uit, dan zegt de offertestatus dat; zie
 * `servicedeskKolom`.
 */
export const BOUW7_NAAR_SERVICEDESK_SUBSTATUS: Record<string, string> = {
  '01. Offerte':           'nieuw',
  '02. Nieuwe opdracht':   'nieuw',
  '03. Werkvoorbereiding': 'nieuw',
  '04. Onderhanden':       'loopt',
  '05. Uitvoering gereed': 'uitgevoerd',
  '06. Financieel gereed': 'financieel_gereed',
  '08. Afgewezen':         'financieel_gereed',
  '09.Verzonden offertes': 'offerte_uitgebracht',
  'LB. Lopende bonnen':    'loopt',
}

/**
 * Zelfde mapping voor mutatiewerk, dat een eigen kolomreeks heeft (zie
 * SERVICEDESK_MUTATIE_STATUSSEN in components/dossiers/types.ts). Alleen "03. Werkvoorbereiding"
 * wijkt af: dagelijks onderhoud kent geen voorbereidingsfase en laat die bon op Nieuw staan, een
 * mutatie krijgt er een eigen kolom voor. De overige statussen landen op dezelfde sleutels, die op
 * het mutatiebord alleen een ander label dragen (loopt = "Onderhanden",
 * uitgevoerd = "Uitvoering gereed", offerte_uitgebracht = "Offerte verstuurd").
 */
export const BOUW7_NAAR_MUTATIE_SUBSTATUS: Record<string, string> = {
  ...BOUW7_NAAR_SERVICEDESK_SUBSTATUS,
  '03. Werkvoorbereiding': 'in_voorbereiding',
}

/**
 * De kolom waar een bon op landt, projectstatus én offertestatus meegewogen.
 *
 * De projectstatus is leidend, met één uitzondering: staat het project nog op `01. Offerte` maar
 * zegt de offertestatus in Bouw7 dat er een offerte is verstuurd (of al gewonnen/verloren is),
 * dan is er wél iets de deur uit en hoort de bon op "Offerte uitgebracht". Zonder die controle
 * zou een bon die net geoffreerd is bij de eerstvolgende sync terugvallen naar Nieuw.
 */
export function servicedeskKolom(
  bouw7StatusNaam: string | null | undefined,
  categorieNaam: string | null | undefined,
  offertestatusNaam: string | null | undefined = null,
): string {
  const naam = bouw7StatusNaam ?? ''
  const ladder = (categorieNaam ?? '') === 'Mutatie'
    ? BOUW7_NAAR_MUTATIE_SUBSTATUS
    : BOUW7_NAAR_SERVICEDESK_SUBSTATUS
  const kolom = ladder[naam] ?? 'nieuw'
  if (kolom === 'nieuw' && naam.startsWith('01.') && mapOffertestatusNaarSubstatus(offertestatusNaam)) {
    return 'offerte_uitgebracht'
  }
  return kolom
}

/** Hoort deze Bouw7-projectstatus bij de opdracht-fase (02.–07.)? */
export function isOpdrachtStatus(naam: string): boolean {
  return Object.keys(OPDRACHT_PREFIX_NAAR_SUBSTATUS).some((prefix) => naam.startsWith(prefix))
}

/**
 * Hoort een dossier met deze Bouw7-projectstatus + categorie op het servicedeskbord? Dezelfde
 * afbakening als `isServicedeskDossier` in components/dossiers/types.ts en als de
 * servicedesk-query in lib/dossiers/actions.ts.
 */
export function isServicedeskCombinatie(
  bouw7StatusNaam: string | null | undefined,
  categorieNaam: string | null | undefined,
): boolean {
  const naam = (bouw7StatusNaam ?? '').trim()
  const cat  = (categorieNaam ?? '').trim()
  return naam.toUpperCase().startsWith('LB.') || cat === 'Dagelijks onderhoud' || cat === 'Mutatie'
}

/**
 * Voldoet deze dossierrij aan CHECK `dossiers_status_consistent`? Precies één substatus gevuld,
 * en wel die van de hoofdstatus. (De servicedesk-substatus valt erbuiten.)
 */
export function isStatusConsistent(rij: Record<string, unknown>): boolean {
  const gevuld = (v: unknown) => v !== null && v !== undefined
  const a = gevuld(rij.aanvraag_substatus)
  const o = gevuld(rij.offerte_substatus)
  const d = gevuld(rij.opdracht_substatus)
  switch (rij.hoofdstatus) {
    case 'aanvraag': return a && !o && !d
    case 'offerte':  return !a && o && !d
    case 'opdracht': return !a && !o && d
    default:         return false
  }
}

/** De vier statusvelden die de consistentie-check samen bewaakt. */
export function pakStatusVelden(rij: Record<string, unknown>): Record<string, unknown> {
  return {
    hoofdstatus:        rij.hoofdstatus,
    aanvraag_substatus: rij.aanvraag_substatus,
    offerte_substatus:  rij.offerte_substatus,
    opdracht_substatus: rij.opdracht_substatus,
  }
}

/**
 * Leidt de EVA-statusvelden af uit de Bouw7 projectstatus, categorie, offertestatus en het
 * maatwerkveld "Offerte Sub-status".
 *
 * Volgorde van bronnen:
 *  1. Categorie DO/MU of LB.-status → Servicedesk (wint altijd).
 *  2. Projectstatus 02.–07. → opdracht-substatus (altijd overschreven vanuit Bouw7).
 *  3. Maatwerkveld `caOfferteSubstatus` → aanvraag/offerte-substatus, zodra het gevuld is. Dit is
 *     het veld dat EVA deelt met de tweede Bouw7-app; het is dus leidend boven de afleiding uit
 *     project-/offertestatus hieronder.
 *  4. Leeg maatwerkveld (nog verreweg de meeste projecten) → de oude afleiding: de vier
 *     eindstatussen uit de Bouw7-offertestatus (gewonnen, verloren, vervallen, mondelinge
 *     toezegging) overschrijven altijd; anders blijft de bestaande EVA-substatus staan.
 *
 * Servicedesk-substatussen worden altijd overschreven vanuit BOUW7_NAAR_SERVICEDESK_SUBSTATUS.
 */
export function mapBouw7NaarEvaStatus(
  bouw7StatusNaam: string | null | undefined,
  bouw7CategorieNaam: string | null | undefined,
  bestaandeAanvraagSub: string | null,
  bestaandeOfferteSub: string | null,
  bestaandeVerzondenOp: string | null,
  offertestatusNaam: string | null = null,
  caSubstatus: string | null = null,
): EvaStatusVelden {
  const naam = bouw7StatusNaam ?? ''
  const cat  = bouw7CategorieNaam ?? ''

  const offerteSub  = mapOffertestatusNaarSubstatus(offertestatusNaam)
  const eindstatus  = offerteSub && OFFERTE_EINDSTATUSSEN.includes(offerteSub) ? offerteSub : null

  // Servicedesk: LB of categorie Dagelijks onderhoud/Mutatie (categorie wint over projectstatus)
  if (isServicedeskCombinatie(naam, cat)) {
    return {
      hoofdstatus:           'aanvraag',
      aanvraag_substatus:    'nieuw',
      offerte_substatus:     null,
      opdracht_substatus:    null,
      servicedesk_substatus: servicedeskKolom(naam, cat, offertestatusNaam),
    }
  }

  // Maatwerkveld "Offerte Sub-status" — gedeeld met de tweede app, leidend zodra gevuld.
  // Buiten de opdracht-fase: staat het project in Bouw7 op 02.–07., dan is het een opdracht en is
  // de waarde uit de offertefase een restant.
  // De huidige EVA-fase gaat mee, zodat "12. Verloren"/"13. Vervallen" een afgewezen/vervallen
  // *aanvraag* niet naar de Offertes-tab verplaatst.
  const huidigeFase = bestaandeAanvraagSub != null ? 'aanvraag'
                    : bestaandeOfferteSub  != null ? 'offerte'
                    : null
  const caStatus = isOpdrachtStatus(naam) ? null : bouw7SubstatusNaarEva(caSubstatus, huidigeFase)
  if (caStatus) {
    return {
      hoofdstatus:           caStatus.hoofdstatus,
      aanvraag_substatus:    caStatus.aanvraag_substatus,
      offerte_substatus:     caStatus.offerte_substatus,
      opdracht_substatus:    null,
      servicedesk_substatus: null,
      // Offertefase: `verzonden_op` stuurt de 7-daagse nazichtbaarheid op de Aanvragen-tab.
      ...(caStatus.hoofdstatus === 'offerte'
        ? { verzonden_op: bestaandeVerzondenOp ?? new Date().toISOString() }
        : {}),
    }
  }

  // Aanvraag — 01. Offerte (aanvragen-tab, intake/calculatie-fase)
  if (naam.startsWith('01.')) {
    // Offertestatus Gewonnen/Mondelinge toezegging: dossier verhuist naar de Offertes-tab
    // (de Aanvragen-kanban heeft voor deze statussen geen kolom).
    if (eindstatus === 'gewonnen' || eindstatus === 'mondelinge_toezegging') {
      return {
        hoofdstatus:           'offerte',
        aanvraag_substatus:    null,
        offerte_substatus:     eindstatus,
        opdracht_substatus:    null,
        servicedesk_substatus: null,
      }
    }
    // Offertestatus Verstuurd/Verloren/Vervallen: in de juiste aanvraag-kolom zetten.
    const aanvraagOverride =
      offerteSub === 'verzonden' ? 'verzonden'
      : eindstatus === 'verloren'  ? 'afgewezen'
      : eindstatus === 'vervallen' ? 'vervallen'
      : null
    return {
      hoofdstatus:           'aanvraag',
      aanvraag_substatus:    aanvraagOverride ?? bestaandeAanvraagSub ?? 'nieuw',
      offerte_substatus:     null,
      opdracht_substatus:    null,
      servicedesk_substatus: null,
    }
  }

  // Offerte — 08. Afgewezen → offertestatus-eindstatus (onderscheidt verloren/vervallen), anders 'verloren'
  if (naam.startsWith('08.')) {
    return {
      hoofdstatus:           'offerte',
      aanvraag_substatus:    null,
      offerte_substatus:     eindstatus ?? 'verloren',
      opdracht_substatus:    null,
      servicedesk_substatus: null,
    }
  }

  // Offerte — 09. Verzonden Offertes (offertes-tab, ook 7 dagen op aanvragen-tab).
  // Alleen de vier eindstatussen overschrijven — 'Verstuurd' mag een handmatig gesleepte
  // nabellen/in_behandeling niet terugzetten.
  if (naam.startsWith('09.')) {
    return {
      hoofdstatus:           'offerte',
      aanvraag_substatus:    null,
      offerte_substatus:     eindstatus ?? bestaandeOfferteSub ?? 'verzonden',
      opdracht_substatus:    null,
      servicedesk_substatus: null,
      verzonden_op:          bestaandeVerzondenOp ?? new Date().toISOString(),
    }
  }

  // Opdrachten — 02 t/m 07 (substatus altijd overschrijven vanuit Bouw7).
  // Mapping leeft in lib/bouw7/status-map.ts — gedeeld met de terugschrijf-helper.
  for (const [prefix, substatus] of Object.entries(OPDRACHT_PREFIX_NAAR_SUBSTATUS)) {
    if (naam.startsWith(prefix)) {
      return {
        hoofdstatus:           'opdracht',
        aanvraag_substatus:    null,
        offerte_substatus:     null,
        opdracht_substatus:    substatus,
        servicedesk_substatus: null,
      }
    }
  }

  // Onbekende status: standaard aanvraag
  return {
    hoofdstatus:           'aanvraag',
    aanvraag_substatus:    'nieuw',
    offerte_substatus:     null,
    opdracht_substatus:    null,
    servicedesk_substatus: null,
  }
}
