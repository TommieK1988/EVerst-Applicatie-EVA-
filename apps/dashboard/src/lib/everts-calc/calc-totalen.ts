/* ─── calculatietotalen ───────────────────────────────────────────────
   Berekent verkoop/kostprijs/BTW direct uit de calculatie — voor dossiers waar
   (nog) geen offerte in Supabase is gegenereerd, bijv. meteen na een .c4y-import.

   Rekent over een calculatie-snapshot uit Supabase (`laadCalculatieSnapshot`), niet
   over localStorage: anders zag je op het ene apparaat wél totalen en op het andere
   niets. Zuivere functie, dus ook server-side bruikbaar. */
import {
  berekenScenarioVP, berekenScenarioKostprijs, berekenBtwBreakdown, berekenCalculatieregel,
  scenarioDefaultOpslag,
} from '@/lib/everts-calc/calculations'
import type { Groep, Scenario, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

/** Volledige calculatie van één project (vorm van `laadCalculatieSnapshot`). */
export type CalculatieBron = {
  scenarios: Scenario[]
  groepen: Groep[]
  regels: Calculatieregel[]
  componenten: Componentregel[]
}

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
 * Totalen van één calculatie (scenario) uit een snapshot. Zonder `scenarioId`
 * wordt het standaard/eerste scenario van het project gebruikt.
 */
export function berekenCalcTotalen(bron: CalculatieBron | null, scenarioId?: string): CalcTotalen | null {
  if (!bron) return null
  const scenario = scenarioId
    ? bron.scenarios.find(s => s.id === scenarioId)
    : (bron.scenarios.find(s => s.is_standaard) ?? bron.scenarios[0])
  if (!scenario) return null

  // Zelfde afbakening als de local-store-getters: groepen op scenario, regels op
  // die groepen, componenten op die regels.
  const groepen = bron.groepen.filter(g => g.scenario_id === scenario.id)
  const groepIds = new Set(groepen.map(g => g.id))
  const regels = bron.regels.filter(r => groepIds.has(r.groep_id))
  if (regels.length === 0) return null
  const regelIds = new Set(regels.map(r => r.id))
  const componenten = bron.componenten.filter(c => regelIds.has(c.calculatieregel_id))

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

  const defaultOpslag = scenarioDefaultOpslag(scenario)
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
