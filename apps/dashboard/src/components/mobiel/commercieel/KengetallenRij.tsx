'use client'

/**
 * De drie getallen bovenaan het klantbeeld: omzet dit jaar, omzet vorig jaar, en hoe vaak we
 * bij deze klant scoren.
 *
 * Twee eerlijkheidsregels zitten hier hard in:
 *
 *  1. **Nooit een kaal percentage.** Er staat altijd "7-4" naast, en onder een handvol
 *     beslissingen verdwijnt het percentage helemaal (`score.percentage === null`). "50 %"
 *     bij één gewonnen en één verloren offerte is ruis die aan de telefoon wordt uitgesproken
 *     alsof het iets betekent.
 *  2. **Zeg het als het bedrag onvolledig is.** Opdrachten zonder regel in
 *     `management_projecten` tellen niet mee in de omzet; staat dat er niet bij, dan leest een
 *     te laag getal als het totaal.
 */

import React from 'react'
import type { KlantKengetallen, KlantScore } from '@/lib/commercie/klantbeeld-types'
import { GRIJS, OPPERVLAK, RAND, TEKST } from './stijl'

const euro = (n: number): string =>
  n.toLocaleString('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function Cel({ kop, waarde, onder }: { kop: string; waarde: string; onder?: string | null }) {
  return (
    <div style={{ flex: 1, minWidth: 0, textAlign: 'center', padding: '0 4px' }}>
      <div style={{
        fontSize: 10.5, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
        letterSpacing: '.04em', marginBottom: 4,
      }}>
        {kop}
      </div>
      <div style={{
        fontSize: 17, fontWeight: 800, color: TEKST, letterSpacing: '-0.02em', lineHeight: 1.15,
      }}>
        {waarde}
      </div>
      {onder && (
        <div style={{ fontSize: 11, color: GRIJS, marginTop: 2, lineHeight: 1.3 }}>{onder}</div>
      )}
    </div>
  )
}

export default function KengetallenRij({
  kengetallen, score,
}: {
  kengetallen: KlantKengetallen
  score: KlantScore
}) {
  // Zonder percentage tonen we de aantallen als hoofdwaarde — die zijn altijd waar.
  const scoreWaarde = score.percentage !== null
    ? `${score.percentage}%`
    : (score.gewonnen + score.verloren > 0 ? `${score.gewonnen}-${score.verloren}` : '—')

  const scoreOnder = score.percentage !== null
    ? `${score.gewonnen} gewonnen, ${score.verloren} verloren`
    : (score.gewonnen + score.verloren > 0
      ? 'te weinig om te rekenen'
      : 'nog geen afgeronde offerte')

  return (
    <div style={{ padding: '0 16px', marginTop: 14 }}>
      <div style={{
        display: 'flex', alignItems: 'flex-start',
        background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
        padding: '13px 6px',
      }}>
        <Cel kop={`Omzet ${kengetallen.ditJaar}`} waarde={euro(kengetallen.omzetDitJaar)} />
        <div style={{ width: 1, alignSelf: 'stretch', background: RAND }} aria-hidden />
        <Cel kop={`Omzet ${kengetallen.vorigJaar}`} waarde={euro(kengetallen.omzetVorigJaar)} />
        <div style={{ width: 1, alignSelf: 'stretch', background: RAND }} aria-hidden />
        <Cel
          kop="Score"
          waarde={scoreWaarde}
          onder={score.vanafJaar ? `sinds ${score.vanafJaar}` : null}
        />
      </div>

      <div style={{ fontSize: 11.5, color: GRIJS, marginTop: 6, lineHeight: 1.45 }}>
        {scoreOnder}
        {score.open > 0 && ` · ${score.open} nog open`}
        {kengetallen.zonderFacturatiegegevens > 0 && (
          <>
            {' · '}
            {kengetallen.zonderFacturatiegegevens} zonder facturatieregel, dus de omzet is een
            ondergrens
          </>
        )}
      </div>
    </div>
  )
}
