'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Badge } from '@/components/ui'
import type { InspectieRij } from '@/lib/kwaliteit/inspecties'

const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const

/**
 * Overzicht van alle kwaliteitsrondes (§55).
 *
 * Er staat bewust geen "Nieuwe inspectie"-knop: een ronde start altijd vanuit een actie in een
 * actielijst. Dat is een expliciete keuze — zo blijft de planning van de rondes bij de actielijst
 * en ontstaat er geen tweede, ongeplande ingang.
 */
export default function InspectiesOverzicht({
  inspecties,
  disciplines,
  layouts,
  user_id,
}: {
  inspecties: InspectieRij[]
  disciplines: { code: string; naam: string }[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  const router = useRouter()

  const naamPerCode = React.useMemo(
    () => new Map(disciplines.map(d => [d.code, d.naam])),
    [disciplines],
  )

  const kolommen: KolomDefinitie<InspectieRij>[] = React.useMemo(() => [
    {
      key: 'inspectienummer',
      label: 'Inspectie',
      vast: true,
      filterType: 'tekst',
      breedte: 150,
      sorteerWaarde: r => r.inspectienummer,
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 600 }}>{r.inspectienummer}</span>
          <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            {new Date(r.datum).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
      ),
    },
    {
      key: 'project',
      label: 'Project',
      filterType: 'tekst',
      breedte: 300,
      sorteerWaarde: r => r.projectnaam.toLowerCase(),
      render: r => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ fontWeight: 600 }}>{r.projectnaam}</span>
          {r.dossiernummer && (
            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.dossiernummer}</span>
          )}
        </div>
      ),
    },
    {
      key: 'inspecteur',
      label: 'Inspecteur',
      filterType: 'tekst',
      sorteerWaarde: r => (r.inspecteur ?? '').toLowerCase(),
      render: r => <span style={zacht}>{r.inspecteur ?? '—'}</span>,
    },
    {
      key: 'disciplines',
      label: 'Disciplines',
      breedte: 260,
      filterType: 'select',
      filterOpties: disciplines.map(d => d.naam),
      // filterWaarde moet exact een filteroptie teruggeven, anders valt de lijst leeg zodra je
      // filtert (bekende valkuil van OverzichtTabel).
      filterWaarde: r => r.disciplines.map(c => naamPerCode.get(c) ?? c),
      sorteerWaarde: r => r.disciplines.length,
      render: r => (
        <span style={zacht}>
          {r.disciplines.map(c => naamPerCode.get(c) ?? c).join(', ') || '—'}
        </span>
      ),
    },
    {
      key: 'aantal_beoordeeld',
      label: 'Beoordeeld',
      sorteerWaarde: r => r.aantal_beoordeeld,
      render: r => <span style={zacht}>{r.aantal_beoordeeld}</span>,
    },
    {
      key: 'aantal_afwijkingen',
      label: 'Afwijkingen',
      sorteerWaarde: r => r.aantal_afwijkingen,
      render: r => (
        <span style={{ ...zacht, fontWeight: r.aantal_afwijkingen > 0 ? 600 : 400 }}>
          {r.aantal_afwijkingen}
        </span>
      ),
    },
    {
      key: 'aantal_kritiek',
      label: 'Kritiek',
      sorteerWaarde: r => r.aantal_kritiek,
      render: r => r.aantal_kritiek > 0
        ? <Badge tone="error">{r.aantal_kritiek}</Badge>
        : <span style={zacht}>—</span>,
    },
    {
      key: 'status',
      label: 'Status',
      filterType: 'select',
      filterOpties: ['Concept', 'Definitief'],
      filterWaarde: r => (r.status === 'definitief' ? 'Definitief' : 'Concept'),
      sorteerWaarde: r => r.status,
      render: r => r.status === 'definitief'
        ? <Badge tone="success">Definitief</Badge>
        : <Badge tone="neutral">Concept</Badge>,
    },
  ], [disciplines, naamPerCode])

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="KAM / VGM" title="Kwaliteitsinspecties" />
      <p style={{ margin: '-14px 0 18px', fontSize: 13.5, color: 'var(--fg-muted)', maxWidth: 720 }}>
        Alle uitgevoerde en lopende kwaliteitsrondes. Een ronde start vanuit een actie in de
        actielijst van het project; er is bewust geen losse startknop.
      </p>
      <OverzichtTabel
        scherm="kwaliteit-inspecties"
        data={inspecties}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'inspectienummer', desc: true }]}
        onRijKlik={r => router.push(`/kam/kwaliteit/${r.id}`)}
      />
    </div>
  )
}
