'use client'

import { useState } from 'react'
import { ChevronDown, Columns3, LayoutTemplate, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { type ColId, COL_DEFS, NON_HIDEABLE_COLS } from './kolommen'
import { KolomNaamVeld } from './TabelHeader'
import { menuKop, menuScheiding, LABEL_RUIM } from '../werkbalk-menu'

const regelKnop = 'w-full text-left px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 rounded-md'

/**
 * Kolom-layouts van de gebruiker. Staat in de werkbalk (portal vanuit het rekenblad). Op een
 * ruim scherm toont de knop de naam van de actieve layout; anders, en zonder layout, alleen
 * het pictogram ("standaardkolommen" is de rusttoestand en hoeft geen ruimte te kosten).
 */
export function LayoutMenu({
  layouts, actiefLayoutId, onStandaard, onKies, onMaakStandaard, onVerwijder, onBijwerken, onOpslaanAlsNieuw,
}: {
  layouts: GebruikerLayout[]
  actiefLayoutId: string | null
  onStandaard: () => void
  onKies: (layout: GebruikerLayout) => void
  onMaakStandaard: (id: string) => void
  onVerwijder: (id: string) => void
  onBijwerken: () => void
  onOpslaanAlsNieuw: () => void
}) {
  const [open, setOpen] = useState(false)
  const actief = layouts.find(l => l.id === actiefLayoutId)
  const sluitNa = (fn: () => void) => () => { fn(); setOpen(false) }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" title={actief ? `Kolom-layout: ${actief.naam}` : 'Kolom-layouts'}>
          <LayoutTemplate className="w-3.5 h-3.5" />
          {actief && <span className={`${LABEL_RUIM} max-w-[8rem] truncate`}>{actief.naam}</span>}
          <ChevronDown className="w-3 h-3 text-neutral-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[200] w-[260px] py-1">
        <div className={menuKop}>Kolom-layouts</div>
        <div className="px-1">
          {/* Layout uitzetten zonder hem te verwijderen: terug naar de gewone kolommen. */}
          <button
            onClick={sluitNa(onStandaard)}
            className={`${regelKnop} ${actief ? '' : 'font-semibold text-brand-700'}`}
            title="Geen layout — alle kolommen in de standaardvolgorde en -breedte"
          >
            Standaardkolommen
          </button>
          {layouts.length === 0 && <div className="px-3 py-1.5 text-xs text-neutral-400">Nog geen opgeslagen layouts</div>}
          {layouts.map(l => (
            <div key={l.id} className="group flex items-center gap-0.5 rounded-md hover:bg-neutral-50">
              <button
                onClick={sluitNa(() => onKies(l))}
                className={`flex-1 min-w-0 truncate text-left px-3 py-1.5 text-xs ${l.id === actiefLayoutId ? 'font-semibold text-brand-700' : 'text-neutral-700'}`}
                title="Layout toepassen"
              >
                {l.naam}
              </button>
              <button
                onClick={() => { if (!l.is_standaard) onMaakStandaard(l.id) }}
                className={`p-1 rounded ${l.is_standaard ? 'text-warning-500 cursor-default' : 'text-neutral-300 hover:text-warning-500'}`}
                title={l.is_standaard ? 'Standaard-layout: opent vanzelf' : 'Als standaard instellen'}
              >
                <Star className="w-3 h-3" fill={l.is_standaard ? 'currentColor' : 'none'} />
              </button>
              <button
                onClick={() => onVerwijder(l.id)}
                className="p-1 mr-1 rounded text-neutral-300 hover:text-error-500"
                title="Layout verwijderen"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
        <div className={menuScheiding} />
        <div className="px-1">
          {actief && <button onClick={sluitNa(onBijwerken)} className={regelKnop}>Actieve layout bijwerken</button>}
          <button onClick={sluitNa(onOpslaanAlsNieuw)} className={`${regelKnop} font-medium text-brand-700`}>
            Huidige kolommen opslaan als nieuw…
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Kolommen tonen, verbergen en hernoemen. Het getal op de knop = aantal verborgen kolommen. */
export function KolommenMenu({
  hiddenCols, kolomNamen, standaardNaam, onWissel, onHernoem, onAllesTonen, onNamenHerstellen,
}: {
  hiddenCols: Set<ColId>
  kolomNamen: Partial<Record<ColId, string>>
  standaardNaam: (id: ColId) => string
  onWissel: (id: ColId) => void
  onHernoem: (id: ColId, naam: string) => void
  onAllesTonen: () => void
  onNamenHerstellen: () => void
}) {
  const verborgen = hiddenCols.size
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline" size="sm"
          title={verborgen > 0 ? `Kolommen tonen/verbergen — ${verborgen} verborgen` : 'Kolommen tonen/verbergen'}
        >
          <Columns3 className="w-3.5 h-3.5" />
          {verborgen > 0 && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-neutral-100 text-[10.5px] font-semibold leading-[18px] text-center text-neutral-600">
              {verborgen}
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-neutral-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[200] w-[300px] max-h-[70vh] overflow-auto py-1">
        <div className={menuKop}>Kolommen tonen en hernoemen</div>
        {COL_DEFS.map(c => {
          const vast = NON_HIDEABLE_COLS.includes(c.id)
          return (
            <div key={c.id} className="flex items-center gap-2 px-3 py-1 hover:bg-neutral-50">
              <input
                type="checkbox"
                checked={!hiddenCols.has(c.id)}
                disabled={vast}
                onChange={() => onWissel(c.id)}
                className="w-3.5 h-3.5 rounded accent-everts flex-shrink-0 disabled:opacity-30"
                title={vast ? 'Deze kolom is altijd zichtbaar' : 'Kolom tonen/verbergen'}
              />
              <KolomNaamVeld waarde={kolomNamen[c.id] ?? ''} standaard={standaardNaam(c.id)} onCommit={naam => onHernoem(c.id, naam)} />
            </div>
          )
        })}
        <div className={menuScheiding} />
        <p className="px-3 py-1 text-[10.5px] text-neutral-400 leading-snug">
          Eigen kolomnamen gelden alleen voor jou. Leeg laten = standaardnaam.
          Je kunt ook dubbelklikken op een kolomkop.
        </p>
        <div className="px-1">
          {verborgen > 0 && <button onClick={onAllesTonen} className={regelKnop}>Alle kolommen tonen</button>}
          {Object.keys(kolomNamen).length > 0 && <button onClick={onNamenHerstellen} className={regelKnop}>Kolomnamen herstellen</button>}
        </div>
      </PopoverContent>
    </Popover>
  )
}
