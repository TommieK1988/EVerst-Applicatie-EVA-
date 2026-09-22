/**
 * mailintake/types.ts
 *
 * Gedeelde typen en labels. Bewust géén 'use server': dit bestand exporteert
 * synchrone constanten, en die mogen niet in een server-action-module staan
 * (tsc keurt dat goed, de Next-build valt er wél over om).
 */

export type PostbusSoort = 'offerteaanvraag' | 'opdracht' | 'servicedesk'

export type BerichtStatus =
  | 'nieuw' | 'bezig' | 'wacht_op_mens' | 'verwerkt' | 'genegeerd' | 'geen_aanvraag' | 'mislukt'

export type BerichtBesluit =
  | 'automatisch_aangemaakt' | 'handmatig_aangemaakt' | 'gekoppeld_bestaand'
  | 'meerwerk' | 'offerte_gewonnen' | 'genegeerd' | 'geen_aanvraag'

/**
 * Wat voor mail dit is. Alleen de eerste vijf leiden tot een dossier of een
 * dossiermutatie; de rest is ruis die we wél bewaren maar niet verwerken.
 */
export type MailSoort =
  | 'offerteaanvraag'
  | 'opdracht_op_offerte'
  | 'opdrachtbon'
  | 'meerwerk'
  | 'servicedeskbon'
  | 'aanvullende_informatie'
  | 'factuur_of_administratie'
  | 'overig_geen_werk'

export const MAIL_SOORT_LABELS: Record<MailSoort, string> = {
  offerteaanvraag:         'Offerteaanvraag',
  opdracht_op_offerte:     'Opdracht op onze offerte',
  opdrachtbon:             'Opdrachtbon',
  meerwerk:                'Meerwerk',
  servicedeskbon:          'Servicedeskbon',
  aanvullende_informatie:  'Aanvullende informatie',
  factuur_of_administratie:'Factuur / administratie',
  overig_geen_werk:        'Geen werk',
}

/** De soorten die tot een dossier of dossiermutatie kunnen leiden. */
export const WERK_SOORTEN: MailSoort[] = [
  'offerteaanvraag', 'opdracht_op_offerte', 'opdrachtbon', 'meerwerk', 'servicedeskbon',
]

/** Soorten waarvoor automatisch aanmaken überhaupt in beeld komt (fase 2). */
export const AUTOMATISCH_TOEGESTANE_SOORTEN: MailSoort[] = [
  'offerteaanvraag', 'servicedeskbon', 'opdrachtbon',
]

/**
 * Soorten die altijd een bestaand dossier raken. Een opdrachtbon staat hier ook
 * in: die hoort bij werk dat al loopt, of hij hoort door een mens bekeken te
 * worden. Hem als losse aanvraag inschrijven zet een dossier in de verkeerde
 * fase, en dat is achteraf lastig recht te zetten.
 */
export const OPDRACHT_SOORTEN: MailSoort[] = ['opdracht_op_offerte', 'opdrachtbon']

/**
 * Wat er met een bericht moet gebeuren. Los van de vraag of EVA dat zelf mag
 * doen -- dat is een tweede afweging, zie beslis.ts.
 */
export type IntakeRoute = 'nieuw_dossier' | 'offerte_winnen' | 'geen'

export const ROUTE_LABELS: Record<IntakeRoute, string> = {
  nieuw_dossier:  'Nieuw dossier aanmaken',
  offerte_winnen: 'Offerte op gewonnen zetten',
  geen:           'Koppelen aan bestaand werk',
}

