'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { updateQuoteSettings, herbereken } from '@/app/actions/quotes'
import type { Quote } from '@/lib/types-quotes'

interface Props {
  quote: Quote
}

export default function QuoteTotalsCard({ quote }: Props) {
  const [detail, setDetail] = useState(quote.detailregels_tonen)
  const [stelpostenIn, setStelpostenIn] = useState(quote.stelposten_in_totaal)
  const [, startTransition] = useTransition()
  const [recalcPending, startRecalc] = useTransition()

  function handleDetailChange(val: boolean) {
    setDetail(val)
    startTransition(() => {
      updateQuoteSettings(quote.id, { detailregels_tonen: val })
    })
  }

  function handleStelpostenToggle(val: boolean) {
    setStelpostenIn(val)
    startTransition(() => {
      updateQuoteSettings(quote.id, { stelposten_in_totaal: val })
    })
  }

  function handleHerbereken() {
    startRecalc(() => {
      herbereken(quote.id)
    })
  }

  const subtotaal = quote.subtotaal_ex_btw
  const heeftStelposten = quote.stelposten_subtotaal > 0
  const heeftOpties = quote.opties_subtotaal > 0

  // BTW-breakdown per tarief op basis van per-regel btw_pct
  const btwGroepen: { pct: number; btw: number }[] = (() => {
    const groepen = new Map<number, number>()
    for (const s of (quote.sections ?? [])) {
      if (s.is_optioneel) continue
      for (const l of (s.lines ?? [])) {
        if (!l.is_stelpost || stelpostenIn) {
          const pct = l.btw_pct ?? quote.btw_pct ?? 21
          groepen.set(pct, (groepen.get(pct) ?? 0) + l.line_total)
        }
      }
    }
    if (groepen.size === 0) {
      return [{ pct: quote.btw_pct ?? 21, btw: quote.btw_bedrag }]
    }
    return Array.from(groepen.entries())
      .sort(([a], [b]) => a - b)
      .map(([pct, basis]) => ({ pct, btw: Math.round(basis * pct) / 100 }))
  })()

  const totaal = Math.round((subtotaal + btwGroepen.reduce((s, g) => s + g.btw, 0)) * 100) / 100

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700">Totalen</h3>
        <button
          onClick={handleHerbereken}
          disabled={recalcPending}
          title="Herbereken totalen"
          className="p-1 rounded text-slate-400 hover:text-everts transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalcPending ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-4 space-y-3">
        {/* Subtotaal */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Subtotaal ex BTW</span>
          <span className="font-medium text-slate-800">
            € {subtotaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Stelposten regel */}
        {heeftStelposten && (
          <div className="flex items-center justify-between text-sm text-orange-600">
            <span className="flex items-center gap-1.5">
              <span className="text-xs">w.v. stelposten</span>
              {!stelpostenIn && (
                <span className="text-xs text-slate-400 italic">(excl.)</span>
              )}
            </span>
            <span>
              € {quote.stelposten_subtotaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* Opties regel */}
        {heeftOpties && (
          <div className="flex items-center justify-between text-sm text-amber-600">
            <span className="text-xs">w.v. opties (excl.)</span>
            <span>
              € {quote.opties_subtotaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
            </span>
          </div>
        )}

        {/* BTW per tarief */}
        {btwGroepen.map(g => (
          <div key={g.pct} className="flex items-center justify-between text-sm">
            <span className="text-slate-500">BTW {g.pct}%</span>
            <span className="text-slate-600">
              € {g.btw.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
            </span>
          </div>
        ))}

        {/* Totaal */}
        <div className="flex items-center justify-between py-2 border-t border-slate-200">
          <span className="text-sm font-semibold text-slate-800">Totaal incl BTW</span>
          <span className="text-base font-bold text-slate-900">
            € {totaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
          </span>
        </div>

        {/* Stelposten in totaal toggle */}
        {heeftStelposten && (
          <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
            <button
              onClick={() => handleStelpostenToggle(!stelpostenIn)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                stelpostenIn ? 'bg-orange-400' : 'bg-slate-200'
              }`}
            >
              <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                stelpostenIn ? 'translate-x-4.5' : 'translate-x-0.5'
              }`} />
            </button>
            <span className="text-xs text-slate-500">Stelposten meenemen in totaal</span>
          </div>
        )}

        {/* Detailregels tonen toggle */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <button
            onClick={() => handleDetailChange(!detail)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              detail ? 'bg-everts' : 'bg-slate-200'
            }`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
              detail ? 'translate-x-4.5' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-xs text-slate-500">Detailregels tonen in offerte</span>
        </div>
      </div>
    </div>
  )
}
