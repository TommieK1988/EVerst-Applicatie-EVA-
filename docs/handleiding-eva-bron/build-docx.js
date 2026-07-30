/* Handleiding EVA — Word-generator (huisstijl Everts) */
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
  ImageRun, PageBreak, TableOfContents, LevelFormat, Header, Footer,
  PageNumber, VerticalAlign, PositionalTab, PositionalTabAlignment,
  PositionalTabLeader,
} = require('docx');

/* ── Huisstijl ── */
const GREEN      = '009439'; // brand-500 primair
const GREEN_DEEP = '007530'; // brand-600
const GREEN_DARK = '0A5E28'; // brand-700
const GREEN_950  = '013A20';
const LIME       = '61AC2B';
const INK        = '1F2933'; // brand-dark
const TINT       = 'ECFAF0'; // brand-50
const WARN_BG    = 'FFF6E6';
const WARN_BAR   = 'E39A1C';
const SHOT_BG    = 'F1F4F5';
const GREY       = '5B6670';
const BORDER     = 'D9DFE3';
const FONT = 'Calibri';

const CONTENT_W = 9720;

/* ── Helpers ── */
const kicker = (t) => new Paragraph({
  spacing: { before: 60, after: 40 },
  children: [new TextRun({ text: t.toUpperCase(), color: GREEN, bold: true, size: 16, characterSpacing: 30, font: FONT })],
});

const para = (runs, opts = {}) => new Paragraph({
  spacing: { after: 120, line: 276 },
  children: (Array.isArray(runs) ? runs : [new TextRun({ text: runs, size: 21, font: FONT, color: '2A3138' })]),
  ...opts,
});

const t = (text, o = {}) => new TextRun({ text, size: 21, font: FONT, color: '2A3138', ...o });
const b = (text, o = {}) => new TextRun({ text, size: 21, font: FONT, color: INK, bold: true, ...o });

const bullets = (items) => items.map((it, i) => new Paragraph({
  bullet: { level: 0 },
  spacing: { after: 60, line: 264 },
  children: Array.isArray(it) ? it : [t(it)],
}));

function calloutBox(label, bodyChildren, kind = 'tip') {
  const bg  = kind === 'warn' ? WARN_BG : TINT;
  const bar = kind === 'warn' ? WARN_BAR : GREEN;
  const labelColor = kind === 'warn' ? '9A6810' : GREEN_DEEP;
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: {
      top:    { style: BorderStyle.SINGLE, size: 2, color: bg },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: bg },
      right:  { style: BorderStyle.SINGLE, size: 2, color: bg },
      left:   { style: BorderStyle.SINGLE, size: 24, color: bar },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: bg, color: 'auto' },
      margins: { top: 120, bottom: 120, left: 180, right: 180 },
      children: [
        new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: label, bold: true, size: 18, color: labelColor, font: FONT, characterSpacing: 20 })] }),
        ...bodyChildren,
      ],
    })]})],
  });
}

function screenshotBox(caption) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    borders: {
      top:    { style: BorderStyle.DASHED, size: 6, color: 'B9C3C9' },
      bottom: { style: BorderStyle.DASHED, size: 6, color: 'B9C3C9' },
      left:   { style: BorderStyle.DASHED, size: 6, color: 'B9C3C9' },
      right:  { style: BorderStyle.DASHED, size: 6, color: 'B9C3C9' },
      insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
    },
    rows: [new TableRow({ children: [new TableCell({
      width: { size: CONTENT_W, type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: SHOT_BG, color: 'auto' },
      margins: { top: 200, bottom: 200, left: 180, right: 180 },
      verticalAlign: VerticalAlign.CENTER,
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
          children: [new TextRun({ text: 'Schermafbeelding', bold: true, size: 16, color: GREY, font: FONT, characterSpacing: 20 })] }),
        new Paragraph({ alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: caption, italics: true, size: 18, color: GREY, font: FONT })] }),
      ],
    })]})],
  });
}

