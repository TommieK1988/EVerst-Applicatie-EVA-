import { XMLParser } from 'fast-xml-parser'
import type { Materiaal } from '@/lib/everts-calc/types'
import { mapUom } from './uom'

// ─────────────────────────────────────────────────────────────────────────────
// DICO / Ketenstandaard artikel-parser.
//
// DICO (voorheen S@les in de Bouw) kent meerdere XML-varianten voor artikel-/
// catalogusdata (DICO-Artikel, SALES905, 2BA/ETIM-export). De veld- en tagnamen
// verschillen per variant en per leverancier. Deze parser is daarom bewust
// *tolerant*: hij zoekt de repeterende artikel-elementen in de XML-boom en mapt
// velden op een lijst herkende tagnamen (namespace- en hoofdletterongevoelig).
//
// → Lever een concreet voorbeeldbestand aan om de mapping exact te bevestigen;
//   nieuwe tagnamen voeg je simpelweg toe aan de KANDIDATEN hieronder.
// ─────────────────────────────────────────────────────────────────────────────

const KANDIDATEN = {
  // SALES005-tags eerst, daarna generieke varianten.
  artikelnummer: ['supplierstradeitemid', 'suppliertradeitemid', 'tradeitemid',
    'artikelnummer', 'artikelnr', 'supplierarticlenumber', 'articlenumber',
    'itemnumber', 'manufacturerarticlenumber', 'productcode', 'code', 'artnr'],
  omschrijving: ['tradeitemdescription', 'description', 'omschrijving', 'artikelomschrijving',
    'korteomschrijving', 'description1', 'productname', 'name', 'artikelnaam'],
  gtin: ['gtin', 'ean', 'eancode', 'barcode', 'gtincode'],
  // Prijsbasis-eenheid heeft voorrang: GrossPrice hoort bij de PriceBasisUoM.
  eenheid: ['pricebasisuom', 'useunituom', 'orderuom', 'eenheid', 'prijseenheid',
    'verkoopeenheid', 'besteleenheid', 'unit', 'uom', 'measureunit', 'quantityunit', 'orderunit'],
  prijs: ['grossprice', 'brutoprijs', 'nettoprijs', 'verkoopprijs', 'kostprijs', 'prijs',
    'netprice', 'listprice', 'unitprice', 'price'],
  leverancier: ['leverancier', 'leveranciersnaam', 'suppliername', 'supplier'],
  leverancier_gln: ['leveranciersgln', 'suppliergln', 'gln'],
  // Merk/fabrikant van het artikel (los van de leverancier). Niet elke leverancier
  // levert dit; bij afwezigheid blijft merk leeg.
  merk: ['merk', 'brand', 'brandname', 'fabrikant', 'fabrikantnaam', 'manufacturer',
    'manufacturername', 'tradeitembrandname', 'productbrand'],
  etim_klasse: ['etimklasse', 'etimclass', 'etimclasscode', 'classificationcode', 'etim'],
  // Ruwe leveranciers-productgroep (DICO BuyingGroup); koppeling naar eigen
  // materiaalgroep gebeurt later via dico_groep_mapping.
  leverancier_productgroep: ['buyinggroup', 'productgroep', 'assortimentsgroep', 'productgroup',
    'groep', 'group', 'category', 'categorie', 'hoofdgroep'],
} as const

type Veld = keyof typeof KANDIDATEN

// Laatste segment van een (mogelijk namespaced) tagnaam, lowercased: "ns:GTIN" → "gtin".
function normaliseerKey(k: string): string {
  const zonderNs = k.includes(':') ? k.split(':').pop()! : k
  return zonderNs.toLowerCase().replace(/[^a-z0-9]/g, '')
}

// Verzamelt alle scalaire bladwaarden van een object, gekeyed op de genormaliseerde
// tagnaam. Bij dubbele tags wint de eerste niet-lege waarde.
function platteScalars(obj: Record<string, unknown>, acc: Record<string, string> = {}): Record<string, string> {
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue
    if (typeof v === 'object') {
      if (Array.isArray(v)) {
        for (const el of v) {
          if (el && typeof el === 'object') platteScalars(el as Record<string, unknown>, acc)
        }
      } else {
        platteScalars(v as Record<string, unknown>, acc)
      }
      continue
    }
    const key = normaliseerKey(k)
    const val = String(v).trim()
    if (val && !acc[key]) acc[key] = val
  }
  return acc
}

function kies(scalars: Record<string, string>, veld: Veld): string | undefined {
  for (const kandidaat of KANDIDATEN[veld]) {
    const v = scalars[normaliseerKey(kandidaat)]
    if (v) return v
  }
  return undefined
}

