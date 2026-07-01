'use client'

import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from 'recharts'
import { Card, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS } from '@/components/ui/chart'
import { Clock, Users, Gauge, AlertTriangle } from 'lucide-react'
import { pvTh, pvTd } from '@/lib/dashboard/aggregaties'
import type { WerkvoorraadData } from '@/lib/dashboard/werkvoorraad'

const C_INTERN = CHART_COLORS[0] // groen
const C_EXTERN = CHART_COLORS[3] // blauw

function fUren(v: number): string {
  return `${v.toLocaleString('nl-NL', { maximumFractionDigits: 0 })} u`
}

function fDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: 'long', year: 'numeric' })
}

/** Tone van de bezettingsgraad: te weinig werk (leegloop) vs. overvol. */
function bezettingTone(v: number | null): 'success' | 'warning' | 'error' | 'info' {
  if (v == null) return 'info'
  if (v < 60) return 'warning'      // veel vrije capaciteit → meer werk nodig
  if (v <= 100) return 'success'    // gezond gevuld
  return 'error'                    // meer werk dan capaciteit → inhuur/uitbesteden
}

export default function WerkvoorraadView({ data }: { data: WerkvoorraadData }) {
  const {
    peildatum, eindDatum, vraagUren, vraagOverschrijding, aanbodUren,
    bezettingsgraad, perUursoort, nietToegewezen, projecten,
  } = data

  const saldoCapaciteit = aanbodUren - vraagUren

  const chartData = perUursoort.map(u => ({
    naam: u.naam,
    Intern: u.beschikbaar_intern,
    Extern: u.beschikbaar_extern,
  }))

  return (
    <div className="flex flex-col gap-4 pb-6">

      {/* KPI-rij */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Nog uit te voeren uren"
          value={fUren(vraagUren)}
          icon={<Clock className="h-5 w-5" />}
          tone="brand"
          trend={vraagOverschrijding > 0
            ? { direction: 'flat', value: `${fUren(vraagOverschrijding)} overschrijding`, compare: 'lopende projecten' }
            : { direction: 'flat', value: 'lopende projecten' }}
        />
        <StatCard
          label={`Beschikbare uren t/m ${fDatum(eindDatum)}`}
          value={fUren(aanbodUren)}
          icon={<Users className="h-5 w-5" />}
          tone="info"
          trend={{
            direction: saldoCapaciteit >= 0 ? 'up' : 'down',
            value: `${saldoCapaciteit >= 0 ? '+' : ''}${fUren(saldoCapaciteit)} saldo`,
            compare: saldoCapaciteit >= 0 ? 'vrije capaciteit' : 'tekort',
          }}
        />
        <StatCard
          label="Bezettingsgraad"
          value={bezettingsgraad != null ? `${bezettingsgraad.toFixed(0)}%` : '—'}
          icon={<Gauge className="h-5 w-5" />}
          tone={bezettingTone(bezettingsgraad)}
          trend={bezettingsgraad != null ? {
            direction: bezettingsgraad > 100 ? 'down' : bezettingsgraad >= 60 ? 'up' : 'flat',
            value: bezettingsgraad > 100 ? 'Meer werk dan capaciteit'
              : bezettingsgraad >= 60 ? 'Gezond gevuld' : 'Ruimte voor werk',
          } : { direction: 'flat', value: 'Geen capaciteit' }}
        />
      </div>

      {nietToegewezen > 0 && (
        <div className="flex items-center gap-2 rounded-[8px] border border-warning-200 bg-warning-50 px-3.5 py-2.5 text-[12.5px] text-warning-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            {nietToegewezen} actieve medewerker{nietToegewezen === 1 ? '' : 's'} met een rooster
            {' '}heeft nog geen standaard-uursoort en telt niet mee in de capaciteit.
            {' '}Stel deze in op de medewerkerpagina.
          </span>
        </div>
      )}

      {/* Capaciteit per uursoort */}
      <ChartCard title="Beschikbare capaciteit per uursoort" subtitle={`Peildatum ${fDatum(peildatum)} — intern vs. extern`}>
        {chartData.length === 0 ? (
          <EmptyState
            size="sm"
            tone="neutral"
            title="Nog geen capaciteit"
            description="Koppel medewerkers aan een standaard-uursoort en stel roosters in."
          />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--neutral-200)" />
              <XAxis dataKey="naam" {...CHART_AXIS_PROPS} />
              <YAxis {...CHART_AXIS_PROPS} unit=" u" width={64} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(v) => fUren(Number(v))}
              />
              <Legend />
              <Bar dataKey="Intern" stackId="cap" fill={C_INTERN} radius={[0, 0, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={C_INTERN} />)}
              </Bar>
              <Bar dataKey="Extern" stackId="cap" fill={C_EXTERN} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Detailtabel per uursoort */}
      <Card>
        <CardBody>
          <h3 className="mb-3 font-[var(--font-display)] text-[15px] font-semibold text-neutral-900">
            Capaciteit per uursoort
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={pvTh + ' text-left'}>Uursoort</th>
                  <th className={pvTh}>Beschikbaar</th>
                  <th className={pvTh}>Intern</th>
                  <th className={pvTh}>Extern</th>
                  <th className={pvTh}>Medewerkers</th>
                  <th className={pvTh}>Aandeel</th>
                </tr>
              </thead>
              <tbody>
                {perUursoort.length === 0 ? (
                  <tr><td className={pvTd + ' text-left text-neutral-400'} colSpan={6}>Geen toegewezen capaciteit.</td></tr>
                ) : perUursoort.map(u => (
                  <tr key={u.uursoort_id}>
                    <td className={pvTd + ' text-left'}>
                      <span className="inline-flex items-center gap-2">
                        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: u.kleur || 'var(--neutral-300)' }} />
                        {u.naam}
                      </span>
                    </td>
                    <td className={pvTd + ' font-semibold'}>{fUren(u.beschikbaar_totaal)}</td>
                    <td className={pvTd}>{fUren(u.beschikbaar_intern)}</td>
                    <td className={pvTd}>{fUren(u.beschikbaar_extern)}</td>
                    <td className={pvTd}>{u.aantal_medewerkers}</td>
                    <td className={pvTd}>{aanbodUren > 0 ? `${((u.beschikbaar_totaal / aanbodUren) * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {perUursoort.length > 0 && (
                <tfoot>
                  <tr>
                    <td className={pvTd + ' text-left font-bold'}>Totaal</td>
                    <td className={pvTd + ' font-bold'}>{fUren(aanbodUren)}</td>
                    <td className={pvTd + ' font-bold'}>{fUren(perUursoort.reduce((s, u) => s + u.beschikbaar_intern, 0))}</td>
                    <td className={pvTd + ' font-bold'}>{fUren(perUursoort.reduce((s, u) => s + u.beschikbaar_extern, 0))}</td>
                    <td className={pvTd + ' font-bold'}>{perUursoort.reduce((s, u) => s + u.aantal_medewerkers, 0)}</td>
                    <td className={pvTd + ' font-bold'}>100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardBody>
      </Card>

      {/* Onderbouwing vraag: lopende projecten met openstaande arbeidsuren */}
      <Card>
        <CardBody>
          <h3 className="mb-1 font-[var(--font-display)] text-[15px] font-semibold text-neutral-900">
            Nog uit te voeren uren per project
          </h3>
          <p className="mb-3 text-[12px] text-neutral-500">
            Arbeidsuren-saldo (prognose − geboekt) uit Bouw7, over de lopende projecten.
          </p>
          {projecten.length === 0 ? (
            <EmptyState size="sm" tone="neutral" title="Geen openstaande arbeidsuren" description="Synchroniseer Management om arbeidsuren op te halen." />
          ) : (
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0">
                  <tr>
                    <th className={pvTh + ' text-left'}>Project</th>
                    <th className={pvTh + ' text-left'}>Naam</th>
                    <th className={pvTh + ' text-left'}>Filiaal</th>
                    <th className={pvTh}>Uren saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {projecten.map(p => (
                    <tr key={p.bouw7_id ?? p.projectnummer}>
                      <td className={pvTd + ' text-left font-medium'}>{p.projectnummer}</td>
                      <td className={pvTd + ' text-left'}>{p.projectnaam}</td>
                      <td className={pvTd + ' text-left'}>{p.filiaal ?? '—'}</td>
                      <td className={pvTd + ' font-semibold'}>{fUren(p.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
