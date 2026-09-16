/**
 * mailintake/objecten.ts
 *
 * "Hoort dit werkadres bij een object dat we al kennen?"
 *
 * WAAROM DIT LASTIGER IS DAN HET LIJKT
 * Je zou verwachten dat je op postcode + huisnummer matcht. Dat werkt voor een
 * pand, maar de meeste objecten in EVA zijn **complexen**, en die staan er met
 * een vrij-tekstadres in:
 *
 *     "Delftselaan 7 t/m 79 / De Lierstraat 12 t/m 30"
 *     "Van de Veldestraat 31-45 + 15-29, Bakhuizenstraat 280-294, Ruijsdaelstraat 79-111"
 *
 * Geen postcode, geen huisnummer — precies de VvE- en corporatieklussen waar
 * deze intake voor bedoeld is. Een match op alleen postcode+huisnummer zou dus
 * juist het belangrijkste deel missen.
 *
 * Vandaar een ladder die ook straatnamen mét nummerbereik uit dat vrije veld
 * leest. En vandaar dat er alleen automatisch gekoppeld wordt bij één eenduidige
 * treffer: bij twijfel toont het behandelscherm de kandidaten en kiest een mens.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

/** Manier waarop het object gevonden is; komt terug in het scherm. */
export type ObjectVia = 'vve_code' | 'postcode_huisnummer' | 'straat_nummer' | 'straat_klant'

export const OBJECT_VIA_LABELS: Record<ObjectVia, string> = {
  vve_code:            'de VvE-code uit de mail',
  postcode_huisnummer: 'postcode en huisnummer',
  straat_nummer:       'straat en huisnummer binnen het complex',
  straat_klant:        'de straat en de opdrachtgever',
}

export interface ObjectKandidaat {
  id: string
  naam: string
  adres: string
  score: number
  via: ObjectVia
}

export interface ObjectTreffer {
  objectId: string | null
  naam: string | null
  score: number
  via: ObjectVia | null
  /** Ook gevuld bij een treffer, zodat het scherm alternatieven kan tonen. */
  kandidaten: ObjectKandidaat[]
  toelichting: string
  /** Standaard-opdrachtgever van het gevonden object; nuttig als de afzender onbekend is. */
  standaardOpdrachtgeverId: string | null
  vveCode: string | null
}

const GEEN: ObjectTreffer = {
  objectId: null, naam: null, score: 0, via: null, kandidaten: [],
  toelichting: 'Geen bijbehorend object gevonden.',
  standaardOpdrachtgeverId: null, vveCode: null,
}

/** Vanaf hier koppelen we het object zelf; daaronder alleen tonen als kandidaat. */
export const OBJECT_ZEKER = 0.85

function normaliseerStraat(s: string): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bv\.?\s?d\.?\s/g, 'van de ')   // "V.d. Neerstraat" → "van de neerstraat"
    .replace(/\bstr\b\.?/g, 'straat')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normaliseerPostcode(pc: string | null | undefined): string | null {
  const m = (pc ?? '').replace(/\s+/g, '').toUpperCase().match(/^(\d{4})([A-Z]{2})$/)
  return m ? `${m[1]} ${m[2]}` : null
}

function huisnummerKern(hn: string | null | undefined): number | null {
  const m = (hn ?? '').match(/\d+/)
  return m ? Number(m[0]) : null
}

/**
 * Leest uit een vrij-tekstadres per straat welke huisnummers erbij horen.
 *
 * "Delftselaan 7 t/m 79 / De Lierstraat 12 t/m 30" wordt
 * `[{ straat: 'delftselaan', bereiken: [[7,79]] }, { straat: 'de lierstraat', bereiken: [[12,30]] }]`.
 *
 * Een straat zonder nummers levert een lege `bereiken` op — dan weten we wél de
 * straat maar niet welke nummers, en dat telt lichter mee.
 */
