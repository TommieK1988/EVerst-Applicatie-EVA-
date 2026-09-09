/**
 * sjablonen.ts — de lijst van e-mails die EVA zelf verstuurt.
 *
 * Elke mail die niet aan een Word-sjabloon hangt staat hier: waar hij vandaan gaat, welke
 * variabelen erin mogen, en de standaardtekst. Instellingen → E-mailsjablonen toont deze lijst en
 * schrijft afwijkingen naar de tabel `mail_sjablonen`. Zolang daar niets staat, gaat de mail met de
 * standaardtekst hieronder de deur uit — een lege tabel verandert dus niets aan wat klanten krijgen.
 *
 * BEWUST GEEN server-only import: het beheerscherm is een client-component en toont dezelfde
 * variabelen-uitleg en standaardteksten als de verzendkant gebruikt.
 *
 * De mailteksten van inkooporders, onderaannemerscontracten en de briefsjablonen staan hier NIET:
 * die horen bij hun documentsjabloon (Instellingen → Documentsjablonen), omdat de bijlage en de
 * begeleidende tekst bij elkaar horen. Het beheerscherm toont ze wel, in een eigen blok.
 */

export const MAIL_SOORTEN = [
  'offerte',
  'uitvraag',
  'uitvraag_rappel',
  'oplever_rapportage',
  'oplever_herinnering',
  'oplever_feedback',
  'portaal_uitnodiging',
  'portaal_inloglink',
  'portaal_bericht',
  'gebruiker_uitnodiging_platform',
  'gebruiker_uitnodiging_app',
] as const

export type MailSoort = (typeof MAIL_SOORTEN)[number]

export function isMailSoort(v: string | null | undefined): v is MailSoort {
  return !!v && (MAIL_SOORTEN as readonly string[]).includes(v)
}

export type MailGroep = 'Offerte & inkoop' | 'Oplevering' | 'Klantportaal' | 'Medewerkers'

export const MAIL_GROEPEN: MailGroep[] = ['Offerte & inkoop', 'Oplevering', 'Klantportaal', 'Medewerkers']

export type MailVariabele = { sleutel: string; uitleg: string }

export interface MailSoortInfo {
  soort: MailSoort
  label: string
  groep: MailGroep
  /** Wanneer gaat deze mail de deur uit, en naar wie. */
  wanneer: string
  variabelen: MailVariabele[]
  /** Stukken die EVA zelf opmaakt; alleen bruikbaar in deze mail. */
  blokken: MailVariabele[]
  standaard: { onderwerp: string; tekst: string }
}

const AFZENDER: MailVariabele = { sleutel: 'afzender.naam', uitleg: 'Naam van de medewerker die verstuurt' }
const KNOP: MailVariabele = { sleutel: 'knop', uitleg: 'De groene knop met de link' }

