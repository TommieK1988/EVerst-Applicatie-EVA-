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
import { Progress } from '@/components/ui/progress'
import { EmptyState } from '@/components/ui/empty-state'
import { Badge } from '@/components/ui/badge'
import { StatCard } from '@/components/ui/stat-card'
import { Input } from '@/components/ui/input'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS, chartColor } from '@/components/ui/chart'
import { Briefcase, TrendingUp, BarChart3, Search } from 'lucide-react'
import { cn } from '@everts/ui'

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

type Props = {
  projecten: ManagementProject[]
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  laatstGesynchroniseerd: string | null
}

type View = 'dashboard' | 'lopend' | 'gereed'

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

/* ── Hoofd component ─────────────────────────────────────────────── */

export default function ManagementDashboard({ projecten, akData, doelstellingen, laatstGesynchroniseerd }: Props) {
  const [view, setView]             = useState<View>('dashboard')
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const lopend = useMemo(() => projecten.filter(p => !p.is_gereed), [projecten])
  const gereed = useMemo(() => projecten.filter(p =>  p.is_gereed), [projecten])
  const pivot  = useMemo(() => buildPivot(projecten), [projecten])

  const totaalResultaatGerealiseerd = pivot.reduce((s, f) => s + f.resultaatGerealiseerd, 0)
  const totaalResultaatOpdracht     = pivot.reduce((s, f) => s + f.resultaatOpdracht, 0)
  const totaalAK                    = akData.reduce((s, a) => s + (a.bedrag_ak ?? 0), 0)

  const akDekkingGerealiseerd = totaalAK > 0 ? (totaalResultaatGerealiseerd / totaalAK) * 100 : null
  const akDekkingOpdracht     = totaalAK > 0 ? ((totaalResultaatGerealiseerd + totaalResultaatOpdracht) / totaalAK) * 100 : null

  const jaarresultaatData = useMemo(() => pivot.map(f => {
    const doel = doelstellingen.find(d => d.filiaal === f.filiaal && !d.projectleider)
    return {
      name: kortFiliaal(f.filiaal),
      'Gerealiseerd': Math.round(f.resultaatGerealiseerd / 1000),
      'In opdracht':  Math.round(f.resultaatOpdracht     / 1000),
      'Doelstelling': doel?.resultaat_doelstelling ? Math.round(doel.resultaat_doelstelling / 1000) : undefined,
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
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'lopend',    label: `Lopende Werken (${lopend.length})` },
            { key: 'gereed',    label: `Gereed Werken (${gereed.length})` },
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
            pivot={pivot}
            akData={akData}
            doelstellingen={doelstellingen}
            totaalResultaatGerealiseerd={totaalResultaatGerealiseerd}
            totaalResultaatOpdracht={totaalResultaatOpdracht}
            akDekkingGerealiseerd={akDekkingGerealiseerd}
            akDekkingOpdracht={akDekkingOpdracht}
            jaarresultaatData={jaarresultaatData}
            opdrachtgevers={opdrachtgevers}
            categorieData={categorieData}
          />
        )}
        {view === 'lopend' && <LopendeTabel rijen={lopend} />}
        {view === 'gereed' && <GereedTabel  rijen={gereed} />}
      </div>
    </div>
  )
}

/* ── Dashboard View ──────────────────────────────────────────────── */

type DashboardViewProps = {
  projecten: ManagementProject[]
  pivot: FilPivot[]
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  totaalResultaatGerealiseerd: number
  totaalResultaatOpdracht: number
  akDekkingGerealiseerd: number | null
  akDekkingOpdracht: number | null
  jaarresultaatData: { name: string; Gerealiseerd: number; 'In opdracht': number; Doelstelling?: number }[]
  opdrachtgevers: { naam: string; omzet: number; resultaat: number; marge: number }[]
  categorieData: { name: string; value: number }[]
}

