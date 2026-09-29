import 'server-only'

import { createAdminClient } from '@everts/database/server'
import { getDossierBewaking } from './actions'
import { getOpdrachtOverzicht } from './opdracht-onderdelen'
import { getServicedeskRegie } from './servicedesk'
import { getFactureerbareCodes } from './facturatie-codes'
import {
  berekenResultaatPerCode, type CodeKosten, type MeerwerkInvoer, type ResultaatPerCode,
} from './resultaat-per-code'

/** Zelfde terugval als de regie-berekening, als er in de bedrijfsinstellingen niets staat. */
const REGIE_OPSLAG_STANDAARD = 25

async function standaardOpslagPct(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await supabase.from('bedrijfsinstellingen').select('overige').eq('id', 1).maybeSingle()
  const v = (data?.overige as Record<string, unknown> | null)?.regie_opslag_pct
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN
  return Number.isFinite(n) && n >= 0 ? n : REGIE_OPSLAG_STANDAARD
}

/**
 * Verwacht resultaat per bewakingscode voor het Financieel-tab. Haalt de verkoopkant (stelposten,
 * meerwerk, regie, aanneemsom) en de kostenkant (Bouw7-bewaking) op; het rekenwerk zit in
 * `berekenResultaatPerCode`.
 *
 * `verbergCorrecties`: zoals op de bewakingstabel — zonder het recht blijft CO01 buiten de kosten.
 */
export async function getResultaatPerCode(
  dossierId: string,
  opties?: { verbergCorrecties?: boolean },
): Promise<ResultaatPerCode & { beschikbaar: boolean }> {
  const supabase = createAdminClient()

  const [bewaking, overzicht, factureerbaar, meerwerkRes, standaardOpslag] = await Promise.all([
    getDossierBewaking(dossierId, { verbergCorrecties: opties?.verbergCorrecties }),
    getOpdrachtOverzicht(dossierId).catch(() => null),
    getFactureerbareCodes(dossierId).catch(() => []),
    supabase
      .from('meerwerk_regels')
      .select('bewakingscode, omschrijving, status, afrekenwijze, is_stelpost, stelpost_grondslag, bedrag_excl_btw, eenheidsprijs, hoeveelheid_werkelijk, mandaat_excl_btw, opdracht_onderdeel_id, kosten_bewakingscode')
      .eq('dossier_id', dossierId),
    standaardOpslagPct(supabase),
  ])

  // Kosten per code, opgeteld over de hoofdstukken: dezelfde code kan onder meerdere staan.
  const codes = new Map<string, CodeKosten>()
  for (const h of bewaking.hoofdstukken) {
    for (const r of h.regels) {
      if (!r.code) continue
      const c = codes.get(r.code) ?? { code: r.code, naam: r.naam, prognose: 0, geboekt: 0, begroot: 0, meerwerk: 0 }
      c.prognose += r.prognose
      c.geboekt += r.geboekteKosten
      c.begroot = (c.begroot ?? 0) + r.begroot
      c.meerwerk = (c.meerwerk ?? 0) + r.meerwerk
      codes.set(r.code, c)
    }
  }

  const stelposten = overzicht?.stelposten ?? []

  // Geboekte verkoopwaarde per code — één regie-berekening voor alle codes, met de afwijkende
  // opslag van stelposten die er een hebben (zelfde regel als de stelpostverrekening).
  const opslagPerCode: Record<string, number> = {}
  for (const s of stelposten) {
    if (s.grondslag === 'geboekte_kosten' && s.bewakingscode && s.opslag_pct != null) {
      opslagPerCode[s.bewakingscode] = s.opslag_pct
    }
  }
  const verkoopPerCode = new Map<string, number>()
  const inkoopPerCode = new Map<string, number>()
  const regie = await getServicedeskRegie(dossierId, { opslagPerCode }).catch(() => null)
  for (const r of regie?.regels ?? []) {
    if (r.uitgesloten || !r.bewakingscode) continue
    verkoopPerCode.set(r.bewakingscode, (verkoopPerCode.get(r.bewakingscode) ?? 0) + (r.verkoopBedrag || 0))
    inkoopPerCode.set(r.bewakingscode, (inkoopPerCode.get(r.bewakingscode) ?? 0) + (r.inkoopBedrag || 0))
  }

  const uitkomst = berekenResultaatPerCode({
    codes: [...codes.values()],
    stelposten,
    meerwerk: (meerwerkRes.data ?? []) as MeerwerkInvoer[],
    regieCode: factureerbaar.find(f => f.bron === 'regie')?.bewakingscode ?? null,
    verkoopPerCode,
    inkoopPerCode,
    aanneemsomBasis: overzicht?.basis ?? null,
    standaardOpslagPct: standaardOpslag,
  })
  return { ...uitkomst, beschikbaar: bewaking.beschikbaar }
}
