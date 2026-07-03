'use client'
import React from 'react'
import type { DossierRij, DossierSectie } from './types'
import { Badge } from '@/components/ui'
import { crewKleur, crewInitialen } from '@/lib/utils/crew'

function formatBedrag(bedrag: number) {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(bedrag)
}

function formatDatum(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'short',
  })
}

function opslagKleur(pct: number): string {
  if (pct >= 25) return 'var(--success-600, #009439)'
  if (pct >= 15) return 'var(--warning-600, #d97706)'
  return 'var(--error-600, #d9534f)'
}

export function DossierKaart({
  dossier, onClick, sectie,
}: {
  dossier: DossierRij
  onClick?: () => void
  sectie?: DossierSectie
}) {
  const [hovered, setHovered] = React.useState(false)

  // Voor aanvraag/offerte: toon calculator; anders: projectleider
  const toonCalculator = sectie === 'aanvraag' || sectie === 'offerte'
  const persoonsNaam = toonCalculator
    ? (dossier.calculator_naam ?? dossier.werkvoorbereider_naam ?? '')
    : (dossier.projectleider_naam ?? '')
  const persoonsDbKleur = toonCalculator
    ? (dossier.calculator_kleur ?? dossier.werkvoorbereider_kleur ?? null)
    : (dossier.projectleider_kleur ?? null)
  const persoonsKleur = persoonsDbKleur ?? (persoonsNaam ? crewKleur(crewInitialen(persoonsNaam)) : 'var(--neutral-300)')
  const persoonsInit  = persoonsNaam ? crewInitialen(persoonsNaam) : ''

  // Kostprijs + opslag voor offertes
  const verkoopprijs = dossier.bedrag_excl_btw
  const kostprijs    = dossier.kostprijs_excl_btw
  const toonFinancieel = sectie === 'offerte'
    && kostprijs != null && kostprijs > 0
    && verkoopprijs != null && verkoopprijs > 0
  const opslagPct = toonFinancieel
    ? ((verkoopprijs! - kostprijs!) / kostprijs!) * 100
    : 0

  const bouw7Url = dossier.bouw7_id
    ? `https://start.bouw7.nl/project/view?id=${dossier.bouw7_id}#/`
    : null

  // Aanvragen-tab: aanmaakdatum dossier. Offerte-tab: datum dat de offerte verzonden is.
  const kaartDatum = sectie === 'offerte'
    ? (dossier.verzonden_op ?? dossier.created_at)
    : dossier.created_at

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        padding: '12px 14px 12px 17px',
        border: '1px solid var(--border)',
        borderRadius: 8,
        background: hovered ? 'var(--neutral-50)' : 'var(--neutral-0)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        transition: 'background 0.12s, box-shadow 0.12s, transform 0.12s',
        boxShadow: hovered ? '0 4px 8px -2px rgba(16,24,40,0.10)' : 'none',
        transform: hovered ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* 3px linker accent-strip */}
      <span style={{
        position: 'absolute', left: 0, top: 8, bottom: 8, width: 3,
        background: persoonsKleur,
        borderRadius: '0 2px 2px 0',
      }} />

      {/* Dossiernummer + Bouw7-link + bedrag */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontSize: 10.5,
            color: 'var(--neutral-400)', letterSpacing: '0.01em',
          }}>
            {dossier.dossiernummer ?? 'Nieuw'}
          </span>
          {bouw7Url && (
            <a
              href={bouw7Url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title="Openen in Bouw7"
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 14, height: 14, opacity: 0.4, color: 'var(--neutral-500)',
                transition: 'opacity 0.12s', flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.stopPropagation(); (e.currentTarget as HTMLElement).style.opacity = '1' }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.4' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
            </a>
          )}
        </div>
        {verkoopprijs != null && verkoopprijs > 0 && (
          <span style={{
            fontSize: 12, fontWeight: 700,
            color: 'var(--neutral-800)', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {formatBedrag(verkoopprijs)}
          </span>
        )}
      </div>

      {/* Titel */}
      <div style={{
        fontSize: 13, fontWeight: 600, color: 'var(--neutral-900)',
        lineHeight: 1.35, letterSpacing: '-0.005em',
      }}>
        {dossier.titel}
      </div>

      {/* Klant */}
      {dossier.klant_naam && (
        <div style={{ fontSize: 12, color: 'var(--neutral-500)', fontWeight: 500 }}>
          {dossier.klant_naam}
        </div>
      )}

      {/* Kostprijs + opslag (alleen voor offerte-sectie) */}
      {toonFinancieel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--neutral-500)' }}>
            Kostprijs {formatBedrag(kostprijs!)}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: opslagKleur(opslagPct),
          }}>
            {opslagPct.toFixed(1)}% opslag
          </span>
        </div>
      )}

      {/* Footer: persoons-badge + datum */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        {persoonsNaam ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{
              display: 'inline-grid', placeItems: 'center',
              width: 20, height: 20, borderRadius: '50%',
              background: `linear-gradient(135deg, ${persoonsKleur}, ${persoonsKleur}cc)`,
              boxShadow: '0 0 0 1.5px white',
              color: '#fff', fontSize: 8.5, fontWeight: 700, flexShrink: 0,
            }}>
              {persoonsInit}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--neutral-600)', fontWeight: 500 }}>
              {persoonsNaam}
            </span>
          </div>
        ) : (
          <span />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto', flexShrink: 0 }}>
          {dossier.bouw7_uren_overschrijding && (
            <span title="Arbeid: uren op 100% overschrijden de prognose-uren">
              <Badge tone="error" size="sm">Uren</Badge>
            </span>
          )}
          {dossier.bouw7_bestelregels_afwijking && (
            <span title="Bestelregels sluiten niet aan op de prognose — projectleider: werkbegroting laten goedkeuren">
              <Badge tone="warning" size="sm">Begroting</Badge>
            </span>
          )}
          {dossier.wb_ongeaccordeerde_wijzigingen && (
            <span title="Werkbegroting bevat niet-geaccordeerde wijzigingen — laat de werkbegroting opnieuw accorderen">
              <Badge tone="warning" size="sm">WB!</Badge>
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--neutral-400)', whiteSpace: 'nowrap' }}>
            {formatDatum(kaartDatum)}
          </span>
        </div>
      </div>
    </div>
  )
}
