'use client'

/**
 * Voorbeeldpagina van de mini-meetstaat, met verzonnen gegevens.
 *
 * De echte dialog zit achter een login en een calculatie: dubbelklik op een hoeveelheid.
 * Hier staat hetzelfde component open in een paar toestanden, zodat de opmaak na te kijken
 * is zonder sessie. Bereikbaar zonder in te loggen omdat `middleware.ts` alles onder
 * `/auth/` overslaat. Overnemen bewaart niets.
 */

import { useState } from 'react'
import MiniMeetstaat from '@/components/everts-calc/calculatie/MiniMeetstaat'
import { Button } from '@/components/ui/button'
import type { MiniMeting } from '@/lib/everts-calc/types'
import type { RegelMetMeting } from '@/lib/everts-calc/mini-meetstaat-koppeling'

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

// De andere regels van het verzonnen scenario, voor de keuzelijst "Gemeten in deze
// calculatie". De voorgevel is gedeeld door drie regels; de rest is los gemeten.
const VOORGEVEL: MiniMeting = { ...GEVEL, naam: 'Gevelvlak voorgevel', koppel_id: 'k-voorgevel' }
const SCENARIO: RegelMetMeting[] = [
  { id: 'r-reinigen', omschrijving: 'Gevel reinigen', eenheid: 'm²', mini_meetstaat: VOORGEVEL },
  { id: 'r-voegwerk', omschrijving: 'Voegwerk herstellen', eenheid: 'm²', mini_meetstaat: VOORGEVEL },
  { id: 'r-steiger', omschrijving: 'Steiger plaatsen', eenheid: 'm²', mini_meetstaat: { ...VOORGEVEL, gebruik: 'bruto' } },
  {
    id: 'r-achter', omschrijving: 'Achtergevel impregneren', eenheid: 'm²',
    mini_meetstaat: {
      eenheid: 'm²', gemeten_op: '2026-10-14T09:00:00.000Z', gebruik: 'netto',
      rijen: [
        { id: 'a1', omschrijving: 'Gevelvlak achtergevel', dim1: 18, dim2: 9.6, dim3: 0, factor: 1 },
        { id: 'a2', omschrijving: 'Ramen', dim1: 1.2, dim2: 1.5, dim3: 0, factor: 12, aftrek: true },
      ],
    },
  },
  {
    id: 'r-dak', omschrijving: 'Dakbeschot vervangen', eenheid: 'm²',
    mini_meetstaat: {
      eenheid: 'm²', gemeten_op: '2026-10-14T09:00:00.000Z',
      rijen: [{ id: 'd1', omschrijving: 'Dakvlakken', dim1: 14.2, dim2: 10, dim3: 0, factor: 2 }],
    },
  },
  {
    id: 'r-goot', omschrijving: 'Dakgoot vervangen', eenheid: 'm¹',
    mini_meetstaat: { eenheid: 'm¹', gemeten_op: '2026-10-14T09:00:00.000Z', rijen: [{ id: 'o1', omschrijving: 'Goot', dim1: 24, dim2: 0, dim3: 0, factor: 1 }] },
  },
]

const TOESTANDEN = {
  netto: { label: 'Gevel reinigen (netto)', titel: 'Gevel reinigen', hoeveelheid: 320.4, bewaard: GEVEL, regelId: 'r-los' },
  bruto: { label: 'Steigerwerk (bruto)', titel: 'Steiger plaatsen', hoeveelheid: 412.8, bewaard: { ...GEVEL, gebruik: 'bruto' as const }, regelId: 'r-los' },
  gekoppeld: { label: 'Gekoppeld', titel: 'Gevel reinigen', hoeveelheid: 320.4, bewaard: VOORGEVEL, regelId: 'r-reinigen' },
  afwijking: { label: 'Met de hand aangepast', titel: 'Gevel reinigen', hoeveelheid: 335, bewaard: GEVEL, regelId: 'r-los' },
  nieuw: { label: 'Nog niet gemeten', titel: 'Kitwerk vernieuwen', hoeveelheid: 0, bewaard: undefined, regelId: 'r-los' },
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
        regelId={t.regelId}
        scenarioRegels={SCENARIO}
        onSluiten={() => setOpen(false)}
        onBevestig={() => setOpen(false)}
      />
    </main>
  )
}
