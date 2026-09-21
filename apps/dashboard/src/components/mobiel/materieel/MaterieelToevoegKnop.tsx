'use client'

import React from 'react'
import Link from 'next/link'
import BottomSheet from '../BottomSheet'
import { GRIJS, GROEN, OPPERVLAK, RAND, TEKST } from './stijl'

/**
 * Plus-knop onderaan het materieel-startscherm.
 *
 * Toevoegen begint op twee manieren: met een sticker in de hand (scannen, dan
 * hangt de code er meteen aan) of zonder (kantoor voert in, de bus plakt later).
 * Die keuze staat in een paneel achter de plus in plaats van als twee knoppen
 * bovenaan het scherm: bovenaan hoort te staan wat je hebt, onderaan wat je doet
 * — en daar zit je duim.
 *
 * Zonder schrijfrecht valt er niets toe te voegen; dan blijft de balk staan als
 * directe scanknop, want opzoeken door te scannen mag met alleen leesrecht.
 *
 * De balk is `sticky`, nooit `fixed` — zie MobielStickyFooter voor het waarom.
 */
export default function MaterieelToevoegKnop({ magToevoegen }: { magToevoegen: boolean }) {
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <div
        style={{
          position: 'sticky', bottom: 0, marginTop: 'auto', flexShrink: 0,
          padding: '12px 14px calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'var(--neutral-0, #fff)', borderTop: `1px solid ${RAND}`,
        }}
      >
        {magToevoegen ? (
          <button type="button" onClick={() => setOpen(true)} style={balk}>
            <PlusIcoon />
            Toevoegen
          </button>
        ) : (
          <Link href="/m/materieel/scan" style={{ ...balk, textDecoration: 'none' }}>
            <ScanIcoon />
            Sticker scannen
          </Link>
        )}
      </div>

      {open && (
        <BottomSheet titel="Materieel toevoegen" onSluit={() => setOpen(false)}>
          <Keuze
            href="/m/materieel/scan"
            icoon={<ScanIcoon />}
            titel="Sticker scannen"
            uitleg="Scan de sticker die je erop plakt; de code hangt er dan meteen aan."
          />
          <Keuze
            href="/m/materieel/nieuw"
            icoon={<PlusIcoon />}
            titel="Toevoegen zonder sticker"
            uitleg="Nog geen sticker bij de hand. Koppelen kan later op het paspoort."
          />
        </BottomSheet>
      )}
    </>
  )
}

const balk: React.CSSProperties = {
  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '15px 16px', borderRadius: 12, border: 'none',
  background: GROEN, color: '#fff', fontFamily: 'inherit',
  fontSize: 16, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
  boxSizing: 'border-box',
}

function Keuze({ href, icoon, titel, uitleg }: {
  href: string
  icoon: React.ReactNode
  titel: string
  uitleg: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14,
        borderRadius: 14, background: OPPERVLAK, border: `1px solid ${RAND}`,
        textDecoration: 'none', color: TEKST, WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        flexShrink: 0, width: 38, height: 38, borderRadius: 10,
        display: 'grid', placeItems: 'center',
        background: `${GROEN}1a`, color: GROEN,
      }}>
        {icoon}
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{titel}</span>
        <span style={{ display: 'block', fontSize: 13, color: GRIJS, lineHeight: 1.4, marginTop: 2 }}>
          {uitleg}
        </span>
      </span>
    </Link>
  )
}

function PlusIcoon() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" aria-hidden>
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
