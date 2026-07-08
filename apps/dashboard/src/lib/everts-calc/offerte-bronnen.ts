/**
 * offerte-bronnen.ts
 *
 * Resolvet de bedrijfs- en dossiergegevens voor een offerte-render:
 *  - **Dossier** (informatie-tab: werkadres, calculator/rollen, referenties) via
 *    `dossiers.everts_calc_project_id = quote.project_id`. Offertes koppelen NIET
 *    via `quotes.dossier_id` (ongebruikt), maar via het everts-calc project.
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

const DOSSIER_SELECT = `
  dossiernummer, titel, referentie, opdracht_referentie, bouw7_filiaal, werkmaatschappij_id, klant_id,
  werkadres_naam, werkadres_straat, werkadres_postcode, werkadres_stad,
  werkadres_telefoon, werkadres_email,
  calculator:medewerkers!calculator_id ( voornaam, tussenvoegsel, achternaam ),
  projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam ),
  teamleider:medewerkers!teamleider_id ( voornaam, tussenvoegsel, achternaam ),
  werkvoorbereider:medewerkers!werkvoorbereider_id ( voornaam, tussenvoegsel, achternaam ),
  uitvoerder:medewerkers!uitvoerder_id ( voornaam, tussenvoegsel, achternaam ),
  controller:medewerkers!controller_id ( voornaam, tussenvoegsel, achternaam ),
  contactpersoon:contactpersonen!contactpersoon_id ( voornaam, tussenvoegsel, achternaam, email, telefoon )
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
    klant_naam: row.opdrachtgever?.naam ?? '',
    klant_adres: row.opdrachtgever?.adres_straat ?? '',
    klant_postcode: row.opdrachtgever?.adres_postcode ?? '',
    klant_plaats: row.opdrachtgever?.adres_plaats ?? '',
    klant_email: row.opdrachtgever?.email ?? '',
    klant_telefoon: row.opdrachtgever?.telefoon ?? '',
    klant_kvk: row.opdrachtgever?.kvk_nummer ?? '',
    klant_btw: row.opdrachtgever?.btw_nummer ?? '',
  }
}

/**
 * Haalt bedrijf (werkmaatschappij of organisatie) + dossier-context op voor een offerte.
 * @param supabase  een (server) Supabase-client
 * @param quote     de offerte-rij (gebruikt `project_id` voor de dossier-koppeling)
 */
export async function laadBedrijfEnDossier(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any,
): Promise<{ bedrijf: BedrijfContext; dossier: DossierContext }> {
  try {
    // 1. Dossier via het everts-calc project (project_id is text, kolom is uuid → PostgREST cast).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dossierRow: any = null
    if (quote?.project_id) {
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
          .select('naam, adres_straat, adres_postcode, adres_plaats, email, telefoon, kvk_nummer, btw_nummer')
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

    // Betalingsconditie-fallback: offertes uit de inline-flow krijgen geen expliciete
    // keuze mee. Zonder gekozen conditie tonen we de standaard (of de eerste), zodat
    // het betalingsblok niet leeg blijft. `quote` wordt in-place aangevuld zodat elke
    // aanroeper (alle render-routes) het meekrijgt zonder signatuurwijziging.
    if (quote && !quote.betalingsconditie) {
      try {
        const { data: bcs } = await supabase
          .from('betalingscondities')
          .select('*')
          .order('is_standaard', { ascending: false })
          .order('volgorde', { ascending: true })
          .limit(1)
        if (bcs && bcs[0]) quote.betalingsconditie = bcs[0]
      } catch {
        /* geen betalingsconditie beschikbaar */
      }
    }

    return { bedrijf: bouwBedrijf(bedrijfRow), dossier: bouwDossier(dossierRow) }
  } catch {
    return { bedrijf: { ...BEDRIJF_FALLBACK }, dossier: LEEG_DOSSIER }
  }
}
