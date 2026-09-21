/**
 * mailintake/regels.ts
 *
 * De bedrijfsregels van de intake: pure functies en lijsten, geen database, geen
 * netwerk, geen `server-only`.
 *
 * Dat laatste is het punt. Dit zijn de regels die bepalen welke werkmaatschappij
 * een aanvraag krijgt en wanneer een bedrag een mandaat is — precies het soort
 * afspraak dat je wilt kunnen nalezen en natoetsen zonder dat er iets in productie
 * beweegt. Stonden ze in extractie.ts, dan zaten ze achter een AI-client en een
 * server-only-import.
 */

import type { MailSoort, PostbusSoort } from './types'

const WM_SCHILDERS = 'everts onderhoudsschilders'
const WM_BOUW = 'bouwbedrijf morgenstond'

/**
 * Categorieën die de werkmaatschappij op zichzelf al bepalen.
 *
 * Schilderwerk gaat altijd naar de schilders. Renovatie, Mutatie en Dagelijks
 * onderhoud gaan altijd naar Morgenstond -- die dekt daar de hele lading, ook als
 * er schilderwerk in zit. Alleen **Bouwkundig Onderhoud** is een echt twijfelgeval,
 * want dat loopt van een enkele gevelreparatie tot een compleet renovatietraject.
 *
 * Kleine letters, want er wordt genormaliseerd vergeleken.
 */
const CATEGORIE_SCHILDERS = ['schilderwerk']
const CATEGORIE_BOUW = ['renovatie', 'mutatie', 'dagelijks onderhoud']

/**
 * De twee categorieën waaraan een dossier als servicedeskwerk wordt herkend.
 *
 * Stond hier een tweede keer gedefinieerd naast de kopie in de fasetabel. Eén lijst
 * nu, in `components/dossiers/fase-plaatsing`, doorgevoerd voor wie hem hier al
 * importeerde.
 */
export { SERVICEDESK_CATEGORIEEN } from '@/components/dossiers/fase-plaatsing'

/** Woorden die een bedrag tot een mandaat maken in plaats van tot een prijsindicatie. */
export const MANDAAT_WOORDEN = [
  'mandaat', 'budget', 'tot maximaal', 'kostenlimiet', 'plafond',
  // Opdrachtbonnen van beheerders schrijven dit op allerlei manieren. "maximaal
  // factuurbedrag" stond in de eerste echte bon die binnenkwam en viel buiten de
  // lijst omdat daar 'maximaal bedrag' stond -- met 'factuur' ertussen.
  'maximaal bedrag', 'maximaal factuurbedrag', 'maximale factuurbedrag',
  'factuurbedrag', 'tot een maximum', 'niet overschrijden', 'bestedingsruimte',
]

/**
 * Woorden waaraan je een regie-opdracht herkent.
 *
 * Regie betekent: geen aanneemsom vooraf, afrekenen op basis van wat het werkelijk
 * is geworden. Dat is niet hetzelfde als servicedeskwerk -- het kan net zo goed een
 * bouwkundige klus zijn -- en er hoort per definitie geen offerte bij, want de prijs
 * staat nog niet vast.
 */
export const REGIE_WOORDEN = [
  'regie', 'regiebasis', 'op regiebasis', 'in regie',
  'uurbasis', 'op uurbasis', 'nacalculatie', 'nacalculatorisch',
  'verrekenbare uren', 'werkelijk bestede uren', 'uurtarief',
]

export type WerkmaatschappijVia = 'aard' | 'categorie' | 'voorleggen' | 'geen'

/** Wat het werk in hoofdzaak is; bepaalt de werkmaatschappij. */
export type AardVanHetWerk = 'schilderwerk' | 'bouwkundig' | 'gemengd' | 'onduidelijk'

