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

import type { DossierFase } from '@/components/dossiers/fase-plaatsing'

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
  | 'bedrag_excl_btw' | 'mandaat_bedrag' | 'regie' | 'termijnschema'
  | 'factuuradres_naam' | 'factuuradres_straat' | 'factuuradres_postcode' | 'factuuradres_plaats'
  | 'opmerkingen' | 'klant_opmerkingen' | 'betrokkenen'
  | 'offerte_dossier' | 'meerwerk_dossier'

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
    meerwerk_dossier: 'gewenst',
    // Meerwerk gaat op een opdracht die al loopt; de termijnstaat daarvan staat er
    // al en wordt hier niet opnieuw opgezet.
    termijnschema: 'nvt',
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
    meerwerk_dossier: 'nvt',
    opdracht_referentie: 'nvt',
    opdrachtdatum: 'nvt',
    bedrag_excl_btw: 'nvt',
    mandaat_bedrag: 'nvt',
  },
  opdrachtbon: {
    meerwerk_dossier: 'nvt',
    opdracht_referentie: 'verplicht',
    opdrachtdatum: 'gewenst',
  },
  opdracht_op_offerte: {
    meerwerk_dossier: 'nvt',
    opdracht_referentie: 'verplicht',
    onze_offerte_referentie: 'gewenst',
  },
  servicedeskbon: {
    meerwerk_dossier: 'nvt',
    mandaat_bedrag: 'gewenst',
    opdracht_referentie: 'gewenst',
  },
  meerwerk: {
    // Zonder dossier is er geen opdracht om meerwerk op te zetten; dat is de hele
    // handeling. Stond eerder nergens, waardoor het scherm een nieuw dossier
    // voorstelde -- wat voor meerwerk nooit klopt.
    meerwerk_dossier: 'verplicht',
    opdracht_referentie: 'gewenst',
  },
  aanvullende_informatie: {
    meerwerk_dossier: 'nvt',
    opdracht_referentie: 'nvt',
    opdrachtdatum: 'nvt',
    mandaat_bedrag: 'nvt',
  },
}

/**
 * Per gekozen fase. Dit is de enige laag waar een mens aan het woord is.
 *
 * WAAROM DE FASE MEETELT
 * De fase is de keuze die de behandelaar links maakt: komt dit als aanvraag, als
 * opdracht of als servicedeskbon binnen. Die keuze bepaalt wat er daarna met het
 * dossier gebeurt, en dus ook welke velden ervoor nodig zijn -- bij een aanvraag
 * valt er niets over termijnen te zeggen, want er is nog geen aanneemsom. Toch
 * stonden de eisen alleen op de route en de mailsoort: klikte je van Aanvraag naar
 * Opdracht, dan bleven de opdrachtvelden gedimd staan en kwamen de termijnen niet
 * in beeld. Het scherm volgde je keuze niet.
 *
 * Alleen de velden die werkelijk van de fase afhangen staan hier. Een werkadres is
 * in alle drie de fases even nodig; dat hoort dus bij de route.
 */
const PER_FASE: Record<DossierFase, Partial<Record<VeldSleutel, Relevantie>>> = {
  aanvraag: {
    // Er is nog niets gegund: geen opdrachtnummer, geen opdrachtdatum, geen
    // aanneemsom om termijnen over te verdelen en geen mandaat om binnen te werken.
    opdracht_referentie: 'nvt',
    opdrachtdatum: 'nvt',
    mandaat_bedrag: 'nvt',
    termijnschema: 'nvt',
  },
  opdracht: {
    // Het werk is gegund. Het opdrachtnummer moet op de factuur terugkomen, het
    // bedrag is de aanneemsom, en de termijnen worden daarover verdeeld.
    opdracht_referentie: 'gewenst',
    opdrachtdatum: 'gewenst',
    bedrag_excl_btw: 'gewenst',
    termijnschema: 'gewenst',
    // Mandaat staat hier bewust niet op 'nvt'. Een mandaat betekent altijd regie, en
    // dat kan ook bij een gewone opdracht: dan is er geen aanneemsom maar een plafond
    // waarbinnen we werken. Gedimd zou dat juist het veld verbergen dat de
    // afrekenwijze verklaart.
  },
  servicedesk: {
    // Een bon loopt op mandaat en wordt nagecalculeerd: geen aanneemsom, dus ook
    // geen termijnstaat.
    mandaat_bedrag: 'gewenst',
    termijnschema: 'nvt',
  },
}

/** Van los naar streng; nodig om te zien of de fase iets zwaarder maakt of lichter. */
const RANG: Record<Relevantie, number> = { nvt: 0, gewenst: 1, verplicht: 2 }

/** Alle sleutels, in de volgorde van het type hierboven. */
export const ALLE_VELDEN: VeldSleutel[] = [
  'klant_naam', 'contactpersoon_naam', 'contactpersoon_email', 'contactpersoon_telefoon',
  'werkadres_straat', 'werkadres_huisnummer', 'werkadres_postcode', 'werkadres_stad',
  'werkadres_contact_naam', 'werkadres_contact_telefoon', 'werkadres_contact_email',
  'omschrijving', 'categorie_voorstel', 'werkmaatschappij_voorstel', 'aard_van_het_werk',
  'referentie', 'onze_offerte_referentie', 'opdracht_referentie', 'vve_code',
  'aanvraagdatum', 'opdrachtdatum', 'deadline', 'gewenste_start',
  'bedrag_excl_btw', 'mandaat_bedrag', 'regie', 'termijnschema',
  'factuuradres_naam', 'factuuradres_straat', 'factuuradres_postcode', 'factuuradres_plaats',
  'opmerkingen', 'klant_opmerkingen', 'betrokkenen',
  'offerte_dossier', 'meerwerk_dossier',
]

/**
 * Wat elk veld betekent voor deze afhandeling.
 *
 * Volgorde: standaard, dan de route, dan de soort eroverheen, dan de fase.
 *
 * De route mag een veld buiten beeld zetten en niemand haalt het terug: bij een
 * opdracht op een offerte is een leeg werkadresveld op het scherm niet hetzelfde
 * als een ontbrekend werkadres -- het staat al op het dossier.
 *
 * De fase komt daarna, want dat is de enige laag waar een mens iets zegt en geen
 * model iets afleidt. Met één uitzondering: hij maakt een veld nooit mínder
 * belangrijk dan de soort het al maakte. "Opdracht" zet de opdrachtvelden aan;
 * of een opdrachtnummer daarbij verplicht is of alleen gewenst weet de soort beter.
 * Omgekeerd mag de fase een veld wél helemaal uitzetten -- wie zegt dat dit tóch
 * een aanvraag is, zegt daarmee dat er geen opdrachtnummer te verwachten valt.
 */
export function eisenVoor(
  route: IntakeRoute,
  soort: MailSoort | null,
  fase?: DossierFase | null,
): Record<VeldSleutel, Relevantie> {
  const uit = {} as Record<VeldSleutel, Relevantie>
  const route_ = PER_ROUTE[route] ?? {}
  const soort_ = soort ? PER_SOORT[soort] ?? {} : {}
  const fase_ = fase ? PER_FASE[fase] ?? {} : {}

  for (const veld of ALLE_VELDEN) {
    const viaRoute = route_[veld]
    if (viaRoute === 'nvt') { uit[veld] = 'nvt'; continue }

    const zonderFase = soort_[veld] ?? viaRoute ?? STANDAARD
    const viaFase = fase_[veld]
    uit[veld] = viaFase != null && (viaFase === 'nvt' || RANG[viaFase] > RANG[zonderFase])
      ? viaFase
      : zonderFase
  }
  return uit
}
