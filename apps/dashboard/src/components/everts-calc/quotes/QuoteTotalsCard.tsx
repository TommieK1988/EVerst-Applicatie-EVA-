'use client'

import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { updateQuoteSettings, herbereken } from '@/app/(platform)/everts-calc/actions/quotes'
import type { Quote } from '@/lib/everts-calc/types-quotes'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'

interface Props {
  quote: Quote
}

export default function QuoteTotalsCard({ quote }: Props) {
  const [btw, setBtw] = useState(quote.btw_pct)
  const [detail, setDetail] = useState(quote.detailregels_tonen)
  const [stelpostenIn, setStelpostenIn] = useState(quote.stelposten_in_totaal)
  const [, startTransition] = useTransition()
  const [recalcPending, startRecalc] = useTransition()

  function handleBtwChange(pct: number) {
    setBtw(pct)
    startTransition(() => {
      updateQuoteSettings(quote.id, { btw_pct: pct })
    })
  }

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
  const btwBedrag = Math.round(subtotaal * btw) / 100
  const totaal = Math.round((subtotaal + btwBedrag) * 100) / 100

  const heeftStelposten = quote.stelposten_subtotaal > 0
  const heeftOpties = quote.opties_subtotaal > 0

  return (
    <Card>
      <CardHeader>
        <span>Totalen</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleHerbereken}
          disabled={recalcPending}
          title="Herbereken totalen"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${recalcPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardBody className="space-y-3">
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

        {/* BTW */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span className="text-slate-500">BTW</span>
            <select
              value={btw}
              onChange={(e) => handleBtwChange(Number(e.target.value))}
              className="text-xs px-1.5 py-0.5 border border-slate-200 rounded text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-everts/30"
            >
              <option value={0}>0%</option>
              <option value={9}>9%</option>
              <option value={21}>21%</option>
            </select>
          </div>
          <span className="text-slate-600">
            € {btwBedrag.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
          </span>
        </div>

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
            <Switch
              size="sm"
              checked={stelpostenIn}
              onCheckedChange={handleStelpostenToggle}
            />
            <span className="text-xs text-slate-500">Stelposten meenemen in totaal</span>
          </div>
        )}

        {/* Detailregels tonen toggle */}
        <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
          <Switch
            size="sm"
            checked={detail}
            onCheckedChange={handleDetailChange}
          />
          <span className="text-xs text-slate-500">Detailregels tonen in offerte</span>
        </div>
      </CardBody>
    </Card>
  )
}
