'use client'

/**
 * Eén veld in het vaste intakeformulier, gekleurd naar zijn toestand.
 *
 * Het scherm toont voortaan alle velden altijd op dezelfde plek; de kleur doet het
 * werk dat eerder een wisselende veldenlijst deed. Deze component is de enige plek
 * waar een oordeel een kleur wordt, zodat elk veld er hetzelfde uitziet.
 */

import React from 'react'

import { Veld, veldStijl, klein } from '../panelen/velden'
import type { VeldSleutel } from '@/lib/mailintake/veld-eisen'
import type { Oordelen, VeldStatus } from '@/lib/mailintake/veld-status'

/** De statusnamen van het model zijn ook de toonnamen van FormField. */
function toon(status: VeldStatus) {
  return status
}

export interface VeldProps {
  sleutel: VeldSleutel
  label: string
  oordelen: Oordelen
  /** Hulptekst onder het veld; altijd zichtbaar, dus nooit een bron van verspringen. */
  uitleg?: React.ReactNode
  children: React.ReactNode
}

/**
 * Wikkelt een invoerveld in zijn oordeel.
 *
 * Een gedimd veld blijft leesbaar en blijft bewerkbaar: "speelt hier geen rol"
 * betekent niet "mag je niet invullen". Bij een opdracht op een offerte staat het
 * werkadres al op het dossier, maar als iemand het wil corrigeren moet dat kunnen.
 */
export function StatusVeld({ sleutel, label, oordelen, uitleg, children }: VeldProps) {
  const o = oordelen[sleutel] ?? { status: 'neutraal' as VeldStatus, reden: '', score: null }
  return (
    <Veld
      label={label}
      score={o.score ?? undefined}
      toon={toon(o.status)}
      toonUitleg={o.reden}
    >
      {children}
      {uitleg && <span style={{ ...klein, display: 'block', marginTop: 3 }}>{uitleg}</span>}
    </Veld>
  )
}

/** Tekstinvoer met de gedeelde veldopmaak. */
export function Tekst({
  waarde, opWijzig, bewerkbaar, plaatshouder, type = 'text',
}: {
  waarde: string
  opWijzig: (v: string) => void
  bewerkbaar: boolean
  plaatshouder?: string
  type?: 'text' | 'date' | 'number'
}) {
  return (
    <input
      type={type}
      style={veldStijl}
      value={waarde ?? ''}
      placeholder={plaatshouder}
      disabled={!bewerkbaar}
      onChange={e => opWijzig(e.target.value)}
    />
  )
}

/** Meerregelige invoer. */
export function Meerregelig({
  waarde, opWijzig, bewerkbaar, regels = 60,
}: {
  waarde: string
  opWijzig: (v: string) => void
  bewerkbaar: boolean
  regels?: number
}) {
  return (
    <textarea
      style={{ ...veldStijl, minHeight: regels }}
      value={waarde ?? ''}
      disabled={!bewerkbaar}
      onChange={e => opWijzig(e.target.value)}
    />
  )
}

/** Keuzelijst met de gedeelde veldopmaak. */
export function Keuze({
  waarde, opWijzig, bewerkbaar, opties, leegLabel = '— kies —',
}: {
  waarde: string
  opWijzig: (v: string) => void
  bewerkbaar: boolean
  opties: { waarde: string; label: string }[]
  leegLabel?: string
}) {
  return (
    <select
      style={veldStijl}
      value={waarde}
      disabled={!bewerkbaar}
      onChange={e => opWijzig(e.target.value)}
    >
      <option value="">{leegLabel}</option>
      {opties.map(o => <option key={o.waarde} value={o.waarde}>{o.label}</option>)}
    </select>
  )
}

/**
 * Een waarde die niet bewerkbaar is omdat hij van het dossier komt.
 *
 * Em-dash bij leeg, conform het design system: een leeg veld moet zichtbaar leeg
 * zijn en niet zomaar niets.
 */
export function Leeswaarde({ waarde }: { waarde: React.ReactNode }) {
  const leeg = waarde == null || waarde === ''
  return (
    <div className={`py-[7px] text-[13.5px] ${leeg ? 'text-neutral-400' : 'text-neutral-800'}`}>
      {leeg ? '—' : waarde}
    </div>
  )
}