/* Tabel met kop-rij in huisstijl. rows = array of [col1, col2] (of meer). */
function styledTable(headers, rows, widths) {
  const total = widths.reduce((a, x) => a + x, 0);
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: GREEN_DEEP, color: 'auto' },
      margins: { top: 70, bottom: 70, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, color: 'FFFFFF', size: 19, font: FONT })] })],
    })),
  });
  const bodyRows = rows.map((r, ri) => new TableRow({
    children: r.map((cell, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA },
      shading: { type: ShadingType.CLEAR, fill: ri % 2 ? 'F4F8F5' : 'FFFFFF', color: 'auto' },
      margins: { top: 60, bottom: 60, left: 120, right: 120 },
      children: [new Paragraph({ children: Array.isArray(cell) ? cell : [t(cell, { size: 19 })] })],
    })),
  }));
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: widths,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      left: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      right: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: BORDER },
    },
    rows: [headerRow, ...bodyRows],
  });
}

const spacer = (h = 120) => new Paragraph({ spacing: { after: h }, children: [] });

const h1 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text })] });
const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text })] });

/* ── Cover ── */
const logo = fs.readFileSync('logo.png');
const cover = [
  spacer(1400),
  new Paragraph({ alignment: AlignmentType.CENTER, children: [
    new ImageRun({ data: logo, type: 'png', transformation: { width: 96, height: 96 } }),
  ]}),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 160, after: 0 },
    children: [new TextRun({ text: 'EVERTS.', bold: true, size: 40, color: GREEN, font: FONT, characterSpacing: 40 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 20, after: 260 },
    children: [new TextRun({ text: 'EVA · EVERTS PLATFORM', size: 16, color: GREY, font: FONT, characterSpacing: 60 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 60 },
    children: [new TextRun({ text: 'Handleiding EVA', bold: true, size: 68, color: INK, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 320 },
    children: [new TextRun({ text: 'Praktische basisgids voor alle medewerkers', size: 26, color: GREEN_DEEP, font: FONT })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: LIME, space: 1 } }, children: [] }),
  spacer(300),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 },
    children: [new TextRun({ text: 'Van aanvraag tot oplevering — alles op één plek', italics: true, size: 22, color: GREY, font: FONT })] }),
  spacer(900),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 },
    children: [ new TextRun({ text: 'Versie 1.0', bold: true, size: 20, color: INK, font: FONT }),
                new TextRun({ text: '   ·   28 juli 2026   ·   Levend document', size: 20, color: GREY, font: FONT }) ] }),
  new Paragraph({ alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'Everts Groep · Enschede', size: 18, color: GREY, font: FONT })] }),
  new Paragraph({ children: [new PageBreak()] }),
];

/* ── Inhoud (TOC) ── */
const toc = [
  new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: 'Inhoud', bold: true, size: 40, color: GREEN_DEEP, font: FONT })] }),
  new TableOfContents('Inhoud', { hyperlink: true, headingStyleRange: '1-2' }),
  new Paragraph({ children: [new PageBreak()] }),
];

/* ── Inhoudssecties ── */
const body = [];
const push = (...els) => els.forEach(e => body.push(e));

/* 1. Introductie */
push(
  h1('1. Introductie — wat is EVA?'),
  para([ b('EVA'), t(' is het centrale bedrijfsplatform van Everts Groep. Alles wat met een klus te maken heeft staat erin en is met elkaar verbonden: van de eerste aanvraag van een klant tot de laatste factuur.') ]),
  kicker('Wat vind je in EVA'),
  ...bullets([
    [ b('Het hoofdproces'), t(' — van aanvraag, via offerte en opdracht, tot oplevering en factuur.') ],
    [ b('Planning'), t(' — wie werkt wanneer op welk project, plus de bedrijfsagenda.') ],
    [ b('Relaties'), t(' — klanten, contactpersonen en particulieren.') ],
    [ b('Financieel'), t(' — facturen, uren en managementoverzichten.') ],
    [ b('Apps'), t(' — calculatie (EvertsCalc), formulieren, actielijsten, wagenpark en KAM/VGM.') ],
  ]),
  para([ t('Je hoeft niet alles te gebruiken. De meeste mensen werken vooral in één of twee onderdelen — de binnendienst bijvoorbeeld in Aanvragen en Offertes, de buitendienst in Planning en Werkbonnen. Wat je ziet hangt af van je '), b('rechten'), t(' (zie hoofdstuk 6).') ]),
  screenshotBox('Het EVA-startscherm met de zijbalk links en het overzicht met widgets.'),
  spacer(),
);

