/**
 * Het rechtenmodel: kanalen, modules, niveaus en functies.
 *
 * Dit bestand is de bron van waarheid. De beheer-UI, de Zod-validatie en de
 * guards leiden hun lijsten hieruit af, zodat ze nooit uit elkaar lopen — en de
 * uitleg bij elk onderdeel staat hier, niet in een codecommentaar dat een
 * beheerder nooit ziet. Wat je hier bij `niveaus` en `uitleg` schrijft, verschijnt
 * letterlijk in het rechtenscherm.
 *
 * Bewust zonder imports en zonder 'server-only': dit bestand wordt gelezen door de
 * middleware (edge), door server-componenten en door de beheer-UI in de browser.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Kanaal
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Desktop (het platform) of mobiel (de monteursapp onder /m). Rechten worden per
 * kanaal ingesteld, zodat je iemand op zijn telefoon iets kunt geven of onthouden
 * zonder zijn werkplek te veranderen.
 */
export type Kanaal = 'desktop' | 'mobiel'

/**
 * Requestheader waarin de middleware het kanaal zet. Altijd met `set()`, nooit
 * `append()`: een client die de header zelf meestuurt moet overschreven worden.
 */
export const KANAAL_HEADER = 'x-eva-kanaal'

/**
 * Het kanaal volgt uit het PAD, niet uit het apparaat-cookie. Dat cookie is
 * routering en geen autorisatie (zie packages/database/src/cookies.ts); wie het
 * vervalst zou anders de andere rechtenset krijgen.
 *
 * LET OP — dit is een zichtbaarheidsscheiding, geen datatoegangsscheiding. Een
 * server action wordt geadresseerd via de `Next-Action`-header en niet via het
 * pad, dus de aanroeper kiest zelf welk kanaal hij claimt. Daarom staat
 * `vereisRecht` standaard op kanaal 'beide'. Wat mobiel afschermt is wat je in de
 * app te zien en te klikken krijgt, niet wat een kale RPC kan bereiken.
 */
export function kanaalVoorPad(pathname: string): Kanaal {
  return pathname === '/m' || pathname.startsWith('/m/') ? 'mobiel' : 'desktop'
}

// ─────────────────────────────────────────────────────────────────────────────
// Niveaus en vorm van de catalogus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De ladder. Wat elk niveau in een specifiek onderdeel betekent staat per module
 * bij `niveaus` — de ladder alleen zegt te weinig, want `beheren` op Wagenpark is
 * iets heel anders dan `beheren` op Actielijsten.
 */
export type ModuleRechten = 'lezen' | 'schrijven' | 'beheren'

const NIVEAU_RANG: Record<ModuleRechten, number> = { lezen: 1, schrijven: 2, beheren: 3 }

/** Haalt `niveau` minstens `min`? Een ontbrekend niveau haalt nooit iets. */
export function niveauHaalt(niveau: ModuleRechten | null | undefined, min: ModuleRechten): boolean {
  return niveau ? NIVEAU_RANG[niveau] >= NIVEAU_RANG[min] : false
}

/** Kop waaronder het onderdeel in het rechtenscherm staat. Volgt de zijbalk. */
export type RechtenGroep =
  | 'dossierstroom' | 'planning' | 'beheer' | 'financieel' | 'apps' | 'systeem'

export const RECHTEN_GROEPEN: ReadonlyArray<{ key: RechtenGroep; label: string }> = [
  { key: 'dossierstroom', label: 'Dossierstroom' },
  { key: 'planning',      label: 'Planning' },
  { key: 'beheer',        label: 'Beheer' },
  { key: 'financieel',    label: 'Financieel' },
  { key: 'apps',          label: 'Apps' },
  { key: 'systeem',       label: 'Systeem' },
]

type FunctieVorm = {
  /** `<module>.<functie>` — de module-prefix is verplicht en moet kloppen. */
  readonly key: string
  readonly label: string
  /** Eén zin in gewone taal. Staat straks naast het vinkje in het beheerscherm. */
  readonly uitleg: string
  /**
   * Vanaf dit niveau is de functie automatisch aan, zonder vinkje. Bedoeld voor
   * functies die de betekenis van een niveau alleen preciezer máken; een functie
   * die iets nieuws toevoegt laat dit weg en staat standaard uit.
   * Een expliciete `false` in de rechten wint hier altijd van.
   */
  readonly inbegrepenVanaf?: ModuleRechten
}

