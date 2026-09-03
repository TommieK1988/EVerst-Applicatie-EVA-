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
import { normaliseerInvoer, datumNL, datumISO, nJaarLater, euroNL, getalNL, afkappen } from './format'
import { ROLLEN, rolLabels } from './rollen'
import { parseRapportOpties, HOUTROT_OPTIES_SLEUTEL, PAGINABREUK_XML } from './houtrot-opties'
import { isInkoopSoort } from './types'
import type { DocumentSjabloon } from './types'

/** Zelfde vorm als de echte render-context; los gehouden i.v.m. de server-only chain. */
export type DemoRenderContext = Record<string, unknown>

/** Vaste datums: geen Math.random/now-afhankelijkheid, zodat previews reproduceerbaar zijn. */
const DEMO_START = '2026-09-07'
const DEMO_EIND = '2026-10-02'
const DEMO_OPLEVER = '2026-10-02'
const DEMO_AANVRAAG = '2026-04-02'
const DEMO_DEADLINE = '2026-04-20'
const DEMO_OFFERTE = '2026-04-18'
const DEMO_OPDRACHT = '2026-05-11'
const DEMO_VOORLOPIG_START = '2026-08-24'
const DEMO_VOORLOPIG_EIND = '2026-09-18'

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
      heeft_voorlopig: true,
      voorlopige_startdatum: datumNL(DEMO_VOORLOPIG_START),
      voorlopige_startdatum_iso: datumISO(DEMO_VOORLOPIG_START),
      voorlopige_einddatum: datumNL(DEMO_VOORLOPIG_EIND),
      voorlopige_einddatum_iso: datumISO(DEMO_VOORLOPIG_EIND),
      voorlopige_periode: `${datumNL(DEMO_VOORLOPIG_START)} t/m ${datumNL(DEMO_VOORLOPIG_EIND)}`,
      werkzaamheden: invoer.werkzaamheden || 'Schilderwerk buitenzijde, houtrotherstel en vervangen van kitvoegen.',
    },
    // De acht procesdatums. Vaste waarden, net als hierboven: een preview moet
    // reproduceerbaar zijn. `financieel_gereed` blijft bewust leeg, zodat de
    // beheerder in de preview ziet wat {#datums.heeft_financieel_gereed} doet.
    datums: {
      heeft: true,
      aanvraagdatum: datumNL(DEMO_AANVRAAG),      aanvraagdatum_iso: datumISO(DEMO_AANVRAAG),      heeft_aanvraagdatum: true,
      deadline: datumNL(DEMO_DEADLINE),           deadline_iso: datumISO(DEMO_DEADLINE),           heeft_deadline: true,
      offertedatum: datumNL(DEMO_OFFERTE),        offertedatum_iso: datumISO(DEMO_OFFERTE),        heeft_offertedatum: true,
      opdrachtdatum: datumNL(DEMO_OPDRACHT),      opdrachtdatum_iso: datumISO(DEMO_OPDRACHT),      heeft_opdrachtdatum: true,
      startdatum: datumNL(DEMO_START),            startdatum_iso: datumISO(DEMO_START),            heeft_startdatum: true,
      einddatum: datumNL(DEMO_EIND),              einddatum_iso: datumISO(DEMO_EIND),              heeft_einddatum: true,
      opleverdatum: datumNL(DEMO_OPLEVER),        opleverdatum_iso: datumISO(DEMO_OPLEVER),        heeft_opleverdatum: true,
      financieel_gereed: '',                      financieel_gereed_iso: '',                       heeft_financieel_gereed: false,
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
    ...demoInkoop(sjabloon.documentsoort),
    document: {
      datum: datumNL('2026-08-14'),
      datum_iso: '2026-08-14',
      plaats: 'Barneveld',
      soort: sjabloon.documentsoort ?? '',
      naam: sjabloon.naam ?? '',
      dossiernummer: '20261.00598',
      opdrachtnummer: 'PO-88213',
      nummer: DEMO_ORDERNUMMER[sjabloon.documentsoort ?? ''] ?? '',
    },
    invoer,
    // Feedback-ronde: voorbeeld-link + voorgebakken QR, zodat de preview de QR én knop toont.
    feedback: { heeft: true, url: DEMO_FEEDBACK_URL, qr: DEMO_FEEDBACK_QR },
    logo: '',
    logo_wit: '',
    handtekening: '',
    feedback_qr: DEMO_FEEDBACK_QR,
  }

  // Houtrot-rapportage: zonder demo-blok kan een beheerder het sjabloon niet
  // ontwerpen — de editor-preview draait immers op dossier_id=demo.
  if (sjabloon.documentsoort === 'houtrot_rapportage') {
    const keuze = parseRapportOpties(invoer[HOUTROT_OPTIES_SLEUTEL])
    ctx.houtrot = demoHoutrotBlok(keuze.per_pagina, keuze.toon_prijzen)
    ctx.toon_prijzen = keuze.toon_prijzen
  } else {
    ctx.houtrot = { heeft: false, aantal: 0, aantal_paginas: 0, paginas: [], groepen: [], alle_registraties: [] }
    ctx.toon_prijzen = false
  }

  for (const rol of ROLLEN) ctx[`foto_${rol}`] = ''
  return ctx
}

