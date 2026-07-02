import { createAdminClient } from '@everts/database/server'
import {
  getBouw7Client,
  fetchAllPages,
  logSync,
  type SyncResult,
  type SyncMode,
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

/**
 * Voer `fn` uit over alle `items` met maximaal `limit` gelijktijdig in-flight.
 * Anders dan batch-and-wait blijft de pijplijn continu gevuld: er wordt niet per ronde
 * gewacht op de traagste call van een batch, wat bij ~2400 Athena-calls het verschil
 * maakt tussen ruim binnen en over de 300s-functietimeout. Piek-concurrency = `limit`;
 * resultaten in dezelfde volgorde als `items`.
 */
async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker(): Promise<void> {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()))
  return results
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
 * Haalt (alleen de benodigde) project-control chapters op en leidt af:
 *  - `rollup` → % gereed = prognose-gewogen rollup van de bewakingscode-standopnames
 *    (Σ progress×prognose / Σ prognose over alle (code × kostensoort), alle 6 kostensoorten).
 *    Zelfde berekening als getDossierBewaking.projectProgress. Alleen nodig voor projecten in
 *    HANDMATIG-modus; voor automatische/afgeronde projecten pakken we Bouw7's eigen rollup uit
 *    de bulk `/wip/report` (bewezen identiek), wat 6 calls/project bespaart.
 *  - `hours` → arbeidsuren (prognose + geboekt) = Σ hourInfo.prognosisHours / .costHours over de
 *    bewakingscodes (én de uncoded chapter) op kostensoort 1. Alleen nodig voor lopende projecten
 *    (werkvoorraad). Geen bulk-endpoint beschikbaar, dus 1 call kostensoort-1 per lopend project.
 *
 * Kostensoorten die worden opgehaald: `rollup` ? alle 6 : (`hours` ? alleen 1 : geen).
 */
async function berekenProjectControl(
  bouw7: Awaited<ReturnType<typeof getBouw7Client>>,
  bouw7Id: string,
  opts: { rollup: boolean; hours: boolean },
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

  const costTypes = opts.rollup ? [1, 2, 3, 4, 5, 6] : opts.hours ? [1] : []
  if (costTypes.length === 0) {
    return { progress: null, arbeidPrognoseUren: null, arbeidGeboekteUren: null }
  }
  const resps = await Promise.all(
    costTypes.map(ct =>
      bouw7
        .getAthena<Chapters>(`/project-control/${bouw7Id}/cost-type/${ct}/chapters?include_subprojects=false`)
        .catch(() => null),
    ),
  )

  // % gereed — prognose-gewogen over álle kostensoorten (securityCodes). Alleen bij handmatig-modus.
  let progress: number | null = null
  if (opts.rollup) {
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
    progress = gew > 0 ? Math.round((som / gew) * 100) / 100 : null
  }

  // Arbeidsuren — alléén kostensoort 1 (altijd resps[0] als opgehaald), incl. uncoded chapter.
  let pUren = 0
  let gUren = 0
  let heeftUren = false
  const arbeid = costTypes[0] === 1 ? resps[0] : null
  if (opts.hours && arbeid) {
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
    progress,
    arbeidPrognoseUren: heeftUren ? pUren : null,
    arbeidGeboekteUren: heeftUren ? gUren : null,
  }
}

/**
 * Sync alle Bouw7-projecten met financiële data naar `management_projecten`.
 * Voor het Management Dashboard (KPI's, pivots per werkmaatschappij/projectleider,
 * Lopende/Gereed Werken-tabellen).
 *
 * `mode`:
 *  - `full` (ochtend-cron): álle doel-projecten opnieuw ophalen — drift-correctie,
 *    pikt ook heropende projecten weer op.
 *  - `incremental` (middag-cron + handmatige knop): reeds-gerede projecten (financieel
 *    afgesloten in Bouw7) overslaan. Hun cijfers wijzigen niet meer, dus we behouden de
 *    bestaande rij en besparen ~6 Athena-calls per gereed project. Halveert de calls.
 */
