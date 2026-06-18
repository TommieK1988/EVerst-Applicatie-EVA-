'use client'

import { useState, useMemo } from 'react'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@everts/ui'
import { ChevronUp, ChevronDown } from 'lucide-react'
import {
  fEur, fEurK, fPct, pvTh, pvTd,
  type CalculatorStat,
} from '@/lib/dashboard/aggregaties'

type SortKey = 'naam' | 'offertes' | 'gewonnen' | 'verloren' | 'winrate' | 'gewonnenWaarde' | 'gemOffertewaarde' | 'gemDoorlooptijdDagen' | 'openPipelineWaarde'

const fAantal = (n: number) => new Intl.NumberFormat('nl-NL').format(n)

function winrateClass(v: number | null): string {
  if (v == null) return 'text-neutral-400'
  if (v >= 50) return 'text-success-700 font-semibold'
  if (v >= 30) return 'text-warning-700 font-semibold'
  return 'text-error-500 font-semibold'
}

export default function CalculatorsView({ calculators }: { calculators: CalculatorStat[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('gewonnenWaarde')
  const [asc, setAsc] = useState(false)

  const rows = useMemo(() => {
    const sorted = [...calculators].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey]
      if (typeof va === 'string' || typeof vb === 'string') {
        return String(va ?? '').localeCompare(String(vb ?? ''))
      }
      return ((va as number | null) ?? -Infinity) - ((vb as number | null) ?? -Infinity)
    })
    return asc ? sorted : sorted.reverse()
  }, [calculators, sortKey, asc])

  function sorteer(key: SortKey) {
    if (key === sortKey) setAsc(a => !a)
    else { setSortKey(key); setAsc(false) }
  }

  if (calculators.length === 0) {
    return (
      <div className="pt-4">
        <EmptyState
          title="Geen calculatorgegevens"
          description="Er zijn nog geen dossiers met een gekoppelde calculator."
          tone="neutral"
        />
      </div>
    )
  }

  const Th = ({ k, children, left }: { k: SortKey; children: React.ReactNode; left?: boolean }) => (
    <th className={cn(pvTh, left && 'text-left', 'cursor-pointer select-none hover:text-neutral-700')}
      onClick={() => sorteer(k)}>
      <span className={cn('inline-flex items-center gap-1', !left && 'justify-end')}>
        {children}
        {sortKey === k && (asc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />)}
      </span>
    </th>
  )

  // Totaalrij
  const tot = calculators.reduce((a, c) => ({
    offertes: a.offertes + c.offertes,
    gewonnen: a.gewonnen + c.gewonnen,
    verloren: a.verloren + c.verloren,
    gewonnenWaarde: a.gewonnenWaarde + c.gewonnenWaarde,
    openPipelineWaarde: a.openPipelineWaarde + c.openPipelineWaarde,
  }), { offertes: 0, gewonnen: 0, verloren: 0, gewonnenWaarde: 0, openPipelineWaarde: 0 })
  const totWinrate = (tot.gewonnen + tot.verloren) > 0 ? (tot.gewonnen / (tot.gewonnen + tot.verloren)) * 100 : null

  return (
    <div className="pb-6">
      <Card>
        <CardHeader>Prestaties per calculator</CardHeader>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr>
                  <Th k="naam" left>Calculator</Th>
                  <Th k="offertes">Offertes</Th>
                  <Th k="gewonnen">Gewonnen</Th>
                  <Th k="verloren">Verloren</Th>
                  <Th k="winrate">Win-rate</Th>
                  <Th k="gewonnenWaarde">Waarde gewonnen</Th>
                  <Th k="gemOffertewaarde">Gem. offerte</Th>
                  <Th k="gemDoorlooptijdDagen">Doorlooptijd</Th>
                  <Th k="openPipelineWaarde">Open pipeline</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={c.calculator_id} className={i % 2 === 0 ? 'bg-white' : 'bg-neutral-50/60'}>
                    <td className={pvTd}>
                      <span className="inline-flex items-center gap-2 font-medium text-neutral-900">
                        <span className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                          style={{ background: c.kleur ?? 'var(--neutral-300)' }} />
                        {c.naam}
                      </span>
                    </td>
                    <td className={cn(pvTd, 'text-right')}>{fAantal(c.offertes)}</td>
                    <td className={cn(pvTd, 'text-right text-success-700')}>{fAantal(c.gewonnen)}</td>
                    <td className={cn(pvTd, 'text-right text-neutral-600')}>{fAantal(c.verloren)}</td>
                    <td className={cn(pvTd, 'text-right')}>
                      <span className={winrateClass(c.winrate)}>{c.winrate != null ? fPct(c.winrate) : '—'}</span>
                    </td>
                    <td className={cn(pvTd, 'text-right font-semibold')}>{fEur(c.gewonnenWaarde || null)}</td>
                    <td className={cn(pvTd, 'text-right text-neutral-600')}>{c.gemOffertewaarde != null ? fEurK(c.gemOffertewaarde) : '—'}</td>
                    <td className={cn(pvTd, 'text-right text-neutral-600')}>{c.gemDoorlooptijdDagen != null ? `${c.gemDoorlooptijdDagen.toFixed(0)} d` : '—'}</td>
                    <td className={cn(pvTd, 'text-right text-neutral-600')}>{fEur(c.openPipelineWaarde || null)}</td>
                  </tr>
                ))}
                <tr className="bg-success-50/50 font-bold border-t-2 border-success-300">
                  <td className={pvTd}><span className="font-bold text-success-700">Totaal</span></td>
                  <td className={cn(pvTd, 'text-right')}>{fAantal(tot.offertes)}</td>
                  <td className={cn(pvTd, 'text-right text-success-700')}>{fAantal(tot.gewonnen)}</td>
                  <td className={cn(pvTd, 'text-right text-neutral-600')}>{fAantal(tot.verloren)}</td>
                  <td className={cn(pvTd, 'text-right')}>
                    <span className={winrateClass(totWinrate)}>{totWinrate != null ? fPct(totWinrate) : '—'}</span>
                  </td>
                  <td className={cn(pvTd, 'text-right')}>{fEur(tot.gewonnenWaarde || null)}</td>
                  <td className={cn(pvTd, 'text-right')} />
                  <td className={cn(pvTd, 'text-right')} />
                  <td className={cn(pvTd, 'text-right')}>{fEur(tot.openPipelineWaarde || null)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      <p className="text-[11px] text-neutral-500 italic mt-2 px-1">
        Win/verlies op basis van de huidige dossierstatus. &quot;Offertes&quot; = dossiers die minimaal de offertefase bereikten.
        Klik op een kolomkop om te sorteren.
      </p>
    </div>
  )
}
