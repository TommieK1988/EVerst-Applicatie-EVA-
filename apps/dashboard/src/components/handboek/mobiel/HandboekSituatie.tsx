'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import type { Contact, SectieMetBlokken } from '@/lib/handboek/types'
import AppHeader from '@/components/mobiel/AppHeader'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import BlokRenderer from '@/components/handboek/BlokRenderer'
import BlokFocus from './BlokFocus'
import BelKnop from './BelKnop'
import { blokTeksten, usePaginaVertaling, vertaalBlok } from './handboek-vertaling'

export type SituatieBelKnop = { blokId: string; label: string | undefined; contact: Contact }

/**
 * Eén "Wat te doen bij…"-kaart op de telefoon, in de taal van de app.
 *
 * De pagina (server) haalt de inhoud en de contacten op; dit component toont
 * de stappen en vertaalt de teksten van kantoor in één bundel, met één
 * "Automatisch vertaald · Toon origineel"-label bovenaan. Namen en
 * telefoonnummers van de belknoppen worden niet vertaald, de rol wel.
 */
export default function HandboekSituatie({
  sectie, knoppen,
}: {
  sectie: SectieMetBlokken
  knoppen: SituatieBelKnop[]
}) {
  const t = useTranslations('handboek')
  const { vt, label } = usePaginaVertaling([
    sectie.titel,
    sectie.samenvatting,
    ...blokTeksten(sectie.blokken),
    ...knoppen.map((k) => k.contact.rol),
  ])

  const stappen = sectie.blokken.filter((b) => b.type === 'stap')
  const overig = sectie.blokken.filter((b) => b.type !== 'stap' && b.type !== 'contact')

  return (
    <>
      <AppHeader title={vt(sectie.titel)} sub={t('watTeDoenBij')} backHref="/m/handboek" />
      {/* minHeight + kolom, zodat de knoppenbalk ook bij een korte kaart
          onderaan blijft plakken (zie MobielStickyFooter). */}
      <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '18px 16px 24px', flex: 1 }}>
          {label && <div style={{ margin: '-6px 0 14px' }}>{label}</div>}

          {sectie.samenvatting && (
            <p style={{ fontSize: 15, color: 'var(--fg-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
              {vt(sectie.samenvatting)}
            </p>
          )}

          {stappen.length > 0 && (
            <ol style={{
                margin: 0, paddingLeft: 24,
                // Expliciet: Tailwind preflight zet `list-style: none` op elke
                // lijst, en een stappenplan zonder nummers is geen stappenplan.
                listStyleType: 'decimal',
              }}>
              {stappen.map((blok) => (
                <BlokRenderer key={blok.id} blok={vertaalBlok(blok, vt)} />
              ))}
            </ol>
          )}

          {overig.length > 0 && (
            <div style={{ marginTop: stappen.length ? 18 : 0 }}>
              {overig.map((blok) => (
                <BlokRenderer key={blok.id} blok={vertaalBlok(blok, vt)} />
              ))}
            </div>
          )}
        </div>

        {knoppen.length > 0 && (
          <MobielStickyFooter>
            {knoppen.map(({ blokId, label: knopLabel, contact }) => (
              <BelKnop key={blokId} contact={{ ...contact, rol: vt(contact.rol) }} label={vt(knopLabel)} />
            ))}
          </MobielStickyFooter>
        )}
      </div>
      <BlokFocus />
    </>
  )
}