/* 2. Aan de slag */
push(
  h1('2. Aan de slag — inloggen en eerste keer'),
  h2('Inloggen'),
  para([ t('EVA gebruikt je '), b('Everts Microsoft-account'), t(' (je @everts.chat-adres). Je maakt dus géén apart wachtwoord aan voor EVA.') ]),
  ...bullets([
    [ b('1.'), t('  Open EVA in je browser (of tik op het EVA-pictogram op je telefoon).') ],
    [ b('2.'), t('  Klik op '), b('Inloggen met Microsoft'), t('.') ],
    [ b('3.'), t('  Log in met je Everts-account, net als bij Outlook of Teams.') ],
    [ b('4.'), t('  Je komt automatisch op het '), b('Overzicht'), t(' terecht.') ],
  ]),
  calloutBox('Nog geen toegang?', [ para([ t('EVA werkt alleen met accounts die de beheerder heeft vrijgegeven. Zie je "Je account heeft geen toegang tot EVA", neem dan contact op met je beheerder. Je kunt jezelf niet zelf registreren.') ], { spacing: { after: 0 } }) ]),
  spacer(60),
  screenshotBox('Het inlogscherm met de knop "Inloggen met Microsoft".'),
  h2('De eerste keer instellen'),
  para('Handig om meteen te doen na je eerste inlog — klik linksonder op je naam/avatar → Mijn account:'),
  ...bullets([
    [ b('Profielfoto'), t(' — zichtbaar in de app en bij berichten.') ],
    [ b('Handtekening'), t(' — wordt gebruikt op werkbonnen, offertes en documenten.') ],
    [ b('Notificatievoorkeuren'), t(' — per categorie kiezen: melding in de app en/of per e-mail.') ],
  ]),
  h2('Uitloggen en sessies'),
  para('Je blijft ingelogd tijdens de werkdag; aan het eind van de dag word je automatisch uitgelogd. Zelf uitloggen doe je via Mijn account → Inloggegevens.'),
  spacer(),
);

/* 3. Interface */
push(
  h1('3. Overzicht van de interface'),
  para('EVA heeft drie vaste onderdelen: de zijbalk links, de topbalk boven, en het werkgebied in het midden.'),
  screenshotBox('EVA met de zijbalk (links) en de topbalk (boven) gemarkeerd.'),
  h2('De zijbalk (navigatie)'),
  para('De zijbalk is je hoofdmenu. De onderdelen zijn gegroepeerd:'),
  styledTable(['Groep', 'Wat vind je er'], [
    ['Hoofdproces', 'Aanvragen, Offertes, Opdrachten, Servicedesk, Afgesloten'],
    ['Planning', 'Projectplanning, Medewerkerplanning, Bedrijfsagenda'],
    ['Beheer', 'Relaties, Medewerkers, Wagenpark, KAM/VGM'],
    ['Financieel', 'Facturen, Uren, Management'],
    ['Apps', 'Formulieren, Actielijsten, EvertsCalc'],
  ], [2400, 7320]),
  spacer(80),
  ...bullets([
    [ t('Je ziet '), b('alleen de onderdelen waar je recht op hebt'), t(' — jouw menu kan korter zijn dan dat van een collega.') ],
    [ t('Klik op het '), b('speldje-icoon'), t(' om de zijbalk vast te zetten of smal te maken. Een smalle zijbalk klapt uit zodra je er met de muis overheen gaat.') ],
    [ t('Open je een '), b('dossier'), t(', dan verandert de zijbalk tijdelijk in de tabbladen van dat dossier. Met '), b('Terug naar overzicht'), t(' ga je terug naar het hoofdmenu.') ],
    [ t('Onderaan staan '), b('Bedrijfsinstellingen'), t(' en je '), b('account'), t('.') ],
  ]),
  h2('De topbalk'),
  para('Rechtsboven vind je, van links naar rechts:'),
  ...bullets([
    [ b('Zoeken'), t(' — typ een klantnaam, project of dossiernummer en spring er direct heen. Sneltoets '), b('Ctrl + K'), t(' (of ⌘ + K op Mac).') ],
    [ b('Sterretje — "Wat is nieuw"'), t(' — nieuwe functies. Een rood stipje betekent ongelezen nieuws.') ],
    [ b('?-knop — Handleiding'), t(' — uitleg over de pagina waar je nu bent.') ],
    [ b('Zon/maan'), t(' — wissel tussen licht en donker thema.') ],
    [ b('Belletje'), t(' — je meldingen (notificaties).') ],
  ]),
  h2('Het Overzicht (startscherm)'),
  para('Klik op het EVERTS-logo linksboven om altijd terug te keren naar je Overzicht. Daar staan je persoonlijke widgets: openstaande acties, jouw aanvragen, offertes, opdrachten en servicedesk-dossiers, en de agenda.'),
  screenshotBox('Het Overzicht met de persoonlijke widgets.'),
  spacer(),
);

