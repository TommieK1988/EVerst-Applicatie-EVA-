/**
 * docx-watermerk.ts
 *
 * Zet een CONCEPT-watermerk in een .docx, of haalt het er weer uit.
 *
 * Waarom in de .docx en niet alleen op de PDF: zodra een offerte via "Bewerken in
 * Word Online" aan een SharePoint-bestand hangt, is dát bestand de bron voor elke
 * uitvoer én het document dat de gebruiker in Word voor zich heeft. Een watermerk
 * dat alleen op de PDF wordt gestempeld (`briefpapier.ts`), ontbreekt dus precies
 * daar waar iemand aan het werk is — en op elke kopie die het pand verlaat.
 *
 * Het watermerk is een gewone Word-watermerkvorm (VML WordArt in de header), zoals
 * Word die zelf ook maakt. Dat het in de *header* zit is bewust: de gebruiker
 * bewerkt de tekst in `document.xml`, dus het watermerk kan er later uit zonder ook
 * maar iets van dat handwerk aan te raken.
 *
 * De regels rond het gebruik:
 *  - Bij het opstellen van het Word-document gaat het watermerk erin.
 *  - Bij elke .docx die EVA uitlevert wordt de staat opnieuw afgedwongen — wie het
 *    in Word weghaalt, krijgt het bij de volgende download terug.
 *  - In de PDF-pijplijn gaat het er juist altijd uit; daar stempelt pdf-lib. Zo
 *    staat er nooit twee keer CONCEPT op, en blijft er één plek die bepaalt of een
 *    PDF concept is: de goedkeuringsgate.
 */

import 'server-only'

/** Kenmerk waaraan we onze eigen watermerkvorm herkennen — ook na een ronde door Word. */
const MARKER = 'EVAConceptWatermerk'

const NS_V = 'urn:schemas-microsoft-com:vml'
const NS_O = 'urn:schemas-microsoft-com:office:office'
const NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

const HEADER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml'
const HEADER_REL_TYPE = `${NS_R}/header`

/** Word's standaard WordArt-vorm voor watermerken ("Text Plain", `_x0000_t136`). */
const SHAPETYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" ' +
  'path="m@7,l@8,m@5,21600l@6,21600e"><v:formulas>' +
  '<v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/>' +
  '<v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/>' +
  '<v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/>' +
  '<v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/>' +
  '<v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/>' +
  '</v:formulas><v:path textpathok="t" o:connecttype="custom" ' +
  'o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>' +
  '<v:textpath on="t" fitshape="t"/><v:handles>' +
  '<v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles>' +
  '<o:lock v:ext="edit" text="t" shapetype="t"/></v:shapetype>'