function DashboardView({
  projecten, pivot, akData, doelstellingen,
  totaalResultaatGerealiseerd, totaalResultaatOpdracht,
  akDekkingGerealiseerd, akDekkingOpdracht,
  jaarresultaatData, opdrachtgevers, categorieData,
}: DashboardViewProps) {
  const totaalOmzetOpdracht     = pivot.reduce((s, f) => s + f.omzetOpdracht, 0)
  const totaalOmzetGerealiseerd = pivot.reduce((s, f) => s + f.omzetGerealiseerd, 0)
  const totaalProjecten         = projecten.length
  void totaalOmzetOpdracht; void totaalOmzetGerealiseerd

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
            value: `${pivot.reduce((s, f) => s + f.aantalLopend, 0)} lopend`,
            compare: `${pivot.reduce((s, f) => s + f.aantalGereed, 0)} gereed`,
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
            <PivotTabel pivot={pivot} akData={akData} doelstellingen={doelstellingen} />
          </CardBody>
        </Card>

        <ChartCard title="Jaarresultaat (×€1.000)">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={jaarresultaatData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" vertical={false} />
                <XAxis dataKey="name" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} />
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
        </ChartCard>
      </div>

      {/* Opdrachtgevers + Categorie */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 280px' }}>
        <Card>
          <CardHeader>Top opdrachtgevers</CardHeader>
          <CardBody className="p-0">
            <OpdrachtgeversTable opdrachtgevers={opdrachtgevers} />
          </CardBody>
        </Card>

        <ChartCard title="Categorie verdeling">
          {categorieData.length > 0 ? (
            <CategorieChart data={categorieData} />
          ) : (
            <EmptyState title="Geen categoriegegevens" tone="neutral" size="sm" />
          )}
        </ChartCard>
      </div>
    </div>
  )
}

/* ── Pivot tabel ─────────────────────────────────────────────────── */

