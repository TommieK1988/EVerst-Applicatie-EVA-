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

/** Koppeling naar het EVA-dossier (bron van waarheid voor sectie + gereed-status). */
type DossierKoppeling = {
  id: string
  sectie: 'opdrachten' | 'servicedesk'
  isGereed: boolean
}

function mapProject(
  p: Bouw7Project,
  fin: Bouw7ProjectFinancial | undefined,
  dossier: DossierKoppeling,
  nu: string,
): ManagementProjectRow {
  const projectnummer = p.projectNumber ?? p.fullProjectNumber ?? p.projectCode ?? String(p.id)

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

    is_gereed:          dossier.isGereed,
    dossier_id:         dossier.id,
    dossier_sectie:     dossier.sectie,
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
    const projectMap = new Map<string, Bouw7Project>(projects.map(p => [String(p.id), p]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // Bron van waarheid: alleen EVA-dossiers in fase 'opdracht' of 'servicedesk'.
    type DossierRow = {
      id: string
      bouw7_id: string
      hoofdstatus: string
      opdracht_substatus: string | null
      servicedesk_substatus: string | null
    }
    const { data: dossierData } = await supabase
      .from('dossiers')
      .select('id, bouw7_id, hoofdstatus, opdracht_substatus, servicedesk_substatus')
      .not('bouw7_id', 'is', null)
    const doelDossiers: DossierRow[] = (dossierData ?? []).filter((d: DossierRow) =>
      d.servicedesk_substatus != null || d.hoofdstatus === 'opdracht',
    )

    // Bestaande bouw7_id's ophalen om nieuw vs. bijgewerkt te tellen en stale te prunen.
    const { data: bestaandeData } = await supabase
      .from('management_projecten')
      .select('bouw7_id')
      .not('bouw7_id', 'is', null)
    const bestaand = new Set<string>((bestaandeData ?? []).map((r: { bouw7_id: string }) => r.bouw7_id))

    // Athena project-financial parallel ophalen (batch van 10), alleen voor de doel-dossiers.
    const financialMap = new Map<string, Bouw7ProjectFinancial>()
    const targetIds = doelDossiers.map(d => d.bouw7_id)
    const ATHENA_BATCH = 10
    for (let i = 0; i < targetIds.length; i += ATHENA_BATCH) {
      const batch = targetIds.slice(i, i + ATHENA_BATCH)
      const results = await Promise.allSettled(
        batch.map(id => bouw7.getAthena<Bouw7ProjectFinancial>(`/project-financial/${id}`)),
      )
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value && typeof r.value === 'object') {
          financialMap.set(batch[j], r.value)
        }
      }
    }

    const nu = new Date().toISOString()
    const rows: ManagementProjectRow[] = doelDossiers.flatMap(d => {
      const p = projectMap.get(d.bouw7_id)
      if (!p) return []  // geen Bouw7-project → niets om te tonen
      const sectie: 'opdrachten' | 'servicedesk' = d.servicedesk_substatus ? 'servicedesk' : 'opdrachten'
      // "Financieel gereed" (en afgesloten) horen bij Gereed Werken.
      const isGereed = d.servicedesk_substatus
        ? d.servicedesk_substatus === 'financieel_gereed'
        : (d.opdracht_substatus === 'financieel_gereed' || d.opdracht_substatus === 'financieel_afgesloten')
      return [mapProject(p, financialMap.get(d.bouw7_id), { id: d.id, sectie, isGereed }, nu)]
    })

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

    // Prune: rijen die niet meer in de doel-set (opdracht/servicedesk) zitten, verwijderen.
    const behoud = new Set<string>(rows.map(r => r.bouw7_id as string))
    const stale = [...bestaand].filter(id => !behoud.has(id))
    for (let i = 0; i < stale.length; i += 500) {
      await supabase.from('management_projecten').delete().in('bouw7_id', stale.slice(i, i + 500))
    }
  } catch (e: unknown) {
    result.fouten++
    result.foutMelding = e instanceof Error ? e.message : String(e)
  }

  await logSync('management_projecten', 'in', result, Date.now() - start)
  return result
}