/* 4. Kernfuncties */
push(
  h1('4. Kernfuncties'),
  h2('4.1  Het hoofdproces: aanvraag → offerte → opdracht'),
  para('Dit is het hart van EVA. Een klus doorloopt vaste stappen, en bij elke stap groeit hetzelfde dossier mee:'),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [
    new TextRun({ text: 'Aanvraag → Offerte → Opdracht → Uitvoering → Oplevering → Factuur → Afgesloten', bold: true, size: 20, color: GREEN_DEEP, font: FONT }),
  ]}),
  para('Je vindt deze stappen als aparte menu-items onder Hoofdproces. Het is telkens hetzelfde dossier dat verder schuift; je hoeft niets over te typen.'),
  new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: 'Een nieuwe aanvraag maken', bold: true, size: 22, color: INK, font: FONT })] }),
  ...bullets([
    [ b('1.'), t('  Klik in de zijbalk op '), b('Aanvragen'), t('.') ],
    [ b('2.'), t('  Klik rechtsboven op '), b('Nieuwe aanvraag'), t('.') ],
    [ b('3.'), t('  Vul de gegevens in. Velden met een * zijn verplicht: '), b('Opdrachtgever*'), t(' (typ en kies, of "+ Nieuwe opdrachtgever"), '), b('Omschrijving*'), t(', Contactpersoon, '), b('Werkmaatschappij*'), t(', '), b('Categorie*'), t(', '), b('Adres*'), t(' (postcode, straat + huisnummer, plaats). Optioneel: Referentie, Aanvraagdatum, Deadline, VvE-code.') ],
    [ b('4.'), t('  Klik op '), b('Opslaan'), t('.') ],
  ]),
  calloutBox('Tip', [ para('De projectnaam wordt automatisch opgebouwd als "Adres, Plaats — Omschrijving".', { spacing: { after: 0 } }) ]),
  spacer(60),
  screenshotBox('Het venster "Nieuwe aanvraag" met de basisgegevens.'),
  new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: 'Werken in een dossier — de tabbladen', bold: true, size: 22, color: INK, font: FONT })] }),
  para('Klik in een lijst op een dossier om het te openen. De zijbalk toont dan de tabbladen. De belangrijkste:'),
  styledTable(['Tabblad', 'Waarvoor'], [
    ['Informatie', 'Kerngegevens, status, rollen (calculator/projectleider), datums'],
    ['Bestanden', 'Documenten en foto’s; hier stel je ook documenten op'],
    ['Calculatie', 'De begroting/berekening van de klus'],
    ['Werkbegroting', 'De interne begroting van een opdracht'],
    ['Planning', 'Ingeplande dagen en mensen'],
    ['Acties', 'Taken die bij dit dossier horen'],
    ['Meerwerk', 'Extra werk t.o.v. de offerte (met klantakkoord)'],
    ['Oplevering', 'Opleverpunten en de oplevering zelf'],
    ['Financieel', 'Kosten en opbrengsten per bewakingscode'],
  ], [2400, 7320]),
  spacer(80),
  calloutBox('Let op', [ para('Niet elk tabblad staat er altijd. Sommige verschijnen pas in een latere fase of als een optie aanstaat (bijvoorbeeld Houtrot of VCA).', { spacing: { after: 0 } }) ]),
  new Paragraph({ spacing: { before: 120, after: 80 }, children: [new TextRun({ text: 'Van aanvraag naar offerte, en naar opdracht', bold: true, size: 22, color: INK, font: FONT })] }),
  ...bullets([
    [ t('Vanuit de '), b('Calculatie'), t(' maak je een offerte met '), b('Offerte aanmaken'), t('. Je kunt ook een '), b('Interne begroting'), t(' maken (zonder dat het meteen een klantofferte wordt).') ],
    [ t('Zodra de klant akkoord geeft, wordt de offerte een '), b('Opdracht'), t('. De koppeling naar de geaccepteerde offerteversie blijft altijd bewaard.') ],
    [ t('Een afgeronde klus verhuist naar '), b('Afgesloten'), t('. Afgesloten dossiers zijn alleen-lezen.') ],
  ]),
  calloutBox('Controleer in de app', [ para('De exacte knopvolgorde om een offerte te versturen en op "verzonden" te zetten verschilt licht per situatie. Volg de knoppen in beeld en de ?-uitleg op de Offerte-pagina.', { spacing: { after: 0 } }) ], 'warn'),

  h2('4.2  Relaties'),
  para('Onder Relaties (in Beheer) staan je klanten en contacten: zakelijke relaties, contactpersonen (binnen een zakelijke relatie) en particulieren.'),
  ...bullets([
    [ t('Een relatie aanmaken kan via '), b('Relaties → Nieuwe relatie'), t('.') ],
    [ t('Of direct tijdens een aanvraag, met '), b('+ Nieuwe opdrachtgever'), t('.') ],
  ]),
  para('Je legt onder meer vast: naam, adres, contactgegevens en (bij zakelijk) gegevens zoals KvK en of een inkoopordernummer verplicht is op de factuur.'),

  h2('4.3  Offertes en calculatie (EvertsCalc)'),
  para('EvertsCalc (onder Apps) is de rekenmodule. Je bouwt begrotingen op met posten voor arbeid, materiaal, onderaanneming en overige kosten, en zet die om in een nette klantofferte.'),
  ...bullets([
    [ b('Calculaties'), t(' — de berekeningen.') ],
    [ b('Offertes'), t(' — de klantoffertes (met "Nieuwe offerte").') ],
    [ b('Bibliotheek'), t(' — herbruikbare recepten, schilderwerk-behandelingen en materialen.') ],
  ]),
  para('Een offerte wordt als nette PDF gemaakt en per e-mail (via Outlook) naar de klant gestuurd. Zolang een offerte concept is, staat er een CONCEPT-stempel overheen.'),
  calloutBox('Tip', [ para('In het hoofdproces maak je een offerte meestal vanuit het dossier (via de Calculatie-tab). De losse EvertsCalc-schermen gebruik je voor het rekenwerk en de bibliotheek.', { spacing: { after: 0 } }) ]),

  h2('4.4  Planning en werkbonnen'),
  para('Onder Planning vind je drie weergaven:'),
  ...bullets([
    [ b('Projectplanning'), t(' — welke projecten draaien wanneer.') ],
    [ b('Medewerkerplanning'), t(' — wie is wanneer waar ingepland (eigen mensen én ingehuurde krachten).') ],
    [ b('Bedrijfsagenda'), t(' — vrije dagen, feestdagen en bedrijfsbrede afspraken.') ],
  ]),
  para([ b('Werkbonnen'), t(' zijn de dagelijkse uitvoeringsbonnen voor de buitendienst. Als monteur vind je jouw bonnen onder '), b('Mijn werkbonnen'), t('. Daarop registreer je je uren en (waar van toepassing) materiaal en foto’s. Werkbonnen werken ook op je telefoon.') ]),
  screenshotBox('De Medewerkerplanning met ingeplande dagen.'),

  h2('4.5  Servicedesk (storingen en regie)'),
  para('De Servicedesk is een aparte ingang voor storingen en regie-/serviceklussen — werk dat níét het hele offertetraject doorloopt. Je maakt een servicedesk-dossier aan, wijst het toe en handelt het af. Waar nodig maak je er alsnog een offerte bij met "Offerte maken"; dan verschijnt ook het Calculatie-tabblad.'),

  h2('4.6  Formulieren en Actielijsten'),
  para([ b('Formulieren'), t(' (onder Apps) — digitale formulieren die je zelf samenstelt en laat invullen, bijvoorbeeld een keuring of controlelijst. "Overzicht" toont ingevulde formulieren; "Sjablonen" zijn de formulieren die je ontwerpt. Ook op de telefoon in te vullen.') ]),
  para([ b('Actielijsten'), t(' (onder Apps) — sjablonen met een vaste reeks taken die je aan een dossier koppelt, zodat niets vergeten wordt. In een dossier komen die taken terug op het Acties-tabblad; je persoonlijke taken staan op je Overzicht.') ]),

  h2('4.7  Facturen en Management'),
  ...bullets([
    [ b('Facturen'), t(' (onder Financieel) — het overzicht van verkoopfacturen.') ],
    [ b('Uren'), t(' — de urenregistratie.') ],
    [ b('Management'), t(' — stuuroverzichten: Dashboard, Lopende werken, Gereed werken, Werkvoorraad, Verkoop, Calculators en Historie. Vooral voor leidinggevenden, zichtbaar op basis van je rechten.') ],
  ]),

  h2('4.8  Vraag EVA'),
  para('Met Vraag EVA stel je in gewone taal een vraag over de eigen bedrijfsdata (bijvoorbeeld over projecten of relaties) en krijg je direct antwoord — handig om iets snel op te zoeken zonder door de schermen te klikken.'),
  calloutBox('Controleer in de app', [ para('Of Vraag EVA, Bronnen en Bibliotheek voor iedereen zichtbaar zijn. Ze staan niet standaard in de hoofdgroepen van de zijbalk en kunnen per rol verschillen.', { spacing: { after: 0 } }) ], 'warn'),
  spacer(),
);

