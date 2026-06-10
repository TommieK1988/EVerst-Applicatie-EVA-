/**
 * RDW Open Data client.
 *
 * Gebruikt de publieke open-data-endpoints van de RDW:
 *   - Voertuigen:       https://opendata.rdw.nl/resource/m9d7-ebf2.json
 *   - Brandstof-info:   https://opendata.rdw.nl/resource/8ys7-d773.json
 *
 * Geen auth vereist. Rate-limit: ruim, maar respecteer met caching
 * via `public.rdw_data.laatst_opgehaald`.
 */

import { normalizeKenteken } from '../utils/distance'

const RDW_VOERTUIG_URL = 'https://opendata.rdw.nl/resource/m9d7-ebf2.json'
const RDW_BRANDSTOF_URL = 'https://opendata.rdw.nl/resource/8ys7-d773.json'
// Dataset met open terugroepacties per kenteken
const RDW_TERUGROEP_URL = 'https://opendata.rdw.nl/resource/af6n-ihbm.json'

export type RdwVoertuigResponse = {
  kenteken: string
  voertuigsoort?: string
  merk?: string
  handelsbenaming?: string
  vervaldatum_apk?: string
  datum_tenaamstelling?: string
  vervaldatum_tenaamstelling?: string
  eerste_kleur?: string     // bv. "GRIJS", soms "N.v.t." of "Niet geregistreerd"
  tweede_kleur?: string
  inrichting?: string       // carrosserietype: "stationwagen", "gesloten opbouw", ...
  aantal_zitplaatsen?: string
  massa_ledig_voertuig?: string
  massa_rijklaar?: string
  toegestane_maximum_massa_voertuig?: string
  aantal_cilinders?: string
  cilinderinhoud?: string
  milieuklasse_eg_goedkeuring_licht?: string
  datum_eerste_toelating?: string
  datum_eerste_tenaamstelling_in_nederland?: string
  wam_verzekerd?: string
  wacht_op_keuren?: string // 'Ja' / 'Nee'
  // Trekgewicht (aanhangwagen-capaciteit)
  maximum_trekken_massa_geremd?: string     // "trekken geremd" op kentekenbewijs
  maximum_massa_trekken_ongeremd?: string   // O.2 op kentekenbewijs
  // Catalogusprijs (indien beschikbaar)
  catalogusprijs?: string
  [key: string]: unknown
}

export type RdwTerugroepResponse = {
  kenteken: string
  referentiecode_rdw?: string
  omschrijving?: string
  [key: string]: unknown
}

export type RdwBrandstofResponse = {
  kenteken: string
  brandstof_omschrijving?: string
  brandstof_volgnummer?: string
  emissiecode_omschrijving?: string
  co2_uitstoot_gecombineerd?: string
  [key: string]: unknown
}

export type RdwLookupResult = {
  kenteken: string
  voertuig: RdwVoertuigResponse | null
  brandstof: RdwBrandstofResponse[]
  terugroep: RdwTerugroepResponse[]
  opgehaald_op: string
}

/**
 * Haalt voertuig- en brandstofgegevens op bij de RDW.
 * Gooit een Error als het netwerk faalt. Retourneert `voertuig: null`
 * als het kenteken onbekend is.
 */
export async function fetchRdwVoertuig(
  kenteken: string,
): Promise<RdwLookupResult> {
  const normalized = normalizeKenteken(kenteken)
  if (!normalized) {
    throw new Error('Kenteken is leeg')
  }
  // RDW Open Data verwacht kentekens ZONDER streepjes ("VN188P", niet "VN-188-P").
  const voorRdw = normalized.replace(/-/g, '')

  const voertuigUrl = `${RDW_VOERTUIG_URL}?kenteken=${encodeURIComponent(voorRdw)}`
  const brandstofUrl = `${RDW_BRANDSTOF_URL}?kenteken=${encodeURIComponent(voorRdw)}`
  const terugroepUrl = `${RDW_TERUGROEP_URL}?kenteken=${encodeURIComponent(voorRdw)}`

  const [voertuigRes, brandstofRes, terugroepRes] = await Promise.all([
    fetch(voertuigUrl, { headers: { Accept: 'application/json' } }),
    fetch(brandstofUrl, { headers: { Accept: 'application/json' } }),
    fetch(terugroepUrl, { headers: { Accept: 'application/json' } }),
  ])

  if (!voertuigRes.ok) {
    throw new Error(`RDW voertuig-call faalde: ${voertuigRes.status}`)
  }

  const voertuigJson = (await voertuigRes.json()) as RdwVoertuigResponse[]
  const brandstofJson = brandstofRes.ok
    ? ((await brandstofRes.json()) as RdwBrandstofResponse[])
    : []
  const terugroepJson = terugroepRes.ok
    ? ((await terugroepRes.json()) as RdwTerugroepResponse[])
    : []

  return {
    kenteken: normalized,
    voertuig: voertuigJson[0] ?? null,
    brandstof: brandstofJson,
    terugroep: terugroepJson,
    opgehaald_op: new Date().toISOString(),
  }
}

