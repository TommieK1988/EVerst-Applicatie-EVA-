'use client'

/**
 * Compacte dossierlijst voor de contactpersoonpagina.
 *
 * Bewust géén OverzichtTabel zoals op de relatiepagina: hier gaat het om "welke dossiers lopen
 * via deze persoon", niet om filteren en optellen. Afgesloten dossiers staan er wel bij, maar
 * gedempt en onderaan — bij een contactpersoon is de historie juist het nuttige deel.
 */

import React from 'react'
import Link from 'next/link'
import { Card, CardBody, CardHeader, Badge, EmptyState } from '@/components/ui'
import { FASE_LABEL } from '@/lib/dossiers/fase'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'

export default function DossierLijstBlok({
  titel, dossiers,
}: { titel: string; dossiers: RelatieDossier[] }) {
  const gesorteerd = [...dossiers].sort((a, b) => {
    const afgeslotenA = a.fase === 'afgesloten' ? 1 : 0
    const afgeslotenB = b.fase === 'afgesloten' ? 1 : 0
    if (afgeslotenA !== afgeslotenB) return afgeslotenA - afgeslotenB
    return b.updated_at.localeCompare(a.updated_at)
  })

  return (
    <Card>
      <CardHeader>
        <span>{titel}{dossiers.length > 0 ? ` · ${dossiers.length}` : ''}</span>
      </CardHeader>
      <CardBody>
        {gesorteerd.length === 0 ? (
          <EmptyState
            size="sm" tone="neutral"
            title="Geen dossiers"
            description="Dossiers waarop deze persoon de contactpersoon is, verschijnen hier."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {gesorteerd.map((d, i) => {
              const inhoud = (
                <>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: d.fase === 'afgesloten' ? 'var(--fg-muted)' : 'var(--fg)',
                    }}>
                      {d.titel}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                      {d.dossiernummer ?? '—'}
                      {d.adres ? ` · ${d.adres}` : ''}
                    </div>
                  </div>
                  <Badge tone={d.fase === 'afgesloten' ? 'neutral' : 'brand'} size="sm">
                    {FASE_LABEL[d.fase]}
                  </Badge>
                </>
              )
              const stijl: React.CSSProperties = {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 0', textDecoration: 'none', color: 'inherit',
                borderTop: i === 0 ? 'none' : '1px solid var(--border)',
              }
              // Zonder bekend routesegment geen link: een gok geeft een 404 (zie `dossierSegment`).
              return d.href
                ? <Link key={d.id} href={d.href} style={stijl}>{inhoud}</Link>
                : <div key={d.id} style={stijl}>{inhoud}</div>
            })}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
