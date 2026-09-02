/**
 * Platform-brede entiteiten die nog niet in database.types.ts staan
 * (tot de Bouw7-migration is uitgevoerd en types ge-generate zijn).
 *
 * Match deze met supabase/migrations/20260415_platform_core.draft.sql.
 */

export type BedrijfType = 'organisatie' | 'werkmaatschappij'

export type Bedrijfsgegevens = {
  id: string
  type: BedrijfType
  parent_id: string | null   // null = organisatie, gevuld = werkmaatschappij
  code: string | null        // korte interne code (bv. "EOS", "BM")
  naam: string
  kvk_nummer: string | null
  btw_nummer: string | null
  iban: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string | null
  telefoon: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  // Logo's (Supabase Storage URLs)
  logo_primair_url: string | null
  logo_wit_url: string | null
  logo_icon_url: string | null
  logo_monochroom_url: string | null
  // Kleurenpalet
  kleur_primair: string | null
  kleur_accent: string | null
  kleur_secundair: string | null
  kleur_succes: string | null
  kleur_waarschuwing: string | null
  kleur_fout: string | null
  kleur_tekst: string | null
  kleur_achtergrond: string | null
  // Typografie
  font_primair: string | null
  font_secundair: string | null
  // Huisstijl notities
  huisstijl_notities: string | null
  /** Bouw7 branch/vestiging-id van deze werkmaatschappij (GET /list/branches). Bepaalt de projectnummer-reeks bij aanmaken. */
  bouw7_branch_id: number | null
  created_at: string
  updated_at: string
}

export type LogoSlot = 'primair' | 'wit' | 'icon' | 'monochroom'

export const logoSlotLabels: Record<LogoSlot, { label: string; description: string }> = {
  primair:    { label: 'Hoofdlogo',      description: 'Kleurversie voor documenten en website' },
  wit:        { label: 'Wit / Negatief', description: 'Voor donkere achtergronden' },
  icon:       { label: 'Icoon',          description: 'Vierkant beeldmerk (favicon, app-icon)' },
  monochroom: { label: 'Monochroom',     description: 'Zwart-wit versie' },
}

export type BedrijfsgegevensInput = Omit<
  Bedrijfsgegevens,
  'id' | 'created_at' | 'updated_at'
>

/** @deprecated Gebruik OrganisatieType */
export type RelatieType = 'klant' | 'leverancier' | 'onderaannemer'

export type OrganisatieType = 'opdrachtgever' | 'leverancier' | 'onderaannemer'

export const organisatieTypeLabels: Record<OrganisatieType, string> = {
  opdrachtgever: 'Opdrachtgever',
  leverancier:   'Leverancier',
  onderaannemer: 'Onderaannemer',
}

export const organisatieTypeTone: Record<OrganisatieType, 'brand' | 'info' | 'warning'> = {
  opdrachtgever: 'brand',
  leverancier:   'info',
  onderaannemer: 'warning',
}

export type Relatie = {
  id: string
  types: OrganisatieType[]
  naam: string
  kvk_nummer: string | null
  btw_nummer: string | null
  email: string | null
  telefoon: string | null
  mobiel: string | null
  website: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string | null
  /** Standaard betalingstermijn in dagen (EVA-beheerd); offerte-variabele klant.betalingstermijn_dagen. */
  betalingstermijn_dagen: number | null
  opmerkingen: string | null
  actief: boolean
  kenmerken: Record<string, unknown>
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  bouw7_sync_status: 'synced' | 'pending' | 'error' | null
  bouw7_sync_fout: string | null
  sync_vergrendeld: boolean
  /** Laatst uit Bouw7 afgeleide type; de overige types zijn in EVA toegevoegd. */
  bouw7_type: OrganisatieType | null
  /** Kolommen die in EVA handmatig zijn aangepast en die de Bouw7-sync niet meer overschrijft. */
  handmatige_velden: string[]
  created_at: string
  updated_at: string
  created_by: string | null
}