// ── Demo-houtrotrapportage ────────────────────────────────────────────────

/** Zes voorbeeldregistraties over twee gevels, zodat groepering én pagina's zichtbaar zijn. */
const DEMO_REGISTRATIES = [
  { loc: ['Voorgevel', '1e etage', 'nr. 12'], werk: [{ aantal: 2, code: 'EP-K-001', naam: 'Epoxyherstel kozijnhoek', eenheid: 'st', uren: 0.75, prijs: 87.5 }], schade: 'Houtrot in de onderhoek van het kozijn, tot circa 4 cm diep.', ernst: 'Matig' },
  { loc: ['Voorgevel', '1e etage', 'nr. 14'], werk: [{ aantal: 1, code: 'DV-DOR-001', naam: 'Deelvervanging onderdorpel', eenheid: 'm¹', uren: 2.5, prijs: 245 }], schade: 'Onderdorpel over de volle breedte aangetast.', ernst: 'Ernstig' },
  { loc: ['Voorgevel', '2e etage', 'nr. 21'], werk: [{ aantal: 3, code: 'KIT-001', naam: 'Kit- en aansluitwerk', eenheid: 'm¹', uren: 0.2, prijs: 18.75 }], schade: 'Kitvoeg los, vochtdoorslag richting het houtwerk.', ernst: 'Licht' },
  { loc: ['Achtergevel', 'Begane grond', 'nr. 3'], werk: [{ aantal: 1, code: 'VRV-GLA-001', naam: 'Vervangen glaslat', eenheid: 'st', uren: 0.5, prijs: 42 }, { aantal: 2, code: 'EP-K-001', naam: 'Epoxyherstel kozijnhoek', eenheid: 'st', uren: 0.75, prijs: 87.5 }], schade: 'Glaslat verrot, kozijnhoeken licht aangetast.', ernst: 'Matig' },
  { loc: ['Achtergevel', 'Begane grond', 'nr. 5'], werk: [{ aantal: 1, code: 'DV-DOR-001', naam: 'Deelvervanging onderdorpel', eenheid: 'm¹', uren: 2.5, prijs: 245 }], schade: 'Aantasting onder de waterhol, doorlopend in de stijl.', ernst: 'Ernstig' },
  { loc: ['Achtergevel', '1e etage', 'nr. 9'], werk: [{ aantal: 4, code: 'KIT-001', naam: 'Kit- en aansluitwerk', eenheid: 'm¹', uren: 0.2, prijs: 18.75 }], schade: 'Aansluiting kozijn/metselwerk open.', ernst: 'Licht' },
]

const DEMO_LABELS = ['Gevelzijde', 'Etage', 'Huisnummer']