export function leesStraatBereiken(vrijAdres: string): { straat: string; bereiken: [number, number][] }[] {
  // "t/m" bevat een schuine streep, en daar splitsen we straks juist op. Zonder
  // deze regel wordt "Delftselaan 7 t/m 79" gelezen als los huisnummer 7 en valt
  // de rest van het complex buiten beeld.
  const veilig = vrijAdres.replace(/t\s*\/\s*m/gi, ' tm ')
  const stukken = veilig.split(/[\/,;]/).map(s => s.trim()).filter(Boolean)
  const uit: { straat: string; bereiken: [number, number][] }[] = []

  for (const stuk of stukken) {
    // Straatnaam = alles tot het eerste cijfer.
    const m = stuk.match(/^([^\d]+)(.*)$/)
    if (!m) continue
    const straat = normaliseerStraat(m[1])
    if (straat.length < 3) continue

    const rest = m[2]
    const bereiken: [number, number][] = []

    // "7 t/m 79", "151-173a", "44 – 58", "12 tot 30"
    const reeksen = rest.matchAll(/(\d+)\s*[a-z]?\s*(?:-|–|t\/m|tm|tot en met|tot)\s*(\d+)/gi)
    for (const r of reeksen) {
      const van = Number(r[1]); const tot = Number(r[2])
      if (Number.isFinite(van) && Number.isFinite(tot)) bereiken.push([Math.min(van, tot), Math.max(van, tot)])
    }

    // Losse nummers die niet al in een reeks zaten ("+ 159", "83a").
    const gebruikt = new Set<number>()
    for (const [a, b] of bereiken) { gebruikt.add(a); gebruikt.add(b) }
    for (const los of rest.matchAll(/\d+/g)) {
      const n = Number(los[0])
      if (!gebruikt.has(n) && bereiken.every(([a, b]) => n < a || n > b)) bereiken.push([n, n])
    }

    uit.push({ straat, bereiken })
  }

  return uit
}

/** Valt dit huisnummer binnen wat het object voor deze straat noemt? */
function paastInComplex(
  vrijAdres: string,
  straat: string,
  huisnummer: number | null,
): 'straat_en_nummer' | 'alleen_straat' | null {
  const doel = normaliseerStraat(straat)
  if (doel.length < 3) return null

  for (const deel of leesStraatBereiken(vrijAdres)) {
    // Wederzijds bevatten: "Delftselaan" ↔ "delftselaan 7 t/m 79", maar ook
    // "Vaillant" (zoals het object het noemt) ↔ "Vaillantlaan" uit de mail.
    const raak = deel.straat.includes(doel) || doel.includes(deel.straat)
    if (!raak) continue
    if (huisnummer == null || deel.bereiken.length === 0) return 'alleen_straat'
    if (deel.bereiken.some(([a, b]) => huisnummer >= a && huisnummer <= b)) return 'straat_en_nummer'
    // Straat klopt maar het nummer valt erbuiten: dat is een aanwijzing, geen treffer.
    return 'alleen_straat'
  }
  return null
}

export interface ObjectZoekInvoer {
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  stad: string | null
  vveCode: string | null
  /** De herkende opdrachtgever; maakt een zwakke straatmatch een stuk sterker. */
  relatieId: string | null
}

/**
 * Zoekt het object bij een werkadres.
 *
 * De objectenlijst is klein (tientallen) en wordt in één keer opgehaald; de
 * `limit` staat er als harde grens omdat een onbegrensde select stil op 1000
 * rijen afkapt. Groeit dit ooit naar duizenden objecten, dan moet hier een
 * voorfilter op plaats bij.
 */
