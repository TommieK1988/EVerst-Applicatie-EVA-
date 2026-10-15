'use client'

import { useState } from 'react'
import type { Componentregel } from '@/lib/everts-calc/types'
import { cn } from '@/lib/everts-calc/utils'

const SOORTEN: { type: Componentregel['type']; kort: string; naam: string; kleur: string }[] = [
  { type: 'arbeid',         kort: 'A',  naam: 'Arbeid',         kleur: 'text-blue-600 border-blue-300 data-[aan=true]:bg-blue-600' },
  { type: 'materieel',      kort: 'M',  naam: 'Materiaal',      kleur: 'text-pink-700 border-pink-300 data-[aan=true]:bg-pink-700' },
  { type: 'onderaanneming', kort: 'OA', naam: 'Onderaanneming', kleur: 'text-purple-700 border-purple-300 data-[aan=true]:bg-purple-700' },
]

/**
 * Lege normregel onder de normen: kies A, M of OA, typ de omschrijving en Enter.
 * Daarna staat de cursor in de hoeveelheid van de nieuwe norm.
 */
export function NieuweNormInvoer({ onVoeg }: {
  onVoeg: (type: Componentregel['type'], omschrijving: string) => void
}) {
  const [type, setType] = useState<Componentregel['type']>('arbeid')
  const [tekst, setTekst] = useState('')
  const soort = SOORTEN.find(s => s.type === type)!
  return (
    <div className="flex flex-1 items-center gap-1.5 min-w-0">
      {SOORTEN.map(s => (
        <button
          key={s.type}
          type="button"
          data-aan={s.type === type}
          onClick={() => setType(s.type)}
          title={`Nieuwe norm: ${s.naam.toLowerCase()}`}
          aria-pressed={s.type === type}
          className={cn(
            'inline-flex h-5 min-w-[22px] items-center justify-center rounded border bg-white px-1 text-[10px] font-bold transition-colors data-[aan=true]:text-white',
            s.kleur,
          )}
        >
          {s.kort}
        </button>
      ))}
      <input
        value={tekst}
        onChange={e => setTekst(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault()
            onVoeg(type, tekst.trim())
            setTekst('')
          }
        }}
        placeholder={`Nieuwe norm (${soort.naam.toLowerCase()}): typ een omschrijving en druk op Enter`}
        className="w-full max-w-md text-xs px-2 py-0.5 rounded border border-transparent bg-transparent hover:border-neutral-200 focus:bg-white focus:border-brand-500/40 focus:outline-none placeholder-neutral-400"
      />
    </div>
  )
}