function demoRegistratie(index: number, toonPrijzen: boolean) {
  const d = DEMO_REGISTRATIES[index % DEMO_REGISTRATIES.length]
  const bedrag = (n: number) => (toonPrijzen ? euroNL(n) : '')
  const verkoop = d.werk.reduce((s, w) => s + w.aantal * w.prijs, 0)
  const uren = d.werk.reduce((s, w) => s + w.aantal * w.uren, 0)
  const tekst = d.werk.map(w => `${w.aantal}× ${w.naam}`).join(' · ')

  return {
    nummer: index + 1,
    datum: datumNL('2026-09-1' + ((index % 5) + 1)),
    datum_iso: '2026-09-1' + ((index % 5) + 1),
    locatie_pad: d.loc.join(' › '),
    locatie_kort: d.loc[d.loc.length - 1],
    loc1: d.loc[0], loc2: d.loc[1], loc3: d.loc[2],
    locatie: d.loc.map((waarde, i) => ({ naam: DEMO_LABELS[i], waarde })),
    status: 'afgerond',
    status_label: 'Afgerond',
    ernst_label: d.ernst,
    controle_label: 'Goedgekeurd',
    afgerond: true,
    schade: d.schade,
    schade_kort: afkappen(d.schade, 120),
    oorzaak: 'Langdurige vochtbelasting',
    notitie: '',
    medewerker: 'Ahmed el Amrani',
    werkzaamheden: d.werk.map(w => ({
      aantal: String(w.aantal), aantal_num: w.aantal,
      code: w.code, naam: w.naam, omschrijving: '', eenheid: w.eenheid,
      uren: getalNL(w.uren * w.aantal),
      prijs_per_stuk: bedrag(w.prijs),
      totaal: bedrag(w.prijs * w.aantal),
      totaal_num: toonPrijzen ? w.prijs * w.aantal : 0,
      kostprijs_per_stuk: bedrag(w.prijs * 0.7),
      kostprijs_totaal: bedrag(w.prijs * 0.7 * w.aantal),
    })),
    heeft_werkzaamheden: true,
    werkzaamheden_tekst: tekst,
    werkzaamheden_kort: afkappen(tekst, 160),
    bedragen: {
      verkoop: bedrag(verkoop), verkoop_num: toonPrijzen ? verkoop : 0,
      kostprijs: bedrag(verkoop * 0.7), uren: getalNL(uren),
      arbeid: bedrag(uren * 62.5), materiaal: bedrag(verkoop * 0.7 - uren * 62.5),
    },
    heeft_prijs: toonPrijzen,
    // Geen demo-foto's: de image-module valt terug op een lege pixel, dus de
    // beheerder ziet wél het fotoraster met de juiste celafmetingen.
    foto_voor: '', foto_tijdens: '', foto_na: '',
    fotos: { voor: '', tijdens: '', na: '' },
    heeft_foto_voor: false, heeft_foto_tijdens: false, heeft_foto_na: false, heeft_foto: false,
  }
}

function demoHoutrotBlok(perPagina: number, toonPrijzen: boolean) {
  const registraties = DEMO_REGISTRATIES.map((_, i) => demoRegistratie(i, toonPrijzen))
  const bedrag = (n: number) => (toonPrijzen ? euroNL(n) : '')
  const totaalVan = (lijst: typeof registraties) => ({
    verkoop: bedrag(lijst.reduce((s, r) => s + Number(r.bedragen.verkoop_num), 0)),
    kostprijs: bedrag(lijst.reduce((s, r) => s + Number(r.bedragen.verkoop_num), 0) * 0.7),
    uren: getalNL(lijst.length * 2),
    arbeid: bedrag(lijst.length * 125),
    materiaal: bedrag(lijst.length * 40),
  })

  const n = Math.max(1, perPagina)
  const paginas = []
  for (let i = 0; i < registraties.length; i += n) {
    paginas.push({ registraties: registraties.slice(i, i + n), groep_naam: '', eerste_van_groep: false })
  }
  const metVlaggen = paginas.map((p, i) => {
    const laatste = i === paginas.length - 1
    return {
      ...p,
      pagina_nummer: i + 1, aantal_paginas: paginas.length,
      eerste: i === 0, laatste, niet_laatste: !laatste,
      paginabreuk: laatste ? '' : PAGINABREUK_XML,
    }
  })

  const groepNamen = [...new Set(registraties.map(r => r.loc1))]
  return {
    heeft: true,
    aantal: registraties.length,
    aantal_paginas: metVlaggen.length,
    per_pagina: n,
    niveau_label: DEMO_LABELS[0],
    filter_omschrijving: 'Afgerond',
    is_voorbeeld: false,
    totaal: totaalVan(registraties),
    paginas: metVlaggen,
    groepen: groepNamen.map(naam => {
      const lijst = registraties.filter(r => r.loc1 === naam)
      return { naam, niveau_label: DEMO_LABELS[0], aantal: lijst.length, totaal: totaalVan(lijst), registraties: lijst }
    }),
    alle_registraties: registraties,
  }
}

