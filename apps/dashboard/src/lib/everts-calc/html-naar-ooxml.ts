/**
 * html-naar-ooxml.ts
 *
 * Zet de HTML uit de offerteteksten-editor om naar Word-XML (OOXML), zodat vet,
 * cursief, onderstreept en opsommingen écht als opmaak in de offerte-PDF staan.
 *
 * WAAROM DIT ZELF, EN NIET EEN MODULE
 *
 * docxtemplater vult standaard alleen platte tekst: `{voorwaarden}` wordt een string
 * en alle opmaak gaat verloren (`stripHtml`). De officiële HTML-module is betaald.
 * Maar de gratis kern kent wél raw-XML-tags — `{@offerteteksten}` vervangt de hele
 * alinea waarin de tag staat door de XML die wij aanleveren. Dat is precies genoeg
 * voor deze opmaak, en het kost geen extra afhankelijkheid.
 *
 * WAT WORDT ONDERSTEUND
 *
 * De subset die de editor kan maken: alinea's, <strong>/<b>, <em>/<i>, <u>, <s>,
 * <br>, en <ul>/<ol> met <li>. Al het andere wordt als gewone tekst meegenomen in
 * plaats van genegeerd — een onbekende tag mag nooit stilletjes tekst laten
 * verdwijnen uit een document dat naar de klant gaat.
 *
 * LIJSTEN
 *
 * Word koppelt opsommingen aan een genummerde definitie in numbering.xml. Die
 * bestaat niet per se in het sjabloon van de gebruiker, dus hangen we er geen
 * afhankelijkheid aan: een bullet wordt een alinea met een echt bullet-teken en
 * een inspring, een nummer krijgt zijn volgnummer als tekst. Dat ziet er in de PDF
 * hetzelfde uit en werkt in élk sjabloon, ook een leeg.
 */

