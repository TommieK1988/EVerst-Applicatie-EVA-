'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import { bijlageUrl, leesbareGrootte } from '@/lib/handboek/bijlagen'
import type { Bijlage, SectieMetBlokken } from '@/lib/handboek/types'
import AppHeader from '@/components/mobiel/AppHeader'
import BlokRenderer from '@/components/handboek/BlokRenderer'
import BlokFocus from './BlokFocus'
import { blokTeksten, usePaginaVertaling, vertaalBlok } from './handboek-vertaling'

/**
 * Eén hoofdstuk van het handboek op de telefoon, in de taal van de app.
 *
 * De pagina (server) haalt de inhoud op en toetst de toegang; dit component
 * toont hem en vertaalt de teksten van kantoor in één bundel, met één
 * "Automatisch vertaald · Toon origineel"-label bovenaan.
 */
export default function HandboekHoofdstuk({
  sectie, bijlagen,
}: {
  sectie: SectieMetBlokken
  bijlagen: Bijlage[]
}) {
  const t = useTranslations('handboek')
  const { vt, label } = usePaginaVertaling([
    sectie.titel,
    sectie.samenvatting,
    ...blokTeksten(sectie.blokken),
    ...bijlagen.flatMap((b) => [b.titel, b.omschrijving]),
  ])

  return (
    <>
      <AppHeader title={vt(sectie.titel)} backHref="/m/handboek" />
      <div style={{ padding: '16px 16px 32px' }}>
        {label && <div style={{ margin: '-4px 0 12px' }}>{label}</div>}

        {sectie.samenvatting && (
          <p style={{ fontSize: 14, color: 'var(--fg-muted)', margin: '0 0 16px', lineHeight: 1.5 }}>
            {vt(sectie.samenvatting)}
          </p>
        )}

        {sectie.blokken.map((blok) => (
          <BlokRenderer key={blok.id} blok={vertaalBlok(blok, vt)} />
        ))}

        {bijlagen.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)',
              textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8,
            }}>
              {t('bijlagen')}
            </div>
            {bijlagen.map((b) => (
              <a
                key={b.id}
                href={bijlageUrl(b.id)}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'block', marginBottom: 6,
                  padding: '12px', borderRadius: 11,
                  background: 'var(--bg-elev)', border: '1px solid var(--border)',
                  textDecoration: 'none', color: 'var(--fg)',
                }}
              >
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{vt(b.titel)}</span>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--fg-muted)', marginTop: 2 }}>
                  {[vt(b.omschrijving), leesbareGrootte(b.grootte)].filter(Boolean).join(' · ')}
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
      <BlokFocus />
    </>
  )
}
