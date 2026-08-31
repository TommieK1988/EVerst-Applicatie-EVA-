/**
 * Eén plek waar wordt bepaald wélke bron de aanneemsom van een dossier levert.
 *
 * Er zijn er twee: de EVA-calculatie/offerte en het uit Bouw7 gesynchroniseerde
 * `dossiers.bedrag_excl_btw`. De keuze hangt af van de fase:
 *
 * - **aanvraag / offerte** — de EVA-offerte wint. De calculatie is daar de waarheid en de
 *   Bouw7-sync loopt er per definitie op achter (2× per dag); dat is precies waarom de kaarten
 *   met EVA-bedragen verrijkt worden. Ook een concept telt mee: op het offertebord wil je zien
 *   wat er nú gecalculeerd is.
 * - **opdracht** — het Bouw7-bedrag wint. Zodra de opdracht er is, ís de Bouw7-`fixedPrice` het
 *   contractbedrag: dat is wat gefactureerd wordt, en dat is ook wat de Verkoop- en Financieel-tab
 *   al toonden. Een EVA-offerte bij hetzelfde dossier is dan nog maar een document — vaak voor een
 *   deel van het werk, soms nog concept — en mag de aanneemsom niet meer overschrijven.
 *
 * Zonder die fasesplitsing pakte het bord de EVA-offerte ook op een opdracht van drie ton, en
 * botste de kaart met de Verkoop-tab van hetzelfde dossier.
 *
 * De EVA-offerte valt in de opdrachtfase terug op zijn rol als bron zodra Bouw7 niets levert
 * (EVA-eigen dossiers zonder Bouw7-koppeling), en andersom.
 *
 * Pure module — bewust géén `'use server'`, zodat zowel de server-side tabs als de client-side
 * kaartberekening (`components/dossiers/kaart-bedrag.ts`) hem kunnen importeren.
 */

export type AanneemsomBron = 'eva' | 'bouw7'

export type AanneemsomKeuze = {
  /** Het gekozen bedrag excl. btw; null als geen van beide bronnen iets levert. */
  aanneemsom: number | null
  /** Welke bron het bedrag leverde — bepaalt welke kostprijs, btw en splitsing erbij horen. */
  bron: AanneemsomBron | null
  /**
   * Het EVA-offertebedrag wanneer dat NIET gekozen is én materieel van de aanneemsom afwijkt.
   * Voedt het signaal in de UI: het getal stil vervangen laat de vraag "waarom staat hier een
   * offerte van € 2.427 bij een opdracht van € 38.942?" onzichtbaar, en dat is meestal juist
   * het echte probleem. Null zodra beide bronnen hetzelfde zeggen.
   */
  afwijkendeEvaOfferte: number | null
}

/** Afwijking is pas het melden waard boven beide drempels — afrondverschillen zijn geen signaal. */
const DREMPEL_EURO = 1
const DREMPEL_DEEL = 0.02

/** True als `a` materieel van `b` afwijkt (meer dan €1 én meer dan 2%). */
export function wijktMaterieelAf(a: number, b: number): boolean {
  const verschil = Math.abs(a - b)
  return verschil > DREMPEL_EURO && verschil > DREMPEL_DEEL * Math.abs(b)
}

export function kiesAanneemsom(invoer: {
  /** `dossiers.hoofdstatus`; alles behalve `opdracht` laat de EVA-offerte voorgaan. */
  hoofdstatus: string | null | undefined
  /** `dossiers.bedrag_excl_btw` uit de Bouw7-sync. */
  bouw7ExclBtw: number | null
  /** Subtotaal excl. btw van de EVA-hoofdofferte (geen meerwerk-offerte). */
  evaOfferteExclBtw: number | null
}): AanneemsomKeuze {
  const { bouw7ExclBtw: bouw7, evaOfferteExclBtw: eva } = invoer
  const bouw7Leidend = invoer.hoofdstatus === 'opdracht'

  const volgorde: Array<[number | null, AanneemsomBron]> = bouw7Leidend
    ? [[bouw7, 'bouw7'], [eva, 'eva']]
    : [[eva, 'eva'], [bouw7, 'bouw7']]

  const gekozen = volgorde.find(([bedrag]) => bedrag != null)
  if (!gekozen) return { aanneemsom: null, bron: null, afwijkendeEvaOfferte: null }

  const [aanneemsom, bron] = gekozen as [number, AanneemsomBron]
  const afwijkendeEvaOfferte =
    bron !== 'eva' && eva != null && wijktMaterieelAf(eva, aanneemsom) ? eva : null

  return { aanneemsom, bron, afwijkendeEvaOfferte }
}
