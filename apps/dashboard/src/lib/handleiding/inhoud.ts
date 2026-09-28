/**
 * inhoud.ts — de tekst van de gebruikershandleiding voor EVA Mobiel.
 *
 * Eén bron voor één doelgroep: de collega die met de telefoon in de bus of op de steiger staat.
 * Alles wat alleen op de desktop bestaat (calculatie, offertes, facturatie, relatiebeheer) hoort
 * hier bewust NIET in — dat is kantoorwerk en zou de handleiding twee keer zo dik maken zonder dat
 * de lezer er iets aan heeft.
 *
 * De tekst staat als gegevens en niet als kant-en-klare PDF in de repo, om twee redenen. Een
 * meegeleverd binair bestand veroudert stilletjes: het wordt niet meegelezen bij een wijziging aan
 * een scherm, en niemand ziet in een diff dat de handleiding nog de oude knop beschrijft. En een
 * losse PDF zou het bedrijfslogo en de bedrijfsnaam vastzetten, terwijl die uit
 * `bedrijfsgegevens` horen te komen (zie lib/pdf/afzender.ts).
 *
 * `pdf.ts` zet dit om naar papier. Wil je de handleiding ooit ook als scherm in de app, dan is dit
 * bestand daar de bron voor — vandaar de blokvormen in plaats van kale alinea's.
 *
 * SCHRIJFSTIJL — dit wordt gelezen door monteurs, niet door ontwikkelaars:
 *  - noem wat er op het scherm staat ("de groene knop Week indienen"), geen routes of tabelnamen;
 *  - korte zinnen, actief, en per stap één handeling;
 *  - geen jargon: geen "dossier-id", geen "bewakingscode" zonder uitleg, geen "RLS".
 */

export type HandleidingBlok =
  | { type: 'tekst'; tekst: string }
  | { type: 'kop'; tekst: string }
  | { type: 'lijst'; items: string[] }
  | { type: 'stappen'; items: string[] }
  | { type: 'let-op'; tekst: string }

export type HandleidingHoofdstuk = {
  /** Verschijnt in de inhoudsopgave en boven het hoofdstuk. */
  titel: string
  /** Eén regel onder de titel: waar dit over gaat. */
  intro?: string
  blokken: HandleidingBlok[]
}

export const HANDLEIDING_TITEL = 'EVA op je telefoon'
export const HANDLEIDING_ONDERTITEL = 'Handleiding voor de buitendienst'

/**
 * De hoofdstukken, in de volgorde waarin iemand ze de eerste week nodig heeft: eerst binnenkomen,
 * dan het startscherm, dan de onderdelen in de volgorde van de tegels op dat scherm.
 */
