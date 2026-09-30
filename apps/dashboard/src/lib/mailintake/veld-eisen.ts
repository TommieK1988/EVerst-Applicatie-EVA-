/**
 * Wat een veld betekent voor déze afhandeling: verplicht, gewenst, of niet van
 * toepassing.
 *
 * WAAROM DIT EEN TABEL IS EN GEEN REEKS IF-JES
 * Het behandelscherm toont voortaan alle velden, altijd op dezelfde plek. Wat per
 * bericht verschilt is niet meer wélke velden er staan, maar wat ze betékenen: een
 * werkadres is onmisbaar voor een nieuwe aanvraag en overbodig bij een opdracht op
 * een offerte, want dan staat het al op het dossier. Die kennis hoort op één plek
 * te staan waar je hem kunt nalezen en testen, niet verspreid over de opmaak.
 *
 * DE VERPLICHTE VELDEN ZIJN NIET NIEUW BEDACHT
 * Ze komen uit wat de code vandaag al afdwingt: de knopvoorwaarde in het
 * behandelscherm en de blokkades in `bouw7-gereed.ts`. Zo kunnen het rode veld op
 * het scherm en de weigering van de server niet uit elkaar lopen -- die stonden tot
 * nu toe los van elkaar.
 *
 * Bewust géén `'use server'`: het scherm is een client-component en moet deze tabel
 * synchroon kunnen lezen.
 */

import type { IntakeRoute, MailSoort } from './types'

/**
 * - `verplicht` — zonder dit veld kan de afhandeling niet door (wordt rood als het leeg is)
 * - `gewenst`   — hoort er meestal bij, maar houdt niets tegen
 * - `nvt`       — speelt bij deze afhandeling geen rol (wordt gedimd)
 */
export type Relevantie = 'verplicht' | 'gewenst' | 'nvt'

/**
 * De velden die het scherm kent. Grotendeels de sleutels uit het AI-schema, plus
 * twee die alleen op het scherm bestaan: of er een opdrachtgever ís gekozen (het
 * model levert een naam, de mens kiest de relatie) en welk offertedossier.
 */
export type VeldSleutel =
  | 'klant_naam' | 'contactpersoon_naam' | 'contactpersoon_email' | 'contactpersoon_telefoon'
  | 'werkadres_straat' | 'werkadres_huisnummer' | 'werkadres_postcode' | 'werkadres_stad'
  | 'werkadres_contact_naam' | 'werkadres_contact_telefoon' | 'werkadres_contact_email'
  | 'omschrijving' | 'categorie_voorstel' | 'werkmaatschappij_voorstel' | 'aard_van_het_werk'
  | 'referentie' | 'onze_offerte_referentie' | 'opdracht_referentie' | 'vve_code'
  | 'aanvraagdatum' | 'opdrachtdatum' | 'deadline' | 'gewenste_start'
  | 'bedrag_excl_btw' | 'mandaat_bedrag' | 'regie'
  | 'factuuradres_naam' | 'factuuradres_straat' | 'factuuradres_postcode' | 'factuuradres_plaats'
  | 'opmerkingen' | 'klant_opmerkingen' | 'betrokkenen'
  | 'offerte_dossier'

/** Alles wat niet in een tabel hieronder staat. */
const STANDAARD: Relevantie = 'gewenst'

/**
 * Per route. Dit is de zwaarste laag: de route bepaalt wat er überhaupt gebeurt.
 *
 * `nieuw_dossier` — de acht velden die de knop vandaag al eist, plus wat Bouw7
 * nodig heeft om een net project te maken. Er is nog geen offerte, dus het
 * offertedossier is niet van toepassing.
 *
 * `offerte_winnen` — alles wat het dossier al draagt is hier niet van toepassing:
 * omschrijving, adres, categorie en werkmaatschappij staan er al op en worden niet
 * overschreven. Wat telt is dat er een dossier gekozen is.
 *
 * `geen` — meerwerk en aanvullende informatie; die worden aan een bestaand dossier
 * gekoppeld, er wordt niets aangemaakt.
 */
