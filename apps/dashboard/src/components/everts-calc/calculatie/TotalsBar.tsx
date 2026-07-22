'use client'

import { useEffect, useState } from 'react'
import { berekenBtwBreakdown, formatEuro, formatPct } from '@/lib/everts-calc/calculations'
import type { Scenario, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

interface Props {
  scenario: Scenario
  kostprijs_live: number
  verkoopprijs_live: number
  regels?: Calculatieregel[]
  componenten?: Componentregel[]
  onScenarioWijzig: (patch: Partial<Scenario>) => void
}


export default function TotalsBar({
  scenario, kostprijs_live, verkoopprijs_live, regels, componenten, onScenarioWijzig,
}: Props) {
  const defaultOpslag = scenario.opslag_algemene_kosten + (scenario.opslag_winst_risico ?? 0)
  const btwDefault = scenario.btw_pct_default ?? 0

  const [btw_groepen, setBtwGroepen] = useState(() =>
    regels && componenten && regels.length > 0
      ? berekenBtwBreakdown(regels, componenten, defaultOpslag, btwDefault)
      : [{ pct: btwDefault, basis: verkoopprijs_live, btw: verkoopprijs_live * (btwDefault / 100) }]
  )

  useEffect(() => {
    if (regels && componenten && regels.length > 0) {
      setBtwGroepen(berekenBtwBreakdown(regels, componenten, defaultOpslag, btwDefault))
    } else {
      setBtwGroepen([{
        pct: btwDefault,
        basis: verkoopprijs_live,
        btw: verkoopprijs_live * (btwDefault / 100),
      }])
    }
  }, [verkoopprijs_live, kostprijs_live, regels, componenten, defaultOpslag, btwDefault])

  const btw_totaal   = btw_groepen.reduce((s, g) => s + g.btw, 0)
  const totaal_incl  = verkoopprijs_live + btw_totaal
  const marge_euro   = verkoopprijs_live - kostprijs_live
  const marge_pct    = verkoopprijs_live > 0 ? (marge_euro / verkoopprijs_live) * 100 : 0
  const opslag_euro  = verkoopprijs_live - kostprijs_live
  const opslag_pct   = kostprijs_live > 0 ? (opslag_euro / kostprijs_live) * 100 : 0
  const margeWidth = Math.min(100, Math.max(0, (marge_pct / 30) * 100))

  return (
    <div className="flex-shrink-0 bg-brand-900 border-t-2 border-brand-500 text-white">
      <div className="flex items-stretch gap-0 divide-x divide-white/10 overflow-x-auto">

        {/* Standaard uurtarief */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5 flex items-center gap-1">
            Uurtarief AB
          </div>
          <div className="flex items-center gap-0.5  text-sm">
            <span className="text-white/50 text-xs">€</span>
            <input
              type="number" step="0.50" min="0"
              value={scenario.standaard_uurtarief ?? ''}
              placeholder="—"
              onChange={e => {
                const v = parseFloat(e.target.value)
                onScenarioWijzig({ standaard_uurtarief: isNaN(v) ? undefined : v })
              }}
              className="w-14 bg-paper/10 hover:bg-paper/20 focus:bg-paper/30 rounded px-1 py-0.5 text-xs  text-white focus:outline-none focus:ring-1 focus:ring-white/40 border-0 placeholder-white/30"
            />
            <span className="text-white/50 text-xs">/u</span>
          </div>
        </div>

        {/* Kostprijs */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Kostprijs</div>
          <div className="font-semibold  text-sm">{formatEuro(kostprijs_live)}</div>
        </div>

        {/* Opslag (effectief, read-only) */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Opslag</div>
          <div className=" text-sm text-white/80">
            {opslag_pct.toFixed(2)}%
            <span className="text-white/40 text-xs ml-1">({opslag_euro >= 0 ? '+' : ''}{formatEuro(opslag_euro)})</span>
          </div>
        </div>

        {/* Verkoopprijs excl. BTW */}
        <div className="px-4 py-2.5 flex-1 min-w-0">
          <div className="text-white/50 text-xs mb-0.5">VP excl. BTW</div>
          <div className="font-bold  text-base text-everts-light">{formatEuro(verkoopprijs_live)}</div>
        </div>

        {/* BTW: per tarief (altijd read-only; instellen via rekenregels) */}
        {btw_groepen.map(g => (
          <div key={g.pct} className="px-4 py-2.5 min-w-0 flex-shrink-0">
            <div className="text-white/50 text-xs mb-0.5">BTW {g.pct}%</div>
            <div className=" text-sm text-white/80">+ {formatEuro(g.btw)}</div>
          </div>
        ))}

        {/* Totaal incl. BTW */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Totaal incl. BTW</div>
          <div className="font-bold  text-base text-white">{formatEuro(totaal_incl)}</div>
        </div>

        {/* Marge */}
        <div className="px-5 py-2.5 min-w-[130px] flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Marge</div>
          <div
            className="font-bold  text-base"
            style={{ color: marge_pct >= 20 ? '#61ac2b' : marge_pct >= 12 ? '#ffb866' : '#fda29b' }}
          >
            {formatPct(marge_pct)}
          </div>
          <div className="mt-1 h-1 bg-paper/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${margeWidth}%`,
                background: marge_pct >= 20 ? '#61ac2b' : marge_pct >= 12 ? '#ffb866' : '#fda29b',
              }}
            />
          </div>
        </div>

      </div>
    </div>
  )
}
