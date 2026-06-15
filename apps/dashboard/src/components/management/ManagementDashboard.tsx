'use client'

import React, { useState, useMemo, useTransition } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import Link from 'next/link'
import { syncManagementAction } from '@/app/(platform)/management/actions'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS, chartColor } from '@/components/ui/chart'
import { Briefcase, TrendingUp, BarChart3 } from 'lucide-react'
import { cn } from '@everts/ui'
import type { GebruikerLayout } from '@everts/database/platform-types'
import ManagementProjectenTabel from './ManagementProjectenTabel'

/* ── Types ───────────────────────────────────────────────────────── */

export type ManagementProject = {
  id: string
  projectnummer: string
  bouw7_id: string | null
  filiaal: string | null
  status: string | null
  opdrachtgever: string | null
  projectnaam: string
  categorie: string | null
  projectleider: string | null
  geboekte_kosten: number | null
  totale_opdracht: number | null
  pct_gereed: number | null
  totale_prognose: number | null
  verwacht_resultaat: number | null
  pct_marge: number | null
  omzet_obv_pct: number | null
  resultaat_obv_pct: number | null
  gefactureerd: number | null
  resultaat_gereed: number | null
  pct_marge_gereed: number | null
  verschil_pct_marge: number | null
  is_gereed: boolean
  kosten_split: Record<string, number> | null
  dossier_id: string | null
  dossier_sectie: string | null
  bouw7_laatst_sync: string | null
}

export type ManagementAK = {
  id: string
  jaar: number
  filiaal: string
  bedrag_ak: number
  opmerkingen: string | null
}

export type ManagementDoelstelling = {
  id: string
  jaar: number
  filiaal: string | null
  projectleider: string | null
  omzet_doelstelling: number | null
  resultaat_doelstelling: number | null
}

type ManagementLayouts = {
  lopend: GebruikerLayout[]
  gereed: GebruikerLayout[]
  servicedesk: GebruikerLayout[]
}

type Props = {
  projecten: ManagementProject[]
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  laatstGesynchroniseerd: string | null
  user_id: string | null
  layouts: ManagementLayouts
}

type View = 'dashboard' | 'lopend' | 'gereed' | 'servicedesk'

/* ── Chart-kleuren (DS palet, voor Recharts) ─────────────────────── */

const C_GROEN  = CHART_COLORS[0]  // #009439
const C_BLAUW  = CHART_COLORS[3]  // #2e90fa
const C_ORANJE = CHART_COLORS[4]  // #f08000
const PIE_KLEUREN = CHART_COLORS

const FILIAAL_KORT: Record<string, string> = {
  'Bouwbedrijf Morgenstond B.V.': 'BBM',
  'Everts Onderhoudsschilders B.V.': 'EOS',
  'Dakdekkersbedrijf Dakplan B.V.': 'DP',
}

function kortFiliaal(filiaal: string | null | undefined): string {
  if (!filiaal) return '?'
  return FILIAAL_KORT[filiaal] ?? filiaal.slice(0, 6)
}

/** Korte PL-naam voor grafiekassen: voornaam + 1e letter achternaam. */
function kortNaam(naam: string | null | undefined): string {
  if (!naam) return 'Onbekend'
  const delen = naam.trim().split(/\s+/)
  if (delen.length === 1) return delen[0]
  return `${delen[0]} ${delen[delen.length - 1][0]}.`
}

/* ── Formatters ──────────────────────────────────────────────────── */

const eurFmt = new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function fEur(v: number | null | undefined): string {
  if (v == null) return '—'
  return eurFmt.format(v)
}

