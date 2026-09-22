'use client'

/**
 * De uitweg onder het voorstel: naar de andere route dan die EVA koos.
 *
 * Altijd onderaan de middenkolom, welke route je ook hebt. De twee links stonden
 * eerder op verschillende plekken — de ene boven het opdrachtpaneel, de andere
 * binnenin de voorstelkaart — waardoor je hem per bericht ergens anders moest
 * zoeken. Dat is precies het soort verschuiving dat een scherm onrustig maakt.
 *
 * De tweede link is nadrukkelijk gekleurd: je wijkt dan af van wat EVA voorstelde,
 * en dat hoor je te zien zolang je in die stand staat.
 */

import React from 'react'

import { klein } from './velden'

const linkStijl: React.CSSProperties = {
  background: 'none', border: 'none', padding: 0, cursor: 'pointer',
  color: 'hsl(var(--primary))', textDecoration: 'underline', font: 'inherit',
}

export default function AndereWeg({
  bewerkbaar, opdrachtroute, forceerNieuw, setForceerNieuw,
}: {
  bewerkbaar: boolean
  /** EVA wil een bestaande offerte winnen. */
  opdrachtroute: boolean
  /** De behandelaar heeft daarvan afgeweken en maakt een nieuw dossier. */
  forceerNieuw: boolean
  setForceerNieuw: (v: boolean) => void
}) {
  if (!bewerkbaar) return null

  if (forceerNieuw) {
    return (
      <p style={{ ...klein, color: 'var(--wa-700, #b85a00)' }}>
        EVA stelde voor om een bestaande offerte te winnen; je maakt hier een nieuw dossier.{' '}
        <button type="button" onClick={() => setForceerNieuw(false)} style={linkStijl}>
          Terug naar de offerte
        </button>
      </p>
    )
  }

  if (!opdrachtroute) return null

  return (
    <p style={klein}>
      Hoort deze opdracht bij geen enkele offerte van ons?{' '}
      <button type="button" onClick={() => setForceerNieuw(true)} style={linkStijl}>
        Maak er een nieuw dossier van
      </button>
    </p>
  )
}