function parsePrijs(raw: string | undefined): number {
  if (!raw) return 0
  // Verwijder valutasymbolen/spaties; normaliseer komma- vs. punt-decimaal.
  let s = raw.replace(/[^\d.,-]/g, '')
  if (s.includes(',') && s.includes('.')) {
    // "1.234,56" → "1234.56"
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n
}

// Zoekt in de geparste boom de grootste array van objecten die op artikelen lijken
// (bevatten een omschrijving- óf artikelnummer-achtige tag).
function vindArtikelArray(node: unknown, beste: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    const objecten = node.filter(x => x && typeof x === 'object') as Record<string, unknown>[]
    if (objecten.length) {
      const lijktArtikel = objecten.some(o => {
        const s = platteScalars(o)
        return !!(kies(s, 'omschrijving') || kies(s, 'artikelnummer') || kies(s, 'gtin'))
      })
      if (lijktArtikel && objecten.length >= beste.length) beste = objecten
    }
    for (const el of node) beste = vindArtikelArray(el, beste)
    return beste
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node as Record<string, unknown>)) beste = vindArtikelArray(v, beste)
  }
  return beste
}

// GTIN is in SALES005 vaak een placeholder van enkel nullen wanneer er geen barcode is.
// Zulke waarden mogen niet als matchsleutel dienen (anders vallen alle nul-GTIN-artikelen
// op één regel samen).
function geldigeGtin(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  const s = raw.trim()
  if (!s || /^0+$/.test(s)) return undefined
  return s
}

// Zoekt het eerste object onder een tag waarvan de genormaliseerde naam `keyNaam` is.
function vindOnderKey(node: unknown, keyNaam: string): Record<string, unknown> | null {
  if (Array.isArray(node)) {
    for (const el of node) { const r = vindOnderKey(el, keyNaam); if (r) return r }
    return null
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (normaliseerKey(k) === keyNaam && v && typeof v === 'object' && !Array.isArray(v)) {
        return v as Record<string, unknown>
      }
      const r = vindOnderKey(v, keyNaam)
      if (r) return r
    }
  }
  return null
}

export type DicoParseResultaat = {
  items: Partial<Materiaal>[]
  gevonden: number
}

/**
 * Parseert een DICO/Ketenstandaard artikel-XML naar (nog niet opgeslagen) materialen.
 * `standaardLeverancier` wordt gebruikt voor regels zonder eigen leverancier (bv.
 * afgeleid uit de integratie-config of bestandsnaam).
 */
export function parseDicoArtikelen(xml: string, standaardLeverancier?: string): DicoParseResultaat {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseTagValue: false,
    trimValues: true,
  })
  const boom = parser.parse(xml)

  // Leverancier staat in SALES005 op header-niveau (Grouping > Supplier), niet per regel.
  const supplierNode = vindOnderKey(boom, 'supplier')
  const supplierScalars = supplierNode ? platteScalars(supplierNode) : {}
  const headerLeverancier = standaardLeverancier
    || kies(supplierScalars, 'leverancier')
    || supplierScalars[normaliseerKey('name')]
  const headerGln = supplierScalars[normaliseerKey('gln')]

  let records = vindArtikelArray(boom)
  // Eén enkel artikel (geen array): pak het wortelobject zelf.
  if (!records.length && boom && typeof boom === 'object') {
    const s = platteScalars(boom as Record<string, unknown>)
    if (kies(s, 'omschrijving') || kies(s, 'artikelnummer')) {
      records = [boom as Record<string, unknown>]
    }
  }

  const items: Partial<Materiaal>[] = []
  for (const rec of records) {
    const s = platteScalars(rec)
    const omschrijving = kies(s, 'omschrijving')
    const artikelnummer = kies(s, 'artikelnummer')
    const gtin = geldigeGtin(kies(s, 'gtin'))
    // Sla lege/ongeldige records over.
    if (!omschrijving && !artikelnummer && !gtin) continue

    items.push({
      omschrijving: omschrijving ?? artikelnummer ?? gtin ?? '',
      artikelnummer,
      gtin,
      leverancier: kies(s, 'leverancier') ?? headerLeverancier,
      leverancier_gln: kies(s, 'leverancier_gln') ?? headerGln,
      merk: kies(s, 'merk'),
      // Ruwe leveranciers-productgroep; eigen materiaalgroep wordt bij import via
      // de koppeltabel gezet, niet hier.
      leverancier_productgroep: kies(s, 'leverancier_productgroep'),
      etim_klasse: kies(s, 'etim_klasse'),
      eenheid: mapUom(kies(s, 'eenheid')),
      kostprijs: parsePrijs(kies(s, 'prijs')),
      status: 'actief',
    })
  }

  return { items, gevonden: records.length }
}
