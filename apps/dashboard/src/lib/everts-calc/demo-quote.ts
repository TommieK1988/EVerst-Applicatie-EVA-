/**
 * demo-quote.ts
 *
 * Bouwt een volledig gevulde synthetische offerte ("testgegevens") zodat de
 * offerte-layout / Word-template voorbekeken kan worden zónder dat er een echte
 * calculatie hoeft te bestaan. Elke variabele, loop en conditioneel blok uit
 * `quote-renderer.ts` wordt hier van representatieve waarden voorzien:
 *
 *  - meerdere secties op niveau 1/2/3
 *  - een optionele sectie (heeft_opties / optie_secties)
 *  - stelpost-regels (heeft_stelposten / stelpost_regels)
 *  - regels met opmerking, werkomschrijving en schilderbehandeling
 *  - voorwaarden / uitsluitingen / opmerkingen (terms)
 *  - betalingscondities
 *
 * Wordt gebruikt door de preview-routes wanneer `id === 'demo'`.
 */

import type { Quote, QuoteLine, QuoteSection } from './types-quotes'
import type { BedrijfContext, DossierContext } from './quote-renderer'

const NU = new Date()
const OVER_30_DAGEN = new Date(NU.getTime() + 30 * 24 * 60 * 60 * 1000)

function regel(
  section_id: string,
  volgorde: number,
  data: Partial<QuoteLine> & {
    omschrijving: string
    hoeveelheid: number
    eenheid: string
    eenheidsprijs: number
  },
): QuoteLine {
  const line_total = Math.round(data.hoeveelheid * data.eenheidsprijs * 100) / 100
  return {
    id: `demo-line-${section_id}-${volgorde}`,
    quote_id: 'demo',
    section_id,
    calculatieregel_id: null,
    groep_id: null,
    btw_pct: 21,
    volgorde,
    kostprijs_pe: null,
    uren_pe: null,
    opmerking: null,
    schilderbehandeling: null,
    is_stelpost: false,
    line_total,
    created_at: NU.toISOString(),
    updated_at: NU.toISOString(),
    ...data,
  }
}

function sectie(
  id: string,
  volgorde: number,
  data: Partial<QuoteSection> & { naam: string; niveau: number; nummer: string },
  lines: QuoteLine[],
): QuoteSection {
  const subtotaal = Math.round(lines.reduce((s, l) => s + l.line_total, 0) * 100) / 100
  return {
    id,
    quote_id: 'demo',
    discipline: null,
    volgorde,
    subtotaal,
    toon_detail: true,
    is_optioneel: false,
    created_at: NU.toISOString(),
    lines,
    ...data,
  }
}

/** Representatieve werkmaatschappij voor de preview (kan worden overschreven met echte gegevens). */
export const DEMO_BEDRIJF: BedrijfContext = {
  naam: 'Everts Onderhoudsschilders B.V.',
  code: '001',
  adres: 'Voorbeeldstraat 1',
  postcode_plaats: '1234 AB Amstelveen',
  land: 'Nederland',
  telefoon: '020 - 123 45 67',
  email: 'offerte@evertsgroep.nl',
  website: 'www.evertsgroep.nl',
  kvk: '12345678',
  btw: 'NL123456789B01',
  iban: 'NL00 BANK 0000 0000 00',
  logo_url: '',
  logo_wit_url: '',
  is_werkmaatschappij: true,
}

