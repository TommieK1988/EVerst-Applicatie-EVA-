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

/** Voorbeeld-feedbacklink voor de preview. */
const DEMO_FEEDBACK_URL = 'https://eva.everts.nl/p/feedback/VOORBEELD'
/**
 * Voorgebakken QR-PNG (base64) voor de preview. Bewust statisch: deze module blijft sync
 * en server-only-vrij, dus we roepen hier geen `qrcode` aan. De image-module accepteert base64.
 */
const DEMO_FEEDBACK_QR =
  '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'

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
    // Feedback-ronde: voorbeeld-link + voorgebakken QR, zodat de preview de QR én knop toont.
    feedback: { heeft: true, url: DEMO_FEEDBACK_URL, qr: DEMO_FEEDBACK_QR },
    logo: '',
    logo_wit: '',
    handtekening: '',
    feedback_qr: DEMO_FEEDBACK_QR,
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
