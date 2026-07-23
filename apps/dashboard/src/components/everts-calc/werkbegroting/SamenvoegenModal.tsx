'use client'

import { useState, useCallback } from 'react'
import { Merge, Package, HardHat } from 'lucide-react'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type { WerkbegrotingComponent, WerkbegrotingRegel, ComponentType } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@/components/ui/dialog'

export interface SamenvoegenItem {
  comp: WerkbegrotingComponent
  regel: WerkbegrotingRegel
  totaalAantal: number
  totaalPrijs: number
}

export interface SamenvoegResultaat {
  omschrijving: string
  artikelnummer?: string
  leverancier_naam?: string
  uurtype?: string
  eenheid: string
  totaalAantal: number
  prijsPerEenheid: number
}

interface Props {
  items: SamenvoegenItem[]
  /** Type van de samen te voegen regels — bepaalt de getoonde velden (materieel vs arbeid). */
  type: ComponentType
  onBevestig: (data: SamenvoegResultaat) => void
  onSluit: () => void
}

// Afgeleid startpunt voor het samengevoegde resultaat
function berekenStartwaarden(items: SamenvoegenItem[], type: ComponentType): SamenvoegResultaat {
  const totaalAantal    = items.reduce((s, i) => s + i.totaalAantal, 0)
  const totaalPrijs     = items.reduce((s, i) => s + i.totaalPrijs,  0)
  const prijsPerEenheid = totaalAantal > 0 ? totaalPrijs / totaalAantal : 0

  // Omschrijving: gemeenschappelijke basis of samengevoegde versie
  const eersteOmschrijving = items[0].comp.omschrijving ?? items[0].regel.omschrijving ?? ''
  const alleZelfdeName = items.every(i =>
    (i.comp.omschrijving ?? i.regel.omschrijving ?? '') === eersteOmschrijving
  )
  const omschrijving = alleZelfdeName
    ? eersteOmschrijving
    : items.map(i => i.comp.omschrijving ?? i.regel.omschrijving ?? '').filter(Boolean).join(' + ')

  const defaultEenheid = type === 'arbeid' ? 'uur' : 'st'

  return {
    omschrijving,
    artikelnummer:    type === 'arbeid' ? undefined : items[0].comp.artikelnummer,
    leverancier_naam: type === 'arbeid' ? undefined : items[0].comp.leverancier_naam,
    uurtype:          type === 'arbeid' ? items[0].comp.uurtype : undefined,
    eenheid:          items[0].comp.eenheid ?? items[0].regel.eenheid ?? defaultEenheid,
    totaalAantal:     Math.round(totaalAantal * 100) / 100,
    prijsPerEenheid:  Math.round(prijsPerEenheid * 100) / 100,
  }
}

