'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import type { DubbeleInplanning } from '@/lib/planning/dubbel-ingepland'

/**
 * Korte melding direct na het opslaan: wie, wanneer precies, en waarmee het botst. Het
 * planitem is dan al opgeslagen — dit waarschuwt, het blokkeert niet. Het volledige overzicht
 * (met "Toon in planning") staat boven de detailplanning, zie `DubbelOverzicht`.
 */
export function meldDubbeleInplanning(dubbel: DubbeleInplanning[] | undefined): void {
  if (!dubbel || dubbel.length === 0) return
  const eerste = dubbel[0]
  const meer = dubbel.length - 1

  toast(
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, lineHeight: 1.4 }}>
      <strong>{eerste.medewerker} staat dubbel ingepland</strong>
      <span><strong>{eerste.overlap}</strong></span>
      <span style={{ color: 'var(--fg-muted)' }}>
        {eerste.hier.activiteit} botst met {eerste.soort === 'afwezig' ? <strong>{eerste.wat.toLowerCase()}</strong> : eerste.wat}
      </span>
      <span style={{ color: 'var(--fg-muted)' }}>
        {meer > 0 ? `En nog ${meer} andere. ` : ''}Zie het overzicht boven de planning.
      </span>
    </div>,
    { icon: '⚠️', duration: 8_000, style: { maxWidth: 440 } },
  )
}

const ZICHTBAAR = 5

/**
 * Vast overzicht boven de detailplanning: elke lopende of toekomstige botsing van een planitem
 * van dit dossier, met het exacte dubbele tijdvak, wat er hier staat, waar het mee botst, en
 * een knop die de planning naar dat moment brengt en het planitem oplicht.
 */
export function DubbelOverzicht({ dubbel, onToon }: {
  dubbel: DubbeleInplanning[]
  onToon: (d: DubbeleInplanning) => void
}) {
  const [ingeklapt, setIngeklapt] = useState(false)
  const [alles, setAlles] = useState(false)
  if (dubbel.length === 0) return null

  const lijst = alles ? dubbel : dubbel.slice(0, ZICHTBAAR)
  const klein: React.CSSProperties = { fontSize: 12, padding: '4px 12px' }

  return (
    <div className="eva-card-warn" style={{ padding: '12px 16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ fontSize: 16 }}>⚠️</span>
        <strong style={{ fontSize: 14, color: 'var(--fg)' }}>
          {dubbel.length === 1 ? '1 dubbele inplanning' : `${dubbel.length} dubbele inplanningen`}
        </strong>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          Iemand staat op hetzelfde moment ook elders ingepland of is afwezig.
        </span>
        <button className="eva-btn-ghost" style={{ ...klein, marginLeft: 'auto' }} onClick={() => setIngeklapt(v => !v)}>
          {ingeklapt ? 'Tonen' : 'Inklappen'}
        </button>
      </div>

      {!ingeklapt && (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 8 }}>
          {lijst.map((d, i) => (
            <div key={`${d.item_id}-${d.ander_item_id ?? d.wat}-${i}`} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0',
              borderTop: i === 0 ? 'none' : '1px solid var(--warning-300)',
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13, lineHeight: 1.4 }}>
                <div style={{ color: 'var(--fg)' }}>
                  <strong>{d.medewerker}</strong> staat dubbel op <strong>{d.overlap}</strong>
                </div>
                <div style={{ color: 'var(--fg-muted)' }}>
                  <span style={{ display: 'inline-block', width: 72 }}>Hier:</span>
                  {d.hier.activiteit} · {d.hier.wanneer}
                </div>
                <div style={{ color: 'var(--fg-muted)' }}>
                  <span style={{ display: 'inline-block', width: 72 }}>Tegelijk:</span>
                  {d.soort === 'afwezig'
                    ? <strong style={{ color: 'var(--fg)' }}>{d.wat}</strong>
                    : d.wat} · {d.wanneer}
                  {d.ander_href && (
                    <> · <a href={d.ander_href} target="_blank" rel="noopener" style={{ color: 'var(--brand-600)', textDecoration: 'underline' }}>open dat dossier ↗</a></>
                  )}
                </div>
              </div>
              <button className="eva-btn-ghost" style={{ ...klein, flexShrink: 0 }} onClick={() => onToon(d)}>
                Toon in planning
              </button>
            </div>
          ))}
          {dubbel.length > ZICHTBAAR && (
            <button className="eva-btn-ghost" style={{ ...klein, alignSelf: 'flex-start', marginTop: 4 }} onClick={() => setAlles(v => !v)}>
              {alles ? 'Minder tonen' : `Toon alle ${dubbel.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
