/**
 * offerte-bronnen.ts
 *
 * Resolvet de bedrijfs- en dossiergegevens voor een offerte-render:
 *  - **Dossier** (informatie-tab: werkadres, calculator/rollen, referenties). Voorkeur:
 *    de directe koppeling `quotes.dossier_id` (gezet bij het aanmaken vanuit een
 *    dossier). Fallback: de omgekeerde link `dossiers.everts_calc_project_id =
 *    quote.project_id`, voor oudere offertes en de losse everts-calc-flow. De directe
 *    koppeling is robuuster: ze faalt niet als een dossier al aan een ánder project
 *    hing (koppelDossierAanProject overschrijft niet) of als de link enkel in
 *    localStorage leefde.
 *  - **Bedrijf/werkmaatschappij**: de werkmaatschappij hoort bij het dossier
 *    (`dossiers.bouw7_filiaal` == `bedrijfsgegevens.naam`); zonder match valt hij
 *    terug op de hoofdorganisatie, zodat `bedrijf.*` nooit leeg is.
 *
 * Alles is best-effort: een mislukte lookup levert de organisatie-fallback +
 * leeg dossier op, nooit een render-fout.
 */

import {
  BEDRIJF_FALLBACK,
  LEEG_DOSSIER,
  type BedrijfContext,
  type DossierContext,
} from './quote-renderer'
import { medewerkerNaam } from '@/lib/dossiers/medewerker-naam'
import { leidWerkmaatschappijAf } from '@/lib/dossiers/werkmaatschappij'

/**
 * Velden per projectrol. De offerte gebruikt alleen de naam, maar documenten
 * (bewonersbrief: "wie komt er langs") hebben de contactgegevens nodig. Eén
 * gedeelde embed houdt de zes rollen identiek.
 */
const ROL_VELDEN = 'voornaam, tussenvoegsel, achternaam, functie, email, o365_email, telefoon, mobiel, foto_url'

