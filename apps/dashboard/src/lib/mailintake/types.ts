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
  'offerteaanvraag', 'servicedeskbon',
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
 * Een opdracht raakt altijd een bestaand dossier -- ook een opdrachtbon zonder
 * voorafgaande offerte. EVA schrijft een opdracht nooit in als losse aanvraag: dan
 * staat er een dossier in de verkeerde fase, en dat is achteraf lastig recht te
 * zetten. Vindt EVA geen offerte, dan wijst een mens het dossier aan.
 *
 * Een servicedeskbon is het enige geval waarin de route van de omstandigheden
 * afhangt: is er een offerte, dan is het een opdracht; is die er niet, dan is het
 * nieuw werk.
 */
export function bepaalRoute(soort: MailSoort | null, offerteMatchGevonden: boolean): IntakeRoute {
  if (soort === 'offerteaanvraag') return 'nieuw_dossier'
  if (soort != null && OPDRACHT_SOORTEN.includes(soort)) return 'offerte_winnen'
  if (soort === 'servicedeskbon') return offerteMatchGevonden ? 'offerte_winnen' : 'nieuw_dossier'
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
// Op één plek, omdat ze samen de belofte "bij twijfel altijd voorstellen" dragen.
// Wie hier iets verandert, verandert hoeveel EVA zelfstandig doet.

/** Vanaf hier telt een afzender als "bekend" genoeg voor de automatische route. */
export const AFZENDER_AUTOMATISCH = 0.85
/** Onder deze score melden we expliciet dat de afzender onbekend is. */
export const AFZENDER_ONBEKEND = 0.60

/** Vanaf hier is de AI zeker genoeg over de soort om de automatische route te mogen ingaan. */
export const SOORT_ZEKER = 0.90
/** Onder deze score vullen we de soort niet eens voor. */
export const SOORT_ONZEKER = 0.60

/** Harde duplicaat-hit: nooit automatisch, altijd waarschuwen. */
export const DUPLICAAT_HARD = 0.80
/** Twijfel: voorleggen, en de bevestigingsdialoog tonen bij handmatig aanmaken. */
export const DUPLICAAT_TWIJFEL = 0.55

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
  { key: 'geen_aanvraag', label: 'Geen aanvraag' },
  { key: 'genegeerd',     label: 'Genegeerd' },
  { key: 'mislukt',       label: 'Mislukt' },
  { key: 'alles',         label: 'Alles' },
]

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
