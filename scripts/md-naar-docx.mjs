/**
 * md-naar-docx.mjs — maakt een .docx van een markdown-bestand.
 *
 * Bewust zonder de `docx`-bibliotheek: die zit niet in het project en één
 * document is geen reden om een dependency toe te voegen. Een .docx is een zip
 * met XML, en `pizzip` staat er al (via docxtemplater).
 *
 * Ondersteunt wat dit document gebruikt: koppen, alinea's, opsommingen,
 * genummerde lijsten, tabellen, codeblokken, citaten en scheidingslijnen.
 * Inline: **vet**, `code`.
 *
 * Gebruik: node md-naar-docx.mjs <in.md> <uit.docx> "Titel"
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// pizzip komt via docxtemplater mee; resolve vanaf de repo-root, niet vanaf dit bestand.
const require = createRequire(new URL('../package.json', import.meta.url))
const PizZip = require('pizzip')

const [, , bronPad, doelPad, docTitel = 'Document'] = process.argv

// ── XML-hulpjes ──────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Zet inline-opmaak om in runs. Herkent **vet** en `code`. */
function runs(tekst, extra = '') {
  const delen = []
  // Splits op **...** en `...`, met de scheidingstekens in het resultaat.
  const stukken = String(tekst).split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  for (const stuk of stukken) {
    if (!stuk) continue
    let inhoud = stuk
    let props = extra
    if (stuk.startsWith('**') && stuk.endsWith('**')) {
      inhoud = stuk.slice(2, -2)
      props = extra + '<w:b/>'
    } else if (stuk.startsWith('`') && stuk.endsWith('`')) {
      inhoud = stuk.slice(1, -1)
      props = extra + '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/><w:color w:val="A3195B"/>'
    }
    delen.push(
      `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(inhoud)}</w:t></w:r>`,
    )
  }
  return delen.join('') || '<w:r><w:t xml:space="preserve"></w:t></w:r>'
}

const alinea = (tekst, stijl = null, numId = null, extraPr = '') => {
  const pr =
    (stijl ? `<w:pStyle w:val="${stijl}"/>` : '') +
    (numId ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>` : '') +
    extraPr
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ''}${runs(tekst)}</w:p>`
}

const leeg = () => '<w:p/>'

// ── Tabel ────────────────────────────────────────────────────────────────────
const BREEDTE = 9638 // A4 minus 2 cm marge aan weerszijden, in twips

function tabel(rijen) {
  const kolommen = Math.max(...rijen.map((r) => r.length))
  // Breedte naar rato van de langste cel per kolom, met een ondergrens.
  const gewicht = Array.from({ length: kolommen }, (_, i) =>
    Math.max(8, ...rijen.map((r) => (r[i] ?? '').replace(/\*\*|`/g, '').length)),
  )
  const som = gewicht.reduce((a, b) => a + b, 0)
  const breedtes = gewicht.map((g) => Math.max(900, Math.round((g / som) * BREEDTE)))
  const totaal = breedtes.reduce((a, b) => a + b, 0)
  // Terugschalen als de ondergrens de tabel te breed maakte.
  const geschaald = breedtes.map((b) => Math.round((b / totaal) * BREEDTE))

  const rand = (zijde) =>
    `<w:${zijde} w:val="single" w:sz="4" w:space="0" w:color="D4D7DD"/>`
  const randen =
    `<w:tblBorders>${rand('top')}${rand('left')}${rand('bottom')}${rand('right')}` +
    `${rand('insideH')}${rand('insideV')}</w:tblBorders>`

  const grid = geschaald.map((w) => `<w:gridCol w:w="${w}"/>`).join('')

  const trs = rijen
    .map((rij, r) => {
      const kop = r === 0
      const tcs = geschaald
        .map((w, i) => {
          const schaduw = kop ? '<w:shd w:val="clear" w:fill="EEF1F5"/>' : ''
          const p = `<w:p><w:pPr><w:pStyle w:val="Cel"/></w:pPr>${runs(rij[i] ?? '', kop ? '<w:b/>' : '')}</w:p>`
          return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${schaduw}<w:vAlign w:val="center"/></w:tcPr>${p}</w:tc>`
        })
        .join('')
      const trPr = kop ? '<w:trPr><w:tblHeader/></w:trPr>' : ''
      return `<w:tr>${trPr}${tcs}</w:tr>`
    })
    .join('')

  return (
    `<w:tbl><w:tblPr><w:tblW w:w="${BREEDTE}" w:type="dxa"/>${randen}` +
    `<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${trs}</w:tbl>`
  )
}

const splitsRij = (regel) =>
  regel
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())

