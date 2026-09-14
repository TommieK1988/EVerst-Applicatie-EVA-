/**
 * De catalogus van alle beheerschermen, gegroepeerd zoals de zijbalk.
 *
 * Eén bron van waarheid: de hub-pagina leest hem op de server (om te filteren op rechten)
 * en geeft alleen de zichtbare tegels door aan de client. Daarom mag dit bestand niets
 * server-only importeren — alleen types.
 *
 * De sectievolgorde volgt de zijbalk (Sidebar.tsx): eerst de dossierstroom, dan Planning,
 * Beheer, Financieel en Apps. Organisatie en Systeem sluiten af, net als de pin
 * "Bedrijfsinstellingen" onderaan het menu.
 */
import type { RechtenModule, ModuleRechten } from '@everts/database/platform-types'
import type { FeatureKey } from '@/lib/features'

export type InstellingTegel = {
  href: string
  titel: string
  omschrijving: string
  /**
   * Zachte filter (`magOnderdeelZien`): bestaat dit onderdeel voor deze gebruiker?
   * Laat alles door wat niet in AFGEDWONGEN_MODULES staat.
   */
  module: RechtenModule
  /**
   * Vul dit als de pagina erachter een `vereisModuleToegang()` heeft, met exact dezelfde
   * module én niveau. De hub filtert er hard op met `heeftModuleToegang`, zodat een tegel
   * nooit meer zichtbaar is voor iemand die bij het klikken naar `/` wordt teruggestuurd.
   */
  guard?: { module: RechtenModule; niveau: ModuleRechten }
  /** Alleen voor beheerders (`rechten.instellingen === 'beheren'`). */
  alleenBeheerder?: boolean
  /** Verbergen zolang deze feature-flag uit staat. */
  feature?: FeatureKey
  /** Extra zoektermen voor het zoekveld; niet zichtbaar op het scherm. */
  synoniemen?: string[]
}

export type InstellingSectie = {
  titel: string
  /** Korte toelichting onder de sectiekop; laat weg als de kop voor zich spreekt. */
  toelichting?: string
  tegels: InstellingTegel[]
}

