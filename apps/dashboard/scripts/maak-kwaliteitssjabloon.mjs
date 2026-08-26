/**
 * Bouwt `docs/document-sjablonen/Kwaliteitscontrole.docx` — het startsjabloon voor het
 * kwaliteitscontrole-rapport.
 *
 * Waarom een script en niet een handgemaakt Word-bestand: de docxtemplater-tags moeten
 * gegarandeerd compleet in één run staan, en Word knipt ze bij het bewerken graag op. Door het
 * bestand te genereren staat elke tag er gegarandeerd goed in, en is het opnieuw te maken zodra de
 * variabelen wijzigen. (`fixSplitDocxTags` in render-docx repareert opgeknipte tags achteraf, maar
 * beter is ze niet stuk te maken.)
 *
 * De container-onderdelen (Content_Types, rels, styles) komen uit het bestaande
 * `Houtrot-rapportage.docx`: die zijn bewezen door Word te worden geaccepteerd. Alleen
 * `word/document.xml` wordt vervangen.
 *
 * Draaien:  node apps/dashboard/scripts/maak-kwaliteitssjabloon.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const PizZip = require('pizzip')

const hier = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(hier, '../../..')
const sjabloonMap = path.join(repo, 'docs/document-sjablonen')
const bron = path.join(sjabloonMap, 'Houtrot-rapportage.docx')
const doel = path.join(sjabloonMap, 'Kwaliteitscontrole.docx')

// ── XML-bouwstenen ─────────────────────────────────────────────────────────
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const GRIJS = '5B6770'
const DONKER = '1F2933'
const RAND = 'D9DEE3'

/** Alinea. `opt`: {grootte, vet, kleur, na, voor, breekVoor, streepOnder, uitlijning} */
function p(tekst, opt = {}) {
  const {
    grootte = 20, vet = false, kleur = DONKER, na = 60, voor = 0,
    breekVoor = false, streepOnder = false, uitlijning = null,
  } = opt
  const pPr =
    '<w:pPr>'
    + (breekVoor ? '<w:pageBreakBefore/>' : '')
    + (uitlijning ? `<w:jc w:val="${uitlijning}"/>` : '')
    + `<w:spacing w:before="${voor}" w:after="${na}" w:line="240" w:lineRule="auto"/>`
    + (streepOnder ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="${RAND}"/></w:pBdr>` : '')
    + '</w:pPr>'
  const rPr = `<w:rPr>${vet ? '<w:b/>' : ''}<w:color w:val="${kleur}"/><w:sz w:val="${grootte}"/><w:szCs w:val="${grootte}"/></w:rPr>`
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${esc(tekst)}</w:t></w:r></w:p>`
}

/** Kale alinea met alleen een tag erin — voor {#loops} en {/loops}. */
const tag = t => p(t, { grootte: 18, kleur: GRIJS, na: 40 })

/** Lege alinea met exacte hoogte; houdt de bloklengte voorspelbaar. */
const spatie = (hoogte = 120) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${hoogte}" w:lineRule="exact"/></w:pPr></w:p>`

const paginabreuk = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

function cel(inhoud, breedte, opt = {}) {
  const { achtergrond = null, verticaal = 'top' } = opt
  return '<w:tc><w:tcPr>'
    + `<w:tcW w:w="${breedte}" w:type="dxa"/>`
    + `<w:vAlign w:val="${verticaal}"/>`
    + (achtergrond ? `<w:shd w:val="clear" w:color="auto" w:fill="${achtergrond}"/>` : '')
    + '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>'
    + '<w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
    + '</w:tcPr>' + inhoud + '</w:tc>'
}

/** Tabelrij. `cellen` = [{inhoud, breedte, achtergrond}] */
function rij(cellen, opt = {}) {
  const { hoogte = null, nietSplitsen = false } = opt
  const trPr = (hoogte ? `<w:trHeight w:hRule="exact" w:val="${hoogte}"/>` : '')
    + (nietSplitsen ? '<w:cantSplit/>' : '')
  return '<w:tr>' + (trPr ? `<w:trPr>${trPr}</w:trPr>` : '')
    + cellen.map(c => cel(c.inhoud, c.breedte, c)).join('') + '</w:tr>'
}

function tabel(rijen, opt = {}) {
  const { randen = true, breedte = 9060 } = opt
  const rand = kant =>
    `<w:${kant} w:val="${randen ? 'single' : 'none'}" w:sz="4" w:space="0" w:color="${RAND}"/>`
  return '<w:tbl><w:tblPr>'
    + `<w:tblW w:w="${breedte}" w:type="dxa"/>`
    + '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(rand).join('') + '</w:tblBorders>'
    + '<w:tblLayout w:type="fixed"/>'
    + '</w:tblPr>' + rijen.join('') + '</w:tbl>'
}

/** Klein grijs kopje in een tabelcel. */
const kop = t => p(t, { grootte: 15, vet: true, kleur: GRIJS, na: 20 })
/** Gewone celtekst. */
const cet = (t, opt = {}) => p(t, { grootte: 18, na: 0, ...opt })

// ── Documentinhoud ─────────────────────────────────────────────────────────
const delen = []

// 1. Voorblad
delen.push(p('{%logo}', { na: 240 }))
delen.push(p('Periodieke kwaliteitscontrole', { grootte: 48, vet: true, na: 40 }))
delen.push(p('{dossier.titel}', { grootte: 26, kleur: GRIJS, na: 280 }))

delen.push(tabel([
  rij([
    { inhoud: kop('PROJECTNUMMER') + cet('{dossier.dossiernummer}'), breedte: 3020 },
    { inhoud: kop('OPDRACHTGEVER') + cet('{klant.naam}'), breedte: 3020 },
    { inhoud: kop('INSPECTIENUMMER') + cet('{kwaliteit.inspectienummer}'), breedte: 3020 },
  ]),
  rij([
    { inhoud: kop('INSPECTIEDATUM') + cet('{kwaliteit.datum} {kwaliteit.tijd}'), breedte: 3020 },
    { inhoud: kop('INSPECTEUR') + cet('{kwaliteit.inspecteur}'), breedte: 3020 },
    { inhoud: kop('WEER') + cet('{kwaliteit.weer}'), breedte: 3020 },
  ]),
  rij([
    { inhoud: kop('ADRES') + cet('{dossier.werkadres}'), breedte: 3020 },
    { inhoud: kop('GELOPEN GEBIED') + cet('{kwaliteit.gebied}'), breedte: 3020 },
    { inhoud: kop('PROJECTLEIDER') + cet('{projectleider.naam}'), breedte: 3020 },
  ]),
], { randen: false }))

delen.push(spatie(280))

// 2. Inleiding
delen.push(p('Inleiding', { grootte: 28, vet: true, na: 120, streepOnder: true }))
delen.push(p(
  'Tijdens deze periodieke kwaliteitscontrole zijn de op het inspectiemoment zichtbare, '
  + 'bereikbare en beoordeelbare werkzaamheden steekproefsgewijs gecontroleerd op technische '
  + 'uitvoering, duurzaamheid en esthetische eindkwaliteit. Eventuele aandachtspunten worden '
  + 'geregistreerd en opgevolgd binnen het project.',
  { na: 160 },
))
delen.push(p('Aanwezige werkzaamheden: {kwaliteit.werkzaamheden}', { kleur: GRIJS, na: 60 }))
delen.push(p('Gecontroleerde disciplines: {kwaliteit.disciplines}', { kleur: GRIJS, na: 200 }))

// 3. Samenvatting
delen.push(p('Samenvatting', { grootte: 28, vet: true, na: 120, streepOnder: true }))
delen.push(p('{kwaliteit.samenvatting_regel}', { na: 140 }))
delen.push(tabel([
  rij([
    { inhoud: kop('BEOORDEELD') + cet('{kwaliteit.totaal_beoordeeld}', { grootte: 26, vet: true }), breedte: 1812 },
    { inhoud: kop('VOLDOEN') + cet('{kwaliteit.totaal_voldoet}', { grootte: 26, vet: true }), breedte: 1812 },
    { inhoud: kop('TECHNISCH') + cet('{kwaliteit.aantal_technisch}', { grootte: 26, vet: true }), breedte: 1812 },
    { inhoud: kop('ESTHETISCH') + cet('{kwaliteit.aantal_esthetisch}', { grootte: 26, vet: true }), breedte: 1812 },
    { inhoud: kop('KRITIEK') + cet('{kwaliteit.aantal_kritiek}', { grootte: 26, vet: true }), breedte: 1812 },
  ]),
]))
delen.push(p('Niet beoordeeld: {kwaliteit.totaal_niet_beoordeeld}   ·   Nader onderzoek: {kwaliteit.totaal_nader_onderzoek}   ·   Niet van toepassing: {kwaliteit.totaal_nvt}',
  { grootte: 17, kleur: GRIJS, voor: 80, na: 60 }))
delen.push(p('{kwaliteit.steekproef}', { grootte: 17, kleur: GRIJS, na: 200 }))

// 4. Technische metingen (alleen als er is gemeten)
delen.push(tag('{#kwaliteit.heeft_metingen}'))
delen.push(p('Technische metingen', { grootte: 28, vet: true, na: 120, streepOnder: true }))
delen.push(tabel([
  rij([
    { inhoud: kop('ONDERDEEL'), breedte: 3200, achtergrond: 'F4F6F7' },
    { inhoud: kop('LOCATIE'), breedte: 2000, achtergrond: 'F4F6F7' },
    { inhoud: kop('METING'), breedte: 1300, achtergrond: 'F4F6F7' },
    { inhoud: kop('EIS'), breedte: 1500, achtergrond: 'F4F6F7' },
    { inhoud: kop('RESULTAAT'), breedte: 1060, achtergrond: 'F4F6F7' },
  ]),
  rij([
    { inhoud: tag('{#kwaliteit.metingen}') + cet('{code}  {onderdeel}'), breedte: 3200 },
    { inhoud: cet('{locatie}'), breedte: 2000 },
    { inhoud: cet('{meting}'), breedte: 1300 },
    { inhoud: cet('{eis}'), breedte: 1500 },
    { inhoud: cet('{resultaat}') + tag('{/kwaliteit.metingen}'), breedte: 1060 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/kwaliteit.heeft_metingen}'))

// 5. Positieve kwaliteitswaarnemingen
delen.push(tag('{#kwaliteit.heeft_waarnemingen}'))
delen.push(p('Positieve kwaliteitswaarnemingen', { grootte: 28, vet: true, voor: 200, na: 120, streepOnder: true }))
delen.push(p('Wat er tijdens deze ronde goed is uitgevoerd.', { grootte: 17, kleur: GRIJS, na: 140 }))
delen.push(tabel([
  rij([
    { inhoud: tag('{#kwaliteit.waarnemingen}') + p('{%foto_klein}', { na: 0 }), breedte: 2400 },
    {
      inhoud: cet('{omschrijving}', { vet: true })
        + p('{discipline} · {locatie}', { grootte: 17, kleur: GRIJS, na: 0 })
        + tag('{/kwaliteit.waarnemingen}'),
      breedte: 6660, verticaal: 'center',
    },
  ], { nietSplitsen: true }),
], { randen: false }))
delen.push(spatie(200))
delen.push(tag('{/kwaliteit.heeft_waarnemingen}'))

// 6. Aandachtspunten — per pagina een blok, met een breuk zolang het niet de laatste is
delen.push(tag('{#kwaliteit.heeft_afwijkingen}'))
delen.push(p('Aandachtspunten', { grootte: 28, vet: true, breekVoor: true, na: 120, streepOnder: true }))
delen.push(tag('{#kwaliteit.paginas}'))
delen.push(tag('{#regels}'))
delen.push(tabel([
  rij([
    {
      inhoud: p('{nummer}   {ernst}', { grootte: 17, vet: true, kleur: GRIJS, na: 30 })
        + cet('{omschrijving_kort}', { na: 40 })
        + p('Locatie: {locatie}   ·   Discipline: {discipline}   ·   Controlepunt: {code}',
            { grootte: 16, kleur: GRIJS, na: 30 })
        + p('Eis: {eis_kort}', { grootte: 16, kleur: GRIJS, na: 30 })
        + p('Gemeten: {meting}   ·   Status: {status}   ·   Gewenst hersteld: {hersteldatum}',
            { grootte: 16, kleur: GRIJS, na: 30 })
        + p('Vervolgactie: {actie_kort}', { grootte: 16, na: 0 }),
      breedte: 5860,
    },
    { inhoud: p('{%foto}', { na: 0 }), breedte: 3200 },
  ], { nietSplitsen: true }),
]))
delen.push(spatie(160))
delen.push(tag('{/regels}'))
delen.push(tag('{#niet_laatste}'))
delen.push(paginabreuk)
delen.push(tag('{/niet_laatste}'))
delen.push(tag('{/kwaliteit.paginas}'))
delen.push(tag('{/kwaliteit.heeft_afwijkingen}'))

// 7. Opvolging eerdere inspecties
delen.push(tag('{#kwaliteit.heeft_opvolging}'))
delen.push(p('Opvolging eerdere inspecties', { grootte: 28, vet: true, breekVoor: true, na: 120, streepOnder: true }))
delen.push(p('{kwaliteit.opvolging_regel}', { na: 140 }))
delen.push(tabel([
  rij([
    { inhoud: kop('NUMMER'), breedte: 1400, achtergrond: 'F4F6F7' },
    { inhoud: kop('OMSCHRIJVING'), breedte: 3660, achtergrond: 'F4F6F7' },
    { inhoud: kop('LOCATIE'), breedte: 1600, achtergrond: 'F4F6F7' },
    { inhoud: kop('STATUS'), breedte: 1600, achtergrond: 'F4F6F7' },
    { inhoud: kop('HERCONTROLE'), breedte: 800, achtergrond: 'F4F6F7' },
  ]),
  rij([
    { inhoud: tag('{#kwaliteit.opvolging}') + cet('{nummer}'), breedte: 1400 },
    { inhoud: cet('{omschrijving}'), breedte: 3660 },
    { inhoud: cet('{locatie}'), breedte: 1600 },
    { inhoud: cet('{status}'), breedte: 1600 },
    { inhoud: cet('{hercontrole}') + tag('{/kwaliteit.opvolging}'), breedte: 800 },
  ]),
]))
delen.push(spatie(200))
delen.push(tag('{/kwaliteit.heeft_opvolging}'))

// 8. Algemene opmerkingen + disclaimer
delen.push(p('Algemene opmerkingen', { grootte: 28, vet: true, voor: 240, na: 120, streepOnder: true }))
delen.push(p('{kwaliteit.algemene_opmerkingen}', { na: 200 }))

delen.push(p('Toelichting bij deze controle', { grootte: 22, vet: true, na: 100, streepOnder: true }))
delen.push(p('{kwaliteit.disclaimer}', { grootte: 17, kleur: GRIJS, na: 120 }))
delen.push(p('{bedrijf.naam} · {document.datum}', { grootte: 16, kleur: GRIJS, na: 0 }))

// Sectie-instellingen: A4 staand met nette marges.
const sectPr = '<w:sectPr>'
  + '<w:pgSz w:w="11906" w:h="16838"/>'
  + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
  + 'w:header="708" w:footer="708" w:gutter="0"/>'
  + '</w:sectPr>'

const documentXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
  + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
  + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
  + '<w:body>' + delen.join('') + sectPr + '</w:body></w:document>'

// ── Schrijven ──────────────────────────────────────────────────────────────
const zip = new PizZip(fs.readFileSync(bron))
zip.file('word/document.xml', documentXml)
fs.writeFileSync(doel, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))

const tags = [...new Set([...documentXml.matchAll(/\{[^}]{1,60}\}/g)].map(m => m[0]))]
console.log(`Geschreven: ${path.relative(repo, doel)} (${fs.statSync(doel).size} bytes)`)
console.log(`${tags.length} unieke tags:`)
console.log(tags.join('\n'))