/**
 * Welke werkmaatschappij hoort bij dit werk?
 *
 * **De categorie beslist, waar hij dat kan.** Vier van de zes categorieën laten
 * geen ruimte:
 *
 *  | Schilderwerk                                 | Everts Onderhoudsschilders |
 *  | Renovatie, Mutatie, Dagelijks onderhoud      | Bouwbedrijf Morgenstond    |
 *
 * Morgenstond dekt bij die drie altijd de lading, ook als er schilderwerk in zit.
 * Daar hoeft dus niet over geoordeeld te worden, en dat is winst: hoe minder er te
 * wegen valt, hoe minder er te missen valt.
 *
 * **Alleen Bouwkundig Onderhoud is een twijfelgeval**, want dat loopt van een
 * enkele gevelreparatie tot een compleet renovatietraject. Daar telt het oordeel
 * over de aard van het werk:
 *
 *  | overwegend schilderwerk                      | Everts Onderhoudsschilders |
 *  | bouwkundig, ook met wat schilderwerk erbij   | Bouwbedrijf Morgenstond    |
 *  | gemengd of onduidelijk                       | voorleggen aan een mens    |
 *
 * Twee dingen daarbij zijn geen detail.
 *
 * **Alleen deze twee werkmaatschappijen.** Schildersbedrijf Everts en
 * Dakdekkersbedrijf Dakplan komen bij een intake niet in aanmerking, ook niet als
 * de mail er één letterlijk noemt. Eerder woog zo'n vermelding juist het zwaarst,
 * waardoor een terloopse zin in een handtekening of een doorgestuurde kop het werk
 * bij de verkeerde onderneming kon zetten.
 *
 * **Voorleggen is een eigen uitkomst, geen terugval.** Hiervoor viel alles wat de
 * categorie niet besliste stilzwijgend op de standaard van de postbus. Dat is
 * precies het gokken dat hier niet hoort: liever leeg, met de vraag erbij, dan een
 * keuze die niemand gemaakt heeft. Een leeg veld dwingt het bericht vanzelf naar
 * `wacht_op_mens`, want de veldcontrole eist een werkmaatschappij.
 */
export function kiesWerkmaatschappij(
  aard: AardVanHetWerk | null,
  categorieNaam: string | null,
  lijst: { id: string; naam: string }[],
): { id: string | null; via: WerkmaatschappijVia } {
  const zoek = (voorvoegsel: string) =>
    lijst.find(w => w.naam.toLowerCase().startsWith(voorvoegsel))?.id ?? null

  const cat = (categorieNaam ?? '').trim().toLowerCase()

  // ── De categorie beslist ──────────────────────────────────────────────────
  if (CATEGORIE_SCHILDERS.includes(cat)) {
    const id = zoek(WM_SCHILDERS)
    if (id) return { id, via: 'categorie' }
  }
  if (CATEGORIE_BOUW.includes(cat)) {
    const id = zoek(WM_BOUW)
    if (id) return { id, via: 'categorie' }
  }

  // ── Bouwkundig Onderhoud, Overige of geen categorie: de aard beslist ──────
  if (aard === 'schilderwerk') {
    const id = zoek(WM_SCHILDERS)
    if (id) return { id, via: 'aard' }
  }
  if (aard === 'bouwkundig') {
    const id = zoek(WM_BOUW)
    if (id) return { id, via: 'aard' }
  }
  if (aard === 'gemengd' || aard === 'onduidelijk') {
    return { id: null, via: 'voorleggen' }
  }

  return { id: null, via: 'geen' }
}

/**
 * Bij welke postbus hoort deze mailsoort inhoudelijk?
 *
 * Post komt lang niet altijd in de goede bus terecht: een servicedeskbon wordt naar
 * opdrachten@ gestuurd, een offerteaanvraag naar servicedesk@. Wat er met zo'n
 * bericht moet gebeuren volgt uit de inhoud, niet uit het adres waar het toevallig
 * binnenkwam -- anders krijgt een offerteaanvraag een servicedeskcategorie omdat de
 * bus dat nu eenmaal afdwingt, en gaat een storing naar de verkeerde behandelaar.
 *
 * `null` = de inhoud zegt er niets over (ruis, aanvullende informatie); dan blijft
 * de bus waar het binnenkwam leidend.
 */
export function postbusSoortVoorMail(soort: MailSoort | null): PostbusSoort | null {
  switch (soort) {
    case 'offerteaanvraag': return 'offerteaanvraag'
    case 'opdracht_op_offerte':
    case 'opdrachtbon':
    case 'meerwerk': return 'opdracht'
    case 'servicedeskbon': return 'servicedesk'
    default: return null
  }
}


/**
 * Maakt tekst vergelijkbaar: kleine letters, en alles wat geen letter of cijfer is
 * wordt een spatie.
 *
 * Nodig omdat een zinsnede uit een mail zelden letterlijk terugkomt zoals het model
 * hem aanhaalt: er zitten aanhalingstekens omheen, hij loopt over een regeleinde,
 * of er staat een niet-brekende spatie in. Een kale `includes` mist dat allemaal en
 * zegt dan ten onrechte "dit staat er niet".
 */
export function normaliseerVoorVergelijking(s: string): string {
  return ' ' + s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' '
}

/**
 * Staat dit fragment in de brontekst?
 *
 * Dit is de controle die telt bij een oordeel van het model: niet "kent mijn
 * woordenlijst deze term", maar "kan het model aanwijzen waar het staat". Dat
 * verschil kostte de eerste echte opdrachtbon -- daar stond "op basis van uur werk",
 * en dat komt in geen enkele lijst voor die je vooraf verzint.
 */
