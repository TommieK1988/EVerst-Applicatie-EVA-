'use client'

import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS } from '@/components/ui/chart'
import { Inbox, Send, Trophy, Percent, Clock, Euro } from 'lucide-react'
import { cn } from '@everts/ui'
import {
  fEur, fEurK, fPct, pvTh, pvTd,
  type FunnelData, type FunnelDimRij,
} from '@/lib/dashboard/aggregaties'

const C_GROEN = CHART_COLORS[0]
const C_BLAUW = CHART_COLORS[3]

function fAantal(n: number): string {
  return new Intl.NumberFormat('nl-NL').format(n)
}

function winrateClass(v: number | null): string {
  if (v == null) return 'text-neutral-400'
  if (v >= 50) return 'text-success-700 font-semibold'
  if (v >= 30) return 'text-warning-700 font-semibold'
  return 'text-error-500 font-semibold'
}

export default function FunnelView({ funnel }: { funnel: FunnelData }) {
  const f = funnel

  return (
    <div className="flex flex-col gap-4 pb-6">

      {/* Huidige stand */}
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">Huidige pipeline</div>
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Open aanvragen" tone="info" icon={<Inbox className="h-5 w-5" />}
            value={fAantal(f.openAanvragen.aantal)}
            trend={{ direction: 'flat', value: fEurK(f.openAanvragen.waarde) }}
          />
          <StatCard
            label="Open offertes" tone="brand" icon={<Send className="h-5 w-5" />}
            value={fAantal(f.openOffertes.aantal)}
            trend={{ direction: 'flat', value: `${fEurK(f.openOffertes.waarde)} in de markt` }}
          />
          <StatCard
            label="Gewonnen (opdracht)" tone="success" icon={<Trophy className="h-5 w-5" />}
            value={fAantal(f.gewonnen.aantal)}
            trend={{ direction: 'up', value: fEurK(f.gewonnen.waarde) }}
          />
          <StatCard
            label="Win-rate (indicatief)" tone={f.winRateAantal != null && f.winRateAantal >= 50 ? 'success' : 'warning'}
            icon={<Percent className="h-5 w-5" />}
            value={f.winRateAantal != null ? `${f.winRateAantal.toFixed(0)}%` : '—'}
            trend={{ direction: 'flat',
              value: f.winRateWaarde != null ? `${f.winRateWaarde.toFixed(0)}% o.b.v. waarde` : 'geen data',
              compare: `${f.verloren.aantal} verloren` }}
          />
        </div>
        <p className="mt-2 text-[11px] italic text-neutral-500">
          Let op: lopende opdrachten omvatten ook werk van vóór de funnelregistratie in EVA, terwijl verloren offertes
          pas recent worden bijgehouden. De win-rate is daardoor voorlopig indicatief en wordt betrouwbaarder naarmate
          het volledige aanvraag→opdracht-traject in EVA wordt vastgelegd.
        </p>
      </div>

      {/* Periode (dit jaar) */}
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">Dit jaar ({f.jaar})</div>
        <div className="grid grid-cols-4 gap-3">
          <StatCard
            label="Aanvragen ontvangen" tone="info" icon={<Inbox className="h-5 w-5" />}
            value={fAantal(f.instroomDitJaar)}
          />
          <StatCard
            label="Offertes verstuurd" tone="brand" icon={<Send className="h-5 w-5" />}
            value={fAantal(f.verzondenDitJaar)}
            trend={{ direction: 'flat', value: fEurK(f.verzondenWaardeDitJaar) }}
          />
          <StatCard
            label="Gem. offertewaarde" tone="lime" icon={<Euro className="h-5 w-5" />}
            value={f.gemOffertewaarde != null ? fEurK(f.gemOffertewaarde) : '—'}
          />
          <StatCard
            label="Doorlooptijd aanvraag→offerte" tone="warning" icon={<Clock className="h-5 w-5" />}
            value={f.gemDoorlooptijdDagen != null ? `${f.gemDoorlooptijdDagen.toFixed(0)} d` : '—'}
            trend={{ direction: 'flat',
              value: f.medDoorlooptijdDagen != null ? `mediaan ${f.medDoorlooptijdDagen.toFixed(0)} d` : 'geen data' }}
          />
        </div>
      </div>

      {/* Trend + pipeline */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 360px' }}>
        <ChartCard title="Instroom & offertes (12 maanden)" subtitle="Aanvragen ontvangen vs. offertes verstuurd per maand">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={f.trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" vertical={false} />
                <XAxis dataKey="maand" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} />
                <YAxis {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} width={32} allowDecimals={false} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend iconType="plainline" iconSize={14} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="instroom"  name="Aanvragen" stroke={C_BLAUW} strokeWidth={2} dot={{ r: 2 }} />
                <Line type="monotone" dataKey="verzonden" name="Offertes"  stroke={C_GROEN} strokeWidth={2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Pipeline per fase" subtitle="Aantal dossiers per fase">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={f.pipelinePerFase} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" horizontal={false} />
                <XAxis type="number" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="fase" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} width={110} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar dataKey="aantal" name="Aantal" fill={C_BLAUW} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>

      {/* Conversie per dimensie */}
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <Card>
          <CardHeader>Conversie per werkmaatschappij</CardHeader>
          <CardBody className="p-0"><DimTabel rows={f.perFiliaal} kop="Werkmaatschappij" /></CardBody>
        </Card>
        <Card>
          <CardHeader>Conversie per categorie</CardHeader>
          <CardBody className="p-0"><DimTabel rows={f.perCategorie} kop="Categorie" /></CardBody>
        </Card>
      </div>

      {/* Verliesredenen */}
      <Card>
        <CardHeader>Verliesredenen</CardHeader>
        <CardBody className="p-0">
          {f.lostReasons.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead>
                  <tr>
                    <th className={cn(pvTh, 'text-left')}>Reden</th>
                    <th className={pvTh}>Aantal</th>
                  </tr>
                </thead>
                <tbody>
                  {f.lostReasons.map((r, i) => (
                    <tr key={r.reden} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                      <td className={cn(pvTd, 'font-medium text-neutral-900')}>{r.reden}</td>
                      <td className={cn(pvTd, 'text-right')}>{fAantal(r.aantal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-4">
              <EmptyState
                title="Geen verliesredenen vastgelegd"
                description="Leg bij het verliezen van een offerte een reden vast om hier patronen te zien."
                tone="neutral" size="sm"
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

/* ── Conversie-per-dimensie tabel ────────────────────────────────── */

function DimTabel({ rows, kop }: { rows: FunnelDimRij[]; kop: string }) {
  if (rows.length === 0) {
    return <div className="p-4"><EmptyState title="Geen gegevens" tone="neutral" size="sm" /></div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className={cn(pvTh, 'text-left min-w-[140px]')}>{kop}</th>
            <th className={pvTh}>Offertes</th>
            <th className={pvTh}>Gewonnen</th>
            <th className={pvTh}>Verloren</th>
            <th className={pvTh}>Win-rate</th>
            <th className={pvTh}>Waarde gewonnen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.label} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
              <td className={cn(pvTd, 'max-w-[180px] overflow-hidden text-ellipsis font-medium text-neutral-900')}>{r.label}</td>
              <td className={cn(pvTd, 'text-right')}>{fAantal(r.offertes)}</td>
              <td className={cn(pvTd, 'text-right text-success-700')}>{fAantal(r.gewonnen)}</td>
              <td className={cn(pvTd, 'text-right text-neutral-600')}>{fAantal(r.verloren)}</td>
              <td className={cn(pvTd, 'text-right')}>
                <span className={winrateClass(r.winrate)}>{r.winrate != null ? fPct(r.winrate) : '—'}</span>
              </td>
              <td className={cn(pvTd, 'text-right')}>{fEur(r.gewonnenWaarde || null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
