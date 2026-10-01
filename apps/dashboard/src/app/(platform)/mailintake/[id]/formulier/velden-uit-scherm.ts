/**
 * Van wat er op het scherm staat naar waarnemingen voor het statusmodel.
 *
 * Dit is de enige plek waar de twee schrijfwijzen van de intake bij elkaar komen:
 * de ruwe modeluitvoer (`velden`, snake_case) en de gekeurde uitkomst
 * (`gekeurde_velden`, camelCase). Dat gebeurde eerder verspreid over drie
 * bestanden, met als gevolg dat het scherm soms een waarde toonde die de keuring
 * juist had verworpen.
 *
 * Pure functie, geen React: zo is hij te testen zonder een scherm te bouwen.
 */

import type { VeldSleutel } from '@/lib/mailintake/veld-eisen'
import type { VeldWaarneming } from '@/lib/mailintake/veld-status'

/** Wat het scherm op dit moment toont. */
export interface SchermToestand {
  klantId: string | null
  contactpersoonId: string | null
  contactpersoonEmail: string | null
  contactpersoonTelefoon: string | null
  omschrijving: string
  categorieId: number | ''
  werkmaatschappijId: string
  /** Hoe de werkmaatschappij is bepaald; uit een regel betekent: geen gok. */
  werkmaatschappijVia: 'categorie' | 'aard' | 'voorleggen' | 'geen'
  aardVanHetWerk: string | null
  straat: string
  huisnummer: string
  postcode: string
  stad: string
  /** De adresservice kent dit adres; dan zegt de modelscore niets meer. */
  adresBevestigd: boolean
  werkadresContactNaam: string | null
  werkadresContactTelefoon: string | null
  werkadresContactEmail: string | null
  referentie: string
  onzeOfferteReferentie: string | null
  opdrachtReferentie: string
  vveCode: string
  aanvraagdatum: string | null
  opdrachtdatum: string
  deadline: string
  gewensteStart: string | null
  bedragExclBtw: number | null
  mandaat: string
  regie: boolean
  factuuradresNaam: string | null
  factuuradresStraat: string | null
  factuuradresPostcode: string | null
  factuuradresPlaats: string | null
  opmerkingen: string
  klantOpmerkingen: string
  betrokkenen: unknown[]
  /** Het gekozen offertedossier, als de route dat vraagt. */
  offerteDossierId: string | null
  /** Het dossier waarop meerwerk wordt gezet. */
  meerwerkDossierId?: string | null
  /** Velden die de behandelaar zelf heeft aangeraakt; die zijn daarmee nagekeken. */
  aangeraakt: ReadonlySet<VeldSleutel>
  /** Per veld de zelfrapportage van het model. */
  zekerheid: Record<string, number>
  /**
   * Wat er op het gekozen offertedossier staat, voor de velden die daarvandaan
   * komen. Wijkt de mail af, dan is dat het geval om naar te kijken.
   */
  dossier?: Partial<Record<VeldSleutel, string | null>> | null
}

const gevuldIs = (v: unknown): boolean =>
  v != null && v !== '' && !(Array.isArray(v) && v.length === 0)

/** Verschillen die er niet toe doen: hoofdletters, dubbele spaties, randspaties. */
function zelfdeTekst(a: string | null | undefined, b: string | null | undefined): boolean {
  const n = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
  return n(a) === n(b)
}

