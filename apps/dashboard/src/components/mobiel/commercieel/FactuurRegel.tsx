'use client'

/**
 * Eén openstaande factuur. Geen link: het klantbeeld toont wat er open staat, het bewerken
 * van de opvolging hoort op het Debiteuren-scherm thuis, en dat is geen telefoonwerk.
 *
 * Het verkeerslicht komt uit `lib/debiteuren/actions.ts` (groen = nog niet vervallen,
 * oranje < 30 dagen te laat, rood 30+), dus het klantbeeld en het Debiteuren-scherm kleuren
 * dezelfde factuur nooit verschillend.
 */

import React from 'react'
import type { KlantFactuur } from '@/lib/commercie/klantbeeld-types'
import { OPPERVLAK, RAND, TEKST } from './stijl'

const STOPLICHT_KLEUR: Record<KlantFactuur['stoplicht'], string> = {
  groen:  '#009439',
  oranje: '#b54708',
  rood:   '#b42318',
}

const euro = (n: number): string =>
  n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

function dagenTekst(dagen: number | null): string {
  if (dagen === null) return 'geen vervaldatum'
  if (dagen > 0) return `${dagen} ${dagen === 1 ? 'dag' : 'dagen'} te laat`
  if (dagen === 0) return 'vervalt vandaag'
  return `vervalt over ${-dagen} ${-dagen === 1 ? 'dag' : 'dagen'}`
}

export default function FactuurRegel({ factuur }: { factuur: KlantFactuur }) {
  const kleur = STOPLICHT_KLEUR[factuur.stoplicht]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px', borderRadius: 12,
      background: OPPERVLAK, border: `1px solid ${RAND}`, marginBottom: 8,
    }}>
      <span
        style={{ flexShrink: 0, width: 9, height: 9, borderRadius: 999, background: kleur }}
        aria-hidden
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: TEKST }}>
          {factuur.factuurnummer ?? 'Zonder nummer'}
        </div>
        <div style={{ fontSize: 12.5, color: kleur, marginTop: 2, fontWeight: 600 }}>
          {dagenTekst(factuur.dagenTeLaat)}
        </div>
      </div>
      <div style={{ flexShrink: 0, fontSize: 14, fontWeight: 700, color: TEKST }}>
        {factuur.bedrag != null ? euro(factuur.bedrag) : '—'}
      </div>
    </div>
  )
}

/** Som van de openstaande bedragen — het getal waar een gesprek over gaat. */
export function factuurTotaal(facturen: KlantFactuur[]): string {
  return euro(facturen.reduce((som, f) => som + (f.bedrag ?? 0), 0))
}
