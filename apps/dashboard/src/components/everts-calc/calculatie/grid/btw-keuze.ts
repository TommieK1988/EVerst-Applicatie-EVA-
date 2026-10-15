import type { Calculatieregel } from '@/lib/everts-calc/types'
import { heffingsPercentage, type BtwTariefKeuze } from '@/lib/stamdata/btw'

/**
 * Wat er op een regel wordt vastgelegd als je een BTW-tarief kiest: het te heffen
 * percentage plus het tarief zelf. Ook een verlegd tarief heft hier zijn nominale
 * percentage — zie de toelichting in lib/stamdata/btw.ts.
 */
export function kiesBtwTarief(tarieven: BtwTariefKeuze[], tariefId: string): Partial<Calculatieregel> {
  const t = tarieven.find(x => x.id === tariefId)
  if (!t) return { btw_tarief_id: undefined, btw_pct: undefined }
  return { btw_tarief_id: t.id, btw_pct: heffingsPercentage(t) }
}
