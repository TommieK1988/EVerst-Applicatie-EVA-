/**
 * Stabiele fingerprint-helper voor incrementele Bouw7-sync.
 *
 * Per gesynchroniseerde entiteit slaan we een hash op van precies die brongegevens die de EVA-rij
 * (en de noodzaak tot dure detail-calls) bepalen. Bij een volgende sync vergelijken we de nieuwe
 * fingerprint met de opgeslagen `bouw7_sync_hash`: is die gelijk, dan slaan we het record volledig
 * over (geen detail-fetch, geen upsert, geen trigger-churn).
 *
 * De hash hoeft niet cryptografisch sterk te zijn — alleen stabiel en botsingsarm. FNV-1a (32-bit)
 * over een deterministische JSON-serialisatie volstaat en heeft geen Node-crypto nodig (werkt dus
 * ook in edge-runtimes).
 */

/** Deterministische JSON: object-keys gesorteerd, zodat veldvolgorde de hash niet beïnvloedt. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj).sort()
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`
}

/** FNV-1a 32-bit hash → hex-string. */
function fnv1a(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // 32-bit FNV-prime vermenigvuldiging via shifts (blijft binnen veilige integers)
    h = Math.imul(h, 0x01000193)
  }
  // Naar unsigned 32-bit en hex
  return (h >>> 0).toString(16).padStart(8, '0')
}

/**
 * Bereken een stabiele fingerprint van willekeurige brongegevens.
 * Gelijke inhoud → gelijke hash, ongeacht object-veldvolgorde.
 */
export function fingerprint(parts: unknown): string {
  return fnv1a(stableStringify(parts))
}
