/* ─── client-side calculatietotalen ───────────────────────────────────
   Berekent verkoop/kostprijs/BTW direct uit de calculatie (localStorage) —
   voor dossiers waar (nog) geen offerte in Supabase is gegenereerd, bijv.
   meteen na een .c4y-import. Alleen client-side aanroepen (in een effect):
   de local-store leest uit localStorage. Gedeeld door InformatieTab en
   OpdrachtCalculatieTab. */
import {
  getScenarios, getGroepen,
  getCalculatieregelsVoorScenario, getComponentregelsVoorScenario,
} from '@/lib/everts-calc/local-store'
import {
  berekenScenarioVP, berekenScenarioKostprijs, berekenBtwBreakdown, berekenCalculatieregel,
} from '@/lib/everts-calc/calculations'
import type { Groep } from '@/lib/everts-calc/types'

export type CalcTotalen = {
  subtotaal_ex_btw: number
  kostprijs: number
  stelposten_subtotaal: number
  opties_subtotaal: number
  btw_bedrag: number
  totaal_incl_btw: number
  marge_euro: number
  marge_pct: number
  btw_groepen: { pct: number; btw: number }[]
}

/**
 * Totalen van één calculatie (scenario). Zonder `scenarioId` wordt het
 * standaard/eerste scenario van het project gebruikt (backward compatible).
 */
export function berekenCalcTotalenVoorProject(projectId: string, scenarioId?: string): CalcTotalen | null {
  const scenarios = getScenarios(projectId)
  const scenario = scenarioId
    ? scenarios.find(s => s.id === scenarioId)
    : (scenarios.find(s => s.is_standaard) ?? scenarios[0])
  if (!scenario) return null

  const groepen = getGroepen(scenario.id)
  const regels = getCalculatieregelsVoorScenario(scenario.id)
  if (regels.length === 0) return null
  const componenten = getComponentregelsVoorScenario(scenario.id)

  // Optionele groepen (en hun nakomelingen) uitsluiten — zoals in CalculatieGrid.
  const optioneelIds = new Set(
    groepen.filter(g => {
      let cur: Groep | undefined = g
      while (cur) {
        if (cur.optioneel) return true
        cur = groepen.find(p => p.id === cur!.parent_id)
      }
      return false
    }).map(g => g.id),
  )
  const nietOptioneel = groepen.filter(g => !optioneelIds.has(g.id))
  const nietOptioneelIds = new Set(nietOptioneel.map(g => g.id))

  const defaultOpslag = scenario.opslag_algemene_kosten + scenario.opslag_winst_risico
  const btwDefault = scenario.btw_pct_default ?? 21

  const subtotaal_ex_btw = berekenScenarioVP(nietOptioneel, regels, componenten, defaultOpslag)
  const kostprijs = berekenScenarioKostprijs(nietOptioneel, regels, componenten)
  const btwGroepen = berekenBtwBreakdown(
    regels.filter(r => nietOptioneelIds.has(r.groep_id)), componenten, defaultOpslag, btwDefault,
  )
  const btw_bedrag = btwGroepen.reduce((s, g) => s + g.btw, 0)

  const vpVan = (r: (typeof regels)[number]) =>
    berekenCalculatieregel(r, componenten, r.opslag_pct ?? defaultOpslag).vp_totaal
  const stelposten_subtotaal = regels
    .filter(r => nietOptioneelIds.has(r.groep_id) && r.is_stelpost)
    .reduce((s, r) => s + vpVan(r), 0)
  const opties_subtotaal = regels
    .filter(r => optioneelIds.has(r.groep_id))
    .reduce((s, r) => s + vpVan(r), 0)

  const marge_euro = subtotaal_ex_btw - kostprijs
  const marge_pct = subtotaal_ex_btw > 0 ? (marge_euro / subtotaal_ex_btw) * 100 : 0

  return {
    subtotaal_ex_btw, kostprijs, stelposten_subtotaal, opties_subtotaal,
    btw_bedrag, totaal_incl_btw: subtotaal_ex_btw + btw_bedrag,
    marge_euro, marge_pct,
    btw_groepen: btwGroepen.map(g => ({ pct: g.pct, btw: g.btw })),
  }
}
