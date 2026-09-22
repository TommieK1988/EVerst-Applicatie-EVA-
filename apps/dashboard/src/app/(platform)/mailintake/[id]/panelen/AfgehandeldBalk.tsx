'use client'

/**
 * De balk boven een bericht dat al is afgehandeld.
 *
 * Twee toestanden die niet hetzelfde zijn, en dat verschil is het hele punt:
 *
 *  * **Genegeerd** — een mens heeft besloten dat hier niets mee hoeft. De mail is
 *    uit Postvak IN verdwenen.
 *  * **Archief** — EVA zag er geen aanvraag of opdracht in. Dat oordeel is van de
 *    machine en niemand heeft ernaar gekeken; de mail staat nog ongelezen in
 *    Postvak IN.
 *
 * De knop is daarom geen bijzaak. Zat er tóch werk bij, dan is dit de enige plek
 * in EVA waar je dat nog kunt zeggen — en een gemiste aanvraag is de duurste fout
 * die deze module kan maken. Bij "Toch behandelen" leest EVA het bericht opnieuw
 * met de wetenschap dat een mens zijn oordeel heeft teruggedraaid.
 */

import React from 'react'

import { Button } from '@/components/ui'

export default function AfgehandeldBalk({
  status, dossiernummer, magSchrijven, bezig, onHeropen,
}: {
  status: string | null
  dossiernummer: string | null
  magSchrijven: boolean
  bezig: boolean
  onHeropen: () => void
}) {
  const uitArchief = status === 'geen_aanvraag'
  const terugKan = magSchrijven && (uitArchief || status === 'genegeerd')

  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8, fontSize: 13,
      background: 'var(--n-100, #f3f4f6)', border: '1px solid var(--border)',
    }}>
      {uitArchief
        ? 'EVA zag hier geen aanvraag of opdracht in; de mail staat nog ongelezen in Postvak IN.'
        : `Dit bericht is afgehandeld${dossiernummer ? ` — dossier ${dossiernummer}` : ''}.`}
      {terugKan && (
        <Button variant="ghost" onClick={onHeropen} disabled={bezig} style={{ marginLeft: 8 }}>
          {uitArchief ? 'Toch behandelen' : 'Terugzetten op de lijst'}
        </Button>
      )}
    </div>
  )
}