/* 5. Instellingen */
push(
  h1('5. Instellingen en profiel'),
  h2('Mijn account (persoonlijk)'),
  para('Klik linksonder op je naam/avatar → Mijn account. Hier regel je je eigen zaken:'),
  ...bullets([
    [ b('Profielfoto'), t(' — zichtbaar in de app en bij berichten.') ],
    [ b('Persoonsgegevens'), t(' — naam en contactgegevens zoals ze in EVA staan.') ],
    [ b('Handtekening'), t(' — gebruikt op werkbonnen, offertes en documenten.') ],
    [ b('Inloggegevens'), t(' — wachtwoord, e-mailadres en actieve sessies.') ],
    [ b('Notificaties'), t(' — per categorie: melding in de app en/of per e-mail.') ],
  ]),
  screenshotBox('De pagina Mijn account met de secties Profiel, Beveiliging en Meldingen.'),
  h2('Bedrijfsinstellingen (voor beheerders)'),
  para('Onderaan de zijbalk staat Bedrijfsinstellingen. Dit is vooral voor beheerders en bepaalt hoe EVA voor het hele bedrijf werkt. Enkele voorbeelden:'),
  ...bullets([
    [ b('Bedrijfsgegevens & Huisstijl'), t(' — logo, kleuren, adres.') ],
    [ b('Gebruikers & rechten'), t(' — wie mag wat (zie hoofdstuk 6).') ],
    [ b('BTW-tarieven, Kostensoorten, Uursoorten & tarieven, Betalingscondities'), t(' — de rekengrondslagen.') ],
    [ b('Offerte-opmaak & -mail, Algemene voorwaarden'), t(' — hoe offertes eruitzien en verstuurd worden.') ],
    [ b('Dossiercategorieën, Dossier-tabbladen'), t(' — welke soorten dossiers en welke tabs er zijn.') ],
    [ b('Functies & afdelingen, CAO, Medewerker-attributen'), t(' — personeelsinstellingen.') ],
    [ b('Integraties'), t(' — koppelingen met externe systemen (o.a. Bouw7, Microsoft 365).') ],
  ]),
  calloutBox('Geen toegang?', [ para('Zie je Bedrijfsinstellingen niet, of kun je iets niet openen? Dan heb je daar geen rechten voor. Dat is normaal — vraag je beheerder als je iets nodig hebt.', { spacing: { after: 0 } }) ]),
  spacer(),
);

