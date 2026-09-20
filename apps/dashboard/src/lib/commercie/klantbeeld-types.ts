/**
 * Vorm en rekenregels van het mobiele klantbeeld.
 *
 * Client-veilig: geen `server-only`, geen DB-imports. De leeslaag op de server en de
 * componenten in de browser gebruiken dezelfde definities.
 */

import type { RelatieDossier } from '@/lib/relaties/dossiers-types'

/* ── Drempels ──────────────────────────────────────────────────────────────────────────── */

/**
 * Vanaf hoeveel dagen ná de vervaldatum een factuur een signaal wordt.
 *
 * Gelijk aan `VERPLICHTE_VELDEN_DREMPEL_DAGEN` in `lib/debiteuren/actions.ts`, waar dezelfde
 * 60 dagen bepaalt wanneer opvolging verplicht wordt. Die constante kan daar niet
 * geëxporteerd worden — het is een `'use server'`-module — vandaar deze eigen naam. Wijzig je
 * de een, kijk dan naar de ander.
 */
export const FACTUUR_TE_LAAT_DAGEN = 60

/**
 * Vanaf hoeveel dagen na verzending een offerte "ligt er lang" heet.
 *
 * Bewust niet gelijkgesteld aan `STILSTAND_DAGEN = 14` uit `lib/commercie/rapportage.ts`.
 * Die veertien dagen gaan over "er is niets gebeurd op de bewakingskaart" — een signaal voor
 * de werklijst. Hier gaat het om iets anders: je staat een klant aan de telefoon en wilt
 * weten of een offerte al zo lang ligt dat ernaar vragen gepast is. Een maand is daarvoor de
 * natuurlijke grens.
 */
export const LANGLIGGEND_DAGEN = 30

/* ── Jaarbepaling ──────────────────────────────────────────────────────────────────────── */

/**
 * Jaar waarin het werk speelde, voor het klantbeeld.
 *
 * Wijkt bewust af van `jaarVan()` (`lib/dossiers/fase.ts`) door `verzonden_op` als tweede
 * bron te nemen. Aanleiding: de 399 geïmporteerde Gilde-dossiers hebben géén
 * `bouw7_aanmaakdatum` en géén `aanvraagdatum`, dus `jaarVan()` valt daar terug op
 * `created_at` — de dag van de import in 2026. Een offerte van januari 2024 komt dan als 2026
 * binnen. Gemeten op productie: 380 van de 1098 dossiers staan zo in het verkeerde jaar
 * (57 horen in 2024, 323 in 2025).
 *
 * Dat maakt hier het verschil tussen een werkend en een onzinnig scherm: "uitgevoerd de
 * afgelopen twee jaar" en de omzet per jaar zijn allebei op dit getal gebouwd.
 *
 * `jaarVan()` zelf blijft ongemoeid. Die voedt de object- en relatieschermen, en daar de
 * cijfers laten verschuiven is een aparte beslissing die om een eigen wijziging vraagt.
 */
export function jaarVoorKlantbeeld(d: {
  bouw7_aanmaakdatum: string | null
  verzonden_op: string | null
  aanvraagdatum: string | null
  created_at: string
}): number | null {
  const bron = d.bouw7_aanmaakdatum ?? d.verzonden_op ?? d.aanvraagdatum ?? d.created_at
  const jaar = Number(String(bron ?? '').slice(0, 4))
  return Number.isFinite(jaar) && jaar > 1990 ? jaar : null
}

/** Hele dagen tussen een ISO-datum en vandaag; negatief als de datum in de toekomst ligt. */
export function dagenSindsDatum(datum: string | null, vandaagMs: number): number | null {
  if (!datum) return null
  const ms = Date.parse(`${datum.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.floor((vandaagMs - ms) / 86_400_000)
}

/* ── Vorm van het scherm ───────────────────────────────────────────────────────────────── */

export type KlantKengetallen = {
  /** Gefactureerd excl. btw in het lopende jaar. */
  omzetDitJaar: number
  omzetVorigJaar: number
  ditJaar: number
  vorigJaar: number
  /**
   * Opdrachten en servicedeskbonnen zonder regel in `management_projecten`. Groter dan nul
   * betekent: het omzetbedrag is een ondergrens, niet het totaal.
   */
  zonderFacturatiegegevens: number
}

export type KlantScore = {
  gewonnen: number
  verloren: number
  /** Nog niet beslist; telt niet mee in het percentage. */
  open: number
  /** `null` bij een te kleine noemer — zie `berekenScore`. */
  percentage: number | null
  /** Vroegste jaar waarover we iets weten; draagt het label "sinds …". */
  vanafJaar: number | null
}

export type KlantSignalen = {
  factuurTeLaat: number
  offerteWijAanZet: number
  offerteLangliggend: number
}

export type KlantFactuur = {
  id: string
  factuurnummer: string | null
  bedrag: number | null
  vervaldatum: string | null
  dagenTeLaat: number | null
  stoplicht: 'groen' | 'oranje' | 'rood'
}

export type KlantObject = {
  id: string
  naam: string
  adres: string | null
  aantalDossiers: number
}

export type KlantContactpersoon = {
  id: string
  naam: string
  functie: string | null
  email: string | null
  telefoon: string | null
  mobiel: string | null
  isPrimair: boolean
}

export type Klantbeeld = {
  relatie: {
    id: string
    naam: string
    plaats: string | null
    adres: string | null
    telefoon: string | null
    email: string | null
  }
  kengetallen: KlantKengetallen
  score: KlantScore
  signalen: KlantSignalen
  /** De vijf lijsten, in de volgorde waarin ze op het scherm staan. */
  offertesOpen: RelatieDossier[]
  offertesInDeMaak: RelatieDossier[]
  lopendWerk: RelatieDossier[]
  uitgevoerd: RelatieDossier[]
  facturen: KlantFactuur[]
  objecten: KlantObject[]
  contactpersonen: KlantContactpersoon[]
  /** False zonder het recht `financieel`: het facturenblok wordt dan weggelaten. */
  toontFacturen: boolean
  /** Vanaf welk jaar "uitgevoerd werk" wordt getoond; draagt de koptekst. */
  uitgevoerdVanafJaar: number
}
