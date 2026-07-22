'use client'

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Groep } from '@/lib/everts-calc/types'
import { getMeetregels } from '@/lib/everts-calc/local-store'
import { isRegelActief } from '@/lib/everts-calc/meetstaat-utils'
import { EmptyState } from '@/components/ui/empty-state'

interface Props {
  groepen: Groep[]
  actiefGroepId: string | null
  meetstaatId: string
  onGroepSelecteer: (id: string) => void
}

function telRegelsPerGroep(meetstaatId: string, groepId: string): number {
  return getMeetregels(meetstaatId).filter(
    r => r.groep_id === groepId && !r.is_leeg && isRegelActief(r)
  ).length
}

function GroepRij({
  groep, diepte, groepen, actiefGroepId, meetstaatId, onSelecteer,
}: {
  groep: Groep
  diepte: number
  groepen: Groep[]
  actiefGroepId: string | null
  meetstaatId: string
  onSelecteer: (id: string) => void
}) {
  const kinderen = groepen.filter(g => g.parent_id === groep.id)
  const aantalRegels = telRegelsPerGroep(meetstaatId, groep.id)
  const isActief = groep.id === actiefGroepId

  return (
    <>
      <button
        onClick={() => onSelecteer(groep.id)}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left rounded-lg transition-colors text-sm
          ${isActief
            ? 'bg-everts text-white font-medium'
            : 'text-slate-700 hover:bg-slate-100'
          }`}
        style={{ paddingLeft: `${8 + diepte * 16}px` }}
      >
        {kinderen.length > 0 && (
          <ChevronRight className={`w-3 h-3 flex-shrink-0 ${isActief ? 'text-white/70' : 'text-slate-400'}`} />
        )}
        {kinderen.length === 0 && <span className="w-3" />}
        <span className="flex-1 truncate">{groep.naam}</span>
        {aantalRegels > 0 && (
          <span className={`text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 ${
            isActief ? 'bg-paper/20 text-white' : 'bg-slate-200 text-slate-500'
          }`}>
            {aantalRegels}
          </span>
        )}
      </button>
      {kinderen.map(kind => (
        <GroepRij
          key={kind.id}
          groep={kind}
          diepte={diepte + 1}
          groepen={groepen}
          actiefGroepId={actiefGroepId}
          meetstaatId={meetstaatId}
          onSelecteer={onSelecteer}
        />
      ))}
    </>
  )
}

export default function GroepenboomPanel({ groepen, actiefGroepId, meetstaatId, onGroepSelecteer }: Props) {
  const roots = useMemo(() => groepen.filter(g => !g.parent_id), [groepen])

  return (
    <div className="w-56 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-slate-100">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Groepen</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
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
              meetstaatId={meetstaatId}
              onSelecteer={onGroepSelecteer}
            />
          ))
        )}
      </div>
    </div>
  )
}
