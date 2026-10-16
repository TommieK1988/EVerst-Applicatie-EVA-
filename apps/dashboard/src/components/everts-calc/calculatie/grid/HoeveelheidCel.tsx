'use client'

// Inhoud van de kolom Aantal in een calculatieregel: de hoeveelheid, het meetlint als er
// gemeten is (of de schakel als de meting gedeeld is met andere regels) en de
// mini-meetstaat achter de dubbelklik. Los van CalculatieregelRij, die al groot genoeg is.

import { Ruler, Link2 } from 'lucide-react'
import { formatGetal } from '@/lib/everts-calc/calculations'
import type { Calculatieregel } from '@/lib/everts-calc/types'
import {
  gedeeldMet, synchroniseerKoppeling, handmatigeHoeveelheid,
} from '@/lib/everts-calc/mini-meetstaat-koppeling'
import MiniMeetstaat from '@/components/everts-calc/calculatie/MiniMeetstaat'
import { GetalInput } from './GetalInput'

export function HoeveelheidCel({ regel, scenarioRegels, open, onOpen, onSluit, onWijzig }: {
  regel: Calculatieregel
  /** De regels van hetzelfde scenario; alleen daarbinnen wordt een meting gedeeld. */
  scenarioRegels: Calculatieregel[]
  open: boolean
  onOpen: () => void
  onSluit: () => void
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
}) {
  if (regel.meetstaat_aggregaat_id) {
    return (
      <span
        className="w-full text-xs text-right  font-semibold px-1 py-0.5 block text-teal-600"
        title="Hoeveelheid vastgesteld door meetstaat — pas aan in de meetstaat"
      >
        {regel.hoeveelheid === 0 ? '—' : formatGetal(regel.hoeveelheid, 2)}
      </span>
    )
  }

  const meting = regel.mini_meetstaat
  const aantalRijen = meting?.rijen.length ?? 0
  const anderen = gedeeldMet(scenarioRegels, regel.id, meting?.koppel_id)
  const ookIn = anderen.map(r => r.omschrijving.trim() || 'regel zonder omschrijving').join(', ')

  return (
    <div className="relative">
      {anderen.length > 0 ? (
        <Link2
          aria-label={`Gedeelde meting (ook in: ${ookIn})`}
          className="pointer-events-none absolute left-0.5 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-700"
        />
      ) : aantalRijen > 0 && (
        <Ruler
          aria-label="Gemeten"
          className="pointer-events-none absolute left-0.5 top-1/2 h-3 w-3 -translate-y-1/2 text-brand-500"
        />
      )}
      <GetalInput
        waarde={regel.hoeveelheid}
        // Met de hand typen laat een gedeelde meting los; de andere regels houden hem.
        onChange={v => onWijzig(regel.id, handmatigeHoeveelheid(regel, v))}
        className="w-full text-xs text-right  font-semibold px-1 py-0.5 rounded border-0 bg-transparent
          hover:bg-slate-50 hover:border hover:border-slate-200
          focus:bg-white focus:border focus:border-everts/40 focus:outline-none text-slate-800"
        onDoubleClick={e => { e.stopPropagation(); onOpen() }}
        title={anderen.length > 0
          ? `Gedeelde meting (ook in: ${ookIn}): dubbelklik om de meting te zien. Typ je hier een ander getal, dan laat deze regel de koppeling los.`
          : aantalRijen > 0
          ? `Gemeten (${aantalRijen} ${aantalRijen === 1 ? 'regel' : 'regels'}): dubbelklik om de meting te zien`
          : 'Dubbelklik om te meten'}
      />
      <MiniMeetstaat
        open={open}
        eenheid={regel.eenheid}
        hoeveelheid={regel.hoeveelheid}
        titel={regel.omschrijving}
        bewaard={meting}
        regelId={regel.id}
        scenarioRegels={scenarioRegels}
        onSluiten={onSluit}
        onOntkoppel={() => {
          if (meting?.koppel_id) onWijzig(regel.id, { mini_meetstaat: { ...meting, koppel_id: undefined } })
        }}
        onBevestig={(hoeveelheid, eenheid, nieuw, bronRegelId) => {
          onWijzig(regel.id, { hoeveelheid, mini_meetstaat: nieuw, ...(eenheid ? { eenheid } : {}) })
          // De andere regels met dezelfde koppeling krijgen dezelfde maten, elk met zijn
          // eigen bruto of netto. Eén wijziging per regel, via dezelfde weg als typen.
          for (const { id, patch } of synchroniseerKoppeling(scenarioRegels, regel.id, nieuw, bronRegelId)) {
            onWijzig(id, patch)
          }
          onSluit()
        }}
      />
    </div>
  )
}