export async function zoekObjectBijAdres(inv: ObjectZoekInvoer): Promise<ObjectTreffer> {
  const supabase = createAdminClient()

  const { data } = await supabase
    .from('vastgoed_objecten')
    .select('id, naam, objectnummer, soort, vve_code, adres_straat, adres_huisnummer, adres_postcode, adres_plaats, standaard_opdrachtgever_id')
    .eq('actief', true)
    .limit(500)

  const objecten = (data ?? []) as any[]
  if (!objecten.length) return GEEN

  const pc = normaliseerPostcode(inv.postcode)
  const hn = huisnummerKern(inv.huisnummer)
  const stad = normaliseerStraat(inv.stad ?? '')
  const vve = (inv.vveCode ?? '').trim().toLowerCase()

  const kandidaten: ObjectKandidaat[] = []
  const adresVan = (o: any) =>
    [o.adres_straat, o.adres_huisnummer].filter(Boolean).join(' ') +
    (o.adres_plaats ? `, ${o.adres_plaats}` : '')

  for (const o of objecten) {
    let score = 0
    let via: ObjectVia | null = null

    // ── 1. VvE-code ─────────────────────────────────────────────────────────
    // Sterkste signaal dat er is. Vandaag heeft nog geen enkel object een
    // vve_code, dus dit levert nu niets op — het staat er voor zodra die worden
    // ingevuld, en kost verder niets.
    if (vve && (o.vve_code ?? '').trim().toLowerCase() === vve) {
      score = 1; via = 'vve_code'
    }

    // ── 2. Exact adres ──────────────────────────────────────────────────────
    if (!via && pc && o.adres_postcode && normaliseerPostcode(o.adres_postcode) === pc) {
      const oHn = huisnummerKern(o.adres_huisnummer)
      if (hn != null && oHn === hn) { score = 1; via = 'postcode_huisnummer' }
      else if (oHn == null) { score = 0.7; via = 'postcode_huisnummer' }
    }

    // ── 3. Straat (met nummerbereik) in het complexadres ────────────────────
    if (!via && inv.straat && o.adres_straat) {
      const zelfdeStad = !stad || !o.adres_plaats || normaliseerStraat(o.adres_plaats).includes(stad) || stad.includes(normaliseerStraat(o.adres_plaats))
      if (zelfdeStad) {
        const raak = paastInComplex(o.adres_straat, inv.straat, hn)
        if (raak === 'straat_en_nummer') { score = 0.9; via = 'straat_nummer' }
        else if (raak === 'alleen_straat') {
          // Alleen de straat is dun. Hoort het object bij dezelfde opdrachtgever,
          // dan wordt het een serieuze kandidaat; anders blijft het een hint.
          const zelfdeKlant = inv.relatieId && o.standaard_opdrachtgever_id === inv.relatieId
          score = zelfdeKlant ? 0.7 : 0.4
          via = zelfdeKlant ? 'straat_klant' : 'straat_nummer'
        }
      }
    }

    if (score > 0 && via) {
      kandidaten.push({ id: o.id, naam: o.naam, adres: adresVan(o), score, via })
    }
  }

  if (!kandidaten.length) return GEEN
  kandidaten.sort((a, b) => b.score - a.score)

  const beste = kandidaten[0]
  const evenGoed = kandidaten.filter(k => k.score === beste.score)

  // Twee objecten die even goed passen: dan kiest een mens. Automatisch de eerste
  // pakken zou het werk aan het verkeerde complex hangen.
  if (evenGoed.length > 1) {
    return {
      ...GEEN,
      score: Math.min(beste.score, 0.5),
      kandidaten: kandidaten.slice(0, 6),
      toelichting: `${evenGoed.length} objecten passen even goed bij dit adres — kies zelf welke klopt.`,
    }
  }

  const object = objecten.find(o => o.id === beste.id)
  return {
    objectId: beste.score >= OBJECT_ZEKER ? beste.id : null,
    naam: beste.naam,
    score: beste.score,
    via: beste.via,
    kandidaten: kandidaten.slice(0, 6),
    toelichting: beste.score >= OBJECT_ZEKER
      ? `Gekoppeld aan ${beste.naam} op basis van ${OBJECT_VIA_LABELS[beste.via]}.`
      : `${beste.naam} lijkt te passen (via ${OBJECT_VIA_LABELS[beste.via]}), maar niet zeker genoeg om vast te koppelen.`,
    standaardOpdrachtgeverId: object?.standaard_opdrachtgever_id ?? null,
    vveCode: object?.vve_code ?? null,
  }
}
