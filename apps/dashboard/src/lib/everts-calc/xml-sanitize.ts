/**
 * Saneren van XML-invoer uit Calc4You (.c4y en CUF-export).
 *
 * Calc4You schrijft af en toe stuurtekens in vrije tekstvelden weg — meestal als
 * numerieke tekencode (`&#0;`), soms als rauwe byte. XML 1.0 verbiedt die tekens,
 * dus de browser-parser stopt op de eerste die hij tegenkomt en het hele bestand
 * is onbruikbaar ("xmlParseCharRef: invalid xmlChar value 0"). De tekens dragen
 * geen betekenis, dus we halen ze er stilzwijgend uit vóór het parsen.
 *
 * Toegestaan volgens XML 1.0:
 *   #x9 | #xA | #xD | [#x20-#xD7FF] | [#xE000-#xFFFD] | [#x10000-#x10FFFF]
 */

/** Numerieke tekencode: `&#0;` of `&#x1A;`. */
const TEKENCODE = /&#(?:[xX][0-9a-fA-F]+|[0-9]+);/g

function isToegestaanTeken(cp: number): boolean {
  return (
    cp === 0x9 || cp === 0xa || cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  )
}

/** Rauwe stuurtekens uit de tekst halen (tab, newline en CR blijven staan). */
function verwijderRuweStuurtekens(tekst: string): string {
  let schoon = ''
  for (const teken of tekst) {
    if (isToegestaanTeken(teken.codePointAt(0) ?? 0)) schoon += teken
  }
  return schoon
}

/**
 * Verwijdert tekens die een XML-parser doen struikelen, zowel als numerieke
 * tekencode als rauw in de tekst. Geldige inhoud blijft ongemoeid.
 */
export function saneerXml(xml: string): string {
  const zonderCodes = xml.replace(TEKENCODE, (match) => {
    const hex = match[2] === 'x' || match[2] === 'X'
    const cp = parseInt(match.slice(hex ? 3 : 2, -1), hex ? 16 : 10)
    return Number.isFinite(cp) && isToegestaanTeken(cp) ? match : ''
  })
  return verwijderRuweStuurtekens(zonderCodes)
}