/** XML-escape voor tekst binnen een `<w:t>`. */
function esc(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Losse tekststukjes met hun opmaak, zoals ze uit de HTML rollen. */
interface Stuk {
  tekst: string
  vet?: boolean
  cursief?: boolean
  onderstreept?: boolean
  doorgehaald?: boolean
  /** Harde regelovergang ná dit stuk (`<br>`). */
  breek?: boolean
}

/** Eén alinea: tekststukken plus hoe hij ingesprongen/gemarkeerd moet worden. */
interface Alinea {
  stukken: Stuk[]
  /** Opsommingsteken vooraan ('•' of '1.'), leeg = gewone alinea. */
  merk?: string
}

const ENTITEITEN: Record<string, string> = {
  '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#39;': "'", '&apos;': "'",
}

function decodeer(tekst: string): string {
  return tekst
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/g, m => ENTITEITEN[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
}

/**
 * Hakt HTML in alinea's. Geen DOM beschikbaar (dit draait server-side in de
 * render), dus een kleine tokenizer over de tags die de editor produceert.
 */
function leesAlineas(html: string): Alinea[] {
  const alineas: Alinea[] = []
  let huidig: Alinea = { stukken: [] }
  const opmaak = { vet: 0, cursief: 0, onderstreept: 0, doorgehaald: 0 }
  // Openstaande lijsten; per lijst onthouden we of hij genummerd is en hoe ver.
  const lijsten: { genummerd: boolean; teller: number }[] = []

  const sluitAlinea = () => {
    if (huidig.stukken.some(s => s.tekst.trim() !== '' || s.breek)) alineas.push(huidig)
    huidig = { stukken: [] }
  }

  // Splitst op tags, zodat we tekst en tags om en om verwerken.
  for (const token of html.split(/(<[^>]+>)/)) {
    if (token === '') continue

    if (token.startsWith('<')) {
      const sluit = token.startsWith('</')
      const naam = token.replace(/^<\/?/, '').split(/[\s/>]/)[0].toLowerCase()

      switch (naam) {
        case 'strong': case 'b':   opmaak.vet          += sluit ? -1 : 1; break
        case 'em': case 'i':       opmaak.cursief      += sluit ? -1 : 1; break
        case 'u':                  opmaak.onderstreept += sluit ? -1 : 1; break
        case 's': case 'strike': case 'del':
                                   opmaak.doorgehaald  += sluit ? -1 : 1; break
        case 'br':
          huidig.stukken.push({ tekst: '', breek: true })
          break
        case 'p': case 'div': case 'h1': case 'h2': case 'h3': case 'h4':
          sluitAlinea()
          break
        case 'ul': case 'ol':
          sluitAlinea()
          if (sluit) lijsten.pop()
          else lijsten.push({ genummerd: naam === 'ol', teller: 0 })
          break
        case 'li':
          sluitAlinea()
          if (!sluit) {
            const lijst = lijsten[lijsten.length - 1]
            if (lijst) {
              lijst.teller += 1
              huidig.merk = lijst.genummerd ? `${lijst.teller}.` : '•'
            } else {
              huidig.merk = '•'
            }
          }
          break
        default:
          // Onbekende tag: negeren, de tekst eromheen blijft staan.
          break
      }
      continue
    }

    const tekst = decodeer(token)
    if (tekst === '') continue
    huidig.stukken.push({
      tekst,
      vet: opmaak.vet > 0,
      cursief: opmaak.cursief > 0,
      onderstreept: opmaak.onderstreept > 0,
      doorgehaald: opmaak.doorgehaald > 0,
    })
  }
  sluitAlinea()
  return alineas
}

/** Eén `<w:r>`-run met zijn opmaak. */
function run(stuk: Stuk): string {
  const props: string[] = []
  if (stuk.vet)          props.push('<w:b/>')
  if (stuk.cursief)      props.push('<w:i/>')
  if (stuk.onderstreept) props.push('<w:u w:val="single"/>')
  if (stuk.doorgehaald)  props.push('<w:strike/>')
  const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : ''
  const inhoud = stuk.tekst === ''
    ? ''
    : `<w:t xml:space="preserve">${esc(stuk.tekst)}</w:t>`
  const breek = stuk.breek ? '<w:br/>' : ''
  return `<w:r>${rPr}${inhoud}${breek}</w:r>`
}

/**
 * Zet HTML om naar OOXML-alinea's voor een `{@tag}`.
 *
 * Geeft een lege string terug als er niets te tonen is; docxtemplater haalt de
 * alinea met de tag dan helemaal weg in plaats van een lege regel te laten staan.
 */
export function htmlNaarOoxml(html: string | null | undefined): string {
  const bron = (html ?? '').trim()
  if (bron === '') return ''

  const alineas = leesAlineas(bron)
  if (alineas.length === 0) return ''

  return alineas.map(a => {
    // Inspringen en het opsommingsteken als echte tekst, zodat er geen
    // numbering-definitie in het sjabloon hoeft te bestaan.
    const pPr = a.merk ? '<w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr>' : ''
    const merk = a.merk
      ? `<w:r><w:t xml:space="preserve">${esc(a.merk)} </w:t></w:r>`
      : ''
    return `<w:p>${pPr}${merk}${a.stukken.map(run).join('')}</w:p>`
  }).join('')
}

/**
 * Platte tekst uit dezelfde HTML — voor plekken waar geen opmaak kan (de
 * mailtekst, een voorvertoning op het scherm, de PDF-hash).
 */
export function htmlNaarTekst(html: string | null | undefined): string {
  const alineas = leesAlineas((html ?? '').trim())
  return alineas
    .map(a => {
      const regel = a.stukken.map(s => s.tekst + (s.breek ? '\n' : '')).join('')
      return a.merk ? `${a.merk} ${regel}` : regel
    })
    .join('\n')
    .trim()
}

/** Tags die de editor kan maken en die de Word-render ook echt overneemt. */
const TOEGESTAAN = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li'])

/**
 * Filtert HTML terug tot de subset hierboven.
 *
 * De editor kan zelf niets anders maken — ProseMirror dwingt zijn schema af — maar de
 * waarde reist als gewone string via een server-action naar de database, en wordt in de
 * schermvoorvertoning met `dangerouslySetInnerHTML` getoond. Dan hoort er een filter
 * tussen te zitten dat niet op de goede bedoelingen van de client vertrouwt.
 *
 * Attributen gaan er allemaal af: er is er geen enkele die de offerte nodig heeft, en
 * daarmee zijn `onclick`, `style` en `href` in één klap weg.
 */
export function schoonOfferteHtml(html: string | null | undefined): string {
  const bron = (html ?? '').trim()
  if (bron === '') return ''
  // Inhoud van script/style eerst weg. Bij de andere tags blijft de tekst juist staan
  // (die hoort bij de offerte), maar wat híér in staat is nooit leesbare inhoud.
  const zonderCode = bron.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  return zonderCode.replace(/<[^>]*>/g, tag => {
    const sluit = tag.startsWith('</')
    const naam = tag.replace(/^<\/?/, '').split(/[\s/>]/)[0].toLowerCase()
    if (!TOEGESTAAN.has(naam)) return ''
    if (naam === 'br') return '<br>'
    return sluit ? `</${naam}>` : `<${naam}>`
  })
}
