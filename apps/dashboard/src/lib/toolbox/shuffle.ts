/**
 * Deterministisch schudden van vragen en antwoordopties per deelnemer.
 *
 * Doel: twee collega's die dezelfde toolbox naast elkaar doen, zien de vragen
 * en de ABCD-opties in een andere volgorde, zodat afkijken niet werkt. Omdat
 * alles van een opgeslagen `shuffle_seed` afhangt (kolom op de toewijzing),
 * is de getoonde volgorde altijd exact te reproduceren voor de audit.
 *
 * Pure functies — geen Math.random, geen Date. Antwoorden worden elders altijd
 * op het ORIGINELE optie-id gelogd, dus de audit blijft eenduidig ongeacht
 * schudvolgorde.
 */

/** Kleine, snelle PRNG (mulberry32). Geeft floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Stabiele 32-bits hash van een string (FNV-1a-achtig). */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Fisher-Yates op een kopie van `items`, gestuurd door `seed`. Zelfde seed +
 * zelfde items ⇒ zelfde volgorde.
 */
export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const rng = mulberry32(seed >>> 0)
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Optievolgorde per vraag: combineer de toewijzing-seed met de vraag-id, zodat
 * niet elke vraag dezelfde permutatie krijgt maar het geheel toch reproduceerbaar
 * uit één seed volgt.
 */
export function seedVoorVraag(seed: number, vraagId: string): number {
  return (seed ^ hashString(vraagId)) >>> 0
}

/** Genereer een nieuwe seed voor een toewijzing. Alleen server-side aanroepen. */
export function nieuweSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}