export async function syncManagementProjecten(mode: SyncMode = 'full'): Promise<SyncResult> {
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

    // Bestaande bouw7_id's + gereed-vlag ophalen: nieuw vs. bijgewerkt tellen, stale prunen,
    // en (bij incremental) de reeds-gerede projecten overslaan.
    const { data: bestaandeData } = await supabase
      .from('management_projecten')
      .select('bouw7_id, is_gereed')
      .not('bouw7_id', 'is', null)
    const bestaandeRijen = (bestaandeData ?? []) as { bouw7_id: string; is_gereed: boolean | null }[]
    const bestaand = new Set<string>(bestaandeRijen.map(r => r.bouw7_id))
    const gereedIds = new Set<string>(bestaandeRijen.filter(r => r.is_gereed).map(r => r.bouw7_id))

    const targetIds = doelDossiers.map(d => d.bouw7_id)
    // Incrementeel: gerede projecten niet opnieuw ophalen (bestaande rij blijft staan).
    // De volledige ochtend-sync corrigeert drift en pikt eventuele heropende projecten weer op.
    const verwerkIds = mode === 'incremental'
      ? targetIds.filter(id => !gereedIds.has(id))
      : targetIds
    const verwerkSet = new Set(verwerkIds)

    // 1) Athena project-financial per project (max 10 gelijktijdig) → bedragen.
    const financialMap = new Map<string, Bouw7ProjectFinancial>()
    const finResults = await mapPool(verwerkIds, 10, id =>
      bouw7.getAthena<Bouw7ProjectFinancial>(`/project-financial/${id}`).catch(() => null),
    )
    verwerkIds.forEach((id, i) => {
      const v = finResults[i]
      if (v && typeof v === 'object') financialMap.set(id, v)
    })

    // 2) Bulk `/wip/report` (1 call, álle projecten): Bouw7's eigen prognose-gewogen % gereed
    //    (`progress`) + de progressmodus (`progressType`). Voor AUTOMATISCHE (type 2) en AFGERONDE
    //    (type 4, altijd 100%) projecten is `progress` bewezen identiek aan onze eigen rollup —
    //    die nemen we dus rechtstreeks over (scheelt 6 calls/project). Voor HANDMATIG-modus (type 1)
    //    is `progress` de handmatig ingevoerde project-% (die willen we NIET) → daar berekenen we de
    //    bewakingscode-rollup alsnog zelf.
    type WipRow = { progress: number | null; progressType: number | null }
    const wipMap = new Map<string, WipRow>()
    try {
      const wip = await bouw7.getAthena<{
        items?: { project?: { id?: number | string }; progress?: number | string | null; progressType?: number | null }[]
      }>('/wip/report')
      for (const it of wip.items ?? []) {
        const id = it.project?.id
        if (id != null) {
          wipMap.set(String(id), {
            progress: it.progress == null ? null : toNum(it.progress),
            progressType: it.progressType ?? null,
          })
        }
      }
    } catch { /* wip optioneel: bij uitval valt % gereed terug op de kostenratio in mapProject */ }

    // 3) Project-control alleen waar nodig: rollup uitsluitend bij handmatig-modus, arbeidsuren
    //    (kostensoort 1) uitsluitend voor lopende projecten (werkvoorraad). Projecten die geen van
    //    beide nodig hebben (afgerond & niet-handmatig) doen 0 control-calls.
    const controlWork = verwerkIds.map(id => {
      const wipRow = wipMap.get(id)
      const p = projectMap.get(id)
      return {
        id,
        handmatig: wipRow?.progressType === 1,
        lopend: p ? !isGereedVanStatus(p) : true,
        wipProgress: wipRow?.progress ?? null,
      }
    })
    const controlMap = new Map<string, ProjectControlData>()
    const ctrlResults = await mapPool(controlWork, 6, w =>
      w.handmatig || w.lopend
        ? berekenProjectControl(bouw7, w.id, { rollup: w.handmatig, hours: w.lopend }).catch(() => null)
        : Promise.resolve(null),
    )
    controlWork.forEach((w, i) => {
      const ctrl = ctrlResults[i]
      // % gereed: handmatig → eigen bewakingscode-rollup (null → kostenratio in mapProject);
      // automatisch/afgerond → Bouw7's rollup uit /wip/report. Nooit de handmatige project-%.
      controlMap.set(w.id, {
        progress: w.handmatig ? (ctrl?.progress ?? null) : w.wipProgress,
        arbeidPrognoseUren: ctrl?.arbeidPrognoseUren ?? null,
        arbeidGeboekteUren: ctrl?.arbeidGeboekteUren ?? null,
      })
    })

    const nu = new Date().toISOString()
    const rows: ManagementProjectRow[] = doelDossiers.flatMap(d => {
      if (!verwerkSet.has(d.bouw7_id)) return []  // gereed & incrementeel → bestaande rij behouden
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

    // Prune: rijen die niet meer in de doel-set (opdracht/servicedesk mét bestaand Bouw7-project)
    // zitten. NB: gebaseerd op de volledige doel-set, niet op `rows` — anders zouden de bij
    // incremental bewust overgeslagen gerede projecten als stale worden verwijderd.
    const behoud = new Set<string>(
      doelDossiers.filter(d => projectMap.has(d.bouw7_id)).map(d => d.bouw7_id),
    )
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