/* 6. Rollen & rechten */
push(
  h1('6. Rollen, rechten en samenwerken'),
  para('EVA werkt met rechten per module. Per onderdeel (bijvoorbeeld Aanvragen, Planning, Facturen, Wagenpark) kan een gebruiker:'),
  ...bullets([
    [ b('niets'), t(' zien — het onderdeel staat dan niet in jouw zijbalk;') ],
    [ b('lezen'), t(' — bekijken, maar niet wijzigen; of') ],
    [ b('muteren'), t(' — bekijken én aanpassen.') ],
  ]),
  para('Daarom ziet niet iedereen hetzelfde menu. Rechten worden door een beheerder ingesteld via Bedrijfsinstellingen → Gebruikers & rechten.'),
  h2('Rollen binnen een dossier'),
  para('Los van de rechten heeft een dossier rollen: wie is bijvoorbeeld de calculator en wie de projectleider. Die stel je in op het Informatie-tabblad. Rollen bepalen onder andere welke dossiers op jouw persoonlijke Overzicht verschijnen (bijvoorbeeld "mijn opdrachten" = dossiers waar jij projectleider bent).'),
  h2('Samenwerken'),
  ...bullets([
    'Wijzigingen die jij maakt, zijn direct voor collega’s zichtbaar — jullie werken in dezelfde live-gegevens.',
    'Via meldingen (het belletje) en gekoppelde taken blijf je op de hoogte van wat er van jou wordt verwacht.',
  ]),
  spacer(),
);

