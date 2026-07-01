import { createAdminClient } from '@everts/database/server'
import {
  getBouw7Client,
  fetchAllPages,
  logSync,
  type SyncResult,
} from './sync'
import type { Bouw7Project, Bouw7ProjectFinancial } from './client'

/** De 6 echte kostensoorten op de Athena `costs`. NB: de API levert daarnaast soms een
 *  roll-up/total-key — die mag NIET meegeteld worden (anders verdubbelt de som). */
const KOSTENSOORTEN = ['labor', 'material', 'equipment', 'subcontracting', 'purchaseOrder', 'other'] as const

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

/** Som van de kosten over de 6 echte kostensoorten (excl. eventuele total-key uit de API). */
function somKosten(
  costs: Bouw7ProjectFinancial['costs'] | undefined,
  veld: 'budgeted' | 'prognosis' | 'realised',
): number {
  if (!costs) return 0
  let totaal = 0
  for (const k of KOSTENSOORTEN) {
    totaal += toNum(costs[k]?.[veld])
  }
  return totaal
}

/** is_gereed o.b.v. de (verse) Bouw7-projectstatus: 06. Financieel gereed / 07. Financieel afgesloten. */
function isGereedVanStatus(p: Bouw7Project): boolean {
  const naam = p.status?.name ?? ''
  return /^0[67]\./.test(naam) || p.status?.closesProject === true
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

/** Koppeling naar het EVA-dossier (bron van waarheid voor de sectie/tab). */
type DossierKoppeling = {
  id: string
  sectie: 'opdrachten' | 'servicedesk'
}

function mapProject(
  p: Bouw7Project,
  fin: Bouw7ProjectFinancial | undefined,
  control: ProjectControlData | null,
  dossier: DossierKoppeling,
  nu: string,
): ManagementProjectRow {
  const progress = control?.progress ?? null
  const projectnummer = p.fullProjectNumber ?? p.projectCode ?? p.projectNumber ?? String(p.id)

  // ── Verkoop / omzet ──
  // Totale opdracht = aanneemsom incl. meerwerk = omzetprognose.
  const totaleOpdracht  = fin ? toNum(fin.revenue?.prognosis) : null
  const gefactureerd    = fin ? toNum(fin.revenue?.realised)  : null

  // ── Kosten ──
  const geboekteKosten  = fin ? somKosten(fin.costs, 'realised')  : null
  // Prognose-kolom = prognose-KOSTEN (Σ van de 6 kostensoorten).
  const kostenPrognose  = fin ? somKosten(fin.costs, 'prognosis') : null
  const totalePrognose  = kostenPrognose

  // ── Resultaat ──
  const verwachtResultaat = fin
    ? (fin.result?.prognosis != null ? toNum(fin.result.prognosis) : toNum(fin.result?.budgeted))
    : null
  const resultaatGereed = fin ? toNum(fin.result?.realised) : null

  // ── Afgeleide percentages ──
  // Lopende "% marge" = begrote marge o.b.v. opdracht (excl. BTW) en prognose-kosten.
  const pctMarge = totaleOpdracht != null ? pct(totaleOpdracht - (kostenPrognose ?? 0), totaleOpdracht) : null
  // % gereed = zélf berekende bewakingscode-rollup (berekenProjectControl); val terug op kostenratio (geboekte/prognose).
  const pctGereed = progress != null
    ? progress
    : (geboekteKosten != null ? pct(geboekteKosten, kostenPrognose ?? 0) : null)

  const omzetObvPct     = totaleOpdracht  != null && pctGereed != null ? totaleOpdracht  * (pctGereed / 100) : null
  const resultaatObvPct = verwachtResultaat != null && pctGereed != null ? verwachtResultaat * (pctGereed / 100) : null

  // Gereed "% marge" = gerealiseerde marge o.b.v. opbrengsten en geboekte kosten.
  const pctMargeGereed = gefactureerd != null ? pct(gefactureerd - (geboekteKosten ?? 0), gefactureerd) : null

  // Δ marge alleen als er écht een begroting is: begrote én prognose-kosten > 0.
  const kostenBegroot    = fin ? somKosten(fin.costs, 'budgeted') : null
  const heeftBegroting   = (kostenBegroot ?? 0) > 0 && (kostenPrognose ?? 0) > 0
  const verschilPctMarge = heeftBegroting && pctMargeGereed != null && pctMarge != null ? pctMargeGereed - pctMarge : null

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

    is_gereed:          isGereedVanStatus(p),
    dossier_id:         dossier.id,
    dossier_sectie:     dossier.sectie,
    kosten_split:       kostenSplit(fin?.costs),

    arbeid_prognose_uren: control?.arbeidPrognoseUren ?? null,
    arbeid_geboekte_uren: control?.arbeidGeboekteUren ?? null,

    bouw7_laatst_sync:  nu,
    bouw7_sync_status:  'synced',
    bouw7_sync_fout:    null,
    updated_at:         nu,
  }
}

