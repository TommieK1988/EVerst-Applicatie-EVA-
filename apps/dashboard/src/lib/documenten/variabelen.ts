/**
 * variabelen.ts — de variabelen-catalogus voor documentsjablonen.
 *
 * Dit is de tegenhanger van `WORD_VARIABELEN` in de offerte-layout-editor, maar
 * dan voor documenten: geen offerteregels/totalen, wél rollen, planning,
 * oplevering, garantie en vrije invoervelden.
 *
 * LET OP: deze lijst is documentatie voor de sjabloonbeheerder. De werkelijke
 * waarheid is de context uit `buildDocumentContext()`. Wijzig je daar een sleutel,
 * pas hem hier ook aan — er is bewust geen automatische koppeling (die zou label
 * en uitleg niet kunnen genereren). "Template controleren" in de editor vergelijkt
 * de tags in het .docx tegen déze lijst en meldt onbekende variabelen.
 */

import { ROLLEN } from './rollen'

export interface VariabeleGroep {
  groep: string
  /** Toelichting boven de groep. */
  uitleg?: string
  items: { v: string; label: string }[]
  /**
   * Tagnamen die alléén bínnen een loop van deze groep bestaan ({nummer},
   * {locatie_pad}, …). Ze staan niet als los item in de lijst — dat zou de
   * beheerder verleiden ze buiten de loop te plakken — maar moeten wél als bekend
   * gelden, anders meldt "Template controleren" ze allemaal als onbekende variabele.
   */
  binnenLoop?: string[]
  /**
   * Varianten die wél bestaan maar niet als los item in de lijst horen, omdat ze de
   * lijst zouden verdubbelen zonder iets toe te voegen: de `_iso`-vormen en de
   * per-datum-schakelaars. Ze moeten hier staan, anders meldt "Template controleren"
   * ze als onbekende variabele terwijl ze gewoon werken.
   */
  extraNamen?: string[]
}

const ROL_LABELS: Record<string, string> = {
  projectleider:    'Projectleider',
  uitvoerder:       'Uitvoerder',
  calculator:       'Calculator',
  werkvoorbereider: 'Werkvoorbereider',
  teamleider:       'Teamleider',
  controller:       'Controller',
}

/** Bouwt het variabelenblok voor één projectrol. */
function rolGroep(rol: string): VariabeleGroep {
  const L = ROL_LABELS[rol] ?? rol
  return {
    groep: `${L} (projectrol)`,
    items: [
      { v: `{${rol}.naam}`,     label: `${L} — volledige naam` },
      { v: `{${rol}.voornaam}`, label: `${L} — voornaam` },
      { v: `{${rol}.functie}`,  label: `${L} — functie` },
      { v: `{${rol}.telefoon}`, label: `${L} — telefoon` },
      { v: `{${rol}.mobiel}`,   label: `${L} — mobiel` },
      { v: `{${rol}.email}`,    label: `${L} — e-mail` },
      { v: `{%foto_${rol}}`,    label: `${L} — foto (eigen alinea!)` },
      { v: `{#${rol}.heeft}…{/${rol}.heeft}`, label: `Alleen tonen als ${L.toLowerCase()} is ingevuld` },
    ],
  }
}

