/**
 * docx-bouwstenen.mjs — de gedeelde XML-bouwstenen voor de sjabloon-generatoren.
 *
 * Uitgetrokken uit `maak-kwaliteitssjabloon.mjs`, waar ze zijn ontstaan. Reden om ze te
 * delen: de "één herkenbare uitstraling" van de rapportages komt hiervandaan — dezelfde
 * koppenhiërarchie, dezelfde tabelranden, dezelfde grijstinten. Zodra elk sjabloon zijn
 * eigen alinea-XML schrijft, lopen ze binnen een jaar weer uiteen.
 *
 * Waarom we .docx'en genereren in plaats van ze in Word te maken: docxtemplater-tags
 * moeten compleet in één run staan, en Word knipt ze bij het bewerken graag op.
 * (`fixSplitDocxTags` in render-docx repareert dat achteraf, maar beter is ze niet stuk
 * te maken.)
 */

/** Huisstijl. Everts-groen is #009439; op papier gebruiken we grijs voor bijtekst. */
export const GROEN = '009439'
export const GRIJS = '5B6770'
export const DONKER = '1F2933'
export const RAND = 'D9DEE3'
export const ARCERING = 'F4F6F7'

export const esc = t =>
  String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Alinea. `opt`: {grootte, vet, kleur, na, voor, breekVoor, streepOnder, uitlijning} */
export function p(tekst, opt = {}) {
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

/** Kale alinea met alleen een tag erin — voor {#loops}, {/loops} en {#condities}. */
export const tag = t => p(t, { grootte: 18, kleur: GRIJS, na: 40 })

/** Lege alinea met exacte hoogte; houdt de bloklengte voorspelbaar. */
export const spatie = (hoogte = 120) =>
  `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${hoogte}" w:lineRule="exact"/></w:pPr></w:p>`

export const paginabreuk = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'

export function cel(inhoud, breedte, opt = {}) {
  const { achtergrond = null, verticaal = 'top' } = opt
  return '<w:tc><w:tcPr>'
    + `<w:tcW w:w="${breedte}" w:type="dxa"/>`
    + `<w:vAlign w:val="${verticaal}"/>`
    + (achtergrond ? `<w:shd w:val="clear" w:color="auto" w:fill="${achtergrond}"/>` : '')
    + '<w:tcMar><w:top w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/>'
    + '<w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>'
    + '</w:tcPr>' + inhoud + '</w:tc>'
}

/**
 * Tabelrij. `cellen` = [{inhoud, breedte, achtergrond, verticaal}]
 * `hoogte` met hRule="exact" is samen met `nietSplitsen` de helft van de garantie dat
 * een bevinding nooit over twee pagina's valt; de andere helft is het server-side chunken.
 */
export function rij(cellen, opt = {}) {
  const { hoogte = null, nietSplitsen = false } = opt
  const trPr = (hoogte ? `<w:trHeight w:hRule="exact" w:val="${hoogte}"/>` : '')
    + (nietSplitsen ? '<w:cantSplit/>' : '')
  return '<w:tr>' + (trPr ? `<w:trPr>${trPr}</w:trPr>` : '')
    + cellen.map(c => cel(c.inhoud, c.breedte, c)).join('') + '</w:tr>'
}

export function tabel(rijen, opt = {}) {
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
export const kop = t => p(t, { grootte: 15, vet: true, kleur: GRIJS, na: 20 })
/** Gewone celtekst. */
export const cet = (t, opt = {}) => p(t, { grootte: 18, na: 0, ...opt })
/** Hoofdstukkop. */
export const hoofdstuk = (t, opt = {}) =>
  p(t, { grootte: 28, vet: true, na: 120, streepOnder: true, ...opt })

/**
 * A4 staand met nette marges. Bewust één sectie voor het hele document: een tweede
 * sectie draagt eigen paginaopmaak en loopt uit de pas met de briefpapier-merge, die
 * hetzelfde briefpapier onder élke pagina legt.
 */
export const SECT_PR = '<w:sectPr>'
  + '<w:pgSz w:w="11906" w:h="16838"/>'
  + '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" '
  + 'w:header="708" w:footer="708" w:gutter="0"/>'
  + '</w:sectPr>'

/** Wikkelt de body-delen in een compleet word/document.xml. */
export function documentXml(delen) {
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    + '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    + 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    + 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
    + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
    + '<w:body>' + delen.join('') + SECT_PR + '</w:body></w:document>'
}
