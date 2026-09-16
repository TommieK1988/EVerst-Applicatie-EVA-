'use client'

/**
 * Commerciële sturing onder de funnel: wat verwachten we wanneer, waar blijft het hangen,
 * bij wie, en wat staat er stil.
 *
 * De funnel erboven telt standen (hoeveel offertes, welke win-rate). Dit blok gaat over
 * beweging. Daarom staat het eronder en niet ertussen: wie alleen de stand wil zien hoeft
 * niet door de prognose heen te scrollen.
 */

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { StatCard } from '@/components/ui/stat-card'
import { ChartCard, CHART_COLORS, CHART_TOOLTIP_STYLE, CHART_AXIS_PROPS } from '@/components/ui/chart'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@everts/ui'
import { fEur, fEurK, fPct, pvTh, pvTd } from '@/lib/dashboard/aggregaties'
import { dossierPad } from '@/components/dossiers/open-dossier'
import { Euro, Hourglass, TrendingUp } from 'lucide-react'
import type { CommercieCijfers } from '@/lib/commercie/rapportage'

const C_GROEN = CHART_COLORS[0]

function fDagen(v: number): string {
  return `${v.toFixed(v < 10 ? 1 : 0)} d`
}

export default function CommercieBlok({ cijfers }: { cijfers: CommercieCijfers }) {
  const c = cijfers
  const dekking = c.metKans + c.zonderKans > 0
    ? (c.metKans / (c.metKans + c.zonderKans)) * 100
    : null

  return (
    <div className="flex flex-col gap-4 pb-6">

      {/* ── Verwachte omzet ───────────────────────────────────────────── */}
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-neutral-500">
          Verwachte omzet uit de pijplijn
        </div>
        <div className="grid grid-cols-3 gap-3">
          <StatCard
            label="Openstaand (ongewogen)" tone="brand" icon={<Euro className="h-5 w-5" />}
            value={fEurK(c.openWaarde)}
            trend={{ direction: 'flat', value: `${c.metKans + c.zonderKans} open offertes` }}
          />
          <StatCard
            label="Kans-gewogen" tone="success" icon={<TrendingUp className="h-5 w-5" />}
            value={fEurK(c.gewogenWaarde)}
            trend={{ direction: 'flat', value: dekking != null ? `${fPct(dekking)} heeft een kans` : 'geen kansen ingevuld' }}
          />
          <StatCard
            label="Zonder kanspercentage" tone={c.zonderKans > 0 ? 'warning' : 'success'}
            icon={<Hourglass className="h-5 w-5" />}
            value={String(c.zonderKans)}
            trend={{ direction: 'flat', value: 'tellen niet mee in de prognose' }}
          />
        </div>
        <p className="mt-2 text-[11px] italic text-neutral-500">
          De kans-gewogen pijplijn telt elke open offerte mee naar rato van het ingevulde
          kanspercentage. Offertes zonder kans tellen voor niets mee, dus dit bedrag is altijd
          een ondergrens. Bedragen komen — net als de rest van dit scherm — uit het
          Bouw7-offertebedrag; de werklijst op Offertes telt daar meerwerk en stelposten bij op
          en kan daardoor hoger uitkomen.
        </p>
      </div>

      {/* ── Per maand ─────────────────────────────────────────────────── */}
      <ChartCard
        title="Verwachte opdrachten per maand"
        subtitle="Kans-gewogen bedrag, geplaatst op de maand waarin de opdracht wordt verwacht"
      >
        {c.perMaand.length === 0 ? (
          <EmptyState
            title="Nog geen prognose"
            description="Vul op de bewakingstab een kans en een verwachte maand in; die verschijnen hier."
          />
        ) : (
          // Vaste hoogte op de wikkel + height="100%", net als de grafieken in FunnelView.
          // Met een numerieke `height` op de ResponsiveContainer zelf tekent recharts de staven
          // tegen een andere schaal dan de as: de as klopt dan wel, de staven niet.
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={c.perMaand} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e9eb" vertical={false} />
                <XAxis dataKey="maand" {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} />
                <YAxis
                  {...CHART_AXIS_PROPS} axisLine={false} tickLine={false} width={70}
                  tickFormatter={(v: number) => fEurK(v)}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(v) => [fEur(typeof v === 'number' ? v : Number(v)), 'Gewogen']}
                />
                {/* Zonder animatie: recharts interpoleert de staafhoogte bij het inkomen, en als er
                    tijdens die animatie opnieuw gerenderd wordt (in dev doet React dat standaard)
                    blijft de staaf op een tussenstand staan — hier 61% van de juiste hoogte.
                    Vier getallen hebben geen animatie nodig; dit haalt de hele faalmodus weg. */}
                <Bar
                  dataKey="gewogen" name="Gewogen" fill={C_GROEN}
                  radius={[3, 3, 0, 0]} maxBarSize={64} isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </ChartCard>

      {/* ── Tijd per fase ─────────────────────────────────────────────── */}
      <ChartCard
        title="Hoe lang een offerte in elke fase staat"
        subtitle="Alleen afgeronde verblijven — de fase waar een offerte nú in zit telt nog niet mee"
      >
        {c.perFase.length === 0 ? (
          <EmptyState
            title="Nog te weinig fasewissels"
            description="Zodra offertes een paar fases hebben doorlopen, verschijnt hier hoe lang dat duurde."
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={cn(pvTh, "text-left")}>Fase</th>
                <th className={pvTh}>Gemiddeld</th>
                <th className={pvTh}>Mediaan</th>
                <th className={pvTh}>Gemeten</th>
              </tr>
            </thead>
            <tbody>
              {c.perFase.map(f => (
                <tr key={f.fase}>
                  <td className={pvTd}>{f.label}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{fDagen(f.gemDagen)}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{fDagen(f.medDagen)}</td>
                  <td className={cn(pvTd, "text-right tabular-nums text-neutral-500")}>{f.aantal}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] italic text-neutral-500">
          Loopt Nabellen op, dan blijven offertes te lang liggen ná verzending. Loopt In
          behandeling op, dan wachten klanten te lang op antwoord van ons. De mediaan is
          betrouwbaarder dan het gemiddelde zolang het aantal metingen klein is.
        </p>
      </ChartCard>

      {/* ── Per eigenaar ──────────────────────────────────────────────── */}
      <ChartCard
        title="Conversie per commercieel eigenaar"
        subtitle="Win-rate over besliste trajecten; open offertes tellen daar niet in mee"
      >
        {c.perEigenaar.length === 0 ? (
          <EmptyState
            title="Nog geen eigenaren toegewezen"
            description="Wijs op de bewakingstab een commercieel eigenaar aan; daarna verschijnt hier de conversie."
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={cn(pvTh, "text-left")}>Eigenaar</th>
                <th className={pvTh}>Trajecten</th>
                <th className={pvTh}>Gewonnen</th>
                <th className={pvTh}>Verloren</th>
                <th className={pvTh}>Win-rate</th>
                <th className={pvTh}>Open</th>
                <th className={pvTh}>Gewogen</th>
              </tr>
            </thead>
            <tbody>
              {c.perEigenaar.map(e => (
                <tr key={e.naam}>
                  <td className={pvTd}>{e.naam}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{e.offertes}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{e.gewonnen}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{e.verloren}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{fPct(e.winrate)}</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>
                    {e.openAantal} · {fEurK(e.openWaarde)}
                  </td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{fEurK(e.gewogen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ChartCard>

      {/* ── Stilstand ─────────────────────────────────────────────────── */}
      <ChartCard
        title={`Offertes zonder beweging (${c.stilstandDrempelDagen}+ dagen)`}
        subtitle="Geen klantcontact, geen fasewissel en geen nieuwe afspraak sinds deze datum"
      >
        {c.stilTotaal > 0 && (
          <div className="mb-3 flex flex-wrap items-baseline gap-x-2 text-[13px]">
            <span className="text-lg font-bold text-neutral-900">
              {c.stilTotaal} van {c.openAantal}
            </span>
            <span className="text-neutral-600">open offertes · {fEur(c.stilWaarde)}</span>
          </div>
        )}
        {c.stilstaand.length === 0 ? (
          <EmptyState
            title="Alles is in beweging"
            description={`Geen open offerte staat langer dan ${c.stilstandDrempelDagen} dagen stil.`}
          />
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className={cn(pvTh, "text-left")}>Offerte</th>
                <th className={pvTh}>Stil sinds</th>
                <th className={pvTh}>Bedrag</th>
              </tr>
            </thead>
            <tbody>
              {c.stilstaand.map(s => (
                <tr key={s.dossier_id}>
                  <td className={pvTd}>
                    <a
                      href={`${dossierPad('offerte', s.dossier_id)}/bewaking`}
                      className="text-brand-600 hover:underline"
                    >
                      {s.titel}
                    </a>
                  </td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{s.dagen} dagen</td>
                  <td className={cn(pvTd, "text-right tabular-nums")}>{fEur(s.bedrag)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-[11px] italic text-neutral-500">
          {c.stilTotaal > c.stilstaand.length
            ? `Hierboven de ${c.stilstaand.length} langst stilstaande; de overige ${c.stilTotaal - c.stilstaand.length} staan in de werklijst op Offertes. `
            : ''}
          Let op bij het eerste gebruik: zolang niemand uitkomsten vastlegde, is er per definitie
          geen beweging geregistreerd en telt bijna elke offerte hier mee. Dit cijfer wordt pas
          een oordeel over de opvolging zodra de bewaking een paar weken in gebruik is.
        </p>
      </ChartCard>
    </div>
  )
}