export const DOCUMENT_VARIABELEN: VariabeleGroep[] = [
  {
    groep: 'Afbeeldingen',
    uitleg: 'Een afbeeldings-tag ({%…}) moet alléén in zijn eigen alinea staan, anders faalt het renderen.',
    items: [
      { v: '{%logo}',          label: 'Logo van de werkmaatschappij' },
      { v: '{%logo_wit}',      label: 'Logo wit (voor donkere achtergrond)' },
      { v: '{%handtekening}',  label: 'Handtekening van de ondertekenaar' },
    ],
  },
  {
    groep: 'Document',
    items: [
      { v: '{document.datum}',         label: 'Datum van vandaag (14 juli 2026)' },
      { v: '{document.datum_iso}',     label: 'Datum van vandaag (2026-07-14)' },
      { v: '{document.plaats}',        label: 'Plaats van de werkmaatschappij' },
      { v: '{document.soort}',         label: 'Documentsoort' },
      { v: '{document.naam}',          label: 'Naam van het sjabloon' },
      { v: '{document.dossiernummer}', label: 'Dossiernummer' },
      { v: '{document.opdrachtnummer}',label: 'Opdrachtnummer / referentie' },
      { v: '{document.nummer}',        label: 'Ordernummer (alleen bij inkooporder/OA-contract)' },
    ],
  },
  {
    groep: 'Bestelling (inkooporder / OA-contract)',
    uitleg: 'Alleen gevuld bij de documentsoorten "Inkooporder" en "Onderaannemerscontract". De bedragen zijn exclusief btw en gelijk aan wat in Bouw7 op het contract staat.',
    items: [
      { v: '{bestelling.nummer}',        label: 'Ordernummer uit Bouw7 (20261.00357OA002)' },
      { v: '{bestelling.omschrijving}',  label: 'Omschrijving van de order' },
      { v: '{bestelling.soort_label}',   label: 'Inkooporder of Onderaannemerscontract' },
      { v: '{bestelling.levering}',      label: 'Levering/start zoals afgesproken ("week 34" of de datum)' },
      { v: '{bestelling.levering_datum}',label: 'Lever-/startdatum (14 juli 2026)' },
      { v: '{bestelling.oplever_datum}', label: 'Verwachte opleverdatum' },
      { v: '{bestelling.betaalafspraak}',label: 'Betaalafspraak' },
      { v: '{bestelling.afspraken}',     label: 'Specifieke afspraken bij deze opdracht' },
      { v: '{bestelling.inhouding}',     label: 'Inhouding tot alle opleverpunten weg zijn ("5%")' },
      { v: '{bestelling.boete}',         label: 'Boeteclausule bij te late oplevering' },
      { v: '{bestelling.werkadres}',     label: 'Werkadres van déze opdracht; leeg = het dossieradres' },
      { v: '{bestelling.offertenummer}', label: 'Offertekenmerk van de leverancier ("uw offertenummer")' },
      { v: '{bestelling.totaal}',        label: 'Ordertotaal excl. btw' },
      { v: '{bestelling.aantal_regels}', label: 'Aantal regels' },
      { v: '{bestelling.bonnummer}',     label: 'Leverbonnummer uit Bouw7' },
      { v: '{#bestelling.regels}…{/bestelling.regels}', label: 'Regeltabel; binnenin: {nummer} {omschrijving} {aantal} {eenheid} {stukprijs} {bedrag} {code}' },
      { v: '{#bestelling.termijnen}…{/bestelling.termijnen}', label: 'Termijnschema van deze opdracht (leeg als er geen is gekozen); binnenin: {omschrijving} {percentage} {bedrag}' },
      { v: '{#bestelling.heeft}…{/bestelling.heeft}',   label: 'Alleen tonen als er een bestelling aan hangt' },
      { v: '{#bestelling.is_oa}…{/bestelling.is_oa}',   label: 'Alleen bij een onderaannemerscontract' },
      { v: '{#bestelling.is_inkooporder}…{/bestelling.is_inkooporder}', label: 'Alleen bij een inkooporder' },
    ],
  },
  {
    groep: 'Leverancier / onderaannemer',
    uitleg: 'De partij aan wie de order gericht is. Bij een inkoopdocument gebruik je dit blok in plaats van {geadresseerde.*} of {klant.*}.',
    items: [
      { v: '{leverancier.naam}',                 label: 'Naam' },
      { v: '{leverancier.nummer}',               label: 'Relatienummer ("bestelling voor")' },
      { v: '{leverancier.adres}',                label: 'Straat en huisnummer' },
      { v: '{leverancier.postcode}',             label: 'Postcode' },
      { v: '{leverancier.plaats}',               label: 'Plaats' },
      { v: '{leverancier.volledig_adres}',       label: 'Adres op één regel' },
      { v: '{leverancier.email}',                label: 'E-mail' },
      { v: '{leverancier.telefoon}',             label: 'Telefoon' },
      { v: '{leverancier.website}',              label: 'Website' },
      { v: '{leverancier.kvk}',                  label: 'KvK-nummer' },
      { v: '{leverancier.btw}',                  label: 'BTW-nummer' },
      { v: '{leverancier.contactpersoon}',       label: 'Contactpersoon — naam' },
      { v: '{leverancier.contactpersoon_email}', label: 'Contactpersoon — e-mail' },
      { v: '{leverancier.contactpersoon_telefoon}', label: 'Contactpersoon — telefoon' },
      { v: '{#leverancier.heeft}…{/leverancier.heeft}', label: 'Alleen tonen als er een leverancier gekoppeld is' },
    ],
  },
  {
    groep: 'Opdracht (opdrachtbevestiging)',
    uitleg: 'Alleen gevuld bij documentsoort "Opdrachtbevestiging": de onderdelen die in opdracht zijn gegeven, met bedragen — zonder interne bewakingscodes.',
    items: [
      { v: '{opdracht.aanneemsom}',            label: 'Aanneemsom excl. btw' },
      { v: '{opdracht.stelposten_totaal}',     label: 'Totaal stelposten excl. btw' },
      { v: '{opdracht.gekozen_opties_totaal}', label: 'Totaal gekozen opties excl. btw' },
      { v: '{opdracht.contracttotaal}',        label: 'Contracttotaal excl. btw (aanneemsom + gekozen opties)' },
      { v: '{#opdracht.onderdelen}…{/opdracht.onderdelen}', label: 'Lijst in-opdracht-onderdelen; binnenin: {soort} {omschrijving} {bedrag}' },
      { v: '{#opdracht.stelposten}…{/opdracht.stelposten}', label: 'Alleen de stelposten; binnenin: {omschrijving} {bedrag}' },
      { v: '{#opdracht.opties}…{/opdracht.opties}',         label: 'Alleen de gekozen opties; binnenin: {omschrijving} {bedrag}' },
      { v: '{#opdracht.heeft}…{/opdracht.heeft}',           label: 'Alleen tonen als er een samenstelling is' },
    ],
  },
  {
    groep: 'Geadresseerde',
    uitleg: 'Het werkadres van het dossier — bij een bewonersbrief is dat de bewoner.',
    items: [
      { v: '{geadresseerde.aanhef}',        label: 'Aanhef (invoerveld "aanhef", standaard "Geachte bewoner")' },
      { v: '{geadresseerde.naam}',          label: 'Naam' },
      { v: '{geadresseerde.adres}',         label: 'Straat en huisnummer' },
      { v: '{geadresseerde.postcode}',      label: 'Postcode' },
      { v: '{geadresseerde.plaats}',        label: 'Plaats' },
      { v: '{geadresseerde.volledig_adres}',label: 'Adres op één regel' },
      { v: '{geadresseerde.email}',         label: 'E-mail' },
      { v: '{geadresseerde.telefoon}',      label: 'Telefoon' },
    ],
  },
  {
    groep: 'Ondertekenaar (jij)',
    uitleg: 'De ingelogde medewerker die het document opstelt.',
    items: [
      { v: '{ondertekenaar.naam}',     label: 'Naam' },
      { v: '{ondertekenaar.functie}',  label: 'Functie' },
      { v: '{ondertekenaar.telefoon}', label: 'Telefoon' },
      { v: '{ondertekenaar.mobiel}',   label: 'Mobiel' },
      { v: '{ondertekenaar.email}',    label: 'E-mail' },
    ],
  },
  ...ROLLEN.map(rolGroep),
  {
    groep: 'Werk / dossier',
    items: [
      { v: '{dossier.dossiernummer}',       label: 'Dossiernummer' },
      { v: '{dossier.titel}',               label: 'Projectnaam' },
      { v: '{dossier.referentie}',          label: 'Referentie' },
      { v: '{dossier.opdracht_referentie}', label: 'Inkoop-/opdrachtnummer' },
      { v: '{dossier.vve_code}',            label: 'VvE-code' },
      { v: '{dossier.werkadres}',           label: 'Werkadres op één regel' },
      { v: '{dossier.werkadres_straat}',    label: 'Werkadres — straat' },
      { v: '{dossier.werkadres_postcode}',  label: 'Werkadres — postcode' },
      { v: '{dossier.werkadres_plaats}',    label: 'Werkadres — plaats' },
    ],
  },
  {
    groep: 'Planning',
    items: [
      { v: '{planning.startdatum}',    label: 'Startdatum uit Bouw7 (14 juli 2026)' },
      { v: '{planning.einddatum}',     label: 'Einddatum uit Bouw7' },
      { v: '{planning.voorlopige_startdatum}', label: 'Voorlopige startdatum (handmatig op het dossier)' },
      { v: '{planning.voorlopige_einddatum}',  label: 'Voorlopige einddatum' },
      { v: '{planning.voorlopige_periode}',    label: 'Voorlopige periode ("14 juli 2026 t/m 8 augustus 2026")' },
      { v: '{planning.werkzaamheden}', label: 'Werkzaamheden (invoerveld "werkzaamheden")' },
      { v: '{#planning.heeft}…{/planning.heeft}', label: 'Alleen tonen als er datums bekend zijn' },
      { v: '{#planning.heeft_voorlopig}…{/planning.heeft_voorlopig}', label: 'Alleen tonen als er een voorlopige planning is' },
    ],
    extraNamen: [
      'planning.startdatum_iso', 'planning.einddatum_iso',
      'planning.voorlopige_startdatum_iso', 'planning.voorlopige_einddatum_iso',
    ],
  },
  {
    groep: 'Datums van het dossier',
    uitleg: 'De acht procesdatums uit het Datums-blok op de dossierpagina. Elke datum heeft ook een schakelaar, bijvoorbeeld {#datums.heeft_opdrachtdatum}…{/datums.heeft_opdrachtdatum}, zodat een regel wegvalt in plaats van leeg af te drukken. Let op: {datums.startdatum} komt uit de EVA-planning, {planning.startdatum} uit Bouw7.',
    items: [
      { v: '{datums.aanvraagdatum}',     label: 'Aanvraagdatum (valt terug op de aanmaakdatum)' },
      { v: '{datums.deadline}',          label: 'Deadline (offerte verzenden)' },
      { v: '{datums.offertedatum}',      label: 'Offertedatum (moment van verzenden)' },
      { v: '{datums.opdrachtdatum}',     label: 'Opdrachtdatum' },
      { v: '{datums.startdatum}',        label: 'Startdatum uit de planning' },
      { v: '{datums.einddatum}',         label: 'Einddatum uit de planning' },
      { v: '{datums.opleverdatum}',      label: 'Opleverdatum (eindoplevering)' },
      { v: '{datums.financieel_gereed}', label: 'Datum financieel gereed' },
      { v: '{#datums.heeft}…{/datums.heeft}', label: 'Alleen tonen als er minstens één datum bekend is' },
    ],
    extraNamen: [
      'aanvraagdatum', 'deadline', 'offertedatum', 'opdrachtdatum',
      'startdatum', 'einddatum', 'opleverdatum', 'financieel_gereed',
    ].flatMap(s => [`datums.${s}_iso`, `datums.heeft_${s}`]),
  },
  {
    groep: 'Oplevering & garantie',
    uitleg: 'Voor het garantiecertificaat. Termijn en behandelingen zijn invoervelden — die staan niet in het dossier.',
    items: [
      { v: '{oplevering.datum}',      label: 'Opleverdatum (uit de Oplevering-tab)' },
      { v: '{garantie.termijn_jaren}',label: 'Garantietermijn in jaren (invoerveld "garantie_jaren")' },
      { v: '{garantie.tot_datum}',    label: 'Garantie geldig tot (opleverdatum + termijn)' },
      { v: '{garantie.behandelingen}',label: 'Uitgevoerde behandelingen (invoerveld "behandelingen")' },
      { v: '{#oplevering.heeft}…{/oplevering.heeft}', label: 'Alleen tonen als er is opgeleverd' },
      { v: '{#garantie.heeft}…{/garantie.heeft}',     label: 'Alleen tonen als de garantie berekend kon worden' },
    ],
    extraNamen: ['oplevering.datum_iso', 'garantie.tot_datum_iso'],
  },
  {
    groep: 'Opdrachtgever',
    items: [
      { v: '{klant.naam}',     label: 'Naam' },
      { v: '{klant.adres}',    label: 'Adres' },
      { v: '{klant.postcode}', label: 'Postcode' },
      { v: '{klant.plaats}',   label: 'Plaats' },
      { v: '{klant.email}',    label: 'E-mail' },
      { v: '{klant.telefoon}', label: 'Telefoon' },
      { v: '{klant.kvk}',      label: 'KvK-nummer' },
      { v: '{klant.btw}',      label: 'BTW-nummer' },
    ],
  },
  {
    groep: 'Contactpersoon opdrachtgever',
    items: [
      { v: '{contactpersoon.naam}',          label: 'Naam' },
      { v: '{contactpersoon.voornaam}',      label: 'Voornaam' },
      { v: '{contactpersoon.achternaam}',    label: 'Achternaam' },
      { v: '{contactpersoon.aanhef}',        label: 'Aanhef' },
      { v: '{contactpersoon.aanspreekvorm}', label: 'heer / mevrouw' },
      { v: '{contactpersoon.email}',         label: 'E-mail' },
      { v: '{contactpersoon.telefoon}',      label: 'Telefoon' },
      { v: '{contactpersoon.mobiel}',        label: 'Mobiel' },
    ],
  },
  {
    groep: 'Jouw bedrijf / werkmaatschappij',
    items: [
      { v: '{bedrijf.naam}',            label: 'Naam' },
      { v: '{bedrijf.adres}',           label: 'Adres' },
      { v: '{bedrijf.postcode_plaats}', label: 'Postcode + plaats' },
      { v: '{bedrijf.telefoon}',        label: 'Telefoon' },
      { v: '{bedrijf.email}',           label: 'E-mail' },
      { v: '{bedrijf.website}',         label: 'Website' },
      { v: '{bedrijf.kvk}',             label: 'KvK-nummer' },
      { v: '{bedrijf.btw}',             label: 'BTW-nummer' },
      { v: '{bedrijf.iban}',            label: 'IBAN' },
    ],
  },
  {
    groep: 'Feedback-ronde (bewoners)',
    uitleg: 'Voor een bewonersbrief met feedback-link. Voeg onderaan één invoerveld van type ' +
      '"Feedback-link (bewoners)" toe; bij het opstellen kies/maak je de link. De KNOP maak je in Word als ' +
      'hyperlink naar exact https://feedback-link.eva/ — dat adres wordt bij het opstellen vervangen door de echte link.',
    items: [
      { v: '{%feedback_qr}',   label: 'QR-code van de feedback-link (eigen alinea!)' },
      { v: '{feedback.url}',   label: 'De feedback-link als tekst (opgeschoond)' },
      { v: '{#feedback.heeft}…{/feedback.heeft}', label: 'Alleen tonen als er een link is gekozen' },
    ],
  },
  {
    groep: 'Houtrot-rapportage — algemeen',
    uitleg: 'Alleen gevuld bij documentsoort "Houtrot-rapportage". Voeg onderaan één invoerveld van type ' +
      '"Houtrot-rapportage (filters)" toe met sleutel "houtrot"; daar kiest de opsteller het groeperingsniveau, ' +
      'het statusfilter, het aantal registraties per pagina en of verkoopprijzen mee mogen.',
    items: [
      { v: '{houtrot.aantal}',              label: 'Aantal registraties in de rapportage' },
      { v: '{houtrot.aantal_paginas}',      label: 'Aantal registratiepagina\'s' },
      { v: '{houtrot.per_pagina}',          label: 'Gekozen aantal registraties per pagina' },
      { v: '{houtrot.niveau_label}',        label: 'Naam van het groeperingsniveau (bv. "Gevelzijde")' },
      { v: '{houtrot.filter_omschrijving}', label: 'Toegepaste filters in tekst (voor het voorblad)' },
      { v: '{houtrot.totaal.verkoop}',      label: 'Totaal verkoopprijs (leeg zonder prijzen)' },
      { v: '{houtrot.totaal.kostprijs}',    label: 'Totaal kostprijs' },
      { v: '{houtrot.totaal.uren}',         label: 'Totaal arbeidsuren' },
      { v: '{houtrot.totaal.arbeid}',       label: 'Totaal arbeidskosten' },
      { v: '{houtrot.totaal.materiaal}',    label: 'Totaal materiaalkosten' },
      { v: '{houtrot.totaal.excl}',         label: 'Totaal exclusief btw' },
      { v: '{houtrot.totaal.btw}',          label: 'Totaal btw-bedrag' },
      { v: '{houtrot.totaal.incl}',         label: 'Totaal inclusief btw' },
      { v: '{#toon_prijzen}…{/toon_prijzen}', label: 'Alleen tonen als de opsteller prijzen heeft aangezet' },
      { v: '{#houtrot.heeft}…{/houtrot.heeft}', label: 'Alleen tonen als er registraties zijn' },
      { v: '{#houtrot.is_voorbeeld}…{/houtrot.is_voorbeeld}', label: 'Alleen in de preview (beperkt aantal registraties)' },
    ],
  },
  {
    groep: 'Houtrot-rapportage — registratiepagina\'s',
    uitleg: 'De registraties komen in brokken van het gekozen aantal per pagina. Zet ná {/registraties} een alinea ' +
      '{#niet_laatste}, dan een lege alinea met een handmatige paginabreuk (Ctrl+Enter), dan {/niet_laatste} — zo ' +
      'staat er nooit een breuk achter de laatste pagina. Geef de fotorij in Word een EXACTE rijhoogte van 3,8 cm en ' +
      'zet "Rijen niet over pagina\'s splitsen" aan: dan kan een registratie nooit over twee pagina\'s vallen.',
    items: [
      { v: '{#houtrot.paginas}…{/houtrot.paginas}', label: 'Loop over de pagina\'s' },
      { v: '{#registraties}…{/registraties}',       label: 'Binnen een pagina: loop over de registraties' },
      { v: '{pagina_nummer}',                       label: 'Nummer van deze pagina' },
      { v: '{#niet_laatste}…{/niet_laatste}',       label: 'Paginabreuk hierin zetten (niet ná de laatste pagina)' },
      { v: '{@paginabreuk}',                        label: 'Alternatief: paginabreuk als één tag (eigen alinea!)' },
      { v: '{locatie_pad}',                         label: 'Registratie — volledige locatie ("Voorgevel › 2e etage › nr. 14")' },
      { v: '{loc1}',                                label: 'Registratie — locatie niveau 1' },
      { v: '{loc2}',                                label: 'Registratie — locatie niveau 2' },
      { v: '{loc3}',                                label: 'Registratie — locatie niveau 3' },
      { v: '{%foto_voor}',                          label: 'Foto vóór (eigen alinea, in een tabelcel)' },
      { v: '{%foto_tijdens}',                       label: 'Foto tijdens (eigen alinea)' },
      { v: '{%foto_na}',                            label: 'Foto na (eigen alinea)' },
      { v: '{werkzaamheden_kort}',                  label: 'Werkzaamheden op één regel, afgekapt (voor de vaste indeling)' },
      { v: '{werkzaamheden_tekst}',                 label: 'Werkzaamheden op één regel, volledig' },
      { v: '{#werkzaamheden}…{/werkzaamheden}',     label: 'Regels per werkzaamheid; binnenin: {aantal} {code} {naam} {eenheid} {uren} {totaal}' },
      { v: '{bedragen.verkoop}',                    label: 'Registratie — verkoopprijs (leeg zonder prijzen)' },
    ],
    binnenLoop: [
      'pagina_nummer', 'aantal_paginas', 'eerste', 'laatste', 'niet_laatste', 'paginabreuk',
      'groep_naam', 'eerste_van_groep', 'registraties',
      'nummer', 'datum', 'datum_iso', 'locatie_pad', 'locatie_kort', 'loc1', 'loc2', 'loc3', 'locatie',
      'status', 'status_label', 'ernst_label', 'controle_label', 'afgerond',
      'schade', 'schade_kort', 'oorzaak', 'notitie', 'medewerker',
      'werkzaamheden', 'heeft_werkzaamheden', 'werkzaamheden_tekst', 'werkzaamheden_kort',
      'bedragen.verkoop', 'bedragen.kostprijs', 'bedragen.uren', 'bedragen.arbeid', 'bedragen.materiaal',
      'heeft_prijs', 'toon_prijzen',
      'foto_voor', 'foto_tijdens', 'foto_na', 'fotos.voor', 'fotos.tijdens', 'fotos.na',
      'heeft_foto_voor', 'heeft_foto_tijdens', 'heeft_foto_na', 'heeft_foto',
      // Binnen {#werkzaamheden}
      'aantal', 'code', 'naam', 'omschrijving', 'eenheid', 'uren',
      'prijs_per_stuk', 'totaal', 'kostprijs_per_stuk', 'kostprijs_totaal',
      // Binnen {#houtrot.groepen} en {#locatie}
      'niveau_label', 'waarde',
    ],
  },
  {
    groep: 'Houtrot-rapportage — totaalblad',
    uitleg: 'Het totaalblad groepeert op het niveau dat de opsteller kiest. Zet vóór de kop een paginabreuk ' +
      '(Alinea → Regel- en pagina-einden → "Pagina-einde ervoor"), buiten de loop.',
    items: [
      { v: '{#houtrot.groepen}…{/houtrot.groepen}', label: 'Loop over de groepen (bv. per gevelzijde)' },
      { v: '{naam}',                                label: 'Groep — naam' },
      { v: '{niveau_label}',                        label: 'Groep — naam van het niveau' },
      { v: '{aantal}',                              label: 'Groep — aantal registraties' },
      { v: '{totaal.verkoop}',                      label: 'Groep — totaal verkoopprijs' },
      { v: '{#houtrot.alle_registraties}…{/houtrot.alle_registraties}', label: 'Alternatief: alle registraties zonder groepering' },
    ],
    binnenLoop: ['totaal.verkoop', 'totaal.kostprijs', 'totaal.uren', 'totaal.arbeid', 'totaal.materiaal'],
  },
  {
    groep: 'Houtrot-rapportage — werkzaamheden en btw',
    uitleg: 'Het totaalblad telt de werkzaamheden van álle registraties bij elkaar: één regel per soort werk, ' +
      'met het totale aantal, de eenheidsprijs, het btw-percentage en het regeltotaal. Daaronder komt de ' +
      'btw-opstelling: per tarief een regel, en als slot het bedrag inclusief btw. Het btw-percentage van een ' +
      'werkzaamheid komt uit de eenheidsprijs en kan per opdrachtgever en per dossier worden aangepast ' +
      '(dossier → Houtrot → Btw-tarieven). Zonder prijzen blijven alle bedragvelden én de btw-loop leeg.',
    items: [
      { v: '{#houtrot.werkzaamheden}…{/houtrot.werkzaamheden}', label: 'Loop: één regel per werkzaamheid, opgeteld over alle registraties' },
      { v: '{naam}',           label: 'Werkzaamheid — naam' },
      { v: '{code}',           label: 'Werkzaamheid — code' },
      { v: '{aantal}',         label: 'Werkzaamheid — totaal aantal over alle registraties' },
      { v: '{eenheid}',        label: 'Werkzaamheid — eenheid (st, m, m²)' },
      { v: '{prijs_per_stuk}', label: 'Werkzaamheid — eenheidsprijs' },
      { v: '{btw_pct}',        label: 'Werkzaamheid — btw-percentage ("21%" of "21% verlegd")' },
      { v: '{totaal}',         label: 'Werkzaamheid — regeltotaal exclusief btw' },
      { v: '{uren}',           label: 'Werkzaamheid — totaal arbeidsuren' },
      { v: '{#houtrot.btw}…{/houtrot.btw}', label: 'Loop: btw-opstelling, één regel per tarief' },
      { v: '{label}',          label: 'Btw-regel — tarief ("9%", "21% verlegd")' },
      { v: '{excl}',           label: 'Btw-regel — bedrag exclusief btw met dit tarief' },
      { v: '{btw}',            label: 'Btw-regel — btw-bedrag' },
      { v: '{incl}',           label: 'Btw-regel — bedrag inclusief btw' },
    ],
    binnenLoop: [
      'naam', 'code', 'aantal', 'aantal_num', 'eenheid', 'prijs_per_stuk',
      'btw_pct', 'btw_pct_num', 'totaal', 'totaal_num', 'uren',
      'label', 'pct', 'verlegd', 'excl', 'btw', 'incl',
    ],
  },
  {
    groep: 'Bezoekrapport - kop en samenvatting',
    uitleg: 'Een rapportage voor elke controle op locatie: een kwaliteitsronde, een oplevering, '
      + 'een veiligheidsronde of een ingevuld formulier. Voeg bij "Invoervelden" een veld toe van '
      + 'het type "Bezoekrapport (bezoek kiezen)" met sleutel "bezoek"; daar kiest de opsteller '
      + 'welk bezoek het betreft. Hoofdstukken die de gekozen bron niet vult, verdwijnen vanzelf.',
    items: [
      { v: '{bezoek.soort_label}',        label: 'Soort bezoek - "Kwaliteitsronde", "Oplevering", "Veiligheidsronde" of "Inspectie"' },
      { v: '{bezoek.titel}',              label: 'Soort + kenmerk, als een regel' },
      { v: '{bezoek.kenmerk}',            label: 'Inspectienummer, naam van het oplevermoment of van het formulier' },
      { v: '{bezoek.datum}',              label: 'Datum van het bezoek' },
      { v: '{bezoek.tijd}',               label: 'Tijdstip' },
      { v: '{bezoek.uitvoerder}',         label: 'Wie het bezoek deed' },
      { v: '{bezoek.locatie}',            label: 'Het bekeken gebied' },
      { v: '{bezoek.omstandigheden}',     label: 'Weer' },
      { v: '{bezoek.werkzaamheden}',      label: 'Wat er op dat moment in uitvoering was' },
      { v: '{bezoek.inleiding}',          label: 'Inleidende tekst op het voorblad' },
      { v: '{bezoek.samenvatting_regel}', label: 'Een zin met de uitkomst' },
      { v: '{bezoek.opmerkingen}',        label: 'Algemene opmerkingen' },
      { v: '{bezoek.disclaimer}',         label: 'Vaste toelichting (komt uit de code, niet uit het sjabloon)' },
      { v: '{bezoek.aantal_bevindingen}', label: 'Aantal bevindingen' },
      { v: '{bezoek.aantal_open}',        label: 'Aantal nog openstaande bevindingen' },
      { v: '{#bezoek.heeft_kengetallen}...{/bezoek.heeft_kengetallen}', label: 'Alleen tonen als er kengetallen zijn' },
      { v: '{#bezoek.kengetallen}...{/bezoek.kengetallen}', label: 'Loop over de tellingen (label + waarde)' },
    ],
    binnenLoop: ['label', 'waarde', 'is_negatief'],
    // Interne velden van het blok: bruikbaar in een sjabloon, maar niet iets waar een
    // beheerder naar zoekt. Wel bekend maken, anders meldt "Template controleren" ze.
    extraNamen: [
      'bezoek.aanwezig', 'bezoek.soort', 'bezoek.alle_bevindingen', 'bezoek.per_pagina',
    ],
  },
  {
    groep: 'Bezoekrapport - bevindingen',
    uitleg: 'Het aandachtspunt, de afwijking of het veiligheidspunt. Zet de pagina-loop eromheen '
      + 'en gebruik {#niet_laatste} met een echt pagina-einde (Ctrl+Enter) ertussen. Geef de rij '
      + 'een exacte hoogte en zet "Rijen niet over pagina\'s splitsen" aan.',
    items: [
      { v: '{#bezoek.heeft_bevindingen}...{/bezoek.heeft_bevindingen}', label: 'Alleen tonen als er bevindingen zijn' },
      { v: '{#bezoek.paginas}...{/bezoek.paginas}', label: 'Loop over de pagina\'s' },
      { v: '{#bevindingen}...{/bevindingen}',       label: 'Loop over de bevindingen van een pagina' },
      { v: '{nummer}',            label: 'Nummer, bv. OP-03 of KA-2026-014' },
      { v: '{titel}',             label: 'Korte kop (ruimte of controlepunt)' },
      { v: '{omschrijving_kort}', label: 'Omschrijving, afgekapt op 220 tekens' },
      { v: '{locatie}',           label: 'Waar' },
      { v: '{groep}',             label: 'Discipline, ruimte of sectie' },
      { v: '{ernst_label}',       label: 'Ernst' },
      { v: '{status_label}',      label: 'Status' },
      { v: '{eis_kort}',          label: 'De eis, afgekapt' },
      { v: '{meting}',            label: 'Gemeten waarde met eenheid' },
      { v: '{actie_kort}',        label: 'Vervolgactie, afgekapt' },
      { v: '{hersteldatum}',      label: 'Gewenste hersteldatum' },
      { v: '{%bevinding_foto}',   label: 'Foto (voor). Moet alleen in zijn eigen alinea staan' },
      { v: '{%bevinding_foto_na}',label: 'Foto na herstel' },
      { v: '{#heeft_foto_na}...{/heeft_foto_na}', label: 'Alleen tonen als er een na-foto is' },
      { v: '{#is_kritiek}...{/is_kritiek}',       label: 'Alleen tonen bij een kritieke bevinding' },
      { v: '{#niet_laatste}...{/niet_laatste}',   label: 'Pagina-einde, behalve op de laatste pagina' },
    ],
    binnenLoop: [
      'bevindingen', 'nummer', 'volgnummer', 'titel', 'omschrijving', 'omschrijving_kort',
      'locatie', 'groep', 'ernst', 'ernst_label', 'is_kritiek', 'status', 'status_label',
      'is_open', 'is_opgelost', 'eis', 'eis_kort', 'meting', 'actie', 'actie_kort',
      'datum', 'hersteldatum', 'bevinding_foto', 'bevinding_foto_na',
      'heeft_foto', 'heeft_foto_na', 'reacties', 'heeft_reacties',
      'pagina_nummer', 'aantal_paginas', 'eerste', 'laatste', 'niet_laatste', 'paginabreuk',
      'groep_naam', 'eerste_van_groep', 'tekst',
    ],
  },
  {
    groep: 'Bezoekrapport - overige hoofdstukken',
    uitleg: 'Metingen, beoordeelde punten, positieve waarnemingen, opvolging en ondertekening. '
      + 'Zet elk hoofdstuk tussen zijn {#bezoek.heeft_...}-conditie; dan verdwijnt het bij een bron '
      + 'die het niet kent - een oplevering heeft geen metingen, een kwaliteitsronde geen handtekening.',
    items: [
      { v: '{#bezoek.heeft_metingen}...{/bezoek.heeft_metingen}', label: 'Hoofdstuk Metingen' },
      { v: '{#bezoek.metingen}...{/bezoek.metingen}',             label: 'Loop: {code} {onderdeel} {locatie} {meting} {eis} {meetmiddel} {resultaat}' },
      { v: '{#bezoek.heeft_punten}...{/bezoek.heeft_punten}',     label: 'Hoofdstuk Wat er is beoordeeld' },
      { v: '{#bezoek.punten}...{/bezoek.punten}',                 label: 'Loop: {code} {groep} {onderdeel} {vraag} {resultaat} {opmerking}' },
      { v: '{#bezoek.heeft_waarnemingen}...{/bezoek.heeft_waarnemingen}', label: 'Hoofdstuk Wat er goed ging' },
      { v: '{#bezoek.waarnemingen}...{/bezoek.waarnemingen}',     label: 'Loop: {omschrijving} {locatie} {groep} {%waarneming_foto}' },
      { v: '{#bezoek.heeft_opvolging}...{/bezoek.heeft_opvolging}', label: 'Hoofdstuk Opvolging eerdere bezoeken' },
      { v: '{bezoek.opvolging_regel}',                            label: 'Samenvattende zin bij de opvolging' },
      { v: '{#bezoek.opvolging}...{/bezoek.opvolging}',           label: 'Loop: {nummer} {omschrijving} {locatie} {status_label} {hercontrole}' },
      { v: '{#bezoek.heeft_handtekeningen}...{/bezoek.heeft_handtekeningen}', label: 'Hoofdstuk Ondertekening' },
      { v: '{#bezoek.handtekeningen}...{/bezoek.handtekeningen}', label: 'Loop: {rol_label} {naam} {datum}' },
      { v: '{%beeld}',                                            label: 'De handtekening zelf' },
      { v: '{#heeft_beeld}...{/heeft_beeld}',                     label: 'Alleen bij een echte handtekening' },
      { v: '{^heeft_beeld}...{/heeft_beeld}',                     label: 'Anders: "digitaal akkoord"' },
    ],
    binnenLoop: [
      'code', 'onderdeel', 'vraag', 'meetmiddel', 'resultaat', 'voldoet', 'opmerking',
      'omschrijving', 'hercontrole', 'hersteld', 'rol', 'rol_label', 'naam', 'methode',
      'beeld', 'heeft_beeld', 'waarneming_foto', 'foto_klein', 'niet_beoordeeld', 'afwijkend',
    ],
  },
  {
    groep: 'Kwaliteitscontrole-rapport (oudere, losse soort)',
    uitleg: 'Voor nieuwe sjablonen kun je beter het Bezoekrapport hierboven gebruiken; deze soort '
      + 'blijft bestaan zodat bestaande sjablonen blijven werken.',
    items: [
      { v: '{kwaliteit.inspectienummer}',     label: 'Inspectienummer' },
      { v: '{kwaliteit.datum}',               label: 'Inspectiedatum' },
      { v: '{kwaliteit.tijd}',                label: 'Tijdstip' },
      { v: '{kwaliteit.inspecteur}',          label: 'Inspecteur' },
      { v: '{kwaliteit.weer}',                label: 'Weersomstandigheden' },
      { v: '{kwaliteit.gebied}',              label: 'Gelopen gebied' },
      { v: '{kwaliteit.werkzaamheden}',       label: 'Aanwezige werkzaamheden' },
      { v: '{kwaliteit.disciplines}',         label: 'Gecontroleerde disciplines' },
      { v: '{kwaliteit.samenvatting_regel}',  label: 'Samenvattende zin' },
      { v: '{kwaliteit.steekproef}',          label: 'Omvang van de steekproef' },
      { v: '{kwaliteit.totaal_beoordeeld}',   label: 'Aantal beoordeeld' },
      { v: '{kwaliteit.totaal_voldoet}',      label: 'Aantal dat voldoet' },
      { v: '{kwaliteit.totaal_voldoet_niet}', label: 'Aantal dat niet voldoet' },
      { v: '{kwaliteit.totaal_niet_beoordeeld}', label: 'Aantal niet beoordeeld' },
      { v: '{kwaliteit.totaal_nvt}',          label: 'Aantal niet van toepassing' },
      { v: '{kwaliteit.totaal_nader_onderzoek}', label: 'Aantal nader onderzoek' },
      { v: '{kwaliteit.aantal_kritiek}',      label: 'Aantal kritieke afwijkingen' },
      { v: '{kwaliteit.aantal_technisch}',    label: 'Aantal technische afwijkingen' },
      { v: '{kwaliteit.aantal_esthetisch}',   label: 'Aantal esthetische afwijkingen' },
      { v: '{kwaliteit.aantal_observatie}',   label: 'Aantal observaties' },
      { v: '{kwaliteit.algemene_opmerkingen}',label: 'Algemene opmerkingen' },
      { v: '{kwaliteit.disclaimer}',          label: 'Vaste toelichting' },
      { v: '{#kwaliteit.heeft_metingen}...{/kwaliteit.heeft_metingen}', label: 'Hoofdstuk Metingen' },
      { v: '{#kwaliteit.metingen}...{/kwaliteit.metingen}',   label: 'Loop over de metingen' },
      { v: '{#kwaliteit.punten}...{/kwaliteit.punten}',       label: 'Loop over de beoordeelde controlepunten' },
      { v: '{#kwaliteit.heeft_afwijkingen}...{/kwaliteit.heeft_afwijkingen}', label: 'Hoofdstuk Aandachtspunten' },
      { v: '{#kwaliteit.paginas}...{/kwaliteit.paginas}',     label: 'Loop over de pagina\'s' },
      { v: '{#regels}...{/regels}',                           label: 'Loop over de afwijkingen van een pagina' },
      { v: '{#kwaliteit.heeft_waarnemingen}...{/kwaliteit.heeft_waarnemingen}', label: 'Hoofdstuk Positieve waarnemingen' },
      { v: '{#kwaliteit.waarnemingen}...{/kwaliteit.waarnemingen}', label: 'Loop over de waarnemingen' },
      { v: '{#kwaliteit.heeft_opvolging}...{/kwaliteit.heeft_opvolging}', label: 'Hoofdstuk Opvolging' },
      { v: '{kwaliteit.opvolging_regel}',                     label: 'Samenvattende zin bij de opvolging' },
      { v: '{#kwaliteit.opvolging}...{/kwaliteit.opvolging}', label: 'Loop over de eerdere afwijkingen' },
    ],
    binnenLoop: [
      'regels', 'nummer', 'code', 'discipline', 'locatie', 'ernst', 'kritiek',
      'omschrijving', 'omschrijving_kort', 'eis', 'eis_kort', 'meting', 'status',
      'actie', 'actie_kort', 'hersteldatum', 'datum', 'foto', 'foto_na', 'heeft_foto',
      'heeft_foto_na', 'hersteld', 'onderdeel', 'meetmiddel', 'resultaat', 'voldoet',
      'afwijkend', 'niet_beoordeeld', 'opmerking', 'vraag', 'bron', 'foto_klein',
      'hercontrole', 'pagina_nummer', 'aantal_paginas', 'eerste', 'laatste',
      'niet_laatste', 'paginabreuk',
    ],
  },
  {
    groep: 'Eigen invoervelden',
    uitleg: 'Velden die je onderaan bij "Invoervelden" toevoegt. Ze worden gevraagd bij het opstellen.',
    items: [
      { v: '{invoer.<sleutel>}', label: 'Waarde van een eigen invoerveld' },
    ],
  },
]

/** Alle bekende variabele-sleutels, plat — voor de "onbekende variabele"-check. */
export function bekendeVariabelen(): Set<string> {
  const set = new Set<string>()
  for (const groep of DOCUMENT_VARIABELEN) {
    for (const item of groep.items) {
      // '{klant.naam}' -> 'klant.naam'; loops/condities en placeholders overslaan.
      // Ook de raw-vorm '{@paginabreuk}' telt mee.
      const m = item.v.match(/^\{[%@]?([a-z0-9_.]+)\}$/i)
      if (m) set.add(m[1])
      // Loop- en conditie-openers: '{#houtrot.paginas}…' -> 'houtrot.paginas'.
      const lus = item.v.match(/^\{#([a-z0-9_.]+)\}/i)
      if (lus) set.add(lus[1])
    }
    for (const naam of groep.binnenLoop ?? []) set.add(naam)
    for (const naam of groep.extraNamen ?? []) set.add(naam)
  }
  return set
}
