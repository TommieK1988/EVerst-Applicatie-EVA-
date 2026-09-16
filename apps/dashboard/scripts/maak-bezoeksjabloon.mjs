/**
 * Bouwt `docs/document-sjablonen/Bezoekrapport.docx` — het startsjabloon voor ÉÉN
 * rapportage over wat er op locatie is vastgelegd.
 *
 * Het idee: er is geen apart opleverrapport en kwaliteitsrapport. Er is één document waarin
 * elk hoofdstuk achter een `{#bezoek.heeft_…}`-conditie staat. Een oplevering kent geen
 * disciplines, dus verdwijnt "Per onderdeel"; een kwaliteitsronde wordt niet ondertekend, dus
 * verdwijnt de ondertekening. De klant ziet daardoor altijd hetzelfde document, met andere
 * hoofdstukken erin.
 *
 * DRIE BRONNEN, niet vijf: projectbezoek, kwaliteitsronde en oplevering. Een VCA-formulier en
 * een gewoon formulier zijn er in september 2026 uit gehaald — die houden hun eigen formulier
 * en hun eigen rapportage, en horen nooit in het bezoekrapport terug te komen.
 *
 * De container-onderdelen (Content_Types, rels, styles) komen uit het bestaande
 * `Houtrot-rapportage.docx`: die zijn bewezen door Word te worden geaccepteerd. Alleen
 * `word/document.xml` wordt vervangen.
 *
 * Draaien:  node apps/dashboard/scripts/maak-bezoeksjabloon.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import {
  GRIJS, ARCERING, p, tag, spatie, paginabreuk, rij, tabel, kop, cet, hoofdstuk, documentXml,
} from './lib/docx-bouwstenen.mjs'

const require = createRequire(import.meta.url)
const PizZip = require('pizzip')

const hier = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(hier, '../../..')
const sjabloonMap = path.join(repo, 'docs/document-sjablonen')
// Container (Content_Types, rels, styles) uit een bestaand sjabloon: die zijn bewezen door
// Word te worden geaccepteerd. Het houtrotsjabloon is ooit gesplitst in een variant met en
// zonder prijzen, waardoor de oude naam verdween en dit script niet meer draaide; vandaar de
// lijst met kandidaten in plaats van één hardgecodeerde naam.
const KANDIDATEN = [
  'Houtrot-rapportage.docx',
  'Houtrot-rapportage-met-prijzen.docx',
  'Houtrot-rapportage-zonder-prijzen.docx',
  'Kwaliteitscontrole.docx',
]
const bron = (() => {
  for (const naam of KANDIDATEN) {
    const kandidaat = path.join(sjabloonMap, naam)
    if (fs.existsSync(kandidaat)) return kandidaat
  }
  throw new Error(`Geen bronsjabloon gevonden in ${sjabloonMap}; gezocht naar ${KANDIDATEN.join(', ')}`)
})()
const doel = path.join(sjabloonMap, 'Bezoekrapport.docx')

const delen = []

// -- 1. Voorblad ------------------------------------------------------------
// De titel is de soort van het bezoek. Dat is de enige plek waar het document laat
// zien wat er gecontroleerd is; de rest van de opbouw is voor alle vier gelijk.
delen.push(p('{%logo}', { na: 240 }))
delen.push(p('{bezoek.soort_label}', { grootte: 48, vet: true, na: 40 }))
delen.push(p('{dossier.titel}', { grootte: 26, kleur: GRIJS, na: 280 }))

delen.push(tabel([
  rij([
    { inhoud: kop('PROJECTNUMMER') + cet('{dossier.dossiernummer}'), breedte: 3020 },
    { inhoud: kop('OPDRACHTGEVER') + cet('{klant.naam}'), breedte: 3020 },
    { inhoud: kop('KENMERK') + cet('{bezoek.kenmerk}'), breedte: 3020 },
  ]),
  rij([
    { inhoud: kop('DATUM') + cet('{bezoek.datum} {bezoek.tijd}'), breedte: 3020 },
    { inhoud: kop('UITGEVOERD DOOR') + cet('{bezoek.uitvoerder}'), breedte: 3020 },
    { inhoud: kop('OMSTANDIGHEDEN') + cet('{bezoek.omstandigheden}'), breedte: 3020 },
  ]),
  rij([
    { inhoud: kop('ADRES') + cet('{dossier.werkadres}'), breedte: 3020 },
    { inhoud: kop('BEKEKEN GEBIED') + cet('{bezoek.locatie}'), breedte: 3020 },
    { inhoud: kop('PROJECTLEIDER') + cet('{projectleider.naam}'), breedte: 3020 },
  ]),
], { randen: false }))

delen.push(spatie(280))

// -- 2. Inleiding -----------------------------------------------------------
delen.push(hoofdstuk('Inleiding'))
delen.push(p('{bezoek.inleiding}', { na: 160 }))
delen.push(p('Uitgevoerde werkzaamheden: {bezoek.werkzaamheden}', { kleur: GRIJS, na: 60 }))
// Bij een projectbezoek het eerste dat een opdrachtgever wil weten. De andere vier bronnen
// vullen `disciplines_regel` niet, dus dan verdwijnt de hele regel.
delen.push(tag('{#bezoek.heeft_disciplines}'))
delen.push(p('Uitgevoerde disciplines: {bezoek.disciplines_regel}', { kleur: GRIJS, na: 200 }))
delen.push(tag('{/bezoek.heeft_disciplines}'))
delen.push(tag('{^bezoek.heeft_disciplines}'))
delen.push(spatie(140))
delen.push(tag('{/bezoek.heeft_disciplines}'))

// -- 3. Samenvatting --------------------------------------------------------
// De kengetallen zijn een rij-loop en geen vaste kolommenstrook: elke bron levert
// andere getallen, en een vaste strook zou bij een oplevering half leeg staan.
// Bewust absolute aantallen — een steekproef rechtvaardigt geen percentage.
delen.push(hoofdstuk('Samenvatting'))
delen.push(p('{bezoek.samenvatting_regel}', { na: 140 }))

delen.push(tag('{#bezoek.heeft_kengetallen}'))
delen.push(tabel([
  rij([
    { inhoud: tag('{#bezoek.kengetallen}') + cet('{label}'), breedte: 6660 },
    { inhoud: cet('{waarde}', { grootte: 24, vet: true }) + tag('{/bezoek.kengetallen}'), breedte: 2400 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_kengetallen}'))

// -- 3b. Voortgang per discipline -------------------------------------------
// Vooraan en als eigen tabel, niet als grijze regel bij elke disciplinekop verderop: dit is
// wat een opdrachtgever het eerst wil weten. Een discipline zonder opgegeven percentage toont
// een streepje - "niet beoordeeld" is iets anders dan "0 % gereed".
//
// Alleen een projectbezoek vult `disciplines`; bij de andere bronnen verdwijnt het hoofdstuk.
delen.push(tag('{#bezoek.heeft_disciplines}'))
delen.push(hoofdstuk('Voortgang', { voor: 240 }))
delen.push(tabel([
  rij([
    { inhoud: kop('DISCIPLINE'), breedte: 6460, achtergrond: ARCERING },
    { inhoud: kop('GEREED'), breedte: 2600, achtergrond: ARCERING },
  ]),
  rij([
    { inhoud: tag('{#bezoek.disciplines}') + cet('{discipline_naam}'), breedte: 6460 },
    { inhoud: cet('{voortgang_label}') + tag('{/bezoek.disciplines}'), breedte: 2600 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_disciplines}'))

// -- 4. Bevindingen ---------------------------------------------------------
// Het hart van elk bezoekrapport: het aandachtspunt, de afwijking, het veiligheidspunt.
// Per pagina een blok, met een breuk zolang het niet de laatste is. Vaste rijhoogte +
// cantSplit houden een bevinding bij elkaar.
delen.push(tag('{#bezoek.heeft_bevindingen}'))
delen.push(hoofdstuk('Bevindingen', { breekVoor: true }))
delen.push(tag('{#bezoek.paginas}'))
delen.push(tag('{#bevindingen}'))
delen.push(tabel([
  rij([
    {
      inhoud: p('{nummer}   {ernst_label}', { grootte: 17, vet: true, kleur: GRIJS, na: 30 })
        + cet('{titel}', { vet: true, na: 30 })
        + cet('{omschrijving_kort}', { na: 40 })
        + p('Locatie: {locatie}   ·   Onderdeel: {groep}', { grootte: 16, kleur: GRIJS, na: 30 })
        + p('Eis: {eis_kort}   ·   Gemeten: {meting}', { grootte: 16, kleur: GRIJS, na: 30 })
        + p('Status: {status_label}   ·   Gewenst hersteld: {hersteldatum}',
            { grootte: 16, kleur: GRIJS, na: 30 })
        + p('Vervolgactie: {actie_kort}', { grootte: 16, na: 0 }),
      breedte: 5860,
    },
    {
      // Voor- en na-foto onder elkaar. Elke {%…} staat alleen in zijn eigen alinea —
      // anders weigert de image-module ("raw_xml_tag_should_be_only_text_in_paragraph").
      inhoud: p('{%bevinding_foto}', { na: 40 })
        + tag('{#heeft_foto_na}')
        + p('{%bevinding_foto_na}', { na: 20 })
        + p('na herstel', { grootte: 15, kleur: GRIJS, na: 0 })
        + tag('{/heeft_foto_na}'),
      breedte: 3200,
    },
  ], { nietSplitsen: true }),
]))
delen.push(spatie(160))
delen.push(tag('{/bevindingen}'))
delen.push(tag('{#niet_laatste}'))
delen.push(paginabreuk)
delen.push(tag('{/niet_laatste}'))
delen.push(tag('{/bezoek.paginas}'))
delen.push(tag('{/bezoek.heeft_bevindingen}'))

// -- 4b. Per onderdeel (alleen een projectbezoek vult dit) ------------------
// Het verslag van het bezoek: wat is er per discipline gezien, en hoe ver staat het. Waar
// "Bevindingen" het actielijstje is (alleen de aandachtspunten, met opvolging), is dit het
// volledige beeld.
//
// De loop heet `disciplinepunten` en niet `punten`, en de naam `discipline_naam` en niet
// `naam`: de dotted parser lost een tag op in de BINNENSTE passende scope, en het blok heeft
// zelf al een `punten` (de kwaliteitschecklist) en een `naam` (de handtekeningen). Zou je die
// namen hier hergebruiken, dan pakt het sjabloon stil het verkeerde blok - geen foutmelding,
// alleen een rapport dat onzin herhaalt. Zie de noot onderaan bezoek/contract.ts.
delen.push(tag('{#bezoek.heeft_disciplines}'))
delen.push(hoofdstuk('Per onderdeel', { breekVoor: true }))
delen.push(p('{bezoek.disciplines_regel}', { grootte: 17, kleur: GRIJS, na: 160 }))

delen.push(tag('{#bezoek.disciplines}'))
delen.push(p('{discipline_naam}', { grootte: 22, vet: true, na: 100, streepOnder: true }))

delen.push(tag('{#heeft_disciplinepunten}'))
delen.push(tabel([
  rij([
    {
      inhoud: tag('{#disciplinepunten}')
        + p('{nummer}', { grootte: 16, vet: true, kleur: GRIJS, na: 30 })
        + cet('{tekst_kort}', { na: 30 })
        + tag('{#is_aandachtspunt}')
        + p('Aandachtspunt {aandachtspunt_nummer} - {status_label}',
            { grootte: 16, kleur: GRIJS, na: 0 })
        + tag('{/is_aandachtspunt}'),
      breedte: 5860,
    },
    {
      // Eigen tagnaam: de image-module kiest zijn max-kader op TAGNAAM, dus dit hoofdstuk
      // mag {%bevinding_foto} niet lenen - dat kader is voor een bewijsfoto.
      inhoud: p('{%disciplinefoto}', { na: 0 }) + tag('{/disciplinepunten}'),
      breedte: 3200,
    },
  ], { nietSplitsen: true }),
], { randen: false }))
delen.push(tag('{/heeft_disciplinepunten}'))

delen.push(tag('{^heeft_disciplinepunten}'))
delen.push(p('Geen bijzonderheden.', { grootte: 17, kleur: GRIJS, na: 120 }))
delen.push(tag('{/heeft_disciplinepunten}'))

delen.push(spatie(160))
delen.push(tag('{/bezoek.disciplines}'))
delen.push(spatie(120))
delen.push(tag('{/bezoek.heeft_disciplines}'))

// -- 5 en 6 (Metingen, Wat er is beoordeeld) ZIJN BEWUST WEG ----------------
// Beide hoorden bij de kwaliteitsronde: laagdiktemetingen en de afgevinkte controlepunten uit
// de bibliotheek. Die module is in september 2026 geparkeerd - het projectbezoek is de
// hoofdstroom geworden - en dan zijn twee hoofdstukken die er nooit meer in komen alleen maar
// ruis in het sjabloon.
//
// PRIJS DIE HIERVOOR IS BETAALD, bewust, op verzoek van Tom: `bezoek.punten` werd óók door
// `uit-formulier.ts` gevuld. Een rapport van een KAM/VGM-formulierinzending toont daardoor
// zijn vragen-en-antwoordenlijst niet meer. De adapters vullen de velden nog wel, dus wie het
// terug wil hoeft alleen de tags in zijn eigen sjabloonvariant te zetten:
//   {#bezoek.heeft_punten} ... {#bezoek.punten}{groep}{onderdeel}{resultaat}{opmerking}{/...}
// Ze staan nog in de variabelencatalogus, zodat "Template controleren" ze blijft herkennen.

// -- 7. Positieve waarnemingen ----------------------------------------------
// Een rapport mag niet uitsluitend fouten tonen.
delen.push(tag('{#bezoek.heeft_waarnemingen}'))
delen.push(hoofdstuk('Wat er goed ging', { voor: 200 }))
delen.push(p('Wat er tijdens dit bezoek goed is uitgevoerd.', { grootte: 17, kleur: GRIJS, na: 140 }))
delen.push(tabel([
  rij([
    { inhoud: tag('{#bezoek.waarnemingen}') + p('{%waarneming_foto}', { na: 0 }), breedte: 2400 },
    {
      inhoud: cet('{omschrijving}', { vet: true })
        + p('{groep} · {locatie}', { grootte: 17, kleur: GRIJS, na: 0 })
        + tag('{/bezoek.waarnemingen}'),
      breedte: 6660, verticaal: 'center',
    },
  ], { nietSplitsen: true }),
], { randen: false }))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_waarnemingen}'))

// -- 8. Opvolging eerdere bezoeken ------------------------------------------
delen.push(tag('{#bezoek.heeft_opvolging}'))
delen.push(hoofdstuk('Opvolging van eerdere bezoeken', { breekVoor: true }))
delen.push(p('{bezoek.opvolging_regel}', { na: 140 }))
delen.push(tabel([
  rij([
    { inhoud: kop('NUMMER'), breedte: 1400, achtergrond: ARCERING },
    { inhoud: kop('OMSCHRIJVING'), breedte: 3660, achtergrond: ARCERING },
    { inhoud: kop('LOCATIE'), breedte: 1600, achtergrond: ARCERING },
    { inhoud: kop('STATUS'), breedte: 1600, achtergrond: ARCERING },
    { inhoud: kop('HERCONTROLE'), breedte: 800, achtergrond: ARCERING },
  ]),
  rij([
    { inhoud: tag('{#bezoek.opvolging}') + cet('{nummer}'), breedte: 1400 },
    { inhoud: cet('{omschrijving}'), breedte: 3660 },
    { inhoud: cet('{locatie}'), breedte: 1600 },
    { inhoud: cet('{status_label}'), breedte: 1600 },
    { inhoud: cet('{hercontrole}') + tag('{/bezoek.opvolging}'), breedte: 800 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_opvolging}'))

// -- 9. Ondertekening -------------------------------------------------------
// Alleen een oplevering en een veiligheidsronde worden getekend. Zonder beeld staat
// er "digitaal akkoord": een akkoord op afstand heeft geen handtekeningpad.
delen.push(tag('{#bezoek.heeft_handtekeningen}'))
delen.push(hoofdstuk('Ondertekening', { voor: 240 }))
delen.push(tabel([
  rij([
    {
      inhoud: tag('{#bezoek.handtekeningen}')
        + kop('{rol_label}')
        + cet('{naam}', { vet: true, na: 20 })
        + p('{datum}', { grootte: 16, kleur: GRIJS, na: 0 }),
      breedte: 4530, verticaal: 'center',
    },
    {
      inhoud: tag('{#heeft_beeld}') + p('{%beeld}', { na: 0 }) + tag('{/heeft_beeld}')
        + tag('{^heeft_beeld}')
        + p('digitaal akkoord', { grootte: 17, kleur: GRIJS, na: 0 })
        + tag('{/heeft_beeld}')
        + tag('{/bezoek.handtekeningen}'),
      breedte: 4530, verticaal: 'center',
    },
  ], { nietSplitsen: true }),
], { randen: false }))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_handtekeningen}'))

// -- 10. Slot ---------------------------------------------------------------
delen.push(hoofdstuk('Algemene opmerkingen', { voor: 240 }))
delen.push(p('{bezoek.opmerkingen}', { na: 200 }))

delen.push(p('Toelichting bij dit rapport', { grootte: 22, vet: true, na: 100, streepOnder: true }))
delen.push(p('{bezoek.disclaimer}', { grootte: 17, kleur: GRIJS, na: 120 }))
delen.push(p('{bedrijf.naam} · {document.datum}', { grootte: 16, kleur: GRIJS, na: 0 }))

// -- Schrijven --------------------------------------------------------------
const xml = documentXml(delen)
const zip = new PizZip(fs.readFileSync(bron))
zip.file('word/document.xml', xml)
fs.writeFileSync(doel, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))

const tags = [...new Set([...xml.matchAll(/\{[^}]{1,60}\}/g)].map(m => m[0]))]
console.log(`Geschreven: ${path.relative(repo, doel)} (${fs.statSync(doel).size} bytes)`)
console.log(`${tags.length} unieke tags:`)
console.log(tags.join('\n'))
