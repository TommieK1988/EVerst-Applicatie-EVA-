'use client'

import React, { useCallback, useEffect, useState } from 'react'
import SlideRenderer from './SlideRenderer'
import type { ToolboxSchema, ContentSlide, VraagSlide } from './types'

type Kaart =
  | { soort: 'content'; slide: ContentSlide }
  | { soort: 'vraag'; slide: VraagSlide }

/**
 * Klassikale slide-weergave op een groot scherm. Content-slides in
 * auteursvolgorde, daarna de vragen (ongeschud, mét juist antwoord gemarkeerd
 * ter bespreking). Navigeren met pijltjes of spatie.
 */
export default function ToolboxPresentatie({ titel, schema }: { titel: string; schema: ToolboxSchema }) {
  const kaarten: Kaart[] = [
    ...schema.slides.filter((s): s is ContentSlide => s.type === 'content').map((slide) => ({ soort: 'content' as const, slide })),
    ...schema.slides.filter((s): s is VraagSlide => s.type === 'vraag').map((slide) => ({ soort: 'vraag' as const, slide })),
  ]
  const [idx, setIdx] = useState(0)

  const ga = useCallback((d: number) => {
    setIdx((i) => Math.max(0, Math.min(kaarten.length - 1, i + d)))
  }, [kaarten.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); ga(1) }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); ga(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ga])

  const kaart = kaarten[idx]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 120px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>{titel}</div>
        <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{idx + 1} / {kaarten.length}</div>
      </div>

      <div style={{ flex: 1, minHeight: 0, border: '1px solid var(--border)', borderRadius: 16, padding: '40px 48px', overflowY: 'auto', display: 'grid', placeItems: 'center', background: '#fff' }}>
        <div style={{ width: '100%', maxWidth: 820 }}>
          {!kaart ? (
            <div style={{ color: 'var(--fg-muted)' }}>Geen inhoud.</div>
          ) : kaart.soort === 'content' ? (
            <SlideRenderer slide={kaart.slide} />
          ) : (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#b85a00', marginBottom: 12 }}>Kennischeck</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#161b20', marginBottom: 24, lineHeight: 1.25 }}>{kaart.slide.vraag}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {kaart.slide.opties.map((o, i) => (
                  <div
                    key={o.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderRadius: 12,
                      border: `2px solid ${o.correct ? '#12b76a' : '#e3e8ea'}`,
                      background: o.correct ? '#ecfdf3' : '#fff',
                      fontSize: 18, fontWeight: 600, color: o.correct ? '#067647' : '#161b20',
                    }}
                  >
                    <span style={{ fontWeight: 800, opacity: 0.5 }}>{String.fromCharCode(65 + i)}</span>
                    <span style={{ flex: 1 }}>{o.tekst}</span>
                    {o.correct && <span>✓</span>}
                  </div>
                ))}
              </div>
              {kaart.slide.uitleg && (
                <div style={{ marginTop: 20, fontSize: 15, color: '#3a444b', lineHeight: 1.6, padding: 16, background: 'var(--bg-subtle)', borderRadius: 12 }}>
                  {kaart.slide.uitleg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
        <button onClick={() => ga(-1)} disabled={idx === 0} style={navBtn}>← Vorige</button>
        <button onClick={() => ga(1)} disabled={idx >= kaarten.length - 1} style={navBtn}>Volgende →</button>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  padding: '10px 20px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff',
  fontSize: 14, fontWeight: 600, color: 'var(--fg)', cursor: 'pointer',
}
