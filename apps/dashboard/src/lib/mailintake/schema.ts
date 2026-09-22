/**
 * mailintake/schema.ts
 *
 * Het contract met het taalmodel: welke velden het invult, en met welke typen.
 *
 * Twee dingen om vast te houden:
 *
 * 1. Dit schema wordt als *tool-definitie* meegegeven met `tool_choice`. Het model
 *    moet dus geldig JSON leveren; er is geen "praat maar wat en dan regexen we het
 *    er uit". De tool voert niets uit — hij is puur een schemadrager, zodat het
 *    model geen enkele handeling kán verrichten.
 *
 * 2. Elk veld hier is een *voorstel*, geen waarheid. Na `veiligParse` gaat alles
 *    nog langs een deterministische poort (witte lijsten, PDOK, bereikcontroles)
 *    in extractie.ts. Het model kan bijvoorbeeld wel een klantnáám noemen, maar
 *    nooit een klant-id kiezen — die keuze doet de code.
 */

import { z } from 'zod'

/** Bump deze bij elke inhoudelijke wijziging van prompt of schema; landt in `prompt_versie`. */
export const PROMPT_VERSIE = '2026-09-22.3'

const tekst = z.string().trim().min(1).max(2000).nullable().catch(null)
const korteTekst = z.string().trim().min(1).max(200).nullable().catch(null)

export const extractieSchema = z.object({
  // ── Triage ──
  soort: z.enum([
    'offerteaanvraag', 'opdracht_op_offerte', 'opdrachtbon', 'meerwerk',
    'servicedeskbon', 'aanvullende_informatie', 'factuur_of_administratie', 'overig_geen_werk',
  ]),
  soort_vertrouwen: z.number().min(0).max(1),
  samenvatting: z.string().trim().max(600),

  // ── Wat wordt er gevraagd ──
  omschrijving: korteTekst,

  // ── Wie ──
  klant_naam: korteTekst,
  contactpersoon_naam: korteTekst,
  contactpersoon_email: korteTekst,
  contactpersoon_telefoon: korteTekst,

  // ── Waar ──
  werkadres_straat: korteTekst,
  werkadres_huisnummer: korteTekst,
  werkadres_postcode: korteTekst,
  werkadres_stad: korteTekst,
  // Wie je ter plaatse belt. Iets anders dan de contactpersoon van de
  // opdrachtgever: dat is de beheerder op kantoor, dit is de bewoner of de
  // huismeester die de deur opendoet. Het dossier heeft er een eigen blok voor.
  werkadres_contact_naam: korteTekst,
  werkadres_contact_telefoon: korteTekst,
  werkadres_contact_email: korteTekst,

  /**
   * Iedereen die verder bij dit werk genoemd wordt: de technisch manager van de
   * VvE, de opzichter namens de corporatie, de architect, de melder.
   *
   * Dit is een lijst námen, geen lijst mensen die EVA gaat aanmaken. De
   * deterministische poort zoekt ze op tussen de contactpersonen die de klant al
   * heeft; wie daar niet tussen staat, wordt niet verzonnen maar gemeld.
   */
  betrokkenen: z.array(z.object({
    naam: z.string().trim().min(2).max(120),
    rol: z.string().trim().max(80).nullable().catch(null),
    email: z.string().trim().max(200).nullable().catch(null),
    telefoon: z.string().trim().max(40).nullable().catch(null),
  })).max(10).catch([]),

  // ── Kenmerken ──
  referentie: korteTekst,               // hún bestel-/ordernummer
  onze_offerte_referentie: korteTekst,  // óns dossier-/offertenummer, als zij dat noemen
  opdracht_referentie: korteTekst,      // het nummer dat zij aan deze opdracht geven
  opdrachtdatum: korteTekst,            // datum van de opdracht zelf
  vve_code: korteTekst,
  categorie_voorstel: korteTekst,
  werkmaatschappij_voorstel: korteTekst,
  aard_van_het_werk: korteTekst,

  // ── Wanneer ──
  aanvraagdatum: korteTekst,
  deadline: korteTekst,
  gewenste_start: korteTekst,

  // ── Overig ──
  bedrag_excl_btw: z.number().nullable().catch(null),
  spoed: z.boolean().catch(false),
  opmerkingen: tekst,
  /** Letterlijke opmerkingen van de klant; worden een notitie op het dossier. */
  klant_opmerkingen: tekst,
  /** Servicedesk: het bedrag waarbinnen wij zonder nadere goedkeuring mogen werken. */
  mandaat_bedrag: z.number().nullable().catch(null),

  /** Wordt er op nacalculatie afgerekend in plaats van voor een vaste prijs? */
  regie: z.boolean().catch(false),
  /** De zinsnede waaruit dat blijkt; zonder bewijs nemen we het niet over. */
  regie_aanwijzing: korteTekst,

  // Waar de factuur heen moet als dat afwijkt van het adres van de opdrachtgever.
  factuuradres_naam: korteTekst,
  factuuradres_straat: korteTekst,
  factuuradres_postcode: korteTekst,
  factuuradres_plaats: korteTekst,
  meerdere_werkadressen: z.boolean().catch(false),

  bijlage_rollen: z.array(z.object({
    bestandsnaam: z.string().trim().max(300),
    rol: z.enum(['opdrachtbon', 'bestek', 'tekening', 'foto', 'offerte', 'overig']),
  })).max(50).catch([]),

  vertrouwen: z.record(z.string(), z.number().min(0).max(1)).catch({}),
  toelichting: z.string().trim().max(1000).catch(''),
})