export type RelatieFactuuradres = {
  id: string
  relatie_id: string
  label: string
  straat: string | null
  postcode: string | null
  plaats: string | null
  land: string | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

export type Contactpersoon = {
  id: string
  // Naam
  aanhef: string | null
  geslacht: 'man' | 'vrouw' | 'overig' | null
  voorletter: string | null
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  // Werk
  email: string | null
  telefoon: string | null
  mobiel: string | null
  linkedin_url: string | null
  // Privé
  prive_email: string | null
  prive_telefoon: string | null
  prive_adres_straat: string | null
  prive_adres_postcode: string | null
  prive_adres_plaats: string | null
  prive_adres_land: string | null
  geboortedatum: string | null
  // Overig
  opmerkingen: string | null
  actief: boolean
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  bouw7_sync_status: 'synced' | 'pending' | 'error' | null
  sync_vergrendeld: boolean
  /** Kolommen die in EVA handmatig zijn aangepast en die de Bouw7-sync niet meer overschrijft. */
  handmatige_velden: string[]
  created_at: string
  updated_at: string
  created_by: string | null
}

export type ContactpersoonOrganisatie = {
  id: string
  contactpersoon_id: string
  organisatie_id: string
  functie: string | null
  is_primair: boolean
  opmerkingen: string | null
  created_at: string
}

export type ContactpersoonMetLink = Contactpersoon & {
  contactpersoon_organisaties: Pick<ContactpersoonOrganisatie, 'id' | 'functie' | 'is_primair'>
}

export type Particulier = {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  email: string | null
  telefoon: string | null
  mobiel: string | null
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string | null
  geboortedatum: string | null
  opmerkingen: string | null
  actief: boolean
  bouw7_id: string | null
  bouw7_sync_status: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type RelatieBankgegevens = {
  id: string
  relatie_id: string
  iban: string | null
  bic: string | null
  tenaamstelling: string | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

export type RelatieFacturatie = {
  id: string
  relatie_id: string
  betaaltermijn_dagen: number | null
  facturatie_email: string | null
  inkoopnummer_verplicht: boolean
  kredietlimiet: number | null
  g_rekening_tekst: string | null
  g_rekening_percentage: number | null
  loonkostenbestanddeel_pct: number | null
  n_rekening_tekst: string | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

export type OmzetPerJaar = {
  jaar: number
  bedrag: number
  aantalDossiers: number
}

export type OmzetOpenstaand = {
  id: string
  dossiernummer: string | null
  titel: string
  bedrag: number | null
  substatus: string
}

export type OmzetData = {
  perJaar: OmzetPerJaar[]
  openstaand: OmzetOpenstaand[]
}

export type RelatieInkoop = {
  id: string
  relatie_id: string
  leveranciernummer: string | null
  standaard_levertijd_dagen: number | null
  minimumbestelling: number | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

export type RelatieVerkoopPrijsafspraak = {
  id: string
  relatie_id: string
  omschrijving: string
  eenheid: string | null
  prijs: number | null
  geldig_vanaf: string | null
  geldig_tot: string | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

export type RelatieInkoopKortingsafspraak = {
  id: string
  relatie_id: string
  categorie: string | null
  korting_pct: number | null
  geldig_vanaf: string | null
  geldig_tot: string | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

export type RelatieInkoopPrijsafspraak = {
  id: string
  relatie_id: string
  omschrijving: string
  eenheid: string | null
  prijs: number | null
  geldig_vanaf: string | null
  geldig_tot: string | null
  opmerkingen: string | null
  created_at: string
  updated_at: string
}

/* ── Hoofdproces: Aanvraag → Offerte → Opdracht ──────────────────── */

export type Hoofdstatus = 'aanvraag' | 'offerte' | 'opdracht'

export type ServicedeskSubstatus =
  | 'nieuw'
  | 'mandaat_verhoging'
  | 'offerte_uitgebracht'
  | 'uitgezet'
  | 'ingepland'
  | 'loopt'
  | 'uitgevoerd'
  | 'kosten_compleet'
  | 'financieel_gereed'

export const servicedeskSubstatusLabels: Record<ServicedeskSubstatus, string> = {
  nieuw:               'Nieuw',
  mandaat_verhoging:   'Mandaat verhoging aangevraagd',
  offerte_uitgebracht: 'Offerte uitgebracht',
  uitgezet:            'Uitgezet',
  ingepland:           'Ingepland',
  loopt:               'Loopt',
  uitgevoerd:          'Uitgevoerd',
  kosten_compleet:     'Kosten compleet',
  financieel_gereed:   'Financieel gereed',
}

export type AanvraagSubstatus =
  | 'nieuw'
  | 'inlezen_aanvraag'
  | 'werkopname'
  | 'uitwerken_begroting'
  | 'controle_begroting'
  | 'offerte_gereed'
  | 'verzonden'
  | 'afgewezen'
  | 'vervallen'

export type OfferteSubstatus =
  | 'concept'
  | 'verzonden'
  | 'nabellen'
  | 'in_behandeling'
  | 'mondelinge_toezegging'
  | 'gewonnen'
  | 'verloren'
  | 'vervallen'

export type OpdrachtSubstatus =
  | 'nieuwe_opdracht'
  | 'werkvoorbereiding'
  | 'onderhanden'
  | 'uitvoering_gereed'
  | 'financieel_gereed'
  | 'financieel_afgesloten'

export const aanvraagSubstatusLabels: Record<AanvraagSubstatus, string> = {
  nieuw:                'Nieuw',
  inlezen_aanvraag:     'Inlezen aanvraag',
  werkopname:           'Werkopname',
  uitwerken_begroting:  'Uitwerken begroting',
  controle_begroting:   'Controle begroting',
  offerte_gereed:       'Offerte gereed',
  verzonden:            'Verzonden',
  afgewezen:            'Afgewezen',
  vervallen:            'Vervallen',
}

export const offerteSubstatusLabels: Record<OfferteSubstatus, string> = {
  concept:               'Concept',
  verzonden:             'Verzonden',
  nabellen:              'Nabellen',
  in_behandeling:        'In behandeling',
  mondelinge_toezegging: 'Mondelinge toezegging',
  gewonnen:              'Gewonnen',
  verloren:              'Verloren',
  vervallen:             'Vervallen',
}

export const opdrachtSubstatusLabels: Record<OpdrachtSubstatus, string> = {
  nieuwe_opdracht:       'Nieuwe opdracht',
  werkvoorbereiding:     'Werkvoorbereiding',
  onderhanden:           'Onderhanden',
  uitvoering_gereed:     'Uitvoering gereed',
  financieel_gereed:     'Financieel gereed',
  financieel_afgesloten: 'Financieel afgesloten',
}

/* ── Meerwerk (EVA-native werkstroom per opdracht) ───────────────── */

export type MeerwerkStatus =
  | 'aangevraagd'
  | 'offerte_verstuurd'
  | 'akkoord'
  | 'afgewezen'
  | 'voltooid'

export const meerwerkStatusLabels: Record<MeerwerkStatus, string> = {
  aangevraagd:       'Aangevraagd',
  offerte_verstuurd: 'Offerte verstuurd',
  akkoord:           'Akkoord',
  afgewezen:         'Afgewezen',
  voltooid:          'Voltooid',
}

export type MeerwerkAfrekenwijze = 'regie' | 'aangenomen'
export type MeerwerkStelpostGrondslag = 'geboekte_kosten' | 'eenheidsprijzen'
export type MeerwerkTermijnWijze = 'eigen_termijnstaat' | 'een_regel'
/** Herkomst van een meerwerkregel: handmatig in EVA of geïmporteerd uit Bouw7. */
export type MeerwerkBron = 'eva' | 'bouw7_code' | 'bouw7_offerte' | 'bouw7_line'

export type MeerwerkRegel = {
  id: string
  dossier_id: string
  volgnummer: number
  omschrijving: string
  status: MeerwerkStatus
  afrekenwijze: MeerwerkAfrekenwijze
  is_stelpost: boolean
  stelpost_grondslag: MeerwerkStelpostGrondslag | null
  bedrag_excl_btw: number | null
  eenheid: string | null
  eenheidsprijs: number | null
  hoeveelheid_werkelijk: number | null
  btw_pct: number | null
  factuurreferentie: string | null
  termijn_wijze: MeerwerkTermijnWijze | null
  bewakingscode: string | null
  bouw7_security_code_id: number | null
  bouw7_chapter_id: number | null
  quote_id: string | null
  afgewezen_reden: string | null
  bron: MeerwerkBron
  bouw7_bron_sleutel: string | null
  bouw7_line_id: number | null
  bouw7_nummer: string | null
  begroot_bedrag: number | null
  /**
   * Gezet als deze regel de verrekening is van een stelpost uit `opdracht_onderdelen` (het verschil
   * tussen werkelijk en stelpost). DB-uniek: één stelpost kan maximaal één verrekenregel hebben.
   */
  opdracht_onderdeel_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/* ── Opdracht-onderdelen (samenstelling van een opdracht) ─────────── */

export type OpdrachtOnderdeelSoort = 'basis' | 'stelpost' | 'optie'
export type OpdrachtOnderdeelStatus = 'in_opdracht' | 'uitgesloten' | 'afgerond'
/** Herkomst: geseed uit een EVA-offerte of handmatig aangewezen (Bouw7-dossier zonder offerte). */
export type OpdrachtOnderdeelBron = 'offerte' | 'handmatig'
/** Hoe de stelpost afrekent: vast bedrag, of op de geboekte kosten van zijn bewakingscode. */
export type OpdrachtOnderdeelGrondslag = 'vast' | 'geboekte_kosten'

/**
 * Eén stelpost of optie in een opdracht, met de vastlegging of hij in opdracht is en (voor
 * stelposten) een eigen bewakingscode. Geseed uit de geaccepteerde offerte óf handmatig aangewezen
 * als deel van een uit Bouw7 geïmporteerde aanneemsom.
 */
export type OpdrachtOnderdeel = {
  id: string
  dossier_id: string
  quote_id: string | null
  soort: OpdrachtOnderdeelSoort
  quote_section_id: string | null
  quote_line_id: string | null
  omschrijving: string
  volgnummer: number
  in_opdracht: boolean
  bedrag_excl_btw: number | null
  btw_pct: number | null
  bewakingscode: string | null
  bouw7_chapter_id: number | null
  status: OpdrachtOnderdeelStatus
  bron: OpdrachtOnderdeelBron
  /**
   * Carve-out (true) = zit in de aanneemsom, verlaagt de basisscope en telt NIET extra mee in het
   * contracttotaal. False = staat erbuiten en moet apart worden gefactureerd (telt er wél bij op).
   */
  in_aanneemsom: boolean
  /** Aanneemsom op het moment van aanwijzen — voor driftdetectie na een Bouw7-sync. */
  aanneemsom_snapshot: number | null
  /** Kostprijs-budget voor de bewakingscode. Nooit afgeleid uit bedrag_excl_btw (= omzet). */
  begroot_excl_btw: number | null
  grondslag: OpdrachtOnderdeelGrondslag | null
  bouw7_security_code_id: number | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/** BTW per tarief uit de Bouw7-offerte (incl. AK/W&R in de grondslag). */
export type BtwSplitsingItem = {
  /** Tarieflabel uit Bouw7, bv. 'Hoog 21%', 'Laag 9%', 'Verlegd 21'. */
  label: string
  percentage: number
  grondslag: number
  bedrag: number
}

export type Dossier = {
  id: string
  dossiernummer: string | null
  titel: string
  klant_id: string | null
  hoofdstatus: Hoofdstatus
  aanvraag_substatus: AanvraagSubstatus | null
  offerte_substatus: OfferteSubstatus | null
  opdracht_substatus: OpdrachtSubstatus | null
  bedrag_excl_btw: number | null
  bedrag_incl_btw: number | null
  btw_splitsing: BtwSplitsingItem[] | null
  verwacht_startdatum: string | null
  verwacht_einddatum: string | null
  project_manager_id: string | null
  teamleider_id: string | null
  werkvoorbereider_id: string | null
  calculator_id: string | null
  uitvoerder_id: string | null
  controller_id: string | null
  referentie: string | null
  categorie: string | null
  opdracht_referentie: string | null
  factuuradres_id: string | null
  bouw7_id: string | null
  bouw7_projectstatus_id: number | null
  bouw7_projectstatus_naam: string | null
  bouw7_categorie_id: number | null
  bouw7_categorie_naam: string | null
  /** Meest recente Bouw7-offertestatus (quotationStatus.name), bv. '04. Gewonnen'. */
  bouw7_quotation_status: string | null
  bouw7_laatst_sync: string | null
  /** Bouw7 project createdAt — aanmaakdatum melding/project; basis voor servicedesk-doorlooptijd. */
  bouw7_aanmaakdatum: string | null
  bouw7_sync_status: 'synced' | 'pending' | 'error' | null
  bouw7_sync_fout: string | null
  /** Cache van de gekoppelde SharePoint-dossiermap (driveItem binnen O365_DOSSIER_DRIVE_ID). */
  sharepoint_drive_id: string | null
  sharepoint_item_id: string | null
  sharepoint_web_url: string | null
  /** 'gematcht' | 'niet_gevonden' | 'meerdere'. Negatieve waarden verlopen via sharepoint_gematcht_op. */
  sharepoint_match_status: 'gematcht' | 'niet_gevonden' | 'meerdere' | null
  /** true = map handmatig gekozen/aangemaakt; een automatische rematch laat hem met rust. */
  sharepoint_handmatig: boolean
  /** Moment van de laatste match-poging; basis voor de TTL op negatieve resultaten. */
  sharepoint_gematcht_op: string | null
  kostprijs_excl_btw: number | null
  contactpersoon_id: string | null
  servicedesk_substatus: ServicedeskSubstatus | null
  /** Gekoppeld everts-calc project (calculatie/offerte). Zichtbaar-maken Calculatie-tab servicedesk. */
  everts_calc_project_id: string | null
  /** Servicedesk: handmatig opgegeven mandaat (EUR excl. btw). EVA-eigen. */
  mandaat_bedrag: number | null
  /** Servicedesk facturatiewijze: 'regie' (default) of 'termijnen' (na offerte-akkoord). */
  facturatiemethode: 'regie' | 'termijnen'
  /** true = facturatiemethode handmatig vastgezet; auto-logica overschrijft niet. */
  facturatiemethode_handmatig: boolean
  verzonden_op: string | null
  opmerkingen: string | null
  werkadres_straat: string | null
  werkadres_huisnummer: string | null
  werkadres_postcode: string | null
  werkadres_stad: string | null
  /** VvE-code van het object; gesynct naar Bouw7 als custom attribute caVveCode. */
  vve_code: string | null
  /**
   * Gekoppeld vastgoedobject (VvE/complex/pand). Dit is een PREFILL-relatie, geen live join:
   * de werkadres_*-velden hierboven blijven de bron voor documenten, planning en Bouw7 —
   * het object vult ze bij het koppelen éénmalig. Bron in Bouw7: `project.propertyAsset`.
   */
  object_id: string | null
  object_gekoppeld_op: string | null
  object_koppel_bron: 'aanmaak' | 'handmatig' | 'bouw7' | 'backfill' | null
  /** Datum van de aanvraag. Leeg = het dossier is aangemaakt op `created_at`. */
  aanvraagdatum: string | null
  /** Deadline: de datum waarop de offerte verzonden had moeten zijn (optioneel). */
  deadline: string | null
  /** Moment van de overgang naar hoofdstatus opdracht. Gezet door de DB-trigger zz_dossier_procesdatums. */
  opdrachtdatum: string | null
  /** Moment dat de opdracht-substatus financieel_gereed werd. Gezet door dezelfde DB-trigger. */
  financieel_gereed_op: string | null
  /** Werkmaatschappij (bedrijfsgegevens.type=werkmaatschappij); zie migratie 20260706_dossier_werkmaatschappij. */
  werkmaatschappij_id: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

/* ── Objectenbeheer ─────────────────────────────────────────────────────────
 * Een object is een VvE, complex of pand waaraan meerdere dossiers hangen.
 * Bouw7-tegenhanger: `property-assets`. Bouw7 is bron voor de identiteit
 * (objectnummer, naam, adres, factuurrelatie); de EVA-eigen velden hieronder
 * (soort, contact_*, notities, lat/lng, standaard_contactpersoon_id) worden door
 * de sync nooit aangeraakt.
 */

export type VastgoedObjectSoort = 'vve' | 'complex' | 'pand' | 'locatie' | 'overig'

/** Rol van een relatie bij een object. Een VvE-complex heeft er vaak meerdere tegelijk. */
export type VastgoedObjectRol = 'vve' | 'eigenaar' | 'beheerder' | 'opdrachtgever' | 'overig'

export const VASTGOED_OBJECT_SOORTEN: { key: VastgoedObjectSoort; label: string }[] = [
  { key: 'vve',     label: 'VvE' },
  { key: 'complex', label: 'Complex' },
  { key: 'pand',    label: 'Pand' },
  { key: 'locatie', label: 'Locatie' },
  { key: 'overig',  label: 'Overig' },
]

export const VASTGOED_OBJECT_ROLLEN: { key: VastgoedObjectRol; label: string }[] = [
  { key: 'vve',           label: 'VvE' },
  { key: 'eigenaar',      label: 'Eigenaar' },
  { key: 'beheerder',     label: 'Beheerder' },
  { key: 'opdrachtgever', label: 'Opdrachtgever' },
  { key: 'overig',        label: 'Overig' },
]

export type VastgoedObject = {
  id: string
  /** Bouw7 `number` — met de hand getypte objectcode (HW1013, KESSZAM6). Uniek. */
  objectnummer: string
  naam: string
  soort: VastgoedObjectSoort
  vve_code: string | null
  /**
   * Bij complexen zet Bouw7 de héle adressenreeks in dit veld
   * ("Netscherstraat 9 t/m 91 / Ruijsdaelstraat 65 t/m 73") en laat huisnummer
   * en postcode leeg. Reken hier dus niet op een gestructureerd adres.
   */
  adres_straat: string | null
  adres_huisnummer: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  adres_land: string
  /** Vrije opsomming van de adressen (Bouw7 `description`, HTML gestript). */
  omschrijving: string | null
  lat: number | null
  lng: number | null
  geocode_bron: string | null
  /** Contactpersoon ter plaatse (huismeester/beheerder) — EVA-eigen, kent Bouw7 niet. */
  contact_naam: string | null
  contact_telefoon: string | null
  contact_email: string | null
  standaard_opdrachtgever_id: string | null
  standaard_contactpersoon_id: string | null
  eerste_opleverdatum: string | null
  tweede_opleverdatum: string | null
  notities: string | null
  details: Record<string, unknown>
  /** Reservekolom voor een later complex → gebouw-niveau; nog zonder UI. */
  hoort_bij_object_id: string | null
  bouw7_property_asset_id: number | null
  bouw7_laatst_sync: string | null
  bouw7_sync_status: string | null
  bouw7_sync_fout: string | null
  bouw7_sync_hash: string | null
  bron: 'eva' | 'bouw7' | 'backfill'
  backfill_run_id: string | null
  actief: boolean
  created_at: string
  updated_at: string
  created_by: string | null
  /** Gegenereerd: 'POSTCODE|huisnummer'. Niet uniek — vaak '|' omdat Bouw7 die velden leeg laat. */
  adres_sleutel: string | null
}

export type VastgoedObjectRelatie = {
  id: string
  object_id: string
  relatie_id: string
  rol: VastgoedObjectRol
  primair: boolean
  opmerking: string | null
  created_at: string
}

/** Actieve substatus ophalen ongeacht fase. */
export function getDossierSubstatus(
  dossier: Pick<Dossier, 'hoofdstatus' | 'aanvraag_substatus' | 'offerte_substatus' | 'opdracht_substatus'>
): AanvraagSubstatus | OfferteSubstatus | OpdrachtSubstatus {
  if (dossier.hoofdstatus === 'aanvraag') return dossier.aanvraag_substatus!
  if (dossier.hoofdstatus === 'offerte')  return dossier.offerte_substatus!
  return dossier.opdracht_substatus!
}

export type NotificatieKanaal = { in_app: boolean; email: boolean }

export type NotificatieVoorkeuren = {
  taken?:            NotificatieKanaal
  opdrachten?:       NotificatieKanaal
  offertes?:         NotificatieKanaal
  storingsmeldingen?:NotificatieKanaal
  wagenpark?:        NotificatieKanaal
  systeem?:          NotificatieKanaal
}

export const notificatieCategorieLabels: Record<keyof NotificatieVoorkeuren, string> = {
  taken:             'Acties',
  opdrachten:        'Opdrachten & dossiers',
  offertes:          'Offertes',
  storingsmeldingen: 'Storingsmeldingen',
  wagenpark:         'Wagenpark',
  systeem:           'Systeem',
}

export const NOTIFICATIE_DEFAULTS: NotificatieVoorkeuren = {
  taken:             { in_app: true,  email: false },
  opdrachten:        { in_app: true,  email: true  },
  offertes:          { in_app: true,  email: true  },
  storingsmeldingen: { in_app: true,  email: true  },
  wagenpark:         { in_app: true,  email: false },
  systeem:           { in_app: true,  email: false },
}

export type Startpagina =
  | 'overzicht'
  | 'aanvragen'
  | 'offertes'
  | 'opdrachten'
  | 'taken'
  | 'planning'

export type GebruikerVoorkeuren = {
  startpagina?: Startpagina
}

export type GebruikerType = 'geen' | 'app_gebruiker' | 'platform_gebruiker'

export type ModuleRechten = 'lezen' | 'schrijven' | 'beheren'

/**
 * Eén bron van waarheid voor de instelbare onderdelen (modules) in het rechtensysteem.
 * De rechtenmatrices (afdeling-standaard + gebruiker-override) en de Zod-validatie
 * leiden hun lijst hieruit af, zodat ze nooit uit elkaar lopen.
 *
 * Het niveau (lezen/schrijven/beheren) is de bestaande ladder:
 *  - lezen     → onderdeel zichtbaar + read-only overzichten
 *  - schrijven → records aanmaken/bewerken binnen het onderdeel
 *  - beheren   → óók de beheer-/instellingen-schermen van dat onderdeel
 */
export const RECHTEN_MODULES = [
  { key: 'dossiers',       label: 'Dossiers' },
  { key: 'servicedesk',    label: 'Servicedesk' },
  { key: 'management',     label: 'Management' },
  { key: 'planning',       label: 'Planning' },
  { key: 'relaties',       label: 'Relaties' },
  { key: 'objectenbeheer', label: 'Objecten' },
  { key: 'medewerkers',    label: 'Medewerkers' },
  { key: 'wagenpark',      label: 'Wagenpark' },
  // Privacygevoelige wagenpark-data: privé-ritten (in Ritten, Bestuurders,
  // Parkeren, Dashboard, Livetracker) én de Werktijden-pagina. Geen eigen
  // menu-item — het is een schakelaar bovenop 'wagenpark' die bepaalt of je de
  // aankomst/vertrektijden en privé-ritten van een met naam genoemde collega
  // mag zien. Alleen Directie krijgt hem standaard (seed-migratie).
  { key: 'wagenpark_prive', label: 'Wagenpark: privé & werktijden' },
  { key: 'kam',            label: 'KAM/VGM' },
  { key: 'houtrotherstel', label: 'Houtrotherstel' },
  { key: 'everts_calc',    label: 'EvertsCalc' },
  { key: 'materieelbeheer', label: 'Materieelbeheer' },
  { key: 'toolbox',        label: 'Toolbox' },
  { key: 'formulieren',    label: 'Formulieren' },
  { key: 'taken',          label: 'Actielijsten' },
  { key: 'mijn_taken',     label: 'Mijn acties' },
  // Geen menu-item maar een schakelaar: vanaf 'lezen' toont "Mijn acties" ook de
  // acties van collega's (scope-slicer). Het niveau erboven doet hier niets extra's.
  { key: 'alle_taken',     label: 'Alle acties' },
  { key: 'financieel',     label: 'Financieel' },
  // Klantportaal: wie mag zien wat er met een opdrachtgever gedeeld is.
  //  - lezen    → de Portaal-tab en de klantchat inzien
  //  - schrijven → onderdelen en bestanden vrijgeven, terugschrijven in de chat
  //  - beheren  → contactpersonen uitnodigen, hun scope zetten, toegang intrekken
  { key: 'klantportaal',   label: 'Klantportaal' },
  { key: 'instellingen',   label: 'Instellingen' },
] as const

export type RechtenModule = typeof RECHTEN_MODULES[number]['key']

export type RechtenSet = Partial<Record<RechtenModule, ModuleRechten | null>>

export type Medewerker = {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  email: string | null
  telefoon: string | null
  mobiel: string | null
  foto_url: string | null
  functie: string | null
  afdeling: string | null
  in_dienst_vanaf: string | null
  uit_dienst_per: string | null
  extern: boolean
  actief: boolean
  uurtarief_verkoop: number | null
  uurtarief_kostprijs: number | null
  cao_schaal: string | null
  auth_user_id: string | null
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  bouw7_sync_status: 'synced' | 'pending' | 'error' | null
  bouw7_sync_fout: string | null
  // Uitgebreide persoonsgegevens
  adres_straat: string | null
  adres_postcode: string | null
  adres_plaats: string | null
  geboortedatum: string | null
  bsn: string | null
  werkmaatschappij_id: string | null
  relatie_id: string | null
  handtekening_url: string | null
  cao_document_id: string | null
  cao_trede: string | null
  kleur: string | null
  ploeg_id: string | null
  /** Uitvoerende discipline (uursoort) — bepaalt de capaciteitsgroep in Werkvoorraad. */
  standaard_uursoort_id: string | null
  // Persoonlijke accountinstellingen
  notificatie_voorkeuren: NotificatieVoorkeuren
  voorkeuren: GebruikerVoorkeuren
  // Gebruikersbeheer
  gebruiker_type: GebruikerType
  rechten_override: RechtenSet
  // Office 365
  o365_user_id: string | null
  o365_email: string | null
  o365_tenant_id: string | null
  created_at: string
  updated_at: string
}

export type MedewerkerRoosterPauze = {
  id: string
  rooster_id: string
  pauze_start: string
  pauze_eind: string
  created_at: string
}

export type BedrijfsmiddelType = 'sleutel' | 'telefoon' | 'tankpas' | 'overig'

export type MedewerkerBedrijfsmiddel = {
  id: string
  medewerker_id: string
  type: BedrijfsmiddelType
  omschrijving: string | null
  kenmerken: Record<string, unknown>
  uitgegeven_op: string | null
  retour_op: string | null
  actief: boolean
  created_at: string
  updated_at: string
}

export type AttribuutVeldtype = 'tekst' | 'datum' | 'getal' | 'boolean'

export type MedewerkerAttribuutDefinitie = {
  id: string
  naam: string
  veldtype: AttribuutVeldtype
  verplicht: boolean
  volgorde: number
  actief: boolean
  created_at: string
  updated_at: string
}

export type MedewerkerAttribuutWaarde = {
  id: string
  medewerker_id: string
  definitie_id: string
  waarde: string | null
  created_at: string
  updated_at: string
}

export type BestandCategorie = 'contract' | 'certificaat' | 'id_bewijs' | 'vca_diploma' | 'overig'

export const bestandCategorieLabels: Record<BestandCategorie, string> = {
  contract:    'Contract',
  certificaat: 'Certificaat',
  id_bewijs:   'ID-bewijs',
  vca_diploma: 'VCA-diploma',
  overig:      'Overig',
}

export type MedewerkerBestand = {
  id: string
  medewerker_id: string
  naam: string
  url: string
  categorie: BestandCategorie
  bestandstype: string | null
  grootte: number | null
  geupload_door: string | null
  created_at: string
}

/* ── Planning-module ─────────────────────────────────────────────── */

export type PlanningUursoort = {
  id: string
  naam: string
  code: string
  kleur: string
  everts_calc_omschrijvingen: string[]
  volgorde: number
  actief: boolean
  /** 'eva' = handmatig beheerd (bewerkbaar); 'bouw7' = afgeleid uit uren-logs (read-only). */
  bron: 'eva' | 'bouw7'
  /** Bouw7 hourType-id waaraan deze uursoort gekoppeld is (verplicht bij terugschrijven van uren). */
  bouw7_id: string | null
  bouw7_naam: string | null
  /** Per-uursoort default uurtarief (laag 2 van de hiërarchie). */
  tarief_verkoop: number | null
  tarief_kostprijs: number | null
  created_at: string
  updated_at: string
}

/** Read-only BTW-tarief afgeleid uit Bouw7-offerteregels (vatTariffObject). */
export type BtwTarief = {
  id: string
  /** Bouw7 vatTariff-id; null als alleen op label/percentage afgeleid. */
  bouw7_id: number | null
  label: string
  percentage: number
  /** BTW verlegd (reverse charge). */
  verlegd: boolean
  actief: boolean
  bron: 'bouw7' | 'eva'
  bouw7_laatst_sync: string | null
  created_at: string
  updated_at: string
}

/** Per-werkmaatschappij uurtarief-override per uursoort (hiërarchie-laag). */
export type UursoortTariefOverride = {
  id: string
  werkmaatschappij_id: string
  uursoort_id: string
  tarief_verkoop: number | null
  tarief_kostprijs: number | null
  created_at: string
  updated_at: string
}

export type PlanningWerkbegrotingRegel = {
  id: string
  dossier_id: string
  uursoort_id: string
  begrote_uren: number
  created_at: string
  updated_at: string
}

/** Werkbegroting-regel verrijkt met uursoort-gegevens (Supabase join) */
export type PlanningWerkbegrotingRegelMetUursoort = PlanningWerkbegrotingRegel & {
  planning_uursoorten: Pick<PlanningUursoort, 'id' | 'naam' | 'kleur' | 'code'> | null
}

export type MedewerkerRooster = {
  id: string
  medewerker_id: string
  geldig_vanaf: string
  geldig_tot: string | null
  /** ISO weekdagen: 1=Ma … 7=Zo */
  werkdagen: number[]
  dagstart: string
  dageind: string
  contracturen_per_week: number
  created_at: string
  updated_at: string
}

export type MedewerkerAfwezigheidType = 'verlof' | 'ziek' | 'training' | 'overig'

export type MedewerkerAfwezigheid = {
  id: string
  medewerker_id: string
  type: MedewerkerAfwezigheidType
  start_datum: string
  eind_datum: string
  start_tijd: string | null
  eind_tijd: string | null
  opmerking: string | null
  /** Herkomst: 'eva' = handmatig, 'bouw7' = gesynct uit Bouw7 days-off (read-only in EVA). */
  bron: 'eva' | 'bouw7'
  bouw7_id: string | null
  bouw7_status: number | null
  created_at: string
  updated_at: string
}

/** Organisatiebrede vrije dag (feestdag/bouwvak) gesynct uit Bouw7 /list/days-off. */
export type Bouw7VrijeDag = {
  id: string
  bouw7_id: string
  start_datum: string
  eind_datum: string
  naam: string | null
  herhaalt_jaarlijks: boolean
  bouw7_laatst_sync: string | null
  created_at: string
  updated_at: string
}

export type MedewerkerSkill = {
  id: string
  medewerker_id: string
  skill_naam: string
  created_at: string
}

/** Activiteit = planbare werkeenheid (wat er gedaan moet worden) */
export type PlanningActiviteitStatus = 'backlog' | 'gepland' | 'in_uitvoering' | 'opgeleverd' | 'on_hold'

export type PlanningActiviteit = {
  id: string
  dossier_id: string
  uursoort_id: string | null
  /**
   * Externe partij die de activiteit uitvoert of levert (verwijst naar `relaties`).
   * Historische naam: het veld houdt zowel onderaannemers als leveranciers vast —
   * de rol volgt uit `relaties.types`.
   */
  onderaannemer_id: string | null
  fase_id: string | null
  titel: string
  omschrijving: string | null
  geschatte_uren: number | null
  benodigde_skills: string[]
  gewenste_start: string | null
  deadline: string | null
  locatie_adres: string | null
  status: PlanningActiviteitStatus
  volgorde: number
  /** Kale Bouw7-bewakingscode (securityCode.code) waar dit werk op geboekt wordt */
  bewakingscode: string | null
  /** Bouw7 securityCode.id behorend bij `bewakingscode` (voor latere write-back) */
  bouw7_security_code_id: number | null
  /** 'eva' = in EVA gemaakt, 'bouw7' = uit Bouw7 gesynct */
  bron: PlanningBron
  /** Externe sleutel bij bron='bouw7' (Bouw7 plan-item id) */
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  created_at: string
  updated_at: string
}

/** Herkomst van een planning-rij */
export type PlanningBron = 'eva' | 'bouw7'

/** Fase = groepering van activiteiten binnen een dossier */
export type PlanningFase = {
  id: string
  dossier_id: string
  naam: string
  volgorde: number
  /** 'eva' = in EVA gemaakt, 'bouw7' = uit Bouw7 gesynct */
  bron: PlanningBron
  /** Externe sleutel bij bron='bouw7' (chapter:{id} of chapter:algemeen) */
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  created_at: string
  updated_at: string
}

export type AfhankelijkheidsType = 'FS' | 'SS' | 'FF' | 'SF'

export const afhankelijkheidsTypeLabels: Record<AfhankelijkheidsType, string> = {
  FS: 'Einde → Start',
  SS: 'Start → Start',
  FF: 'Einde → Einde',
  SF: 'Start → Einde',
}

export type PlanningAfhankelijkheid = {
  id: string
  van_activiteit_id: string
  naar_activiteit_id: string
  type: AfhankelijkheidsType
  vertraging_dagen: number
  created_at: string
}

/** Activiteit verrijkt met uursoort (join) */
export type PlanningActiviteitMetUursoort = PlanningActiviteit & {
  uursoort: PlanningUursoort | null
}

/** Planitem = ingepland blok van 1 medewerker op een activiteit.
 *  Geen status-kolom: uitvoeringsstaat ligt in `werkbonnen` (bestaan + klaar_gemeld_op). */
export type PlanningItem = {
  id: string
  activiteit_id: string
  medewerker_id: string
  start_dt: string
  eind_dt: string
  uren: number
  overrule: boolean
  overrule_reden: string | null
  overrule_door: string | null
  /** 'eva' = in EVA gemaakt, 'bouw7' = uit Bouw7 gesynct */
  bron: PlanningBron
  /** Externe sleutel bij bron='bouw7' ({planItemId}:{employeeId}) */
  bouw7_id: string | null
  bouw7_laatst_sync: string | null
  created_at: string
  updated_at: string
}

/** Planitem verrijkt met medewerker + activiteit (Supabase join-namen) */
export type PlanningItemVerrijkt = PlanningItem & {
  medewerkers: Pick<Medewerker, 'voornaam' | 'tussenvoegsel' | 'achternaam' | 'functie'> | null
  planning_activiteiten: Pick<PlanningActiviteit, 'titel' | 'uursoort_id' | 'geschatte_uren'> | null
}

export type Werkbon = {
  id: string
  planning_item_id: string
  start_dt: string
  eind_dt: string
  gewerkte_uren: number
  opmerking: string | null
  handtekening_url: string | null
  klaar_gemeld_op: string | null
  created_at: string
  updated_at: string
}

export type WerkbonFoto = {
  id: string
  werkbon_id: string
  storage_url: string
  gemaakt_op: string
}

export type UrenRegel = {
  id: string
  werkbon_id: string
  planning_item_id: string | null
  dossier_id: string
  medewerker_id: string
  uursoort_id: string | null
  datum: string
  uren: number
  opmerking: string | null
  created_at: string
}

/* ── Planning label-helpers ──────────────────────────────────────── */

export const planningActiviteitStatusLabels: Record<PlanningActiviteitStatus, string> = {
  backlog:       'Backlog',
  gepland:       'Gepland',
  in_uitvoering: 'In uitvoering',
  opgeleverd:    'Opgeleverd',
  on_hold:       'On hold',
}

export type Uurtarief = {
  label:        string
  tarief:       number
  is_favoriet?: boolean
}

export type Bedrijfsinstellingen = {
  id:           number
  uurtarieven:  Uurtarief[]
  btw_tarieven: number[]
  overige:      Record<string, unknown>
  updated_at:   string
}

export const medewerkerAfwezigheidLabels: Record<MedewerkerAfwezigheidType, string> = {
  verlof:   'Verlof',
  ziek:     'Ziekte',
  training: 'Training',
  overig:   'Overig',
}

/**
 * Kleur per afwezigheidstype. Gedeeld tussen de desktop-medewerkerplanning en de
 * mobiele agenda; stond eerder alleen in `MedewerkerTimeline` en liep zo het risico
 * per scherm uit elkaar te lopen. De dag-achtergrondtinten (`AFWEZIGHEID_BG`) zijn
 * bewust niet gedeeld: alleen die timeline vult hele dagcellen.
 */
export const medewerkerAfwezigheidKleur: Record<MedewerkerAfwezigheidType, string> = {
  verlof:   '#f87171',
  ziek:     '#dc2626',
  training: '#10b981',
  overig:   '#6b7280',
}

// ─── Functies & Afdelingen ───────────────────────────────────────────────────

export type StandaardRooster = {
  werkdagen:             number[]
  dagstart:              string
  dageind:               string
  contracturen_per_week: number
  pauzes:                { pauze_start: string; pauze_eind: string }[]
} | null

export type MedewerkerFunctie = {
  id:                    string
  naam:                  string
  volgorde:              number
  actief:                boolean
  standaard_rooster:     StandaardRooster
  standaard_afdeling_id: string | null
  created_at:            string
}

export type MedewerkerAfdeling = {
  id:                string
  naam:              string
  volgorde:          number
  actief:            boolean
  standaard_rechten: RechtenSet
  created_at:        string
}

export type Ploeg = {
  id:            string
  naam:          string
  teamleider_id: string | null
  volgorde:      number
  actief:        boolean
  created_at:    string
}

// ─── CAO ────────────────────────────────────────────────────────────────────

export type CaoDocument = {
  id:                  string
  naam:                string
  pdf_url:             string | null
  bestandsnaam:        string | null
  actief:              boolean
  extractie_status:    'pending' | 'bezig' | 'gereed' | 'fout' | null
  extractie_fout:      string | null
  werkmaatschappij_id: string | null
  created_at:          string
  updated_at:          string
}

export type CaoLoonschaal = {
  id:          string
  cao_id:      string
  schaal:      string
  trede:       string
  bruto_maand: number | null
  volgorde:    number
  created_at:  string
}

// ─── Gebruiker layouts (kolombeheer) ────────────────────────────────────────

export type KolomConfig = {
  key:       string
  zichtbaar: boolean
  volgorde:  number
  breedte?:  number
  /** Eigen kolomnaam van deze gebruiker; leeg = de standaardnaam van het scherm. */
  naam?:     string
}

export type GebruikerLayout = {
  id:           string
  user_id:      string
  scherm:       string
  naam:         string
  kolommen:     KolomConfig[]
  is_standaard: boolean
  created_at:   string
  updated_at:   string
}

// ─── Werkstand (laatst gebruikte tabelinstellingen) ─────────────────────────

/**
 * De stand waarin een gebruiker een overzichttabel achterliet. Anders dan een
 * `GebruikerLayout` is dit geen benoemde weergave die je bewust opslaat, maar de
 * automatisch bewaarde werkstand: hij overleeft het wisselen naar kanban, een
 * verversing en het navigeren naar een andere pagina.
 *
 * Verklaring van `versie`: bij een onbekende (hogere of ontbrekende) versie wordt de
 * werkstand genegeerd in plaats van half toegepast, zodat een oud formaat nooit een
 * kapotte tabel oplevert.
 */
export type TabelWerkstand = {
  versie:        number
  /** Kolomvolgorde, zichtbaarheid en breedte — zelfde vorm als een layout. */
  kolommen:      KolomConfig[]
  sortering:     { id: string; desc: boolean }[]
  /** Kolomfilters; `waarde` is een tekst (tekstfilter) of een lijst (selectfilter). */
  filters:       { id: string; waarde: unknown }[]
  /** Zoekterm uit de zoekbalk. */
  zoek:          string
  paginaGrootte: number
  /** De benoemde layout die actief was, zodat de naam in de knop blijft kloppen. */
  layout_id:     string | null
  /** Moment van opslaan; bepaalt wie wint als twee apparaten uiteenlopen. */
  opgeslagen_op: string
}

export type GebruikerWerkstand = {
  user_id:    string
  scherm:     string
  staat:      TabelWerkstand
  updated_at: string
}

// ─── Bedrijfsagenda ──────────────────────────────────────────────────────────

export type BedrijfsagendaType =
  | 'vca_toolbox'
  | 'audit'
  | 'teamoverleg'
  | 'activiteit'
  | 'herinnering'
  | 'atv_dag'
  | 'overig'

export const bedrijfsagendaTypeLabels: Record<BedrijfsagendaType, string> = {
  vca_toolbox: 'VCA Toolbox',
  audit:       'Audit',
  teamoverleg: 'Teamoverleg',
  activiteit:  'Activiteit',
  herinnering: 'Herinnering',
  atv_dag:     'ATV-dag',
  overig:      'Overig',
}

export const bedrijfsagendaTypeKleur: Record<BedrijfsagendaType, string> = {
  vca_toolbox: '#e05c2a',
  audit:       '#7c3aed',
  teamoverleg: '#2563eb',
  activiteit:  '#16a34a',
  herinnering: '#d97706',
  atv_dag:     '#0891b2',
  overig:      '#64748b',
}

export type BedrijfsagendaHerhaling =
  | 'geen'
  | 'dagelijks'
  | 'wekelijks'
  | 'maandelijks'
  | 'jaarlijks'

export type BedrijfsagendaItem = {
  id:                          string
  type:                        BedrijfsagendaType
  titel:                       string
  omschrijving:                string | null
  start_datum:                 string
  eind_datum:                  string
  start_tijd:                  string | null
  eind_tijd:                   string | null
  hele_dag:                    boolean
  locatie:                     string | null
  kleur:                       string | null
  herhaling:                   BedrijfsagendaHerhaling
  herhaling_einde:             string | null
  herhaling_interval:          number
  herhaling_weekdagen:         number[] | null
  herhaling_aantal:            number | null
  herhaling_maand_type:         'dag' | 'weekdag'
  herhaling_maand_weekordinal:  number | null
  herhaling_uitzonderingen:     string[]
  in_planning:                  boolean
  in_agenda:                   boolean
  stuur_herinnering:           boolean
  herinnering_dagen:           number
  aangemaakt_door:             string | null
  created_at:                  string
  updated_at:                  string
}

export type BedrijfsagendaItemMetDoelgroep = BedrijfsagendaItem & {
  doelgroep_afdelingen:  string[]
  doelgroep_medewerkers: string[]
}

export type BedrijfsagendaVirtueel = {
  id:            string
  type:          'verjaardag' | 'jubileum' | 'feestdag'
  titel:         string
  start_datum:   string
  eind_datum:    string
  hele_dag:      true
  in_planning:   false
  kleur:         string
  medewerker_id?: string
}

export type BedrijfsagendaRegel =
  | (BedrijfsagendaItemMetDoelgroep & { bron: 'handmatig'; series_id?: string })
  | (BedrijfsagendaVirtueel         & { bron: 'berekend' })

/**
 * Door EVA ingevoerde "% gereed" (voortgang), terug te schrijven naar Bouw7.
 * Tabel: public.dossier_voortgang. Niveau 'project' = projectbreed; 'bewakingscode' = standopname per code.
 */
export type DossierVoortgang = {
  id:                 string
  dossier_id:         string | null
  bouw7_id:           string
  niveau:             'project' | 'bewakingscode'
  bewakingscode:      string | null
  pct_gereed:         number
  bron:               string
  bouw7_sync_status:  'pending' | 'synced' | 'error'
  bouw7_sync_fout:    string | null
  bouw7_laatst_sync:  string | null
  gewijzigd_door:     string | null
  created_at:         string
  updated_at:         string
}

// ── Oplevering-module ─────────────────────────────────────────────────────────

export type OpleverMomentType = 'vooroplevering' | 'eindoplevering' | 'tussenoplevering' | 'overig'

export const opleverMomentTypeLabels: Record<OpleverMomentType, string> = {
  vooroplevering:   'Vooroplevering',
  eindoplevering:   'Eindoplevering',
  tussenoplevering: 'Tussenoplevering',
  overig:           'Overig',
}

export type OpleverMomentStatus =
  | 'concept'
  | 'in_uitvoering'
  | 'gereed_voor_ondertekening'
  | 'ondertekend'
  | 'afgerond'

export const opleverMomentStatusLabels: Record<OpleverMomentStatus, string> = {
  concept:                   'Concept',
  in_uitvoering:             'In uitvoering',
  gereed_voor_ondertekening: 'Gereed voor ondertekening',
  ondertekend:               'Ondertekend',
  afgerond:                  'Afgerond',
}

/**
 * Opleverpunt-statusmachine (domein): Open → In behandeling → Opgelost → Geaccepteerd | Geweigerd.
 *
 * Twee statussen staan buiten die keten:
 * - `nieuw`     — gemeld via een formulier, wacht op triage door de projectleider.
 * - `afgewezen` — terminaal: dit is geen opleverpunt. Niet te verwarren met `geweigerd`, dat juist
 *                 actief is (de afmelding deugt niet, het werk moet opnieuw).
 */
export type OpleverPuntStatus =
  | 'nieuw'
  | 'open'
  | 'in_behandeling'
  | 'opgelost'
  | 'geaccepteerd'
  | 'geweigerd'
  | 'afgewezen'

/** Volgorde is functioneel: Object.keys() hiervan voedt de status-select in de Oplevering-tab. */
export const opleverPuntStatusLabels: Record<OpleverPuntStatus, string> = {
  nieuw:         'Nieuwe melding',
  open:          'Open',
  in_behandeling:'In behandeling',
  opgelost:      'Opgelost',
  geaccepteerd:  'Geaccepteerd',
  geweigerd:     'Geweigerd',
  afgewezen:     'Afgewezen',
}

/** `veiligheid` is voorbereid voor VCA/KAM-formulieren maar nog nergens in gebruik. */
export type OpleverPuntSoort = 'oplever' | 'veiligheid'

export const opleverPuntSoortLabels: Record<OpleverPuntSoort, string> = {
  oplever:    'Opleverpunt',
  veiligheid: 'Veiligheid / VCA',
}

export type OpleverPuntBron = 'handmatig' | 'formulier'

export type OpleverToewijzingType = 'medewerker' | 'relatie'
export type OpleverReactieAuteurType = 'intern' | 'onderaannemer'
export type OpleverReactieSoort = 'afmelding' | 'review' | 'opmerking'
export type OpleverFotoSoort = 'voor' | 'na' | 'algemeen'
export type OpleverHandtekeningRol = 'opdrachtgever' | 'opzichter' | 'uitvoerder'
export type OpleverHandtekeningMethode = 'pad' | 'akkoord_knop'
export type OpleverTokenScope = 'onderaannemer' | 'ondertekening' | 'feedback'

export type OpleverMoment = {
  id: string
  dossier_id: string
  titel: string
  type: OpleverMomentType
  status: OpleverMomentStatus
  opgeleverd_op: string | null
  opmerking: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type OpleverPunt = {
  id: string
  /** Null voor punten die uit een formulier komen: die horen bij het dossier, niet bij een moment. */
  moment_id: string | null
  dossier_id: string
  /** Loopt per moment; voor losse punten (moment_id null) per dossier. Weergave: OP-xx resp. AP-xx. */
  volgnummer: number
  omschrijving: string
  ruimte: string | null
  status: OpleverPuntStatus
  soort: OpleverPuntSoort
  toegewezen_type: OpleverToewijzingType | null
  toegewezen_medewerker_id: string | null
  toegewezen_relatie_id: string | null
  deadline: string | null
  is_extra_werk: boolean
  meerwerk_regel_id: string | null
  geweigerd_reden: string | null
  afgemeld_op: string | null
  geaccepteerd_op: string | null
  // Herkomst — gevuld bij bron 'formulier'.
  bron: OpleverPuntBron
  form_inzending_id: string | null
  bron_veld_id: string | null
  bron_index: number | null
  melder_naam: string | null
  created_at: string
  updated_at: string
  created_by: string | null
}

export type OpleverPuntReactie = {
  id: string
  punt_id: string
  auteur_type: OpleverReactieAuteurType
  auteur_naam: string | null
  auteur_medewerker_id: string | null
  soort: OpleverReactieSoort
  opmerking: string | null
  foto_urls: string[]
  created_at: string
}

export type OpleverFoto = {
  id: string
  punt_id: string
  url: string
  soort: OpleverFotoSoort
  created_at: string
  created_by: string | null
}

export type OpleverHandtekening = {
  id: string
  moment_id: string
  rol: OpleverHandtekeningRol
  naam: string | null
  methode: OpleverHandtekeningMethode
  handtekening_url: string | null
  akkoord_op: string
  ip: string | null
  created_at: string
}

export type OpleverToegangToken = {
  id: string
  token_hash: string
  dossier_id: string
  scope: OpleverTokenScope
  relatie_id: string | null
  moment_id: string | null
  form_template_id: string | null
  omschrijving: string | null
  verloopt_op: string | null
  gebruikt_op: string | null
  created_at: string
  created_by: string | null
}

// ---------------------------------------------------------------------------
// Klantportaal
// ---------------------------------------------------------------------------

/**
 * Welke dossiers een portaalgebruiker ziet.
 *  - eigen_dossiers   → alleen waar deze contactpersoon aan hangt (standaard)
 *  - organisatie      → alle dossiers van zijn relatie
 *  - alleen_gekoppeld → uitsluitend wat expliciet gekoppeld is; voor meekijkers
 *    van buiten (VvE-voorzitter, adviseur van de opdrachtgever) die bij één
 *    project horen en verder nergens bij
 * Losse koppelingen uit portaal_gebruiker_dossiers tellen bij alle drie mee.
 */
export type PortaalScope = 'eigen_dossiers' | 'organisatie' | 'alleen_gekoppeld'

export type PortaalGebruiker = {
  id: string
  auth_user_id: string | null
  email: string
  contactpersoon_id: string | null
  particulier_id: string | null
  relatie_id: string | null
  scope: PortaalScope
  actief: boolean
  uitgenodigd_op: string | null
  uitgenodigd_door: string | null
  laatste_link_op: string | null
  laatst_ingelogd_op: string | null
  created_at: string
  updated_at: string
}

/**
 * De onderdelen die per dossier los aan of uit staan. De sleutel is bewust
 * gelijk aan het achtervoegsel van de kolom in portaal_dossier_instellingen
 * (toon_bestanden → 'bestanden'), zodat de guard de vlag rechtstreeks kan
 * opzoeken zonder vertaaltabel.
 */
export type PortaalOnderdeel =
  | 'bestanden'
  | 'fotos'
  | 'facturen'
  | 'formulieren'
  | 'aandachtspunten'
  | 'planning'
  | 'chat'
  | 'afspraken'

export type PortaalDossierInstellingen = {
  dossier_id: string
  actief: boolean
  toon_bestanden: boolean
  toon_fotos: boolean
  toon_facturen: boolean
  toon_formulieren: boolean
  toon_aandachtspunten: boolean
  toon_planning: boolean
  /** false = alleen fases; true = ook de losse activiteiten. Nooit medewerkers. */
  planning_detail: boolean
  toon_chat: boolean
  toon_afspraken: boolean
  gewijzigd_op: string
  gewijzigd_door: string | null
}

export type PortaalBestandBron = 'bouw7' | 'sharepoint' | 'storage'
export type PortaalBestandSoort = 'document' | 'afbeelding'

export type PortaalBestand = {
  dossier_id: string
  /** 'bouw7:<id>' | 'sharepoint:<itemId>' | 'storage:<bucket>/<pad>' */
  sleutel: string
  bron: PortaalBestandBron
  /** Bevroren BestandRij.bronQuery — de enige bron die de proxy vertrouwt. */
  bron_query: string
  naam: string | null
  extensie: string | null
  soort: PortaalBestandSoort
  grootte: number | null
  datum: string | null
  zichtbaar: boolean
  gewijzigd_op: string
  gewijzigd_door: string | null
}

export type PortaalBerichtBijlage = {
  pad: string
  naam: string
  content_type: string | null
  grootte: number | null
}

export type PortaalBericht = {
  id: string
  dossier_id: string
  auteur_type: 'klant' | 'medewerker'
  portaal_gebruiker_id: string | null
  medewerker_id: string | null
  bericht: string
  bijlagen: PortaalBerichtBijlage[]
  /** Interne kanttekening: staat in dezelfde draad, gaat nooit naar het portaal. */
  intern: boolean
  created_at: string
}

export type PortaalMailSoort = 'uitnodiging' | 'nieuw_bericht' | 'herinnering'
export type PortaalMailStatus = 'wachtend' | 'verzonden' | 'mislukt' | 'geannuleerd'
