'use client'

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS, chartColor } from '@/components/ui/chart'
import { Briefcase, TrendingUp, BarChart3 } from 'lucide-react'
import { cn } from '@everts/ui'
import {
  fEur, fEurK, fPct, kortFiliaal, dekkingTone, margeTone, resultaatClass,
  optellen, leegAgg, dekkingMarge, doelVoorFiliaal, doelVoorPL,
  pvTh, pvTd,
  type ManagementKpi, type FilGroep, type PivotAgg, type PLPivot, type ManagementDoelstelling,
} from '@/lib/dashboard/aggregaties'

const C_GROEN  = CHART_COLORS[0]  // #009439
const C_BLAUW  = CHART_COLORS[3]  // #2e90fa
const C_ORANJE = CHART_COLORS[4]  // #f08000

/* ── Dashboard View (live én snapshot) ───────────────────────────── */

export default function DashboardView({ kpi }: { kpi: ManagementKpi }) {
  const {
    totaalProjecten, aantalLopend, aantalGereed,
    totaalResultaatGerealiseerd, totaalResultaatOpdracht,
    akDekkingGerealiseerd, akDekkingOpdracht,
    hierarchie, plPivot, doelstellingen,
    jaarresultaatData, plResultaatData, opdrachtgevers, categorieData, kostensoortData,
  } = kpi

  return (
    <div className="flex flex-col gap-4 pb-6">

      {/* KPI-rij */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          label="Totaal projecten"
          value={totaalProjecten}
          icon={<Briefcase className="h-5 w-5" />}
          tone="brand"
          trend={{ direction: 'flat', value: `${aantalLopend} lopend`, compare: `${aantalGereed} gereed` }}
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
            : { direction: 'flat', value: 'AK niet ingesteld' }}
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
          {categorieData.length > 0
            ? <CategorieChart data={categorieData} />
            : <EmptyState title="Geen categoriegegevens" tone="neutral" size="sm" />}
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
          {kostensoortData.length > 0
            ? <CategorieChart data={kostensoortData} />
            : <EmptyState title="Geen kostensoortgegevens" tone="neutral" size="sm" />}
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
  if (plPivot.length === 0) {
    return <div className="p-4"><EmptyState title="Geen projectleidergegevens" tone="neutral" size="sm" /></div>
  }

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
              <tr key={f.projectleider}
                className={cn(isTotaal ? 'bg-success-50/40 font-bold' : i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60')}>
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
                    : <span className="text-neutral-400 text-[11px]">—</span>}
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
              <td className={cn(pvTd, 'text-right', resultaatClass(og.resultaat))}>{fEur(og.resultaat)}</td>
              <td className={cn(pvTd, 'text-right')}>
                <span className={margeTone(og.marge)}>{og.marge.toFixed(1)}%</span>
              </td>
            </tr>
          ))}
          {opdrachtgevers.length === 0 && (
            <tr><td colSpan={4}><EmptyState title="Geen opdrachtgevers" tone="neutral" size="sm" /></td></tr>
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