/* 7. FAQ */
const faq = [
  ['Ik kan niet inloggen / "geen toegang".', 'Je account is nog niet vrijgegeven voor EVA. Neem contact op met je beheerder. Je logt in met je Everts Microsoft-account — er is geen apart EVA-wachtwoord.'],
  ['Waarom zie ik minder menu-items dan een collega?', 'De zijbalk toont alleen onderdelen waar je rechten voor hebt. Dat is normaal.'],
  ['Hoe kom ik snel bij een project of klant?', 'Gebruik de zoeker rechtsboven (of Ctrl/⌘ + K) en typ een naam of nummer.'],
  ['Waar vind ik mijn taken?', 'Op je Overzicht (startscherm) en, per dossier, op het Acties-tabblad.'],
  ['Ik kan een dossier niet aanpassen.', 'Waarschijnlijk staat het op Afgesloten (alleen-lezen) of heb je alleen leesrechten voor dat onderdeel.'],
  ['Kan ik EVA op mijn telefoon gebruiken?', 'Ja. Vooral werkbonnen, uren en formulieren zijn voor mobiel gemaakt. Je logt in via hetzelfde Microsoft-account.'],
  ['Waar zie ik wat er nieuw is?', 'Klik op het sterretje rechtsboven. Een rood stipje betekent ongelezen nieuws.'],
  ['Ik snap een scherm niet.', 'Klik op de ?-knop rechtsboven voor uitleg over die pagina.'],
];
push(
  h1('7. Veelgestelde vragen (FAQ)'),
  styledTable(['Vraag', 'Antwoord'], faq.map(([q, a]) => [ [b(q, { size: 19 })], a ]), [3200, 6520]),
  spacer(),
);

/* 8. Troubleshooting */
const ts = [
  ['Melding "geen toegang" bij inloggen', 'Account niet vrijgegeven. Contact opnemen met de beheerder.'],
  ['Onverwacht uitgelogd', 'EVA logt aan het eind van de werkdag automatisch uit. Log opnieuw in met Microsoft.'],
  ['Pagina laadt niet of oogt vreemd', 'Ververs de pagina (F5). Helpt dat niet, log uit en weer in.'],
  ['Ik zie oude gegevens', 'Ververs de pagina. Sommige overzichten uit gekoppelde systemen (zoals Bouw7) worden op vaste momenten bijgewerkt.'],
  ['Ik mis een knop of tabblad', 'Hoort mogelijk bij een latere fase, staat achter een optie (toggle), of je hebt er geen rechten voor.'],
  ['Offerte-PDF toont CONCEPT-stempel', 'De offerte staat nog op concept. Na definitief maken/versturen verdwijnt het stempel.'],
  ['Afgesloten dossier niet te wijzigen', 'Afgesloten dossiers zijn bewust alleen-lezen.'],
];
push(
  h1('8. Problemen oplossen'),
  styledTable(['Probleem', 'Wat te doen'], ts, [3600, 6120]),
  spacer(80),
  para('Kom je er niet uit? Gebruik de ?-knop op de pagina, of neem contact op met je beheerder of de sleutelgebruiker binnen je afdeling.'),
  spacer(),
);

