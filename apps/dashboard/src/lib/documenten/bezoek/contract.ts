/**
 * contract.ts — de gedeelde vorm van een bezoekrapport.
 *
 * Eén rapportage voor élke controle op locatie: een kwaliteitsronde, een oplevering, een
 * veiligheidsronde (VCA) en een ingevuld inspectieformulier vullen alle vier dit blok. Het
 * Word-sjabloon kent daardoor maar één set tags, en een hoofdstuk dat een bron niet vult
 * verdwijnt vanzelf doordat de bijbehorende `heeft_…`-vlag op false staat.
 *
 * **Géén `'use server'` en géén `server-only`**: dit bestand exporteert constanten en types,
 * en wordt gebruikt door de optie-picker (client), de demo-context én de adapters (server).
 * Een `'use server'`-module mag alleen async functies exporteren — `tsc` keurt zo'n
 * overtreding goed en pas de Next-build valt om.
 */

/** Eén rij in een tabel-loop. Losse alias zodat de dotted parser niets bijzonders ziet. */
export interface Rij { [k: string]: unknown }

/** Waar het rapport over gaat. Bepaalt de titel op het voorblad en de disclaimer. */
export type BezoekSoort = 'kwaliteit' | 'oplevering' | 'veiligheid' | 'formulier'

export const BEZOEK_SOORT_LABELS: Record<BezoekSoort, string> = {
  kwaliteit:  'Kwaliteitsronde',
  oplevering: 'Oplevering',
  veiligheid: 'Veiligheidsronde',
  formulier:  'Inspectie',
}

/**
 * Eén bevinding: het aandachtspunt, de afwijking of het veiligheidspunt. Dit is het hart
 * van elk bezoekrapport en de enige loop die alle vier de bronnen vullen.
 *
 * De `*_kort`-varianten zijn server-side afgekapt. Dat is nodig omdat het sjabloon met een
 * exacte rijhoogte werkt: zonder afkappen loopt een lange omschrijving uit zijn kader.
 */
export interface BezoekBevinding extends Rij {
  nummer: string
  volgnummer: number
  titel: string
  omschrijving: string
  omschrijving_kort: string
  locatie: string
  /** Discipline (kwaliteit), ruimte (oplevering) of sectie (formulier). */
  groep: string
  ernst: string
  ernst_label: string
  is_kritiek: boolean
  status: string
  status_label: string
  is_open: boolean
  is_opgelost: boolean
  eis: string
  eis_kort: string
  /** Gemeten waarde met eenheid, bv. "62 µm". Leeg als er niets is gemeten. */
  meting: string
  actie: string
  actie_kort: string
  datum: string
  hersteldatum: string
  /** Base64 data-URL. Nooit een Buffer: de image-module ziet die aan voor een al
   *  verwerkte afbeelding en crasht dan. */
  foto: string
  foto_na: string
  heeft_foto: boolean
  heeft_foto_na: boolean
  reacties: Rij[]
  heeft_reacties: boolean
}

export interface BezoekBlok extends Rij {
  /** Is er een bezoek gevonden om over te rapporteren? */
  aanwezig: boolean
  soort: BezoekSoort | ''
  soort_label: string
  titel: string
  /** Inspectienummer, naam van het oplevermoment of van het formulier. */
  kenmerk: string
  datum: string
  tijd: string
  uitvoerder: string
  locatie: string
  werkzaamheden: string
  omstandigheden: string
  inleiding: string

  samenvatting_regel: string
  /**
   * Vrije label/waarde-paren in plaats van vaste tellers. Elke bron telt iets anders, en
   * een vaste strook zou bij een oplevering half leeg staan.
   * Bewust **absolute aantallen, nooit een percentage** — een steekproef rechtvaardigt
   * geen "96% kwaliteit".
   */
  kengetallen: Rij[]
  heeft_kengetallen: boolean

  /** Vlakke lijst. Heet bewust NIET `bevindingen`: zie de noot onderaan dit bestand. */
  alle_bevindingen: BezoekBevinding[]
  paginas: Rij[]
  heeft_bevindingen: boolean
  aantal_bevindingen: number
  aantal_open: number

  metingen: Rij[]
  heeft_metingen: boolean
  punten: Rij[]
  heeft_punten: boolean
  waarnemingen: Rij[]
  heeft_waarnemingen: boolean
  opvolging: Rij[]
  heeft_opvolging: boolean
  opvolging_regel: string
  handtekeningen: Rij[]
  heeft_handtekeningen: boolean

