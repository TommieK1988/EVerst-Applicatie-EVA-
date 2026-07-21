import React from 'react'
import type { ContentSlide } from './types'
import VideoEmbed from './VideoEmbed'

/**
 * Toont één content-slide (kop/tekst/afbeelding/video). Gedeeld door de mobiele
 * doorloop, de presenteer-weergave en de editor-preview, zodat de auteur precies
 * ziet wat de medewerker straks krijgt.
 */
export default function SlideRenderer({ slide, compact = false }: { slide: ContentSlide; compact?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 12 : 18 }}>
      {slide.titel && (
        <h2 style={{ margin: 0, fontSize: compact ? 18 : 24, fontWeight: 800, color: '#161b20', lineHeight: 1.2 }}>
          {slide.titel}
        </h2>
      )}
      {slide.blokken.map((blok) => {
        switch (blok.type) {
          case 'kop':
            return (
              <h3 key={blok.id} style={{ margin: 0, fontSize: blok.niveau === 'klein' ? 15 : 18, fontWeight: 700, color: '#161b20' }}>
                {blok.tekst}
              </h3>
            )
          case 'tekst':
            return (
              <p key={blok.id} style={{ margin: 0, fontSize: compact ? 14 : 16, lineHeight: 1.6, color: '#3a444b', whiteSpace: 'pre-wrap' }}>
                {blok.tekst}
              </p>
            )
          case 'afbeelding':
            return (
              <figure key={blok.id} style={{ margin: 0 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={blok.url} alt={blok.bijschrift || ''} style={{ width: '100%', borderRadius: 10, display: 'block' }} />
                {blok.bijschrift && (
                  <figcaption style={{ fontSize: 12, color: '#6b757c', marginTop: 6, textAlign: 'center' }}>
                    {blok.bijschrift}
                  </figcaption>
                )}
              </figure>
            )
          case 'video':
            return <VideoEmbed key={blok.id} provider={blok.provider} videoId={blok.videoId} titel={blok.titel} />
          default:
            return null
        }
      })}
    </div>
  )
}