/**
 * Welke route hoort bij deze soort?
 *
 * Staat hier en niet in beslis.ts omdat het behandelscherm hem ook nodig heeft, en
 * dat is een client-component. types.ts is de plek voor wat beide kanten delen.
 *
 * Twee soorten opdracht, en het verschil zit in de naam.
 *
 * `opdracht_op_offerte` zegt zelf dat er een offerte van ons bij hoort. Vinden we
 * die niet, dan is er iets mis met het zoeken en niet met de mail; dan hoort een
 * mens het dossier aan te wijzen.
 *
 * `opdrachtbon` is een directe opdracht. Is er geen offerte te vinden, dan is dat
 * meestal geen zoekfout maar de werkelijkheid: dit werk staat nog niet in EVA. Dan
 * is een nieuw dossier in fáse Opdracht het goede antwoord. Dat stond eerder
 * anders -- toen kon een opdracht alleen als aanvraag worden ingeschreven, en dat
 * was inderdaad de verkeerde fase. Met een fasekeuze bij het aanmaken is dat
 * bezwaar weg, en blijft er één over dat wel telt: de verkeerde offerte op
 * gewonnen zetten. Dat blijft dus streng bewaakt, dit niet.
 *
 * Een servicedeskbon werkt hetzelfde: is er een offerte, dan is het een opdracht;
 * is die er niet, dan is het nieuw werk.
 */
export function bepaalRoute(
  soort: MailSoort | null,
  offerteMatchGevonden: boolean,
  regie = false,
): IntakeRoute {
  if (soort === 'offerteaanvraag') return 'nieuw_dossier'

  // Regie en een offerte sluiten elkaar niet uit. Er wordt wel degelijk een offerte
  // uitgebracht om bijvoorbeeld het uurtarief vast te leggen, en de opdracht die
  // daarop volgt verwijst er lang niet altijd naar. Regie zegt dus iets over hóé er
  // wordt afgerekend -- nacalculatie, geen aanneemsom -- en niet over de vraag of er
  // een offerte te winnen valt.
  //
  // Alleen als er niets te winnen is, wordt een regie-opdracht een nieuw dossier.
  if (soort != null && OPDRACHT_SOORTEN.includes(soort)) {
    if (offerteMatchGevonden) return 'offerte_winnen'
    if (regie) return 'nieuw_dossier'
    // Zie hierboven: een bon zonder offerte is nieuw werk, een "opdracht op onze
    // offerte" zonder offerte is een zoekvraag voor een mens.
    return soort === 'opdrachtbon' ? 'nieuw_dossier' : 'offerte_winnen'
  }
  if (soort === 'servicedeskbon') {
    if (offerteMatchGevonden) return 'offerte_winnen'
    return 'nieuw_dossier'
  }
  return 'geen'
}

export type HerkendVia =
  | 'alias' | 'email_contactpersoon' | 'email_domein' | 'relatie_naam' | 'handmatig'

export const HERKEND_VIA_LABELS: Record<HerkendVia, string> = {
  alias:                'eerder handmatig gekoppeld',
  email_contactpersoon: 'het e-mailadres van een contactpersoon',
  email_domein:         'het e-maildomein',
  relatie_naam:         'de klantnaam in de mail',
  handmatig:            'handmatig gekozen',
}

export type BijlageRol = 'opdrachtbon' | 'bestek' | 'tekening' | 'foto' | 'offerte' | 'overig'

export type DuplicaatSoort = 'duplicaat' | 'offerte_match' | 'meerwerk_kandidaat'

// ─── Drempels ────────────────────────────────────────────────────────────────
// Op één plek, omdat ze samen bepalen hoeveel EVA zelfstandig doet.
//
// DE AFWEGING IS VERZET (22 september 2026)
// De eerste ijking stond op "bij twijfel altijd voorleggen", en die bleek in de
// praktijk zo streng dat er van de eerste 35 berichten vrijwel niets doorheen
// kwam. Dan is het een postvak met een dure AI ervoor, geen intake. De afweging
// is daarom expliciet omgedraaid: liever achteraf iets aanvullen of corrigeren
// dan elke mail met de hand beoordelen.
//
// Wat hieronder NÍET is verruimd: de controle of Bouw7 het project correct kan
// aanmaken, de harde duplicaathit, en de regel dat EVA nooit zelf een relatie of
// een meerwerkregel aanmaakt. Dat zijn geen twijfelgevallen maar fouten die
// niemand terugvindt.

/** Vanaf hier telt een afzender als "bekend" genoeg voor de automatische route. */
export const AFZENDER_AUTOMATISCH = 0.85
/** Onder deze score melden we expliciet dat de afzender onbekend is. */
export const AFZENDER_ONBEKEND = 0.60

