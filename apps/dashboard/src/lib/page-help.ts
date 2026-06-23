export type HelpSection = {
  title: string
  body: string
}

export type PageHelp = {
  title: string
  description: string
  sections?: HelpSection[]
}

const PAGE_HELP: Array<[RegExp, PageHelp]> = [

  // ── Overzicht ──────────────────────────────────────────────────────────
  [/^\/$/, {
    title: 'Overzicht',
    description: 'Je persoonlijke startpagina in EVA. Hier zie je jouw openstaande taken, de dossiers waar jij op staat, en de komende zeven agendapunten — alles gefilterd op jouw medewerkerscode.',
    sections: [
      { title: 'Mijn taken', body: 'De takenwidget toont openstaande acties die direct aan jou zijn toegewezen. Klik op een taak om naar de bijbehorende lijst of het dossier te gaan.' },
      { title: 'Mijn dossiers', body: 'Aanvragen, offertes en opdrachten waar jij als verantwoordelijke op staat verschijnen hier automatisch. Zo zie je in één oogopslag wat er van jou verwacht wordt.' },
      { title: 'Agenda', body: 'De zeven eerstvolgende plannings­items (±30 dagen) worden getoond op basis van jouw afdeling en medewerkerscode. Klik op een item voor meer details in de planningsmodule.' },
    ],
  }],

  // ── EVA ────────────────────────────────────────────────────────────────
  [/^\/vraag-eva$/, {
    title: 'Vraag EVA',
    description: 'De AI-assistent van het platform. Stel vragen in gewoon Nederlands over projecten, klanten, offertes, medewerkers of processen. EVA zoekt het antwoord in alle data van het platform en in de actieve kennisbronnen.',
    sections: [
      { title: 'Vragen stellen', body: 'Typ je vraag vrij in het chatvenster. Wees zo specifiek mogelijk: "Welke offertes van klant X staan nog open?" levert beter resultaat op dan "Offertes klant". EVA onthoudt de context van het gesprek.' },
      { title: 'Vervolgvragen', body: 'Je kunt direct doorvragen op een antwoord. EVA behoudt de context van het gesprek zolang de sessie open is.' },
      { title: 'Voorbeeldvragen', body: '"Wat zijn de openstaande bevindingen in het wagenpark?" · "Geef een samenvatting van aanvraag 2024-045." · "Hoeveel offerte­conversie hadden we vorige maand?" · "Welke medewerkers hebben een verlopen rijbewijs?"' },
      { title: 'Bronnen', body: 'EVA raadpleegt ook de kennisbronnen die je hebt toegevoegd via Bronnen. Voeg eigen documenten (CAO, productcatalogus, procedures) toe om EVA accurater te maken voor jouw specifieke situatie.' },
    ],
  }],

  [/^\/bronnen$/, {
    title: 'Bronnen',
    description: 'Beheer de kennisbronnen die EVA gebruikt naast de database. Voeg interne documenten, handleidingen of productinformatie toe zodat EVA specifiekere en nauwkeurigere antwoorden geeft.',
    sections: [
      { title: 'Bron toevoegen', body: 'Klik op "Bron toevoegen" en kies tussen een bestand (PDF, Word, tekst) of een URL. Na het uploaden verwerkt EVA de inhoud automatisch in haar kennisbank.' },
      { title: 'Bronnen beheren', body: 'Deactiveer een bron tijdelijk als de informatie verouderd is maar je hem nog niet wilt verwijderen. Verwijder bronnen die niet meer relevant zijn om de kwaliteit van antwoorden hoog te houden.' },
      { title: 'Aanbevolen bronnen', body: 'Voeg toe: je algemene voorwaarden, productcatalogi, prijslijsten, interne procedures, CAO-documenten en technische specificaties. Hoe meer relevante bronnen, hoe beter EVA presteert.' },
    ],
  }],

  [/^\/bibliotheek$/, {
    title: 'Bibliotheek',
    description: 'De inhoudsbibliotheek van EVA met herbruikbare teksten, sjablonen en standaarddocumenten. Gebruik dit voor consistente communicatie in offertes, e-mails en opdrachtbevestigingen.',
    sections: [
      { title: 'Sjablonen gebruiken', body: 'Sla veelgebruikte alinea\'s (introductieteksten, voorwaarden, dankwoord) op als sjabloon. In offertes en e-mails kies je het sjabloon via de tekstbibliothekknop.' },
      { title: 'Documenten', body: 'Beheer standaarddocumenten: algemene voorwaarden, garantiebewijzen, onderhoudsinstructies. Documenten zijn downloadbaar en koppelbaar aan dossiers.' },
    ],
  }],

  // ── Hoofdproces: Aanvragen ─────────────────────────────────────────────
  [/^\/aanvragen$/, {
    title: 'Aanvragen',
    description: 'Kanbanbord met alle binnenkomende aanvragen van klanten, gegroepeerd per status. Een aanvraag is het startpunt van het offertetraject — van eerste contact tot bevestigde opdracht.',
    sections: [
      { title: 'Kanban-kolommen', body: 'De kolommen tonen de statussen: Nieuw, Gekwalificeerd, Opname gepland, Gecalculeerd, Offerte verzonden, Geaccepteerd, Afgewezen en Vervallen. Sleep een kaart naar een andere kolom om de status direct te wijzigen.' },
      { title: 'Nieuwe aanvraag', body: 'Klik op het "+"-icoontje in de kolom "Nieuw" of op de knop "Nieuwe aanvraag". Vul minimaal klantgegevens, contactpersoon en aard van de werkzaamheden in.' },
      { title: 'Kaarten lezen', body: 'Elke kaart toont de klantnaam, omschrijving, verantwoordelijke medewerker en aanmaakdatum. Kleuren geven urgentie of type aan. Klik op een kaart voor het volledige dossier.' },
      { title: 'Filteren', body: 'Gebruik de zoekbalk of filterknoppen bovenaan het bord om op medewerker, klant of datum te filteren. Zo houd je overzicht bij een groot volume aan aanvragen.' },
    ],
  }],

  [/^\/aanvragen\/[^/]+\/[^/]+$/, {
    title: 'Aanvraag — detail',
    description: 'Detailpagina van een aanvraag met tabbladen voor alle aspecten: klantinformatie, bestanden, calculatie en planning. Dit is het centrale dossier waar alle activiteit rondom de aanvraag wordt vastgelegd.',
    sections: [
      { title: 'Tabblad Informatie', body: 'Bevat klantgegevens, locatie, omschrijving, urgentie en de verantwoordelijke medewerker. Wijzig de status via de statusknop rechtsboven — elke overgang wordt gelogd met datum en gebruiker.' },
      { title: 'Tabblad Bestanden', body: 'Upload foto\'s, tekeningen, opnamerapporten en correspondentie. Bestanden zijn direct koppelbaar aan de offerte of opdracht die uit deze aanvraag voortvloeit.' },
      { title: 'Tabblad Calculatie', body: 'Maak een calculatie aan op basis van de opname. De calculatie is de basis voor de offerte en bevat arbeidskosten, materiaalkosten, onderaanneming en overige kosten.' },
      { title: 'Status wijzigen', body: 'Gebruik de statusknop om de aanvraag door het proces te leiden. Bij afwijzing geef je altijd een reden op — dit is verplicht en wordt gebruikt voor conversieanalyse.' },
    ],
  }],

  [/^\/aanvragen\/[^/]+$/, {
    title: 'Aanvraag — detail',
    description: 'Detailpagina van een aanvraag. Je wordt automatisch doorgestuurd naar het tabblad Informatie.',
  }],

  // ── Hoofdproces: Offertes ─────────────────────────────────────────────
  [/^\/offertes$/, {
    title: 'Offertes',
    description: 'Kanbanbord met alle offertes gegroepeerd per status. Offertes ontstaan vanuit een aanvraag en doorlopen hun eigen traject van concept tot geaccepteerde opdracht.',
    sections: [
      { title: 'Kanban-kolommen', body: 'De kolommen tonen: Concept, Verzonden, Bekeken, Geaccepteerd, Afgewezen, In onderhandeling en Verlopen. Sleep een kaart om de status te wijzigen. Verlopen offertes worden automatisch verplaatst na de geldigheidsdatum.' },
      { title: 'Offerte aanmaken', body: 'Offertes worden aangemaakt vanuit de aanvraagpagina, niet direct hier. Navigeer naar de bijbehorende aanvraag en gebruik het tabblad Calculatie om een offerte te genereren.' },
      { title: 'Opvolging', body: 'Offertes met status "Verzonden" langer dan 7 dagen zonder reactie worden gemarkeerd. Klik op de kaart om een herinnering te versturen of de geldigheidsdatum te verlengen.' },
      { title: 'Versies', body: 'Elke offerte kan meerdere versies hebben. De geaccepteerde versie blijft juridisch bindend bewaard, ook als er later revisies zijn gemaakt.' },
    ],
  }],

  [/^\/offertes\/[^/]+\/[^/]+$/, {
    title: 'Offerte — detail',
    description: 'Detailpagina van een offerte met alle posten, versiegeschiedenis en communicatie met de klant. Hier beheer je de volledige levenscyclus van een offerte.',
    sections: [
      { title: 'Tabblad Informatie', body: 'Overzicht van klant, locatie, totaalbedrag, geldigheidsdatum en huidige status. Klik op "Offerte PDF" om een preview of download te genereren voor de klant.' },
      { title: 'Tabblad Meerwerk', body: 'Voeg meer- of minderwerk toe dat na de originele offerte is overeengekomen. Voor bedragen boven de drempel (€500 of 10% contractsom) is schriftelijk klantakkoord verplicht voordat je de post op "Geaccepteerd" zet.' },
      { title: 'Tabblad Bestanden', body: 'Alle bijlagen bij de offerte: tekeningen, foto\'s, correspondentie. Bestanden die je hier uploadt zijn beschikbaar in het klantportaal (indien actief).' },
      { title: 'Acceptatie verwerken', body: 'Na akkoord van de klant klik je op "Offerte accepteren". Vul de acceptatiemethode (digitaal/telefonisch/schriftelijk), datum en naam van de tekenbevoegde in. De offerte wordt automatisch omgezet naar een opdracht.' },
    ],
  }],

  [/^\/offertes\/[^/]+$/, {
    title: 'Offerte — detail',
    description: 'Detailpagina van een offerte. Je wordt automatisch doorgestuurd naar het tabblad Informatie.',
  }],

  // ── Hoofdproces: Opdrachten ────────────────────────────────────────────
  [/^\/opdrachten$/, {
    title: 'Opdrachten',
    description: 'Kanbanbord met alle bevestigde opdrachten gegroepeerd per status. Een opdracht ontstaat na acceptatie van een offerte en doorloopt het uitvoerings­proces tot afronding en facturatie.',
    sections: [
      { title: 'Kanban-kolommen', body: 'Statussen: Bevestigd, Gepland, In uitvoering, Opgeleverd onder voorbehoud, Opgeleverd, Gefactureerd en Afgerond. Een opdracht gaat automatisch naar "In uitvoering" zodra de eerste uren worden geregistreerd.' },
      { title: 'Opdrachtstatus bewaken', body: 'Opdrachten die langer dan 14 dagen in dezelfde status staan worden oranje gemarkeerd. Klik op de kaart voor details en vervolgactie.' },
      { title: 'Filteren op medewerker', body: 'Gebruik het medewerkersfilter om alleen de opdrachten te tonen die aan een specifieke uitvoerder of projectleider zijn gekoppeld.' },
    ],
  }],

  [/^\/opdrachten\/[^/]+\/[^/]+$/, {
    title: 'Opdracht — detail',
    description: 'Detailpagina van een opdracht met tabbladen voor informatie, planning, uitvoering, meerwerk en financiën. Hier wordt alle activiteit rondom de uitvoering vastgelegd.',
    sections: [
      { title: 'Tabblad Planning', body: 'Stel de startdatum, eindatum en verantwoordelijke uitvoerder in. Koppel onderaannemers via de subproject-kaarten. De planning synchroniseert met de centrale planningsmodule.' },
      { title: 'Tabblad Meerwerk', body: 'Registreer wijzigingen ten opzichte van de offerte als meer- of minderwerk. Klantakkoord vastleggen is verplicht vóór uitvoering bij bedragen boven de drempel.' },
      { title: 'Tabblad Financieel', body: 'Hier stel je termijnfacturen en de eindfactuur op. De eindfactuur is pas beschikbaar nadat de oplevering is goedgekeurd. Bij openstaande opleverpunten wordt een inhouding van 5% automatisch berekend.' },
      { title: 'Urenregistratie', body: 'Medewerkers schrijven uren via de werkbon. Uren zijn alleen in te voeren op opdrachten met status "In uitvoering" of "Opgeleverd onder voorbehoud". Bij ZZP/uitzend worden uren later gematcht met de inkoopfactuur.' },
    ],
  }],

  [/^\/opdrachten\/[^/]+$/, {
    title: 'Opdracht — detail',
    description: 'Detailpagina van een opdracht. Je wordt automatisch doorgestuurd naar het tabblad Informatie.',
  }],

  // ── Beheer: Relaties ───────────────────────────────────────────────────
  [/^\/relaties$/, {
    title: 'Relaties',
    description: 'Overzicht van alle klanten, leveranciers en contactpersonen. Hier beheer je de volledige relatiedatabase: bedrijven, woningcorporaties, VvE\'s, vastgoedbeheerders en particulieren.',
    sections: [
      { title: 'Zoeken en filteren', body: 'Zoek direct op naam via de zoekbalk. Gebruik de typefilter (zakelijk/VvE/particulier) om de lijst in te perken. De lijst toont naam, type, e-mail, telefoon en vestigingsplaats.' },
      { title: 'Nieuwe relatie', body: 'Klik op "Nieuwe relatie" en selecteer het type. Voor zakelijke relaties zijn KvK-nummer en BTW-nummer verplicht. Het inkoopordernummer vul je in op het relatiedetail — dit nummer verschijnt op alle uitgaande facturen als de klant dat aangeeft.' },
      { title: 'Inactieve relaties', body: 'Relaties die je niet meer actief gebruikt zet je op inactief. Ze blijven zichtbaar in de historische dossiers maar verschijnen niet meer in dropdown-menu\'s bij nieuwe aanvragen.' },
    ],
  }],

  [/^\/relaties\/[^/]+$/, {
    title: 'Relatie — detail',
    description: 'Volledig klant- of relatieprofiel met contactgegevens, factuuradressen, raamcontracten en gekoppelde dossiers. Dit is de centrale plek voor alle informatie over een klant of leverancier.',
    sections: [
      { title: 'Contactpersonen', body: 'Voeg meerdere contactpersonen toe met hun rol: technisch contact, financieel contact of tekenbevoegde. De tekenbevoegde is de persoon die offertes mag accepteren namens de organisatie.' },
      { title: 'Factuuradressen', body: 'Stel een of meerdere factuuradressen in per relatie. Nuttig voor klanten die meerdere locaties of kostenplaatsen hebben. Het inkoopordernummer per adres is verplicht op facturen als de klant dit heeft aangegeven in het profiel.' },
      { title: 'Gekoppelde dossiers', body: 'Onderaan de pagina vind je alle aanvragen, offertes en opdrachten die aan deze relatie zijn gekoppeld. Zo heb je snel het volledige klanthistorie in beeld.' },
      { title: 'Raamcontracten', body: 'Actieve raamcontracten en SLA\'s staan vermeld op de relatiekaart. Vanuit een raamcontract worden deelopdrachten direct als project aangemaakt zonder offerte­traject.' },
    ],
  }],

  // ── Beheer: Medewerkers ────────────────────────────────────────────────
  [/^\/medewerkers$/, {
    title: 'Medewerkers',
    description: 'Overzicht van alle medewerkers en ingehuurde krachten in EVA. De lijst is sorteerbaar en filterbaar op naam, functie, afdeling en tarieven. Kolom­configuraties kun je opslaan als persoonlijke lay-out.',
    sections: [
      { title: 'Contractvormen', body: 'Medewerkers zijn ingedeeld als intern (loondienst), ZZP of uitzendkracht. Dit onderscheid bepaalt de kostenstructuur: ZZP en uitzend hebben een kostprijs-uurtarief dat naast het verkooptarief wordt bijgehouden en later tegen inkoopfacturen wordt gematcht.' },
      { title: 'Kolommen configureren', body: 'Klik op het kolom-icoontje om te kiezen welke velden je ziet: naam, e-mail, telefoon, functie, afdeling, verkooptarief, kostprijstarief, CAO-schaal, in dienst vanaf. Sla de configuratie op als "lay-out" voor later gebruik.' },
      { title: 'Nieuwe medewerker', body: 'Klik op "Nieuwe medewerker" en vul minimaal voor- en achternaam, e-mailadres en contractvorm in. Wijs daarna een functie, afdeling en werkrooster toe op de detailpagina.' },
    ],
  }],

  [/^\/medewerkers\/[^/]+$/, {
    title: 'Medewerker — detail',
    description: 'Volledig medewerker­profiel met persoonsgegevens, werkrooster, skills, bedrijfsmiddelen, bestanden en toegangsbeheer. Dit is de centrale plek voor alles wat met een medewerker samenhangt.',
    sections: [
      { title: 'Persoonsgegevens', body: 'Naam, e-mail, telefoon, functie, afdeling, CAO-schaal, uurtarieven (verkoop en kostprijs) en datum in dienst. Het kostprijstarief is alleen zichtbaar voor managers en financieel beheer.' },
      { title: 'Werkrooster', body: 'Stel het standaard werkrooster in per dag inclusief pauzetijden. Het rooster bepaalt de beschikbaarheid in de planning en de normuren voor verlofberekening.' },
      { title: 'Skills en certificaten', body: 'Registreer VCA, BHV, rijbewijs of andere vakdiploma\'s met geldig­heidsdatum. EVA geeft een melding wanneer een certificaat binnen 60 dagen verloopt.' },
      { title: 'Bedrijfsmiddelen', body: 'Wijs telefoons, laptops, gereedschap of andere middelen toe aan de medewerker. Bedrijfsmiddelen worden automatisch opgenomen in het overdrachtsdossier bij uitdiensttreding.' },
      { title: 'Toegangsbeheer', body: 'Stel het gebruikers­type in (app/platform/geen) en pas de rechten per module aan. Afwijkingen van de afdelingsstandaard worden als "rechten­overschrijving" geregistreerd en zijn zichtbaar in het gebruikersbeheer.' },
      { title: 'Handtekening', body: 'Upload een afbeelding van de handtekening. Deze wordt automatisch ingevoegd op digitale offertes en opdrachtbevestigingen wanneer de medewerker als ondertekenaar is ingesteld.' },
    ],
  }],

  // ── Beheer: Management ─────────────────────────────────────────────────
  [/^\/management$/, {
    title: 'Management',
    description: 'Managementdashboard met projectoverzicht, AK-targets, doelstellingen voor het lopende jaar en de status van de Bouw7-synchronisatie. Toegankelijk voor directie en management.',
    sections: [
      { title: 'Management­projecten', body: 'Overzicht van projecten uit Bouw7 die zijn geïmporteerd als managementproject. De lijst toont projectnummer, naam, status, verantwoordelijke en financiële voortgang.' },
      { title: 'AK-targets', body: 'De AK-gegevens (Algemene Kosten) tonen het begrote versus werkelijke kostenverloop voor het huidige boekjaar. Afwijkingen worden automatisch gemarkeerd.' },
      { title: 'Doelstellingen', body: 'Beheer de strategische doelstellingen voor het lopende jaar. Koppel KPI\'s en voortgangspercentages aan elke doelstelling.' },
      { title: 'Bouw7 synchronisatie', body: 'De laatste synchronisatietijd met Bouw7 wordt hier getoond. Bij problemen met de koppeling verschijnt een waarschuwing. Synchroniseer handmatig via de knop of stel automatische sync in via Instellingen → Integraties.' },
    ],
  }],

  [/^\/management\/instellingen$/, {
    title: 'Management — Instellingen',
    description: 'Geavanceerde instellingen voor de managementmodule: KPI-drempelwaarden, rapportageperioden en koppeling met externe managementrapportage.',
  }],

  // ── Platform instellingen ──────────────────────────────────────────────
  [/^\/instellingen$/, {
    title: 'Instellingen',
    description: 'Centrale instellingen­hub van EVA. Navigeer hier naar alle configuratie­opties: organisatie­gegevens, functies en afdelingen, CAO-beheer, huisstijl, gebruikers en rechten, integraties, planning en app-instellingen.',
    sections: [
      { title: 'Platform­instellingen', body: 'Functies & Afdelingen, CAO-beheer, Organisatie­gegevens en Huisstijl raken de hele organisatie. Wijzigingen hier zijn direct zichtbaar voor alle gebruikers.' },
      { title: 'Gebruikers & Rechten', body: 'Beheer wie toegang heeft tot welke modules. Stel rechten in per afdeling als standaard en overschrijf ze per medewerker indien nodig.' },
      { title: 'Integraties', body: 'Koppel externe systemen zoals Bouw7. Toekomstige integraties (Exact Online, iDEAL) worden hier ook geconfigureerd zodra ze beschikbaar zijn.' },
      { title: 'App-instellingen', body: 'Elke sub-app (EvertsCalc, Houtrotherstel, Wagenpark, Taken) heeft eigen instellingen die via de kaarten op deze pagina bereikbaar zijn.' },
    ],
  }],

  [/^\/instellingen\/bedrijfsgegevens\/huisstijl$/, {
    title: 'Instellingen — Huisstijl',
    description: 'Stel de visuele identiteit van je werkmaatschappij in: logo\'s in verschillende formaten, kleurenpalet, typografie en huisstijlregels. Deze instellingen worden toegepast op alle gegenereerde PDF\'s en e-mails.',
    sections: [
      { title: 'Logo\'s', body: 'Upload een horizontaal logo, een compact logo (vierkant/icoon) en optioneel een negatief/wit logo voor donkere achtergronden. Formaat: PNG of SVG, maximaal 2 MB. Het logo verschijnt op offertes, facturen en e-mails.' },
      { title: 'Kleurenpalet', body: 'Stel de primaire merkkleur, secundaire kleur en accentkleur in via hex-codes. Deze kleuren worden gebruikt in PDF-koppen en de klantportaalinterface.' },
      { title: 'Typografie', body: 'Kies het lettertype voor documenten. Standaard wordt Montserrat gebruikt maar je kunt dit aanpassen per werkmaatschappij.' },
      { title: 'Huisstijlregels', body: 'Voeg vrije tekst toe voor intern gebruik: merkrichtlijnen, tone-of-voice notities of instructies voor medewerkers over het gebruik van het logo.' },
    ],
  }],

  [/^\/instellingen\/bedrijfsgegevens\/[^/]+$/, {
    title: 'Instellingen — Werkmaatschappij',
    description: 'Bewerk de gegevens van een specifieke werkmaatschappij: naam, KvK, BTW, factuuradres en bankgegevens. Laat velden leeg om de waarden van de moederorganisatie over te nemen.',
    sections: [
      { title: 'Overerving', body: 'Velden die leeg blijven nemen automatisch de waarden van de moederorganisatie over. Zo hoef je alleen die gegevens in te vullen die afwijken van de organisatiestandaard.' },
      { title: 'Bankgegevens', body: 'Vul IBAN en BIC in voor betalingsverzoeken en facturen. Het rekeningnummer verschijnt op de factuurvoettekst van deze werkmaatschappij.' },
      { title: 'Huisstijl', body: 'Klik op de huisstijl­link om het logo en de kleuren van deze werkmaatschappij apart in te stellen. Handig als werkmaatschappijen een eigen sub­merk voeren.' },
    ],
  }],

  [/^\/instellingen\/bedrijfsgegevens$/, {
    title: 'Instellingen — Bedrijfsgegevens',
    description: 'Beheer de gegevens van de moederorganisatie en alle werkmaatschappijen. Hier stel je de centrale bedrijfsinformatie in die op alle uitgaande documenten verschijnt.',
    sections: [
      { title: 'Moederorganisatie', body: 'Vul de naam, KvK-nummer, BTW-nummer en het hoofdadres in. Deze gegevens worden standaard overgenomen door alle werkmaatschappijen die geen eigen waarden hebben ingevuld.' },
      { title: 'Werkmaatschappijen', body: 'Voeg aparte entiteiten toe (bijv. Everts Schilderwerk BV, Everts Bouw BV) die onder de moederorganisatie vallen. Elke werkmaatschappij heeft eigen factuurgegevens en kan een eigen huisstijl hebben.' },
      { title: 'Nieuwe werkmaatschappij', body: 'Klik op "Werkmaatschappij toevoegen" en vul de minimale gegevens in. Stel daarna via de detailpagina de volledige bedrijfsgegevens en huisstijl in.' },
    ],
  }],

  [/^\/instellingen\/functies-afdelingen$/, {
    title: 'Instellingen — Functies & Afdelingen',
    description: 'Beheer de functies en afdelingen die beschikbaar zijn in medewerker­profielen en de planning. Functies en afdelingen zijn de basis voor rechten­beheer en planning­capaciteit.',
    sections: [
      { title: 'Functies', body: 'Maak functies aan zoals Schilder, Timmerman, Calculator of Uitvoerder. Aan functies koppel je later rechten in het gebruikersbeheer. De volgorde bepaalt de weergave in dropdown-menu\'s.' },
      { title: 'Afdelingen', body: 'Maak afdelingen aan zoals Binnendienst, Uitvoering of Financiën. Afdelingen zijn de basis voor planning­capaciteit en standaard­rechten per groep medewerkers.' },
      { title: 'Volgorde aanpassen', body: 'Sleep functies of afdelingen in de gewenste volgorde. De bovenste items verschijnen als eerste in keuzelijsten in medewerker­profielen en plannings­formulieren.' },
    ],
  }],

  [/^\/instellingen\/cao$/, {
    title: 'Instellingen — CAO-beheer',
    description: 'Upload en beheer CAO-documenten voor je werkmaatschappijen. EVA leest automatisch de loonschalen uit het CAO-PDF en maakt ze beschikbaar in medewerker­profielen.',
    sections: [
      { title: 'CAO uploaden', body: 'Klik op "CAO toevoegen" en upload het PDF-bestand. EVA analyseert de inhoud automatisch en extraheert de loonschalen (periodieken, schalen, niveaus). Dit kan enkele minuten duren.' },
      { title: 'Loonschalen controleren', body: 'Na verwerking zie je de geëxtraheerde loonschalen in een tabel. Controleer of de schalen correct zijn overgenomen. Bij fouten kun je waarden handmatig corrigeren.' },
      { title: 'Koppelen aan werkmaatschappij', body: 'Wijs het CAO-document toe aan een of meerdere werkmaatschappijen. In medewerker­profielen van die werkmaatschappij wordt dit CAO als keuzelijst aangeboden bij de veldgroep "Beloning".' },
    ],
  }],

  [/^\/instellingen\/gebruikers$/, {
    title: 'Instellingen — Gebruikers & Rechten',
    description: 'Overzicht van alle platform­gebruikers met hun toegangsstatus, authenticatie­koppeling en rechten­overschrijvingen. Stel hier ook de standaard­rechten per afdeling in.',
    sections: [
      { title: 'Gebruikersoverzicht', body: 'De tabel toont alle actieve medewerkers met een gebruikers­type (app/platform). Je ziet per medewerker: of er een auth­account is, of O365 e-mail is gekoppeld, en welke rechten­overschrijvingen van toepassing zijn.' },
      { title: 'Rechten per afdeling', body: 'Onderaan de pagina stel je de standaard­rechten in per afdeling. Alle medewerkers van die afdeling krijgen automatisch deze rechten, tenzij er een individuele overschrijving is.' },
      { title: 'Individuele rechten', body: 'Klik op een medewerker om diens rechten gedetailleerd in te stellen via de medewerker­detailpagina (tabblad Toegang). Overschrijvingen zijn hier zichtbaar als badge.' },
      { title: 'Uitnodiging sturen', body: 'Nieuwe gebruikers ontvangen een uitnodigingslink per e-mail. Ze kunnen zich authenticeren via wachtwoord of Microsoft 365 (O365). Koppel een O365-account voor Single Sign-On.' },
    ],
  }],

  [/^\/instellingen\/integraties$/, {
    title: 'Instellingen — Integraties',
    description: 'Beheer koppelingen met externe systemen. Momenteel beschikbaar: Bouw7 (personeels- en projectdata). Toekomstig: Exact Online, iDEAL en KvK-register.',
    sections: [
      { title: 'Bouw7 koppeling', body: 'Vul de API-sleutel en de exacte app-naam in vanuit je Bouw7-beheerpaneel (let op: de app-naam is hoofdletter­gevoelig). Sla op en test de verbinding. Bij succes wordt de laatste synchronisatietijd getoond op het management­dashboard.' },
      { title: 'Wat synchroniseert Bouw7?', body: 'Na activering synchroniseert EVA management­projecten, AK-gegevens en doelstellingen vanuit Bouw7. De synchronisatie is eenrichtings (Bouw7 → EVA) en kan handmatig of automatisch worden gestart.' },
      { title: 'Exact Online (gepland)', body: 'De Exact Online-koppeling voor verkoopfacturen, debiteurenbeheer en grootboekboekingen is in ontwikkeling. Velden zijn al gereserveerd in het datamodel zodat activering later geen datamigratie vereist.' },
    ],
  }],

  [/^\/instellingen\/planning$/, {
    title: 'Instellingen — Planning',
    description: 'Configureer de planningsmodule: uurtarieven en uursoorten. Uurtarieven bepalen de verkoopprijs van uren in calculaties. Uursoorten bepalen hoe uren worden gecategoriseerd in urenregistraties.',
    sections: [
      { title: 'Uurtarieven', body: 'Stel het standaard verkooptarief en kostprijstarief in per discipline. Deze tarieven worden gebruikt als standaard bij het aanmaken van calculatie­regels in offertes. Individuele medewerkers kunnen een afwijkend tarief hebben op hun profiel.' },
      { title: 'Uursoorten', body: 'Maak uursoorten aan zoals Productieve uren, Ziekteverzuim, Opleiding, Verlof en Overwerk. Uursoorten bepalen hoe uren worden geclassificeerd in de uren­registratie en de doorbelasting aan projecten.' },
      { title: 'Volgorde', body: 'De volgorde van uursoorten bepaalt de weergave in de urenregistratie­interface. Zet de meest gebruikte uursoorten bovenaan voor een efficiënter werkproces.' },
    ],
  }],

  [/^\/instellingen\/medewerker-attributen$/, {
    title: 'Instellingen — Medewerker­attributen',
    description: 'Definieer extra velden voor medewerker­profielen die niet standaard beschikbaar zijn. Handig voor bedrijfsspecifieke gegevens zoals paspoort­nummer, VOG-datum, gecertificeerde apparatuur of interne codes.',
    sections: [
      { title: 'Attribuut aanmaken', body: 'Klik op "Nieuw attribuut" en kies een type: tekst, getal, datum, ja/nee of keuzelijst. Stel een standaardwaarde in en geef aan of het veld verplicht is.' },
      { title: 'Volgorde en zichtbaarheid', body: 'Attributen verschijnen in medewerker­profielen in de volgorde die je hier instelt. Deactiveer attributen die je tijdelijk niet nodig hebt zonder ze te verwijderen.' },
      { title: 'Gebruik in filters', body: 'Actieve attributen zijn beschikbaar als filteroptie in het medewerkers­overzicht. Zo kun je filteren op bijv. "VCA gecertificeerd = ja" of "Afdeling rijbewijs = C/CE".' },
    ],
  }],

  // ── Actielijsten ──────────────────────────────────────────────────────────
  [/^\/taken\/lijsten\/[^/]+$/, {
    title: 'Actielijsten › Detail',
    description: 'Detailpagina van een actielijst. Sjabloon­lijsten tonen alle taken direct. Niet-sjabloon­lijsten horen bij een specifiek dossier en worden geopend vanuit het tabblad Taken van dat dossier.',
    sections: [
      { title: 'Taken beheren', body: 'Voeg taken toe met de "+"-knop. Stel per taak een omschrijving, verantwoordelijke medewerker en deadline in. Sleep taken om de volgorde te bepalen.' },
      { title: 'Status bijwerken', body: 'Klik op het vinkje van een taak om hem te voltooien. Gebruik het statusfilter om alleen openstaande of afgeronde taken te tonen.' },
      { title: 'Sjabloon­lijsten', body: 'Sjabloon­lijsten zijn herbruikbare takensets. Ze worden automatisch gekopieerd en aan een dossier gekoppeld op basis van de ingestelde triggers.' },
    ],
  }],

  [/^\/taken\/lijsten$/, {
    title: 'Actielijsten',
    description: 'Overzicht van alle actielijsten in het systeem. Actielijsten zijn takensets die je handmatig aanmaakt of automatisch koppelt aan dossiers via triggers.',
    sections: [
      { title: 'Nieuwe lijst', body: 'Klik op "Nieuwe lijst" en geef hem een naam. Je kunt de lijst direct koppelen aan een bestaand dossier (aanvraag/offerte/opdracht) of hem als sjabloon bewaren voor hergebruik.' },
      { title: 'Lijsttypen', body: 'Sjabloon­lijsten zijn herbruikbaar en staan los van dossiers. Dossier­lijsten zijn gekoppeld aan een specifiek dossier en worden geopend vanuit dat dossier.' },
    ],
  }],

  [/^\/taken$/, {
    title: 'Actielijsten',
    description: 'De actielijsten-module van EVA. Organiseer werk in actielijsten en wijs taken toe aan medewerkers.',
    sections: [
      { title: 'Actielijsten', body: 'Groepeer taken in overzichtelijke lijsten per project, klant of afdeling. Koppel lijsten aan dossiers (aanvraag, offerte, opdracht) voor directe traceerbaarheid.' },
      { title: 'Triggers', body: 'Stel in dat een actielijst automatisch wordt geactiveerd wanneer een dossier een bepaalde status bereikt.' },
    ],
  }],

  // ── Wagenpark ──────────────────────────────────────────────────────────
  [/^\/wagenpark\/dashboard$/, {
    title: 'Wagenpark — Dashboard',
    description: 'Overzichtsdashboard van het volledige wagenpark. Toont actuele statistieken, ULU-rittentracking, rijscores en de vijf meest urgente compliance­bevindingen.',
    sections: [
      { title: 'Statistieken', body: 'Vier tegels geven direct inzicht: actieve voertuigen, openstaande bevindingen, zakelijke kilometers deze maand en privé­kilometers deze maand. Kleuren geven aan of waarden binnen de norm vallen.' },
      { title: 'ULU-tracker', body: 'De ingebedde ULU­tracker toont real-time voertuig­posities en -statussen. Vereist een actieve ULU-koppeling. Klik op een voertuig voor details.' },
      { title: 'Rijscore­ranking', body: 'Rangschikking van bestuurders op rijscore. Een lage score (rood) duidt op scherp remmen, hoog rijden of andere rijstijlissues. Gebruik dit voor coaching­gesprekken.' },
      { title: 'Open bevindingen', body: 'De vijf meest urgente compliance­bevindingen worden direct getoond. Klik op "Alle bevindingen" voor het volledige overzicht met filteropties.' },
      { title: 'ULU sync', body: 'Klik op "ULU sync" om handmatig ritten- en compliance­data te vernieuwen vanuit de ULU-koppeling. De sync loopt normaal automatisch dagelijks.' },
    ],
  }],

  [/^\/wagenpark\/voertuigen\/nieuw$/, {
    title: 'Wagenpark — Nieuw voertuig',
    description: 'Voeg een nieuw voertuig toe aan het wagenpark. Voer het kenteken in — EVA haalt automatisch de voertuig­gegevens op via de RDW-koppeling.',
    sections: [
      { title: 'Kenteken invoeren', body: 'Typ het kenteken zonder streepjes (bijv. AB123C). EVA haalt automatisch merk, model, brandstof, APK-datum, emissieklasse en meer op via de RDW-API. Dit duurt enkele seconden.' },
      { title: 'Aanvullende gegevens', body: 'Na het ophalen van RDW-data kun je aanvullende velden invullen: voertuigtype, kleur, carrosserie, notities en de vaste bestuurder. Deze gegevens worden niet via RDW ingeladen.' },
      { title: 'Bestuurder koppelen', body: 'Wijs een vaste bestuurder toe of laat het veld leeg voor een poolvoertuig. De bestuurder kan ook later worden gekoppeld via de voertuig­detailpagina.' },
    ],
  }],

  [/^\/wagenpark\/voertuigen\/[^/]+$/, {
    title: 'Wagenpark — Voertuig detail',
    description: 'Volledig voertuigprofiel met technische gegevens, APK-status, bestuurder­koppeling, leasecontract, RDW-informatie en de laatste dertig ritten.',
    sections: [
      { title: 'RDW-gegevens', body: 'Brandstof, APK-vervaldatum, emissieklasse, catalogusprijs, trekgewicht, terugroe­pacties en WOK-status worden rechtstreeks uit de RDW geladen. Klik "Refresh RDW" om de gegevens te vernieuwen.' },
      { title: 'APK bewaking', body: 'EVA markeert voertuigen met een APK die binnen 30 dagen verloopt automatisch in het overzicht. Zet een herinnering in bij naderende APK-verlopen.' },
      { title: 'Bestuurder wijzigen', body: 'Klik op het bestuurderveld om een nieuwe koppeling in te stellen. De vorige koppeling wordt gearchiveerd met start- en einddatum voor volledige aantoonbaarheid.' },
      { title: 'Rittenhistorie', body: 'De laatste 30 ritten worden getoond met datum, bestuurder, bestemming, afstand, type (zakelijk/privé) en rijscore. Klik op "Alle ritten" voor het volledige overzicht met filteropties.' },
      { title: 'Leasecontracten', body: 'Actieve en afgelopen leasecontracten staan onderaan de pagina. Contracten worden beheerd via de pagina Leasecontracten en zijn hier alleen-lezen.' },
    ],
  }],

  [/^\/wagenpark\/voertuigen$/, {
    title: 'Wagenpark — Voertuigen',
    description: 'Overzicht van alle voertuigen in het wagenpark met actuele status, APK-datum, vaste bestuurder en voertuig­type. Schakel tussen actieve en gearchiveerde voertuigen.',
    sections: [
      { title: 'Compliance­status', body: 'Een rood bolletje bij een voertuig geeft aan dat er een compliance­issue is (bijv. verlopen APK of WOK-melding). Klik op het voertuig voor details en stappen voor herstel.' },
      { title: 'Status wijzigen', body: 'Wijzig de voertuig­status direct via het status­dropdown in de rij: Actief, In onderhoud of Gearchiveerd. Gearchiveerde voertuigen zijn niet meer zichtbaar in planning­keuze­menus.' },
      { title: 'Archief bekijken', body: 'Zet de toggle "Incl. gearchiveerd" aan om ook voertuigen te zien die uit dienst zijn genomen. Nuttig bij het controleren van historische rittenregistraties.' },
    ],
  }],

  [/^\/wagenpark\/bestuurders\/[^/]+$/, {
    title: 'Wagenpark — Bestuurder detail',
    description: 'Bestuurder­profiel met kilometerprognose, rijstijl­instellingen, voertuig­koppelingen, compliance­bevindingen en rittenhistorie. Configureer hier bijtelling, limieten en uitzonderingen.',
    sections: [
      { title: 'Kilometerprognose', body: 'De prognosekaart toont de verwachte jaarkilometers (zakelijk en privé) op basis van het huidige ritpatroon. Rood = norm overschreden, oranje = let op, groen = binnen norm.' },
      { title: 'Bijtelling', body: 'Zet bijtelling aan of uit voor deze bestuurder. Bij bijtelling worden privé­kilometers bewaakt. Stel de privé­limiet en het verwachte zakelijk jaarkilometrage in voor een nauwkeurige prognose.' },
      { title: 'Voertuig­koppeling', body: 'Wijs een voertuig toe via de koppeling­sectie. Meerdere koppelingen zijn mogelijk (bijv. bij voertuig­wissel). Einddatum wordt automatisch gevuld bij het koppelen van een nieuw voertuig.' },
      { title: 'Uitzonderingen (Allowances)', body: 'Maak persistente uitzonderingen aan voor compliance­regels die bewust worden genegeerd. Bijvoorbeeld: een bestuurder mag regelmatig parkeren op een locatie die normaal als "lang parkeren" wordt geflagd.' },
      { title: 'Ritten corrigeren', body: 'Klik op het type­badge van een rit (zakelijk/privé) om het type handmatig te overschrijven. Een ● geeft aan dat de rit handmatig is gecorrigeerd.' },
    ],
  }],

  [/^\/wagenpark\/bestuurders$/, {
    title: 'Wagenpark — Bestuurders',
    description: 'Overzicht van alle geregistreerde bestuurders met bijtelling­status, gekoppeld voertuig, kilometers (YTD zakelijk/privé), prognose en openstaande bevindingen.',
    sections: [
      { title: 'Bijtelling­beheer', body: 'Schakel bijtelling per bestuurder in of uit via de toggle in de tabel. Bestuurders met bijtelling worden bewaakt op privé­kilometer­gebruik ten opzichte van het maximum (500–8.000 km/jaar afhankelijk van instelling).' },
      { title: 'Normoverschrijdingen', body: 'Bestuurders wier prognose buiten de norm valt worden rood gemarkeerd. Klik op de naam voor details en bijstuurmogelijkheden.' },
      { title: 'Archief', body: 'Gebruik de toggle "Alles (incl. gearchiveerd)" om ook inactieve bestuurders te tonen. Nuttig bij het controleren van historische gegevens na uitdiensttreding.' },
    ],
  }],

  [/^\/wagenpark\/ritten\/import$/, {
    title: 'Wagenpark — Ritten importeren',
    description: 'Importeer ritten­registraties vanuit een Excel-export van ULU. Gebruik dit voor het verwerken van maandelijkse rittenrapporten of het herstel van ontbrekende synchronisatiedata.',
    sections: [
      { title: 'Export ophalen uit ULU', body: 'Ga in het ULU-dashboard naar Rapportages → Ritten → exporteer naar Excel. Het bestand bevat kolommen: Naam, Kenteken, Start rit, Adres, Afstand, Tijd, Kilometerstand, Rit type, Score.' },
      { title: 'Import uitvoeren', body: 'Upload het .xlsx-bestand. EVA matcht bestuurders op naam. Duplicaten worden automatisch overgeslagen (idempotent). Na import wordt automatisch een compliance­check uitgevoerd.' },
      { title: 'Fouten oplossen', body: 'Als een bestuurdernaam niet overeenkomt, verschijnt een foutmelding met de naam. Controleer de spelling of voeg de bestuurder eerst toe via het bestuurders­overzicht.' },
    ],
  }],

  [/^\/wagenpark\/ritten\/sync$/, {
    title: 'Wagenpark — Ritten synchroniseren',
    description: 'Synchroniseer ritten­data direct vanuit de ULU-API voor een opgegeven datumbereik. Vereist ingevulde ULU-inloggegevens in het .env.local-bestand.',
    sections: [
      { title: 'Vereisten', body: 'Zorg dat ULU_EMAIL, ULU_PASSWORD en DATABASE_URL zijn ingevuld in apps/dashboard/.env.local. Bij ontbrekende variabelen verschijnt een rode waarschuwing op de pagina.' },
      { title: 'Datumbereik', body: 'Standaard syncroniseert EVA van 1 januari tot vandaag. Pas het bereik aan voor een gerichte synchronisatie (bijv. alleen de afgelopen week). Let op: de ULU-API heeft een limiet van ~75 ritten per voertuig per call.' },
      { title: 'Aanbeveling', body: 'Plan de sync dagelijks automatisch in (via een cronjob of Windows Scheduler) om de gegevens actueel te houden zonder handmatige actie.' },
    ],
  }],

  [/^\/wagenpark\/ritten$/, {
    title: 'Wagenpark — Ritten',
    description: 'Volledig rittenlogboek van het wagenpark. Filter op datumbereik, bestuurder, type (zakelijk/privé) of rijscore. Exporteer gegevens voor de salarisadministratie of de Belastingdienst.',
    sections: [
      { title: 'Filters gebruiken', body: 'Combineer filters: selecteer een bestuurder, kies periode en filter op score­bucket (<50 = rood, 50–69 = oranje, 70+ = normaal). De tabel toont maximaal 200 ritten per pagina.' },
      { title: 'Ritten kleuring', body: 'Groene rijen = zakelijk, grijze rijen = privé. Rood of oranje score­badges duiden op rijstijlissues. Een ● achter het type geeft aan dat de classificatie handmatig is gecorrigeerd.' },
      { title: 'Kilometeradministratie', body: 'Een volledige kilometeradministratie is fiscaal verplicht voor leaserijders met bijtelling. Zorg dat alle ritten zijn geclassificeerd (zakelijk/privé) vóór de maandafsluiting. Exporteer via de "Exporteer"-knop als CSV voor de salarisadministratie.' },
    ],
  }],

  [/^\/wagenpark\/parkeren\/import$/, {
    title: 'Wagenpark — Parkeren importeren',
    description: 'Importeer parkeertransacties vanuit een Excel-export van ULU. Verwerk parkeernota\'s in bulk voor de kilometeradministratie en doorbelasting aan projecten.',
    sections: [
      { title: 'Export ophalen', body: 'Ga in het ULU-dashboard naar Rapportages → Parkeren → exporteer naar Excel. Verwachte kolommen: Parkeerlocatie, Naam voertuig, Kenteken, Parkeer starttijd, Parkeerkosten, Parkeer duur.' },
      { title: 'Import uitvoeren', body: 'Upload het .xlsx-bestand. Duplicaten worden automatisch overgeslagen op basis van kenteken + starttijd combinatie.' },
    ],
  }],

  [/^\/wagenpark\/parkeren\/zones$/, {
    title: 'Wagenpark — Parkeer­zones',
    description: 'Gedetailleerde parkeeranalyse per zone en locatie. Gebruik voor doorbelasting van parkeerkosten aan klanten of projecten. Toont hiërarchische zone/stad-breakdown, top-30 zones en voertuig×zone-matrix.',
    sections: [
      { title: 'Filters', body: 'Filter op kenteken, zone/plaatsnaam en datumbereik. Combineer filters voor een specifieke klant­locatie in een bepaalde periode.' },
      { title: 'Zone-hiërarchie', body: 'Steden zijn uitklapbaar naar individuele zones. Klik op een stad om de zones te zien. Dit geeft inzicht in welke parkeerlocaties het meest worden gebruikt.' },
      { title: 'Voertuig×zone matrix', body: 'De matrix onderaan toont per voertuig welke zones zijn bezocht en wat de totale parkeerkosten zijn. Ideaal voor het opstellen van parkeernota\'s richting klanten.' },
    ],
  }],

  [/^\/wagenpark\/parkeren$/, {
    title: 'Wagenpark — Parkeren',
    description: 'Overzicht van alle parkeertransacties met totaalkosten en langdurig parkeren (>1 uur gemarkeerd). Filter op kenteken voor een voertuig­specifiek overzicht.',
    sections: [
      { title: 'Markering', body: 'Oranje duur = langer dan 1 uur geparkeerd. Rood bedrag = meer dan €5 parkeerkosten. Dit helpt bij het opsporen van ongebruikelijk dure parkeer­sessies.' },
      { title: 'Zone-analyse', body: 'Klik op "Per zone" voor een gedetailleerde breakdown per parkeer­locatie, nuttig voor doorbelasting aan projecten of klanten.' },
    ],
  }],

  [/^\/wagenpark\/leasecontracten$/, {
    title: 'Wagenpark — Leasecontracten',
    description: 'Overzicht van alle lopende en afgelopen leasecontracten gesorteerd op startdatum. Bewaar contract­details en bewak de kilometerbundels.',
    sections: [
      { title: 'Contract­details', body: 'Per contract zie je: voertuig, contractnummer, start- en einddatum, maandelijks leasebedrag, jaarbundel kilometers en bijtelling­percentage.' },
      { title: 'Contracten beheren', body: 'Contracten worden aangemaakt en bewerkt op de voertuig­detailpagina. Dit overzicht is alleen-lezen en dient als centraal inzage­punt voor alle lopende contracten.' },
      { title: 'Kilometer­bewaking', body: 'Koppel de kilometerstand­gegevens uit de ritten­registratie aan het contract om de verwachte meer­kilometers te berekenen. Zo voorkom je financiële verrassingen bij afleveringsinspectie.' },
    ],
  }],

  [/^\/wagenpark\/diagnose$/, {
    title: 'Wagenpark — Diagnose',
    description: 'Technische diagnosepagina voor het wagenpark. Toont de status van de database­verbinding, aanwezigheid van omgevings­variabelen en de compleetheid van het databaseschema.',
    sections: [
      { title: 'Verbindingsstatus', body: 'Supabase-URL en project-ID worden getoond. Controleer of de anon key en service role key correct zijn ingevuld in .env.local — ontbrekende variabelen worden rood gemarkeerd.' },
      { title: 'Tabel­controle', body: 'EVA controleert of alle tien benodigde tabellen bestaan (voertuigen, ritten, bestuurders, leasecontracten, RDW-data, ULU-imports, parkeren, compliance­bevindingen, handboekregels, feedback). Ontbrekende tabellen krijgen instructies voor herstel.' },
      { title: 'Gebruik', body: 'Raadpleeg deze pagina na een fresh install of bij onverwacht gedrag van het wagenpark. De diagnose helpt de oorzaak snel te pinpointen zonder de server­logs te hoeven doorzoeken.' },
    ],
  }],

  [/^\/wagenpark\/bevindingen$/, {
    title: 'Wagenpark — Bevindingen',
    description: 'Compliance­bevindingen voor het volledige wagenpark. Filter op ernst (overtreding/waarschuwing/info), status (open/uitzondering/afgewezen) en specifieke regels of bestuurders.',
    sections: [
      { title: 'Ernst­niveaus', body: 'Overtreding (rood) = actie vereist. Waarschuwing (oranje) = let op. Info (blauw) = informatief. De ernstkaarten bovenaan geven direct het totaalbeeld.' },
      { title: 'Filters', body: 'Filter op status (Open / Uitzonderingen / Afgewezen / Alle), op regelcode (welke complianceregel is overtreden) of op bestuurder. Combineer filters voor een gerichte analyse.' },
      { title: 'Bevinding beheren', body: 'Klik op een bevinding om actie te ondernemen: markeer als uitzondering (met reden), wijs af of los op. Opgeloste bevindingen verdwijnen uit het "Open"-overzicht.' },
      { title: 'Compliance check uitvoeren', body: 'Klik op "Compliance check uitvoeren" om handmatig alle regels opnieuw te beoordelen op actuele data. Normaal loopt dit automatisch na elke rit­synchronisatie.' },
    ],
  }],

  [/^\/wagenpark\/instellingen$/, {
    title: 'Wagenpark — Instellingen',
    description: 'Configureer de compliance­regels voor het wagenpark. Per regel kun je de actieve status wijzigen en drempelwaarden aanpassen. Zware logica­wijzigingen vereisen aanpassing in de compliance­engine (backend).',
    sections: [
      { title: 'Regels in/uitschakelen', body: 'Elk compliance­regel heeft een activeer­toggle. Schakel regels uit die niet van toepassing zijn op jouw wagenpark­beleid. Uitgeschakelde regels genereren geen bevindingen.' },
      { title: 'Drempel­waarden', body: 'Sommige regels hebben instelbare drempels (bijv. maximale privé­kilometers per maand, minimale rijscore). Pas de drempel aan via het bewerkingsicoontje naast de regel.' },
      { title: 'Regelbeheer', body: 'Volledige aanpassing van regellogica (wanneer een bevinding wordt aangemaakt, hoe ernst wordt bepaald) vereist aanpassing van de compliance­engine. Neem contact op met de beheerder voor dit soort wijzigingen.' },
    ],
  }],

  [/^\/wagenpark$/, {
    title: 'Wagenpark',
    description: 'De wagenpark­module van EVA. Beheer voertuigen, bestuurders, kilometer­administratie, lease­contracten en compliance op één plek. Geïntegreerd met de ULU-rittenregistratie.',
    sections: [
      { title: 'Modules', body: 'Dashboard · Voertuigen · Bestuurders · Ritten · Parkeren · Leasecontracten · Diagnose · Bevindingen · Instellingen.' },
      { title: 'ULU-integratie', body: 'Ritten en parkeertransacties komen via de ULU-koppeling (automatisch of via Excel-import). Stel de ULU-inloggegevens in via .env.local voor automatische synchronisatie.' },
      { title: 'Compliance', body: 'EVA bewaakt automatisch APK-vervaldatums, rijbewijs­geldigheid, privé­kilometerlimieten en rijstijl­scores op basis van instelbare regels.' },
    ],
  }],

  // ── Houtrotherstel ─────────────────────────────────────────────────────
  [/^\/houtrotherstel\/dashboard$/, {
    title: 'Houtrotherstel — Dashboard',
    description: 'Persoonlijk dashboard voor de houtrotherstel­module. Toont openstaande, afgeronde en afgekeurde registraties, totale omzetwaarde, recente registraties en actieve projecten.',
    sections: [
      { title: 'Statistieken', body: 'Vier tegels: openstaande registraties, afgeronde registraties, afgekeurde registraties en totale verkoopwaarde. De teller "open" is jouw directe actiepunt.' },
      { title: 'Recente registraties', body: 'De tabel toont de meest recente registraties met projectnaam, datum, reparatietype, verkoopprijs en status. Klik op een rij om direct naar de registratie te navigeren.' },
      { title: 'Afgekeurde registraties', body: 'Als er afgekeurde registraties zijn verschijnt een rode melding bovenaan. Klik erop om direct naar de afgekeurde registraties te gaan en ze te herzien of te herstellen.' },
    ],
  }],

  [/^\/houtrotherstel\/projecten\/nieuw$/, {
    title: 'Houtrotherstel — Nieuw project',
    description: 'Maak een nieuw houtrotherstel­project aan. Vul de projectnaam, klant, locatie, startdatum en projectleider in.',
    sections: [
      { title: 'Verplichte velden', body: 'Projectnaam, klant en adres zijn verplicht. Het projectnummer wordt automatisch gegenereerd. Je kunt een projectdatum instellen of dit later aanpassen.' },
      { title: 'Koppeling met opdracht', body: 'Koppel het project optioneel aan een bestaande opdracht (uit het hoofdproces) voor volledige traceerbaarheid van kosten en registraties.' },
    ],
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/bewerken$/, {
    title: 'Houtrotherstel — Project bewerken',
    description: 'Bewerk de basisgegevens van het houtrotherstel­project: naam, klant, adres, start- en einddatum, status en projectleider.',
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/rapportage$/, {
    title: 'Houtrotherstel — Project­rapportage',
    description: 'Genereer een volledige PDF-rapportage van het project met foto\'s voor/na, registraties per geveldeel, totale herstel­oppervlakten en productgebruik.',
    sections: [
      { title: 'Rapportage genereren', body: 'Klik op "Rapportage genereren" om de PDF op te bouwen. Alle geregistreerde foto\'s, locaties en reparatie­types worden automatisch opgenomen in een opgemaakte lay-out.' },
      { title: 'Gebruik', body: 'Stuur de rapportage naar de klant of corporatie als verantwoording voor de uitgevoerde werkzaamheden. De rapportage voldoet aan de documentatie-eisen van de meeste opdrachtgevers.' },
    ],
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/geveldelen\/[^/]+\/locaties\/[^/]+$/, {
    title: 'Houtrotherstel — Geveldeel locatie',
    description: 'Registratiepagina voor een specifieke locatie binnen een geveldeel. Leg hier de aangetroffen schade, de uitgevoerde reparatie, gebruikte producten en foto\'s voor/na vast.',
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/geveldelen\/[^/]+$/, {
    title: 'Houtrotherstel — Geveldeel',
    description: 'Overzicht van alle locaties binnen dit geveldeel. Voeg locaties toe per kozijn, dorpel, borstwering of ander bouwelement en registreer per locatie de conditie en werkzaamheden.',
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/projectdelen\/[^/]+\/locaties\/[^/]+\/registraties\/[^/]+$/, {
    title: 'Houtrotherstel — Registratie detail',
    description: 'Volledige registratie van een houtrotherstel­behandeling op één locatie: foto\'s voor/na, gebruikte producten, hoeveelheden, reparatie­methode, tijdstip en uitvoerder.',
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/projectdelen\/[^/]+\/locaties\/[^/]+$/, {
    title: 'Houtrotherstel — Projectdeel locatie',
    description: 'Alle registraties voor deze locatie binnen het projectdeel. Voeg registraties toe voor elke behandelde plek op deze locatie.',
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+\/projectdelen\/[^/]+$/, {
    title: 'Houtrotherstel — Projectdeel',
    description: 'Overzicht van alle locaties binnen dit projectdeel (bijv. voorgevel, achtergevel, kozijnen). Voeg locaties toe en registreer per locatie de schade en uitgevoerde herstel­werkzaamheden.',
    sections: [
      { title: 'Locaties toevoegen', body: 'Klik op "Locatie toevoegen" en beschrijf het element: type (kozijn, dorpel, gevelplaat), positie, verdieping en oppervlak. Voeg direct een eerste registratie toe als de schade al bekend is.' },
      { title: 'Voortgang', body: 'De voortgangs­balk toont het percentage locaties met een afgeronde registratie. Groen = alles geregistreerd, oranje = in behandeling, grijs = nog niet gestart.' },
    ],
  }],

  [/^\/houtrotherstel\/projecten\/[^/]+$/, {
    title: 'Houtrotherstel — Project detail',
    description: 'Projectoverzicht met alle projectdelen, voortgang per deel, totale registratie­statistieken en knoppen voor rapportage en bewerking.',
    sections: [
      { title: 'Projectdelen', body: 'Een project is opgedeeld in projectdelen (bijv. Gevel Noord, Kozijnen BG, Balkonhekken). Klik op een projectdeel om de locaties en registraties te beheren.' },
      { title: 'Rapportage', body: 'Klik op "Rapportage" om een volledige PDF te genereren met alle registraties, foto\'s en productgebruik voor dit project.' },
    ],
  }],

  [/^\/houtrotherstel\/projecten$/, {
    title: 'Houtrotherstel — Projecten',
    description: 'Rasteroverzicht van alle houtrotherstel­projecten met status, klant, adres en registratieprogress. Filter op status of zoek op naam, nummer of klant.',
    sections: [
      { title: 'Statusfilter', body: 'Gebruik de statusfilter om te wisselen tussen "Alle", "Onderhanden" (in uitvoering) en "Afgerond". Zo houd je focus op actieve projecten.' },
      { title: 'Project­kaarten', body: 'Elke kaart toont het projectnummer, status­badge, naam, klant, adres en het aantal open en afgeronde registraties. Klik op een kaart voor het volledige project.' },
    ],
  }],

  [/^\/houtrotherstel\/rapportages$/, {
    title: 'Houtrotherstel — Rapportages',
    description: 'Overzicht van de laatste 25 projecten gesorteerd op recente activiteit. Download of bekijk de rapportage per project.',
    sections: [
      { title: 'Rapportage downloaden', body: 'Klik op het rapport­icoontje in de rij van een project om de PDF-rapportage te openen of te downloaden. De rapportage bevat alle registraties en foto\'s.' },
      { title: 'Status', body: '"Onderhanden" = project is actief, "Afgerond" = alle registraties zijn voltooid en het project is gesloten.' },
    ],
  }],

  [/^\/houtrotherstel\/registraties\/nieuw$/, {
    title: 'Houtrotherstel — Nieuwe registratie',
    description: 'Registreer een nieuwe houtrotherstel­behandeling. Selecteer het project en de locatie, voeg foto\'s toe en beschrijf de reparatie­methode en gebruikte producten.',
    sections: [
      { title: 'Project en locatie', body: 'Selecteer eerst het project uit de dropdown. Kies daarna het projectdeel en de locatie. Als de locatie nog niet bestaat kun je hem direct aanmaken.' },
      { title: 'Foto\'s', body: 'Upload minimaal één foto voor en één foto na de behandeling. Foto\'s zijn verplicht voor een complete registratie en worden opgenomen in de klant­rapportage.' },
      { title: 'Reparatiemethode', body: 'Selecteer een standaard­reparatie uit de bibliotheek of voer een vrije omschrijving in. Standaard­reparaties bevatten gestandaardiseerde beschrijvingen en zijn aanbevolen voor consistente rapportage.' },
    ],
  }],

  [/^\/houtrotherstel\/registraties\/[^/]+$/, {
    title: 'Houtrotherstel — Registratie detail',
    description: 'Bekijk of bewerk een bestaande houtrotherstel­registratie. Voeg aanvullende foto\'s of opmerkingen toe, pas de reparatie­methode aan of wijzig de status.',
  }],

  [/^\/houtrotherstel\/registraties$/, {
    title: 'Houtrotherstel — Registraties',
    description: 'Volledig overzicht van alle houtrotherstel­registraties. Filter op project, status en zoekterm (element­nummer, ruimte, schade­omschrijving, reparatienaam).',
    sections: [
      { title: 'Filteren', body: 'Gebruik de project­filter en statusfilter in combinatie met de zoekbalk voor een gerichte selectie. Zoeken werkt op element­nummer, ruimte, schade­omschrijving en de naam van de standaard­reparatie.' },
      { title: 'Nieuwe registratie', body: 'Klik op "Nieuwe registratie" om direct een registratie aan te maken zonder eerst naar een project te navigeren. Handig voor buitendienst­medewerkers die snel willen registreren.' },
    ],
  }],

  [/^\/houtrotherstel\/standaard-reparaties\/nieuw$/, {
    title: 'Houtrotherstel — Nieuwe standaard reparatie',
    description: 'Voeg een nieuwe standaard­reparatie toe aan de bibliotheek. Standaard­reparaties zijn beschrijvings­sjablonen voor veelvoorkomende houtrotherstel­methoden met vaste producten en prijzen.',
  }],

  [/^\/houtrotherstel\/standaard-reparaties$/, {
    title: 'Houtrotherstel — Standaard reparaties',
    description: 'Bibliotheek met standaard­reparaties voor veelvoorkomende houtrotherstel­situaties. Elke reparatie bevat een naam, omschrijving, gebruikte producten en de verkoopprijs. Gebruik als sjabloon bij nieuwe registraties.',
    sections: [
      { title: 'Reparatie aanmaken', body: 'Klik op "Nieuwe standaard reparatie" en vul de naam, reparatie­methode, producten (merk, type, hoeveelheid) en de standaard verkoopprijs in. De reparatie is daarna beschikbaar als selectie bij registraties.' },
      { title: 'Prijsstructuur', body: 'De bibliotheek­tabel toont de volledige prijsopbouw per reparatie. Actualiseer de prijzen na een leveranciers­prijswijziging om correcte calculaties te garanderen.' },
    ],
  }],

  [/^\/houtrotherstel\/gebruikers$/, {
    title: 'Houtrotherstel — Gebruikers',
    description: 'Beheer de medewerkers die toegang hebben tot de houtrotherstel­module. Stel rollen in: admin, platform­gebruiker of app­gebruiker.',
    sections: [
      { title: 'Rollen', body: 'Admin = volledige beheer­toegang (projecten, bibliotheek, gebruikers). Platform­gebruiker = toegang tot alle projecten en registraties. App­gebruiker = alleen eigen registraties aanmaken en inzien.' },
    ],
  }],

  [/^\/houtrotherstel\/instellingen$/, {
    title: 'Houtrotherstel — Instellingen',
    description: 'Instellingen voor de houtrotherstel­module: profielgegevens en app­configuratie.',
    sections: [
      { title: 'Profiel', body: 'Bewerk je persoonlijke profiel­gegevens zoals naam, e-mail en weergave­naam in de module.' },
      { title: 'App­instellingen', body: 'Configureer module­brede instellingen zoals standaard­producten, verplichte foto\'s bij registraties en rapportage­sjabloon.' },
    ],
  }],

  [/^\/houtrotherstel$/, {
    title: 'Houtrotherstel',
    description: 'De houtrotherstel­module van EVA. Registreer, documenteer en rapporteer houtrotherstel­werkzaamheden per project, geveldeel en locatie.',
    sections: [
      { title: 'Werkwijze', body: '1. Maak een project aan en koppel het aan een klant en locatie. 2. Voeg projectdelen toe (gevels, kozijnen). 3. Voeg per projectdeel locaties toe. 4. Registreer per locatie de schade, reparatie en foto\'s. 5. Genereer de rapportage voor de klant.' },
      { title: 'Mobiel gebruik', body: 'De registratie­pagina is geoptimaliseerd voor gebruik op een smartphone. Foto\'s kunnen direct vanuit de camera worden geüpload zonder tussenopslag.' },
    ],
  }],

  // ── EvertsCalc ─────────────────────────────────────────────────────────
  [/^\/everts-calc\/meetstaat\/[^/]+$/, {
    title: 'EvertsCalc — Meetstaat',
    description: 'Invoerscherm voor de meetstaat van een schilderwerk­calculatie. Voer per werksoort de hoeveelheden in (m², stuks, meter) en EvertsCalc berekent de prijs automatisch op basis van de geselecteerde behandeling.',
    sections: [
      { title: 'Posten invoeren', body: 'Selecteer de werksoort (bijv. schilderwerk kozijnen buiten), kies de behandeling (bijv. 2× lakken) en voer de hoeveelheid in. EvertsCalc berekent arbeids­uren en materiaalkosten automatisch.' },
      { title: 'Structuur', body: 'Organiseer de meetstaat in groepen (bijv. per gevel of per verdieping). Groepen geven structuur aan de offerte en maken het voor de klant overzichtelijk.' },
      { title: 'Importeren', body: 'Heb je al een meetstaat in Excel? Importeer hem via CUF-import (knop in de werkbalk). EVA matcht de kolommen automatisch op bekende werksoorten.' },
    ],
  }],

  [/^\/everts-calc\/quotes\/new$/, {
    title: 'EvertsCalc — Nieuwe offerte',
    description: 'Driestappen­wizard voor het aanmaken van een nieuwe EvertsCalc­offerte. Kies het type, vul de klantgegevens in en stel de basisgegevens in.',
    sections: [
      { title: 'Stap 1: Type', body: 'Kies "Verkoop­offerte" voor een klant­gerichte offerte of "Interne calculatie" voor een interne kostenraming (niet zichtbaar voor de klant).' },
      { title: 'Stap 2: Klant', body: 'Selecteer een bestaande klant of maak direct een nieuwe klant aan (naam, bedrijf, e-mail). Bij een bestaande klant worden contactgegevens automatisch ingevuld.' },
      { title: 'Stap 3: Basisgegevens', body: 'Vul de titel, intern referentie­nummer, offertedatum en geldigheids­termijn in. De verval­datum wordt automatisch berekend. Na opslaan ga je naar de calculatie­editor.' },
    ],
  }],

  [/^\/everts-calc\/quotes\/[^/]+\/preview$/, {
    title: 'EvertsCalc — Offerte preview',
    description: 'PDF-stijl preview van de offerte zoals de klant die ontvangt. Drie pagina\'s: voorblad met totalen, gedetailleerde posten­lijst en algemene voorwaarden. Download als PDF of DOCX, of druk af.',
    sections: [
      { title: 'Pagina 1 — Voorblad', body: 'Bedrijfslogo en -gegevens, offertenummer, klantadres, datum en geldigheid, totaal­bedragen (excl. BTW, BTW, incl. BTW), optionele posten en stelposten.' },
      { title: 'Pagina 2 — Postenoverzicht', body: 'Gedetailleerde regelopstelling per groep met omschrijving, hoeveelheid, eenheid en prijs. Optionele posten en stelposten worden apart weergegeven met "optioneel"-markering.' },
      { title: 'Pagina 3 — Voorwaarden', body: 'Betalings­voorwaarden, uitsluitingen en overige opmerkingen. Pas deze teksten aan via Instellingen → Offerte­instellingen.' },
      { title: 'Exporteren', body: 'Download als PDF (standaard) of DOCX (bewerkenbaar in Word). Gebruik de DOCX-optie als de klant de offerte wil aanpassen voordat hij akkoord gaat.' },
    ],
  }],

  [/^\/everts-calc\/quotes\/[^/]+$/, {
    title: 'EvertsCalc — Offerte details',
    description: 'Calculatie­editor voor een EvertsCalc­offerte. Beheer hier alle calculatieregels, de meetstaat, de structuur en de offerte­opmaak.',
    sections: [
      { title: 'Calculatieregels', body: 'Voeg regels toe via de meetstaat (aanbevolen voor schilderwerk) of handmatig. Elke regel heeft een omschrijving, hoeveelheid, eenheid, eenheidsprijs en intern opslagnummer. Klik op een regel om te bewerken.' },
      { title: 'Structuur­boom', body: 'Het linker­paneel toont de hiërarchische structuur (groepen en subgroepen). Drag-and-drop regels tussen groepen om de opbouw te wijzigen. Pin het paneel om het zichtbaar te houden tijdens scrollen.' },
      { title: 'Kostprijs vs. verkoopprijs', body: 'Elke regel toont naast de verkoopprijs ook de interne kostprijs en het opslag­percentage. Wijzig de marge via het percentage­veld. Het totaaloverzicht onderaan toont de totale marge.' },
      { title: 'Opslaan', body: 'Gebruik de cloud­opslaanknop (bovenbalk) om op te slaan. De status­indicator toont of er niet-opgeslagen wijzigingen zijn. EvertsCalc slaat bij sluiten van de pagina ook automatisch op.' },
    ],
  }],

  [/^\/everts-calc\/quotes$/, {
    title: 'EvertsCalc — Offertes',
    description: 'Overzicht van alle EvertsCalc­offertes met offertenummer, klant, titel, datum, geldigheid, totaalbedrag, status en type (verkoop/intern).',
    sections: [
      { title: 'Nieuwe offerte', body: 'Klik op "Nieuwe offerte" om de driestappe­wizard te starten. Je kiest het type (verkoop of intern), de klant en de basisgegevens.' },
      { title: 'Statussen', body: 'Concept = niet verzonden. Verzonden = klant heeft de offerte ontvangen. Gewonnen = geaccepteerd door klant. Verloren = afgewezen. Intern = interne calculatie, nooit voor klant bestemd.' },
      { title: 'Alleen-lezen bij gewonnen', body: 'Gewonnen offertes zijn niet meer bewerkbaar om auditintegriteit te waarborgen. Maak een revisie aan als er wijzigingen nodig zijn.' },
    ],
  }],

  [/^\/everts-calc\/bibliotheek\/recepten$/, {
    title: 'EvertsCalc — Bibliotheek recepten',
    description: 'Recepten zijn combinaties van behandelingen en materialen voor veelvoorkomende werksoorten. Selecteer een recept in de calculatie­editor om snel een complete regel met arbeids­normen en materiaalkosten toe te voegen.',
    sections: [
      { title: 'Recept aanmaken', body: 'Klik op "Nieuw recept" en koppel een of meerdere behandelingen, materialen en arbeidsnormen. Sla het recept op met een duidelijke naam zodat het vindbaar is in de calculatie­editor.' },
      { title: 'Gebruik in calculaties', body: 'In de calculatie­editor klik je op het bibliotheek­icoontje en kies je "Recepten". Selecteer het gewenste recept — alle gekoppelde regels worden direct ingevoegd.' },
    ],
  }],

  [/^\/everts-calc\/bibliotheek\/schilderwerk$/, {
    title: 'EvertsCalc — Bibliotheek schilderwerk',
    description: 'Schilderwerk­specifieke calculatiedata: oppervlak­soorten, arbeidsnormen per m² en standaard­producten per werksoort. Gebruik als basis voor meetstaat­calculaties.',
    sections: [
      { title: 'Arbeidsnormen', body: 'Elke schilderwerk­behandeling heeft een arbeidsnorm in uren/m². De norm bepaalt de arbeids­kosten. Pas de norm aan als de werkelijkheid voor jouw bedrijf afwijkt van de standaard.' },
      { title: 'Producten koppelen', body: 'Koppel verf- en materiaal­producten aan een werksoort. EvertsCalc berekent het materiaalverbruik automatisch op basis van de dekking (m²/L) en de ingevoerde oppervlak­hoeveelheid.' },
    ],
  }],

  [/^\/everts-calc\/bibliotheek\/materialen$/, {
    title: 'EvertsCalc — Bibliotheek materialen',
    description: 'Artikelbestand met alle materialen: inkoopprijs, verkoopprijs, eenheid en marge. Houd de prijzen actueel voor betrouwbare calculaties.',
    sections: [
      { title: 'Prijzen bijwerken', body: 'Update inkoopprijzen na ontvangst van een nieuwe leveranciers­prijslijst. De verkoopprijs wordt automatisch herberekend op basis van de ingestelde marge­percentage per artikel.' },
      { title: 'Nieuw materiaal', body: 'Klik op "Nieuw materiaal" en vul artikelnummer, naam, eenheid (L, kg, m², stuk), inkoopprijs en marge in. Het materiaal is daarna beschikbaar in behandelingen en recepten.' },
    ],
  }],

  [/^\/everts-calc\/bibliotheek\/behandelingen$/, {
    title: 'EvertsCalc — Bibliotheek behandelingen',
    description: 'Overzicht van alle schilderwerk­behandelingen met arbeidsnorm (uren/m²), gekoppelde producten en toepassings­gebied. Behandelingen zijn de bouwstenen van schilderwerk­calculaties.',
    sections: [
      { title: 'Behandeling aanmaken', body: 'Klik op "Nieuwe behandeling" en vul de naam (bijv. "2× lakken buiten kozijnen"), arbeidsnorm, toepassings­gebied en optionele product­specificatie in. De behandeling is daarna beschikbaar in de meetstaat.' },
      { title: 'Arbeidsnorm', body: 'De norm geeft aan hoeveel uur een vakman nodig heeft per m². Norm × hoeveelheid × uurtarief = arbeidskosten. Een correcte norm is essentieel voor een winstgevende calculatie.' },
    ],
  }],

  [/^\/everts-calc\/bibliotheek$/, {
    title: 'EvertsCalc — Bibliotheek',
    description: 'De calculatie­bibliotheek van EvertsCalc met behandelingen, materialen, schilderwerk­normen en recepten. Houd de bibliotheek actueel voor betrouwbare calculaties.',
    sections: [
      { title: 'Behandelingen', body: 'Arbeidsnormen per werksoort (uren/m²) voor consistente calculaties.' },
      { title: 'Materialen', body: 'Artikelbestand met in- en verkoopprijzen. Actualiseer na elke leveranciers­prijswijziging.' },
      { title: 'Schilderwerk', body: 'Specifieke normen voor schilderwerk­oppervlakten, products per werksoort.' },
      { title: 'Recepten', body: 'Veelgebruikte combinaties van behandelingen en materialen als herbruikbaar sjabloon.' },
    ],
  }],

  [/^\/everts-calc\/instellingen\/offertes\/layouts\/[^/]+$/, {
    title: 'EvertsCalc — Offerte layout editor',
    description: 'Bewerk een offerte­lay-out: koptekst, voettekst, kleur­schema, kolom­weergave en welke velden zichtbaar zijn voor de klant. Wijzigingen zijn direct zichtbaar in de preview.',
    sections: [
      { title: 'Koptekst', body: 'Stel de koptekst in met bedrijfsgegevens en logo. Gebruik variabelen zoals {{klant_naam}}, {{offerte_nummer}} en {{datum}} voor automatische invulling bij genereren.' },
      { title: 'Post­weergave', body: 'Kies of posten gedetailleerd (per regel) of als aanneemsom worden weergegeven. Stel in welke kolommen zichtbaar zijn voor de klant en welke alleen intern.' },
      { title: 'Voorwaarden', body: 'Voer standaard betalings­voorwaarden, uitsluitingen en overige opmerkingen in. Teksten ondersteunen Markdown voor opmaak.' },
    ],
  }],

  [/^\/everts-calc\/instellingen\/offertes\/layouts$/, {
    title: 'EvertsCalc — Offerte layouts',
    description: 'Beheer meerdere offerte­lay-outs voor verschillende klanttypen of werksoorten. Stel een standaard­lay-out in die automatisch wordt geselecteerd bij nieuwe offertes.',
  }],

  [/^\/everts-calc\/instellingen\/offertes$/, {
    title: 'EvertsCalc — Offerte­instellingen',
    description: 'Configureer standaard­instellingen voor nieuwe offertes: geldigheids­duur, betalings­termijn, standaard BTW-tarief en verplichte velden.',
    sections: [
      { title: 'Geldigheids­duur', body: 'Stel het standaard aantal dagen in dat een offerte geldig is (bijv. 30 dagen). Na het verstrijken van de geldigheidsdatum wordt de offerte automatisch als "Verlopen" gemarkeerd.' },
      { title: 'BTW­tarieven', body: 'Stel het standaard BTW-tarief in (21% of 9% voor woningen ouder dan 2 jaar). Per offerte­regel kun je het tarief nog overschrijven.' },
    ],
  }],

  [/^\/everts-calc\/instellingen$/, {
    title: 'EvertsCalc — Instellingen',
    description: 'Configureer de EvertsCalc­module: uurtarieven per discipline, offerte­instellingen, standaard lay-outs en marges.',
    sections: [
      { title: 'Uurtarieven', body: 'Stel het verkoopuurtarief per discipline in (Schilder, Timmerman, Voorman). Dit tarief wordt als standaard gebruikt bij het aanmaken van arbeids­regels in calculaties.' },
      { title: 'Offerte­instellingen', body: 'Geldigheids­duur, betalings­termijn, standaard BTW-tarief en verplichte velden voor nieuwe offertes.' },
      { title: 'Lay-outs', body: 'Beheer offerte­lay-outs voor verschillende klanttypen. Stel een standaard­lay-out in.' },
    ],
  }],

  [/^\/everts-calc$/, {
    title: 'EvertsCalc',
    description: 'De calculatie- en offerte­tool van Everts. Maak gedetailleerde calculaties op basis van behandelingen, materialen en arbeidsnormen en genereer professionele offertes.',
    sections: [
      { title: 'Werkwijze', body: '1. Maak een nieuwe offerte aan via de wizard. 2. Voer de meetstaat in per werksoort. 3. EvertsCalc berekent kostprijs en verkoopprijs automatisch. 4. Bekijk de preview. 5. Stuur de offerte naar de klant.' },
      { title: 'Bibliotheek actueel houden', body: 'De nauwkeurigheid van calculaties staat of valt met actuele arbeidsnormen en materiaal­prijzen in de bibliotheek. Actualiseer materialen na elke leveranciers­prijswijziging.' },
    ],
  }],

  // ── Formulieren ────────────────────────────────────────────────────────

  [/^\/formulieren\/[^/]+\/bewerken$/, {
    title: 'Formulier­builder',
    description: 'De visuele editor voor het bouwen van digitale formulieren. Het scherm is verdeeld in drie panelen: links de veldtypen, midden het formulier­canvas, rechts de veldinstellingen.',
    sections: [
      { title: 'Veld toevoegen', body: 'Klik in het linker­paneel op een veldtype om het direct onderaan het formulier toe te voegen. Kies uit Tekst, Getal, Datum, Dropdown, Meerkeuze, Foto upload, Handtekening, GPS-locatie en meer.' },
      { title: 'Volgorde aanpassen', body: 'Pak het zes-punten icoontje aan de linkerkant van een veld en sleep het naar de gewenste positie. Je kunt ook de pijl­toetsen gebruiken nadat je een veld hebt geselecteerd.' },
      { title: 'Veld instellen', body: 'Klik op een veld in het canvas om het te selecteren. In het rechter­paneel stel je het label, de interne veldnaam, placeholder­tekst, verplicht­stelling en helptekst in. Bij dropdown en meerkeuze­velden voeg je de opties toe.' },
      { title: 'Dupliceren en verwijderen', body: 'Elk veld heeft een dupliceer­knop (twee pagina\'s) en een verwijder­knop (prullenbak). Dupliceren is handig om een ingevuld veld als basis voor een vergelijkbaar nieuw veld te gebruiken.' },
      { title: 'Condities instellen', body: 'In het rechter­paneel vind je de sectie "Condities". Voeg een conditie toe om een veld alleen te tonen als een ander veld een bepaalde waarde heeft. Voorbeeld: toon "Omschrijving schade" alleen als "Schade aanwezig" = Ja.' },
      { title: 'Voorbeeld bekijken', body: 'Klik op "Voorbeeld" in de werkbalk om te zien hoe het formulier eruitziet voor de invuller. In de voorbeeldmodus kun je niets bewerken.' },
      { title: 'Opslaan', body: 'Klik op "Opslaan" om het formulier als concept op te slaan. Elke opslag maakt een nieuwe versie aan. Bestaande ingevulde formulieren blijven altijd gekoppeld aan de versie waarop ze zijn ingevuld.' },
      { title: 'Publiceren', body: 'Klik op "Publiceren" om het formulier beschikbaar te maken voor invullers. Na publiceren is het formulier zichtbaar via de "Invullen"-knop op de formulieren­pagina. Een gepubliceerd formulier kan nog steeds worden bewerkt — dat maakt automatisch een nieuwe versie.' },
    ],
  }],

  [/^\/formulieren\/[^/]+\/invullen$/, {
    title: 'Formulier invullen',
    description: 'Het invulscherm voor een gepubliceerd formulier. Vul alle velden in en sla op als concept of dien definitief in.',
    sections: [
      { title: 'Invullen', body: 'Doorloop de velden van boven naar beneden. Verplichte velden zijn gemarkeerd met een rood sterretje (*). Velden die door een conditie verborgen zijn, verschijnen automatisch zodra aan de conditie wordt voldaan.' },
      { title: 'Opslaan als concept', body: 'Klik op "Opslaan als concept" om tussentijds op te slaan zonder in te dienen. Je kunt later verdergaan. Concepten worden ook automatisch bewaard in de browser (lokale opslag), zodat je geen gegevens verliest bij een onverwacht verlies van verbinding.' },
      { title: 'Indienen', body: 'Klik op "Indienen" om het formulier definitief in te sturen. EVA controleert of alle verplichte velden zijn ingevuld. Na indienen is het formulier niet meer aanpasbaar en verschijnt het in het inzendingen­overzicht.' },
      { title: 'Foto\'s en handtekening', body: 'Gebruik de foto­upload om direct foto\'s te maken met de camera (op mobiel) of te uploaden vanuit je bestanden. Voor de handtekening teken je in het kader met je vinger (mobiel) of muis.' },
    ],
  }],

  [/^\/formulieren\/[^/]+\/inzendingen\/[^/]+$/, {
    title: 'Inzending detail',
    description: 'Gedetailleerd overzicht van één ingevuld formulier met alle antwoorden. Hier kun je de inzending controleren en als PDF downloaden.',
    sections: [
      { title: 'Antwoorden bekijken', body: 'Alle velden en antwoorden worden overzichtelijk naast elkaar weergegeven. Foto\'s worden als miniatuur getoond, handtekeningen als afbeelding.' },
      { title: 'PDF downloaden', body: 'Klik op "Downloaden als PDF" om een PDF-rapport te genereren met alle veldwaarden. De PDF bevat het formulier­naam, datum van indiening, versienummer en alle ingevulde waarden.' },
      { title: 'Status', body: 'Een inzending heeft één van vier statussen: Concept (nog niet ingediend), Ingediend, Goedgekeurd of Afgekeurd. De status is zichtbaar als badge rechtsboven.' },
    ],
  }],

  [/^\/formulieren\/[^/]+\/inzendingen$/, {
    title: 'Formulier — Inzendingen',
    description: 'Overzicht van alle ingevulde exemplaren van dit formulier. Filter op status, zoek op datum of project­referentie en klik op een inzending voor de volledige inhoud.',
    sections: [
      { title: 'Filteren', body: 'Gebruik de status­filter (Alle / Concept / Ingediend / Goedgekeurd / Afgekeurd) en de zoekbalk om snel de juiste inzending te vinden. Sorteer op nieuwste of oudste inzending.' },
      { title: 'Inzending openen', body: 'Klik op het oog­icoontje aan het einde van een rij om de volledige inzending te bekijken, inclusief foto\'s, handtekeningen en alle antwoorden.' },
      { title: 'PDF per inzending', body: 'Op de detail­pagina van een inzending kun je een PDF­rapport downloaden met alle veldwaarden netjes opgemaakt.' },
    ],
  }],

  [/^\/formulieren\/nieuw$/, {
    title: 'Nieuw formulier aanmaken',
    description: 'Maak een nieuw digitaal formulier aan. Geef het formulier een naam, kies de categorie en voeg een korte omschrijving toe voor medewerkers.',
    sections: [
      { title: 'Naam', body: 'Kies een duidelijke, herkenbare naam die het type formulier beschrijft. Medewerkers zien deze naam in het overzicht en bij het invullen. Voorbeelden: "Werkbon houtrotherstel", "Veiligheids­checklist steiger", "Oplevering binnenschilderwerk".' },
      { title: 'Categorie', body: 'Kies de meest passende categorie: Werkbon, Inspectie, Oplevering, Checklist of Overig. De categorie helpt bij het filteren in het overzicht maar heeft geen invloed op de werking van het formulier.' },
      { title: 'Omschrijving', body: 'De omschrijving is optioneel en wordt getoond op de formulieren­pagina als toelichting voor medewerkers. Gebruik het om aan te geven voor welke situatie het formulier bedoeld is.' },
      { title: 'Volgende stap', body: 'Na het aanmaken word je direct doorgestuurd naar de formulier­builder om velden toe te voegen en in te stellen. Het formulier is aangemaakt als "Concept" en nog niet zichtbaar voor medewerkers. Publiceer het pas als de inhoud klaar is.' },
    ],
  }],

  [/^\/kam$/, {
    title: 'KAM / VGM',
    description: 'Kwaliteit, Arbo en Milieu — centraal overzicht van alle ingediende KAM-formulieren: inspecties, toolbox-meetings, VCA-registraties en kwaliteitscontroles.',
    sections: [
      { title: 'KAM-formulieren aanmaken', body: 'Ga naar Formulieren, open de form builder en klik op "Instellingen" in de toolbar. Zet het vinkje "KAM/VGM-formulier" aan. Alle inzendingen van dit formulier verschijnen automatisch in dit overzicht.' },
      { title: 'Filteren en zoeken', body: 'Filter op status (concept, ingediend, goedgekeurd, afgekeurd), op formulier-type of op datum-range. Gebruik de zoekbalk voor een project­referentie of formulier-naam.' },
      { title: 'Exporteren', body: 'Klik op "Exporteer Excel" om alle gefilterde inzendingen als .xlsx-bestand te downloaden. Handig voor audits, rapportages of archivering.' },
      { title: 'VCA-tab op opdrachten', body: 'Op de detailpagina van een opdracht, tabblad VCA, zie je welke KAM-formulieren zijn ingediend voor die specifieke opdracht en de VCA-status van de betrokken medewerkers.' },
    ],
  }],

  [/^\/instellingen\/formulieren-pdf$/, {
    title: 'Instellingen — Formulier PDF-opmaak',
    description: 'Stel de universele opmaak in voor alle PDF-rapporten van ingediende formulieren. Logo, datum, invuller en projectreferentie worden automatisch toegevoegd aan elke PDF.',
    sections: [
      { title: 'Logo', body: 'Het logo wordt automatisch opgehaald uit de huisstijl-instellingen (Instellingen → Huisstijl → Hoofdlogo). Upload het logo daar als het nog ontbreekt.' },
      { title: 'Koptekst-inhoud', body: 'Schakel per onderdeel in of uit: logo, naam invuller + datum, projectreferentie. Deze verschijnen bovenaan elke PDF.' },
      { title: 'Kop- en voettekst', body: 'Vrije tekst die respectievelijk onder het logo en onderaan elke pagina verschijnt. Gebruik dit voor een disclaimer ("Intern document"), bedrijfsnaam of websiteadres.' },
      { title: 'Voorbeeld bekijken', body: 'Ga naar de form builder en klik op de "PDF"-knop in de toolbar. Je ziet direct een voorbeeld-PDF met de huidige opmaak-instellingen en dummy-data.' },
    ],
  }],

  [/^\/formulieren$/, {
    title: 'Formulieren',
    description: 'Beheer al je digitale formulieren: werkbonnen, inspecties, opleveringen en checklists. Maak nieuwe formulieren aan, publiceer ze en bekijk de inzendingen van medewerkers.',
    sections: [
      { title: 'Nieuw formulier aanmaken', body: 'Klik op de groene knop "Nieuw formulier" rechtsboven. Geef het formulier een naam en categorie. Je wordt direct doorgestuurd naar de formulier­builder om velden toe te voegen.' },
      { title: 'Formulier bouwen', body: 'In de builder voeg je velden toe door op een veldtype in de linker­kolom te klikken: tekst, getal, datum, dropdown, foto­upload, handtekening en meer. Klik op een veld om het label, verplicht­stelling en condities in te stellen.' },
      { title: 'Publiceren', body: 'Een nieuw formulier heeft status "Concept" en is nog niet invulbaar. Klik op "Publiceren" in de builder (of gebruik de bewerkknop op de kaart) om het formulier beschikbaar te maken. Gepubliceerde formulieren krijgen een groene "Invullen"-knop.' },
      { title: 'Invullen', body: 'Klik op "Invullen" op een gepubliceerde formulierkaart om het formulier te openen als invulscherm. Medewerkers kunnen het formulier opslaan als concept of definitief indienen.' },
      { title: 'Inzendingen bekijken', body: 'Klik op "Inzendingen" om alle ingediende formulieren te zien. Je kunt filteren op status (concept/ingediend) en elke inzending als PDF exporteren.' },
      { title: 'Statussen', body: 'Concept = formulier is in bewerking, nog niet invulbaar. Gepubliceerd = medewerkers kunnen het invullen. Gearchiveerd = niet meer in gebruik, inzendingen blijven bewaard.' },
    ],
  }],
]

export function getPageHelp(pathname: string): PageHelp | null {
  for (const [pattern, help] of PAGE_HELP) {
    if (pattern.test(pathname)) return help
  }
  return null
}
