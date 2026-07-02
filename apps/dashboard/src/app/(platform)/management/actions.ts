'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { syncManagementProjecten } from '@/lib/bouw7/sync-management'
import { syncDaysOff } from '@/lib/bouw7/sync'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import {
  getManagementProjecten,
  getManagementAk,
  getManagementDoelstellingen,
  getFunnelData,
  getCalculatorStats,
} from '@/lib/dashboard/queries'
import { berekenManagementKpi } from '@/lib/dashboard/aggregaties'

export async function syncManagementAction(): Promise<{ nieuw: number; bijgewerkt: number; fouten: number; foutMelding?: string }> {
  // Handmatig verversen = incrementeel: gerede (financieel afgesloten) projecten overslaan,
  // zodat de knop ruim binnen de functietimeout blijft. De ochtend-cron doet de volledige sync.
  // Verlof/vrije dagen (Bouw7 days-off) meenemen zodat de Werkvoorraad-capaciteit meeloopt.
  const [result] = await Promise.all([
    syncManagementProjecten('incremental'),
    syncDaysOff().catch(() => null),
  ])
  revalidatePath('/management')
  return result
}

/* ── Maandcijfers vaststellen ─────────────────────────────────────── */

export type VaststellenResultaat = { ok: boolean; fout?: string; periode?: string }

/** Normaliseer 'YYYY-MM' of 'YYYY-MM-..' naar de eerste dag van de maand. */
function eersteVanMaand(periode: string): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(periode.trim())
  if (!m) return null
  return `${m[1]}-${m[2]}-01`
}

/**
 * Bevries de huidige cijfers (financieel + funnel + calculators) als de
 * vastgestelde maandstand. Overschrijft een bestaande vaststelling van
 * dezelfde maand.
 */
export async function stelMaandcijfersVast(
  input: { periode: string; opmerking?: string },
): Promise<VaststellenResultaat> {
  const periode = eersteVanMaand(input.periode)
  if (!periode) return { ok: false, fout: 'Ongeldige maand.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const med = await getCurrentMedewerker()
  const naam = med ? [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ') || null : null

  const [projecten, akData, doelstellingen, funnel, calculators] = await Promise.all([
    getManagementProjecten(),
    getManagementAk(),
    getManagementDoelstellingen(),
    getFunnelData(),
    getCalculatorStats(),
  ])

  const kpi = berekenManagementKpi(projecten, akData, doelstellingen)

  // Overschrijven: bestaande snapshot (+ regels via cascade) verwijderen.
  await supabase.from('management_maand_snapshot').delete().eq('periode', periode)

  const { data: parent, error: parentFout } = await supabase
    .from('management_maand_snapshot')
    .insert({
      periode,
      kpi,
      funnel,
      calculators,
      vastgesteld_door_id:   med?.id ?? null,
      vastgesteld_door_naam: naam,
      opmerking:             input.opmerking?.trim() || null,
      vastgesteld_op:        new Date().toISOString(),
    })
    .select('id')
    .single()

  if (parentFout || !parent) return { ok: false, fout: parentFout?.message ?? 'Vastleggen mislukt.' }

  const regels = projecten.map(p => ({
    snapshot_id:        parent.id,
    projectnummer:      p.projectnummer,
    bouw7_id:           p.bouw7_id,
    filiaal:            p.filiaal,
    status:             p.status,
    opdrachtgever:      p.opdrachtgever,
    projectnaam:        p.projectnaam,
    categorie:          p.categorie,
    projectleider:      p.projectleider,
    geboekte_kosten:    p.geboekte_kosten,
    totale_opdracht:    p.totale_opdracht,
    pct_gereed:         p.pct_gereed,
    totale_prognose:    p.totale_prognose,
    verwacht_resultaat: p.verwacht_resultaat,
    pct_marge:          p.pct_marge,
    omzet_obv_pct:      p.omzet_obv_pct,
    resultaat_obv_pct:  p.resultaat_obv_pct,
    gefactureerd:       p.gefactureerd,
    resultaat_gereed:   p.resultaat_gereed,
    pct_marge_gereed:   p.pct_marge_gereed,
    verschil_pct_marge: p.verschil_pct_marge,
    is_gereed:          p.is_gereed,
    kosten_split:       p.kosten_split,
    dossier_id:         p.dossier_id,
    dossier_sectie:     p.dossier_sectie,
  }))

  if (regels.length > 0) {
    // Batchgewijs invoegen (ruim onder de payload-limiet).
    for (let i = 0; i < regels.length; i += 500) {
      const { error } = await supabase
        .from('management_maand_snapshot_regel')
        .insert(regels.slice(i, i + 500))
      if (error) return { ok: false, fout: error.message }
    }
  }

  revalidatePath('/management')
  return { ok: true, periode }
}