// ── Parser ───────────────────────────────────────────────────────────────────
function naarBody(md) {
  const regels = md.split(/\r?\n/)
  const uit = []
  let i = 0

  while (i < regels.length) {
    const regel = regels[i]

    // Codeblok
    if (regel.trim().startsWith('```')) {
      i++
      const blok = []
      while (i < regels.length && !regels[i].trim().startsWith('```')) blok.push(regels[i++])
      i++
      for (const r of blok) {
        uit.push(
          `<w:p><w:pPr><w:pStyle w:val="Code"/></w:pPr>` +
            `<w:r><w:t xml:space="preserve">${esc(r)}</w:t></w:r></w:p>`,
        )
      }
      uit.push(leeg())
      continue
    }

    // Tabel
    if (regel.trim().startsWith('|') && (regels[i + 1] ?? '').includes('---')) {
      const rijen = [splitsRij(regel)]
      i += 2 // kop + scheidingsregel
      while (i < regels.length && regels[i].trim().startsWith('|')) rijen.push(splitsRij(regels[i++]))
      uit.push(tabel(rijen))
      uit.push(leeg()) // Word wil een alinea ná een tabel
      continue
    }

    // Scheidingslijn
    if (/^---+$/.test(regel.trim())) {
      uit.push(
        '<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="D4D7DD"/></w:pBdr></w:pPr></w:p>',
      )
      i++
      continue
    }

    // Koppen
    const kop = regel.match(/^(#{1,4})\s+(.*)$/)
    if (kop) {
      uit.push(alinea(kop[2], `Heading${kop[1].length}`))
      i++
      continue
    }

    // Citaat
    if (regel.trim().startsWith('> ')) {
      uit.push(alinea(regel.trim().slice(2), 'Citaat'))
      i++
      continue
    }

    // Opsomming
    const bullet = regel.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      uit.push(alinea(bullet[1], 'Lijst', 1))
      i++
      continue
    }

    // Genummerd
    const nummer = regel.match(/^\d+\.\s+(.*)$/)
    if (nummer) {
      uit.push(alinea(nummer[1], 'Lijst', 2))
      i++
      continue
    }

    // Lege regel
    if (!regel.trim()) {
      i++
      continue
    }

    // Gewone alinea: plak doorlopende regels aan elkaar
    const stukken = [regel.trim()]
    i++
    while (
      i < regels.length &&
      regels[i].trim() &&
      !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s|\||```|---+$)/.test(regels[i].trim())
    ) {
      stukken.push(regels[i++].trim())
    }
    uit.push(alinea(stukken.join(' ')))
  }

  return uit.join('')
}

// ── Vaste onderdelen van het bestand ─────────────────────────────────────────
const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`

const stijl = (id, naam, opts) => {
  const { size = 22, bold = false, color = '1F2430', voor = 0, na = 120, font = null, kleurRegel = '', extra = '' } = opts
  return (
    `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${naam}"/><w:basedOn w:val="Normal"/>` +
    `<w:pPr><w:spacing w:before="${voor}" w:after="${na}" w:line="264" w:lineRule="auto"/>${extra}</w:pPr>` +
    `<w:rPr>${font ? `<w:rFonts w:ascii="${font}" w:hAnsi="${font}"/>` : ''}${bold ? '<w:b/>' : ''}` +
    `<w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr>${kleurRegel}</w:style>`
  )
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/>
<w:color w:val="1F2430"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
${stijl('Heading1', 'heading 1', { size: 40, bold: true, color: '13315C', voor: 0, na: 240 })}
${stijl('Heading2', 'heading 2', { size: 28, bold: true, color: '13315C', voor: 360, na: 140 })}
${stijl('Heading3', 'heading 3', { size: 23, bold: true, color: '2B4A7D', voor: 240, na: 100 })}
${stijl('Heading4', 'heading 4', { size: 22, bold: true, color: '2B4A7D', voor: 180, na: 80 })}
${stijl('Lijst', 'Lijst', { na: 60, extra: '<w:ind w:left="360" w:hanging="360"/>' })}
${stijl('Cel', 'Cel', { size: 19, na: 40 })}
${stijl('Code', 'Code', { size: 18, font: 'Consolas', na: 0, color: '33415C', extra: '<w:shd w:val="clear" w:fill="F4F6F9"/><w:ind w:left="170" w:right="170"/>' })}
${stijl('Citaat', 'Citaat', { size: 22, color: '33415C', voor: 80, na: 160, extra: '<w:ind w:left="340"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="2B4A7D"/></w:pBdr>' })}
</w:styles>`

const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="&#8226;"/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>
<w:rPr><w:rFonts w:ascii="Symbol" w:hAnsi="Symbol" w:hint="default"/></w:rPr></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>
<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/>
<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`

const nu = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
 xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"
 xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${esc(docTitel)}</dc:title><dc:creator>EVA</dc:creator><cp:lastModifiedBy>EVA</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${nu}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${nu}</dcterms:modified>
</cp:coreProperties>`

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
 xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>EVA</Application></Properties>`

// ── Samenstellen ─────────────────────────────────────────────────────────────
const md = readFileSync(bronPad, 'utf8')
const body = naarBody(md)

const SECTIE =
  '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
  '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/>' +
  '</w:sectPr>'

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}${SECTIE}</w:body></w:document>`

const zip = new PizZip()
zip.file('[Content_Types].xml', CONTENT_TYPES)
zip.folder('_rels').file('.rels', RELS)
zip.folder('docProps').file('core.xml', CORE)
zip.folder('docProps').file('app.xml', APP)
const word = zip.folder('word')
word.file('document.xml', DOCUMENT)
word.file('styles.xml', STYLES)
word.file('numbering.xml', NUMBERING)
word.folder('_rels').file('document.xml.rels', DOC_RELS)

writeFileSync(doelPad, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
console.log('Geschreven:', doelPad)
