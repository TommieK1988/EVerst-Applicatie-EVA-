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
      const m = item.v.match(/^\{%?([a-z0-9_.]+)\}$/i)
      if (m) set.add(m[1])
    }
  }
  return set
}
