'use client'

import React from 'react'
import Link from 'next/link'
import { CATEGORIE_LABELS, STATUS_META } from '@/lib/materieel/types'
import type { MaterieelTreffer } from '@/lib/materieel/zoeken'
import { GRIJS, RAND } from './stijl'

/**
 * Eén regel materieel in een mobiele lijst.
 *
 * Staat los van het scherm eromheen omdat dezelfde regel op drie plekken
 * terugkomt — zoeken op het beginscherm, de stickerlijst en straks de rest — en
 * hij overal dezelfde dingen moet tonen. Welke dingen: precies de velden waarop
 * ook gezocht wordt. Anders zoek je op een serienummer, krijg je een treffer, en
 * zie je nergens waaróm dit de treffer is.
 */
export default function MaterieelRegel({
  object,
  fotoUrl,
  aanvulling,
  onClick,
  href,
  gedimd = false,
}: {
  object: MaterieelTreffer
  fotoUrl?: string | null
  /** Extra regel onderaan, bijv. "Koppelen…" tijdens het opslaan. */
  aanvulling?: React.ReactNode
  onClick?: () => void
  href?: string
  gedimd?: boolean
}) {
  const status = STATUS_META[object.status]
  const kenmerken = [
    CATEGORIE_LABELS[object.categorie],
    object.merk,
    object.type,
    object.serienummer && `sn ${object.serienummer}`,
    object.keuringsnummer
      ? `keuring ${object.keuringsnummer}`
      : object.inventarisnummer && `nr ${object.inventarisnummer}`,
  ].filter(Boolean).join(' · ')

  const binnenkant = (
    <>
      <span style={{
        width: 46, height: 46, borderRadius: 10, flexShrink: 0,
        background: fotoUrl ? `center/cover url(${fotoUrl})` : 'var(--bg)',
        border: `1px solid ${RAND}`,
      }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        {/* Twee regels en dan afkappen: een omschrijving als "Bouwstofzuiger met
            slangenset en extra filter" duwt de regel anders vier regels hoog en
            dan passen er nog maar drie treffers op het scherm. */}
        <span style={{
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden', fontSize: 15, fontWeight: 700,
        }}>
          {object.omschrijving}
        </span>
        <span style={{ display: 'block', fontSize: 12, color: GRIJS, marginTop: 2 }}>{kenmerken}</span>
        <span style={{ display: 'block', fontSize: 12, color: GRIJS, marginTop: 2 }}>
          {object.toegewezen_naam}
        </span>
        {aanvulling && (
          <span style={{ display: 'block', fontSize: 12, color: GRIJS, marginTop: 4 }}>{aanvulling}</span>
        )}
      </span>
      <span style={{
        fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
        color: status.kleur, background: `${status.kleur}1a`, flexShrink: 0,
      }}>
        {status.label}
      </span>
    </>
  )

  const stijl: React.CSSProperties = {
    display: 'flex', alignItems: 'flex-start', gap: 12, textAlign: 'left',
    width: '100%', padding: '10px 12px', borderRadius: 12,
    background: 'var(--bg-elev)', border: `1px solid ${RAND}`,
    color: 'var(--fg)', font: 'inherit', textDecoration: 'none',
    cursor: 'pointer', opacity: gedimd ? 0.5 : 1,
    WebkitTapHighlightColor: 'transparent',
  }

  // Bewust `Link` en geen `<a>`: een volledige paginalading gooit de gedeelde
  // camerastream weg, en dan vraagt de scanner opnieuw om toestemming.
  if (href) return <Link href={href} style={stijl}>{binnenkant}</Link>
  return <button type="button" onClick={onClick} disabled={gedimd} style={stijl}>{binnenkant}</button>
}
