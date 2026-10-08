'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@everts/ui'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { fEurK, pvTh, pvTd, margeTone } from '@/lib/dashboard/aggregaties'
import {
  fPp, deltaKleur, DREMPEL_MARGE_PP, DREMPEL_RESULTAAT, DREMPEL_OPDRACHT, MIN_OPDRACHT,
  type Wijzigingen, type WerkWijziging, type WerkCijfers,
} from '@/lib/dashboard/wijzigingen'
import { filiaalKleur } from './format'

const TOP = 10

/**
 * Werken die flink verschoven zijn t.o.v. een vastgestelde maand. Gesorteerd op % marge;
 * meerwerk tegen gelijke marge staat apart en ingeklapt onderaan.
 */
export default function GroteWijzigingen({
  wijzigingen, sindsLabel, kopActies, onKiesWerk,
}: {
  wijzigingen: Wijzigingen | null
  /** "september 2026" — waartegen vergeleken wordt. */
  sindsLabel: string | null
  /** Rechts in de kop, bv. de maandkeuze. */
  kopActies?: React.ReactNode
  onKiesWerk: (werk: WerkCijfers) => void
}) {
  const [meerwerkOpen, setMeerwerkOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="gap-3 flex-wrap">
        <span>Grote wijzigingen{sindsLabel ? ` t.o.v. vastgesteld ${sindsLabel}` : ''}</span>
        {kopActies}
      </CardHeader>
      <CardBody className="p-0">
        {!wijzigingen ? (
          <div className="px-[18px] py-6 text-center text-[12px] text-neutral-500">
            Er zijn nog geen vastgestelde maandcijfers om mee te vergelijken.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 xl:divide-x divide-neutral-200">
              <Lijst
                titel="Marge gedaald" tone="error" rijen={wijzigingen.gedaald}
                leeg={`Geen werken met een duidelijk lagere marge${sindsLabel ? ` sinds ${sindsLabel}` : ''}.`}
                onKiesWerk={onKiesWerk}
              />
              <Lijst
                titel="Marge gestegen" tone="success" rijen={wijzigingen.gestegen}
                leeg={`Geen werken met een duidelijk hogere marge${sindsLabel ? ` sinds ${sindsLabel}` : ''}.`}
                onKiesWerk={onKiesWerk}
              />
            </div>

            <div className="border-t border-neutral-200">
              <button
                type="button"
                onClick={() => setMeerwerkOpen(o => !o)}
                className="flex w-full items-center gap-2 px-[18px] py-3 text-left text-[12px] font-semibold text-neutral-700 hover:bg-neutral-50"
              >
                {meerwerkOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                Opdracht gewijzigd, marge stabiel ({wijzigingen.opdrachtGewijzigd.length})
                <span className="font-normal text-neutral-500">meestal meerwerk of minderwerk</span>
              </button>
              {meerwerkOpen && (
                <WijzigingTabel rijen={wijzigingen.opdrachtGewijzigd} onKiesWerk={onKiesWerk}
                  leeg="Geen werken met een grote opdrachtwijziging." />
              )}
            </div>

            <div className="border-t border-neutral-200 px-[18px] py-2 text-[11px] text-neutral-500">
              Werken vanaf {fEurK(MIN_OPDRACHT)} opdrachtwaarde die minstens {DREMPEL_MARGE_PP} procentpunt marge
              of {fEurK(DREMPEL_RESULTAAT)} verwacht resultaat verschoven zijn. Opdrachtwijzigingen vanaf{' '}
              {fEurK(DREMPEL_OPDRACHT)} zonder margeverschuiving staan apart. Klik op een werk voor het verloop.
            </div>
          </>
        )}
      </CardBody>
    </Card>
  )
}

function Lijst({ titel, tone, rijen, leeg, onKiesWerk }: {
  titel: string
  tone: 'error' | 'success'
  rijen: WerkWijziging[]
  leeg: string
  onKiesWerk: (werk: WerkCijfers) => void
}) {
  const [alles, setAlles] = useState(false)
  const Icoon = tone === 'error' ? TrendingDown : TrendingUp
  const zichtbaar = alles ? rijen : rijen.slice(0, TOP)
  return (
    <div className="min-w-0">
      <div className={cn(
        'flex items-center gap-2 px-[18px] py-2 text-[10.5px] font-semibold uppercase tracking-[0.05em]',
        tone === 'error' ? 'text-error-700' : 'text-success-700',
      )}>
        <Icoon className="h-4 w-4" /> {titel} ({rijen.length})
      </div>
      <WijzigingTabel rijen={zichtbaar} onKiesWerk={onKiesWerk} leeg={leeg} />
      {rijen.length > TOP && (
        <button type="button" onClick={() => setAlles(a => !a)}
          className="w-full px-[18px] py-2 text-left text-[12px] font-semibold text-brand-700 hover:bg-neutral-50">
          {alles ? 'Toon minder' : `Toon alle ${rijen.length}`}
        </button>
      )}
    </div>
  )
}

function WijzigingTabel({ rijen, leeg, onKiesWerk }: {
  rijen: WerkWijziging[]
  leeg: string
  onKiesWerk: (werk: WerkCijfers) => void
}) {
  if (rijen.length === 0) {
    return <div className="px-[18px] pb-4 pt-1 text-[12px] text-neutral-500">{leeg}</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={cn(pvTh, 'text-left')}>Werk</th>
            <th className={pvTh}>Marge</th>
            <th className={pvTh}>Δ marge</th>
            <th className={pvTh}>Δ resultaat</th>
            <th className={pvTh}>Δ opdracht</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map(r => (
            <tr key={r.werk.bouw7_id ?? r.werk.projectnummer}
              onClick={() => onKiesWerk(r.werk)}
              className="cursor-pointer hover:bg-neutral-50">
              <td className={cn(pvTd, 'max-w-[280px]')}>
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="font-mono text-[11.5px] font-bold" style={{ color: filiaalKleur(r.werk.filiaal) }}>
                    {r.werk.projectnummer}
                  </span>
                  <span className="truncate font-medium" title={r.werk.projectnaam ?? undefined}>{r.werk.projectnaam}</span>
                </div>
                {r.werk.projectleider && <div className="text-[11px] text-neutral-500 truncate">{r.werk.projectleider}</div>}
              </td>
              <td className={cn(pvTd, 'text-right')}>
                <span className="text-neutral-500">{r.margeOud.toFixed(1)}%</span>
                <span className="mx-1 text-neutral-400">→</span>
                <span className={margeTone(r.margeNieuw)}>{r.margeNieuw.toFixed(1)}%</span>
              </td>
              <td className={cn(pvTd, 'text-right', deltaKleur(r.deltaMarge))}>{fPp(r.deltaMarge)}</td>
              <td className={cn(pvTd, 'text-right', r.deltaResultaat < 0 ? 'text-error-500' : 'text-neutral-600')}>
                {fDeltaEur(r.deltaResultaat)}
              </td>
              <td className={cn(pvTd, 'text-right text-neutral-500')}>{fDeltaEur(r.deltaOpdracht)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function fDeltaEur(v: number): string {
  if (Math.abs(v) < 0.5) return '—'
  return `${v > 0 ? '+' : '−'}${fEurK(Math.abs(v))}`
}