export type Extractie = z.infer<typeof extractieSchema>

/** De velden die als "voorstel" in het formulier landen; volgorde = volgorde in het scherm. */
export const VOORSTEL_VELDEN = [
  'omschrijving', 'klant_naam', 'contactpersoon_naam', 'contactpersoon_email',
  'werkadres_straat', 'werkadres_huisnummer', 'werkadres_postcode', 'werkadres_stad',
  'werkadres_contact_naam', 'werkadres_contact_telefoon',
  'referentie', 'vve_code', 'categorie_voorstel', 'werkmaatschappij_voorstel',
  'aanvraagdatum', 'deadline', 'bedrag_excl_btw',
] as const

export const VELD_LABELS: Record<string, string> = {
  omschrijving:              'Omschrijving',
  klant_naam:                'Opdrachtgever',
  contactpersoon_naam:       'Contactpersoon',
  contactpersoon_email:      'E-mail contactpersoon',
  contactpersoon_telefoon:   'Telefoon contactpersoon',
  werkadres_straat:          'Straat',
  werkadres_huisnummer:      'Huisnummer',
  werkadres_postcode:        'Postcode',
  werkadres_stad:            'Plaats',
  werkadres_contact_naam:     'Contact ter plaatse',
  werkadres_contact_telefoon: 'Telefoon ter plaatse',
  werkadres_contact_email:    'E-mail ter plaatse',
  referentie:                'Referentie opdrachtgever',
  onze_offerte_referentie:   'Ons offerte-/dossiernummer',
  opdracht_referentie:       'Opdrachtreferentie',
  opdrachtdatum:             'Opdrachtdatum',
  klant_opmerkingen:         'Opmerkingen van de klant',
  mandaat_bedrag:            'Mandaat (excl. btw)',
  regie:                     'Regie (nacalculatie)',
  factuuradres_naam:         'Factuuradres — naam',
  factuuradres_straat:       'Factuuradres — straat of postbus',
  factuuradres_postcode:     'Factuuradres — postcode',
  factuuradres_plaats:       'Factuuradres — plaats',
  vve_code:                  'VvE-code',
  categorie_voorstel:        'Categorie',
  werkmaatschappij_voorstel: 'Werkmaatschappij',
  aard_van_het_werk:         'Aard van het werk',
  aanvraagdatum:             'Aanvraagdatum',
  deadline:                  'Deadline',
  gewenste_start:            'Gewenste start',
  bedrag_excl_btw:           'Bedrag excl. btw',
  opmerkingen:               'Opmerkingen',
}

/**
 * De tool-definitie die aan Claude wordt meegegeven. Handmatig opgeschreven in
 * plaats van gegenereerd uit Zod: het blijft daardoor leesbaar, en de
 * omschrijvingen per veld zijn hier het eigenlijke instructiemateriaal.
 */
