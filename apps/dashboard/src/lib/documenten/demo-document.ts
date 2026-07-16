/**
 * demo-document.ts
 *
 * Testgegevens voor de sjabloon-preview: elke variabele uit `DOCUMENT_VARIABELEN`
 * krijgt een plausibele waarde, zodat een beheerder een sjabloon kan ontwerpen en
 * controleren zónder een echt dossier te kiezen (preview met `dossier_id=demo`).
 *
 * Spiegelt `lib/everts-calc/demo-quote.ts` voor offertes.
 */

// Alleen pure helpers + types: deze module blijft bewust vrij van server-only
// imports, zodat de demo-context ook los (bijv. in een test) te draaien is.
import { normaliseerInvoer, datumNL, datumISO, nJaarLater } from './format'
import { ROLLEN, rolLabels } from './rollen'
import type { DocumentSjabloon } from './types'

/** Zelfde vorm als de echte render-context; los gehouden i.v.m. de server-only chain. */
export type DemoRenderContext = Record<string, unknown>

/** Vaste datums: geen Math.random/now-afhankelijkheid, zodat previews reproduceerbaar zijn. */
const DEMO_START = '2026-09-07'
const DEMO_EIND = '2026-10-02'
const DEMO_OPLEVER = '2026-10-02'

function demoRol(rol: string, index: number) {
  const namen = [
    { voornaam: 'Jeroen', naam: 'Jeroen de Wit',     functie: 'Projectleider' },
    { voornaam: 'Ahmed',  naam: 'Ahmed el Amrani',   functie: 'Uitvoerder' },
    { voornaam: 'Sanne',  naam: 'Sanne Bakker',      functie: 'Calculator' },
    { voornaam: 'Sanne',  naam: 'Sanne Bakker',      functie: 'Werkvoorbereider' },
    { voornaam: 'Rob',    naam: 'Rob van Dijk',      functie: 'Teamleider' },
    { voornaam: 'Miriam', naam: 'Miriam Jansen',     functie: 'Controller' },
  ]
  const p = namen[index % namen.length]
  return {
    heeft: true,
    naam: p.naam,
    voornaam: p.voornaam,
    functie: rolLabels[rol as keyof typeof rolLabels] ?? p.functie,
    telefoon: '088 - 1234 500',
    mobiel: '06 - 12 34 56 78',
    email: `${p.voornaam.toLowerCase()}@everts.chat`,
    // Geen demo-foto: de image-module valt terug op een lege pixel.
    foto: '' as const,
  }
}

/**
 * Bouwt een volledige demo-context. `sjabloon` bepaalt welke invoervelden er zijn;
 * die krijgen hun standaardwaarde, of een sprekende placeholder als er geen is.
 */
