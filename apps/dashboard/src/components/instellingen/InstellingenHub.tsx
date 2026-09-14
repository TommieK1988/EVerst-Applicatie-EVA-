'use client'

import React from 'react'
import Link from 'next/link'
import { Input, EmptyState } from '@/components/ui'
import type { InstellingSectie } from '@/lib/instellingen/catalogus'

/**
 * De tegelhub van /instellingen: secties in zijbalkvolgorde, met een zoekveld erboven.
 *
 * Het zoekveld is er voor wie de indeling niet kent. Het filtert op titel, omschrijving én
 * de onzichtbare `synoniemen` uit de catalogus — zo vindt "logo" de Huisstijl en "wachtwoord"
 * de Gebruikers & rechten, ook al staan die woorden nergens op het scherm.
 *
 * De server geeft alléén de tegels door die deze gebruiker mag zien; hier wordt niet meer
 * op rechten gefilterd.
 */
export default function InstellingenHub({ secties }: { secties: InstellingSectie[] }) {
  const [zoek, setZoek] = React.useState('')

  const term = normaliseer(zoek)
  const gefilterd = React.useMemo(() => {
    if (!term) return secties
    return secties
      .map(s => ({ ...s, tegels: s.tegels.filter(t => past(t, term)) }))
      .filter(s => s.tegels.length > 0)
  }, [secties, term])

  const aantal = gefilterd.reduce((n, s) => n + s.tegels.length, 0)

  // Niets te tonen zónder zoekopdracht betekent: deze gebruiker heeft nergens beheerrecht.
  if (secties.length === 0) {
    return (
      <EmptyState
        title="Je hebt geen instellingen om te beheren"
        description="Beheerschermen zijn afgeschermd per onderdeel. Vraag een beheerder om toegang als je hier iets zou moeten kunnen instellen."
        tone="neutral"
      />
    )
  }

  return (
    <>
      <div style={{ maxWidth: 380, marginBottom: 24 }}>
        <Input
          type="search"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoek een instelling — bijv. btw, logo, rechten"
          aria-label="Zoek een instelling"
          prefix={<ZoekIcoon />}
        />
      </div>

      {aantal === 0 ? (
        <EmptyState
          title={`Niets gevonden voor “${zoek.trim()}”`}
          description="Probeer een ander woord, bijvoorbeeld btw, logo, rechten, sjabloon of uren."
          tone="neutral"
        />
      ) : (
        gefilterd.map((sectie, i) => (
          <div key={sectie.titel} style={{ marginTop: i === 0 ? 0 : 28 }}>
            <div style={sectieKop}>{sectie.titel}</div>
            {sectie.toelichting && <div style={sectieToelichting}>{sectie.toelichting}</div>}
            <div style={grid}>
              {sectie.tegels.map(tegel => (
                <Link key={tegel.href} href={tegel.href} style={kaart}>
                  <div style={kaartTitel}>{tegel.titel}</div>
                  <div style={kaartTekst}>{tegel.omschrijving}</div>
                </Link>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}

/** Kleinkapitaal en trema's weg, zodat "categorieen" ook "categorieën" vindt. */
function normaliseer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
}

function past(tegel: { titel: string; omschrijving: string; synoniemen?: string[] }, term: string): boolean {
  const hooiberg = normaliseer(
    [tegel.titel, tegel.omschrijving, ...(tegel.synoniemen ?? [])].join(' '),
  )
  // Elk los woord moet ergens voorkomen: "btw tarief" vindt de BTW-tegel, "btw logo" niets.
  return term.split(/\s+/).every(woord => hooiberg.includes(woord))
}

function ZoekIcoon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

const sectieKop: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--fg-muted)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  marginBottom: 10,
}

const sectieToelichting: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 12,
  color: 'var(--fg-muted)',
  marginTop: -6,
  marginBottom: 10,
}

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
  gap: 10,
}

const kaart: React.CSSProperties = {
  display: 'block',
  padding: '18px 20px',
  background: 'var(--bg-elev)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  textDecoration: 'none',
  transition: 'background 0.15s',
}

const kaartTitel: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--fg)',
  marginBottom: 5,
}

const kaartTekst: React.CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 13,
  color: 'var(--fg-muted)',
  lineHeight: 1.5,
}
