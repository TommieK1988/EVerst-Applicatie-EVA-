'use client'

import React, { useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { useTranslations } from 'next-intl'
import BottomSheet from './BottomSheet'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { markeerMobielUpdatesGezien } from '@/lib/mobiel/updates-actions'
import type { MobielUpdate } from '@/lib/mobiel/updates'
import { AMBER, GRIJS, GROEN, RAND, TEKST, primaireKnop } from './oplevering/stijl'

const CATEGORIE_KLEUR: Record<MobielUpdate['categorie'], string> = {
  nieuw: GROEN,
  verbeterd: '#1d4e89',
  opgelost: AMBER,
}

/**
 * "Nieuw in EVA Mobiel" — paneel op het startscherm zodra er changelog-items voor de app
 * zijn die deze gebruiker nog niet zag.
 *
 * Onder de items staat altijd de oproep de app helemaal af te sluiten en opnieuw te
 * openen. Een PWA die op de achtergrond blijft draaien houdt de oude versie vast; wie dan
 * een nieuwe functie probeert, krijgt fouten die al lang opgelost zijn.
 *
 * Elke manier van sluiten telt als gezien — ook wegtikken. Anders komt hij bij elke
 * terugkeer naar het startscherm terug, en dat leert mensen vooral wegtikken.
 */
export default function MobielUpdates({ items }: { items: MobielUpdate[] }) {
  const t = useTranslations('updates')
  const [open, setOpen] = useState(items.length > 0)
  if (!open) return null

  const sluit = () => {
    setOpen(false)
    void markeerMobielUpdatesGezien()
  }

  return (
    <BottomSheet titel={t('titel')} onSluit={sluit} sluitLabel={t('sluiten')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map(item => (
          <div key={item.id} style={{ borderBottom: `1px solid ${RAND}`, paddingBottom: 12 }}>
            <span style={{
              display: 'inline-block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: 0.4, color: CATEGORIE_KLEUR[item.categorie], marginBottom: 4,
            }}>
              {t(`categorie.${item.categorie}`)}
            </span>
            <VertaalbareTekst as="div" tekst={item.titel} label={false}
              style={{ fontSize: 15, fontWeight: 700, color: TEKST }} />
            <VertaalbareTekst as="div" tekst={item.omschrijving}
              style={{ fontSize: 14, color: GRIJS, marginTop: 4, lineHeight: 1.45 }} />
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', gap: 12, alignItems: 'flex-start', padding: 12, borderRadius: 12,
        background: 'rgba(185, 137, 0, 0.10)', border: `1px solid rgba(185, 137, 0, 0.35)`,
      }}>
        <RotateCcw size={20} color={AMBER} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>{t('herstartTitel')}</div>
          <div style={{ fontSize: 14, color: TEKST, marginTop: 4, lineHeight: 1.45 }}>{t('herstartTekst')}</div>
        </div>
      </div>

      <button type="button" onClick={sluit} style={{ ...primaireKnop, width: '100%', whiteSpace: 'normal' }}>
        {t('begrepen')}
      </button>
    </BottomSheet>
  )
}