/** Demo dossier-context (informatie-tab) voor de preview. */
export function buildDemoDossierContext(): DossierContext {
  return {
    heeft: true,
    dossiernummer: 'D-2026-0042',
    titel: 'Onderhoud- en schilderwerk Voorbeeldpand',
    referentie: 'Inkoopnr. 2026-0042',
    opdracht_referentie: 'OPO-2026-0042',
    werkadres: 'Projectstraat 12, 3511 AB Utrecht',
    werkadres_naam: 'Voorbeeldpand VvE',
    werkadres_straat: 'Projectstraat 12',
    werkadres_postcode: '3511 AB',
    werkadres_plaats: 'Utrecht',
    werkadres_telefoon: '030 - 111 22 33',
    werkadres_email: 'beheer@voorbeeldpand.nl',
    calculator: 'A. Calculator',
    projectleider: 'P. Projectleider',
    teamleider: 'T. Teamleider',
    werkvoorbereider: 'W. Werkvoorbereider',
    uitvoerder: 'U. Uitvoerder',
    controller: 'C. Controller',
    contactpersoon: 'J. de Vries',
    contactpersoon_email: 'j.devries@corporatie-voorbeeld.nl',
    contactpersoon_telefoon: '030 - 765 43 21',
    klant_naam: 'Woningcorporatie Voorbeeld',
    klant_adres: 'Klantlaan 25',
    klant_postcode: '5678 CD',
    klant_plaats: 'Utrecht',
    klant_email: 'info@corporatie-voorbeeld.nl',
    klant_telefoon: '030 - 765 43 21',
    klant_kvk: '87654321',
    klant_btw: 'NL876543210B01',
  }
}

