/**
 * PDOK Locatieserver — Nederlandse adrescontrole/aanvulling (BAG, Kadaster).
 *
 * Publiek, keyless, CORS-vriendelijk → rechtstreeks vanuit de browser aan te roepen.
 * Endpoint: https://api.pdok.nl/bzk/locatieserver/search/v3_1/free
 *
 * Gebruik in de aanvraag-modal: bij postcode + huisnummer wordt het adres opgezocht, ontbrekende
 * velden (straat, plaats) worden aangevuld en er wordt gesignaleerd of het adres bestaat. Een reeks
 * huisnummers (bv. "12-16") of een pandnaam wordt begrepen via de vrije-tekst-query.
 */

const PDOK_FREE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free'

export type AdresResultaat = {
  /** Straatnaam. */
  straat: string
  /** Huisnummer inclusief toevoeging (huis_nlt), bv. "12 A". */
  huisnummer: string
  postcode: string
  stad: string
  /** Volledige weergavenaam zoals PDOK die teruggeeft. */
  weergavenaam: string
}

type PdokDoc = {
  type?: string
  weergavenaam?: string
  straatnaam?: string
  straatnaam_verkort?: string
  huisnummer?: number
  huis_nlt?: string
  postcode?: string
  woonplaatsnaam?: string
}

function mapDoc(d: PdokDoc): AdresResultaat {
  return {
    straat: d.straatnaam ?? d.straatnaam_verkort ?? '',
    huisnummer: d.huis_nlt ?? (d.huisnummer != null ? String(d.huisnummer) : ''),
    postcode: (d.postcode ?? '').replace(/(\d{4})\s*([A-Za-z]{2})/, '$1 $2').toUpperCase(),
    stad: d.woonplaatsnaam ?? '',
    weergavenaam: d.weergavenaam ?? '',
  }
}

/** Eerste heel getal uit een (mogelijke) huisnummer-reeks, bv. "12-16" → "12", "12 A" → "12". */
export function eersteHuisnummer(huisnummer: string): string {
  const m = huisnummer.match(/\d+/)
  return m ? m[0] : ''
}

/** true als het huisnummerveld een reeks/gebouw beschrijft (bv. "12-16", "12 t/m 16", "12,14"). */
export function isHuisnummerReeks(huisnummer: string): boolean {
  const nums = huisnummer.match(/\d+/g)
  return (nums?.length ?? 0) > 1 || /(t\/m|tot|-|–|,|\/)/i.test(huisnummer)
}

/**
 * Zoek adressen op via PDOK. Geeft genormaliseerde adressen terug (leeg = niets gevonden).
 * Prioriteit: postcode + huisnummer → straat + stad → vrije tekst.
 */
export async function zoekAdres(opts: {
  postcode?: string
  huisnummer?: string
  straat?: string
  stad?: string
  vrij?: string
  rows?: number
}): Promise<AdresResultaat[]> {
  const rows = opts.rows ?? 10
  const delen: string[] = []
  const fq: string[] = ['type:adres']

  if (opts.vrij?.trim()) {
    delen.push(opts.vrij.trim())
  } else {
    const pc = (opts.postcode ?? '').trim()
    const hn = eersteHuisnummer(opts.huisnummer ?? '')
    if (pc && hn) {
      delen.push(pc, hn)
      // Beperk tot de exacte postcode (PDOK slaat postcodes zonder spatie/uppercase op) zodat
      // een niet-bestaand huisnummer niet fuzzy naar een ander adres matcht.
      fq.push(`postcode:${pc.replace(/\s+/g, '').toUpperCase()}`)
    } else {
      if (opts.straat?.trim()) delen.push(opts.straat.trim())
      if (opts.huisnummer?.trim()) delen.push(eersteHuisnummer(opts.huisnummer))
      if (opts.stad?.trim()) delen.push(opts.stad.trim())
      if (pc) delen.push(pc)
    }
  }

  const q = delen.filter(Boolean).join(' ').trim()
  if (!q) return []

  const fqParams = fq.map((f) => `fq=${encodeURIComponent(f)}`).join('&')
  const url = `${PDOK_FREE}?q=${encodeURIComponent(q)}&${fqParams}&rows=${rows}`
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return []
    const json = (await res.json()) as { response?: { docs?: PdokDoc[] } }
    return (json.response?.docs ?? []).map(mapDoc).filter((a) => a.straat && a.stad)
  } catch {
    return []
  }
}
