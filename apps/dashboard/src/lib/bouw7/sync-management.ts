import { createAdminClient } from '@everts/database/server'
import {
  getBouw7Client,
  fetchAllPages,
  logSync,
  type SyncResult,
} from './sync'
import type { Bouw7Project, Bouw7ProjectFinancial } from './client'

/**
 * Veilige nummer-conversie — de Athena-API retourneert bedragen soms als string.
 * (Zelfde gedrag als toNum() in FinancieelTab.tsx.)
 */
function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** null als beide noemers 0 zijn, anders het percentage. */
function pct(teller: number, noemer: number): number | null {
  if (!noemer) return null
  return (teller / noemer) * 100
}

function volledigeNaam(p?: { firstName?: string; lastName?: string } | null): string | null {
  if (!p) return null
  const naam = [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
  return naam || null
}

/** Som van de gerealiseerde kosten over alle kostensoorten. */
function somKosten(
  costs: Bouw7ProjectFinancial['costs'] | undefined,
  veld: 'budgeted' | 'prognosis' | 'realised',
): number {
  if (!costs) return 0
  let totaal = 0
  for (const soort of Object.values(costs)) {
    if (soort) totaal += toNum(soort[veld])
  }
  return totaal
}

/** Gerealiseerde kosten uitgesplitst per kostensoort (voor de Kostensoort-pie). */
function kostenSplit(costs: Bouw7ProjectFinancial['costs'] | undefined): Record<string, number> | null {
  if (!costs) return null
  return {
    lonen:          toNum(costs.labor?.realised),
    onderaanneming: toNum(costs.subcontracting?.realised),
    materiaal:      toNum(costs.material?.realised),
    materieel:      toNum(costs.equipment?.realised),
    inkoop:         toNum(costs.purchaseOrder?.realised),
    overig:         toNum(costs.other?.realised),
  }
}

type ManagementProjectRow = Record<string, unknown>

function mapProject(p: Bouw7Project, fin: Bouw7ProjectFinancial | undefined, nu: string): ManagementProjectRow {
  const projectnummer = p.projectNumber ?? p.fullProjectNumber ?? p.projectCode ?? String(p.id)
  const isGereed = p.status?.closesProject === true

  // ── Verkoop / omzet ──
  const totaleOpdracht  = fin ? toNum(fin.revenue?.budgeted)  : null
  const totalePrognose  = fin ? toNum(fin.revenue?.prognosis) : null
  const gefactureerd    = fin ? toNum(fin.revenue?.realised)  : null

  // ── Kosten ──
  const geboekteKosten  = fin ? somKosten(fin.costs, 'realised')  : null
  const kostenPrognose  = fin ? somKosten(fin.costs, 'prognosis') : 0

  // ── Resultaat ──
  const verwachtResultaat = fin
    ? (fin.result?.prognosis != null ? toNum(fin.result.prognosis) : toNum(fin.result?.budgeted))
    : null
  const resultaatGereed = fin ? toNum(fin.result?.realised) : null

  // ── Afgeleide percentages ──
  const pctMarge  = totaleOpdracht != null && verwachtResultaat != null ? pct(verwachtResultaat, totaleOpdracht) : null
  const pctGereed = geboekteKosten != null ? pct(geboekteKosten, kostenPrognose) : null

  const omzetObvPct     = totaleOpdracht  != null && pctGereed != null ? totaleOpdracht  * (pctGereed / 100) : null
  const resultaatObvPct = verwachtResultaat != null && pctGereed != null ? verwachtResultaat * (pctGereed / 100) : null

  const pctMargeGereed   = gefactureerd != null && resultaatGereed != null ? pct(resultaatGereed, gefactureerd) : null
  const verschilPctMarge = pctMargeGereed != null && pctMarge != null ? pctMargeGereed - pctMarge : null

  return {
    projectnummer,
    bouw7_id:           String(p.id),
    filiaal:            p.branch?.name ?? null,
    status:             p.status?.name ?? null,
    opdrachtgever:      p.contact?.name ?? null,
    projectnaam:        p.name,
    categorie:          p.category?.name ?? null,
    projectleider:      volledigeNaam(p.projectLeader),

    geboekte_kosten:    geboekteKosten,
    totale_opdracht:    totaleOpdracht,
    pct_gereed:         pctGereed,
    totale_prognose:    totalePrognose,
    verwacht_resultaat: verwachtResultaat,
    pct_marge:          pctMarge,
    omzet_obv_pct:      omzetObvPct,
    resultaat_obv_pct:  resultaatObvPct,

    gefactureerd:       gefactureerd,
    resultaat_gereed:   resultaatGereed,
    pct_marge_gereed:   pctMargeGereed,
    verschil_pct_marge: verschilPctMarge,

    is_gereed:          isGereed,
    kosten_split:       kostenSplit(fin?.costs),

    bouw7_laatst_sync:  nu,
    bouw7_sync_status:  'synced',
    bouw7_sync_fout:    null,
    updated_at:         nu,
  }
}

/**
 * Sync alle Bouw7-projecten met financiële data naar `management_projecten`.
 * Voor het Management Dashboard (KPI's, pivots per werkmaatschappij/projectleider,
 * Lopende/Gereed Werken-tabellen).
 */
export async function syncManagementProjecten(): Promise<SyncResult> {
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0 }

  try {
    const bouw7 = await getBouw7Client()
    const projects = await fetchAllPages<Bouw7Project>(bouw7, '/list/projects')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // Bestaande bouw7_id's ophalen om nieuw vs. bijgewerkt te tellen.
    const { data: bestaandeData } = await supabase
      .from('management_projecten')
      .select('bouw7_id')
      .not('bouw7_id', 'is', null)
    const bestaand = new Set<string>((bestaandeData ?? []).map((r: { bouw7_id: string }) => r.bouw7_id))

    // Athena project-financial parallel ophalen (batch van 10), net als syncProjects().
    const financialMap = new Map<string, Bouw7ProjectFinancial>()
    const ATHENA_BATCH = 10
    for (let i = 0; i < projects.length; i += ATHENA_BATCH) {
      const batch = projects.slice(i, i + ATHENA_BATCH)
      const results = await Promise.allSettled(
        batch.map(p => bouw7.getAthena<Bouw7ProjectFinancial>(`/project-financial/${p.id}`)),
      )
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
          financialMap.set(String(batch[j].id), r.value)
        }
      }
    }

    const nu = new Date().toISOString()
    const rows: ManagementProjectRow[] = projects.map(p =>
      mapProject(p, financialMap.get(String(p.id)), nu),
    )

    for (const row of rows) {
      if (bestaand.has(row.bouw7_id as string)) result.bijgewerkt++
      else result.nieuw++
    }

    // Upsert in batches van 500 (unique constraint op bouw7_id).
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await supabase
        .from('management_projecten')
        .upsert(rows.slice(i, i + 500), { onConflict: 'bouw7_id' })
      if (error) {
        result.fouten++
        result.foutMelding = error.message
      }
    }
  } catch (e: unknown) {
    result.fouten++
    result.foutMelding = e instanceof Error ? e.message : String(e)
  }

  await logSync('management_projecten', 'in', result, Date.now() - start)
  return result
}
