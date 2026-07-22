'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { ActielijstMetTaken, TaakMetDetails } from '@/lib/taken/supabase/database.types'
import TaakLijstWeergave from '@/components/taken/TaakLijstWeergave'
import NieuweTaakDialog from '@/components/taken/NieuweTaakDialog'
import { Badge, Card, EmptyState, Progress } from '@/components/ui'
import { useDossierReadOnly } from './DossierReadOnlyContext'

interface Props {
  lijsten: ActielijstMetTaken[]
  /** Losse taken die direct (zonder actielijst) aan het dossier/de medewerker hangen. */
  losseTaken?: TaakMetDetails[]
  dossier?: { id: string; titel: string }
  /** Alternatieve context: dezelfde kaarten op een medewerkerpagina. */
  medewerker?: { id: string; naam: string }
}

export function ActielijstenKaarten({ lijsten, losseTaken = [], dossier, medewerker }: Props) {
  const router = useRouter()
  const readOnly = useDossierReadOnly()
  // Standaard alle lijsten open
  const [ingeklapt, setIngeklapt] = useState<Set<string>>(new Set())

  if (lijsten.length === 0 && losseTaken.length === 0) {
    return (
      <EmptyState
        icon={<span style={{ fontSize: 24 }}>☑</span>}
        title="Geen acties"
        description={`Maak een losse actie aan met 'Nieuwe actie', of activeer een sjabloon om een actielijst aan ${medewerker ? 'deze medewerker' : 'dit dossier'} te koppelen.`}
      />
    )
  }

  const toggle = (id: string) =>
    setIngeklapt(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {lijsten.map(lijst => {
        const isOpen = !ingeklapt.has(lijst.id)
        const voortgang = lijst.taken_count > 0
          ? Math.round((lijst.gereed_count / lijst.taken_count) * 100)
          : 0

        return (
          <Card key={lijst.id}>
            {/* Kaart-header — klikbaar om in/uit te klappen */}
            <button
              onClick={() => toggle(lijst.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 20px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'inherit',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{lijst.naam}</div>
                  {voortgang === 100 && (
                    <Badge tone="success" size="sm">Afgerond</Badge>
                  )}
                  {lijst.auto_geactiveerd_op && (
                    <Badge tone="info" size="sm">
                      ⚡ Automatisch geactiveerd
                      {' '}
                      {new Date(lijst.auto_geactiveerd_op).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
                    </Badge>
                  )}
                </div>
                {lijst.beschrijving && (
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>{lijst.beschrijving}</div>
                )}
                {/* Voortgangsbalk */}
                <Progress
                  value={voortgang}
                  tone={voortgang === 100 ? 'success' : 'brand'}
                  size="sm"
                  className="mt-2 max-w-[200px]"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: voortgang === 100 ? '#009439' : 'var(--fg-muted)',
                }}>
                  {lijst.gereed_count}/{lijst.taken_count} gereed
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  stroke="var(--fg-muted)" strokeWidth="1.6" strokeLinecap="round"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
                >
                  <path d="M4 6l4 4 4-4"/>
                </svg>
              </div>
            </button>

            {/* Inline taken — standaard open */}
            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
                {lijst.taken.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0', textAlign: 'center' }}>
                    Geen acties in deze actielijst
                  </div>
                ) : (
                  <TaakLijstWeergave
                    taken={lijst.taken}
                    isTemplate={false}
                    toonFilters={false}
                    takenInLijst={lijst.taken.map(t => ({ id: t.id, titel: t.titel }))}
                    detailAlsDialog
                  />
                )}
                {!readOnly && (
                <div style={{ marginTop: 12 }}>
                  <NieuweTaakDialog
                    defaultLijstId={lijst.id}
                    onSuccess={() => router.refresh()}
                    trigger={
                      <button style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--fg-muted)',
                        background: 'none',
                        border: '1px dashed var(--border)',
                        borderRadius: 8,
                        padding: '6px 12px',
                        cursor: 'pointer',
                        width: '100%',
                        justifyContent: 'center',
                      }}>
                        + Actie toevoegen
                      </button>
                    }
                  />
                </div>
                )}
              </div>
            )}
          </Card>
        )
      })}

      {/* Losse taken zonder actielijst — als eigen groep in hetzelfde overzicht */}
      {losseTaken.length > 0 && (() => {
        const isOpen = !ingeklapt.has('losse-taken')
        const gereed = losseTaken.filter(t => t.status === 'gereed').length
        const voortgang = losseTaken.length > 0 ? Math.round((gereed / losseTaken.length) * 100) : 0

        return (
          <Card>
            <button
              onClick={() => toggle('losse-taken')}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '14px 20px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                color: 'inherit',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>Overige acties</div>
                  {voortgang === 100 && (
                    <Badge tone="success" size="sm">Afgerond</Badge>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                  Losse acties zonder actielijst
                </div>
                <Progress
                  value={voortgang}
                  tone={voortgang === 100 ? 'success' : 'brand'}
                  size="sm"
                  className="mt-2 max-w-[200px]"
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: voortgang === 100 ? '#009439' : 'var(--fg-muted)',
                }}>
                  {gereed}/{losseTaken.length} gereed
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  stroke="var(--fg-muted)" strokeWidth="1.6" strokeLinecap="round"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
                >
                  <path d="M4 6l4 4 4-4"/>
                </svg>
              </div>
            </button>

            {isOpen && (
              <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px' }}>
                <TaakLijstWeergave
                  taken={losseTaken}
                  isTemplate={false}
                  toonFilters={false}
                  takenInLijst={losseTaken.map(t => ({ id: t.id, titel: t.titel }))}
                  detailAlsDialog
                />
                {(dossier || medewerker) && !readOnly && (
                  <div style={{ marginTop: 12 }}>
                    <NieuweTaakDialog
                      defaultDossier={dossier}
                      defaultMedewerker={medewerker}
                      onSuccess={() => router.refresh()}
                      trigger={
                        <button style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          color: 'var(--fg-muted)',
                          background: 'none',
                          border: '1px dashed var(--border)',
                          borderRadius: 8,
                          padding: '6px 12px',
                          cursor: 'pointer',
                          width: '100%',
                          justifyContent: 'center',
                        }}>
                          + Actie toevoegen
                        </button>
                      }
                    />
                  </div>
                )}
              </div>
            )}
          </Card>
        )
      })()}
    </div>
  )
}