  opmerkingen: string
  disclaimer: string
  per_pagina: number
}

export const LEEG_BEZOEK_BLOK: BezoekBlok = {
  aanwezig: false, soort: '', soort_label: '', titel: '', kenmerk: '',
  datum: '', tijd: '', uitvoerder: '', locatie: '', werkzaamheden: '',
  omstandigheden: '', inleiding: '',
  samenvatting_regel: '', kengetallen: [], heeft_kengetallen: false,
  alle_bevindingen: [], paginas: [], heeft_bevindingen: false,
  aantal_bevindingen: 0, aantal_open: 0,
  metingen: [], heeft_metingen: false,
  punten: [], heeft_punten: false,
  waarnemingen: [], heeft_waarnemingen: false,
  opvolging: [], heeft_opvolging: false, opvolging_regel: '',
  handtekeningen: [], heeft_handtekeningen: false,
  opmerkingen: '', disclaimer: '', per_pagina: 3,
}

/** Lege bevinding; adapters overschrijven wat hun bron kent. */
export const LEGE_BEVINDING: BezoekBevinding = {
  nummer: '', volgnummer: 0, titel: '', omschrijving: '', omschrijving_kort: '',
  locatie: '', groep: '', ernst: '', ernst_label: '', is_kritiek: false,
  status: '', status_label: '', is_open: false, is_opgelost: false,
  eis: '', eis_kort: '', meting: '', actie: '', actie_kort: '',
  datum: '', hersteldatum: '', foto: '', foto_na: '',
  heeft_foto: false, heeft_foto_na: false, reacties: [], heeft_reacties: false,
}

/**
 * De vaste toelichting onderaan het rapport, per soort.
 *
 * Staat hier en niet in het Word-sjabloon, zodat hij op elk rapport identiek is en niet per
 * ongeluk uit een sjabloonvariant verdwijnt. Overgenomen uit het kwaliteitsontwerp, waar de
 * strekking is: wat niet is beoordeeld, is daarmee niet goedgekeurd.
 */
export function bezoekDisclaimer(soort: BezoekSoort | ''): string {
  switch (soort) {
    case 'kwaliteit':
      return 'Deze kwaliteitscontrole betreft een periodieke steekproef van de op het moment van '
        + 'inspectie zichtbare, bereikbare en beoordeelbare werkzaamheden. De beoordeling vindt plaats '
        + 'op basis van de voor het betreffende onderdeel toepasselijke technische normen, richtlijnen, '
        + 'productspecificaties, projectafspraken en vastgestelde kwaliteitscriteria. '
        + 'Niet tijdens deze inspectie beoordeelde werkzaamheden worden niet automatisch als '
        + 'goedgekeurd beschouwd.'
    case 'oplevering':
      return 'Dit rapport legt vast wat op de opleverdatum gezamenlijk is waargenomen aan de op dat '
        + 'moment zichtbare en bereikbare onderdelen. Punten die later worden gemeld, worden behandeld '
        + 'volgens de garantieregeling zoals opgenomen in de opdrachtbevestiging.'
    case 'veiligheid':
      return 'Deze veiligheidsronde is een momentopname van de op dat moment waarneembare situatie op '
        + 'de werkplek. De ronde ontslaat betrokkenen niet van hun eigen verantwoordelijkheid om '
        + 'onveilige situaties te melden en te verhelpen zodra zij die constateren.'
    case 'formulier':
      return 'Dit rapport geeft de antwoorden weer zoals die op locatie zijn vastgelegd. Onderdelen die '
        + 'niet zijn ingevuld of niet zijn beoordeeld, worden niet automatisch als goedgekeurd beschouwd.'
    default:
      return ''
  }
}

/**
 * NOOT over `alle_bevindingen`.
 *
 * De `dottedTagParser` in render-docx lost een tag op in de *binnenste* passende scope. Een
 * pagina-object heeft zelf een veld `bevindingen`, dus zou `{#bezoek.bevindingen}` binnen
 * `{#bezoek.paginas}` stil het verkeerde blok pakken — geen foutmelding, alleen een rapport
 * dat de bevindingen van één pagina herhaalt. Vandaar de afwijkende naam op blokniveau.
 * Zelfde reden als `alle_registraties` in houtrot-rapport.ts.
 */
