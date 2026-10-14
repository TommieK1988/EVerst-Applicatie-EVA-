'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { GROEN, OPPERVLAK } from './stijl'

/**
 * Balk onderaan het materieel-startscherm: scannen, en voor wie mag ook toevoegen.
 *
 * Scannen is de hoofdhandeling — sticker voor de lens, en je staat op het
 * paspoort. Kent EVA de sticker nog niet, dan biedt het scanscherm zelf aan om
 * hem te koppelen of (met 'beheren') nieuw materieel aan te maken. Daarom hoeft
 * "toevoegen" hier niet meer dan de plus ernaast: dat is alleen voor materieel
 * dat nog géén sticker heeft.
 *
 * Eerder stond hier voor beheerders alleen een grote "Toevoegen"-knop, met
 * scannen verstopt in het paneel erachter — wie iets wilde opzoeken, zag niet
 * dat dat via die knop liep.
 *
 * De balk is `sticky`, nooit `fixed` — zie MobielStickyFooter voor het waarom.
 */
export default function MaterieelToevoegKnop({ magToevoegen }: { magToevoegen: boolean }) {
  const t = useTranslations('materieel')

  return (
    <div
      style={{
        position: 'sticky', bottom: 0, marginTop: 'auto', flexShrink: 0,
        display: 'flex', gap: 8,
        padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--neutral-0, #fff)', borderTop: '1px solid var(--border)',
      }}
    >
      <Link href="/m/materieel/scan" style={scanBalk}>
        <ScanIcoon />
        {t('toevoegen.stickerScannen')}
      </Link>
      {magToevoegen && (
        <Link
          href="/m/materieel/nieuw"
          aria-label={t('toevoegen.zonderSticker')}
          title={t('toevoegen.zonderSticker')}
          style={plusKnop}
        >
          <PlusIcoon />
        </Link>
      )}
    </div>
  )
}

const scanBalk: React.CSSProperties = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '15px 16px', borderRadius: 12, textDecoration: 'none',
  background: GROEN, color: '#fff',
  fontSize: 16, fontWeight: 700, WebkitTapHighlightColor: 'transparent',
  boxSizing: 'border-box',
}

const plusKnop: React.CSSProperties = {
  flexShrink: 0, width: 52, display: 'grid', placeItems: 'center',
  borderRadius: 12, border: `1.5px solid ${GROEN}`, background: OPPERVLAK, color: GROEN,
  textDecoration: 'none', WebkitTapHighlightColor: 'transparent',
}

function PlusIcoon() {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function ScanIcoon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" />
    </svg>
  )
}