const PER_ROUTE: Record<IntakeRoute, Partial<Record<VeldSleutel, Relevantie>>> = {
  nieuw_dossier: {
    klant_naam: 'verplicht',
    omschrijving: 'verplicht',
    categorie_voorstel: 'verplicht',
    werkmaatschappij_voorstel: 'verplicht',
    werkadres_straat: 'verplicht',
    werkadres_huisnummer: 'verplicht',
    werkadres_postcode: 'verplicht',
    werkadres_stad: 'verplicht',
    offerte_dossier: 'nvt',
  },
  offerte_winnen: {
    klant_naam: 'verplicht',
    offerte_dossier: 'verplicht',
    omschrijving: 'nvt',
    categorie_voorstel: 'nvt',
    werkmaatschappij_voorstel: 'nvt',
    aard_van_het_werk: 'nvt',
    werkadres_straat: 'nvt',
    werkadres_huisnummer: 'nvt',
    werkadres_postcode: 'nvt',
    werkadres_stad: 'nvt',
    vve_code: 'nvt',
    aanvraagdatum: 'nvt',
    deadline: 'nvt',
    mandaat_bedrag: 'nvt',
  },
  geen: {
    klant_naam: 'gewenst',
    offerte_dossier: 'nvt',
    omschrijving: 'nvt',
    categorie_voorstel: 'nvt',
    werkmaatschappij_voorstel: 'nvt',
    werkadres_straat: 'nvt',
    werkadres_huisnummer: 'nvt',
    werkadres_postcode: 'nvt',
    werkadres_stad: 'nvt',
    mandaat_bedrag: 'nvt',
  },
}

/**
 * Per mailsoort, over de route heen. Dit is de fijnregeling.
 *
 * Een mandaatbedrag hoort bij een servicedeskbon en nergens anders; een
 * opdrachtreferentie hoort bij een opdracht en niet bij een offerteaanvraag. Tot nu
 * toe zat dat als losse `isServicedesk`-conditie in de opmaak, waardoor het veld
 * letterlijk verdween en het scherm verschoof.
 */
const PER_SOORT: Partial<Record<MailSoort, Partial<Record<VeldSleutel, Relevantie>>>> = {
  offerteaanvraag: {
    opdracht_referentie: 'nvt',
    opdrachtdatum: 'nvt',
    bedrag_excl_btw: 'nvt',
    mandaat_bedrag: 'nvt',
  },
  opdrachtbon: {
    opdracht_referentie: 'verplicht',
    opdrachtdatum: 'gewenst',
  },
  opdracht_op_offerte: {
    opdracht_referentie: 'verplicht',
    onze_offerte_referentie: 'gewenst',
  },
  servicedeskbon: {
    mandaat_bedrag: 'gewenst',
    opdracht_referentie: 'gewenst',
  },
  meerwerk: {
    opdracht_referentie: 'gewenst',
  },
  aanvullende_informatie: {
    opdracht_referentie: 'nvt',
    opdrachtdatum: 'nvt',
    mandaat_bedrag: 'nvt',
  },
}

/** Alle sleutels, in de volgorde van het type hierboven. */
export const ALLE_VELDEN: VeldSleutel[] = [
  'klant_naam', 'contactpersoon_naam', 'contactpersoon_email', 'contactpersoon_telefoon',
  'werkadres_straat', 'werkadres_huisnummer', 'werkadres_postcode', 'werkadres_stad',
  'werkadres_contact_naam', 'werkadres_contact_telefoon', 'werkadres_contact_email',
  'omschrijving', 'categorie_voorstel', 'werkmaatschappij_voorstel', 'aard_van_het_werk',
  'referentie', 'onze_offerte_referentie', 'opdracht_referentie', 'vve_code',
  'aanvraagdatum', 'opdrachtdatum', 'deadline', 'gewenste_start',
  'bedrag_excl_btw', 'mandaat_bedrag', 'regie',
  'factuuradres_naam', 'factuuradres_straat', 'factuuradres_postcode', 'factuuradres_plaats',
  'opmerkingen', 'klant_opmerkingen', 'betrokkenen',
  'offerte_dossier',
]

/**
 * Wat elk veld betekent voor deze afhandeling.
 *
 * Volgorde: standaard, dan de route, dan de soort eroverheen. De soort is het
 * fijnst en wint dus -- behalve wanneer de route iets `nvt` maakt omdat het dossier
 * het al draagt. Dat is geen smaakkwestie: bij een opdracht op een offerte is een
 * leeg werkadresveld op het scherm niet hetzelfde als een ontbrekend werkadres.
 */
export function eisenVoor(
  route: IntakeRoute,
  soort: MailSoort | null,
): Record<VeldSleutel, Relevantie> {
  const uit = {} as Record<VeldSleutel, Relevantie>
  const route_ = PER_ROUTE[route] ?? {}
  const soort_ = soort ? PER_SOORT[soort] ?? {} : {}

  for (const veld of ALLE_VELDEN) {
    const viaRoute = route_[veld]
    const viaSoort = soort_[veld]
    // De route mag een veld buiten beeld zetten; de soort haalt het er niet terug in.
    uit[veld] = viaRoute === 'nvt' ? 'nvt' : viaSoort ?? viaRoute ?? STANDAARD
  }
  return uit
}