export function buildDemoDocumentContext(sjabloon: DocumentSjabloon): DemoRenderContext {
  // Invoervelden: standaardwaarde, anders "«Label»" zodat het in de preview opvalt.
  const demoInvoerRuw: Record<string, string> = {}
  for (const veld of sjabloon.velden ?? []) {
    demoInvoerRuw[veld.sleutel] = veld.standaard || VOORBEELD_INVOER[veld.sleutel] || `«${veld.label}»`
  }
  const invoer = normaliseerInvoer(sjabloon.velden ?? [], demoInvoerRuw)

  const rollen = Object.fromEntries(ROLLEN.map((rol, i) => [rol, demoRol(rol, i)]))

  const garantieJaren = Number(String(invoer.garantie_jaren ?? '6').replace(',', '.'))
  const garantieTot = Number.isFinite(garantieJaren) && garantieJaren > 0
    ? nJaarLater(DEMO_OPLEVER, garantieJaren)
    : null

  const ctx: DemoRenderContext = {
    bedrijf: {
      naam: 'Everts Onderhoudsschilders B.V.',
      code: '001',
      adres: 'Nijverheidsweg 12',
      postcode_plaats: '3771 ME Barneveld',
      land: 'Nederland',
      telefoon: '088 - 1234 500',
      email: 'info@everts.chat',
      website: 'www.everts.chat',
      kvk: '09123456',
      btw: 'NL812345678B01',
      iban: 'NL91 ABNA 0417 1643 00',
      logo_url: '',
      logo_wit_url: '',
      is_werkmaatschappij: true,
    },
    dossier: {
      heeft: true,
      dossiernummer: '20261.00598',
      titel: 'Groot onderhoud Galileïstraat 1-48',
      referentie: 'ION-2026-0451',
      opdracht_referentie: 'PO-88213',
      vve_code: 'VVE-0451',
      werkadres: 'Galileïstraat 1-48, 3902 HR Veenendaal',
      werkadres_naam: 'VvE Galileïstraat',
      werkadres_straat: 'Galileïstraat 1-48',
      werkadres_postcode: '3902 HR',
      werkadres_plaats: 'Veenendaal',
      werkadres_telefoon: '0318 - 55 44 33',
      werkadres_email: 'beheer@vve-galileistraat.nl',
    },
    klant: {
      naam: 'VvE Beheer Midden-Nederland',
      adres: 'Stationsplein 4',
      postcode: '3901 AA',
      plaats: 'Veenendaal',
      email: 'info@vvebeheer-mn.nl',
      telefoon: '0318 - 50 60 70',
      kvk: '30123456',
      btw: 'NL801234567B01',
    },
    contactpersoon: {
      naam: 'Petra Vos',
      voornaam: 'Petra',
      achternaam: 'Vos',
      aanhef: 'Geachte mevrouw Vos',
      aanspreekvorm: 'mevrouw',
      email: 'p.vos@vvebeheer-mn.nl',
      telefoon: '0318 - 50 60 71',
      mobiel: '06 - 24 68 13 57',
    },
    geadresseerde: {
      naam: 'Bewoners Galileïstraat',
      aanhef: invoer.aanhef || 'Geachte bewoner',
      adres: 'Galileïstraat 1-48',
      postcode: '3902 HR',
      plaats: 'Veenendaal',
      volledig_adres: 'Galileïstraat 1-48, 3902 HR Veenendaal',
      email: 'beheer@vve-galileistraat.nl',
      telefoon: '0318 - 55 44 33',
    },
    ...rollen,
    ondertekenaar: { ...demoRol('projectleider', 0), handtekening: '' },
    planning: {
      heeft: true,
      startdatum: datumNL(DEMO_START),
      startdatum_iso: datumISO(DEMO_START),
      einddatum: datumNL(DEMO_EIND),
      einddatum_iso: datumISO(DEMO_EIND),
      werkzaamheden: invoer.werkzaamheden || 'Schilderwerk buitenzijde, houtrotherstel en vervangen van kitvoegen.',
    },
    oplevering: {
      heeft: true,
      datum: datumNL(DEMO_OPLEVER),
      datum_iso: datumISO(DEMO_OPLEVER),
    },
    garantie: {
      heeft: !!garantieTot,
      termijn_jaren: invoer.garantie_jaren || '6',
      tot_datum: datumNL(garantieTot),
      tot_datum_iso: datumISO(garantieTot),
      behandelingen: invoer.behandelingen || 'Houtwerk: 1× grondlaag, 2× aflak (Sigma S2U Nova).',
    },
    document: {
      datum: datumNL('2026-08-14'),
      datum_iso: '2026-08-14',
      plaats: 'Barneveld',
      soort: sjabloon.documentsoort ?? '',
      naam: sjabloon.naam ?? '',
      dossiernummer: '20261.00598',
      opdrachtnummer: 'PO-88213',
    },
    invoer,
    logo: '',
    logo_wit: '',
    handtekening: '',
  }

  for (const rol of ROLLEN) ctx[`foto_${rol}`] = ''
  return ctx
}

/** Sprekende demo-waarden voor de conventionele invoersleutels. */
const VOORBEELD_INVOER: Record<string, string> = {
  werkzaamheden: 'Schilderwerk buitenzijde, houtrotherstel en vervangen van kitvoegen.',
  garantie_jaren: '6',
  behandelingen: 'Houtwerk: 1× grondlaag, 2× aflak (Sigma S2U Nova).',
  aanhef: 'Geachte bewoner',
}