export const HANDLEIDING_HOOFDSTUKKEN: HandleidingHoofdstuk[] = [
  {
    titel: '1. Inloggen en EVA op je telefoon zetten',
    intro: 'Eenmalig regelen. Daarna open je EVA als een gewone app.',
    blokken: [
      { type: 'kop', tekst: 'Welke manier is voor jou?' },
      {
        type: 'tekst',
        tekst:
          'Er zijn twee manieren om in te loggen. Welke voor jou geldt, hangt af van je e-mailadres.',
      },
      {
        type: 'lijst',
        items: [
          'Heb je een adres dat eindigt op @everts.chat — hetzelfde adres waarop je je mail '
          + 'ontvangt — dan log je in met Microsoft. Je hoeft geen wachtwoord aan te maken.',
          'Heb je dat niet, dan log je in met je e-mailadres en een wachtwoord dat je zelf kiest. '
          + 'Daarvoor krijg je een uitnodigingsmail.',
        ],
      },
      {
        type: 'let-op',
        tekst:
          'Iedereen heeft precies één account. Heb je een @everts.chat-adres, dan kun je op dat adres '
          + 'geen wachtwoord instellen: EVA laat dat niet toe en zegt dat ook. Dat is met opzet — twee '
          + 'inlogs voor één persoon betekent dat je er met geen van beide meer in komt.',
      },

      { type: 'kop', tekst: 'Inloggen met Microsoft (@everts.chat)' },
      {
        type: 'stappen',
        items: [
          'Open EVA op je telefoon via het adres dat je van kantoor kreeg.',
          'Tik onderaan op de knop Inloggen met Microsoft.',
          'Log in met je werkaccount: hetzelfde account waarmee je je mail opent.',
          'Je komt daarna vanzelf op het startscherm van EVA.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Je hoeft niets te activeren en geen wachtwoord aan te maken. Vraagt Microsoft om een '
          + 'bevestiging op je telefoon of in de Authenticator, dan hoort dat erbij: dat is dezelfde '
          + 'beveiliging als bij je mail. De velden voor e-mail en wachtwoord bovenaan het inlogscherm '
          + 'sla je over.',
      },

      { type: 'kop', tekst: 'Inloggen met e-mail en wachtwoord' },
      {
        type: 'stappen',
        items: [
          'Open de uitnodigingsmail die je van kantoor kreeg.',
          'Tik op de groene knop Wachtwoord instellen.',
          'Kies een wachtwoord dat je onthoudt en bevestig het.',
          'Vanaf dan log je in met je e-mailadres en dat wachtwoord, in de twee velden bovenaan het '
          + 'inlogscherm.',
        ],
      },
      {
        type: 'let-op',
        tekst:
          'De link in de mail is maar beperkte tijd geldig. Werkt hij niet meer, vraag dan op '
          + 'kantoor een nieuwe uitnodiging aan. Je hoeft niets opnieuw in te vullen.',
      },
      {
        type: 'tekst',
        tekst:
          'Ben je je wachtwoord kwijt, tik dan op "Wachtwoord vergeten of instellen". Vul eerst je '
          + 'e-mailadres in het bovenste veld in, anders weet EVA niet waar de link heen moet.',
      },

      { type: 'kop', tekst: 'Hoe lang blijf je ingelogd?' },
      {
        type: 'tekst',
        tekst:
          'Drie dagen, welke manier je ook gebruikt, ook als je de app tussendoor sluit. Daarna vraagt '
          + 'EVA opnieuw om in te loggen. Dat is geen storing.',
      },

      { type: 'kop', tekst: 'Op je beginscherm zetten' },
      {
        type: 'tekst',
        tekst:
          'EVA is geen app uit de App Store of Play Store. Je zet hem zelf op je beginscherm; daarna '
          + 'opent hij met een eigen pictogram, zonder adresbalk.',
      },
      {
        type: 'lijst',
        items: [
          'iPhone: open EVA in Safari, tik onderin op het deelpictogram (het vierkantje met het pijltje '
          + 'omhoog) en kies "Zet op beginscherm".',
          'Android: open EVA in Chrome, tik rechtsboven op de drie puntjes en kies "App installeren" of '
          + '"Toevoegen aan startscherm".',
        ],
      },
      {
        type: 'let-op',
        tekst:
          'EVA heeft internet nodig. Op een plek zonder bereik kun je niets opslaan; wacht tot je weer '
          + 'verbinding hebt en probeer het opnieuw.',
      },
    ],
  },

  {
    titel: '2. Het startscherm',
    intro: 'Waar je binnenkomt, en hoe je van hieruit overal komt.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'Bovenaan staat je naam en rechts een belletje. Staat er een rood getal bij het belletje, dan '
          + 'zijn er nieuwe meldingen voor je; tik erop om ze te lezen.',
      },
      {
        type: 'lijst',
        items: [
          'Vandaag — wat er vandaag voor jou gepland staat. Tik op een regel om het te openen.',
          'Te doen — korte signalen, bijvoorbeeld dat je weekstaat nog niet is ingediend. Dit blok '
          + 'verschijnt alleen als er iets is.',
          'De tegels eronder brengen je naar de onderdelen: Acties, Dossiers, Uren, Planning, Verlof, '
          + 'Materieel, Handboek en Mijn gegevens.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Welke tegels je ziet hangt af van wat er voor jou is aangezet. Mis je er een die je nodig '
          + 'hebt, vraag er dan op kantoor naar.',
      },

      { type: 'kop', tekst: 'Twee dingen die overal werken' },
      {
        type: 'lijst',
        items: [
          'Verversen: trek het scherm bovenaan naar beneden en laat los. EVA haalt dan de nieuwste stand '
          + 'op. Doe dit niet midden in een formulier — je invoer kan dan weg zijn.',
          'Terug: linksboven staat altijd een pijl terug naar het vorige scherm.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Heb je EVA toestemming gegeven voor je locatie, dan kan hij bij het openen vragen of je het '
          + 'dossier wilt openen van het adres waar je staat. Dat is een voorstel, geen verplichting: je '
          + 'kunt het altijd wegtikken. Aan- en uitzetten doe je bij Mijn gegevens, onder Instellingen.',
      },
    ],
  },

  {
    titel: '3. Acties',
    intro: 'Je persoonlijke takenlijst: alles wat aan jou is toegewezen.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'Elke regel is één actie. Onder de titel staat het project waar hij bij hoort (het blauwe '
          + 'label — tik erop om naar dat dossier te gaan), hoe dringend hij is en wanneer hij af moet '
          + 'zijn. Een rode datum betekent dat de datum voorbij is.',
      },
      {
        type: 'tekst',
        tekst:
          'Staat er een tekstballonnetje achter de titel, dan heeft de aanvrager er een toelichting bij '
          + 'gezet. Tik op de titel om die te lezen.',
      },

      { type: 'kop', tekst: 'Een actie afronden' },
      {
        type: 'lijst',
        items: [
          'Staat er een vierkantje voor de actie: tik het aan en de actie is gereed.',
          'Staat er een knop onder de actie — bijvoorbeeld een formulier, een toolbox, een projectbezoek '
          + 'of een opname — dan open je die knop en doorloop je de stappen. De actie gaat pas vanzelf op '
          + 'gereed als je die doorloop helemaal hebt afgerond.',
        ],
      },
      {
        type: 'let-op',
        tekst:
          'Een actie met zo een doorloop kun je niet los afvinken. Dat is met opzet: anders zou de '
          + 'registratie waar het om gaat — de foto’s, het formulier, de handtekening — nooit worden '
          + 'vastgelegd.',
      },

      { type: 'kop', tekst: 'Zelf een actie maken' },
      {
        type: 'stappen',
        items: [
          'Tik onderaan op de knop Nieuwe actie.',
          'Typ kort wat er moet gebeuren.',
          'Koppel er eventueel een project aan door te zoeken op naam of nummer.',
          'Kies aan wie hij is — standaard aan jezelf — en hoe dringend hij is.',
          'Vul eventueel een datum in waarop hij af moet zijn en sla op.',
        ],
      },
    ],
  },

  {
    titel: '4. Dossiers',
    intro: 'De projecten waar jij op staat, met de informatie die je in het veld nodig hebt.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'In de lijst staat alleen werk dat nog loopt. Projecten die klaar zijn en alleen nog '
          + 'administratief worden afgerond, verdwijnen vanzelf uit je lijst.',
      },
      {
        type: 'tekst',
        tekst:
          'Open je een dossier, dan kom je op Info. Bovenin staat een rij tabs die je opzij kunt '
          + 'schuiven. Niet elk dossier heeft alle tabs: wat er niet is, staat er ook niet.',
      },
      {
        type: 'lijst',
        items: [
          'Info — het werkadres, de opdrachtgever, de contactpersoon met een belknop, de begin- en '
          + 'einddatum en wie welke rol heeft (projectleider, uitvoerder, calculator). Daaronder staan de '
          + 'acties die bij dit dossier horen.',
          'Planning — wat er wanneer gebeurt en wie erop staat. Draai je telefoon dwars voor een '
          + 'balkenweergave over de tijd.',
          'Voortgang — hoeveel werk gereed is, naast de uren die eraan besteed zijn. Daar staat in gewone '
          + 'taal bij of het werk voor- of achterloopt.',
          'Oplevering — de opleverpunten en wat er nog open staat.',
          'Formulieren — de formulieren die voor dit project zijn ingevuld.',
          'Bestanden — tekeningen en documenten. Je ziet alleen wat kantoor voor de app heeft '
          + 'vrijgegeven; de rest staat er met opzet niet op.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Bedragen, marges en facturen staan niet op de telefoon. Die horen bij het kantoorwerk en zie '
          + 'je alleen op de computer.',
      },
    ],
  },

  {
    titel: '5. Uren',
    intro: 'Je weekstaat: per dag invullen, aan het eind van de week in één keer indienen.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'Bovenaan zie je hoeveel uur je deze week hebt staan tegenover je contracturen, je saldo, en in '
          + 'welke stand je week staat. Met de pijlen links en rechts blader je naar een andere week.',
      },

      { type: 'kop', tekst: 'Uren invullen' },
      {
        type: 'stappen',
        items: [
          'Zoek de dagkaart van de dag die je wilt invullen.',
          'Tik op "+ Uren toevoegen".',
          'Kies eerst wat je deed: gewerkt, tijd voor tijd, niet gewerkt of feestdag.',
          'Heb je gewerkt, kies dan het project. De projecten waar jij op staat, staan bovenaan.',
          'Kies daarna waaraan je hebt gewerkt. Je kiest uit het werk dat voor dit project is begroot.',
          'Zet het aantal uren met de plus- en minknoppen; elke tik is een kwartier.',
          'Zet er eventueel een korte opmerking bij en sla op.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Staat er "automatisch" achter een regel, dan komt die uit de planning. Klopt hij niet, pas hem '
          + 'dan gewoon aan — er komt dan "aangepast" te staan. Met het potloodje wijzig je een regel, met '
          + 'het kruisje haal je hem weg.',
      },

      { type: 'kop', tekst: 'Parkeer- en reiskosten' },
      {
        type: 'lijst',
        items: [
          'Tik op de dagkaart op "+ Kosten".',
          'Parkeren, openbaar vervoer of overig: vul het bedrag in en maak een foto van de bon. Zonder bon '
          + 'kun je deze kosten niet opslaan.',
          'Auto of bromfiets: vul het aantal kilometers in. EVA rekent het bedrag zelf uit.',
        ],
      },

      { type: 'kop', tekst: 'Indienen' },
      {
        type: 'tekst',
        tekst:
          'Onderaan staat de groene knop Week indienen. Daarna kun je de week niet meer wijzigen. Staat er '
          + 'een oranje regel boven de knop, dan ontbreekt er nog iets — dat staat er dan bij.',
      },
      {
        type: 'lijst',
        items: [
          'Nog niet ingediend — je kunt nog alles aanpassen.',
          'Ingediend — je week wacht op je teamleider.',
          'Teamleider akkoord — je week wacht nog op de projectleiders.',
          'Goedgekeurd — klaar.',
          'Afgekeurd — de reden staat erbij. Pas je week aan en dien hem opnieuw in.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Ben je teamleider of projectleider, dan staat boven je weekstaat de regel "Uren fiatteren". '
          + 'Daar staan de uren die op jouw akkoord wachten.',
      },
    ],
  },

  {
    titel: '6. Planning',
    intro: 'Je eigen agenda, om te kijken.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'Bovenin staat de maand met een stipje op elke dag waarop iets staat. Tik een dag aan en je ziet '
          + 'eronder wat er die dag is. Vegen brengt je naar een andere maand.',
      },
      {
        type: 'lijst',
        items: [
          'Het werk waarvoor jij bent ingepland.',
          'Je goedgekeurde verlof en ziekmeldingen.',
          'De bedrijfsagenda en de feestdagen.',
          'Je eigen acties met een datum waarop ze af moeten zijn.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Deze agenda is om te lezen. Klopt er iets niet, geef dat dan door aan de planner — wijzigen '
          + 'gebeurt op kantoor.',
      },
    ],
  },

  {
    titel: '7. Verlof',
    intro: 'Vrij vragen en je aanvragen volgen.',
    blokken: [
      { type: 'tekst', tekst: 'Bovenaan staat je saldo. Daaronder staan je aanvragen, de nieuwste eerst.' },
      {
        type: 'stappen',
        items: [
          'Tik op de knop om een aanvraag te maken.',
          'Kies de soort, bijvoorbeeld vakantie of tijd voor tijd.',
          'Kies de eerste en de laatste dag.',
          'Wil je maar een deel van een dag vrij, zet dan hele dagen uit en vul een begin- en eindtijd in.',
          'Zet er eventueel een toelichting bij en verstuur.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Zodra je een periode hebt gekozen, laat EVA zien hoeveel uur het je kost. Weekenden en '
          + 'feestdagen tellen daar niet in mee, dus dat is het getal dat straks van je saldo af gaat.',
      },
      {
        type: 'let-op',
        tekst:
          'Een deel van een dag kan alleen voor één dag tegelijk. Wil je meerdere middagen vrij, vraag ze '
          + 'dan los aan.',
      },
      {
        type: 'lijst',
        items: [
          'Wacht op akkoord — nog niet beoordeeld. Zolang dit er staat, kun je de aanvraag zelf intrekken.',
          'Goedgekeurd — je verlof staat in de planning en wordt vanzelf in je weekstaat gezet.',
          'Afgewezen of ingetrokken — er is niets vastgelegd.',
        ],
      },
    ],
  },

  {
    titel: '8. Materieel',
    intro: 'Gereedschap en machines: waar staat het, van wie is het, en werkt het nog.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'Bovenaan staat wat op jouw naam staat. Daaronder zoek je in al het materieel. Je kunt zoeken op '
          + 'wat er op het gereedschap zelf staat: het merk, het type, het serienummer of het nummer van de '
          + 'keuringssticker.',
      },

      { type: 'kop', tekst: 'Scannen' },
      {
        type: 'stappen',
        items: [
          'Tik onderaan op Sticker scannen. Mag je ook materieel toevoegen, tik dan op Toevoegen en kies '
          + 'Sticker scannen.',
          'Houd de camera voor de QR-sticker.',
          'Je komt meteen op het paspoort van dat stuk materieel.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Lukt scannen niet — vieze sticker, slecht licht — zoek het dan op via het zoekveld. Dat komt op '
          + 'hetzelfde scherm uit.',
      },

      { type: 'kop', tekst: 'Op het paspoort' },
      {
        type: 'lijst',
        items: [
          'Op mijn naam zetten — je neemt het mee.',
          'Inleveren — het staat niet meer op jouw naam.',
          'Storing melden — beschrijf kort wat er mis is. Het materieel komt daarna op defect te staan, '
          + 'zodat een ander er niet mee wegrijdt.',
        ],
      },
      {
        type: 'let-op',
        tekst:
          'Beschrijf bij een storing wat er aan de hand is. Zonder omschrijving staat er alleen dat het '
          + 'kapot is, en weet de werkplaats niet waar hij moet beginnen.',
      },
    ],
  },

  {
    titel: '9. Handboek',
    intro: 'De afspraken van het bedrijf, en wat je moet doen als er iets gebeurt.',
    blokken: [
      {
        type: 'lijst',
        items: [
          'Wat te doen bij... — korte stappenplannen voor situaties als een ongeval, schade of ziekte.',
          'De hoofdstukken met de afspraken: werktijden, kleding, veiligheid, verlof.',
          'Bijlagen: documenten die bij het handboek horen.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Weet je niet in welk hoofdstuk iets staat, gebruik dan het zoekveld bovenaan. Je ziet alleen de '
          + 'hoofdstukken die voor jou gelden.',
      },
    ],
  },

  {
    titel: '10. Mijn gegevens',
    intro: 'Wat er over jou is vastgelegd. En onderaan de knoppen voor de app zelf.',
    blokken: [
      {
        type: 'tekst',
        tekst:
          'Bovenaan staan je foto, je naam, je functie en het e-mailadres waarmee je inlogt. Daaronder '
          + 'staat per blok wat de administratie van je heeft vastgelegd.',
      },
      {
        type: 'lijst',
        items: [
          'Persoonlijk — je e-mailadres, telefoonnummer, geboortedatum en adres.',
          'Werk — je functie, afdeling, ploeg en sinds wanneer je in dienst bent.',
          'Werkrooster — op welke dagen je werkt, je begin- en eindtijd, je pauzes en je contracturen '
          + 'per week.',
          'Bedrijfsmiddelen — de sleutels, telefoons en tankpassen die op jouw naam staan.',
          'VCA-diploma — welk diploma, het nummer en tot wanneer het geldig is. Loopt het bijna af, dan '
          + 'staat dat erbij.',
        ],
      },
      {
        type: 'tekst',
        tekst:
          'Is er over een onderwerp niets vastgelegd, dan wordt dat blok weggelaten. Een leeg scherm '
          + 'betekent dus niet dat er iets stuk is.',
      },
      {
        type: 'let-op',
        tekst:
          'Deze gegevens zijn om te lezen; je kunt ze hier niet aanpassen. Klopt er iets niet — een oud '
          + 'adres, een verkeerd telefoonnummer — geef het dan door aan de administratie. Staat er geen '
          + 'VCA-diploma terwijl je er wel een hebt, geef dat door aan KAM.',
      },

      { type: 'kop', tekst: 'Instellingen' },
      {
        type: 'tekst',
        tekst:
          'Onder je gegevens staat de knop Instellingen. Dat is het enige op dit scherm wat je zelf kunt '
          + 'veranderen; het gaat over de app, niet over jou.',
      },
      {
        type: 'lijst',
        items: [
          'Toestemmingen — geef EVA toegang tot je locatie en je camera. Doe dat hier, rustig, in plaats '
          + 'van midden in een formulier of met een rol stickers in je hand.',
          'Meldingen — zet meldingen op je telefoon aan, zodat je het ziet als er iets voor je klaarstaat.',
          'Dossier openen op locatie — aan of uit.',
        ],
      },
      {
        type: 'let-op',
        tekst:
          'Heb je een toestemming een keer geweigerd, dan kan EVA er niet opnieuw om vragen. Je zet hem dan '
          + 'aan in de instellingen van je telefoon, bij de browser of bij EVA. Op het scherm staat hoe.',
      },

      { type: 'kop', tekst: 'Handleiding en uitloggen' },
      {
        type: 'lijst',
        items: [
          'Handleiding — dit boekje, altijd de laatste versie. Handig als je de mail met de bijlage kwijt '
          + 'bent.',
          'Uitloggen — helemaal onderaan.',
        ],
      },
    ],
  },

  {
    titel: '11. Als iets niet werkt',
    blokken: [
      {
        type: 'lijst',
        items: [
          'Scherm laat oude informatie zien: trek het bovenaan naar beneden om te verversen.',
          'Niets laadt: kijk of je bereik hebt. EVA werkt alleen met internet.',
          'Hij vraagt om inloggen: dat hoort zo, na drie dagen. Log opnieuw in op de manier die voor '
          + 'jou geldt — met Microsoft, of met je e-mailadres en wachtwoord.',
          'Wachtwoord kwijt: tik op het inlogscherm op "Wachtwoord vergeten of instellen". Heb je een '
          + '@everts.chat-adres, dan zegt EVA dat je met de Microsoft-knop inlogt; er komt dan geen '
          + 'link, en dat hoort zo.',
          'Er staat "Je account heeft geen toegang tot EVA": bel kantoor. Er moet dan iets aan je '
          + 'account worden gezet; dat kun je zelf niet.',
          'Een tegel of een tab ontbreekt: die is voor jou niet aangezet. Vraag er op kantoor naar.',
          'Iets anders: bel of mail kantoor. Vertel erbij op welk scherm je stond en wat je deed — dan is '
          + 'het meestal zo gevonden.',
        ],
      },
    ],
  },
]