export const INSTELLINGEN_SECTIES: InstellingSectie[] = [
  {
    titel: 'Dossiers',
    toelichting: 'Aanvragen, offertes, opdrachten en servicedesk',
    tegels: [
      {
        href: '/instellingen/dossiers',
        titel: 'Dossiers',
        omschrijving: 'De categorieën die je op een aanvraag, offerte of opdracht kunt kiezen, en de schakelaars die bepalen welke tabbladen verschijnen.',
        module: 'dossiers',
        synoniemen: ['categorie', 'soort werk', 'toggle', 'schakelaar', 'tab', 'houtrot', 'vca', 'opname'],
      },
    ],
  },
  {
    // De offerte-opmaak zit in de Offertes-tegel en hoort naast de twee andere
    // sjabloonschermen te staan: het zijn samen alle sjablonen die naar buiten gaan.
    titel: 'Offertes & communicatie',
    toelichting: 'Alles wat de klant onder ogen krijgt',
    tegels: [
      {
        href: '/instellingen/offertes',
        titel: 'Offertes',
        omschrijving: 'Hoe een offerte eruitziet en wat erbij hoort: Word-opmaak, algemene voorwaarden, termijnschema’s en de goedkeuringsdrempel.',
        module: 'dossiers',
        synoniemen: [
          'layout', 'opmaak', 'sjabloon', 'template', 'word',
          'av', 'voorwaarden', 'uav', 'bijlage',
          'termijn', 'termijnschema', 'betalingsconditie', 'aanbetaling', 'percentage',
          'goedkeuring', 'drempel',
        ],
      },
      {
        href: '/instellingen/document-sjablonen',
        titel: 'Documentsjablonen',
        omschrijving: 'Word-sjablonen voor bewonersbrieven, garantiecertificaten en informatiebrieven.',
        module: 'instellingen',
        guard: { module: 'instellingen', niveau: 'beheren' },
        synoniemen: ['sjabloon', 'template', 'word', 'brief', 'bewonersbrief', 'garantie'],
      },
      {
        href: '/instellingen/mailsjablonen',
        titel: 'E-mailsjablonen',
        omschrijving: 'Onderwerp en tekst van elke e-mail die EVA verstuurt: offerte, uitvraag, oplevering, klantportaal en gebruikersuitnodigingen.',
        module: 'instellingen',
        guard: { module: 'instellingen', niveau: 'beheren' },
        synoniemen: ['sjabloon', 'template', 'mail', 'e-mail', 'bericht', 'onderwerp'],
      },
    ],
  },
  {
    titel: 'Planning & uren',
    tegels: [
      {
        href: '/instellingen/uren',
        titel: 'Uren',
        omschrijving: 'Hoe de weekstaat rekent en waar de uren landen, plus de uursoorten uit Bouw7 en de uurtarief-hiërarchie.',
        module: 'planning',
        guard: { module: 'instellingen', niveau: 'beheren' },
        synoniemen: [
          'weekstaat', 'deadline', 'goedkeuren', 'verlof', 'indirect',
          'uursoort', 'tarief', 'uurtarief', 'bouw7', 'calculatie',
        ],
      },
    ],
  },
  {
    titel: 'Beheer',
    toelichting: 'Mensen, toegang en materieel',
    tegels: [
      {
        href: '/instellingen/medewerkers',
        titel: 'Medewerkers',
        omschrijving: 'Wat er op een medewerkerprofiel te kiezen valt: functies, afdelingen en ploegen, de CAO-loonschalen en de eigen velden.',
        module: 'medewerkers',
        synoniemen: [
          'functie', 'afdeling', 'ploeg', 'team', 'rol',
          'loon', 'loonschaal', 'trede', 'salaris', 'cao',
          'attribuut', 'kenmerk', 'eigen veld', 'certificaat',
        ],
      },
      {
        href: '/instellingen/gebruikers',
        titel: 'Gebruikers & rechten',
        omschrijving: 'Wie toegang heeft tot EVA, welk type gebruiker ze zijn en welke rechten per afdeling gelden.',
        module: 'instellingen',
        alleenBeheerder: true,
        guard: { module: 'instellingen', niveau: 'beheren' },
        synoniemen: ['toegang', 'rechten', 'rol', 'inloggen', 'wachtwoord', 'account', 'uitnodigen'],
      },
      {
        href: '/instellingen/klantportaal',
        titel: 'Klantportaal',
        omschrijving: 'Welke opdrachtgevers toegang hebben tot hun projectomgeving, en wanneer zij voor het laatst inlogden.',
        module: 'klantportaal',
        guard: { module: 'klantportaal', niveau: 'beheren' },
        synoniemen: ['portaal', 'klant', 'opdrachtgever', 'toegang', 'inloggen', 'extern'],
      },
      {
        href: '/wagenpark/instellingen',
        titel: 'Wagenpark',
        omschrijving: 'Voertuigcategorieën, brandstofnormen, compliance-drempels en de koppeling met cartracker.',
        module: 'wagenpark',
        guard: { module: 'wagenpark', niveau: 'lezen' },
        synoniemen: ['auto', 'voertuig', 'brandstof', 'rit', 'cartracker'],
      },
      {
        href: '/materieelbeheer/instellingen',
        titel: 'Materieel',
        omschrijving: 'Categorieën, keuringstermijnen en de standaardinstellingen voor materieelbeheer.',
        module: 'materieelbeheer',
        guard: { module: 'materieelbeheer', niveau: 'beheren' },
        feature: 'materieelbeheer',
        synoniemen: ['gereedschap', 'ladder', 'keuring', 'sticker', 'qr'],
      },
      {
        href: '/instellingen/handboek',
        titel: 'Medewerkershandboek',
        omschrijving:
          'De hoofdstukken, de “Wat te doen bij…”-kaarten en de bijlagen die medewerkers op hun telefoon lezen — en voor wie elk stuk zichtbaar is.',
        module: 'medewerkershandboek',
        guard: { module: 'medewerkershandboek', niveau: 'lezen' },
        feature: 'handboek',
        synoniemen: [
          'personeelshandboek', 'huisregels', 'arbeidsvoorwaarden', 'flexkracht',
          'wat te doen bij', 'verlof', 'kleding', 'pbm', 'auto van de zaak',
        ],
      },
    ],
  },
  {
    titel: 'Financieel',
    tegels: [
      {
        href: '/instellingen/facturatie',
        titel: 'Facturatie',
        omschrijving: 'Opslag op geboekte kosten bij regiewerk en stelposten, en de redenen “niet betaald” op het Facturen-scherm.',
        module: 'financieel',
        guard: { module: 'financieel', niveau: 'beheren' },
        synoniemen: ['regie', 'opslag', 'stelpost', 'marge', 'factuur', 'debiteur', 'reden', 'onbetaald', 'aanmaning'],
      },
      {
        href: '/instellingen/btw-kostensoorten',
        titel: 'BTW-tarieven & kostensoorten',
        omschrijving: 'De twee vaste Bouw7-lijsten achter calculatie, offertes, facturen en inkoop. Alleen lezen.',
        module: 'dossiers',
        synoniemen: [
          'btw', '21%', '9%', 'verlegd', 'belasting', 'bouw7',
          'kostensoort', 'arbeid', 'inkoop', 'onderaanneming', 'materiaal',
        ],
      },
      {
        href: '/management/instellingen',
        titel: 'Management',
        omschrijving: 'Algemene kosten en doelstellingen per werkmaatschappij en projectleider, en OHW-correcties per dossier.',
        module: 'management',
        guard: { module: 'management', niveau: 'beheren' },
        synoniemen: ['ak', 'doelstelling', 'ohw', 'marge', 'kpi'],
      },
    ],
  },
  {
    titel: 'Apps',
    tegels: [
      {
        href: '/instellingen/formulieren-pdf',
        titel: 'Formulieren — PDF-opmaak',
        omschrijving: 'De opmaak van de PDF-rapporten die uit ingediende formulieren rollen.',
        module: 'formulieren',
        synoniemen: ['formulier', 'pdf', 'rapport', 'briefpapier', 'opmaak'],
      },
      {
        href: '/everts-calc/instellingen',
        titel: 'EvertsCalc',
        omschrijving: 'Rekenregels, eenheden, kolomnamen en standaard calculatie-instellingen.',
        module: 'everts_calc',
        synoniemen: ['calculatie', 'rekenregel', 'eenheid', 'opslag', 'dico'],
      },
      {
        href: '/everts-calc/bibliotheek/recepten',
        titel: 'Recepten',
        omschrijving: 'Codes, uren, materialen en marge per recept. Ook de houtrotreparaties die je bij een registratie kiest.',
        module: 'everts_calc',
        synoniemen: ['recept', 'houtrot', 'reparatie', 'prijslijst', 'bibliotheek'],
      },
    ],
  },
  {
    titel: 'Organisatie',
    tegels: [
      {
        href: '/instellingen/bedrijfsgegevens',
        titel: 'Organisatiegegevens',
        omschrijving: 'Organisatie en werkmaatschappijen — naam, KvK, BTW-nummer en adres.',
        module: 'instellingen',
        synoniemen: ['bedrijf', 'kvk', 'adres', 'werkmaatschappij', 'iban'],
      },
      {
        href: '/instellingen/bedrijfsgegevens/huisstijl',
        titel: 'Huisstijl',
        omschrijving: 'Logo’s in meerdere formaten, kleurenpalet, typografie en huisstijlregels.',
        module: 'instellingen',
        synoniemen: ['logo', 'kleur', 'lettertype', 'typografie', 'briefpapier', 'merk'],
      },
    ],
  },
  {
    titel: 'Systeem',
    tegels: [
      {
        href: '/instellingen/integraties',
        titel: 'Integraties',
        omschrijving: 'De Bouw7-koppeling (API-key en sync) en overige verbindingen met externe systemen.',
        module: 'instellingen',
        synoniemen: ['bouw7', 'koppeling', 'api', 'sync', 'sharepoint'],
      },
      {
        href: '/instellingen/foutenlog',
        titel: 'Foutenlog',
        omschrijving: 'Wat er misging in EVA — wat de melding was, wanneer, hoe vaak en wie het raakte.',
        module: 'instellingen',
        alleenBeheerder: true,
        guard: { module: 'instellingen', niveau: 'beheren' },
        synoniemen: ['fout', 'error', 'log', 'storing', 'melding'],
      },
    ],
  },
]