type ProjectControlData = {
  /** Prognose-gewogen % gereed (rollup over alle code×kostensoort). */
  progress: number | null
  /** Prognose arbeidsuren (kostensoort 1, Σ over bewakingscodes). Null als geen arbeid-data. */
  arbeidPrognoseUren: number | null
  /** Geboekte arbeidsuren (kostensoort 1, Σ over bewakingscodes). Null als geen arbeid-data. */
  arbeidGeboekteUren: number | null
}

/**
 * Haalt de project-control chapters op (alle 6 kostensoorten) en leidt in één keer af:
 *  - % gereed = prognose-gewogen rollup van de bewakingscode-standopnames
 *    (Σ progress×prognose / Σ prognose over alle (code × kostensoort)). Zelfde berekening
 *    als getDossierBewaking.projectProgress. Null als er geen prognose is.
 *  - arbeidsuren (prognose + geboekt) = Σ van hourInfo.prognosisHours / .costHours over de
 *    bewakingscodes (én de uncoded chapter) op kostensoort 1 (Arbeid). Zie getDossierBewaking.
 */
async function berekenProjectControl(
  bouw7: Awaited<ReturnType<typeof getBouw7Client>>,
  bouw7Id: string,
): Promise<ProjectControlData> {
  type HourInfo = { prognosisHours?: number | string | null; costHours?: number | string | null }
  type Entry = {
    progress?: number | string | null
    prognosisAmount?: number | string | null
    hourInfo?: HourInfo | null
    name?: string | null
    id?: number | null
  }
  type Chapters = { items?: { chapterInfo?: Entry | null; securityCodes?: Entry[] }[] }
  const resps = await Promise.all(
    [1, 2, 3, 4, 5, 6].map(ct =>
      bouw7
        .getAthena<Chapters>(`/project-control/${bouw7Id}/cost-type/${ct}/chapters?include_subprojects=false`)
        .catch(() => null),
    ),
  )

  // % gereed — prognose-gewogen over álle kostensoorten (securityCodes).
  let som = 0
  let gew = 0
  for (const resp of resps) {
    if (!resp) continue
    for (const item of resp.items ?? []) {
      for (const sc of item.securityCodes ?? []) {
        if (sc.progress == null) continue
        const w = toNum(sc.prognosisAmount)
        if (w > 0) { som += toNum(sc.progress) * w; gew += w }
      }
    }
  }

  // Arbeidsuren — alléén kostensoort 1 (resps[0]), incl. uncoded chapter.
  let pUren = 0
  let gUren = 0
  let heeftUren = false
  const arbeid = resps[0]
  if (arbeid) {
    const tel = (e?: Entry | null) => {
      if (!e?.hourInfo) return
      pUren += toNum(e.hourInfo.prognosisHours)
      gUren += toNum(e.hourInfo.costHours)
      heeftUren = true
    }
    for (const item of arbeid.items ?? []) {
      const ci = item.chapterInfo
      if (ci && (ci.name === 'uncoded_costs' || ci.id === 0)) tel(ci)
      for (const sc of item.securityCodes ?? []) tel(sc)
    }
  }

  return {
    progress: gew > 0 ? Math.round((som / gew) * 100) / 100 : null,
    arbeidPrognoseUren: heeftUren ? pUren : null,
    arbeidGeboekteUren: heeftUren ? gUren : null,
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

    const targetIds = doelDossiers.map(d => d.bouw7_id)

    // 1) Athena project-financial per project (batch van 10) → bedragen.
    const financialMap = new Map<string, Bouw7ProjectFinancial>()
    const FIN_BATCH = 10
    for (let i = 0; i < targetIds.length; i += FIN_BATCH) {
      const batch = targetIds.slice(i, i + FIN_BATCH)
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

    // 2) % gereed (project) = zélf berekende prognose-gewogen rollup van de bewakingscode-standopnames
    //    (Σ progress×prognose / Σ prognose over alle (code × kostensoort), uit de project-control chapters).
    //    NB: NIET /wip/report — dat geeft 0 bij projecten in "Handmatig"-modus, ook al staan de standopnames
    //    per code wél in Bouw7. En NIET total/cost-types.totals.progress (= SOM per kostensoort). Zelfde
    //    berekening als getDossierBewaking.projectProgress op het Financieel-tab. 6 calls/project (batched).
    const controlMap = new Map<string, ProjectControlData>()
    const ROLLUP_BATCH = 6
    for (let i = 0; i < targetIds.length; i += ROLLUP_BATCH) {
      const batch = targetIds.slice(i, i + ROLLUP_BATCH)
      const results = await Promise.allSettled(batch.map(id => berekenProjectControl(bouw7, id)))
      for (let j = 0; j < batch.length; j++) {
        const r = results[j]
        if (r.status === 'fulfilled' && r.value != null) controlMap.set(batch[j], r.value)
      }
    }

    const nu = new Date().toISOString()
    const rows: ManagementProjectRow[] = doelDossiers.flatMap(d => {
      const p = projectMap.get(d.bouw7_id)
      if (!p) return []  // geen Bouw7-project → niets om te tonen
      const sectie: 'opdrachten' | 'servicedesk' = d.servicedesk_substatus ? 'servicedesk' : 'opdrachten'
      const control = controlMap.get(d.bouw7_id) ?? null
      return [mapProject(p, financialMap.get(d.bouw7_id), control, { id: d.id, sectie }, nu)]
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
