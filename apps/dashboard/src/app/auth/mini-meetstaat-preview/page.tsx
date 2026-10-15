'use client'

/**
 * Voorbeeldpagina van de mini-meetstaat, met verzonnen gegevens.
 *
 * De echte dialog zit achter een login en een calculatie: dubbelklik op een hoeveelheid.
 * Hier staat hetzelfde component open in drie toestanden, zodat de opmaak na te kijken
 * is zonder sessie. Bereikbaar zonder in te loggen omdat `middleware.ts` alles onder
 * `/auth/` overslaat. Overnemen bewaart niets.
 */

import { useState } from 'react'
import MiniMeetstaat from '@/components/everts-calc/calculatie/MiniMeetstaat'
import { Button } from '@/components/ui/button'
import type { MiniMeting } from '@/lib/everts-calc/types'

// Scherm 4 uit het plan: gevelvlak 24 × 17,2 met ramen en deuren als aftrek.
const GEVEL: MiniMeting = {
  eenheid: 'm²',
  gemeten_op: '2026-10-15T10:00:00.000Z',
  gebruik: 'netto',
  rijen: [
    { id: 'g1', omschrijving: 'Gevelvlak voorgevel', dim1: 24, dim2: 17.2, dim3: 0, factor: 1 },
    { id: 'g2', omschrijving: 'Ramen', dim1: 1.2, dim2: 1.5, dim3: 0, factor: 36, aftrek: true },
    { id: 'g3', omschrijving: 'Voordeuren', dim1: 1, dim2: 2.3, dim3: 0, factor: 12, aftrek: true },
  ],
}

const TOESTANDEN = {
  netto: { label: 'Gevel reinigen (netto)', titel: 'Gevel reinigen', hoeveelheid: 320.4, bewaard: GEVEL },
  bruto: { label: 'Steigerwerk (bruto)', titel: 'Steiger plaatsen', hoeveelheid: 412.8, bewaard: { ...GEVEL, gebruik: 'bruto' as const } },
  afwijking: { label: 'Met de hand aangepast', titel: 'Gevel reinigen', hoeveelheid: 335, bewaard: GEVEL },
  nieuw: { label: 'Nog niet gemeten', titel: 'Voegwerk herstellen', hoeveelheid: 0, bewaard: undefined },
} as const

type Toestand = keyof typeof TOESTANDEN

export default function MiniMeetstaatPreview() {
  const [toestand, setToestand] = useState<Toestand>('netto')
  const [open, setOpen] = useState(true)
  const t = TOESTANDEN[toestand]

  return (
    <main className="min-h-screen bg-neutral-100 p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <h1 className="text-[22px] font-semibold text-neutral-900">Mini-meetstaat · voorbeeld</h1>
        <p className="text-[13.5px] text-neutral-600">
          Verzonnen gegevens. In de calculatie open je dit met een dubbelklik op de hoeveelheid.
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(TOESTANDEN) as Toestand[]).map(k => (
            <Button
              key={k}
              variant={k === toestand ? 'primary' : 'outline'}
              onClick={() => { setToestand(k); setOpen(false); setTimeout(() => setOpen(true), 0) }}
            >
              {TOESTANDEN[k].label}
            </Button>
          ))}
        </div>
      </div>
      <MiniMeetstaat
        key={toestand}
        open={open}
        eenheid="m²"
        hoeveelheid={t.hoeveelheid}
        titel={t.titel}
        bewaard={t.bewaard}
        onSluiten={() => setOpen(false)}
        onBevestig={() => setOpen(false)}
      />
    </main>
  )
}