type ModuleVorm = {
  readonly key: string
  readonly label: string
  readonly groep: RechtenGroep
  /** In welke kanalen dit onderdeel bestaat. Bepaalt of het in de matrix staat. */
  readonly kanalen: readonly Kanaal[]
  readonly omschrijving: string
  /** Wat de drie niveaus in DÍT onderdeel betekenen. Verschijnt in het beheerscherm. */
  readonly niveaus: { readonly lezen: string; readonly schrijven: string; readonly beheren: string }
  readonly functies?: readonly FunctieVorm[]
  /** Sleutel bestaat nog in de data maar doet niets meer: verbergen in de UI. */
  readonly vervallen?: true
}

// ─────────────────────────────────────────────────────────────────────────────
// De catalogus
// ─────────────────────────────────────────────────────────────────────────────

const GEEN_EXTRA = 'Doet in dit onderdeel niets extra’s.'

export const RECHTEN_CATALOGUS = [
  {
    key: 'dossiers',
    label: 'Dossiers',
    groep: 'dossierstroom',
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Aanvragen, offertes, opdrachten en afgesloten werk, met de documenten eromheen.',
    niveaus: {
      lezen: 'Dossiers en hun documenten inzien, en PDF’s en voorbeelden openen.',
      schrijven: 'Dossiergegevens, werkzaamheden en meerwerk aanmaken en wijzigen, en documenten uploaden of laten genereren.',
      beheren: 'Ook de dossierinstellingen: categorieën en welke tabbladen in een dossier verschijnen.',
    },
    functies: [
      {
        key: 'dossiers.offerte_accorderen',
        label: 'Offertes accorderen',
        uitleg: 'Offertes boven de goedkeuringsdrempel akkoord geven.',
      },
      {
        key: 'dossiers.meerwerk_accorderen',
        label: 'Meerwerk accorderen',
        uitleg: 'Meerwerkregels namens het bedrijf op akkoord of afgewezen zetten.',
      },
      {
        key: 'dossiers.bestand_extern_mailen',
        label: 'Bestanden naar buiten mailen',
        uitleg: 'Een dossierbestand rechtstreeks naar een opdrachtgever of leverancier mailen.',
      },
    ],
  },
  {
    key: 'servicedesk',
    label: 'Servicedesk',
    groep: 'dossierstroom',
    kanalen: ['desktop'],
    omschrijving: 'Storingsmeldingen en serviceopdrachten, van melding tot afmelding.',
    niveaus: {
      lezen: 'Het servicedesk-overzicht en de losse bonnen inzien.',
      schrijven: 'Bonnen aanmaken, toewijzen, bijwerken en afmelden.',
      beheren: 'Ook de servicedesk-instellingen en de categorieën.',
    },
  },
  {
    key: 'management',
    label: 'Management',
    groep: 'financieel',
    kanalen: ['desktop'],
    omschrijving: 'De stuurinformatie: lopend en gereed werk, werkvoorraad, verkoop en prestaties.',
    niveaus: {
      lezen: 'Alle managementdashboards en -overzichten inzien.',
      schrijven: GEEN_EXTRA + ' De schermen zijn alleen-lezen.',
      beheren: 'Ook de instellingen van het managementdashboard: marges, drempels en doelstellingen.',
    },
  },
  {
    key: 'planning',
    label: 'Planning',
    groep: 'planning',
    kanalen: ['desktop'],
    omschrijving: 'Projectplanning, medewerkerplanning en de bedrijfsagenda.',
    niveaus: {
      lezen: 'De planborden en de bedrijfsagenda inzien.',
      schrijven: 'Inplannen, verschuiven en mensen aan activiteiten toewijzen.',
      beheren: 'Ook de planningsinstellingen en de categorieën van de bedrijfsagenda.',
    },
  },
  {
    key: 'relaties',
    label: 'Relaties',
    groep: 'beheer',
    // Ook mobiel: hier hangt de module Commercieel aan (/m/commercieel), het klantbeeld
    // dat je opslaat terwijl je een opdrachtgever spreekt.
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Opdrachtgevers, contactpersonen en hun historie. Op mobiel het klantbeeld onder Commercieel.',
    niveaus: {
      lezen: 'Relatiekaarten, contactpersonen en de dossierhistorie inzien. Op mobiel: het klantbeeld van een opdrachtgever openen.',
      schrijven: 'Relaties en contactpersonen aanmaken en wijzigen, en gespreksnotities plaatsen.',
      beheren: 'Ook dubbele relaties samenvoegen en de relatie-instellingen wijzigen.',
    },
  },
  {
    key: 'objectenbeheer',
    label: 'Objecten',
    groep: 'beheer',
    kanalen: ['desktop'],
    omschrijving: 'Het vastgoed waaraan we werken: panden, complexen en hun historie.',
    niveaus: {
      lezen: 'Objecten en hun koppelingen aan relaties en dossiers inzien.',
      schrijven: 'Objecten aanmaken, wijzigen en koppelen.',
      beheren: 'Ook de objectenlijst in zijn geheel synchroniseren met de bron.',
    },
    functies: [
      {
        key: 'objectenbeheer.synchroniseren',
        label: 'Volledige synchronisatie draaien',
        uitleg: 'De hele objectenlijst opnieuw ophalen; raakt alle objecten tegelijk.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'medewerkers',
    label: 'Medewerkers',
    groep: 'beheer',
    kanalen: ['desktop'],
    omschrijving: 'De personeelsadministratie: profielen, roosters, verzuim en saldo’s.',
    niveaus: {
      lezen: 'De medewerkerslijst en de gewone gegevens van een collega inzien.',
      schrijven: 'Profielgegevens, roosters en koppelingen bijwerken.',
      beheren: 'Ook de gevoelige administratie: uit dienst zetten, handmatige velden vrijgeven, saldo’s corrigeren.',
    },
    functies: [
      {
        key: 'medewerkers.persoonsgegevens',
        label: 'Persoonsgegevens zien',
        uitleg: 'BSN, geboortedatum en woonadres van collega’s inzien.',
      },
      {
        key: 'medewerkers.tarieven',
        label: 'Tarieven en schaal zien',
        uitleg: 'Uurtarieven, kostprijs en CAO-schaal van collega’s inzien.',
      },
      {
        key: 'medewerkers.saldo_corrigeren',
        label: 'Saldo corrigeren',
        uitleg: 'Het tijd-voor-tijdsaldo van een collega handmatig bijstellen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'wagenpark',
    label: 'Wagenpark',
    groep: 'beheer',
    kanalen: ['desktop'],
    omschrijving: 'Voertuigen, ritten, bestuurders, parkeren en de compliance-signalen.',
    niveaus: {
      lezen: 'Voertuigen, zakelijke ritten en het wagenparkdashboard inzien.',
      schrijven: 'Bestuurders koppelen, ritten corrigeren, parkeerplekken toewijzen en bevindingen afhandelen.',
      beheren: 'Ook de compliance-meldingen ontvangen en de wagenparkinstellingen wijzigen.',
    },
    functies: [
      {
        key: 'wagenpark.prive_ritten',
        label: 'Privé-ritten zien',
        uitleg: 'De privé-ritten van een met naam genoemde collega zien, en verder terug kijken dan 31 dagen.',
      },
      {
        key: 'wagenpark.werktijden',
        label: 'Werktijden zien',
        uitleg: 'De Werktijden-pagina openen: aankomst- en vertrektijden per collega.',
      },
      {
        key: 'wagenpark.koppelingen_en_import',
        label: 'Koppelingen en import',
        uitleg: 'Ritten en parkeerdata importeren en de ULU-koppeling instellen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'wagenpark_prive',
    label: 'Wagenpark: privé & werktijden',
    groep: 'beheer',
    kanalen: ['desktop'],
    vervallen: true,
    omschrijving: 'Vervangen door de functies “Privé-ritten zien” en “Werktijden zien” onder Wagenpark.',
    niveaus: { lezen: '', schrijven: '', beheren: '' },
  },
  {
    key: 'kam',
    label: 'KAM/VGM',
    groep: 'beheer',
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Kwaliteitsinspecties, afwijkingen, VCA-diploma’s en de kwaliteitsbibliotheek.',
    niveaus: {
      lezen: 'Inspecties, afwijkingen en de kwaliteitsbibliotheek inzien.',
      schrijven: 'Inspecties uitvoeren en afwijkingen melden en afhandelen.',
      beheren: 'Ook de kwaliteitsbibliotheek en de KAM-instellingen onderhouden.',
    },
    functies: [
      {
        key: 'kam.vca_diplomas',
        label: 'VCA-diploma’s',
        uitleg: 'De VCA-diploma’s van collega’s inzien en bijhouden.',
      },
    ],
  },
  {
    key: 'houtrotherstel',
    label: 'Houtrotherstel',
    groep: 'dossierstroom',
    kanalen: ['desktop'],
    vervallen: true,
    omschrijving: 'Vervallen: houtrot is een dossiertabblad dat per dossier wordt aangezet, geen eigen onderdeel.',
    niveaus: { lezen: '', schrijven: '', beheren: '' },
  },
  {
    key: 'everts_calc',
    label: 'EvertsCalc',
    groep: 'apps',
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Calculeren en offreren: calculaties, offertes, recepten, schilderwerk en materialen.',
    niveaus: {
      lezen: 'Calculaties, offertes en de bibliotheek inzien.',
      schrijven: 'Calculeren, offertes opstellen en genereren, en opnames verwerken.',
      beheren: 'Ook de calculatiebibliotheek en de offertesjablonen onderhouden.',
    },
    functies: [
      {
        key: 'everts_calc.prijslijsten_beheren',
        label: 'Prijslijsten wijzigen',
        uitleg: 'Prijslijsten, onderdelen en normen aanpassen — dit zijn inkoopprijzen.',
      },
      {
        key: 'everts_calc.sjablonen_beheren',
        label: 'Sjablonen en briefpapier',
        uitleg: 'Briefpapier en Word-sjablonen uploaden en vervangen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'materieelbeheer',
    label: 'Materieelbeheer',
    groep: 'beheer',
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Gereedschap en materieel: paspoorten, keuringen, toewijzingen en storingen.',
    niveaus: {
      lezen: 'Paspoorten en overzichten bekijken.',
      schrijven: 'Dagelijks gebruik: scannen, de periodieke controle invullen, toewijzen, storing melden, materieel toevoegen en bestanden uploaden.',
      beheren: 'Onomkeerbaar en administratief: archiveren, documenten en keuringen verwijderen, teams en instellingen beheren.',
    },
    functies: [
      {
        key: 'materieelbeheer.verwijderen',
        label: 'Verwijderen en archiveren',
        uitleg: 'Documenten, keuringen en materieel definitief verwijderen of archiveren.',
        inbegrepenVanaf: 'beheren',
      },
      {
        key: 'materieelbeheer.aanschafwaarde',
        label: 'Aanschafwaarde zien',
        uitleg: 'De aanschafwaarde en de aankoopfacturen bij het materieel inzien.',
      },
    ],
  },
  {
    key: 'toolbox',
    label: 'Toolbox',
    groep: 'beheer',
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Toolboxmeetings: opstellen, publiceren, uitzetten en de presentielijst.',
    niveaus: {
      lezen: 'Toolboxen, de rapportage en de presentielijst inzien.',
      schrijven: 'Toolboxen opstellen, publiceren en aan momenten koppelen.',
      beheren: 'Ook gepubliceerde toolboxen archiveren.',
    },
    functies: [
      {
        key: 'toolbox.toewijzen',
        label: 'Toolbox uitzetten',
        uitleg: 'Een toolbox uitzetten bij collega’s; dit zet een openstaande actie op hun telefoon.',
      },
      {
        key: 'toolbox.archiveren',
        label: 'Archiveren',
        uitleg: 'Een gepubliceerde toolbox uit de roulatie halen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'formulieren',
    label: 'Formulieren',
    groep: 'apps',
    kanalen: ['desktop'],
    omschrijving: 'Digitale formulieren: sjablonen, invullen en inzendingen.',
    niveaus: {
      lezen: 'Het inzendingenoverzicht en de PDF’s inzien.',
      schrijven: 'Formulieren invullen en inzendingen aanmaken.',
      beheren: 'Ook formuliersjablonen ontwerpen en publiceren.',
    },
    functies: [
      {
        key: 'formulieren.sjablonen_beheren',
        label: 'Sjablonen ontwerpen',
        uitleg: 'Formuliersjablonen aanmaken en wijzigen; raakt alle toekomstige inzendingen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'taken',
    label: 'Actielijsten',
    groep: 'apps',
    kanalen: ['desktop'],
    omschrijving: 'Actielijsten en hun sjablonen, inclusief de deadlines en automatische koppeling.',
    niveaus: {
      lezen: 'Het actielijst-overzicht inzien.',
      schrijven: 'Acties aanmaken, toewijzen, afvinken en deadlines zetten.',
      beheren: 'Ook de sjablonen en de triggers die actielijsten automatisch koppelen.',
    },
    functies: [
      {
        key: 'taken.sjablonen_beheren',
        label: 'Sjablonen en triggers',
        uitleg: 'Actielijst-sjablonen en hun automatische koppelregels wijzigen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'mijn_taken',
    label: 'Mijn acties',
    groep: 'apps',
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Je eigen openstaande acties.',
    niveaus: {
      lezen: 'Je eigen acties zien en afvinken.',
      schrijven: GEEN_EXTRA,
      beheren: GEEN_EXTRA,
    },
    functies: [
      {
        key: 'mijn_taken.alle_zien',
        label: 'Acties van collega’s zien',
        uitleg: 'De schakelaar boven de lijst waarmee je ook de acties van anderen ziet.',
      },
    ],
  },
  {
    key: 'alle_taken',
    label: 'Alle acties',
    groep: 'apps',
    kanalen: ['desktop'],
    vervallen: true,
    omschrijving: 'Vervangen door de functie “Acties van collega’s zien” onder Mijn acties.',
    niveaus: { lezen: '', schrijven: '', beheren: '' },
  },
  {
    key: 'financieel',
    label: 'Financieel',
    groep: 'financieel',
    // Ook mobiel, maar smal: alleen het blok met openstaande facturen in het klantbeeld
    // onder Commercieel. Facturen bewerken blijft kantoorwerk.
    kanalen: ['desktop', 'mobiel'],
    omschrijving: 'Facturatie, termijnen, geboekte uren en debiteurenopvolging. Op mobiel alleen de openstaande facturen bij een opdrachtgever.',
    niveaus: {
      lezen: 'Het facturenoverzicht, de geboekte uren en de termijnen van het hele bedrijf inzien. Op mobiel: de openstaande facturen in het klantbeeld.',
      schrijven: 'Termijnen factureerbaar stellen, regiewerk verwerken en facturen bewerken.',
      beheren: 'Ook de facturatie-instellingen wijzigen.',
    },
    functies: [
      {
        key: 'financieel.debiteuren_opvolgen',
        label: 'Debiteuren opvolgen',
        uitleg: 'De debiteurenopvolging bewerken en handmatig verversen.',
      },
      {
        key: 'financieel.termijnen_vrijgeven',
        label: 'Termijnen vrijgeven',
        uitleg: 'Een termijn factureerbaar stellen; hierna gaat de factuur naar de klant.',
      },
    ],
  },
  {
    key: 'inkoopfacturen',
    label: 'Inkoopfacturen',
    groep: 'financieel',
    kanalen: ['desktop'],
    omschrijving: 'Crediteurenfacturen: accorderen, afkeuren en betaalrondes.',
    niveaus: {
      lezen: 'Het overzicht en je eigen werkvoorraad “Te accorderen door mij” inzien.',
      schrijven: 'Facturen accorderen of afkeuren en er opmerkingen bij plaatsen.',
      beheren: 'Ook betaalrondes samenstellen, vrijgeven en afronden.',
    },
    functies: [
      {
        key: 'inkoopfacturen.zonder_project',
        label: 'Facturen zonder project zien',
        uitleg: 'Ook overhead, abonnementen, leasing en juridische kosten zien — alles wat niet aan een project hangt.',
      },
      {
        key: 'inkoopfacturen.betaalronde',
        label: 'Betaalrondes',
        uitleg: 'Een betaalronde samenstellen, vrijgeven en afronden.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'inkoopfacturen_alle',
    label: 'Inkoopfacturen: alle',
    groep: 'financieel',
    kanalen: ['desktop'],
    vervallen: true,
    omschrijving: 'Vervangen door de functie “Facturen zonder project zien” onder Inkoopfacturen.',
    niveaus: { lezen: '', schrijven: '', beheren: '' },
  },
  {
    key: 'klantportaal',
    label: 'Klantportaal',
    groep: 'beheer',
    kanalen: ['desktop'],
    omschrijving: 'Wat een opdrachtgever in zijn eigen portaal te zien krijgt.',
    niveaus: {
      lezen: 'De Portaal-tab en de klantchat inzien.',
      schrijven: 'Onderdelen en bestanden vrijgeven en in de chat terugschrijven.',
      beheren: 'Ook contactpersonen uitnodigen, hun bereik instellen en toegang intrekken.',
    },
  },
  {
    key: 'medewerkershandboek',
    label: 'Medewerkershandboek',
    groep: 'beheer',
    kanalen: ['desktop'],
    omschrijving:
      'Het BEHEER van het personeelshandboek. Het lezen ervan hangt niet aan dit recht: ' +
      'elke medewerker opent zijn eigen handboek op zijn telefoon, en wat hij daar ziet ' +
      'bepalen de zichtbaarheidskenmerken per alinea.',
    niveaus: {
      lezen: 'De beheerschermen en de weergave “Bekijk als” inzien.',
      schrijven: 'Teksten bewerken en de zichtbaarheid per onderdeel instellen.',
      beheren: 'Ook publiceren, bijlagen verwijderen en hoofdstukken archiveren.',
    },
  },
  {
    key: 'mailintake',
    label: 'Mailintake',
    groep: 'dossierstroom',
    kanalen: ['desktop'],
    omschrijving: 'De post uit de gedeelde intakepostbussen.',
    niveaus: {
      lezen: 'Het postvak en de behandelschermen inzien.',
      schrijven: 'Berichten behandelen: dossier aanmaken, koppelen of negeren.',
      beheren: 'Ook postbussen instellen, automatisch aanmaken aanzetten en aliassen beheren.',
    },
    functies: [
      {
        key: 'mailintake.postbussen_beheren',
        label: 'Postbussen instellen',
        uitleg: 'De postbusverbindingen, standaarden en negeerlijst wijzigen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
  {
    key: 'instellingen',
    label: 'Instellingen',
    groep: 'systeem',
    kanalen: ['desktop'],
    omschrijving:
      'De bedrijfsinstellingen — en tegelijk de beheerderssleutel. Let op: “beheren” ' +
      'geeft toegang tot ALLES in EVA, ook tot onderdelen die hieronder niet zijn aangevinkt.',
    niveaus: {
      lezen: 'Doet niets: de instellingenhub is alleen voor beheerders.',
      schrijven: 'Doet niets.',
      beheren: 'Volledige toegang tot het hele platform, inclusief alle andere onderdelen.',
    },
    functies: [
      {
        key: 'instellingen.rechten_beheren',
        label: 'Rechten beheren',
        uitleg: 'Rechten van afdelingen en collega’s wijzigen en gebruikers uitnodigen.',
        inbegrepenVanaf: 'beheren',
      },
    ],
  },
] as const satisfies readonly ModuleVorm[]

// ─────────────────────────────────────────────────────────────────────────────
// Afgeleide typen en indexen
// ─────────────────────────────────────────────────────────────────────────────

export type ModuleDefinitie = (typeof RECHTEN_CATALOGUS)[number]
export type RechtenModule = ModuleDefinitie['key']

type FunctiesVan<M> = M extends { readonly functies: readonly (infer F)[] }
  ? F extends { readonly key: infer K } ? K : never
  : never
export type FunctieKey = FunctiesVan<ModuleDefinitie>

/**
 * Een functie met zijn module erbij, in de brede vorm. Nodig omdat `as const` de
 * losse items zó smal maakt dat een item zónder `inbegrepenVanaf` dat veld niet
 * eens kent — daar kun je in een component niet mee werken.
 */
export type ModuleFunctie =
  Omit<FunctieVorm, 'key'> & { key: FunctieKey; module: RechtenModule }

/** De functies van één onderdeel, bruikbaar getypeerd. */
export function functiesVan(module: RechtenModule): readonly ModuleFunctie[] {
  const m = MODULE_INDEX[module]
  return ('functies' in m ? m.functies : []).map(f => ({ ...f, module }))
}

export const MODULE_INDEX = Object.fromEntries(
  RECHTEN_CATALOGUS.map(m => [m.key, m]),
) as Record<RechtenModule, ModuleDefinitie>

/** Per functiesleutel de definitie plus de module waar hij bij hoort. */
export const FUNCTIE_INDEX = Object.fromEntries(
  RECHTEN_CATALOGUS.flatMap(m =>
    ('functies' in m ? m.functies : []).map(f => [f.key, { ...f, module: m.key }]),
  ),
) as Record<FunctieKey, FunctieVorm & { module: RechtenModule }>

/** De onderdelen die in de matrix van dit kanaal horen; vervallen sleutels vallen af. */
export function modulesVoorKanaal(kanaal: Kanaal): readonly ModuleDefinitie[] {
  return RECHTEN_CATALOGUS.filter(
    m => !('vervallen' in m && m.vervallen) && (m.kanalen as readonly Kanaal[]).includes(kanaal),
  )
}

/**
 * Platte lijst key+label. Bestaat voor de bestaande imports (Zod-schema's en de
 * oude matrices) en bevat daarom ook de vervallen sleutels — die staan nog in de
 * data en mogen niet als "onbekend" worden afgekeurd.
 */
export const RECHTEN_MODULES: ReadonlyArray<{ key: RechtenModule; label: string }> =
  RECHTEN_CATALOGUS.map(m => ({ key: m.key, label: m.label }))

// ─────────────────────────────────────────────────────────────────────────────
// De opgeslagen vorm
// ─────────────────────────────────────────────────────────────────────────────

/** De oude, platte vorm (v1). Blijft bestaan zolang de spiegelkolommen bestaan. */
export type RechtenSet = Partial<Record<RechtenModule, ModuleRechten | null>>

/**
 * Tri-state per functie:
 *  - `true`    → toekennen
 *  - `false`   → expliciet afnemen (wint van de afdeling én van `inbegrepenVanaf`)
 *  - afwezig   → erven van de laag eronder
 *
 * Bewust een record en geen lijst: met een lijst kun je een functie die de
 * afdeling toekent niet bij één persoon weghalen.
 */
export type FunctieSet = Partial<Record<FunctieKey, boolean>>

export type KanaalRechten = {
  /** `null` = expliciet geen, afwezig = erven. Die twee zijn hier niet hetzelfde. */
  modules: RechtenSet
  functies: FunctieSet
}

export type RechtenDocument = {
  versie: 2
  desktop: KanaalRechten
  mobiel: KanaalRechten
}

const MODULE_KEYS = new Set<string>(RECHTEN_CATALOGUS.map(m => m.key))
const FUNCTIE_KEYS = new Set<string>(Object.keys(FUNCTIE_INDEX))

/**
 * De drie sleutels die in v1 als module waren vermomd terwijl het schakelaars
 * waren. Bij het lezen van oude data worden ze functies.
 */
const V1_SCHAKELAARS: Record<string, readonly FunctieKey[]> = {
  wagenpark_prive: ['wagenpark.prive_ritten', 'wagenpark.werktijden'],
  alle_taken: ['mijn_taken.alle_zien'],
  inkoopfacturen_alle: ['inkoopfacturen.zonder_project'],
}

/** Sleutels die niet meer in een kanaalset thuishoren omdat ze functies zijn geworden. */
const NIET_MEER_ALS_MODULE = new Set<string>([...Object.keys(V1_SCHAKELAARS), 'houtrotherstel'])

export function leegKanaal(): KanaalRechten {
  return { modules: {}, functies: {} }
}

function leesKanaal(raw: unknown): KanaalRechten {
  const uit = leegKanaal()
  if (!raw || typeof raw !== 'object') return uit

  const bron = raw as { modules?: unknown; functies?: unknown }
  if (bron.modules && typeof bron.modules === 'object') {
    for (const [k, v] of Object.entries(bron.modules as Record<string, unknown>)) {
      if (!MODULE_KEYS.has(k)) continue
      if (v === null) { (uit.modules as Record<string, unknown>)[k] = null; continue }
      if (v === 'lezen' || v === 'schrijven' || v === 'beheren') {
        (uit.modules as Record<string, unknown>)[k] = v
      }
    }
  }
  if (bron.functies && typeof bron.functies === 'object') {
    for (const [k, v] of Object.entries(bron.functies as Record<string, unknown>)) {
      if (FUNCTIE_KEYS.has(k) && typeof v === 'boolean') {
        (uit.functies as Record<string, unknown>)[k] = v
      }
    }
  }
  return uit
}

/** Zet de oude platte vorm om naar twee kanalen. */
function leesV1(raw: unknown): RechtenDocument {
  const desktop = leegKanaal()
  const mobiel = leegKanaal()
  if (!raw || typeof raw !== 'object') return { versie: 2, desktop, mobiel }

  const mobieleModules = new Set<string>(modulesVoorKanaal('mobiel').map(m => m.key))

  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    // De schakelaars worden functies. Elk niet-leeg niveau telt als "aan": in
    // productie staan ze op 'lezen' én op 'schrijven', en beide betekenden ja.
    const functies = V1_SCHAKELAARS[k]
    if (functies) {
      if (v) for (const f of functies) (desktop.functies as Record<string, boolean>)[f] = true
      continue
    }
    if (NIET_MEER_ALS_MODULE.has(k) || !MODULE_KEYS.has(k)) continue

    const niveau = v === null ? null
      : (v === 'lezen' || v === 'schrijven' || v === 'beheren') ? v
      : undefined
    if (niveau === undefined) continue

    ;(desktop.modules as Record<string, unknown>)[k] = niveau
    // Mobiel erft alleen wat op /m bestaat. Dat houdt de huidige situatie intact
    // (materieelbeheer is het enige recht dat op /m vandaag echt iets doet) zonder
    // iets nieuws open te zetten.
    if (mobieleModules.has(k)) (mobiel.modules as Record<string, unknown>)[k] = niveau
  }

  return { versie: 2, desktop, mobiel }
}

/**
 * Lees de opgeslagen rechten. Begrijpt de nieuwe vorm (v2) én de oude platte vorm,
 * en gooit nooit: een sleutel die uit de catalogus verdwijnt mag geen storing geven.
 *
 * @param raw  de v2-kolom (`rechten`)
 * @param oud  de v1-spiegel (`standaard_rechten` / `rechten_override`), gebruikt
 *             zolang de v2-kolom nog leeg is
 */
export function leesRechtenDocument(raw: unknown, oud?: unknown): RechtenDocument {
  if (raw && typeof raw === 'object') {
    const bron = raw as { versie?: unknown; desktop?: unknown; mobiel?: unknown }
    if (bron.versie === 2) {
      return { versie: 2, desktop: leesKanaal(bron.desktop), mobiel: leesKanaal(bron.mobiel) }
    }
    if (Object.keys(bron).length > 0) return leesV1(raw)
  }
  return leesV1(oud)
}

/** Afdelingsstandaard met de persoonlijke override eroverheen. */
export function mergeKanaal(std: KanaalRechten, ovr: KanaalRechten): KanaalRechten {
  const modules: RechtenSet = { ...std.modules }
  for (const [k, v] of Object.entries(ovr.modules)) {
    // `null` telt mee: dat is "expliciet geen", niet "niet ingevuld".
    if (v !== undefined) (modules as Record<string, unknown>)[k] = v
  }
  const functies: FunctieSet = { ...std.functies }
  for (const [k, v] of Object.entries(ovr.functies)) {
    if (typeof v === 'boolean') (functies as Record<string, unknown>)[k] = v
  }
  return { modules, functies }
}

/** Zet een kanaalset terug om naar de platte v1-vorm, voor de spiegelkolommen. */
export function alsPlatteSet(k: KanaalRechten): RechtenSet {
  const uit: RechtenSet = { ...k.modules }
  for (const [sleutel, functies] of Object.entries(V1_SCHAKELAARS)) {
    if (functies.some(f => k.functies[f])) (uit as Record<string, unknown>)[sleutel] = 'lezen'
  }
  return uit
}
