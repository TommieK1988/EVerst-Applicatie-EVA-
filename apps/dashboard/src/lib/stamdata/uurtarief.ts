// Uurtarief-hiërarchie — één bron van waarheid voor "welk tarief geldt hier?".
//
// Voorrang (hoog → laag):
//   1. medewerker        — medewerkers.uurtarief_{verkoop,kostprijs} (uit Bouw7)
//   2. werkmaatschappij  — uursoort_tarief_overrides (per werkmij × uursoort)
//   3. uursoort-default  — planning_uursoorten.tarief_{verkoop,kostprijs}
//   4. globaal default   — bedrijfsinstellingen.uurtarieven (favoriet); alleen verkoop
//
// De meest specifieke laag met een ingevuld (niet-null) tarief wint. Kostprijs kent geen
// globale default — daar stopt de keten bij de uursoort-laag.

import { createAdminClient } from '@everts/database/server'
import type { Uurtarief } from '@everts/database/platform-types'

export type UurtariefSoort = 'verkoop' | 'kostprijs'
export type UurtariefBron = 'medewerker' | 'werkmaatschappij' | 'uursoort' | 'globaal' | 'geen'
export type UurtariefResultaat = { tarief: number | null; bron: UurtariefBron }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

const getal = (v: unknown): number | null => {
  if (v == null) return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

/**
 * Bepaal het geldende uurtarief voor een combinatie van medewerker/uursoort/werkmaatschappij.
 * Geeft het tarief én de laag waaruit het komt (handig om in de UI te tonen waaróm).
 */
export async function resolveUurtarief(opts: {
  medewerkerId?: string | null
  uursoortId?: string | null
  werkmaatschappijId?: string | null
  soort: UurtariefSoort
}): Promise<UurtariefResultaat> {
  const { medewerkerId, uursoortId, werkmaatschappijId, soort } = opts
  const supabase = db()
  const kol = soort === 'verkoop' ? 'tarief_verkoop' : 'tarief_kostprijs'

  // 1. Medewerker.
  if (medewerkerId) {
    const { data } = await supabase
      .from('medewerkers')
      .select('uurtarief_verkoop, uurtarief_kostprijs')
      .eq('id', medewerkerId)
      .maybeSingle()
    const t = getal(data?.[soort === 'verkoop' ? 'uurtarief_verkoop' : 'uurtarief_kostprijs'])
    if (t != null) return { tarief: t, bron: 'medewerker' }
  }

  // 2. Werkmaatschappij-override per uursoort.
  if (werkmaatschappijId && uursoortId) {
    const { data } = await supabase
      .from('uursoort_tarief_overrides')
      .select('tarief_verkoop, tarief_kostprijs')
      .eq('werkmaatschappij_id', werkmaatschappijId)
      .eq('uursoort_id', uursoortId)
      .maybeSingle()
    const t = getal(data?.[kol])
    if (t != null) return { tarief: t, bron: 'werkmaatschappij' }
  }

  // 3. Uursoort-default.
  if (uursoortId) {
    const { data } = await supabase
      .from('planning_uursoorten')
      .select('tarief_verkoop, tarief_kostprijs')
      .eq('id', uursoortId)
      .maybeSingle()
    const t = getal(data?.[kol])
    if (t != null) return { tarief: t, bron: 'uursoort' }
  }

  // 4. Globaal default — favoriete uurtarief uit bedrijfsinstellingen (alleen verkoop).
  if (soort === 'verkoop') {
    const { data } = await supabase
      .from('bedrijfsinstellingen')
      .select('uurtarieven')
      .eq('id', 1)
      .maybeSingle()
    const lijst = (data?.uurtarieven ?? []) as Uurtarief[]
    const favoriet = lijst.find(u => u.is_favoriet) ?? lijst[0]
    const t = getal(favoriet?.tarief)
    if (t != null) return { tarief: t, bron: 'globaal' }
  }

  return { tarief: null, bron: 'geen' }
}