/** Vertaalt RDW-waarden naar onze brandstof-enum. */
export function mapRdwBrandstof(
  omschrijving: string | undefined | null,
): 'diesel' | 'benzine' | 'elektrisch' | 'hybride' | 'lpg' | 'waterstof' | 'onbekend' {
  if (!omschrijving) return 'onbekend'
  const lower = omschrijving.toLowerCase()
  if (lower.includes('elektr')) return 'elektrisch'
  if (lower.includes('diesel')) return 'diesel'
  if (lower.includes('benzine')) return 'benzine'
  if (lower.includes('hybride')) return 'hybride'
  if (lower.includes('lpg')) return 'lpg'
  if (lower.includes('waterstof') || lower.includes('hydrogen')) return 'waterstof'
  return 'onbekend'
}

/**
 * Bepaalt de effectieve brandstof-enum voor een voertuig met ÉÉN of MEER
 * brandstof-rijen. Voorbeeld: [Elektriciteit, Benzine] → 'hybride'.
 */
export function samengesteldeBrandstof(
  rijen: RdwBrandstofResponse[],
): 'diesel' | 'benzine' | 'elektrisch' | 'hybride' | 'lpg' | 'waterstof' | 'onbekend' {
  if (rijen.length === 0) return 'onbekend'
  const enums = rijen
    .map((r) => mapRdwBrandstof(r.brandstof_omschrijving))
    .filter((e) => e !== 'onbekend')
  if (enums.length === 0) return 'onbekend'
  const uniek = Array.from(new Set(enums))
  if (uniek.length === 1) return uniek[0]
  // Combineer: elektrisch + fossiel = hybride
  if (uniek.includes('elektrisch') && (uniek.includes('benzine') || uniek.includes('diesel') || uniek.includes('lpg'))) {
    return 'hybride'
  }
  // Meer dan één fossiele brandstof = hybride (zeldzaam)
  return 'hybride'
}

/**
 * Leesbare omschrijving van ALLE brandstoffen (voor display).
 * [Elektriciteit, Benzine] → "Elektriciteit + Benzine (hybride)"
 */
export function brandstofOmschrijvingCombi(rijen: RdwBrandstofResponse[]): string | null {
  const namen = rijen.map((r) => r.brandstof_omschrijving).filter((n): n is string => !!n)
  if (namen.length === 0) return null
  if (namen.length === 1) return namen[0]
  return `${namen.join(' + ')} (hybride)`
}

/**
 * Gecombineerde emissieklasse: voor hybride pakt de "beste" code + toont ook de rest.
 * [Z, 6] → "Z (elektrisch) + 6 (benzine)"
 * [6]     → "6"
 */
export function emissieklasseCombi(
  rijen: RdwBrandstofResponse[],
  fallbackMilieuklasse: string | null | undefined,
): string | null {
  const codes = rijen
    .map((r) => {
      const code = r.emissiecode_omschrijving
      if (!code) return null
      const brand = r.brandstof_omschrijving?.toLowerCase() ?? ''
      return { code, brand }
    })
    .filter((x): x is { code: string; brand: string } => !!x)
  if (codes.length === 0) return fallbackMilieuklasse ?? null
  if (codes.length === 1) return codes[0].code
  return codes.map((c) => `${c.code} (${c.brand})`).join(' + ')
}

/** Converteer een RDW-datum "DD-MM-YYYY" of "YYYYMMDD" naar ISO "YYYY-MM-DD". */
export function parseRdwDate(value: string | undefined | null): string | null {
  if (!value) return null
  const v = value.trim()
  // Formaat "YYYYMMDD"
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`
  }
  // Formaat "DD-MM-YYYY"
  const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (m) return `${m[3]}-${m[2]}-${m[1]}`
  // Formaat "YYYY-MM-DD" (al goed)
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10)
  return null
}

/** Parseer een RDW numeriek veld (string) naar number of null. */
export function parseRdwNumber(value: string | undefined | null): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
