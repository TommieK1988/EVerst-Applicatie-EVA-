'use client'

/**
 * Waar je op moet letten voordat je begint te praten.
 *
 * Alleen de niet-nul signalen verschijnen; is er niets aan de hand, dan blijft de balk weg in
 * plaats van drie keer "0" te tonen. Een chip aantikken scrolt naar het bijbehorende blok en
 * opent het — niet naar een nieuw scherm, want je bent midden in een gesprek.
 *
 * De drempels staan in `lib/commercie/klantbeeld-types.ts` (60 dagen te laat, 30 dagen
 * langliggend) met de motivatie erbij.
 */

import React from 'react'
import { AlertTriangle, Clock, PhoneCall } from 'lucide-react'
import type { KlantSignalen } from '@/lib/commercie/klantbeeld-types'
import { ORANJE, ROOD } from './stijl'

type Chip = { sleutel: string; tekst: string; kleur: string; Icon: typeof AlertTriangle; naar: string }

export default function SignalenBalk({ signalen }: { signalen: KlantSignalen }) {
  const chips: Chip[] = []

  if (signalen.factuurTeLaat > 0) {
    chips.push({
      sleutel: 'facturen',
      tekst: `${signalen.factuurTeLaat} ${signalen.factuurTeLaat === 1 ? 'factuur' : 'facturen'} >60 dgn te laat`,
      kleur: ROOD, Icon: AlertTriangle, naar: 'blok-facturen',
    })
  }
  if (signalen.offerteWijAanZet > 0) {
    chips.push({
      sleutel: 'aanzet',
      tekst: `${signalen.offerteWijAanZet}× wij aan zet`,
      kleur: ORANJE, Icon: PhoneCall, naar: 'blok-offertes-open',
    })
  }
  if (signalen.offerteLangliggend > 0) {
    chips.push({
      sleutel: 'langliggend',
      tekst: `${signalen.offerteLangliggend} ${signalen.offerteLangliggend === 1 ? 'offerte ligt' : 'offertes liggen'} >30 dgn`,
      kleur: ORANJE, Icon: Clock, naar: 'blok-offertes-open',
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
          onClick={() => {
            // Beide doelblokken (facturen, openstaande offertes) staan standaard open, dus
            // scrollen is genoeg. Zou dat ooit veranderen, dan moet KlapBlok een van buiten
            // stuurbare open-stand krijgen — een attribuut zetten doet niets.
            document.getElementById(naar)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
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
