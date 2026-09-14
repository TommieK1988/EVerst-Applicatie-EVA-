import React from 'react'
import type { Blok } from '@/lib/handboek/types'
import TabelBlok from './TabelBlok'

/**
 * Rendert één inhoudsblok van het handboek.
 *
 * Gedeeld door het mobiele scherm en (later) de beheer-preview, zodat "Bekijk
 * als" niet naast de werkelijkheid kan gaan staan.
 *
 * Tekst wordt als platte tekst met `pre-wrap` gezet, niet als HTML. Dat is
 * bewust: de inhoud wordt straks door HR in EVA bewerkt, en vrije HTML uit een
 * editor zou een sanitizer vragen die er niet is. Zelfde lijn als de toolbox.
 *
 * Elk blok krijgt `id="blok-<uuid>"`, want daar landen de zoekresultaten op.
 */
export default function BlokRenderer({ blok }: { blok: Blok }) {
  const i = blok.inhoud ?? {}
  const anker = `blok-${blok.id}`

  switch (blok.type) {
    case 'kop':
      return (
        <h2
          id={anker}
          style={{
            scrollMarginTop: 80,
            fontSize: i.niveau === 'groot' ? 19 : 16,
            fontWeight: 800,
            letterSpacing: '-0.01em',
            margin: '22px 0 6px',
            color: 'var(--fg)',
          }}
        >
          {i.tekst}
        </h2>
      )

    case 'tekst':
      return (
        <p
          id={anker}
          style={{
            scrollMarginTop: 80,
            fontSize: 15,
            lineHeight: 1.55,
            margin: '0 0 12px',
            whiteSpace: 'pre-wrap',
            color: 'var(--fg)',
          }}
        >
          {i.tekst}
        </p>
      )

    case 'lijst':
      return React.createElement(
        i.stijl === 'nummer' ? 'ol' : 'ul',
        {
          id: anker,
          style: {
            scrollMarginTop: 80,
            fontSize: 15,
            lineHeight: 1.55,
            margin: '0 0 12px',
            paddingLeft: 22,
            color: 'var(--fg)',
            // Expliciet, want Tailwind preflight zet `list-style: none` op alle
            // lijsten. Zonder dit staan de opsommingen er als losse regels en
            // valt niet te zien dat het een lijst is.
            listStyleType: i.stijl === 'nummer' ? 'decimal' : 'disc',
          },
        },
        (i.items ?? []).map((item: string, n: number) => (
          <li key={n} style={{ marginBottom: 5 }}>{item}</li>
        )),
      )

    case 'tabel':
      return <TabelBlok id={anker} kolommen={i.kolommen ?? []} rijen={i.rijen ?? []} />

    case 'let-op':
      return (
        <div
          id={anker}
          style={{
            scrollMarginTop: 80,
            margin: '0 0 12px',
            padding: '11px 13px',
            borderRadius: 10,
            fontSize: 15,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            background: i.toon === 'info' ? 'rgba(0,148,57,.08)' : 'rgba(234,88,12,.10)',
            borderLeft: `3px solid ${i.toon === 'info' ? '#009439' : '#ea580c'}`,
            color: 'var(--fg)',
          }}
        >
          {i.tekst}
        </div>
      )

    case 'stap':
      // Genummerd via CSS-counter op de ouder, zodat het nummer nooit uit de
      // pas loopt met blokken die op concept staan en dus niet meekomen.
      return (
        <li
          id={anker}
          style={{
            scrollMarginTop: 80,
            fontSize: 16,
            lineHeight: 1.5,
            marginBottom: 14,
            color: 'var(--fg)',
          }}
        >
          {i.tekst}
          {i.toelichting && (
            <span style={{ display: 'block', fontSize: 14, color: 'var(--fg-muted)', marginTop: 3 }}>
              {i.toelichting}
            </span>
          )}
        </li>
      )

    case 'afbeelding':
      return (
        <figure id={anker} style={{ scrollMarginTop: 80, margin: '0 0 14px' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={i.url} alt={i.bijschrift ?? ''} style={{ width: '100%', borderRadius: 10 }} />
          {i.bijschrift && (
            <figcaption style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 5 }}>
              {i.bijschrift}
            </figcaption>
          )}
        </figure>
      )

    case 'contact':
    case 'bijlage':
      // Allebei bewust leeg hier. Een contact-blok heeft een telefoonnummer
      // nodig dat uit een tweede query komt, en een bijlage een titel en een
      // grootte; die gegevens kent alleen de pagina. De situatiepagina zet de
      // contacten als belknop in de voetbalk, de hoofdstukpagina zet de
      // bijlagen onderaan.
      return null

    default:
      return null
  }
}
