'use client'

/**
 * Waar je op moet letten voordat je begint te praten.
 *
 * Alleen de niet-nul signalen verschijnen; is er niets aan de hand, dan blijft de balk weg in
 * plaats van drie keer "0" te tonen. Een chip aantikken opent het bijbehorende blok en scrolt
 * ernaartoe — niet naar een nieuw scherm, want je bent midden in een gesprek.
 *
 * De drempels staan in `lib/commercie/klantbeeld-types.ts` (60 dagen te laat, 30 dagen
 * langliggend) met de motivatie erbij.
 */

import React from 'react'
import { AlertTriangle, Clock, PhoneCall } from 'lucide-react'
import type { KlantSignalen } from '@/lib/commercie/klantbeeld-types'
import { ORANJE, ROOD } from './stijl'

/** Welk blok een chip opent. De namen komen terug in `KlantbeeldView`, dat de blokken kent. */
export type SignaalBlok = 'facturen' | 'offertesOpen'

type Chip = {
  sleutel: string; tekst: string; kleur: string; Icon: typeof AlertTriangle; naar: SignaalBlok
}

export default function SignalenBalk({
  signalen, onOpen,
}: {
  signalen: KlantSignalen
  /** Opent het doelblok en scrolt ernaartoe; alle blokken staan standaard dicht. */
  onOpen: (blok: SignaalBlok) => void
}) {
  const chips: Chip[] = []

  if (signalen.factuurTeLaat > 0) {
    chips.push({
      sleutel: 'facturen',
      tekst: `${signalen.factuurTeLaat} ${signalen.factuurTeLaat === 1 ? 'factuur' : 'facturen'} >60 dgn te laat`,
      kleur: ROOD, Icon: AlertTriangle, naar: 'facturen',
    })
  }
  if (signalen.offerteWijAanZet > 0) {
    chips.push({
      sleutel: 'aanzet',
      tekst: `${signalen.offerteWijAanZet}× wij aan zet`,
      kleur: ORANJE, Icon: PhoneCall, naar: 'offertesOpen',
    })
  }
  if (signalen.offerteLangliggend > 0) {
    chips.push({
      sleutel: 'langliggend',
      tekst: `${signalen.offerteLangliggend} ${signalen.offerteLangliggend === 1 ? 'offerte ligt' : 'offertes liggen'} >30 dgn`,
      kleur: ORANJE, Icon: Clock, naar: 'offertesOpen',
    })
  }

  if (chips.length === 0) return null

  return (
    <div style={{
      padding: '0 16px', marginTop: 12,
      display: 'flex', flexWrap: 'wrap', gap: 7,
    }}>
      {chips.map(({ sleutel, tekst, kleur, Icon, naar }) => (
        <button
          key={sleutel}
          type="button"
          onClick={() => onOpen(naar)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 11px', borderRadius: 999,
            border: `1px solid ${kleur}`, background: `color-mix(in srgb, ${kleur} 8%, transparent)`,
            color: kleur, fontSize: 12.5, fontWeight: 700,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Icon size={14} aria-hidden />
          {tekst}
        </button>
      ))}
    </div>
  )
}