/**
 * Vanaf hier is de AI zeker genoeg over de soort om de automatische route in te gaan.
 *
 * Stond op 0,90. In de praktijk levert een goed gelezen opdrachtbon 0,85 tot 0,88
 * op -- het model is terecht terughoudend met scores boven 0,9, want dat staat zo
 * in de prompt. De drempel sneed daarmee juist de berichten weg die goed gelezen
 * waren. Een verkeerd gekozen soort is bovendien te herstellen: het dossier staat
 * er, en de fase is achteraf te wijzigen.
 */
export const SOORT_ZEKER = 0.80
/** Onder deze score vullen we de soort niet eens voor. */
export const SOORT_ONZEKER = 0.60

/** Harde duplicaat-hit: nooit automatisch, altijd waarschuwen. */
export const DUPLICAAT_HARD = 0.80
/**
 * Twijfel: voorleggen, en de bevestigingsdialoog tonen bij handmatig aanmaken.
 *
 * Stond op 0,55, en dat is precies de score van "zelfde klant + postcode +
 * huisnummer" (0,45) plus een kleinigheid. Bij een beheerder die vaker op
 * hetzelfde complex werkt is dat de normale toestand en geen duplicaat; het
 * blokkeerde daardoor structureel. De harde hits -- zelfde mailconversatie,
 * identieke bijlage, ons nummer letterlijk in de mail -- zitten op 0,80 en die
 * blijven onveranderd tegenhouden.
 */
export const DUPLICAAT_TWIJFEL = 0.65

/** Per veld: vanaf hier tonen we het als betrouwbaar ingevuld. */
export const VELD_BETROUWBAAR = 0.80

// ─── Rijen ───────────────────────────────────────────────────────────────────

export interface PostbusRij {
  id: string
  sleutel: string
  naam: string
  adres: string
  soort: PostbusSoort
  map_id: string
  actief: boolean
  automatisch_aanmaken: boolean
  standaard_werkmaatschappij_id: string | null
  standaard_bouw7_categorie_id: number | null
  standaard_categorie: string | null
  /**
   * Wie de actie krijgt als een bericht uit deze postbus wordt voorgelegd. De
   * dossierrollen zijn op dat moment nog niet gevuld, dus zonder dit veld hangt
   * een voorgelegd bericht aan niemand.
   */
  standaard_behandelaar_id: string | null
  notificatie_medewerkers: string[]
  dagbudget_cent: number
  map_verwerkt_id: string | null
  map_verwerkt_naam: string
  laatste_ophaal_op: string | null
  laatste_ophaal_gelukt_op: string | null
  laatste_fout: string | null
}

/**
 * Wat er van een postbus gewijzigd mag worden vanuit het beheerscherm.
 * Expliciet, zodat een verkeerd getypeerde waarde uit de browser wordt geweigerd
 * in plaats van blind weggeschreven.
 */
export interface PostbusPatch {
  naam?: string
  adres?: string
  soort?: PostbusSoort
  map_id?: string
  actief?: boolean
  automatisch_aanmaken?: boolean
  standaard_werkmaatschappij_id?: string | null
  standaard_bouw7_categorie_id?: number | null
  standaard_categorie?: string | null
  standaard_behandelaar_id?: string | null
  notificatie_medewerkers?: string[]
  dagbudget_cent?: number
  map_verwerkt_naam?: string
  map_verwerkt_id?: string | null
  updated_at?: string
}

export interface BerichtRij {
  id: string
  postbus_id: string
  graph_message_id: string | null
  internet_message_id: string
  conversation_id: string | null
  onderwerp: string | null
  van_naam: string | null
  van_adres: string | null
  aan: string[]
  cc: string[]
  ontvangen_op: string
  body_tekst: string | null
  body_preview: string | null
  is_automatisch_antwoord: boolean
  is_antwoord: boolean
  heeft_bijlagen: boolean
  soort: MailSoort | null
  soort_vertrouwen: number | null
  samenvatting: string | null
  status: BerichtStatus
  besluit: BerichtBesluit | null
  dossier_id: string | null
  relatie_id: string | null
  contactpersoon_id: string | null
  herkend_via: HerkendVia | null
  herkenning_score: number | null
  duplicaat_topscore: number | null
  pogingen: number
  laatste_fout: string | null
  outlook_nabehandeling: 'nvt' | 'open' | 'gedaan' | 'mislukt'
  outlook_fout: string | null
  toegewezen_medewerker_id: string | null
  behandeld_door: string | null
  behandeld_op: string | null
  created_at: string
}