/* 9. Woordenlijst */
const gloss = [
  ['EVA', 'Het centrale platform van Everts Groep; de app die je gebruikt.'],
  ['Dossier', 'Eén klus/project dat de fases aanvraag → offerte → opdracht → oplevering doorloopt.'],
  ['Aanvraag', 'De eerste registratie van een klantvraag; begin van het hoofdproces.'],
  ['Offerte', 'Het prijsvoorstel aan de klant (als PDF, per e-mail verstuurd).'],
  ['Opdracht', 'Een geaccepteerde offerte die in uitvoering gaat.'],
  ['Servicedesk', 'Aparte ingang voor storingen en regie-/serviceklussen.'],
  ['Calculatie', 'De berekening/begroting van een klus (in EvertsCalc).'],
  ['Werkbegroting', 'De interne begroting van een opdracht.'],
  ['Meerwerk', 'Extra werk t.o.v. de offerte; vereist klantakkoord.'],
  ['Werkbon', 'Dagelijkse uitvoeringsbon voor de buitendienst (uren, materiaal, foto’s).'],
  ['Oplevering / opleverpunt', 'Afronding met de klant; opleverpunten zijn restpunten die nog moeten gebeuren.'],
  ['Bewakingscode', 'Code waarop kosten en opbrengsten van een (deel van een) project worden bijgehouden.'],
  ['Werkmaatschappij', 'Het bedrijfsonderdeel van Everts waaronder de klus valt.'],
  ['Toggle', 'Aan/uit-schakelaar die een extra tabblad of functie toont (bijv. Houtrot, VCA).'],
  ['Rechten (lezen/muteren)', 'Wat je per onderdeel mag: bekijken of ook wijzigen.'],
  ['Rol', 'Je functie binnen een dossier, bijv. calculator of projectleider.'],
  ['KAM/VGM', 'Kwaliteit, Arbo & Milieu / Veiligheid, Gezondheid & Milieu — o.a. VCA en toolboxen.'],
  ['Bouw7', 'Extern systeem waarmee EVA gegevens uitwisselt.'],
];
push(
  h1('9. Verklarende woordenlijst'),
  styledTable(['Term', 'Betekenis'], gloss.map(([term, d]) => [ [b(term, { size: 19 })], d ]), [2800, 6920]),
  spacer(160),
  new Paragraph({ alignment: AlignmentType.CENTER, border: { top: { style: BorderStyle.SINGLE, size: 6, color: BORDER, space: 8 } },
    spacing: { before: 200 },
    children: [new TextRun({ text: 'Deze handleiding beschrijft de meestgebruikte functies. EVA wordt regelmatig uitgebreid — houd het sterretje "Wat is nieuw" in de gaten voor de laatste wijzigingen.', italics: true, size: 18, color: GREY, font: FONT })] }),
);

/* ── Document ── */
const doc = new Document({
  creator: 'Everts Groep', title: 'Handleiding EVA', description: 'Gebruikershandleiding EVA',
  features: { updateFields: true },
  styles: {
    default: { document: { run: { font: FONT, size: 21, color: '2A3138' } } },
    paragraphStyles: [
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 32, bold: true, color: GREEN_DEEP },
        paragraph: { spacing: { before: 320, after: 140 }, keepNext: true,
          border: { bottom: { style: BorderStyle.SINGLE, size: 10, color: LIME, space: 6 } } } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: GREEN_DARK },
        paragraph: { spacing: { before: 220, after: 90 }, keepNext: true } },
    ],
  },
  sections: [
    /* Cover — geen kop/voettekst */
    { properties: { page: { margin: { top: 1200, bottom: 1200, left: 1080, right: 1080 } } }, children: cover },
    /* Inhoud + body — met voettekst */
    {
      properties: { page: { margin: { top: 1440, bottom: 1440, left: 1080, right: 1080 } } },
      footers: { default: new Footer({ children: [ new Paragraph({
        tabStops: [], border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER, space: 6 } },
        children: [
          new TextRun({ text: 'Handleiding EVA · Everts Groep', size: 16, color: GREY, font: FONT }),
          new TextRun({ children: [ new PositionalTab({ alignment: PositionalTabAlignment.RIGHT, relativeTo: 'margin', leader: PositionalTabLeader.NONE }) ] }),
          new TextRun({ text: 'Pagina ', size: 16, color: GREY, font: FONT }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY, font: FONT }),
        ] }) ] }) },
      children: [...toc, ...body],
    },
  ],
});

Packer.toBuffer(doc).then(buf => { fs.writeFileSync('Handleiding-EVA.docx', buf); console.log('written', buf.length, 'bytes'); });
