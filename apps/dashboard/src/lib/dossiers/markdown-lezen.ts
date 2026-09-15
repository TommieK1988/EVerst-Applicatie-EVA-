/**
 * markdown-lezen.ts
 *
 * Zet een `.md`-bestand uit het dossier om naar opgemaakte HTML, zodat een
 * markdown-document direct te lezen is in plaats van als brontekst met hekjes en
 * sterretjes te moeten worden gedownload.
 *
 * Twee dingen verdienen toelichting:
 *
 *  1. **Tekstcodering.** Markdown is platte tekst zonder koptekst die vertelt in
 *     welke codering hij staat. Bijna alles is tegenwoordig UTF-8, maar een bestand
 *     dat ooit door Kladblok of een oud Windows-programma is bewaard, is dat niet —
 *     en dan verandert elke é in een vraagteken. We proberen daarom eerst streng
 *     UTF-8 en vallen alleen terug op Windows-1252 als dat mislukt.
 *  2. **Veiligheid.** Markdown mag officieel losse HTML bevatten, inclusief
 *     `<script>`. Dat staat hier uit (`html: false`), zodat zulke stukken als
 *     gewone tekst verschijnen. De client zet het resultaat daarnaast nog in een
 *     afgeschermd venster — zelfde aanpak als bij het lezen van een .msg.
 */

import MarkdownIt from 'markdown-it'
import * as iconv from 'iconv-lite'

export type MarkdownDocument = {
  /** Eerste kop uit het document; `null` als het er geen heeft. */
  titel: string | null
  /** Opgemaakte HTML. Bevat geen scripts — zie de toelichting hierboven. */
  html: string
  /** Aantal tekens van de brontekst, voor de regel onder de titel. */
  tekens: number
}

/** Boven deze omvang is het geen leesbaar document meer, maar een datadump. */
export const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024

const md = new MarkdownIt({
  // Losse HTML in het document wordt getoond als tekst, niet uitgevoerd.
  html: false,
  // Kale links in de tekst worden aanklikbaar — in interne notities staan ze vaak
  // zonder markdown-haakjes.
  linkify: true,
  typographer: false,
})

/**
 * Bytes naar tekst, met de BOM eraf.
 *
 * `iconv.decode` met UTF-8 vervangt ongeldige bytes stilletjes door het
 * vervangingsteken; komt dat voor, dan was het waarschijnlijk geen UTF-8 en levert
 * Windows-1252 een beter leesbaar resultaat op.
 */
export function decodeerTekst(data: Buffer): string {
  const zonderBom = data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf
    ? data.subarray(3)
    : data

  const utf8 = iconv.decode(zonderBom, 'utf8')
  if (!utf8.includes('�')) return utf8
  return iconv.decode(zonderBom, 'win1252')
}

/** Eerste ATX- of setext-kop uit de brontekst, als titel boven het venster. */
function eersteKop(tekst: string): string | null {
  const regels = tekst.split(/\r?\n/)
  for (let i = 0; i < regels.length; i++) {
    const regel = regels[i].trim()
    if (!regel) continue
    const atx = regel.match(/^#{1,6}\s+(.+?)\s*#*$/)
    if (atx) return atx[1].trim() || null
    // Setext: de tekst staat boven een rij = of -.
    if (/^(=+|-{2,})$/.test((regels[i + 1] ?? '').trim())) return regel
    // De eerste inhoudelijke regel is geen kop; dan heeft het document er geen.
    return null
  }
  return null
}

export function leesMarkdown(data: Buffer): MarkdownDocument {
  const tekst = decodeerTekst(data)
  return {
    titel: eersteKop(tekst),
    html: md.render(tekst),
    tekens: tekst.length,
  }
}