export default function SamenvoegenModal({ items, type, onBevestig, onSluit }: Props) {
  const isArbeid = type === 'arbeid'
  const [data, setData] = useState<SamenvoegResultaat>(() => berekenStartwaarden(items, type))

  const totaalPrijs = data.totaalAantal * data.prijsPerEenheid

  const patch = useCallback((update: Partial<SamenvoegResultaat>) => {
    setData(prev => ({ ...prev, ...update }))
  }, [])

  const onTotaalPrijsWijzig = (nieuwTotaal: number) => {
    const pph = data.totaalAantal > 0 ? nieuwTotaal / data.totaalAantal : 0
    setData(prev => ({ ...prev, prijsPerEenheid: Math.round(pph * 10000) / 10000 }))
  }

  const inputCls = `w-full text-sm px-2.5 py-1.5 border border-slate-200 rounded-lg
    focus:outline-none focus:border-everts/50 focus:ring-1 focus:ring-everts/20 bg-white`

  const labelCls = 'text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1'

  return (
    <Dialog open onOpenChange={open => { if (!open) onSluit() }}>
      <DialogContent size="md">

        {/* Header */}
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Merge className="w-4 h-4 text-everts" />
            <DialogTitle>Regels samenvoegen</DialogTitle>
            <span className="text-xs text-slate-400">({items.length} regels)</span>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-4">

          {/* Overzicht: wat wordt samengevoegd */}
          <div>
            <p className={labelCls}>Samen te voegen regels</p>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
              {items.map(item => (
                <div key={item.comp.id} className="flex items-center gap-3 px-3 py-2 bg-slate-50/50">
                  {isArbeid
                    ? <HardHat className="w-3.5 h-3.5 text-sky-500 flex-shrink-0" />
                    : <Package className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 truncate">
                      {item.comp.omschrijving ?? item.regel.omschrijving ?? '—'}
                    </p>
                    {(isArbeid ? item.comp.uurtype : item.comp.artikelnummer) && (
                      <p className="text-[10px] text-slate-400">{isArbeid ? item.comp.uurtype : item.comp.artikelnummer}</p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs  text-slate-600">
                      {item.totaalAantal % 1 === 0 ? item.totaalAantal.toFixed(0) : item.totaalAantal.toFixed(2)}
                      {' '}{item.comp.eenheid ?? item.regel.eenheid}
                    </p>
                    <p className="text-[10px]  text-slate-400">{formatEuro(item.totaalPrijs)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Scheidslijn */}
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-dashed border-slate-200" />
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">Samengevoegd resultaat</span>
            <div className="flex-1 border-t border-dashed border-slate-200" />
          </div>

          {/* Omschrijving */}
          <div>
            <p className={labelCls}>Omschrijving</p>
            <input
              className={inputCls}
              value={data.omschrijving}
              placeholder="Omschrijving van het samengevoegde materiaal…"
              onChange={e => patch({ omschrijving: e.target.value })}
            />
          </div>

          {/* Specificatie: uurtype (arbeid) of artikelnummer + leverancier (materiaal) */}
          {isArbeid ? (
            <div>
              <p className={labelCls}>Uurtype</p>
              <input
                className={inputCls}
                value={data.uurtype ?? ''}
                placeholder="Bijv. Gezel, Leerling…"
                onChange={e => patch({ uurtype: e.target.value || undefined })}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={labelCls}>Artikelnummer</p>
                <input
                  className={inputCls}
                  value={data.artikelnummer ?? ''}
                  placeholder="Artikelnr…"
                  onChange={e => patch({ artikelnummer: e.target.value || undefined })}
                />
              </div>
              <div>
                <p className={labelCls}>Leverancier</p>
                <input
                  className={inputCls}
                  value={data.leverancier_naam ?? ''}
                  placeholder="Leverancier…"
                  onChange={e => patch({ leverancier_naam: e.target.value || undefined })}
                />
              </div>
            </div>
          )}

          {/* Aantal + Eenheid + Prijs */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className={labelCls}>{isArbeid ? 'Totaal uren' : 'Totaal aantal'}</p>
              <input
                type="number" step="0.01" min="0"
                className={inputCls}
                value={data.totaalAantal === 0 ? '' : data.totaalAantal}
                placeholder="0"
                onChange={e => patch({ totaalAantal: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <p className={labelCls}>Eenheid</p>
              <input
                className={inputCls}
                value={data.eenheid}
                placeholder={isArbeid ? 'uur' : 'st'}
                onChange={e => patch({ eenheid: e.target.value || (isArbeid ? 'uur' : 'st') })}
              />
            </div>
            <div>
              <p className={labelCls}>{isArbeid ? 'Uurtarief' : 'Prijs per eenheid'}</p>
              <div className="relative flex items-center">
                <span className="absolute left-2.5 text-sm text-slate-400 ">€</span>
                <input
                  type="number" step="0.01" min="0"
                  className={`${inputCls} pl-6`}
                  value={data.prijsPerEenheid === 0 ? '' : data.prijsPerEenheid}
                  placeholder="0,00"
                  onChange={e => patch({ prijsPerEenheid: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
          </div>

          {/* Totaalprijs — bewerkbaar, berekent prijs/eh terug */}
          <div>
            <p className={labelCls}>Totaalprijs</p>
            <div className="relative flex items-center">
              <span className="absolute left-2.5 text-sm text-slate-400 ">€</span>
              <input
                type="number" step="0.01" min="0"
                className={`${inputCls} pl-6 font-semibold`}
                value={totaalPrijs === 0 ? '' : Math.round(totaalPrijs * 100) / 100}
                placeholder="0,00"
                onChange={e => onTotaalPrijsWijzig(parseFloat(e.target.value) || 0)}
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Aanpassen herberekent automatisch de prijs per eenheid.
            </p>
          </div>
        </DialogBody>

        {/* Footer */}
        <DialogFooter split>
          <div className="text-xs text-slate-500">
            Originele regels worden verplaatst naar <span className="font-medium">Verwijderd</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="md" onClick={onSluit}>
              Annuleren
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => onBevestig(data)}
              disabled={!data.omschrijving.trim() || data.totaalAantal <= 0}
            >
              Samenvoegen — {formatEuro(totaalPrijs)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
