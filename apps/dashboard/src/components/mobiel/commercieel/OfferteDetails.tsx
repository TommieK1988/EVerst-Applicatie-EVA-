'use client'

/**
 * Wat er op een openstaande offerte speelt: de afgesproken volgende stap en de opmerkingen.
 *
 * Staat onder de dossierregel en niet erin, want de "toon meer"-knop moet aanklikbaar zijn —
 * een <button> in de <a> die de hele regel is werkt niet (en een <a> in een <a> is ongeldige
 * HTML; zie de PDF-knop in `DossierRegel`).
 *
 * Eén opmerking staat open, de rest achter een knop. Bij Schep heeft de helft van de offertes
 * er twee of drie, en achttien offertes × drie opmerkingen is geen lijst meer maar een muur.
 * De nieuwste is bijna altijd degene die het gesprek draagt; de oudere zijn de historie die je
 * erbij pakt als de klant erom vraagt.
 */

import React from 'react'
import { STATUS_PRESENTATIE } from '@/lib/commercie/types'
import type { OfferteOpmerking, OfferteStap } from '@/lib/commercie/klantbeeld-types'
import { formatDatumNL } from '@/lib/dossiers/datum-regels'
import { GRIJS, RAND, TEKST } from './stijl'

/**
 * Bij welke statussen het label vóór de stapregel komt.
 *
 * Alleen waar het iets toevoegt dat de regel zelf niet zegt: dat de datum voorbij is, dat het
 * vandaag moet, of dat er niets is afgesproken. "Wachten op klant tot 1 februari" laten
 * voorafgaan door het label "Wachten op klant" is dezelfde zin twee keer. De kleur van de stip
 * draagt de rest.
 */
const LABEL_ERBIJ = new Set(['verlopen', 'nu', 'ongetrieerd'])

export default function OfferteDetails({
  stap, opmerkingen,
}: {
  stap: OfferteStap | null
  opmerkingen: OfferteOpmerking[]
}) {
  const [alles, setAlles] = React.useState(false)

  if (!stap && opmerkingen.length === 0) return null

  const zichtbaar = alles ? opmerkingen : opmerkingen.slice(0, 1)
  const verborgen = opmerkingen.length - zichtbaar.length
  const presentatie = stap ? STATUS_PRESENTATIE[stap.status] : null

  return (
    <div style={{ padding: '10px 14px 12px', borderTop: `1px solid ${RAND}` }}>
      {stap && presentatie && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
          <span
            style={{
              flexShrink: 0, width: 8, height: 8, borderRadius: 999,
              background: presentatie.cssKleur, marginTop: 5,
            }}
            aria-hidden
          />
          <div style={{ minWidth: 0, fontSize: 13, lineHeight: 1.4, color: TEKST }}>
            {LABEL_ERBIJ.has(stap.status) && (
              <span style={{ fontWeight: 700, color: presentatie.cssKleur }}>
                {presentatie.label} ·{' '}
              </span>
            )}
            {stap.regel}
          </div>
        </div>
      )}

      {zichtbaar.map(o => (
        <div
          key={o.id}
          style={{
            fontSize: 12.5, lineHeight: 1.45, color: GRIJS,
            marginTop: 8, whiteSpace: 'pre-wrap',
          }}
        >
          <span style={{ fontWeight: 700 }}>{formatDatumNL(o.datum)}</span>
          {' — '}
          {o.tekst}
        </div>
      ))}

      {verborgen > 0 && (
        <button
          type="button"
          onClick={() => setAlles(true)}
          style={{
            marginTop: 8, padding: 0,
            background: 'none', border: 'none',
            color: GRIJS, fontSize: 12.5, fontWeight: 700,
            textDecoration: 'underline', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {verborgen} {verborgen === 1 ? 'eerdere opmerking' : 'eerdere opmerkingen'}
        </button>
      )}
    </div>
  )
}