/** Bouwt de volledige synthetische demo-offerte. */
export function buildDemoQuote(): Quote {
  // ── Sectie 1: buitenschilderwerk (niveau 1) ────────────────────────────────
  const s1 = sectie(
    'demo-sec-1', 0,
    { naam: 'Buitenschilderwerk', niveau: 1, nummer: '1', discipline: 'schilderwerk' },
    [
      regel('demo-sec-1', 0, {
        omschrijving: 'Schilderwerk kozijnen voorgevel',
        hoeveelheid: 48.5, eenheid: 'm²', eenheidsprijs: 27.5, btw_pct: 9,
        opmerking: 'Twee lagen dekkend op basis van hoogglans lakverf.',
        schilderbehandeling: 'Schuren, plamuren, gronden en 2× aflakken',
        kostprijs_pe: 18.2, uren_pe: 0.35,
      }),
      regel('demo-sec-1', 1, {
        omschrijving: 'Houtrotherstel dorpels',
        hoeveelheid: 6, eenheid: 'st', eenheidsprijs: 85, btw_pct: 9,
        opmerking: 'Aanhelen met 2-componenten reparatiemortel.',
        schilderbehandeling: 'Uitfrezen, epoxy-injectie en afwerken',
      }),
    ],
  )

  // ── Sectie 2: binnenschilderwerk (niveau 2) ────────────────────────────────
  const s2 = sectie(
    'demo-sec-2', 1,
    { naam: 'Binnenschilderwerk trappenhuis', niveau: 2, nummer: '1.1', discipline: 'schilderwerk' },
    [
      regel('demo-sec-2', 0, {
        omschrijving: 'Sauswerk wanden en plafonds',
        hoeveelheid: 120, eenheid: 'm²', eenheidsprijs: 9.75,
        schilderbehandeling: 'Voorstrijken en 2× latex sausen',
      }),
      regel('demo-sec-2', 1, {
        omschrijving: 'Stelpost meerwerk elektra',
        hoeveelheid: 1, eenheid: 'post', eenheidsprijs: 750,
        is_stelpost: true,
        opmerking: 'Nader te bepalen in overleg met de installateur.',
      }),
    ],
  )

  // ── Sectie 3: steiger/bereikbaarheid (niveau 3) ────────────────────────────
  const s3 = sectie(
    'demo-sec-3', 2,
    { naam: 'Steiger en bereikbaarheid', niveau: 3, nummer: '1.1.1', discipline: 'bouwkundig' },
    [
      regel('demo-sec-3', 0, {
        omschrijving: 'Rolsteiger huur incl. op- en afbouw',
        hoeveelheid: 2, eenheid: 'week', eenheidsprijs: 175,
      }),
    ],
  )

  // ── Sectie 4: optioneel dakwerk (is_optioneel) ─────────────────────────────
  const s4 = sectie(
    'demo-sec-4', 3,
    { naam: 'Optie: dakgoot vervangen', niveau: 1, nummer: '2', discipline: 'dakwerk', is_optioneel: true },
    [
      regel('demo-sec-4', 0, {
        omschrijving: 'Zinken mastgoot vervangen',
        hoeveelheid: 14, eenheid: 'm', eenheidsprijs: 62.5,
        opmerking: 'Inclusief afvoer oude goot.',
      }),
    ],
  )

  const secties = [s1, s2, s3]           // normale secties (excl. optie)
  const alleSecties = [s1, s2, s3, s4]

  const subtotaal_ex_btw = Math.round(secties.reduce((s, sec) => s + sec.subtotaal, 0) * 100) / 100
  const btw_pct = 21
  const btw_bedrag = Math.round(subtotaal_ex_btw * (btw_pct / 100) * 100) / 100
  const totaal_inc_btw = Math.round((subtotaal_ex_btw + btw_bedrag) * 100) / 100
  const stelposten_subtotaal = 750
  const opties_subtotaal = s4.subtotaal

  const quote = {
    id: 'demo',
    quote_nummer: 'OFF-2026-0001',
    project_id: null,
    scenario_id: null,
    client_id: 'demo-client',
    layout_id: null,
    template_id: null,
    type: 'verkoopofferte',
    status: 'concept',
    titel: 'Onderhoud- en schilderwerk Voorbeeldpand',
    referentie: 'Inkoopnr. 2026-0042 / object Voorbeeldpand',
    datum: NU.toISOString(),
    geldig_tot: OVER_30_DAGEN.toISOString(),
    contactpersoon: 'Mevrouw J. de Vries',
    aanhef: 'Geachte mevrouw De Vries,',
    inleiding:
      'Hartelijk dank voor uw aanvraag. Naar aanleiding van onze opname doen wij u ' +
      'hierbij graag een vrijblijvende offerte toekomen voor het onderhoud- en ' +
      'schilderwerk aan uw pand.',
    slottekst:
      'Wij vertrouwen erop u hiermee een passende aanbieding te hebben gedaan en ' +
      'zien uw reactie met belangstelling tegemoet.',
    subtotaal_ex_btw,
    btw_bedrag,
    totaal_inc_btw,
    detailregels_tonen: true,
    btw_pct,
    stelposten_in_totaal: true,
    stelposten_subtotaal,
    opties_subtotaal,
    betalingsconditie_id: null,
    voorwaarden_id: null,
    dossier_id: null,
    meerwerk_regel_id: null,
    created_at: NU.toISOString(),
    updated_at: NU.toISOString(),
    client: {
      id: 'demo-client',
      naam: 'J. de Vries',
      bedrijfsnaam: 'Woningcorporatie Voorbeeld',
      adres: 'Klantlaan 25',
      postcode: '5678 CD',
      plaats: 'Utrecht',
      email: 'j.devries@corporatie-voorbeeld.nl',
      telefoon: '030 - 765 43 21',
      kvk: '87654321',
      btw_nummer: 'NL876543210B01',
      notities: null,
      actief: true,
      created_at: NU.toISOString(),
      updated_at: NU.toISOString(),
    },
    sections: alleSecties,
    terms: [
      {
        id: 'demo-term-1', quote_id: 'demo', type: 'voorwaarden', volgorde: 0,
        created_at: NU.toISOString(),
        inhoud:
          'Op deze offerte zijn onze algemene voorwaarden van toepassing. Genoemde ' +
          'prijzen zijn exclusief BTW en geldig gedurende 30 dagen.',
      },
      {
        id: 'demo-term-2', quote_id: 'demo', type: 'uitsluitingen', volgorde: 1,
        created_at: NU.toISOString(),
        inhoud:
          'Niet inbegrepen: asbestinventarisatie en -sanering, constructieve ' +
          'aanpassingen en werkzaamheden buiten de omschreven scope.',
      },
      {
        id: 'demo-term-3', quote_id: 'demo', type: 'opmerkingen', volgorde: 2,
        created_at: NU.toISOString(),
        inhoud:
          'Werkzaamheden worden in overleg ingepland en uitgevoerd in aaneengesloten ' +
          'werkdagen, weersomstandigheden voorbehouden.',
      },
    ],
    // Extra velden die de render-context defensief uitleest:
    betalingsconditie: {
      id: 'demo-bc',
      naam: '30 dagen netto',
      tekst: 'Betaling in twee termijnen: 50% bij aanvang, 50% bij oplevering, telkens binnen 30 dagen na factuurdatum.',
    },
  }

  // Cast: de demo bevat extra (defensief uitgelezen) velden buiten het strikte Quote-type.
  return quote as unknown as Quote
}
