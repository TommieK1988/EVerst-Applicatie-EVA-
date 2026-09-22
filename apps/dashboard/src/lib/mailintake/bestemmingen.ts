/**
 * mailintake/bestemmingen.ts
 *
 * Waar komt elk veld dat EVA uit een mail leest terecht?
 *
 * WAAROM DIT BESTAAT
 * Een veld toevoegen aan het schema is één regel. Het ook érgens laten landen is
 * werk op vier plekken: de deterministische poort, het aanmaakpad, de opdrachtroute
 * en het scherm. Sla je er één over, dan leest EVA het netjes uit de bon, slaat het
 * op in `mailintake_extracties`, en ziet niemand het ooit terug. Dat is precies wat
 * er gebeurde met het contact ter plaatse: naam, telefoon en e-mail van de technisch
 * manager stonden in de opdrachtbon van 20261.00282, kwamen keurig uit het model, en
 * het Werkadres-blok van het dossier bleef leeg.
 *
 * Zo'n gat is onzichtbaar. Er komt geen foutmelding, het bericht wordt gewoon
 * verwerkt, en de uitvoerder belt het kantoor in plaats van de man met de sleutel.
 *
 * Deze tabel maakt het zichtbaar. Elk veld uit `extractieSchema` moet hier een regel
 * hebben, en `scratch/toets-veld-bestemmingen.ts` valt om zodra er een veld bijkomt
 * dat er geen heeft. Bij een nieuw veld is de vraag dus niet "waar zal ik het laten"
 * maar "zonder antwoord komt het er niet in".
 *
 * `ongebruikt` mag, maar alleen met een reden erbij. Een veld dat nergens heen gaat
 * en dat ook niet kan uitleggen, hoort uit het schema.
 */

export type Bestemming =
  /** Landt in een kolom op het dossier. */
  | { waar: 'dossier'; kolom: string; via: string }
  /** Stuurt een beslissing: route, automatisch ja/nee, uitsluiting. */
  | { waar: 'besluit'; via: string }
  /** Staat op het beoordeelscherm of in de actie voor de behandelaar. */
  | { waar: 'scherm'; via: string }
  /** Wordt gelezen maar nergens gebruikt. Vraagt om een reden. */
  | { waar: 'ongebruikt'; reden: string }