export const LEVER_EXTRACTIE_TOOL = {
  name: 'lever_extractie',
  description:
    'Lever het ingevulde intakeformulier. Roep deze functie precies één keer aan. ' +
    'Laat velden leeg (null) die je niet met redelijke zekerheid uit de mail of de bijlagen kunt halen — ' +
    'gokken is schadelijker dan leeglaten. Weet je een veld niet, laat het dan wég uit het antwoord.',
  input_schema: {
    type: 'object' as const,
    properties: {
      soort: {
        type: 'string',
        enum: [
          'offerteaanvraag', 'opdracht_op_offerte', 'opdrachtbon', 'meerwerk',
          'servicedeskbon', 'aanvullende_informatie', 'factuur_of_administratie', 'overig_geen_werk',
        ],
        description:
          'Wat voor bericht dit is. offerteaanvraag = men vraagt ons een prijs. ' +
          'opdracht_op_offerte = men gaat akkoord met een offerte die wij eerder stuurden. ' +
          'opdrachtbon = een directe opdracht zonder voorafgaande offerte (raamcontract, mutatiewerk). ' +
          'meerwerk = extra werk binnen een klus die al loopt. ' +
          'servicedeskbon = storing, klacht, lekkage, mutatie. ' +
          'aanvullende_informatie = hoort bij een lopend traject: extra fotomateriaal, antwoord op een vraag, planningsafspraak. ' +
          'factuur_of_administratie = factuur, aanmaning, betaalherinnering, btw-vraag. ' +
          'overig_geen_werk = nieuwsbrief, reclame van een leverancier, sollicitatie, spam, privébericht.',
      },
      soort_vertrouwen: {
        type: 'number',
        description:
          'Hoe zeker je bent van "soort", tussen 0 en 1. Wees eerlijk: bij twijfel een lage waarde. ' +
          'Een lage score leidt ertoe dat een mens ernaar kijkt, en dat is precies de bedoeling.',
      },
      samenvatting: {
        type: 'string',
        description: 'Eén of twee zinnen in gewone taal: wat vraagt of meldt deze mail?',
      },
      omschrijving: {
        type: 'string',
        description:
          'Korte omschrijving van het werk, zoals het in een projectnaam zou staan. ' +
          'Bijvoorbeeld "Schilderwerk buitenkozijnen" of "Lekkage dakgoot". Geen adres erin.',
      },
      klant_naam: { type: 'string', description: 'Naam van de opdrachtgever (bedrijf, VvE, corporatie).' },
      contactpersoon_naam: { type: 'string', description: 'Naam van de contactpersoon.' },
      contactpersoon_email: { type: 'string', description: 'E-mailadres van de contactpersoon.' },
      contactpersoon_telefoon: { type: 'string', description: 'Telefoonnummer van de contactpersoon.' },
      werkadres_straat: { type: 'string', description: 'Straatnaam van het werkadres (niet het factuuradres).' },
      werkadres_huisnummer: { type: 'string', description: 'Huisnummer inclusief toevoeging.' },
      werkadres_postcode: { type: 'string', description: 'Postcode, formaat 1234 AB.' },
      werkadres_stad: { type: 'string', description: 'Plaatsnaam.' },
      werkadres_contact_naam: {
        type: 'string',
        description:
          'Naam van degene die ter plaatse te bereiken is: de bewoner, huurder of huismeester. ' +
          'Staat vaak achter "u kunt ter plaatse contact opnemen met" of "af te stemmen met". ' +
          'Niet de contactpersoon van de opdrachtgever zelf, en niet de afzender.',
      },
      werkadres_contact_telefoon: {
        type: 'string',
        description: 'Telefoonnummer van die persoon ter plaatse. Bij meerdere nummers het mobiele.',
      },
      werkadres_contact_email: { type: 'string', description: 'E-mailadres van die persoon ter plaatse.' },
      referentie: {
        type: 'string',
        description: 'Het kenmerk van de opdrachtgever zelf: inkoopnummer, ordernummer, bonnummer, meldingsnummer.',
      },
      onze_offerte_referentie: {
        type: 'string',
        description: 'Een dossier- of offertenummer van óns dat in deze mail wordt genoemd.',
      },
      opdracht_referentie: {
        type: 'string',
        description:
          'Het nummer dat de opdrachtgever aan DEZE opdracht geeft: opdrachtbonnummer, ordernummer, ' +
          'contractnummer. Dus niet ons offertenummer, en niet een algemeen debiteurennummer.',
      },
      opdrachtdatum: {
        type: 'string',
        description: 'De datum van de opdracht zelf als ISO-datum (JJJJ-MM-DD), als die op de bon staat.',
      },
      vve_code: { type: 'string', description: 'VvE- of complexcode, als die genoemd wordt.' },
      categorie_voorstel: { type: 'string', description: 'Soort werk, bijvoorbeeld Schilderwerk, Dagelijks onderhoud, Mutatie, Renovatie.' },
      werkmaatschappij_voorstel: { type: 'string', description: 'Werkmaatschappij, alleen als de mail die expliciet noemt.' },
      aard_van_het_werk: {
        type: 'string',
        enum: ['schilderwerk', 'bouwkundig', 'gemengd', 'onduidelijk'],
        description:
          'Waar gaat het werk in hoofdzaak over? "schilderwerk" bij zuiver of overwegend ' +
          'schilderwerk. "bouwkundig" bij bouwkundig werk, ook als daar een deel schilderwerk ' +
          'bij hoort. "gemengd" als beide substantieel zijn en geen van beide duidelijk ' +
          'overheerst. "onduidelijk" als de stukken het niet zeggen. ' +
          'Dit veld telt alleen mee bij categorie "Bouwkundig Onderhoud" en "Overige"; bij ' +
          'Schilderwerk, Renovatie, Mutatie en Dagelijks onderhoud staat de werkmaatschappij ' +
          'al vast. Gok dus niet: gemengd en onduidelijk worden aan een mens voorgelegd, en ' +
          'dat is beter dan een verkeerde werkmaatschappij.',
      },
      aanvraagdatum: { type: 'string', description: 'Datum van de aanvraag als ISO-datum (JJJJ-MM-DD).' },
      deadline: { type: 'string', description: 'Uiterste datum als ISO-datum (JJJJ-MM-DD).' },
      gewenste_start: { type: 'string', description: 'Gewenste startdatum als ISO-datum (JJJJ-MM-DD).' },
      bedrag_excl_btw: { type: 'number', description: 'Opdrachtbedrag exclusief btw, als de mail of bon dat noemt.' },
      spoed: { type: 'boolean', description: 'true als er om spoed of directe actie wordt gevraagd.' },
      opmerkingen: { type: 'string', description: 'Bijzonderheden die de behandelaar moet weten (bereikbaarheid, sleutels, asbest, bewoners).' },
      klant_opmerkingen: {
        type: 'string',
        description:
          'Opmerkingen die de klant zelf bij deze opdracht maakt en die op het dossier horen te komen, ' +
          'zo dicht mogelijk bij hun eigen woorden. Laat leeg als de klant niets bijzonders meldt.',
      },
      mandaat_bedrag: {
        type: 'number',
        description:
          'Het bedrag tot waar wij zonder nadere goedkeuring mogen werken: mandaat, budgetplafond, ' +
          'kostenlimiet. Alleen invullen als de mail dat ook zo benoemt - een los bedrag is meestal ' +
          'de geschatte prijs, niet het mandaat.',
      },
      regie: {
        type: 'boolean',
        description:
          'true als het werk op nacalculatie wordt afgerekend in plaats van voor een vaste prijs: ' +
          'regie, regiebasis, op uurbasis, verrekenbare uren, nacalculatie. Bij regie hoort geen ' +
          'aanneemsom en geen offerte.',
      },
      regie_aanwijzing: {
        type: 'string',
        description:
          'De zinsnede uit de mail of de bon waaruit blijkt dat het regiewerk is, zo letterlijk ' +
          'mogelijk. Laat leeg als je het niet kunt aanwijzen.',
      },
      factuuradres_naam: {
        type: 'string',
        description:
          'Aan wie de factuur gericht moet worden, als de opdracht dat apart noemt. Bijvoorbeeld ' +
          'de VvE waarvoor de beheerder optreedt. Laat leeg als er geen apart factuuradres staat.',
      },
      factuuradres_straat: {
        type: 'string',
        description: 'Straat en huisnummer of postbus van het factuuradres.',
      },
      factuuradres_postcode: { type: 'string', description: 'Postcode van het factuuradres.' },
      factuuradres_plaats: { type: 'string', description: 'Plaats van het factuuradres.' },
      meerdere_werkadressen: {
        type: 'boolean',
        description:
          'true alleen bij een echte verzamelopdracht: werk op locaties in verschillende straten '
          + 'of verschillende plaatsen, die elk een eigen dossier horen te worden. '
          + 'Meerdere huisnummers in dezelfde straat ("Steenlaan 32, 34 en 36") is één locatie '
          + 'en dus false; zet die nummers gewoon samen in het huisnummerveld.',
      },
      bijlage_rollen: {
        type: 'array',
        description: 'Per bijlage: wat voor document het is.',
        items: {
          type: 'object',
          properties: {
            bestandsnaam: { type: 'string' },
            rol: { type: 'string', enum: ['opdrachtbon', 'bestek', 'tekening', 'foto', 'offerte', 'overig'] },
          },
          required: ['bestandsnaam', 'rol'],
        },
      },
      vertrouwen: {
        type: 'object',
        description:
          'Per ingevuld veld een waarde tussen 0 en 1. 1,0 = het staat er letterlijk; ' +
          '0,5 = je hebt het afgeleid; laag = je gokt. Sleutels zijn de veldnamen hierboven.',
        additionalProperties: { type: 'number' },
      },
      toelichting: {
        type: 'string',
        description: 'Kort: waar heb je de belangrijkste velden vandaan gehaald, en waar twijfel je over?',
      },
    },
    required: ['soort', 'soort_vertrouwen', 'samenvatting'],
  },
}

/**
 * Parseert de tool-invoer defensief. Het model levert bijna altijd geldig JSON,
 * maar één ontbrekend veld mag niet de hele verwerking laten klappen — dan
 * verliezen we ook de triage, en blijft het bericht onnodig hangen.
 */
export function veiligParse(ruw: unknown): { ok: true; data: Extractie } | { ok: false; fout: string } {
  const res = extractieSchema.safeParse(ruw)
  if (res.success) return { ok: true, data: res.data }
  const eerste = res.error.issues[0]
  return { ok: false, fout: `Onbruikbaar antwoord van het model: ${eerste?.path.join('.') || '?'} — ${eerste?.message ?? 'onbekend'}` }
}
