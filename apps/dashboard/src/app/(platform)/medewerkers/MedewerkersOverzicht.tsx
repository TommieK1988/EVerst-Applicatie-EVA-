'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import NieuweMedewerkerModal from '@/components/medewerkers/NieuweMedewerkerModal'
import { PageHeader, Button, Badge } from '@/components/ui'
import { IconPlus } from '@/components/eva/Icons'

type Medewerker = {
  id: string
  voornaam: string
  tussenvoegsel: string | null
  achternaam: string
  email: string | null
  telefoon: string | null
  functie: string | null
  afdeling: string | null
  extern: boolean
  actief: boolean
  uurtarief_verkoop: number | null
  uurtarief_kostprijs: number | null
  cao_schaal: string | null
  in_dienst_vanaf: string | null
}

function volledigeNaam(m: Medewerker): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
}

function initials(m: Medewerker): string {
  return [m.voornaam?.[0] ?? '', m.achternaam?.[0] ?? ''].join('').toUpperCase()
}

function formatTarief(n: number | null): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)
}

function formatDatum(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const KOLOMMEN: KolomDefinitie<Medewerker>[] = [
  {
    key: 'naam',
    label: 'Naam',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: m => volledigeNaam(m),
    render: m => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, var(--accent), var(--accent))',
          display: 'grid', placeItems: 'center',
          fontFamily: 'var(--font-display)', fontSize: 10, fontWeight: 700, color: 'white',
        }}>
          {initials(m)}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
            {volledigeNaam(m)}
          </div>
          {m.email && (
            <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>
              {m.email}
            </div>
          )}
        </div>
      </div>
    ),
  },
  {
    key: 'email',
    label: 'E-mail',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: m => m.email ?? '',
    render: m => <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>{m.email ?? '—'}</span>,
  },
  {
    key: 'telefoon',
    label: 'Telefoon',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: m => m.telefoon ?? '',
    render: m => <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>{m.telefoon ?? '—'}</span>,
  },
  {
    key: 'functie',
    label: 'Functie',
    filterType: 'tekst',
    sorteerWaarde: m => m.functie ?? '',
    render: m => <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>{m.functie ?? '—'}</span>,
  },
  {
    key: 'afdeling',
    label: 'Afdeling',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: m => m.afdeling ?? '',
    render: m => <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)' }}>{m.afdeling ?? '—'}</span>,
  },
  {
    key: 'type',
    label: 'Type',
    filterType: 'select',
    filterOpties: ['Intern', 'Extern'],
    sorteerWaarde: m => m.extern ? 'Extern' : 'Intern',
    render: m => (
      <Badge tone={m.extern ? 'warning' : 'success'}>
        {m.extern ? 'Extern' : 'Intern'}
      </Badge>
    ),
  },
  {
    key: 'uurtarief_verkoop',
    label: 'Tarief verkoop',
    standaard_zichtbaar: false,
    sorteerWaarde: m => m.uurtarief_verkoop ?? -1,
    render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{formatTarief(m.uurtarief_verkoop)}</span>,
  },
  {
    key: 'uurtarief_kostprijs',
    label: 'Tarief kostprijs',
    standaard_zichtbaar: false,
    sorteerWaarde: m => m.uurtarief_kostprijs ?? -1,
    render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)' }}>{formatTarief(m.uurtarief_kostprijs)}</span>,
  },
  {
    key: 'cao_schaal',
    label: 'CAO schaal',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: m => m.cao_schaal ?? '',
    render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>{m.cao_schaal ?? '—'}</span>,
  },
  {
    key: 'in_dienst_vanaf',
    label: 'In dienst vanaf',
    standaard_zichtbaar: false,
    sorteerWaarde: m => m.in_dienst_vanaf ?? '',
    render: m => <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)' }}>{formatDatum(m.in_dienst_vanaf)}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: ['Actief', 'Inactief'],
    sorteerWaarde: m => m.actief ? 'Actief' : 'Inactief',
    render: m => (
      <Badge variant="outline" tone={m.actief ? 'success' : 'neutral'} dot>
        {m.actief ? 'Actief' : 'Inactief'}
      </Badge>
    ),
  },
]

type Props = {
  medewerkers: Medewerker[]
  layouts: GebruikerLayout[]
  user_id: string | null
  functies: { id: string; naam: string }[]
}

export default function MedewerkersOverzicht({ medewerkers, layouts, user_id, functies }: Props) {
  const router = useRouter()
  const [showNieuw, setShowNieuw] = useState(false)

  return (
    <div className="eva-page-full">
      {/* Header */}
      <PageHeader eyebrow="HR" title="Medewerkers" />

      {/* Tabel */}
      <OverzichtTabel
        scherm="medewerkers"
        data={medewerkers}
        kolommen={KOLOMMEN}
        layouts={layouts}
        user_id={user_id}
        onRijKlik={m => router.push(`/medewerkers/${m.id}`)}
        acties={
          <Button variant="primary" onClick={() => setShowNieuw(true)}>
            <IconPlus size={14} />
            Nieuwe medewerker
          </Button>
        }
      />

      {/* Nieuw modal */}
      {showNieuw && <NieuweMedewerkerModal onClose={() => setShowNieuw(false)} functies={functies} />}
    </div>
  )
}