/** Bouw7 nummert per soort anders (…IO… voor inkoop, …OA… voor onderaanneming). */
const DEMO_ORDERNUMMER: Record<string, string> = {
  inkooporder: '20261.00598IO004',
  oa_contract: '20261.00598OA002',
}

/**
 * De inkoopblokken met testgegevens. Ze worden alleen gevuld bij een
 * inkooporder-/OA-contractsjabloon; bij een brief blijven ze leeg zodat
 * {#bestelling.heeft} zich in de preview net zo gedraagt als in het echt.
 *
 * De vorm spiegelt `BestellingBlok`/`LeverancierBlok` uit `bestelling-blok.ts`.
 * Die module is server-only (hij leest Supabase), vandaar dat de demo-waarden
 * hier los staan — wijzig je daar een sleutel, pas hem hier ook aan.
 */
function demoInkoop(soort: string | null | undefined): Record<string, unknown> {
  if (!isInkoopSoort(soort)) {
    return {
      bestelling: {
        heeft: false, nummer: '', bonnummer: '', soort: '', soort_label: '', omschrijving: '',
        levering: '', levering_datum: '', levering_datum_iso: '', betaalafspraak: '', interne_notitie: '',
        offertenummer: '', aantal_regels: '0', totaal: '€ 0,00', totaal_getal: 0, regels: [],
        termijnen: [], is_oa: false, is_inkooporder: false,
      },
      leverancier: {
        heeft: false, naam: '', nummer: '', adres: '', postcode: '', plaats: '', volledig_adres: '',
        email: '', telefoon: '', website: '', kvk: '', btw: '',
        contactpersoon: '', contactpersoon_email: '', contactpersoon_telefoon: '',
      },
    }
  }

  const isOa = soort === 'oa_contract'
  const nummer = DEMO_ORDERNUMMER[soort] ?? ''
  const regels = isOa
    ? [
        { nummer: '1', omschrijving: 'Steigerwerk voor- en achtergevel, plaatsen en verwijderen', aantal: '1', eenheid: 'post', stukprijs: '€ 7.450,00', bedrag: '€ 7.450,00', code: '21.10', bedrag_getal: 7450 },
        { nummer: '2', omschrijving: 'Wekelijkse keuring en aanpassingen', aantal: '4', eenheid: 'wk', stukprijs: '€ 185,00', bedrag: '€ 740,00', code: '21.10', bedrag_getal: 740 },
      ]
    : [
        { nummer: '1', omschrijving: 'Sigma S2U Nova zijdeglans, wit RAL 9010', aantal: '48', eenheid: 'l', stukprijs: '€ 21,40', bedrag: '€ 1.027,20', code: '43.20', bedrag_getal: 1027.2 },
        { nummer: '2', omschrijving: 'Grondverf Sigma Amarol Primer', aantal: '20', eenheid: 'l', stukprijs: '€ 18,75', bedrag: '€ 375,00', code: '43.20', bedrag_getal: 375 },
        { nummer: '3', omschrijving: 'Schuurpapier K180, rol', aantal: '6', eenheid: 'st', stukprijs: '€ 12,50', bedrag: '€ 75,00', code: '43.20', bedrag_getal: 75 },
      ]
  const totaal = regels.reduce((s, r) => s + r.bedrag_getal, 0)
  const eur = (n: number) =>
    new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)

  // Spiegelt TERMIJN_SCHEMA in bestelling-blok.ts (20 / 20 / rest / 10).
  const termijnPcts = [
    { omschrijving: '1e termijn — bij opdracht', pct: 20 },
    { omschrijving: '2e termijn — bij start', pct: 20 },
    { omschrijving: 'Termijnen naar rato', pct: 50 },
    { omschrijving: 'Oplevertermijn — na oplevering', pct: 10 },
  ]
  let verdeeld = 0
  const termijnen = termijnPcts.map((t, i) => {
    const laatste = i === termijnPcts.length - 1
    const bedrag = laatste ? Math.round((totaal - verdeeld) * 100) / 100 : Math.round(totaal * t.pct) / 100
    verdeeld = Math.round((verdeeld + bedrag) * 100) / 100
    return { nummer: String(i + 1), omschrijving: t.omschrijving, percentage: `${t.pct}%`, bedrag: eur(bedrag) }
  })

  return {
    bestelling: {
      heeft: true,
      nummer,
      bonnummer: `${nummer}B001`,
      soort,
      soort_label: isOa ? 'Onderaannemerscontract' : 'Inkooporder',
      omschrijving: isOa ? 'Steigerwerk Galileïstraat' : 'Verf en schuurmateriaal Galileïstraat',
      levering: 'week 37',
      levering_datum: datumNL('2026-09-07'),
      levering_datum_iso: '2026-09-07',
      betaalafspraak: '30 dagen netto',
      interne_notitie: '',
      offertenummer: isOa ? 'OF-2026-1184' : 'VGM-88213',
      aantal_regels: String(regels.length),
      totaal: eur(totaal),
      totaal_getal: totaal,
      regels,
      termijnen,
      is_oa: isOa,
      is_inkooporder: !isOa,
    },
    leverancier: isOa
      ? {
          heeft: true,
          naam: 'Van Leeuwen Steigerbouw B.V.',
          nummer: '03358',
          adres: 'Ambachtsweg 7',
          postcode: '3771 MG',
          plaats: 'Barneveld',
          volledig_adres: 'Ambachtsweg 7, 3771 MG Barneveld',
          email: 'planning@vanleeuwensteigers.nl',
          telefoon: '0342 - 41 22 90',
          website: 'www.vanleeuwensteigers.nl',
          kvk: '32145678',
          btw: 'NL803456789B01',
          contactpersoon: 'Dennis van Leeuwen',
          contactpersoon_email: 'dennis@vanleeuwensteigers.nl',
          contactpersoon_telefoon: '06 - 51 22 33 44',
        }
      : {
          heeft: true,
          naam: 'Verfgroothandel Midden B.V.',
          nummer: '03686',
          adres: 'Handelsweg 22',
          postcode: '3903 LN',
          plaats: 'Veenendaal',
          volledig_adres: 'Handelsweg 22, 3903 LN Veenendaal',
          email: 'orders@verfgroothandelmidden.nl',
          telefoon: '0318 - 52 10 10',
          website: 'www.verfgroothandelmidden.nl',
          kvk: '30987654',
          btw: 'NL809876543B01',
          contactpersoon: 'Karin de Groot',
          contactpersoon_email: 'k.degroot@verfgroothandelmidden.nl',
          contactpersoon_telefoon: '0318 - 52 10 15',
        },
  }
}

/** Sprekende demo-waarden voor de conventionele invoersleutels. */
const VOORBEELD_INVOER: Record<string, string> = {
  werkzaamheden: 'Schilderwerk buitenzijde, houtrotherstel en vervangen van kitvoegen.',
  garantie_jaren: '6',
  behandelingen: 'Houtwerk: 1× grondlaag, 2× aflak (Sigma S2U Nova).',
  aanhef: 'Geachte bewoner',
}
