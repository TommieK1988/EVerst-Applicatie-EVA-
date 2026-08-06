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
      { v: '{bestelling.betaalafspraak}',label: 'Betaalafspraak' },
      { v: '{bestelling.offertenummer}', label: 'Offertekenmerk van de leverancier ("uw offertenummer")' },
      { v: '{bestelling.totaal}',        label: 'Ordertotaal excl. btw' },
      { v: '{bestelling.aantal_regels}', label: 'Aantal regels' },
      { v: '{bestelling.bonnummer}',     label: 'Leverbonnummer uit Bouw7' },
      { v: '{#bestelling.regels}…{/bestelling.regels}', label: 'Regeltabel; binnenin: {nummer} {omschrijving} {aantal} {eenheid} {stukprijs} {bedrag} {code}' },
      { v: '{#bestelling.termijnen}…{/bestelling.termijnen}', label: 'Termijnschema (20/20/rato/10); binnenin: {omschrijving} {percentage} {bedrag}' },
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
      { v: '{planning.startdatum}',    label: 'Startdatum (14 juli 2026)' },
      { v: '{planning.einddatum}',     label: 'Einddatum' },
      { v: '{planning.werkzaamheden}', label: 'Werkzaamheden (invoerveld "werkzaamheden")' },
      { v: '{#planning.heeft}…{/planning.heeft}', label: 'Alleen tonen als er datums bekend zijn' },
    ],
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
  }
  return set
}
