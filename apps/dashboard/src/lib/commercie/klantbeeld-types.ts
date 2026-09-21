/**
 * Vorm en rekenregels van het mobiele klantbeeld.
 *
 * Client-veilig: geen `server-only`, geen DB-imports. De leeslaag op de server en de
 * componenten in de browser gebruiken dezelfde definities.
 */

import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import type { BewakingStatus } from './types'

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

/**
 * Is dit dossier niet doorgegaan — een verloren of vervallen offerte, of een afgewezen of
 * vervallen aanvraag?
 *
 * Bewust op de ruwe substatussen en niet op `fase`. Die gooit een verloren offerte op één
 * hoop met een financieel afgesloten opdracht (`afgesloten`), en laat een afgewezen aanvraag
 * juist in `aanvraag` staan. Aan de telefoon zijn dat drie verschillende dingen: werk dat we
 * gedaan hebben, werk dat we niet kregen, en werk dat we nog aan het uitwerken zijn.
 *
 * Zelfde afbakening als `isDossierAfgesloten` in `components/dossiers/types.ts`, minus de
 * opdrachtkant — wijzigt daar de statusladder, dan hier ook kijken.
 */
export function isNietDoorgegaan(d: {
  hoofdstatus: string
  offerte_substatus: string | null
  aanvraag_substatus?: string | null
}): boolean {
  if (d.hoofdstatus === 'offerte') {
    return d.offerte_substatus === 'verloren' || d.offerte_substatus === 'vervallen'
  }
  if (d.hoofdstatus === 'aanvraag') {
    return d.aanvraag_substatus === 'afgewezen' || d.aanvraag_substatus === 'vervallen'
  }
  return false
}

/**
 * Is het werk op dit dossier af — ook al staat het dossier nog niet definitief dicht?
 *
 * De opdrachtladder eindigt op twee statussen: **Financieel gereed** (uitgevoerd, gefactureerd,
 * wachtend op de definitieve afsluiting) en **Financieel afgesloten** (die afsluiting gedaan).
 * `bepaalFase` telt alleen de tweede als `afgesloten` — terecht, want tot dat moment mag er nog
 * op geboekt worden en hoort het dossier op het opdrachtenbord te blijven staan.
 *
 * Voor de servicedesk ligt dat anders: daar ís `financieel_gereed` het eindpunt, en `bepaalFase`
 * zet zo'n bon dus wél op `afgesloten`. Gevolg in het klantbeeld: twee dossiers die allebei
 * "Financieel gereed" op het scherm zetten belandden in verschillende blokken — de servicedesk-
 * bon bij het uitgevoerde werk, de opdracht bij het lopende werk. Aan de telefoon is dat niet
 * uit te leggen.
 *
 * Deze helper trekt ze gelijk: klaar is klaar. Bewust alleen hier en niet in `bepaalFase` —
 * daar zou hij de opdrachtenkanban, de werkvoorraad en de actief-tellingen meeverschuiven, en
 * dat is een andere beslissing dan deze.
 */
