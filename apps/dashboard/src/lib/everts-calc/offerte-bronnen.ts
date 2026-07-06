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

const DOSSIER_SELECT = `
  dossiernummer, titel, referentie, opdracht_referentie, bouw7_filiaal,
  werkadres_naam, werkadres_straat, werkadres_postcode, werkadres_stad,
  werkadres_telefoon, werkadres_email,
  calculator:medewerkers!calculator_id ( voornaam, tussenvoegsel, achternaam ),
  projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam ),
  teamleider:medewerkers!teamleider_id ( voornaam, tussenvoegsel, achternaam ),
  werkvoorbereider:medewerkers!werkvoorbereider_id ( voornaam, tussenvoegsel, achternaam ),
  uitvoerder:medewerkers!uitvoerder_id ( voornaam, tussenvoegsel, achternaam ),
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
    contactpersoon: medewerkerNaam(row.contactpersoon) ?? '',
    contactpersoon_email: row.contactpersoon?.email ?? '',
    contactpersoon_telefoon: row.contactpersoon?.telefoon ?? '',
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

    // 2. Werkmaatschappij bij het dossier (naam == bouw7_filiaal), anders de organisatie.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let bedrijfRow: any = null
    if (dossierRow?.bouw7_filiaal) {
      const { data } = await supabase
        .from('bedrijfsgegevens')
        .select('*')
        .eq('naam', dossierRow.bouw7_filiaal)
        .eq('type', 'werkmaatschappij')
        .limit(1)
        .maybeSingle()
      bedrijfRow = data ?? null
    }
    if (!bedrijfRow) {
      const { data } = await supabase
        .from('bedrijfsgegevens')
        .select('*')
        .eq('type', 'organisatie')
        .is('parent_id', null)
        .limit(1)
        .maybeSingle()
      bedrijfRow = data ?? null
    }

    return { bedrijf: bouwBedrijf(bedrijfRow), dossier: bouwDossier(dossierRow) }
  } catch {
    return { bedrijf: { ...BEDRIJF_FALLBACK }, dossier: LEEG_DOSSIER }
  }
}
