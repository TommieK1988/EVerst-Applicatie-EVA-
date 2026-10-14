'use client'

import { useMemo } from 'react'
import { ChevronRight, Check } from 'lucide-react'
import type { Groep, Meetregel } from '@/lib/everts-calc/types'
import { getMeetregels, getMeetregelAggregaten } from '@/lib/everts-calc/local-store'
import { isRegelActief, berekenHoeveelheid } from '@/lib/everts-calc/meetstaat-utils'
import { teVerwerken } from '@/lib/everts-calc/meetstaat-verwerken'
import { totalenPerEenheid, totalenTekst } from '@/lib/everts-calc/meetstaat-overzicht'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  groepen: Groep[]
  actiefGroepId: string | null
  meetstaatId: string
  onGroepSelecteer: (id: string) => void
}

interface GroepCijfers {
  regels: number
  totaal: string
  /** Codes in deze groep die nog niet in de calculatie verwerkt zijn. */
  open: number
}

/**
 * Per groep: hoeveel regels, het subtotaal per eenheid en wat er nog naar de
 * calculatie moet. Zo zie je zonder door te klikken welke gevel nog niet gemeten
 * is en waar wijzigingen openstaan.
 */
function cijfersPerGroep(meetstaatId: string): { perGroep: Map<string, GroepCijfers>; geheel: GroepCijfers } {
  const actief = getMeetregels(meetstaatId).filter(r => !r.is_leeg && isRegelActief(r))
  const open = teVerwerken(getMeetregelAggregaten(meetstaatId))

  const regelsPerGroep = new Map<string, Meetregel[]>()
  for (const r of actief) {
    const lijst = regelsPerGroep.get(r.groep_id) ?? []
    lijst.push(r)
    regelsPerGroep.set(r.groep_id, lijst)
  }
  const openPerGroep = new Map<string, number>()
  for (const a of open) openPerGroep.set(a.groep_id, (openPerGroep.get(a.groep_id) ?? 0) + 1)

  const perGroep = new Map<string, GroepCijfers>()
  const ids = new Set([...Array.from(regelsPerGroep.keys()), ...Array.from(openPerGroep.keys())])
  for (const id of Array.from(ids)) {
    const regels = regelsPerGroep.get(id) ?? []
    perGroep.set(id, {
      regels: regels.length,
      totaal: totalenTekst(totalenPerEenheid(regels, berekenHoeveelheid)),
      open: openPerGroep.get(id) ?? 0,
    })
  }
  return {
    perGroep,
    geheel: {
      regels: actief.length,
      totaal: totalenTekst(totalenPerEenheid(actief, berekenHoeveelheid)),
      open: open.length,
    },
  }
}

function OpenStip({ aantal }: { aantal: number }) {
  return (
    <span
      className="flex items-center gap-1 text-[11px] font-semibold flex-shrink-0 text-warning-700"
      title={`${aantal} ${aantal === 1 ? 'wijziging' : 'wijzigingen'} nog niet in de calculatie`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-warning-500" />
      {aantal}
    </span>
  )
}

function GroepRij({
  groep, diepte, groepen, actiefGroepId, cijfers, onSelecteer,
}: {
  groep: Groep
  diepte: number
  groepen: Groep[]
  actiefGroepId: string | null
  cijfers: Map<string, GroepCijfers>
  onSelecteer: (id: string) => void
}) {
  const kinderen = groepen.filter(g => g.parent_id === groep.id)
  const c = cijfers.get(groep.id)
  const isActief = groep.id === actiefGroepId
  const leeg = !c || c.regels === 0

  return (
    <>
      <button
        onClick={() => onSelecteer(groep.id)}
        aria-current={isActief ? 'true' : undefined}
        className={`w-full flex flex-col gap-0.5 py-2 pr-3 text-left rounded-lg transition-colors border-l-2
          ${isActief ? 'bg-brand-50 border-brand-500 text-brand-700' : 'border-transparent text-neutral-700 hover:bg-neutral-100'}`}
        style={{ paddingLeft: `${10 + diepte * 16}px` }}
      >
        <span className="flex items-center gap-1.5 text-[13px]">
          {kinderen.length > 0
            ? <ChevronRight className="w-3 h-3 flex-shrink-0 text-neutral-400" />
            : <span className="w-3 flex-shrink-0" />}
          <span className={`flex-1 truncate ${isActief ? 'font-semibold' : 'font-medium'}`}>{groep.naam}</span>
          {c && c.open > 0
            ? <OpenStip aantal={c.open} />
            : !leeg && <Check className="w-3.5 h-3.5 flex-shrink-0 text-success-500" aria-label="Alles in calculatie" />}
        </span>
        <span className={`pl-[18px] text-xs tabular-nums truncate ${leeg ? 'text-neutral-400' : isActief ? 'text-brand-700' : 'text-neutral-500'}`}>
          {leeg ? (c && c.open > 0 ? 'Geen regels meer' : 'Nog niet gemeten') : c.totaal}
        </span>
      </button>
      {kinderen.map(kind => (
        <GroepRij
          key={kind.id}
          groep={kind}
          diepte={diepte + 1}
          groepen={groepen}
          actiefGroepId={actiefGroepId}
          cijfers={cijfers}
          onSelecteer={onSelecteer}
        />
      ))}
    </>
  )
}

export default function GroepenboomPanel({ groepen, actiefGroepId, meetstaatId, onGroepSelecteer }: Props) {
  const roots = useMemo(() => groepen.filter(g => !g.parent_id), [groepen])
  // Bewust elke render opnieuw: de regels staan in het werkgeheugen en veranderen bij
  // elke invoer; het hoofdscherm tekent opnieuw na iedere wijziging.
  const { perGroep, geheel } = cijfersPerGroep(meetstaatId)

  return (
    <div className="w-60 flex-shrink-0 border-r border-neutral-200 bg-white flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-center justify-between">
        <span className="text-[11px] font-bold text-neutral-600 uppercase tracking-[0.10em]">Groepen</span>
        <span className="text-xs text-neutral-500">{groepen.length}</span>
      </div>
      {roots.length > 0 && (
        <div className="px-4 py-3 border-b border-neutral-100 flex flex-col gap-0.5">
          <span className="flex items-center justify-between text-[13px] font-semibold text-neutral-800">
            Hele meetstaat
            {geheel.open > 0 && <OpenStip aantal={geheel.open} />}
          </span>
          <span className="text-xs tabular-nums text-neutral-500">
            {geheel.regels} {geheel.regels === 1 ? 'regel' : 'regels'}{geheel.totaal && ` · ${geheel.totaal}`}
          </span>
        </div>
      )}
      <nav aria-label="Groepen" className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {roots.length === 0 ? (
          <EmptyState
            title="Geen groepen"
            description="Nog geen groepen in deze calculatie"
            tone="neutral"
            size="sm"
          />
        ) : (
          roots.map(g => (
            <GroepRij
              key={g.id}
              groep={g}
              diepte={0}
              groepen={groepen}
              actiefGroepId={actiefGroepId}
              cijfers={perGroep}
              onSelecteer={onGroepSelecteer}
            />
          ))
        )}
      </nav>
    </div>
  )
}