export function isWerkGereed(d: {
  hoofdstatus: string
  opdracht_substatus: string | null
}): boolean {
  return d.hoofdstatus === 'opdracht' && d.opdracht_substatus === 'financieel_gereed'
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
  /**
   * De partij op wiens naam de factuur staat, maar alleen als dat iemand anders is dan de klant
   * van wie je het beeld bekijkt — anders `null`. Bij VvE- en vastgoedbeheer is de beheerder de
   * opdrachtgever en de VvE de geadresseerde; zonder dit veld zou het blok facturen tonen die de
   * beheerder zelf niet in zijn administratie terugvindt.
   */
  opNaamVan: string | null
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

/**
 * Wat er op deze offerte moet gebeuren, uit de offertebewaking.
 *
 * `status` is de afleiding uit `bewakingsStatus()` — dezelfde die de werklijst en het
 * offertebord kleuren, zodat een offerte hier nooit anders oplicht dan daar. `regel` is de
 * zin uit `stapOmschrijving()`: "Offerte nabellen — 6 juli" of "Wachten op klant tot 1 februari".
 */
export type OfferteStap = {
  status: BewakingStatus
  regel: string
}

/**
 * Een opmerking bij een offerte, zoals hij aan tafel voorgelezen kan worden.
 *
 * Komt uit `dossier_notities`, maar niet alles daaruit: zie `isBruikbareOpmerking`.
 */
export type OfferteOpmerking = {
  id: string
  /** YYYY-MM-DD. */
  datum: string
  tekst: string
}

/**
 * Welke `dossier_notities`-regels aan tafel iets toevoegen.
 *
 * Die tabel draagt drie soorten, en maar twee daarvan zijn een opmerking:
 *
 *  - **Eigen invoer** (1012 rijen) — "Ligt bij Cees. Waarschijnlijk volgend jaar",
 *    "17-6 dhr. Mooijman, naar ander bedrijf gegaan". Dit is waar het om gaat.
 *  - **Offerte-herinneringen uit Bouw7** (`bouw7_bron = 'reminder'`, 62 rijen) — kort en
 *    concreet ("Goede orde ontvangen?"), dus die horen erbij.
 *  - **De Bouw7-omschrijving** (`bouw7_bron = 'note'`, 589 rijen, gemiddeld 352 tekens) — dat
 *    is de werkomschrijving van het project, geen aantekening. Die staat al in het dossier en
 *    zou hier elke offerte een half scherm geven.
 *
 * Daarnaast valt de herkomstregel van de Gilde-import weg (398 rijen): "Overgenomen uit de
 * Gilde-offertebewaking … Offertenummer OF25700139 …". Feitelijk juist, maar het is
 * administratie over wáár het dossier vandaan komt, niet iets wat je een klant voorleest.
 * Match op de letterlijke aanhef, want die is door onze eigen import geschreven en staat vast.
 */
export function isBruikbareOpmerking(n: { bouw7_bron: string | null; inhoud: string }): boolean {
  if (n.bouw7_bron === 'note') return false
  if (n.inhoud.startsWith('Overgenomen uit de Gilde-offertebewaking')) return false
  return n.inhoud.trim().length > 0
}

/**
 * Een openstaande offerte in het klantbeeld: de dossierrij plus de dingen die je aan de
 * telefoon of aan tafel nodig hebt en die niet in `RelatieDossier` passen.
 *
 * `bedrag` op `RelatieDossier` is gefactureerde omzet uit `management_projecten` en is bij een
 * offerte per definitie leeg — die staat nog niet in die tabel. Vandaar een eigen veld.
 */
export type KlantOfferte = RelatieDossier & {
  /**
   * Het offertebedrag excl. btw volgens de gedeelde kaart-rekenregel (`berekenKaartBedrag`),
   * zodat de telefoon hetzelfde getal toont als het offertebord. `null` als geen van beide
   * bronnen (EVA-calculatie, Bouw7-sync) een bedrag levert.
   */
  bedragExclBtw: number | null
  /**
   * Naam van het offertedocument dat als PDF te openen valt (offertenummer bij een EVA-offerte,
   * anders de bestandsnaam), of `null` als er geen document is. Draagt bewust de naam en niet
   * alleen een ja/nee: bij een Bouw7-bestand is de keuze een beste gok op de bestandsnaam, en
   * dan hoort op de knop te staan wát je opent. Zie `lib/dossiers/offerte-bron.ts`.
   */
  offerteDocument: string | null
  /** De afgesproken volgende stap, of `null` als er niets is afgesproken. */
  stap: OfferteStap | null
  /** Nieuwste eerst. Het scherm toont er één en klapt de rest open op verzoek. */
  opmerkingen: OfferteOpmerking[]
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
  /** De dossierlijsten, in de volgorde waarin ze op het scherm staan. */
  offertesOpen: KlantOfferte[]
  offertesInDeMaak: RelatieDossier[]
  /**
   * Lopend werk, gesplitst. Het stond eerder in één blok "Lopend werk", en bij een beheerder
   * met 38 lopende dossiers is dat een bak waarin een renovatie van een ton naast een
   * lekkagemelding van tweehonderd euro staat. Het zijn twee gesprekken, dus twee blokken.
   */
  opdrachten: RelatieDossier[]
  servicedesk: RelatieDossier[]
  /** Inclusief opdrachten op Financieel gereed — zie `isWerkGereed`. */
  uitgevoerd: RelatieDossier[]
  /**
   * Verloren en vervallen offertes plus afgewezen en vervallen aanvragen, over dezelfde
   * periode als `uitgevoerd`. Stond eerder tussen het uitgevoerde werk — bij de klant met
   * 28 niet-doorgegane offertes op 31 dossiers las dat als "dit hebben we voor u gedaan".
   */
  nietDoorgegaan: RelatieDossier[]
  facturen: KlantFactuur[]
  objecten: KlantObject[]
  contactpersonen: KlantContactpersoon[]
  /** False zonder het recht `financieel`: het facturenblok wordt dan weggelaten. */
  toontFacturen: boolean
  /** Vanaf welk jaar "uitgevoerd werk" en "niet doorgegaan" tonen; draagt beide koppen. */
  uitgevoerdVanafJaar: number
}