function PivotTabel({ pivot, akData, doelstellingen }: {
  pivot: FilPivot[]
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
}) {
  const totaal: FilPivot = {
    filiaal: 'Totaal',
    aantalLopend:         pivot.reduce((s, f) => s + f.aantalLopend, 0),
    aantalGereed:         pivot.reduce((s, f) => s + f.aantalGereed, 0),
    omzetOpdracht:        pivot.reduce((s, f) => s + f.omzetOpdracht, 0),
    omzetGerealiseerd:    pivot.reduce((s, f) => s + f.omzetGerealiseerd, 0),
    resultaatOpdracht:    pivot.reduce((s, f) => s + f.resultaatOpdracht, 0),
    resultaatGerealiseerd: pivot.reduce((s, f) => s + f.resultaatGerealiseerd, 0),
  }
  const rows = [...pivot, totaal]
  const totaalAK = akData.reduce((s, a) => s + (a.bedrag_ak ?? 0), 0)

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={cn(pvTh, 'text-left min-w-[90px]')}>Werkmaatschappij</th>
            <th className={cn(pvTh, 'min-w-[40px]')}>#</th>
            <th colSpan={2} className={cn(pvTh, 'bg-success-50 border-b-2 border-success-200')}>Omzet</th>
            <th colSpan={2} className={cn(pvTh, 'bg-info-50 border-b-2 border-info-200')}>Resultaat</th>
            <th className={cn(pvTh, 'min-w-[72px]')}>AK Dekking</th>
          </tr>
          <tr>
            <th className={pvTh} />
            <th className={pvTh} />
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>In opdracht</th>
            <th className={cn(pvTh, 'bg-success-50/50 text-[10px]')}>Gerealiseerd</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>In opdracht</th>
            <th className={cn(pvTh, 'bg-info-50/50 text-[10px]')}>Gerealiseerd</th>
            <th className={pvTh} />
          </tr>
        </thead>
        <tbody>
          {rows.map((f, i) => {
            const isTotaal   = f.filiaal === 'Totaal'
            const akBedrag   = akData.find(a => a.filiaal === f.filiaal)?.bedrag_ak ?? 0
            const dekking    = akBedrag > 0 ? (f.resultaatGerealiseerd / akBedrag) * 100 : null
            const totDekk    = isTotaal && totaalAK > 0 ? (f.resultaatGerealiseerd / totaalAK) * 100 : null
            const dekkWaarde = isTotaal ? totDekk : dekking
            void doelstellingen

            return (
              <tr
                key={f.filiaal}
                className={cn(
                  isTotaal ? 'bg-success-50/40 font-bold' : i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60',
                )}
              >
                <td className={pvTd}>
                  <span className={cn('font-semibold', isTotaal ? 'text-success-700' : 'text-neutral-900')}>
                    {isTotaal ? 'Totaal' : kortFiliaal(f.filiaal)}
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
                <td className={cn(pvTd, 'text-right')}>
                  {dekkWaarde != null
                    ? <span className={cn('font-semibold', dekkingTone(dekkWaarde) === 'success' ? 'text-success-700' : dekkingTone(dekkWaarde) === 'warning' ? 'text-warning-700' : 'text-error-500')}>
                        {fPct(dekkWaarde)}
                      </span>
                    : <span className="text-neutral-400 text-[11px]">—</span>
                  }
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {akData.length === 0 && (
        <p className="text-[11px] text-neutral-500 italic mt-2 px-[18px] pb-3">
          Tip: stel de AK-bedragen in via Instellingen om dekkingspercentages te berekenen.
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

/* ── Lopende Werken tabel ────────────────────────────────────────── */

function LopendeTabel({ rijen }: { rijen: ManagementProject[] }) {
  const [zoek, setZoek]       = useState('')
  const [filiaal, setFiliaal] = useState('')
  const [categorie, setCat]   = useState('')
  const [pl, setPl]           = useState('')

  const filialen    = useMemo(() => uniek(rijen.map(p => p.filiaal)),       [rijen])
  const categorieen = useMemo(() => uniek(rijen.map(p => p.categorie)),     [rijen])
  const pls         = useMemo(() => uniek(rijen.map(p => p.projectleider)), [rijen])

  const gefilterd = useMemo(() => rijen.filter(p => {
    if (filiaal   && p.filiaal       !== filiaal)  return false
    if (categorie && p.categorie     !== categorie) return false
    if (pl        && p.projectleider !== pl)        return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return p.projectnummer.toLowerCase().includes(q)
        || p.projectnaam.toLowerCase().includes(q)
        || (p.opdrachtgever ?? '').toLowerCase().includes(q)
    }
    return true
  }), [rijen, filiaal, categorie, pl, zoek])

  return (
    <div className="flex flex-col gap-3 h-full">
      <FilterBalk
        zoek={zoek} onZoek={setZoek}
        filiaal={filiaal} onFiliaal={setFiliaal} filialen={filialen}
        categorie={categorie} onCategorie={setCat} categorieen={categorieen}
        pl={pl} onPl={setPl} pls={pls}
        totaal={rijen.length} gefilterd={gefilterd.length}
      />
      <div className="flex-1 overflow-auto rounded-[10px] border border-neutral-200">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {[
                { l: 'Nr.' }, { l: 'Filiaal' }, { l: 'Status' }, { l: 'Opdrachtgever' }, { l: 'Project' },
                { l: 'PL' }, { l: 'Geboekte kosten', r: true }, { l: 'Totale opdracht', r: true },
                { l: '% gereed', r: true }, { l: 'Prognose', r: true },
                { l: 'Verw. resultaat', r: true }, { l: '% marge', r: true },
                { l: 'Omzet o.b.v. %', r: true }, { l: 'Res. o.b.v. %', r: true },
              ].map(k => (
                <th key={k.l} className={cn(tabelTh, k.r && 'text-right')}>{k.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gefilterd.length === 0 && (
              <tr>
                <td colSpan={14}>
                  <EmptyState title="Geen projecten gevonden" description="Pas de filters aan om projecten te tonen." tone="neutral" size="sm" />
                </td>
              </tr>
            )}
            {gefilterd.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                <td className={tabelTd}><span className="font-mono text-[11px] font-semibold text-success-700">{p.projectnummer}</span></td>
                <td className={tabelTd}><FiliaalbBadge tekst={p.filiaal} /></td>
                <td className={tabelTd}><StatusBadge tekst={p.status} /></td>
                <td className={cn(tabelTd, 'max-w-[160px]')}><Klem>{p.opdrachtgever}</Klem></td>
                <td className={cn(tabelTd, 'max-w-[200px]')}><Klem fontMedium>{p.projectnaam}</Klem></td>
                <td className={tabelTd}><Klem>{p.projectleider}</Klem></td>
                <td className={cn(tabelTd, 'text-right')}>{fEur(p.geboekte_kosten)}</td>
                <td className={cn(tabelTd, 'text-right')}>{fEur(p.totale_opdracht)}</td>
                <td className={cn(tabelTd, 'text-right')}><PctBar waarde={p.pct_gereed} /></td>
                <td className={cn(tabelTd, 'text-right')}>{fEur(p.totale_prognose)}</td>
                <td className={cn(tabelTd, 'text-right', resultaatClass(p.verwacht_resultaat))}>{fEur(p.verwacht_resultaat)}</td>
                <td className={cn(tabelTd, 'text-right')}><span className={margeTone(p.pct_marge)}>{fPct(p.pct_marge)}</span></td>
                <td className={cn(tabelTd, 'text-right')}>{fEur(p.omzet_obv_pct)}</td>
                <td className={cn(tabelTd, 'text-right', resultaatClass(p.resultaat_obv_pct))}>{fEur(p.resultaat_obv_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Gereed Werken tabel ─────────────────────────────────────────── */

function GereedTabel({ rijen }: { rijen: ManagementProject[] }) {
  const [zoek, setZoek]       = useState('')
  const [filiaal, setFiliaal] = useState('')
  const [categorie, setCat]   = useState('')
  const [pl, setPl]           = useState('')

  const filialen    = useMemo(() => uniek(rijen.map(p => p.filiaal)),       [rijen])
  const categorieen = useMemo(() => uniek(rijen.map(p => p.categorie)),     [rijen])
  const pls         = useMemo(() => uniek(rijen.map(p => p.projectleider)), [rijen])

  const gefilterd = useMemo(() => rijen.filter(p => {
    if (filiaal   && p.filiaal       !== filiaal)  return false
    if (categorie && p.categorie     !== categorie) return false
    if (pl        && p.projectleider !== pl)        return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return p.projectnummer.toLowerCase().includes(q)
        || p.projectnaam.toLowerCase().includes(q)
        || (p.opdrachtgever ?? '').toLowerCase().includes(q)
    }
    return true
  }), [rijen, filiaal, categorie, pl, zoek])

  return (
    <div className="flex flex-col gap-3 h-full">
      <FilterBalk
        zoek={zoek} onZoek={setZoek}
        filiaal={filiaal} onFiliaal={setFiliaal} filialen={filialen}
        categorie={categorie} onCategorie={setCat} categorieen={categorieen}
        pl={pl} onPl={setPl} pls={pls}
        totaal={rijen.length} gefilterd={gefilterd.length}
      />
      <div className="flex-1 overflow-auto rounded-[10px] border border-neutral-200">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr>
              {[
                { l: 'Nr.' }, { l: 'Filiaal' }, { l: 'Status' }, { l: 'Opdrachtgever' }, { l: 'Project' },
                { l: 'PL' }, { l: 'Gefactureerd', r: true }, { l: 'Geboekte kosten', r: true },
                { l: 'Resultaat', r: true }, { l: '% marge', r: true }, { l: 'Δ marge', r: true },
              ].map(k => (
                <th key={k.l} className={cn(tabelTh, k.r && 'text-right')}>{k.l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gefilterd.length === 0 && (
              <tr>
                <td colSpan={11}>
                  <EmptyState title="Geen projecten gevonden" description="Pas de filters aan om projecten te tonen." tone="neutral" size="sm" />
                </td>
              </tr>
            )}
            {gefilterd.map((p, i) => (
              <tr key={p.id} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                <td className={tabelTd}><span className="font-mono text-[11px] font-semibold text-success-700">{p.projectnummer}</span></td>
                <td className={tabelTd}><FiliaalbBadge tekst={p.filiaal} /></td>
                <td className={tabelTd}><StatusBadge tekst={p.status} /></td>
                <td className={cn(tabelTd, 'max-w-[160px]')}><Klem>{p.opdrachtgever}</Klem></td>
                <td className={cn(tabelTd, 'max-w-[200px]')}><Klem fontMedium>{p.projectnaam}</Klem></td>
                <td className={tabelTd}><Klem>{p.projectleider}</Klem></td>
                <td className={cn(tabelTd, 'text-right')}>{fEur(p.gefactureerd)}</td>
                <td className={cn(tabelTd, 'text-right')}>{fEur(p.geboekte_kosten)}</td>
                <td className={cn(tabelTd, 'text-right', resultaatClass(p.resultaat_gereed))}>{fEur(p.resultaat_gereed)}</td>
                <td className={cn(tabelTd, 'text-right')}><span className={margeTone(p.pct_marge_gereed)}>{fPct(p.pct_marge_gereed)}</span></td>
                <td className={cn(tabelTd, 'text-right')}>
                  <span className={p.verschil_pct_marge != null && p.verschil_pct_marge > 0
                    ? 'text-success-700 font-semibold'
                    : p.verschil_pct_marge != null && p.verschil_pct_marge < 0
                      ? 'text-error-500 font-semibold'
                      : 'text-neutral-400'
                  }>
                    {p.verschil_pct_marge != null ? (p.verschil_pct_marge > 0 ? '+' : '') + fPct(p.verschil_pct_marge) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── Filter balk ─────────────────────────────────────────────────── */

function FilterBalk({ zoek, onZoek, filiaal, onFiliaal, filialen, categorie, onCategorie, categorieen, pl, onPl, pls, totaal, gefilterd }: {
  zoek: string; onZoek: (v: string) => void
  filiaal: string; onFiliaal: (v: string) => void; filialen: string[]
  categorie: string; onCategorie: (v: string) => void; categorieen: string[]
  pl: string; onPl: (v: string) => void; pls: string[]
  totaal: number; gefilterd: number
}) {
  const actief = filiaal || categorie || pl || zoek
  return (
    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
      <Input
        inputSize="md"
        placeholder="Zoek project, naam, opdrachtgever…"
        value={zoek}
        onChange={e => onZoek(e.target.value)}
        prefix={<Search className="h-3.5 w-3.5" />}
        className="min-w-[220px] flex-1 max-w-[320px]"
      />
      <FilterSelect value={filiaal} onChange={onFiliaal} placeholder="Alle filialen"      options={filialen} />
      <FilterSelect value={categorie} onChange={onCategorie} placeholder="Alle categorieën" options={categorieen} />
      <FilterSelect value={pl} onChange={onPl} placeholder="Alle projectleiders"            options={pls} />
      {actief && (
        <Button variant="ghost" size="md" onClick={() => { onZoek(''); onFiliaal(''); onCategorie(''); onPl('') }}>
          Wis filters
        </Button>
      )}
      <span className="ml-auto text-[12px] text-neutral-500">
        {gefilterd} van {totaal} projecten
      </span>
    </div>
  )
}

function FilterSelect({ value, onChange, placeholder, options }: {
  value: string; onChange: (v: string) => void; placeholder: string; options: string[]
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="h-9 rounded-md border border-neutral-300 bg-white px-3 text-[13px] text-neutral-900 outline-none transition-[border-color,box-shadow] [transition-duration:120ms] hover:border-neutral-400 focus:border-brand-500 focus:ring-[3px] focus:ring-brand-100"
    >
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

/* ── Sub-componenten ─────────────────────────────────────────────── */

function FiliaalbBadge({ tekst }: { tekst: string | null }) {
  if (!tekst) return <span className="text-neutral-400 text-[11px]">—</span>
  return <Badge tone="neutral" variant="outline">{kortFiliaal(tekst)}</Badge>
}

function StatusBadge({ tekst }: { tekst: string | null }) {
  if (!tekst) return <span className="text-neutral-400 text-[11px]">—</span>
  const tone: Tone =
    tekst.toLowerCase().includes('gereed')                                               ? 'success' :
    tekst.toLowerCase().includes('lopend') || tekst.toLowerCase().includes('onderhanden') ? 'info'    :
    tekst.toLowerCase().includes('voorbereiding')                                         ? 'warning' :
    'neutral'
  return <Badge tone={tone} dot>{tekst}</Badge>
}

function Klem({ children, fontMedium = false }: { children: React.ReactNode; fontMedium?: boolean }) {
  return (
    <span className={cn(
      'block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-neutral-900',
      fontMedium ? 'font-medium' : 'font-normal',
    )}>
      {children ?? <span className="text-neutral-400">—</span>}
    </span>
  )
}

function PctBar({ waarde }: { waarde: number | null }) {
  if (waarde == null) return <span className="text-neutral-400">—</span>
  const tone = waarde >= 100 ? 'success' : waarde >= 50 ? 'brand' : 'warning'
  const kleurClass = waarde >= 100 ? 'text-success-700' : waarde >= 50 ? 'text-info-700' : 'text-warning-700'
  return (
    <div className="flex items-center justify-end gap-1.5">
      <Progress value={Math.min(waarde, 100)} tone={tone} size="sm" style={{ width: 48 }} />
      <span className={cn('text-[11px] font-semibold min-w-[32px]', kleurClass)}>
        {waarde.toFixed(0)}%
      </span>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────── */

function uniek(items: (string | null)[]): string[] {
  return [...new Set(items.filter(Boolean) as string[])].sort()
}

/* ── Gedeelde tabelstijlen (Tailwind string-constanten) ──────────── */

const pvTh = 'px-[10px] py-[7px] bg-neutral-50 border-b-2 border-neutral-200 text-[11px] font-bold uppercase tracking-[0.04em] text-neutral-500 text-right whitespace-nowrap'
const pvTd = 'px-[10px] py-[8px] border-b border-neutral-100 align-middle whitespace-nowrap text-[12px] text-neutral-900'

const tabelTh = 'sticky top-0 z-[1] px-3 py-[9px] bg-neutral-50 border-b-2 border-neutral-200 text-[11px] font-bold uppercase tracking-[0.05em] text-neutral-500 whitespace-nowrap text-left'
const tabelTd = 'px-3 py-[8px] border-b border-neutral-100 align-middle whitespace-nowrap'