export function waarnemingenUit(t: SchermToestand): Partial<Record<VeldSleutel, VeldWaarneming>> {
  /**
   * Eén veld beschrijven.
   *
   * `vastgesteld` betekent: deze waarde komt niet uit een gok over één mail. Dat is
   * zo zodra de behandelaar hem heeft aangeraakt -- wie een veld nakijkt, wil niet
   * dat het oranje blijft staan alsof EVA er nog over twijfelt.
   */
  const w = (
    sleutel: VeldSleutel,
    waarde: unknown,
    opties: { vast?: boolean; scoreVan?: string } = {},
  ): VeldWaarneming => {
    const uitDossier = t.dossier?.[sleutel] ?? null
    const tekst = typeof waarde === 'string' ? waarde : null
    return {
      gevuld: gevuldIs(waarde),
      score: t.zekerheid[opties.scoreVan ?? sleutel],
      vastgesteld: opties.vast || t.aangeraakt.has(sleutel),
      // Alleen melden als er écht iets anders staat; een dossier zonder waarde is
      // geen afwijking, en een verschil in hoofdletters ook niet.
      afwijkendInDossier:
        uitDossier && tekst && !zelfdeTekst(uitDossier, tekst) ? uitDossier : null,
    }
  }

  return {
    // De opdrachtgever is geen tekst maar een keuze: het model levert een naam, de
    // mens wijst de relatie aan. Is die gekozen, dan valt er niets meer na te kijken.
    klant_naam: w('klant_naam', t.klantId, { vast: t.klantId != null }),
    contactpersoon_naam: w('contactpersoon_naam', t.contactpersoonId, {
      vast: t.contactpersoonId != null,
    }),
    contactpersoon_email: w('contactpersoon_email', t.contactpersoonEmail),
    contactpersoon_telefoon: w('contactpersoon_telefoon', t.contactpersoonTelefoon),

    // Het adres: bevestigd door de adresservice betekent dat het bestaat en dat wij
    // het goed hebben overgenomen. Dan telt de modelscore niet meer.
    werkadres_straat: w('werkadres_straat', t.straat, { vast: t.adresBevestigd }),
    werkadres_huisnummer: w('werkadres_huisnummer', t.huisnummer, { vast: t.adresBevestigd }),
    werkadres_postcode: w('werkadres_postcode', t.postcode, { vast: t.adresBevestigd }),
    werkadres_stad: w('werkadres_stad', t.stad, { vast: t.adresBevestigd }),
    werkadres_contact_naam: w('werkadres_contact_naam', t.werkadresContactNaam),
    werkadres_contact_telefoon: w('werkadres_contact_telefoon', t.werkadresContactTelefoon),
    werkadres_contact_email: w('werkadres_contact_email', t.werkadresContactEmail),

    omschrijving: w('omschrijving', t.omschrijving),
    categorie_voorstel: w('categorie_voorstel', t.categorieId === '' ? null : t.categorieId),
    // Volgt de werkmaatschappij uit de categorie of uit de aard van het werk, dan is
    // dat een regel en geen gok. Eerder werd daarvoor een score van 1 verzonnen.
    werkmaatschappij_voorstel: w('werkmaatschappij_voorstel', t.werkmaatschappijId, {
      vast: t.werkmaatschappijVia === 'categorie' || t.werkmaatschappijVia === 'aard',
    }),
    aard_van_het_werk: w('aard_van_het_werk', t.aardVanHetWerk),

    referentie: w('referentie', t.referentie),
    onze_offerte_referentie: w('onze_offerte_referentie', t.onzeOfferteReferentie),
    opdracht_referentie: w('opdracht_referentie', t.opdrachtReferentie),
    vve_code: w('vve_code', t.vveCode),

    aanvraagdatum: w('aanvraagdatum', t.aanvraagdatum),
    opdrachtdatum: w('opdrachtdatum', t.opdrachtdatum),
    deadline: w('deadline', t.deadline),
    gewenste_start: w('gewenste_start', t.gewensteStart),

    bedrag_excl_btw: w('bedrag_excl_btw', t.bedragExclBtw),
    mandaat_bedrag: w('mandaat_bedrag', t.mandaat),
    // Een vinkje is altijd beantwoord: aan of uit is allebei een antwoord.
    regie: { gevuld: true, vastgesteld: true },

    factuuradres_naam: w('factuuradres_naam', t.factuuradresNaam),
    factuuradres_straat: w('factuuradres_straat', t.factuuradresStraat),
    factuuradres_postcode: w('factuuradres_postcode', t.factuuradresPostcode),
    factuuradres_plaats: w('factuuradres_plaats', t.factuuradresPlaats),

    opmerkingen: w('opmerkingen', t.opmerkingen),
    klant_opmerkingen: w('klant_opmerkingen', t.klantOpmerkingen),
    betrokkenen: w('betrokkenen', t.betrokkenen),

    offerte_dossier: w('offerte_dossier', t.offerteDossierId, {
      vast: t.offerteDossierId != null,
    }),
    meerwerk_dossier: w('meerwerk_dossier', t.meerwerkDossierId ?? null, {
      vast: (t.meerwerkDossierId ?? null) != null,
    }),
  }
}
