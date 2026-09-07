/**
 * Bouwt `docs/document-sjablonen/Bezoekrapport.docx` — het startsjabloon voor ÉÉN
 * rapportage over een projectbezoek, ongeacht wat er gecontroleerd is.
 *
 * Het idee: er is geen apart opleverrapport, kwaliteitsrapport, veiligheidsrapport of
 * formulierrapport. Er is één document waarin elk hoofdstuk achter een
 * `{#bezoek.heeft_…}`-conditie staat. Een oplevering kent geen metingen, dus verdwijnt
 * dat hoofdstuk; een kwaliteitsronde wordt niet ondertekend, dus verdwijnt de
 * ondertekening. De klant ziet daardoor altijd hetzelfde document, met andere
 * hoofdstukken erin.
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
const bron = path.join(sjabloonMap, 'Houtrot-rapportage.docx')
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
delen.push(p('Uitgevoerde werkzaamheden: {bezoek.werkzaamheden}', { kleur: GRIJS, na: 200 }))

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

// -- 5. Metingen (alleen als er gemeten is) ---------------------------------
delen.push(tag('{#bezoek.heeft_metingen}'))
delen.push(hoofdstuk('Metingen', { breekVoor: true }))
delen.push(tabel([
  rij([
    { inhoud: kop('ONDERDEEL'), breedte: 3200, achtergrond: ARCERING },
    { inhoud: kop('LOCATIE'), breedte: 2000, achtergrond: ARCERING },
    { inhoud: kop('METING'), breedte: 1300, achtergrond: ARCERING },
    { inhoud: kop('EIS'), breedte: 1500, achtergrond: ARCERING },
    { inhoud: kop('RESULTAAT'), breedte: 1060, achtergrond: ARCERING },
  ]),
  rij([
    { inhoud: tag('{#bezoek.metingen}') + cet('{code}  {onderdeel}'), breedte: 3200 },
    { inhoud: cet('{locatie}'), breedte: 2000 },
    { inhoud: cet('{meting}'), breedte: 1300 },
    { inhoud: cet('{eis}'), breedte: 1500 },
    { inhoud: cet('{resultaat}') + tag('{/bezoek.metingen}'), breedte: 1060 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_metingen}'))

// -- 6. Beoordeelde punten / checklist --------------------------------------
// Een kwaliteitsronde levert controlepunten, een formulier levert antwoorden. Zelfde
// tabel: wat is bekeken en wat kwam eruit.
delen.push(tag('{#bezoek.heeft_punten}'))
delen.push(hoofdstuk('Wat er is beoordeeld', { breekVoor: true }))
delen.push(tabel([
  rij([
    { inhoud: kop('ONDERDEEL'), breedte: 2200, achtergrond: ARCERING },
    { inhoud: kop('OMSCHRIJVING'), breedte: 3660, achtergrond: ARCERING },
    { inhoud: kop('RESULTAAT'), breedte: 1600, achtergrond: ARCERING },
    { inhoud: kop('OPMERKING'), breedte: 1600, achtergrond: ARCERING },
  ]),
  rij([
    { inhoud: tag('{#bezoek.punten}') + cet('{groep}'), breedte: 2200 },
    { inhoud: cet('{onderdeel}'), breedte: 3660 },
    { inhoud: cet('{resultaat}'), breedte: 1600 },
    { inhoud: cet('{opmerking}') + tag('{/bezoek.punten}'), breedte: 1600 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/bezoek.heeft_punten}'))

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
