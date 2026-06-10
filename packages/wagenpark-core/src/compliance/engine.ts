/**
 * Compliance engine.
 * Voert alle actieve regels uit over een periode en retourneert bevindingen.
 *
 * Persistentie gebeurt buiten deze engine (in de app-laag, zie
 * `apps/wagenpark/src/app/actions/`).
 */

import type { ComplianceBevindingInput } from '../types'
import type { ComplianceContext, RuleModule } from './types'
import { ALLE_REGELS } from './rules'

export type ComplianceRunResult = {
  bevindingen: ComplianceBevindingInput[]
  perRegel: Record<string, number>
  samenvatting: {
    totaal: number
    overtredingen: number
    waarschuwingen: number
    info: number
  }
}

export function runComplianceEngine(
  ctx: ComplianceContext,
  regels: RuleModule[] = ALLE_REGELS,
): ComplianceRunResult {
  const bevindingen: ComplianceBevindingInput[] = []
  const perRegel: Record<string, number> = {}

  for (const regel of regels) {
    const regelDef = ctx.regels.get(regel.code)
    if (regelDef && !regelDef.actief) continue

    const res = regel.runner(ctx)
    bevindingen.push(...res)
    perRegel[regel.code] = (perRegel[regel.code] ?? 0) + res.length
  }

  const samenvatting = {
    totaal: bevindingen.length,
    overtredingen: bevindingen.filter((b) => b.ernst === 'overtreding').length,
    waarschuwingen: bevindingen.filter((b) => b.ernst === 'waarschuwing').length,
    info: bevindingen.filter((b) => b.ernst === 'info').length,
  }

  return { bevindingen, perRegel, samenvatting }
}