function fEurK(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `€${(v / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `€${Math.round(v / 1_000)}K`
  return eurFmt.format(v)
}

function fPct(v: number | null | undefined): string {
  if (v == null) return '—'
  return `${v.toFixed(1)}%`
}

function fDatum(iso: string | null): string {
  if (!iso) return 'Nooit'
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/* ── Tone helpers ────────────────────────────────────────────────── */

type Tone = 'success' | 'warning' | 'error' | 'brand' | 'info' | 'neutral'

function dekkingTone(v: number | null): 'success' | 'warning' | 'error' | 'info' {
  if (v == null) return 'info'
  if (v >= 80) return 'success'
  if (v >= 50) return 'warning'
  return 'error'
}

function margeTone(v: number | null | undefined): string {
  if (v == null) return 'text-neutral-400'
  if (v < 0)    return 'text-error-500 font-semibold'
  if (v < 10)   return 'text-warning-700 font-semibold'
  return 'text-success-700 font-semibold'
}

function resultaatClass(v: number | null | undefined): string {
  if (v == null) return 'text-neutral-400'
  return v < 0 ? 'text-error-500 font-semibold' : 'text-success-700 font-semibold'
}

/* ── Gedeelde pivot-tabelstijlen ─────────────────────────────────── */

const pvTh = 'px-[10px] py-[7px] bg-neutral-50 border-b-2 border-neutral-200 text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-500 text-right whitespace-nowrap'
const pvTd = 'px-[10px] py-[8px] border-b border-neutral-100 align-middle whitespace-nowrap text-[12px] text-neutral-900'

/* ── Pivot helpers ───────────────────────────────────────────────── */

type FilPivot = {
  filiaal: string
  aantalLopend: number
  aantalGereed: number
  omzetOpdracht: number
  omzetGerealiseerd: number
  resultaatOpdracht: number
  resultaatGerealiseerd: number
}

function buildPivot(projecten: ManagementProject[]): FilPivot[] {
  const map = new Map<string, FilPivot>()
  for (const p of projecten) {
    const fil = p.filiaal ?? 'Overig'
    if (!map.has(fil)) map.set(fil, {
      filiaal: fil, aantalLopend: 0, aantalGereed: 0,
      omzetOpdracht: 0, omzetGerealiseerd: 0, resultaatOpdracht: 0, resultaatGerealiseerd: 0,
    })
    const d = map.get(fil)!
    if (p.is_gereed) {
      d.aantalGereed++
      d.omzetGerealiseerd     += p.gefactureerd       ?? 0
      d.resultaatGerealiseerd += p.resultaat_gereed   ?? 0
    } else {
      d.aantalLopend++
      d.omzetOpdracht         += p.totale_opdracht    ?? 0
      d.omzetGerealiseerd     += p.omzet_obv_pct      ?? 0
      d.resultaatOpdracht     += p.verwacht_resultaat ?? 0
      d.resultaatGerealiseerd += p.resultaat_obv_pct  ?? 0
    }
  }
  return [...map.values()].sort((a, b) => a.filiaal.localeCompare(b.filiaal))
}

/* ── Hiërarchische pivot: werkmaatschappij → status ──────────────── */

type PivotAgg = {
  aantal: number
  omzetOpdracht: number
  omzetGerealiseerd: number
  resultaatOpdracht: number
  resultaatGerealiseerd: number
}

function leegAgg(): PivotAgg {
  return { aantal: 0, omzetOpdracht: 0, omzetGerealiseerd: 0, resultaatOpdracht: 0, resultaatGerealiseerd: 0 }
}

function tel(d: PivotAgg, p: ManagementProject) {
  d.aantal++
  if (p.is_gereed) {
    d.omzetGerealiseerd     += p.gefactureerd     ?? 0
    d.resultaatGerealiseerd += p.resultaat_gereed ?? 0
  } else {
    d.omzetOpdracht         += p.totale_opdracht    ?? 0
    d.omzetGerealiseerd     += p.omzet_obv_pct      ?? 0
    d.resultaatOpdracht     += p.verwacht_resultaat ?? 0
    d.resultaatGerealiseerd += p.resultaat_obv_pct  ?? 0
  }
}

function optellen(a: PivotAgg, b: PivotAgg): PivotAgg {
  return {
    aantal:                a.aantal + b.aantal,
    omzetOpdracht:         a.omzetOpdracht + b.omzetOpdracht,
    omzetGerealiseerd:     a.omzetGerealiseerd + b.omzetGerealiseerd,
    resultaatOpdracht:     a.resultaatOpdracht + b.resultaatOpdracht,
    resultaatGerealiseerd: a.resultaatGerealiseerd + b.resultaatGerealiseerd,
  }
}

/** Dekking status = gerealiseerde marge (resultaat / omzet), val terug op in-opdracht. */
function dekkingMarge(a: PivotAgg): number | null {
  const teller = a.resultaatGerealiseerd || a.resultaatOpdracht
  const noemer = a.omzetGerealiseerd || a.omzetOpdracht
  if (!noemer) return null
  return (teller / noemer) * 100
}

/** Best-effort sorteervolgorde van statuslabels (Bouw7 status.name). */
function statusOrde(s: string): number {
  const t = s.toLowerCase()
  if (t.includes('voorbereiding') || t.includes('nieuwe')) return 1
  if (t.includes('onderhanden'))                            return 2
  if (t.includes('uitvoering'))                             return 3
  if (t.includes('technisch'))                              return 4
  if (t.includes('financ'))                                 return 5
  if (t.includes('afge') || t.includes('vervall') || t.includes('ingetrok')) return 9
  return 6
}

type FilGroep = {
  filiaal: string
  totaal: PivotAgg
  statussen: { status: string; agg: PivotAgg }[]
}

function buildHierarchie(projecten: ManagementProject[]): FilGroep[] {
  const map = new Map<string, { totaal: PivotAgg; statusMap: Map<string, PivotAgg> }>()
  for (const p of projecten) {
    const fil = p.filiaal ?? 'Overig'
    if (!map.has(fil)) map.set(fil, { totaal: leegAgg(), statusMap: new Map() })
    const g = map.get(fil)!
    tel(g.totaal, p)
    const st = p.status ?? 'Onbekend'
    if (!g.statusMap.has(st)) g.statusMap.set(st, leegAgg())
    tel(g.statusMap.get(st)!, p)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([filiaal, g]) => ({
      filiaal,
      totaal: g.totaal,
      statussen: [...g.statusMap.entries()]
        .sort((a, b) => statusOrde(a[0]) - statusOrde(b[0]) || a[0].localeCompare(b[0]))
        .map(([status, agg]) => ({ status, agg })),
    }))
}

/** Doelstelling op werkmaatschappij-niveau (projectleider leeg). */
function doelVoorFiliaal(doelstellingen: ManagementDoelstelling[], filiaal: string): ManagementDoelstelling | undefined {
  return doelstellingen
    .filter(d => d.filiaal === filiaal && !d.projectleider)
    .sort((a, b) => b.jaar - a.jaar)[0]
}

/* ── Pivot per projectleider ─────────────────────────────────────── */

type PLPivot = {
  projectleider: string
  aantalLopend: number
  aantalGereed: number
  omzetOpdracht: number
  omzetGerealiseerd: number
  resultaatOpdracht: number
  resultaatGerealiseerd: number
}

function buildPivotPL(projecten: ManagementProject[]): PLPivot[] {
  const map = new Map<string, PLPivot>()
  for (const p of projecten) {
    const pl = p.projectleider ?? 'Onbekend'
    if (!map.has(pl)) map.set(pl, {
      projectleider: pl, aantalLopend: 0, aantalGereed: 0,
      omzetOpdracht: 0, omzetGerealiseerd: 0, resultaatOpdracht: 0, resultaatGerealiseerd: 0,
    })
    const d = map.get(pl)!
    if (p.is_gereed) {
      d.aantalGereed++
      d.omzetGerealiseerd     += p.gefactureerd     ?? 0
      d.resultaatGerealiseerd += p.resultaat_gereed ?? 0
    } else {
      d.aantalLopend++
      d.omzetOpdracht         += p.totale_opdracht    ?? 0
      d.omzetGerealiseerd     += p.omzet_obv_pct      ?? 0
      d.resultaatOpdracht     += p.verwacht_resultaat ?? 0
      d.resultaatGerealiseerd += p.resultaat_obv_pct  ?? 0
    }
  }
  // Sorteer op omvang (meeste omzet in opdracht eerst).
  return [...map.values()].sort((a, b) =>
    (b.omzetOpdracht + b.omzetGerealiseerd) - (a.omzetOpdracht + a.omzetGerealiseerd),
  )
}

/** Meest recente doelstelling voor een projectleider (over alle jaren). */
function doelVoorPL(doelstellingen: ManagementDoelstelling[], pl: string): ManagementDoelstelling | undefined {
  return doelstellingen
    .filter(d => d.projectleider === pl)
    .sort((a, b) => b.jaar - a.jaar)[0]
}

/* ── Hoofd component ─────────────────────────────────────────────── */

export default function ManagementDashboard({ projecten, akData, doelstellingen, laatstGesynchroniseerd, user_id, layouts }: Props) {
  const [view, setView]             = useState<View>('dashboard')
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Lopende Werken = lopende opdrachten · Gereed Werken = financieel gereed/afgesloten (opdracht + servicedesk)
  // · Servicedesk = lopende servicedesk-dossiers.
  const lopend      = useMemo(() => projecten.filter(p => p.dossier_sectie === 'opdrachten' && !p.is_gereed), [projecten])
  const gereed      = useMemo(() => projecten.filter(p => p.is_gereed), [projecten])
  const servicedesk = useMemo(() => projecten.filter(p => p.dossier_sectie === 'servicedesk' && !p.is_gereed), [projecten])
  const pivot      = useMemo(() => buildPivot(projecten), [projecten])
  const hierarchie = useMemo(() => buildHierarchie(projecten), [projecten])
  const plPivot    = useMemo(() => buildPivotPL(projecten), [projecten])

  const plResultaatData = useMemo(() => plPivot.map(pl => {
    const doel = doelVoorPL(doelstellingen, pl.projectleider)
    return {
      name: kortNaam(pl.projectleider),
      'Gerealiseerd': Math.round(pl.resultaatGerealiseerd / 1000),
      'In opdracht':  Math.round(pl.resultaatOpdracht     / 1000),
      'Doelstelling': doel?.resultaat_doelstelling != null ? Math.round(doel.resultaat_doelstelling / 1000) : undefined,
    }
  }), [plPivot, doelstellingen])

  const totaalResultaatGerealiseerd = pivot.reduce((s, f) => s + f.resultaatGerealiseerd, 0)
  const totaalResultaatOpdracht     = pivot.reduce((s, f) => s + f.resultaatOpdracht, 0)
  const totaalAK                    = akData.reduce((s, a) => s + (a.bedrag_ak ?? 0), 0)

  const akDekkingGerealiseerd = totaalAK > 0 ? (totaalResultaatGerealiseerd / totaalAK) * 100 : null
  const akDekkingOpdracht     = totaalAK > 0 ? ((totaalResultaatGerealiseerd + totaalResultaatOpdracht) / totaalAK) * 100 : null

  const jaarresultaatData = useMemo(() => pivot.map(f => {
    const doel    = doelstellingen.find(d => d.filiaal === f.filiaal && !d.projectleider)
    const doelRes = doel?.resultaat_doelstelling ?? 0
    const real    = f.resultaatGerealiseerd
    const opdracht = Math.max(0, f.resultaatOpdracht)
    const nogBinnen = Math.max(0, doelRes - real - opdracht)
    return {
      name: kortFiliaal(f.filiaal),
      'Realisatie':       Math.round(real / 1000),
      'In opdracht':      Math.round(opdracht / 1000),
      'Nog binnen halen': Math.round(nogBinnen / 1000),
    }
  }), [pivot, doelstellingen])

  const opdrachtgevers = useMemo(() => {
    const map = new Map<string, { omzet: number; resultaat: number }>()
    for (const p of projecten) {
      const og = p.opdrachtgever ?? 'Onbekend'
      if (!map.has(og)) map.set(og, { omzet: 0, resultaat: 0 })
      const d = map.get(og)!
      if (p.is_gereed) {
        d.omzet     += p.gefactureerd     ?? 0
        d.resultaat += p.resultaat_gereed ?? 0
      } else {
        d.omzet     += p.totale_opdracht    ?? 0
        d.resultaat += p.verwacht_resultaat ?? 0
      }
    }
    return [...map.entries()]
      .map(([naam, v]) => ({ naam, ...v, marge: v.omzet > 0 ? (v.resultaat / v.omzet) * 100 : 0 }))
      .sort((a, b) => b.omzet - a.omzet)
      .slice(0, 15)
  }, [projecten])

  const categorieData = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of projecten) {
      const cat = p.categorie ?? 'Overig'
      map.set(cat, (map.get(cat) ?? 0) + ((p.is_gereed ? p.gefactureerd : p.totale_opdracht) ?? 0))
    }
    return [...map.entries()]
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [projecten])

  const kostensoortData = useMemo(() => {
    const labels: Record<string, string> = {
      lonen: 'Lonen', onderaanneming: 'Onderaanneming', materiaal: 'Materiaal',
      materieel: 'Materieel', inkoop: 'Inkoop', overig: 'Overig',
    }
    const acc: Record<string, number> = {}
    for (const p of projecten) {
      if (!p.kosten_split) continue
      for (const [k, v] of Object.entries(p.kosten_split)) acc[k] = (acc[k] ?? 0) + (v ?? 0)
    }
    return Object.entries(acc)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: labels[k] ?? k, value: Math.round(v) }))
      .sort((a, b) => b.value - a.value)
  }, [projecten])

  function handleSync() {
    setSyncResult(null)
    startTransition(async () => {
      const r = await syncManagementAction()
      setSyncResult(
        r.fouten > 0
          ? `⚠ ${r.fouten} fouten — ${r.foutMelding ?? ''}`
          : `✓ ${r.nieuw} nieuw · ${r.bijgewerkt} bijgewerkt`
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Actiebalk ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexShrink: 0,
      }}>
        {/* Filter-tabs (DS-patroon: pill-stijl) */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { key: 'dashboard',   label: 'Dashboard' },
            { key: 'lopend',      label: `Lopende Werken (${lopend.length})` },
            { key: 'gereed',      label: `Gereed Werken (${gereed.length})` },
            { key: 'servicedesk', label: `Servicedesk (${servicedesk.length})` },
          ] as const).map(({ key, label }) => {
            const actief = view === key
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                style={{
                  height: 30, padding: '0 14px', borderRadius: 6, border: '1px solid',
                  borderColor: actief ? 'var(--brand-300)' : 'var(--neutral-200)',
                  background:  actief ? 'var(--brand-50)'  : 'white',
                  color:       actief ? 'var(--brand-700)' : 'var(--neutral-600)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 120ms',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Sync-acties */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--neutral-400)' }}>
            Sync: {fDatum(laatstGesynchroniseerd)}
          </span>
          {syncResult && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: syncResult.startsWith('⚠') ? 'var(--error-500)' : 'var(--success-700)',
            }}>
              {syncResult}
            </span>
          )}
          <Button asChild variant="outline" size="md">
            <Link href="/management/instellingen">Instellingen</Link>
          </Button>
          <Button variant="primary" size="md" loading={isPending} onClick={handleSync}>
            {isPending ? 'Synchroniseren…' : 'Synchroniseer'}
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {view === 'dashboard' && (
          <DashboardView
            projecten={projecten}
            hierarchie={hierarchie}
            plPivot={plPivot}
            doelstellingen={doelstellingen}
            totaalResultaatGerealiseerd={totaalResultaatGerealiseerd}
            totaalResultaatOpdracht={totaalResultaatOpdracht}
            akDekkingGerealiseerd={akDekkingGerealiseerd}
            akDekkingOpdracht={akDekkingOpdracht}
            jaarresultaatData={jaarresultaatData}
            plResultaatData={plResultaatData}
            opdrachtgevers={opdrachtgevers}
            categorieData={categorieData}
            kostensoortData={kostensoortData}
          />
        )}
        {view === 'lopend' && (
          <ManagementProjectenTabel rows={lopend} variant="lopend"
            scherm="management-lopend" layouts={layouts.lopend} user_id={user_id} />
        )}
        {view === 'gereed' && (
          <ManagementProjectenTabel rows={gereed} variant="gereed"
            scherm="management-gereed" layouts={layouts.gereed} user_id={user_id} />
        )}
        {view === 'servicedesk' && (
          <ManagementProjectenTabel rows={servicedesk} variant="servicedesk"
            scherm="management-servicedesk" layouts={layouts.servicedesk} user_id={user_id} />
        )}
      </div>
    </div>
  )
}

/* ── Dashboard View ──────────────────────────────────────────────── */

type DashboardViewProps = {
  projecten: ManagementProject[]
  hierarchie: FilGroep[]
  plPivot: PLPivot[]
  doelstellingen: ManagementDoelstelling[]
  totaalResultaatGerealiseerd: number
  totaalResultaatOpdracht: number
  akDekkingGerealiseerd: number | null
  akDekkingOpdracht: number | null
  jaarresultaatData: { name: string; Realisatie: number; 'In opdracht': number; 'Nog binnen halen': number }[]
  plResultaatData: { name: string; Gerealiseerd: number; 'In opdracht': number; Doelstelling?: number }[]
  opdrachtgevers: { naam: string; omzet: number; resultaat: number; marge: number }[]
  categorieData: { name: string; value: number }[]
  kostensoortData: { name: string; value: number }[]
}

function DashboardView({
  projecten, hierarchie, plPivot, doelstellingen,
  totaalResultaatGerealiseerd, totaalResultaatOpdracht,
  akDekkingGerealiseerd, akDekkingOpdracht,
  jaarresultaatData, plResultaatData, opdrachtgevers, categorieData, kostensoortData,
}: DashboardViewProps) {
  const totaalProjecten = projecten.length
  const aantalLopend    = projecten.filter(p => !p.is_gereed).length
  const aantalGereed    = projecten.filter(p =>  p.is_gereed).length

  return (
    <div className="flex flex-col gap-4 pb-6">

      {/* KPI-rij */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Totaal projecten"
          value={totaalProjecten}
          icon={<Briefcase className="h-5 w-5" />}
          tone="brand"
          trend={{
            direction: 'flat',
            value: `${aantalLopend} lopend`,
            compare: `${aantalGereed} gereed`,
          }}
        />
        <StatCard
          label="AK Dekking Gerealiseerd"
          value={akDekkingGerealiseerd != null ? `${akDekkingGerealiseerd.toFixed(1)}%` : '—'}
          icon={<TrendingUp className="h-5 w-5" />}
          tone={dekkingTone(akDekkingGerealiseerd)}
          trend={akDekkingGerealiseerd != null ? {
            direction: akDekkingGerealiseerd >= 80 ? 'up' : akDekkingGerealiseerd >= 50 ? 'flat' : 'down',
            value: akDekkingGerealiseerd >= 80 ? 'Op schema' : akDekkingGerealiseerd >= 50 ? 'In voortgang' : 'Aandacht vereist',
          } : { direction: 'flat', value: 'AK niet ingesteld' }}
        />
        <StatCard
          label="AK Dekking In Opdracht"
          value={akDekkingOpdracht != null ? `${akDekkingOpdracht.toFixed(1)}%` : '—'}
          icon={<BarChart3 className="h-5 w-5" />}
          tone={dekkingTone(akDekkingOpdracht)}
          trend={akDekkingOpdracht != null
            ? { direction: 'flat', value: 'Incl. lopende werken' }
            : { direction: 'flat', value: 'AK niet ingesteld' }
          }
        />
        <StatCard
          label="Netto Resultaat Gerealiseerd"
          value={fEurK(totaalResultaatGerealiseerd)}
          icon={<TrendingUp className="h-5 w-5" />}
          tone={totaalResultaatGerealiseerd >= 0 ? 'success' : 'error'}
          trend={{
            direction: totaalResultaatOpdracht >= 0 ? 'up' : 'down',
            value: `In opdracht: ${fEurK(totaalResultaatOpdracht)}`,
          }}
        />
      </div>

      {/* Pivot + Jaarresultaat */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 360px' }}>
        <Card>
          <CardHeader>Overzicht per werkmaatschappij</CardHeader>
          <CardBody className="p-0">
            <PivotTabel hierarchie={hierarchie} doelstellingen={doelstellingen} />
          </CardBody>
        </Card>

        <ChartCard title="Jaarresultaat (×€1.000)">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jaarresultaatData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" vertical={false} />
                <XAxis dataKey="name" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} />
                <YAxis {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} width={48}
                  tickFormatter={v => v === 0 ? '0' : `${v}K`} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Realisatie"       stackId="r" fill={C_GROEN} />
                <Bar dataKey="In opdracht"      stackId="r" fill={C_BLAUW} />
                <Bar dataKey="Nog binnen halen" stackId="r" fill="#d1d5db" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Per projectleider: pivot + resultaatgrafiek */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 360px' }}>
        <Card>
          <CardHeader>Overzicht per projectleider</CardHeader>
          <CardBody className="p-0">
            <PivotTabelPL plPivot={plPivot} doelstellingen={doelstellingen} />
          </CardBody>
        </Card>

        <ChartCard title="Resultaat per projectleider (×€1.000)">
          {plResultaatData.length > 0 ? (
            <div className="h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plResultaatData} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" vertical={false} />
                  <XAxis dataKey="name" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false}
                    interval={0} angle={-30} textAnchor="end" height={56} />
                  <YAxis {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} width={48}
                    tickFormatter={v => v === 0 ? '0' : `${v}K`} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Gerealiseerd" fill={C_GROEN}  radius={[3, 3, 0, 0]} />
                  <Bar dataKey="In opdracht"  fill={C_BLAUW}  radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Doelstelling" fill={C_ORANJE} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="Geen projectleidergegevens" tone="neutral" size="sm" />
          )}
        </ChartCard>
      </div>

      {/* Top opdrachtgevers */}
      <Card>
        <CardHeader>Top opdrachtgevers</CardHeader>
        <CardBody className="p-0">
          <OpdrachtgeversTable opdrachtgevers={opdrachtgevers} />
        </CardBody>
      </Card>

      {/* Verdelingen: Categorie / Branche / Kostensoort */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
        <ChartCard title="Categorie">
          {categorieData.length > 0 ? (
            <CategorieChart data={categorieData} />
          ) : (
            <EmptyState title="Geen categoriegegevens" tone="neutral" size="sm" />
          )}
        </ChartCard>

        <ChartCard title="Branche">
          <EmptyState
            title="Geen branchegegevens"
            description="Relaties hebben nog geen branche-/sectorveld. Koppel dit eerst om de verdeling te tonen."
            tone="neutral"
            size="sm"
          />
        </ChartCard>

        <ChartCard title="Kostensoort">
          {kostensoortData.length > 0 ? (
            <CategorieChart data={kostensoortData} />
          ) : (
            <EmptyState title="Geen kostensoortgegevens" tone="neutral" size="sm" />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

/* ── Pivot tabel: werkmaatschappij → status ──────────────────────── */

function dekkingCel(agg: PivotAgg) {
  const v = dekkingMarge(agg)
  if (v == null) return <span className="text-neutral-400 text-[11px]">—</span>
  return (
    <span className={cn('font-semibold',
      v < 0 ? 'text-error-500' : v < 10 ? 'text-warning-700' : 'text-success-700')}>
      {fPct(v)}
    </span>
  )
}

function PivotTabel({ hierarchie, doelstellingen }: {
  hierarchie: FilGroep[]
  doelstellingen: ManagementDoelstelling[]
}) {
  const eindtotaal = hierarchie.reduce((acc, g) => optellen(acc, g.totaal), leegAgg())
  const heeftDoel  = doelstellingen.some(d => d.filiaal && !d.projectleider)

  // Eindtotaal-doelstellingen = som van de filiaal-doelstellingen.
  const doelTotaalOmzet     = hierarchie.reduce((s, g) => s + (doelVoorFiliaal(doelstellingen, g.filiaal)?.omzet_doelstelling ?? 0), 0)
  const doelTotaalResultaat = hierarchie.reduce((s, g) => s + (doelVoorFiliaal(doelstellingen, g.filiaal)?.resultaat_doelstelling ?? 0), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={cn(pvTh, 'text-left min-w-[150px]')}>Werkmaatschappij</th>
            <th colSpan={3} className={cn(pvTh, 'bg-success-50 border-b-2 border-success-200')}>Omzet</th>
            <th colSpan={3} className={cn(pvTh, 'bg-info-50 border-b-2 border-info-200')}>Resultaat</th>
            <th className={cn(pvTh, 'min-w-[72px]')}>Dekking status</th>
          </tr>
          <tr>
            <th className={pvTh} />
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>In opdracht</th>
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>Doelstelling</th>
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>Gerealiseerd</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>In opdracht</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>Doelstelling</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>Gerealiseerd</th>
            <th className={pvTh} />
          </tr>
        </thead>
        <tbody>
          {hierarchie.map(groep => {
            const doel = doelVoorFiliaal(doelstellingen, groep.filiaal)
            return (
              <React.Fragment key={groep.filiaal}>
                {/* Werkmaatschappij-totaal (bold) */}
                <tr className="bg-success-50/30 font-bold border-t border-success-200">
                  <td className={pvTd}>
                    <span className="font-semibold text-neutral-900">{kortFiliaal(groep.filiaal)}</span>
                  </td>
                  <td className={cn(pvTd, 'text-right')}>{fEur(groep.totaal.omzetOpdracht || null)}</td>
                  <td className={cn(pvTd, 'text-right text-neutral-500')}>{fEur(doel?.omzet_doelstelling ?? null)}</td>
                  <td className={cn(pvTd, 'text-right')}>{fEur(groep.totaal.omzetGerealiseerd || null)}</td>
                  <td className={cn(pvTd, 'text-right', groep.totaal.resultaatOpdracht < 0 ? 'text-error-500' : 'text-neutral-900')}>
                    {fEur(groep.totaal.resultaatOpdracht || null)}
                  </td>
                  <td className={cn(pvTd, 'text-right text-neutral-500')}>{fEur(doel?.resultaat_doelstelling ?? null)}</td>
                  <td className={cn(pvTd, 'text-right', groep.totaal.resultaatGerealiseerd < 0 ? 'text-error-500' : 'text-success-700')}>
                    {fEur(groep.totaal.resultaatGerealiseerd || null)}
                  </td>
                  <td className={cn(pvTd, 'text-right')}>{dekkingCel(groep.totaal)}</td>
                </tr>

                {/* Status-subrijen */}
                {groep.statussen.map(({ status, agg }) => (
                  <tr key={`${groep.filiaal}|${status}`} className="bg-white">
                    <td className={cn(pvTd, 'pl-6 text-neutral-600')}>{status}</td>
                    <td className={cn(pvTd, 'text-right')}>{fEur(agg.omzetOpdracht || null)}</td>
                    <td className={cn(pvTd, 'text-right')} />
                    <td className={cn(pvTd, 'text-right')}>{fEur(agg.omzetGerealiseerd || null)}</td>
                    <td className={cn(pvTd, 'text-right', agg.resultaatOpdracht < 0 ? 'text-error-500' : 'text-neutral-900')}>
                      {fEur(agg.resultaatOpdracht || null)}
                    </td>
                    <td className={cn(pvTd, 'text-right')} />
                    <td className={cn(pvTd, 'text-right', agg.resultaatGerealiseerd < 0 ? 'text-error-500' : 'text-neutral-900')}>
                      {fEur(agg.resultaatGerealiseerd || null)}
                    </td>
                    <td className={cn(pvTd, 'text-right')}>{dekkingCel(agg)}</td>
                  </tr>
                ))}
              </React.Fragment>
            )
          })}

          {/* Eindtotaal */}
          <tr className="bg-success-50/60 font-bold border-t-2 border-success-300">
            <td className={pvTd}><span className="font-bold text-success-700">Eindtotaal</span></td>
            <td className={cn(pvTd, 'text-right')}>{fEur(eindtotaal.omzetOpdracht || null)}</td>
            <td className={cn(pvTd, 'text-right text-neutral-500')}>{fEur(doelTotaalOmzet || null)}</td>
            <td className={cn(pvTd, 'text-right')}>{fEur(eindtotaal.omzetGerealiseerd || null)}</td>
            <td className={cn(pvTd, 'text-right')}>{fEur(eindtotaal.resultaatOpdracht || null)}</td>
            <td className={cn(pvTd, 'text-right text-neutral-500')}>{fEur(doelTotaalResultaat || null)}</td>
            <td className={cn(pvTd, 'text-right text-success-700')}>{fEur(eindtotaal.resultaatGerealiseerd || null)}</td>
            <td className={cn(pvTd, 'text-right')}>{dekkingCel(eindtotaal)}</td>
          </tr>
        </tbody>
      </table>

      {!heeftDoel && (
        <p className="text-[11px] text-neutral-500 italic mt-2 px-[18px] pb-3">
          Tip: stel doelstellingen per werkmaatschappij in via Instellingen om de doelstelling-kolommen te vullen.
        </p>
      )}
    </div>
  )
}

/* ── Pivot tabel per projectleider ───────────────────────────────── */

function PivotTabelPL({ plPivot, doelstellingen }: {
  plPivot: PLPivot[]
  doelstellingen: ManagementDoelstelling[]
}) {
  const totaal: PLPivot = {
    projectleider: 'Totaal',
    aantalLopend:          plPivot.reduce((s, f) => s + f.aantalLopend, 0),
    aantalGereed:          plPivot.reduce((s, f) => s + f.aantalGereed, 0),
    omzetOpdracht:         plPivot.reduce((s, f) => s + f.omzetOpdracht, 0),
    omzetGerealiseerd:     plPivot.reduce((s, f) => s + f.omzetGerealiseerd, 0),
    resultaatOpdracht:     plPivot.reduce((s, f) => s + f.resultaatOpdracht, 0),
    resultaatGerealiseerd: plPivot.reduce((s, f) => s + f.resultaatGerealiseerd, 0),
  }
  const rows = [...plPivot, totaal]

  if (plPivot.length === 0) {
    return <div className="p-4"><EmptyState title="Geen projectleidergegevens" tone="neutral" size="sm" /></div>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={cn(pvTh, 'text-left min-w-[120px]')}>Projectleider</th>
            <th className={cn(pvTh, 'min-w-[40px]')}>#</th>
            <th colSpan={2} className={cn(pvTh, 'bg-success-50 border-b-2 border-success-200')}>Omzet</th>
            <th colSpan={2} className={cn(pvTh, 'bg-info-50 border-b-2 border-info-200')}>Resultaat</th>
            <th className={cn(pvTh, 'min-w-[80px]')}>Doel</th>
            <th className={cn(pvTh, 'min-w-[64px]')}>% behaald</th>
          </tr>
          <tr>
            <th className={pvTh} />
            <th className={pvTh} />
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>In opdracht</th>
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>Gerealiseerd</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>In opdracht</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>Gerealiseerd</th>
            <th className={cn(pvTh, 'text-[10px]')}>Resultaat</th>
            <th className={pvTh} />
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => {
            const isTotaal   = f.projectleider === 'Totaal'
            const doel       = isTotaal ? undefined : doelVoorPL(doelstellingen, f.projectleider)
            const doelRes    = doel?.resultaat_doelstelling ?? null
            const pctBehaald = doelRes && doelRes !== 0 ? (f.resultaatGerealiseerd / doelRes) * 100 : null

            return (
              <tr
                key={f.projectleider}
                className={cn(
                  isTotaal ? 'bg-success-50/40 font-bold' : i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60',
                )}
              >
                <td className={pvTd}>
                  <span className={cn('font-semibold', isTotaal ? 'text-success-700' : 'text-neutral-900')}>
                    {f.projectleider}
                  </span>
                </td>
                <td className={cn(pvTd, 'text-center text-neutral-500 text-[11px]')}>
                  {f.aantalLopend + f.aantalGereed}
                </td>
                <td className={cn(pvTd, 'text-right')}>{fEur(f.omzetOpdracht || null)}</td>
                <td className={cn(pvTd, 'text-right')}>{fEur(f.omzetGerealiseerd || null)}</td>
                <td className={cn(pvTd, 'text-right', f.resultaatOpdracht < 0 ? 'text-error-500' : 'text-neutral-900')}>
                  {fEur(f.resultaatOpdracht || null)}
                </td>
                <td className={cn(pvTd, 'text-right font-semibold', f.resultaatGerealiseerd < 0 ? 'text-error-500' : 'text-success-700')}>
                  {fEur(f.resultaatGerealiseerd || null)}
                </td>
                <td className={cn(pvTd, 'text-right text-neutral-600')}>
                  {doelRes != null ? fEur(doelRes) : <span className="text-neutral-400 text-[11px]">—</span>}
                </td>
                <td className={cn(pvTd, 'text-right')}>
                  {pctBehaald != null
                    ? <span className={cn('font-semibold', dekkingTone(pctBehaald) === 'success' ? 'text-success-700' : dekkingTone(pctBehaald) === 'warning' ? 'text-warning-700' : 'text-error-500')}>
                        {fPct(pctBehaald)}
                      </span>
                    : <span className="text-neutral-400 text-[11px]">—</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {doelstellingen.filter(d => d.projectleider).length === 0 && (
        <p className="text-[11px] text-neutral-500 italic mt-2 px-[18px] pb-3">
          Tip: stel doelstellingen per projectleider in via Instellingen om de %-behaald-kolom te vullen.
        </p>
      )}
    </div>
  )
}

/* ── Opdrachtgevers tabel ────────────────────────────────────────── */

function OpdrachtgeversTable({ opdrachtgevers }: {
  opdrachtgevers: { naam: string; omzet: number; resultaat: number; marge: number }[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={cn(pvTh, 'text-left')}>Opdrachtgever</th>
            <th className={pvTh}>Omzet</th>
            <th className={pvTh}>Resultaat</th>
            <th className={pvTh}>% Marge</th>
          </tr>
        </thead>
        <tbody>
          {opdrachtgevers.map((og, i) => (
            <tr key={og.naam} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
              <td className={cn(pvTd, 'max-w-[200px] overflow-hidden text-ellipsis font-medium text-neutral-900')}>
                {og.naam}
              </td>
              <td className={cn(pvTd, 'text-right')}>{fEur(og.omzet)}</td>
              <td className={cn(pvTd, 'text-right', resultaatClass(og.resultaat))}>
                {fEur(og.resultaat)}
              </td>
              <td className={cn(pvTd, 'text-right')}>
                <span className={margeTone(og.marge)}>{og.marge.toFixed(1)}%</span>
              </td>
            </tr>
          ))}
          {opdrachtgevers.length === 0 && (
            <tr>
              <td colSpan={4}>
                <EmptyState title="Geen opdrachtgevers" tone="neutral" size="sm" />
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* ── Categorie pie chart ─────────────────────────────────────────── */

function CategorieChart({ data }: { data: { name: string; value: number }[] }) {
  const totaal = data.reduce((s, d) => s + d.value, 0)
  return (
    <div>
      <div className="h-[180px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={chartColor(i)} />)}
            </Pie>
            <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {data.slice(0, 8).map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ background: chartColor(i) }} />
            <span className="text-neutral-500">{d.name}</span>
            <span className="font-semibold text-neutral-900">
              {totaal > 0 ? `${((d.value / totaal) * 100).toFixed(0)}%` : '—'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Recharts custom tooltips ────────────────────────────────────── */

function BarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-[12px] shadow-md">
      <div className="font-semibold text-neutral-900 mb-1.5">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.fill }} className="mb-0.5">
          {p.name}: {fEurK((p.value as number) * 1000)}
        </div>
      ))}
    </div>
  )
}
