// App-instellingen (uurtarief, eenheden, reparatietypes) hebben nog geen DB-tabel.
// Deze worden voorlopig per apparaat in localStorage bewaard. Zodra hier een
// Supabase-tabel voor is, kan dit bestand vervangen worden door services.

const KEYS = {
  uurtarief: 'eve_uurtarief',
  eenheden: 'eve_eenheden',
  reparatietypes: 'eve_reparatietypes',
}

export interface ReparatieType {
  id: string
  naam: string
  kleur: string
}

const DEFAULT_EENHEDEN = ['st', 'm1', 'm2', 'm3', 'uur', 'dag']
const DEFAULT_UURTARIEF = 65

export function getUurtarief(): number {
  if (typeof window === 'undefined') return DEFAULT_UURTARIEF
  const raw = localStorage.getItem(KEYS.uurtarief)
  return raw ? parseFloat(raw) : DEFAULT_UURTARIEF
}

export function saveUurtarief(tarief: number): void {
  localStorage.setItem(KEYS.uurtarief, String(tarief))
}

export function getEenheden(): string[] {
  if (typeof window === 'undefined') return DEFAULT_EENHEDEN
  try {
    const raw = localStorage.getItem(KEYS.eenheden)
    return raw ? JSON.parse(raw) : DEFAULT_EENHEDEN
  } catch { return DEFAULT_EENHEDEN }
}

export function saveEenheden(eenheden: string[]): void {
  localStorage.setItem(KEYS.eenheden, JSON.stringify(eenheden))
}

export function getReparatieTypes(): ReparatieType[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEYS.reparatietypes)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveReparatieTypes(types: ReparatieType[]): void {
  localStorage.setItem(KEYS.reparatietypes, JSON.stringify(types))
}
