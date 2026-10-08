'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS } from '@/components/ui/chart'
import { cn } from '@everts/ui'
import { useManagementData } from './ManagementShell'
import SnapshotDetail, { type SnapshotDetailData } from './SnapshotDetail'
import { maandLabel, maandKort, maandParam } from './maand'
import { fEur, fEurK, fPct, pvTh, pvTd } from '@/lib/dashboard/aggregaties'

const C_GROEN = CHART_COLORS[0]
const C_BLAUW = CHART_COLORS[3]

function fDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function HistorieView({ detail: detailData }: { detail: SnapshotDetailData | null }) {
  const { snapshots } = useManagementData()

  // snapshots komen nieuw→oud; trend wil oud→nieuw
  const oplopend = useMemo(() => [...snapshots].reverse(), [snapshots])

  const trendData = useMemo(() => oplopend.map(s => ({
    maand: maandKort(s.periode),
    'Resultaat gerealiseerd': Math.round((s.kpi?.totaalResultaatGerealiseerd ?? 0) / 1000),
    'Resultaat in opdracht':  Math.round((s.kpi?.totaalResultaatOpdracht ?? 0) / 1000),
  })), [oplopend])

  if (snapshots.length === 0) {
    return (
      <div className="pt-4">
        <EmptyState
          title="Nog geen vastgestelde maanden"
          description="Klik rechtsboven op ‘Maandcijfers vaststellen’ om de huidige cijfers als maandstand te bevriezen. Daarna kun je hier historie en trends bekijken."
          tone="neutral"
        />
      </div>
    )
  }

  // Detailweergave van één vastgestelde maand (?periode=YYYY-MM)
  const detail = detailData ? snapshots.find(s => s.periode === detailData.periode) : null
  if (detail && detailData) return <SnapshotDetail snapshot={detail} data={detailData} />

  return (
    <div className="flex flex-col gap-4 pb-6">
      <ChartCard title="Trend resultaat (×€1.000)" subtitle="Per vastgestelde maand">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" vertical={false} />
              <XAxis dataKey="maand" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} />
              <YAxis {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} width={48}
                tickFormatter={v => v === 0 ? '0' : `${v}K`} />
              <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
              <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="Resultaat gerealiseerd" stroke={C_GROEN} strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="Resultaat in opdracht"  stroke={C_BLAUW} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <Card>
        <CardHeader>Vastgestelde maanden</CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <th className={cn(pvTh, 'text-left min-w-[120px]')}>Maand</th>
                  <th className={pvTh}>Projecten</th>
                  <th className={pvTh}>Resultaat gerealiseerd</th>
                  <th className={pvTh}>Δ vorige maand</th>
                  <th className={pvTh}>AK-dekking</th>
                  <th className={cn(pvTh, 'text-left')}>Vastgesteld</th>
                  <th className={pvTh} />
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s, i) => {
                  // vorige = oudere maand (één verder in de aflopende lijst)
                  const vorige = snapshots[i + 1]
                  const res = s.kpi?.totaalResultaatGerealiseerd ?? 0
                  const delta = vorige ? res - (vorige.kpi?.totaalResultaatGerealiseerd ?? 0) : null
                  const dekking = s.kpi?.akDekkingGerealiseerd ?? null
                  return (
                    <tr key={s.periode} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                      <td className={cn(pvTd, 'font-semibold text-neutral-900')}>{maandLabel(s.periode)}</td>
                      <td className={cn(pvTd, 'text-right text-neutral-600')}>{s.kpi?.totaalProjecten ?? '—'}</td>
                      <td className={cn(pvTd, 'text-right font-semibold', res < 0 ? 'text-error-500' : 'text-success-700')}>
                        {fEur(res)}
                      </td>
                      <td className={cn(pvTd, 'text-right')}>
                        {delta == null
                          ? <span className="text-neutral-400">—</span>
                          : <span className={delta < 0 ? 'text-error-500' : 'text-success-700'}>
                              {delta >= 0 ? '+' : ''}{fEurK(delta)}
                            </span>}
                      </td>
                      <td className={cn(pvTd, 'text-right text-neutral-700')}>{dekking != null ? fPct(dekking) : '—'}</td>
                      <td className={cn(pvTd, 'text-left text-neutral-500')}>
                        {fDatum(s.vastgesteld_op)}{s.vastgesteld_door_naam ? ` · ${s.vastgesteld_door_naam}` : ''}
                      </td>
                      <td className={cn(pvTd, 'text-right')}>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={`/management/historie?periode=${maandParam(s.periode)}`}>Bekijk</Link>
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