export interface BijlageRij {
  id: string
  bericht_id: string
  graph_attachment_id: string | null
  bestandsnaam: string
  content_type: string | null
  grootte_bytes: number | null
  is_inline: boolean
  sha256: string | null
  opslag_pad: string | null
  te_groot: boolean
  rol: BijlageRol | null
  aan_ai_gegeven: boolean
  naar_sharepoint_op: string | null
}

export interface DuplicaatKandidaat {
  id: string
  bericht_id: string
  dossier_id: string
  score: number
  redenen: string[]
  soort: DuplicaatSoort
  /** Verrijkt bij het uitlezen; staat niet in de tabel. */
  dossiernummer?: string | null
  titel?: string | null
  klantnaam?: string | null
  hoofdstatus?: string | null
}

// ─── Weergave (gedeeld met client-componenten) ───────────────────────────────
// Deze staan hier en niet in data.ts of nabehandeling.ts: die modules zijn
// `server-only`, en een client-component die er een constante uit importeert
// sloopt de build.

export type PostvakTab =
  | 'te_behandelen' | 'verwerkt' | 'geen_aanvraag' | 'genegeerd' | 'mislukt' | 'alles'

export const POSTVAK_TABS: { key: PostvakTab; label: string }[] = [
  { key: 'te_behandelen', label: 'Te behandelen' },
  { key: 'verwerkt',      label: 'Verwerkt' },
  { key: 'geen_aanvraag', label: 'Archief' },
  { key: 'genegeerd',     label: 'Genegeerd' },
  { key: 'mislukt',       label: 'Mislukt' },
  { key: 'alles',         label: 'Alles' },
]

/**
 * Het getal achter een tabblad in het postvak.
 *
 * Staat hier en niet in `data.ts`: dat bestand is server-only en het postvak is een
 * client-component.
 */
export interface PostvakTeller {
  /** Het aantal regels dat je in het tabblad zult zien, dus ná het samenvouwen. */
  aantal: number
  /** Er zijn er meer dan er getoond kunnen worden; de teller is een ondergrens. */
  meer: boolean
}

export interface PostvakRij {
  id: string
  onderwerp: string | null
  vanNaam: string | null
  vanAdres: string | null
  ontvangenOp: string
  heeftBijlagen: boolean
  soort: MailSoort | null
  soortVertrouwen: number | null
  samenvatting: string | null
  status: BerichtStatus
  besluit: BerichtBesluit | null
  postbusNaam: string
  postbusSleutel: string
  relatieId: string | null
  relatieNaam: string | null
  herkendVia: HerkendVia | null
  herkenningScore: number | null
  duplicaatTopscore: number | null
  duplicaatDossiernummer: string | null
  dossierId: string | null
  dossiernummer: string | null
  toegewezenNaam: string | null
  outlookNabehandeling: string
  laatsteFout: string | null
  /**
   * Hoeveel mails er in deze klus zitten. Een opdracht komt lang niet altijd in
   * één mail binnen; het postvak toont dan één regel, niet drie losse.
   */
  aantalInGroep: number
}

/** Wat er in Outlook gebeurt zodra een bericht is afgehandeld. */
export type NabehandelStand = 'aan' | 'alleen_categorie' | 'uit'

export const NABEHANDEL_LABELS: Record<NabehandelStand, string> = {
  aan:              'Aan - categorie zetten en verplaatsen naar "Verwerkt door EVA"',
  alleen_categorie: 'Alleen categorie - niets verplaatsen',
  uit:              'Uit - Outlook blijft volledig ongemoeid',
}

/** Maximaal aantal pogingen voor de nabehandeling voordat we het opgeven. */
export const MAX_OUTLOOK_POGINGEN = 3