export const VELD_BESTEMMING: Record<string, Bestemming> = {
  // ── Triage ────────────────────────────────────────────────────────────────
  soort:            { waar: 'besluit', via: 'beslis.ts kiest de route; A, B of buiten EVA' },
  soort_vertrouwen: { waar: 'besluit', via: 'beslis.ts; onder de drempel gaat het naar een mens' },
  samenvatting:     { waar: 'scherm',  via: 'mailintake_berichten.samenvatting, boven het voorstel' },

  // ── Het werk ──────────────────────────────────────────────────────────────
  omschrijving:      { waar: 'dossier', kolom: 'titel', via: 'maakAanvraag' },
  aard_van_het_werk: { waar: 'scherm', via: 'kleurt het voorstel op het beoordeelscherm' },

  // ── De opdrachtgever ──────────────────────────────────────────────────────
  klant_naam:              { waar: 'besluit', via: 'afzender.ts trede 4 en 5; nooit rechtstreeks een klant_id' },
  contactpersoon_naam:     { waar: 'besluit', via: 'afzender.ts, om te kiezen bij een gedeeld postbusadres' },
  contactpersoon_email:    { waar: 'besluit', via: 'afzender.ts trede 2' },
  contactpersoon_telefoon: { waar: 'ongebruikt', reden: 'staat op de contactpersoon zelf, niet op het dossier; overschrijven zou een Bouw7-veld raken' },

  // ── Het werkadres ─────────────────────────────────────────────────────────
  werkadres_straat:     { waar: 'dossier', kolom: 'werkadres_straat', via: 'maakAanvraag / werkadres-aanvullen' },
  werkadres_huisnummer: { waar: 'dossier', kolom: 'werkadres_huisnummer', via: 'maakAanvraag / werkadres-aanvullen' },
  werkadres_postcode:   { waar: 'dossier', kolom: 'werkadres_postcode', via: 'maakAanvraag / werkadres-aanvullen' },
  werkadres_stad:       { waar: 'dossier', kolom: 'werkadres_stad', via: 'maakAanvraag / werkadres-aanvullen' },

  werkadres_contact_naam:     { waar: 'dossier', kolom: 'werkadres_naam', via: 'werkadres-aanvullen' },
  werkadres_contact_telefoon: { waar: 'dossier', kolom: 'werkadres_telefoon', via: 'werkadres-aanvullen' },
  werkadres_contact_email:    { waar: 'dossier', kolom: 'werkadres_email', via: 'werkadres-aanvullen' },

  betrokkenen: { waar: 'dossier', kolom: 'dossier_betrokkenen', via: 'betrokkenen-aanvullen; alleen wie al contactpersoon is' },

  // ── Kenmerken ─────────────────────────────────────────────────────────────
  referentie:              { waar: 'dossier', kolom: 'referentie', via: 'maakAanvraag' },
  onze_offerte_referentie: { waar: 'besluit', via: 'duplicaten.ts; zoekt onze offerte erbij' },
  opdracht_referentie:     { waar: 'dossier', kolom: 'opdracht_referentie', via: 'updateDossierInfo in opdracht.ts' },
  opdrachtdatum:           { waar: 'dossier', kolom: 'opdrachtdatum', via: 'opdracht.ts' },
  vve_code:                { waar: 'dossier', kolom: 'vve_code', via: 'maakAanvraag' },
  categorie_voorstel:      { waar: 'dossier', kolom: 'bouw7_categorie_id', via: 'witte lijst uit Bouw7' },
  werkmaatschappij_voorstel: { waar: 'dossier', kolom: 'werkmaatschappij_id', via: 'witte lijst; anders afgeleid uit de categorie' },

  // ── Datums ────────────────────────────────────────────────────────────────
  aanvraagdatum:  { waar: 'dossier', kolom: 'aanvraagdatum', via: 'maakAanvraag; valt terug op de ontvangstdatum' },
  deadline:       { waar: 'dossier', kolom: 'deadline', via: 'maakAanvraag; wordt deliveryDate in Bouw7' },
  gewenste_start: { waar: 'ongebruikt', reden: 'het dossier heeft geen startdatumveld; de planning bepaalt dat' },

  // ── Geld en urgentie ──────────────────────────────────────────────────────
  bedrag_excl_btw: { waar: 'scherm', via: 'ter controle naast de offerte; dossiers.bedrag_excl_btw komt uit Bouw7 en wordt hier niet overschreven' },
  mandaat_bedrag:  { waar: 'dossier', kolom: 'mandaat_bedrag', via: 'updateServicedeskInstellingen' },
  spoed:           { waar: 'scherm', via: 'zichtbaar op het beoordeelscherm; er is geen urgentieveld op het dossier' },

  // ── Tekst ─────────────────────────────────────────────────────────────────
  opmerkingen:       { waar: 'dossier', kolom: 'opmerkingen', via: 'maakAanvraag' },
  klant_opmerkingen: { waar: 'dossier', kolom: 'dossier_notities', via: 'notitie bij de opdracht' },

  // ── Regie ─────────────────────────────────────────────────────────────────
  regie:            { waar: 'dossier', kolom: 'facturatiemethode', via: 'opdracht.ts zet hem op nacalculatie' },
  regie_aanwijzing: { waar: 'scherm', via: 'de zin uit de bon waarop dat oordeel rust' },

  // ── Factuuradres ──────────────────────────────────────────────────────────
  factuuradres_naam:     { waar: 'dossier', kolom: 'factuuradres_id', via: 'voorgelegd in het opdrachtpaneel; nooit automatisch' },
  factuuradres_straat:   { waar: 'dossier', kolom: 'factuuradres_id', via: 'idem' },
  factuuradres_postcode: { waar: 'dossier', kolom: 'factuuradres_id', via: 'idem' },
  factuuradres_plaats:   { waar: 'dossier', kolom: 'factuuradres_id', via: 'idem' },

  // ── Signalen over de mail zelf ────────────────────────────────────────────
  meerdere_werkadressen: { waar: 'besluit', via: 'beslis.ts; een verzamelmail gaat altijd naar een mens' },
  bijlage_rollen:        { waar: 'ongebruikt', reden: 'mailintake_bijlagen.rol bestaat maar wordt nergens getoond; nog te bouwen' },

  // ── Verantwoording ────────────────────────────────────────────────────────
  vertrouwen:  { waar: 'besluit', via: 'gekalibreerd in extractie.ts; bepaalt wat automatisch mag' },
  toelichting: { waar: 'scherm', via: 'in het besluitenlog, zodat het oordeel navertelbaar is' },
}