const DOSSIER_SELECT = `
  id, dossiernummer, titel, referentie, opdracht_referentie, bouw7_filiaal, werkmaatschappij_id, klant_id,
  vve_code, verwacht_startdatum, verwacht_einddatum, voorlopige_start, voorlopige_eind,
  werkadres_naam, werkadres_straat, werkadres_postcode, werkadres_stad,
  werkadres_telefoon, werkadres_email,
  calculator:medewerkers!calculator_id ( ${ROL_VELDEN} ),
  projectleider:medewerkers!project_manager_id ( ${ROL_VELDEN} ),
  teamleider:medewerkers!teamleider_id ( ${ROL_VELDEN} ),
  werkvoorbereider:medewerkers!werkvoorbereider_id ( ${ROL_VELDEN} ),
  uitvoerder:medewerkers!uitvoerder_id ( ${ROL_VELDEN} ),
  controller:medewerkers!controller_id ( ${ROL_VELDEN} ),
  contactpersoon:contactpersonen!contactpersoon_id (
    voornaam, tussenvoegsel, achternaam, email, telefoon,
    aanhef, voorletter, geslacht, mobiel, linkedin_url, opmerkingen
  )
`.trim()

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bouwBedrijf(row: any): BedrijfContext {
  if (!row) return { ...BEDRIJF_FALLBACK }
  const postcode_plaats = [row.adres_postcode, row.adres_plaats].filter(Boolean).join(' ')
  return {
    naam: row.naam ?? '',
    code: row.code ?? '',
    adres: row.adres_straat ?? '',
    postcode_plaats,
    land: row.adres_land ?? '',
    telefoon: row.telefoon ?? '',
    email: row.email ?? '',
    website: row.website ?? '',
    kvk: row.kvk_nummer ?? '',
    btw: row.btw_nummer ?? '',
    iban: row.iban ?? '',
    logo_url: row.logo_primair_url ?? '',
    logo_wit_url: row.logo_wit_url ?? '',
    is_werkmaatschappij: row.type === 'werkmaatschappij',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function bouwDossier(row: any): DossierContext {
  if (!row) return LEEG_DOSSIER
  const straat: string = row.werkadres_straat ?? ''
  const pcStad = [row.werkadres_postcode, row.werkadres_stad].filter(Boolean).join(' ')
  const werkadres = [straat, pcStad].filter(Boolean).join(', ')
  return {
    heeft: true,
    dossiernummer: row.dossiernummer ?? '',
    titel: row.titel ?? '',
    referentie: row.referentie ?? '',
    opdracht_referentie: row.opdracht_referentie ?? '',
    vve_code: row.vve_code ?? '',
    werkadres,
    werkadres_naam: row.werkadres_naam ?? '',
    werkadres_straat: straat,
    werkadres_postcode: row.werkadres_postcode ?? '',
    werkadres_plaats: row.werkadres_stad ?? '',
    werkadres_telefoon: row.werkadres_telefoon ?? '',
    werkadres_email: row.werkadres_email ?? '',
    calculator: medewerkerNaam(row.calculator) ?? '',
    projectleider: medewerkerNaam(row.projectleider) ?? '',
    teamleider: medewerkerNaam(row.teamleider) ?? '',
    werkvoorbereider: medewerkerNaam(row.werkvoorbereider) ?? '',
    uitvoerder: medewerkerNaam(row.uitvoerder) ?? '',
    controller: medewerkerNaam(row.controller) ?? '',
    contactpersoon: medewerkerNaam(row.contactpersoon) ?? '',
    contactpersoon_email: row.contactpersoon?.email ?? '',
    contactpersoon_telefoon: row.contactpersoon?.telefoon ?? '',
    contactpersoon_aanhef: row.contactpersoon?.aanhef ?? '',
    contactpersoon_voornaam: row.contactpersoon?.voornaam ?? '',
    contactpersoon_tussenvoegsel: row.contactpersoon?.tussenvoegsel ?? '',
    contactpersoon_achternaam: row.contactpersoon?.achternaam ?? '',
    contactpersoon_voorletter: row.contactpersoon?.voorletter ?? '',
    contactpersoon_geslacht: geslachtLabel(row.contactpersoon?.geslacht),
    contactpersoon_aanspreekvorm: aanspreekvorm(row.contactpersoon?.geslacht),
    contactpersoon_mobiel: row.contactpersoon?.mobiel ?? '',
    contactpersoon_linkedin: row.contactpersoon?.linkedin_url ?? '',
    contactpersoon_opmerkingen: row.contactpersoon?.opmerkingen ?? '',
    klant_naam: row.opdrachtgever?.naam ?? '',
    klant_adres: row.opdrachtgever?.adres_straat ?? '',
    klant_postcode: row.opdrachtgever?.adres_postcode ?? '',
    klant_plaats: row.opdrachtgever?.adres_plaats ?? '',
    klant_email: row.opdrachtgever?.email ?? '',
    klant_telefoon: row.opdrachtgever?.telefoon ?? '',
    klant_kvk: row.opdrachtgever?.kvk_nummer ?? '',
    klant_btw: row.opdrachtgever?.btw_nummer ?? '',
    klant_betalingstermijn_dagen:
      row.opdrachtgever?.betalingstermijn_dagen != null ? String(row.opdrachtgever.betalingstermijn_dagen) : '',
  }
}

/** Zet de geslacht-enum om naar een leesbaar label voor de offerte. */
function geslachtLabel(g: string | null | undefined): string {
  if (g === 'man') return 'Man'
  if (g === 'vrouw') return 'Vrouw'
  if (g === 'overig') return 'Overig'
  return ''
}

/**
 * Aanspreekvorm voor de aanhef: 'heer' / 'mevrouw' afgeleid uit het geslacht.
 * Bij onbekend/overig geslacht → 'heer/mevrouw', zodat "Geachte {aanspreekvorm}"
 * altijd een nette regel oplevert.
 */
function aanspreekvorm(g: string | null | undefined): string {
  if (g === 'man') return 'heer'
  if (g === 'vrouw') return 'mevrouw'
  if (g === 'overig') return 'heer/mevrouw'
  return ''
}

/**
 * Haalt bedrijf (werkmaatschappij of organisatie) + dossier-context op voor een offerte.
 *
 * Ook gebruikt door de documenten-module (`lib/documenten/document-context.ts`), die
 * geen offerte heeft: die roept aan met `{ dossier_id }`. Dat werkt omdat er van
 * `quote` alleen `dossier_id`/`project_id` wordt gelezen — bewust zo gelaten i.p.v.
 * een tweede, bijna identieke loader.
 *
 * @param supabase  een (server) Supabase-client
 * @param quote     de offerte-rij (gebruikt `dossier_id`, anders `project_id`)
 * @returns bedrijf + dossier-context, plus `dossierRow` = de ruwe rij (incl. de
 *          volledige rol-embeds) voor consumenten die meer nodig hebben dan de
 *          platte namen in DossierContext.
 */
export async function laadBedrijfEnDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ bedrijf: BedrijfContext; dossier: DossierContext; dossierRow: any; bedrijfRow: any }> {
  try {
    // 1. Dossier ophalen. Voorkeur: de directe koppeling `quotes.dossier_id`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dossierRow: any = null
    if (quote?.dossier_id) {
      const { data } = await supabase
        .from('dossiers')
        .select(DOSSIER_SELECT)
        .eq('id', quote.dossier_id)
        .maybeSingle()
      dossierRow = data ?? null
    }
    // Fallback: de omgekeerde link via het everts-calc project (project_id is text,
    // kolom is uuid → PostgREST cast). Voor oudere offertes zonder directe dossier_id.
    if (!dossierRow && quote?.project_id) {
      const { data } = await supabase
        .from('dossiers')
        .select(DOSSIER_SELECT)
        .eq('everts_calc_project_id', quote.project_id)
        .limit(1)
        .maybeSingle()
      dossierRow = data ?? null
    }

    // Opdrachtgever (relaties) apart en best-effort ophalen: een aparte query zodat
    // een RLS-blokkade op `relaties` niet de hele dossier-embed laat falen (en het
    // werkadres meesleurt). Levert het klant-adres voor het offerte-klantblok.
    if (dossierRow?.klant_id) {
      try {
        const { data: rel } = await supabase
          .from('relaties')
          .select('naam, adres_straat, adres_postcode, adres_plaats, email, telefoon, kvk_nummer, btw_nummer, betalingstermijn_dagen')
          .eq('id', dossierRow.klant_id)
          .maybeSingle()
        if (rel) dossierRow.opdrachtgever = rel
      } catch {
        /* relaties niet leesbaar — klant-adres blijft leeg */
      }
    }

    // 2. Bedrijfsgegevens: alle werkmaatschappijen + organisatie in één query.
    const { data: bedrijven } = await supabase
      .from('bedrijfsgegevens')
      .select('*')
      .in('type', ['werkmaatschappij', 'organisatie'])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lijst: any[] = bedrijven ?? []
    const werkmaatschappijen = lijst.filter(b => b.type === 'werkmaatschappij')
    const organisatie = lijst.find(b => b.type === 'organisatie' && b.parent_id == null) ?? null

    // Handmatig gekozen werkmaatschappij wint; anders afgeleid uit dossiernummer/bouw7_filiaal.
    const wmId =
      dossierRow?.werkmaatschappij_id ||
      leidWerkmaatschappijAf(dossierRow?.dossiernummer, dossierRow?.bouw7_filiaal, werkmaatschappijen)
    const bedrijfRow = (wmId && werkmaatschappijen.find(w => w.id === wmId)) || organisatie

    // Bewust GÉÉN betalingsconditie-fallback: de betalingsconditie (en dus het
    // termijnschema) komt uitsluitend uit de keuze op de calculatie, doorgezet naar
    // quotes.betalingsconditie_id. Zonder keuze blijft het betalingsblok leeg i.p.v.
    // een willekeurige standaard-staffel te tonen.

    return { bedrijf: bouwBedrijf(bedrijfRow), dossier: bouwDossier(dossierRow), dossierRow, bedrijfRow }
  } catch {
    return { bedrijf: { ...BEDRIJF_FALLBACK }, dossier: LEEG_DOSSIER, dossierRow: null, bedrijfRow: null }
  }
}
