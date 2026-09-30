/**
 * De werkomschrijving: de projectnaam zonder dossiernummer en zonder adres.
 *
 * Een projectnaam is in de praktijk "adres + wat er gebeurt", maar niet in één vaste vorm:
 *
 *   Verdistraat 101 t/m 227, Leiden - Schilderwerk volgens schema
 *   Lelievaart 55 Zoetermeer, buitenschilderwerk
 *   Zamenhofstraat 6 Badkamer unit 14 Deur vervangen
 *   Wandschilderwerk — Van Leeuwenhoekpark 55, Delft          (Gilde: omschrijving vóór het adres)
 *
 * Splitsen op een scheidingsteken gaat dus mis ("Steenlaan 32, 34 en 36 Rijswijk, …" heeft een
 * komma in het adres). Daarom halen we de bekende delen er letterlijk uit — het nummer, de straat
 * zoals hij op het dossier staat, postcode en plaats — en ruimen daarna de losse scheidingstekens op.
 *
 * Een tikfout tussen projectnaam en werkadres ("Grovestinstraat" tegen "Grovestinsstraat") laat de
 * straat staan. Dan vangt de regel met de plaats het op: staat vóór de plaats iets met een cijfer,
 * dan is dat het adres en valt het weg.
 */

const SCHEIDING = String.raw`[\s,\-–—:;/|]`

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Regex voor een letterlijke tekst, met willekeurige witruimte waar de tekst witruimte heeft. */
function losseTekst(s: string): RegExp | null {
  const schoon = s.trim().replace(/\s+/g, ' ')
  if (!schoon) return null
  return new RegExp(schoon.split(' ').map(escape).join(String.raw`\s*`), 'i')
}

export function werkomschrijvingUitTitel(v: {
  titel?: string | null
  dossiernummer?: string | null
  straat?: string | null
  huisnummer?: string | null
  postcode?: string | null
  plaats?: string | null
}): string {
  let t = (v.titel ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return ''

  const weg = (s: string | null | undefined): boolean => {
    const re = s ? losseTekst(s) : null
    if (!re || !re.test(t)) return false
    t = t.replace(re, ' ')
    return true
  }

  weg(v.dossiernummer)
  // Straat met huisnummer eerst: staat het huisnummer los, dan hoort het er wél bij.
  const straatWeg =
    weg([v.straat, v.huisnummer].filter(Boolean).join(' ')) || weg(v.straat)
  weg(v.postcode)

  const plaats = (v.plaats ?? '').trim()
  if (plaats) {
    const re = new RegExp(String.raw`(^|${SCHEIDING})${escape(plaats).replace(/\s+/g, String.raw`\s+`)}(?=$|${SCHEIDING})`, 'i')
    const m = re.exec(t)
    if (m) {
      const voor = t.slice(0, m.index)
      // Straat niet gevonden, maar vóór de plaats staat een huisnummer: dat is het adres.
      if (!straatWeg && /\d/.test(voor) && voor.length <= 60) t = t.slice(m.index + m[0].length)
      else t = voor + ' ' + t.slice(m.index + m[0].length)
    }
  }

  // Opruimen: een rij scheidingstekens in het midden wordt één, aan de randen verdwijnen ze.
  t = t
    .replace(new RegExp(String.raw`^${SCHEIDING}+|${SCHEIDING}+$`, 'g'), '')
    .replace(/\s*([,:;])(\s*[,:;\-–—])+\s*/g, '$1 ')
    .replace(/\s*([\-–—])(\s*[,:;\-–—])+\s*/g, ' $1 ')
    .replace(/\s+([,:;])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''
}
