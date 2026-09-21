import 'server-only'
import PizZip from 'pizzip'

/**
 * mailintake/office-tekst.ts
 *
 * Haalt de platte tekst uit een Word- of Excel-bestand.
 *
 * WAAROM DIT BESTAAT
 * Het model krijgt PDF's als document en foto's als afbeelding, maar een .docx
 * kan het niet lezen -- dat ging tot nu toe als "bestandstype kan niet gelezen
 * worden" de stapel overgeslagen bijlagen in. Dat is precies het verkeerde
 * bestand om te missen: een werkomschrijving wordt in Word geschreven, niet in
 * PDF. Bij de eerste echte offerteaanvraag die hier binnenkwam stond in de mail
 * letterlijk "zie bijgaand werkomschrijving" en zat de hele scope in een
 * Word-document van twintig kilobyte. Zonder deze module leest EVA dan een mail
 * van vier regels en concludeert dat er geen werkzaamheden in staan.
 *
 * HOE
 * Een .docx is een zipbestand met XML erin. `pizzip` zit al in het project (voor
 * de offertesjablonen), dus er komt geen afhankelijkheid bij. De tekst wordt
 * ruw uitgepakt: alinea's worden regeleinden, tags gaan eruit, entiteiten gaan
 * terug naar gewone tekens. Geen opmaak, geen tabellen als tabel -- het model
 * heeft de woorden nodig, niet de vormgeving.
 *
 * Het oude .doc-formaat (OLE, niet zip) kan hier niet mee. Dat is bewust: dat
 * fatsoenlijk uitlezen vraagt een echte parser, en zo'n bestand komt zelden voor.
 * Het blijft netjes als "niet gelezen" gemeld.
 */

/** Bestandstypen waar tekst uit te halen valt. */
const WORD_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const EXCEL_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export function isLeesbaarOfficeBestand(contentType: string | null, bestandsnaam: string): boolean {
  const type = (contentType ?? '').toLowerCase().split(';')[0].trim()
  if (WORD_TYPES.has(type) || EXCEL_TYPES.has(type)) return true
  // Outlook zet er niet altijd een net type op; de extensie is dan de aanwijzing.
  return /\.(docx|xlsx)$/i.test(bestandsnaam)
}

/** Zet XML-entiteiten terug naar gewone tekens. */
function ontkleed(xml: string): string {
  return xml
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Ampersand als laatste, anders worden de andere entiteiten dubbel vertaald.
    .replace(/&amp;/g, '&')
}

function xmlNaarTekst(xml: string): string {
  return ontkleed(
    xml
      // Alinea- en regeleinden worden echte regeleinden, anders plakt alles aan elkaar.
      .replace(/<\/w:p>/g, '\n')
      .replace(/<w:br\s*\/?>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Leest de tekst uit een Word- of Excel-bestand.
 *
 * Gooit niet: een onleesbaar bestand levert `null` op en wordt dan gewoon als
 * "niet gelezen" gemeld. Een kapotte bijlage mag de hele intake niet ophouden.
 */
export function leesOfficeTekst(bytes: Buffer, bestandsnaam: string): string | null {
  try {
    const zip = new PizZip(bytes)

    if (/\.xlsx$/i.test(bestandsnaam) || zip.files['xl/workbook.xml']) {
      // Excel bewaart tekst in een gedeelde tabel; de cellen zelf staan vol
      // verwijzingen. Die tabel is voor onze doeleinden de inhoud.
      const gedeeld = zip.files['xl/sharedStrings.xml']
      if (!gedeeld) return null
      const tekst = xmlNaarTekst(gedeeld.asText())
      return tekst || null
    }

    const document = zip.files['word/document.xml']
    if (!document) return null

    const delen = [xmlNaarTekst(document.asText())]

    // Kop- en voetteksten bevatten soms het projectnummer of de opdrachtgever.
    for (const naam of Object.keys(zip.files)) {
      if (/^word\/(header|footer)\d*\.xml$/.test(naam)) {
        const extra = xmlNaarTekst(zip.files[naam].asText())
        if (extra) delen.push(extra)
      }
    }

    const tekst = delen.filter(Boolean).join('\n\n').trim()
    return tekst || null
  } catch {
    return null
  }
}
