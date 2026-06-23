// UOM-mapping: DICO/Ketenstandaard gebruikt veelal UN/ECE Recommendation 20-codes
// (of vrije teksten) voor eenheden. We mappen die naar de eenheden die EvertsCalc
// hanteert (zie STANDAARD_EENHEDEN in MaterialenBibliotheek).
//
// Onbekende codes worden onveranderd (lowercased, getrimd) teruggegeven zodat ze in
// de UI zichtbaar blijven en handmatig gecorrigeerd kunnen worden.

const UOM_MAP: Record<string, string> = {
  // UN/ECE codes
  mtk: 'm²', mtr: 'm¹', mtq: 'm³',
  ltr: 'ltr', kgm: 'kg',
  pce: 'st', ea: 'st', h87: 'st', // piece / each
  set: 'set', hur: 'uur', day: 'dag',
  // Vrije-tekst varianten (NL/EN)
  'm2': 'm²', 'm²': 'm²',
  'm1': 'm¹', 'm¹': 'm¹', 'meter': 'm¹', 'm': 'm¹',
  'm3': 'm³', 'm³': 'm³',
  'liter': 'ltr', 'l': 'ltr', 'lt': 'ltr',
  'kilogram': 'kg', 'kilo': 'kg',
  'stuk': 'st', 'stuks': 'st', 'st': 'st', 'piece': 'st', 'each': 'st',
  'uur': 'uur', 'hour': 'uur', 'dag': 'dag',
}

const TOEGESTAAN = new Set(['m²', 'm¹', 'st', 'ltr', 'kg', 'set', 'uur', 'dag', 'm³'])

export function mapUom(raw: string | undefined | null): string {
  if (!raw) return 'st'
  const key = String(raw).trim().toLowerCase()
  if (UOM_MAP[key]) return UOM_MAP[key]
  // Al een geldige eenheid? Behoud hem.
  const trimmed = String(raw).trim()
  if (TOEGESTAAN.has(trimmed)) return trimmed
  return key || 'st'
}
