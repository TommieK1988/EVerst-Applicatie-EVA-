/**
 * Adreshulpjes voor objectenbeheer — puur, geen I/O, bruikbaar op server én client.
 *
 * Waarom een eigen laagje naast `lib/adres/pdok.ts`: PDOK zoekt adressen op, dit
 * normaliseert ze zodat je een dossier en een object met elkaar kunt vergelijken.
 *
 * Twee valkuilen die dit bestand afvangt (beide geverifieerd tegen de echte data):
 *  1. `syncProjects` propt Bouw7's `streetName` + `houseNumber` samen in
 *     `dossiers.werkadres_straat` en laat `werkadres_huisnummer` leeg. Het huisnummer
 *     moet dus uit de straatnaam worden teruggevist.
 *  2. Bouw7 zet bij complexen de héle reeks in `streetName` en laat postcode leeg —
 *     177 van de 579 projecten hebben geen postcode. Een adressleutel is daardoor
 *     vaak leeg; behandel "geen sleutel" als "onbekend", nooit als "gelijk".
 */

/** "2518 pb" → "2518PB". Leeg blijft leeg. */
export function normaliseerPostcode(raw?: string | null): string {
  return (raw ?? '').toUpperCase().replace(/\s+/g, '')
}

/** Eerste getal uit een huisnummer(reeks): "12-16" → "12", "4 a" → "4". */
export function huisnummerCijfers(raw?: string | null): string {
  return (raw ?? '').match(/\d+/)?.[0] ?? ''
}

/**
 * Splits een samengevoegd "Straatnaam 12-16" in straat en huisnummer.
 * Pakt de láátste getalgroep, zodat "Laan van Meerdervoort 100" goed gaat en
 * "2e Schuytstraat 4" niet op de "2" struikelt.
 */
export function splitStraatHuisnummer(raw?: string | null): { straat: string; huisnummer: string } {
  const tekst = (raw ?? '').trim()
  if (!tekst) return { straat: '', huisnummer: '' }
  const m = tekst.match(/^(.*?)[\s,]+(\d+[\w\-/]*)\s*$/)
  if (!m) return { straat: tekst, huisnummer: '' }
  return { straat: m[1].trim(), huisnummer: m[2].trim() }
}

/** Vorm van een dossier waaruit een adressleutel te maken is. */
export type DossierAdres = {
  werkadres_straat?: string | null
  werkadres_huisnummer?: string | null
  werkadres_postcode?: string | null
  werkadres_stad?: string | null
}

/** Vorm van een object waaruit een adressleutel te maken is. */
export type ObjectAdres = {
  adres_straat?: string | null
  adres_huisnummer?: string | null
  adres_postcode?: string | null
  adres_plaats?: string | null
}

/**
 * 'POSTCODE|huisnummer' — dezelfde vorm als de gegenereerde kolom
 * `vastgoed_objecten.adres_sleutel`. Lege string als er te weinig gegevens zijn;
 * dat is expliciet géén match-waarde.
 */
function sleutel(postcode: string, huisnummer: string): string {
  const pc = normaliseerPostcode(postcode)
  const hnr = huisnummerCijfers(huisnummer)
  return pc && hnr ? `${pc}|${hnr}` : ''
}

export function dossierAdresSleutel(d: DossierAdres): string {
  // Huisnummer staat bij Bouw7-dossiers niet in de eigen kolom maar achteraan de straat.
  const uitStraat = splitStraatHuisnummer(d.werkadres_straat).huisnummer
  return sleutel(d.werkadres_postcode ?? '', d.werkadres_huisnummer || uitStraat)
}

export function objectAdresSleutel(o: ObjectAdres): string {
  const uitStraat = splitStraatHuisnummer(o.adres_straat).huisnummer
  return sleutel(o.adres_postcode ?? '', o.adres_huisnummer || uitStraat)
}

/**
 * Wijkt het werkadres van het dossier af van het adres van het object?
 *
 * Alleen `true` bij een aantoonbaar verschil: kan één van beide geen sleutel maken
 * (complex zonder postcode), dan is het antwoord `false` — onbekend is geen afwijking.
 */
export function adresWijktAf(d: DossierAdres, o: ObjectAdres): boolean {
  const a = dossierAdresSleutel(d)
  const b = objectAdresSleutel(o)
  if (!a || !b) return false
  return a !== b
}

/** Adres van een object als één regel, voor lijsten en chips. */
export function objectAdresRegel(o: ObjectAdres): string {
  const straat = [o.adres_straat, o.adres_huisnummer].filter(Boolean).join(' ').trim()
  const plaats = [o.adres_postcode, o.adres_plaats].filter(Boolean).join(' ').trim()
  return [straat, plaats].filter(Boolean).join(', ')
}