function escapeXml(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * De watermerk-alinea: diagonaal (rotatie 315°), gecentreerd op de pagina en
 * halftransparant grijs — dezelfde verschijning als het pdf-lib-stempel, zodat een
 * Word-offerte en een PDF-offerte er hetzelfde uitzien.
 */
function watermerkAlinea(tekst: string, volgnummer: number): string {
  const veilig = escapeXml(tekst)
  const stijl =
    'position:absolute;margin-left:0;margin-top:0;width:468pt;height:187.2pt;' +
    'rotation:315;z-index:-251656192;mso-position-horizontal:center;' +
    'mso-position-horizontal-relative:margin;mso-position-vertical:center;' +
    'mso-position-vertical-relative:margin'
  return (
    '<w:p><w:r><w:rPr><w:noProof/></w:rPr><w:pict>' +
    SHAPETYPE +
    `<v:shape id="${MARKER}${volgnummer}" o:spid="_x0000_s${2049 + volgnummer}" ` +
    `type="#_x0000_t136" style="${stijl}" o:allowincell="f" fillcolor="#c0c0c0" stroked="f">` +
    '<v:fill opacity=".4"/>' +
    `<v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="${veilig}"/>` +
    '</v:shape></w:pict></w:r></w:p>'
  )
}

// ─── XML-hulpjes ──────────────────────────────────────────────────────────────

/** Zorgt dat de root van een header-part de VML-namespaces kent. */
function zorgVoorNamespaces(xml: string): string {
  const match = xml.match(/<w:hdr\b[^>]*>/)
  if (!match) return xml
  let open = match[0]
  if (!open.includes('xmlns:v=')) open = open.replace(/>$/, ` xmlns:v="${NS_V}">`)
  if (!open.includes('xmlns:o=')) open = open.replace(/>$/, ` xmlns:o="${NS_O}">`)
  return open === match[0] ? xml : xml.replace(match[0], open)
}

/**
 * Verwijdert de `<w:p>` waarin het markerkenmerk staat.
 *
 * Zoekt vanaf de marker terug naar de omvattende alinea-opening en telt daarna
 * vooruit mee met geneste `<w:p>` (dat kan: een tekstvak binnen de vorm bevat weer
 * alinea's), zodat precies het bijbehorende sluit-element wordt gepakt.
 */
function verwijderMarkerAlineas(xml: string): string {
  let uit = xml
  for (let ronde = 0; ronde < 20; ronde++) {
    const pos = uit.indexOf(MARKER)
    if (pos === -1) break

    const start = Math.max(uit.lastIndexOf('<w:p>', pos), uit.lastIndexOf('<w:p ', pos))
    if (start === -1) break

    let diepte = 0
    let eind = -1
    const patroon = /<w:p[ >]|<\/w:p>/g
    patroon.lastIndex = start
    let m: RegExpExecArray | null
    while ((m = patroon.exec(uit)) !== null) {
      if (m[0] === '</w:p>') {
        diepte--
        if (diepte === 0) {
          eind = m.index + m[0].length
          break
        }
      } else {
        diepte++
      }
    }
    if (eind === -1) break
    uit = uit.slice(0, start) + uit.slice(eind)
  }
  return uit
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function headerParts(zip: any): string[] {
  return Object.keys(zip.files as Record<string, unknown>).filter((naam) =>
    /^word\/header\d*\.xml$/.test(naam),
  )
}

/** Eerstvolgende vrije `rId` in een rels-bestand. */
function vrijeRelId(relsXml: string): string {
  let hoogste = 0
  for (const m of relsXml.matchAll(/Id="rId(\d+)"/g)) {
    hoogste = Math.max(hoogste, Number(m[1]))
  }
  return `rId${hoogste + 1}`
}

/** Eerstvolgende vrije bestandsnaam voor een header-part. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function vrijeHeaderNaam(zip: any): string {
  let n = 1
  while (zip.file(`word/header${n}.xml`)) n++
  return `word/header${n}.xml`
}

function nieuwHeaderPart(tekst: string, volgnummer: number): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:hdr xmlns:w="${NS_W}" xmlns:r="${NS_R}" xmlns:v="${NS_V}" xmlns:o="${NS_O}">` +
    watermerkAlinea(tekst, volgnummer) +
    '</w:hdr>'
  )
}

type SectPr = { start: number; eind: number; open: string; inhoud: string; zelfsluitend: boolean }

/** Alle `<w:sectPr>`-blokken in document.xml, in voorkomende volgorde. */
function vindSectPrs(doc: string): SectPr[] {
  const treffers: SectPr[] = []
  const patroon = /<w:sectPr\b[^>]*?(\/?)>/g
  let m: RegExpExecArray | null
  while ((m = patroon.exec(doc)) !== null) {
    if (m[1] === '/') {
      treffers.push({
        start: m.index,
        eind: m.index + m[0].length,
        open: m[0],
        inhoud: '',
        zelfsluitend: true,
      })
      continue
    }
    const sluit = doc.indexOf('</w:sectPr>', m.index)
    if (sluit === -1) continue
    treffers.push({
      start: m.index,
      eind: sluit + '</w:sectPr>'.length,
      open: m[0],
      inhoud: doc.slice(m.index + m[0].length, sluit),
      zelfsluitend: false,
    })
  }
  return treffers
}

// ─── Publieke API ─────────────────────────────────────────────────────────────

/** Staat er al een EVA-watermerk in dit document? */
export async function heeftConceptWatermerk(docx: Buffer): Promise<boolean> {
  const PizZip = (await import('pizzip')).default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip = new PizZip(docx) as any
  return headerParts(zip).some((naam) => zip.file(naam)?.asText().includes(MARKER))
}

/**
 * Zet het CONCEPT-watermerk in alle headers van een .docx. Idempotent: een document
 * dat het al heeft komt ongewijzigd terug.
 *
 * Headers die er al zijn krijgen het watermerk erbij. Ontbreekt een *soort* header
 * in het hele document (een document zonder headers, of een eerste pagina met
 * `titlePg` maar zonder eigen header), dan wordt die aangemaakt. Bewust alleen voor
 * soorten die nergens voorkomen: een sectie zonder eigen header erft die van de
 * vorige sectie, en die is dan al gewatermerkt. Zouden we daar tóch een header
 * aanhangen, dan zetten we het briefhoofd van dat document buitenspel.
 */
export async function zetConceptWatermerk(docx: Buffer, tekst = 'CONCEPT'): Promise<Buffer> {
  const PizZip = (await import('pizzip')).default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip = new PizZip(docx) as any

  let volgnummer = 0

  // 1. Bestaande headers voorzien van het watermerk.
  for (const naam of headerParts(zip)) {
    const xml: string | undefined = zip.file(naam)?.asText()
    if (!xml || xml.includes(MARKER)) continue
    const metNs = zorgVoorNamespaces(xml)
    zip.file(naam, metNs.replace('</w:hdr>', watermerkAlinea(tekst, ++volgnummer) + '</w:hdr>'))
  }

  // 2. Ontbrekende header-soorten aanvullen.
  const docBestand = zip.file('word/document.xml')
  if (!docBestand) return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
  let doc: string = docBestand.asText()

  const gebruikteSoorten = new Set(
    Array.from(doc.matchAll(/<w:headerReference\b[^>]*w:type="([^"]+)"/g)).map((m) => m[1]),
  )
  const settings: string = zip.file('word/settings.xml')?.asText() ?? ''
  const evenEnOneven = /<w:evenAndOddHeaders\b/.test(settings)

  const sectPrs = vindSectPrs(doc)
  const heeftTitelPagina = sectPrs.some((s) => /<w:titlePg\b/.test(s.inhoud))

  const gewenst: ('default' | 'first' | 'even')[] = ['default']
  if (heeftTitelPagina) gewenst.push('first')
  if (evenEnOneven) gewenst.push('even')
  const ontbrekend = gewenst.filter((soort) => !gebruikteSoorten.has(soort))

  if (ontbrekend.length > 0) {
    const relsNaam = 'word/_rels/document.xml.rels'
    let rels: string = zip.file(relsNaam)?.asText() ?? ''
    let types: string = zip.file('[Content_Types].xml')?.asText() ?? ''
    // Zonder rels of content-types kunnen we geen part registreren; de bestaande
    // headers (stap 1) zijn dan het maximaal haalbare.
    if (!rels || !types) return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })

    const verwijzingen: { soort: string; relId: string }[] = []
    for (const soort of ontbrekend) {
      const partNaam = vrijeHeaderNaam(zip)
      zip.file(partNaam, nieuwHeaderPart(tekst, ++volgnummer))

      const relId = vrijeRelId(rels)
      rels = rels.replace(
        '</Relationships>',
        `<Relationship Id="${relId}" Type="${HEADER_REL_TYPE}" ` +
          `Target="${partNaam.replace('word/', '')}"/></Relationships>`,
      )
      types = types.replace(
        '</Types>',
        `<Override PartName="/${partNaam}" ContentType="${HEADER_CONTENT_TYPE}"/></Types>`,
      )
      verwijzingen.push({ soort, relId })
    }
    zip.file(relsNaam, rels)
    zip.file('[Content_Types].xml', types)

    // Van achter naar voren invoegen, anders schuiven de posities onder ons weg.
    // `headerReference` hoort vooraan in `sectPr` — dat schrijft het schema voor.
    for (let i = sectPrs.length - 1; i >= 0; i--) {
      const sect = sectPrs[i]
      const vanToepassing = verwijzingen.filter(
        (v) => v.soort !== 'first' || /<w:titlePg\b/.test(sect.inhoud),
      )
      if (vanToepassing.length === 0) continue

      const refs = vanToepassing
        .map((v) => `<w:headerReference w:type="${v.soort}" r:id="${v.relId}"/>`)
        .join('')
      // Een leeg `<w:sectPr/>` moet open gebroken worden; het sluit-element zetten we
      // in beide gevallen zelf terug (bij een gewone sectPr valt het buiten `inhoud`).
      const open = sect.zelfsluitend ? sect.open.replace(/\/>$/, '>') : sect.open
      doc =
        doc.slice(0, sect.start) +
        open + refs + sect.inhoud + '</w:sectPr>' +
        doc.slice(sect.eind)
    }
    zip.file('word/document.xml', doc)
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * Haalt het CONCEPT-watermerk uit een .docx. Raakt alleen de headers aan; de inhoud
 * van het document — inclusief alles wat iemand in Word heeft aangepast — blijft
 * ongemoeid. Een document zonder watermerk komt ongewijzigd terug.
 */
export async function verwijderConceptWatermerk(docx: Buffer): Promise<Buffer> {
  const PizZip = (await import('pizzip')).default
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const zip = new PizZip(docx) as any

  let gewijzigd = false
  for (const naam of headerParts(zip)) {
    const xml: string | undefined = zip.file(naam)?.asText()
    if (!xml || !xml.includes(MARKER)) continue
    zip.file(naam, verwijderMarkerAlineas(xml))
    gewijzigd = true
  }
  if (!gewijzigd) return docx

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })
}

/**
 * Dwingt de watermerkstaat af: concept → erin, goedgekeurd → eruit. Dit is wat de
 * uitlever-routes aanroepen, zodat een handmatige ingreep in Word nooit blijvend
 * effect heeft.
 */
export async function pasConceptWatermerkToe(docx: Buffer, concept: boolean): Promise<Buffer> {
  return concept ? zetConceptWatermerk(docx) : verwijderConceptWatermerk(docx)
}