export const MAIL_SOORT_INFO: Record<MailSoort, MailSoortInfo> = {
  offerte: {
    soort: 'offerte',
    label: 'Offerte versturen',
    groep: 'Offerte & inkoop',
    wanneer: 'Naar de opdrachtgever, bij het verzenden van een goedgekeurde offerte. De verzender kan de tekst in het verzendvenster nog aanpassen.',
    variabelen: [
      { sleutel: 'offerte.nummer', uitleg: 'Offertenummer' },
      { sleutel: 'offerte.titel', uitleg: 'Titel van de offerte' },
      { sleutel: 'offerte.datum', uitleg: 'Offertedatum' },
      { sleutel: 'offerte.geldig_tot', uitleg: 'Geldig tot' },
      { sleutel: 'offerte.referentie', uitleg: 'Referentie van de opdrachtgever' },
      { sleutel: 'klant.bedrijf_of_naam', uitleg: 'Bedrijfsnaam, of persoonsnaam bij particulier' },
      { sleutel: 'dossier.contactpersoon', uitleg: 'Contactpersoon van het dossier' },
      { sleutel: 'contactpersoon.aanspreekvorm', uitleg: 'heer / mevrouw' },
      { sleutel: 'dossier.werkadres', uitleg: 'Werkadres' },
      { sleutel: 'bedrijf.naam', uitleg: 'Onze bedrijfsnaam' },
    ],
    blokken: [],
    standaard: {
      onderwerp: 'Offerte {offerte.nummer} — {offerte.titel}',
      tekst: [
        'Geachte {dossier.contactpersoon},',
        '',
        'Hierbij ontvangt u onze offerte {offerte.nummer} voor {offerte.titel}.',
        'De offerte is geldig tot {offerte.geldig_tot}. Onze algemene voorwaarden zijn als bijlage toegevoegd.',
        '',
        'Heeft u vragen? Neem gerust contact met ons op.',
        '',
        'Met vriendelijke groet,',
        '{bedrijf.naam}',
      ].join('\n'),
    },
  },

  uitvraag: {
    soort: 'uitvraag',
    label: 'Uitvraag — prijsopgave vragen',
    groep: 'Offerte & inkoop',
    wanneer: 'Naar een onderaannemer of leverancier, vanaf het Uitvraag-tab van een dossier. EVA zet de tabel met het werk zelf boven de afsluitende groet.',
    variabelen: [
      { sleutel: 'partij.naam', uitleg: 'Naam van de uitgevraagde partij' },
      { sleutel: 'discipline', uitleg: 'Onderdeel waarvoor prijs wordt gevraagd' },
      { sleutel: 'dossier.nummer', uitleg: 'Dossiernummer' },
      { sleutel: 'dossier.titel', uitleg: 'Titel van het dossier' },
      { sleutel: 'dossier.werkadres', uitleg: 'Werkadres' },
      { sleutel: 'reactie.uiterlijk', uitleg: 'Datum waarop de offerte binnen moet zijn' },
      { sleutel: 'dossier.plaats', uitleg: 'Plaats van het werkadres' },
    ],
    blokken: [],
    standaard: {
      onderwerp: 'Prijsopgave gevraagd — {dossier.nummer} {dossier.titel}',
      tekst: [
        'Goedemiddag,',
        '',
        'Voor onderstaand project vragen wij u een prijsopgave voor {discipline}.',
        '',
        'Wilt u ons laten weten of u hierop kunt offreren? Aan deze aanvraag kunnen geen rechten worden ontleend; het betreft nog geen opdracht.',
        '',
        'Met vriendelijke groet,',
      ].join('\n'),
    },
  },

  uitvraag_rappel: {
    soort: 'uitvraag_rappel',
    label: 'Uitvraag — herinnering',
    groep: 'Offerte & inkoop',
    wanneer: 'Naar een partij waarvan de prijsopgave nog openstaat, vanuit het overzicht Openstaande uitvragen. EVA zet de tabel met alle openstaande uitvragen zelf boven de afsluitende groet.',
    variabelen: [
      { sleutel: 'partij.naam', uitleg: 'Naam van de uitgevraagde partij' },
      { sleutel: 'dossier.nummer', uitleg: 'Dossiernummer (bij één openstaande regel)' },
      { sleutel: 'dossier.titel', uitleg: 'Titel van het dossier (bij één openstaande regel)' },
    ],
    blokken: [],
    standaard: {
      onderwerp: 'Herinnering: openstaande prijsopgave(n)',
      tekst: [
        'Goedemiddag,',
        '',
        'Eerder vroegen wij u om een prijsopgave voor onderstaand werk. Wij hebben die nog niet ontvangen.',
        '',
        'Kunt u laten weten wanneer wij uw offerte kunnen verwachten, of dat u ervan afziet? Dan houden wij daar rekening mee in onze planning.',
        '',
        'Met vriendelijke groet,',
      ].join('\n'),
    },
  },

  oplever_rapportage: {
    soort: 'oplever_rapportage',
    label: 'Opleverrapportage versturen',
    groep: 'Oplevering',
    wanneer: 'Naar de opdrachtgever, bij het versturen van de rapportage van een oplevermoment. De PDF gaat als bijlage mee.',
    variabelen: [
      { sleutel: 'dossier.nummer', uitleg: 'Projectnummer' },
      { sleutel: 'dossier.titel', uitleg: 'Projectnaam' },
      { sleutel: 'dossier.werkadres', uitleg: 'Werkadres' },
      { sleutel: 'moment.titel', uitleg: 'Naam van het oplevermoment' },
      { sleutel: 'punten.samenvatting', uitleg: 'Zin met het aantal punten, geaccepteerd en openstaand' },
      { sleutel: 'punten.aantal', uitleg: 'Aantal opleverpunten' },
      { sleutel: 'punten.open', uitleg: 'Aantal nog openstaande punten' },
    ],
    blokken: [
      { sleutel: 'gegevens', uitleg: 'Tabelletje met project, projectnummer, werkadres en oplevering' },
      { sleutel: 'punten', uitleg: 'De lijst met opleverpunten en hun status' },
      { sleutel: 'ondertekening', uitleg: 'Regel met wie er heeft ondertekend' },
    ],
    standaard: {
      onderwerp: 'Opleverrapportage {dossier.nummer} — {moment.titel}',
      tekst: [
        '{gegevens}',
        '',
        'Hierbij de opleverrapportage van bovengenoemd project. {punten.samenvatting}',
        '',
        '{punten}',
        '',
        '{ondertekening}',
        '',
        'De volledige rapportage — inclusief foto’s en ondertekening — vindt u in de bijgevoegde PDF.',
        '',
        '[klein]Heeft u vragen over deze oplevering? Neem gerust contact met ons op.',
      ].join('\n'),
    },
  },

  oplever_herinnering: {
    soort: 'oplever_herinnering',
    label: 'Opleverpunten — herinnering onderaannemer',
    groep: 'Oplevering',
    wanneer: 'Automatisch naar een onderaannemer met opleverpunten die nog openstaan. De link laat hem afmelden zonder in te loggen.',
    variabelen: [
      { sleutel: 'relatie.naam', uitleg: 'Naam van de onderaannemer' },
      { sleutel: 'dossier.titel', uitleg: 'Projectnaam' },
      { sleutel: 'punten.open', uitleg: 'Aantal openstaande punten' },
      { sleutel: 'punten.zin', uitleg: '"staan nog 3 opleverpunten open die aan u zijn toegewezen"' },
      { sleutel: 'punten.afmelden', uitleg: '"deze punten afmelden zodra ze zijn opgelost"' },
    ],
    blokken: [KNOP],
    standaard: {
      onderwerp: 'Openstaande opleverpunten — {dossier.titel}',
      tekst: [
        'Beste {relatie.naam},',
        '',
        'Voor het project **{dossier.titel}** {punten.zin}. Wilt u {punten.afmelden}?',
        '',
        'Via onderstaande link ziet u uw eigen punten en kunt u ze afmelden met een foto en toelichting. Inloggen is niet nodig.',
        '',
        '{knop}',
        '',
        '[klein]Deze link is persoonlijk voor u aangemaakt; deel hem niet met derden.',
      ].join('\n'),
    },
  },

  oplever_feedback: {
    soort: 'oplever_feedback',
    label: 'Tevredenheid — uitnodiging vragenlijst',
    groep: 'Oplevering',
    wanneer: 'Automatisch naar bewoners of gebruikers na afronding van het werk, met de link naar de vragenlijst.',
    variabelen: [{ sleutel: 'dossier.titel', uitleg: 'Projectnaam' }],
    blokken: [KNOP],
    standaard: {
      onderwerp: 'Hoe heeft u onze werkzaamheden ervaren? — {dossier.titel}',
      tekst: [
        'Goedendag,',
        '',
        'De werkzaamheden bij **{dossier.titel}** zijn afgerond. We horen graag hoe u het heeft ervaren — het invullen kost ongeveer een minuut en helpt ons om ons werk te verbeteren.',
        '',
        '{knop}',
        '',
        '[klein]Alvast hartelijk dank voor uw tijd.',
      ].join('\n'),
    },
  },

  portaal_uitnodiging: {
    soort: 'portaal_uitnodiging',
    label: 'Klantportaal — uitnodiging',
    groep: 'Klantportaal',
    wanneer: 'Naar een contactpersoon van de opdrachtgever, wanneer je hem toegang geeft tot zijn projectomgeving.',
    variabelen: [
      { sleutel: 'aanhef', uitleg: '"Beste Jan," of "Beste heer/mevrouw,"' },
      { sleutel: 'voornaam', uitleg: 'Voornaam van de contactpersoon (kan leeg zijn)' },
      { sleutel: 'portaal.url', uitleg: 'Adres van het klantportaal' },
      AFZENDER,
    ],
    blokken: [KNOP],
    standaard: {
      onderwerp: 'Uw projectomgeving bij Everts',
      tekst: [
        '{aanhef}',
        '',
        'Wij hebben een persoonlijke projectomgeving voor u klaargezet. Daarin volgt u de voortgang van uw project, vindt u de documenten en foto’s die wij met u delen, en kunt u ons rechtstreeks een bericht sturen.',
        '',
        'U hoeft geen wachtwoord te kiezen: u vult uw e-mailadres in en krijgt een inloglink toegestuurd.',
        '',
        '{knop}',
        '',
        '[klein]Bewaar deze mail niet als toegangsmiddel — de link is kort geldig. Ga voortaan naar [{portaal.url}]({portaal.url}) en vraag daar een nieuwe inloglink aan.',
        '',
        'Met vriendelijke groet,',
        '{afzender.naam}',
      ].join('\n'),
    },
  },

  portaal_inloglink: {
    soort: 'portaal_inloglink',
    label: 'Klantportaal — inloglink',
    groep: 'Klantportaal',
    wanneer: 'Naar de opdrachtgever zelf, elke keer dat hij op de inlogpagina van het portaal een link aanvraagt.',
    variabelen: [
      { sleutel: 'aanhef', uitleg: '"Beste Jan," of "Beste heer/mevrouw,"' },
      { sleutel: 'voornaam', uitleg: 'Voornaam van de contactpersoon (kan leeg zijn)' },
      { sleutel: 'portaal.url', uitleg: 'Adres van het klantportaal' },
    ],
    blokken: [KNOP],
    standaard: {
      onderwerp: 'Uw inloglink voor het klantportaal — Everts',
      tekst: [
        '{aanhef}',
        '',
        'U kunt met onderstaande knop inloggen op uw projectomgeving. Daar vindt u de stand van zaken, documenten en foto’s van uw project, en kunt u ons rechtstreeks een bericht sturen.',
        '',
        '{knop}',
        '',
        '[klein]De link is één uur geldig en werkt één keer. Is hij verlopen? Vraag op de inlogpagina gewoon een nieuwe aan. Heeft u deze mail niet zelf aangevraagd, dan kunt u hem negeren.',
      ].join('\n'),
    },
  },

  portaal_bericht: {
    soort: 'portaal_bericht',
    label: 'Klantportaal — nieuw bericht',
    groep: 'Klantportaal',
    wanneer: 'Naar de opdrachtgever wanneer wij hem via het portaal een bericht sturen.',
    variabelen: [
      { sleutel: 'aanhef', uitleg: '"Beste Jan," of "Beste heer/mevrouw,"' },
      { sleutel: 'voornaam', uitleg: 'Voornaam van de contactpersoon (kan leeg zijn)' },
      { sleutel: 'dossier.titel', uitleg: 'Projectnaam' },
      { sleutel: 'portaal.url', uitleg: 'Adres van het klantportaal' },
    ],
    blokken: [KNOP],
    standaard: {
      onderwerp: 'Nieuw bericht over {dossier.titel} — Everts',
      tekst: [
        '{aanhef}',
        '',
        'Wij hebben u een bericht gestuurd over **{dossier.titel}**. U leest en beantwoordt het in uw projectomgeving.',
        '',
        '{knop}',
        '',
        '[klein]Reageren op deze mail kan ook — dan komt uw antwoord bij ons op kantoor binnen in plaats van in het portaal.',
      ].join('\n'),
    },
  },

  gebruiker_uitnodiging_platform: {
    soort: 'gebruiker_uitnodiging_platform',
    label: 'Nieuwe medewerker — uitnodiging EVA',
    groep: 'Medewerkers',
    wanneer: 'Naar een nieuwe platformgebruiker (kantoor). Die logt in met zijn Microsoft-account en hoeft niets te activeren.',
    variabelen: [
      { sleutel: 'aanhef', uitleg: '"Hallo Jan," of "Hallo,"' },
      { sleutel: 'voornaam', uitleg: 'Voornaam van de medewerker (kan leeg zijn)' },
      { sleutel: 'eva.url', uitleg: 'Adres van EVA' },
      { sleutel: 'eva.mobiel_url', uitleg: 'Adres van de mobiele app (/m)' },
      { sleutel: 'titel', uitleg: '"Welkom bij EVA", of "Je toegang tot EVA" bij een herhaalde uitnodiging' },
      AFZENDER,
    ],
    blokken: [KNOP],
    standaard: {
      onderwerp: '{titel} — Everts',
      tekst: [
        '{aanhef}',
        '',
        'Je hebt toegang gekregen tot **EVA**, het platform van Everts. Daarin vind je onder andere de dossiers, planning, calculaties, offertes en je eigen acties — alles op één plek.',
        '',
        'Inloggen doe je met je Microsoft-account, hetzelfde account als je mail. Je hoeft dus niets te activeren en geen wachtwoord aan te maken: klik op de knop en kies Inloggen met Microsoft.',
        '',
        '{knop}',
        '',
        '[klein]Op je telefoon werkt het net zo: open [{eva.mobiel_url}]({eva.mobiel_url}) en log ook daar in met Microsoft. Zet die pagina via het deelmenu van je browser op je beginscherm, dan opent EVA voortaan als een gewone app.',
        '',
        'Met vriendelijke groet,',
        '{afzender.naam}',
      ].join('\n'),
    },
  },

  gebruiker_uitnodiging_app: {
    soort: 'gebruiker_uitnodiging_app',
    label: 'Nieuwe monteur — uitnodiging EVA-app',
    groep: 'Medewerkers',
    wanneer: 'Naar een nieuwe app-gebruiker (buitendienst). Die heeft geen Microsoft-account en kiest via de link eerst een wachtwoord.',
    variabelen: [
      { sleutel: 'aanhef', uitleg: '"Hallo Jan," of "Hallo,"' },
      { sleutel: 'voornaam', uitleg: 'Voornaam van de medewerker (kan leeg zijn)' },
      { sleutel: 'eva.url', uitleg: 'Adres van EVA' },
      { sleutel: 'eva.mobiel_url', uitleg: 'Adres van de mobiele app (/m)' },
      { sleutel: 'titel', uitleg: '"Welkom bij EVA", of "Je toegang tot EVA" bij een herhaalde uitnodiging' },
      AFZENDER,
    ],
    blokken: [KNOP],
    standaard: {
      onderwerp: '{titel} — Everts',
      tekst: [
        '{aanhef}',
        '',
        'Je hebt toegang gekregen tot de **EVA-app** van Everts. Daarin zie je je taken en werkbonnen, en registreer je je uren, foto’s en formulieren op locatie.',
        '',
        'Kies eerst een wachtwoord. Daarna log je in met je e-mailadres en dat wachtwoord.',
        '',
        '{knop}',
        '',
        '[klein]Open de app daarna op je telefoon via [{eva.mobiel_url}]({eva.mobiel_url}). Zet hem via het deelmenu van je browser op je beginscherm, dan opent EVA voortaan als een gewone app.',
        '',
        '[klein]De link is beperkte tijd geldig. Is hij verlopen, vraag dan een nieuwe uitnodiging aan.',
        '',
        'Met vriendelijke groet,',
        '{afzender.naam}',
      ].join('\n'),
    },
  },
}

export const MAIL_SOORT_LABELS: Record<MailSoort, string> =
  Object.fromEntries(MAIL_SOORTEN.map(s => [s, MAIL_SOORT_INFO[s].label])) as Record<MailSoort, string>

/** Eén rij uit `mail_sjablonen`. */
export interface MailSjabloon {
  id: string
  soort: MailSoort
  naam: string
  onderwerp: string
  tekst: string
  actief: boolean
  volgorde: number
  updated_at?: string
}