export function komtVoorInBron(fragment: string | null | undefined, bron: string): boolean {
  const f = normaliseerVoorVergelijking(String(fragment ?? '')).trim()
  if (f.length < 8) return false
  return normaliseerVoorVergelijking(bron).includes(' ' + f + ' ')
}

/**
 * Noemt de brontekst regiewerk?
 *
 * Bewust op hele woorden: "regie" zit ook in "regio" en "regisseur", en een valse
 * treffer zou een aangenomen opdracht ten onrechte zonder aanneemsom wegzetten.
 */
export function noemtRegie(brontekst: string): boolean {
  const laag = normaliseerVoorVergelijking(brontekst)
  return REGIE_WOORDEN.some(w => laag.includes(normaliseerVoorVergelijking(w)))
}

/** Noemt de brontekst een mandaat, of is dat losse bedrag gewoon een prijs? */
export function noemtMandaat(brontekst: string): boolean {
  const laag = brontekst.toLowerCase()
  return MANDAAT_WOORDEN.some(w => laag.includes(w))
}

// ─── Adressen vergelijken ─────────────────────────────────────────────────────

/**
 * Straatnaam en huisnummers uit een vrije adresnotatie.
 *
 * "Vrij" is hier het sleutelwoord: in de praktijk staat een adres zelden netjes in
 * de velden waar het hoort. Het dossier dat bij de eerste echte opdrachtbon hoorde
 * had "Steenlaan 32, 34 en 36" volledig in het straatveld staan, met een leeg
 * huisnummer en een lege postcode. Elke vergelijking die op die velden vertrouwt
 * vindt zo'n dossier nooit.
 *
 * Postcodes worden overgeslagen: "2700 AP" zou anders als huisnummer 2700 tellen.
 */
export function adresKern(vrij: string): { straat: string; nummers: string[] } {
  const zonderPostcode = vrij.replace(/\b\d{4}\s*[a-zA-Z]{2}\b/g, ' ')
  const genormaliseerd = zonderPostcode.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

  const straatWoorden: string[] = []
  for (const woord of genormaliseerd.split(' ')) {
    if (/^\d/.test(woord)) break
    straatWoorden.push(woord)
  }

  const nummers = (genormaliseerd.match(/\b\d{1,4}\b/g) ?? [])
    .filter(n => Number(n) > 0 && Number(n) < 10000)

  return { straat: straatWoorden.join(' ').trim(), nummers: [...new Set(nummers)] }
}

/**
 * Hoe sterk lijkt dit adres op wat er van een dossier bekend is?
 *
 * `dossierTekst` is bewust alles bij elkaar — straatveld, huisnummerveld én titel.
 * De titel draagt het adres namelijk vaak wél correct ("Steenlaan 32, 34 en 36
 * Rijswijk, bouwkundige werkzaamheden…") terwijl de velden eromheen half gevuld zijn.
 *
 * Een gedeelde straat zonder gedeeld huisnummer is expres zwak: bij een VvE-complex
 * ligt al het werk aan dezelfde straat, en dan zou elke nieuwe aanvraag als mogelijk
 * duplicaat worden aangemerkt.
 */
export function adresOvereenkomst(
  straat: string | null,
  huisnummer: string | null,
  dossierTekst: string,
): 'straat_en_nummer' | 'straat' | null {
  const mail = adresKern([straat, huisnummer].filter(Boolean).join(' '))
  if (mail.straat.length < 4) return null

  const dossier = adresKern(dossierTekst)
  const dossierPlat = ' ' + dossierTekst.toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' '
  if (!dossierPlat.includes(' ' + mail.straat + ' ')) return null

  const gedeeld = mail.nummers.some(n => dossier.nummers.includes(n))
  return gedeeld ? 'straat_en_nummer' : 'straat'
}

/** Het onderwerp zonder Re:/Fw:-aanloop, om twee kanten van een gesprek te herkennen. */
export function kaalOnderwerp(onderwerp: string | null): string {
  if (!onderwerp) return ''
  let t = onderwerp
  // Herhaald, want "Re: FW: Antw: ..." komt echt voor.
  for (let i = 0; i < 5; i++) {
    const korter = t.replace(/^\s*(re|fw|fwd|antw|doorst|aw)\s*(\[\d+\])?\s*:\s*/i, '')
    if (korter === t) break
    t = korter
  }
  // Getrimd: `normaliseerVoorVergelijking` omhult met spaties voor woordgrenzen,
  // en die twee tekens zouden hier meetellen in de lengtedrempel.
  return normaliseerVoorVergelijking(t).trim()
}
