'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { GebruikerLayout } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Button } from '@/components/ui'
import { IconPlus } from '@/components/eva/Icons'
import StatusBadge from './StatusBadge'
import {
  CATEGORIE_LABELS, NIVEAU_LABELS, MATERIEEL_STATUSSEN, STATUS_META,
  type MaterieelObjectRij,
} from '@/lib/materieel/types'

function euro(v: number | null): string {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(v)
}

const KOLOMMEN: KolomDefinitie<MaterieelObjectRij>[] = [
  {
    key: 'omschrijving',
    label: 'Materieel',
    vast: true,
    filterType: 'tekst',
    sorteerWaarde: (r) => r.omschrijving,
    render: (r) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0, overflow: 'hidden',
          background: 'var(--bg-subtle)', display: 'grid', placeItems: 'center',
          fontSize: 14,
        }}>
          {r.hoofdfoto_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={r.hoofdfoto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : '📦'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {r.omschrijving}
          </div>
          <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
            {[r.merk, r.type].filter(Boolean).join(' · ') || '—'}
          </div>
        </div>
      </div>
    ),
  },
  {
    key: 'inventarisnummer',
    label: 'Inv.nr',
    filterType: 'tekst',
    sorteerWaarde: (r) => r.inventarisnummer ?? '',
    render: (r) => <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--fg-soft)' }}>{r.inventarisnummer ?? '—'}</span>,
  },
  {
    key: 'categorie',
    label: 'Categorie',
    filterType: 'select',
    filterOpties: Object.values(CATEGORIE_LABELS),
    sorteerWaarde: (r) => CATEGORIE_LABELS[r.categorie],
    render: (r) => <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>{CATEGORIE_LABELS[r.categorie]}</span>,
  },
  {
    key: 'status',
    label: 'Status',
    filterType: 'select',
    filterOpties: MATERIEEL_STATUSSEN.map((s) => STATUS_META[s].label),
    sorteerWaarde: (r) => STATUS_META[r.status].label,
    render: (r) => <StatusBadge status={r.status} />,
  },
  {
    key: 'toegewezen_naam',
    label: 'Toewijzing',
    filterType: 'tekst',
    sorteerWaarde: (r) => r.toegewezen_naam ?? '',
    render: (r) => (
      <span style={{ fontSize: 13, color: 'var(--fg-soft)' }}>
        {r.toegewezen_naam
          ? <>{r.toegewezen_naam}{r.toewijzing_niveau && r.toewijzing_niveau !== 'algemeen' && (
              <span style={{ fontSize: 11, color: 'var(--fg-muted)', marginLeft: 6 }}>
                ({NIVEAU_LABELS[r.toewijzing_niveau]})
              </span>
            )}</>
          : '—'}
      </span>
    ),
  },
  {
    key: 'serienummer',
    label: 'Serienummer',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: (r) => r.serienummer ?? '',
    render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.serienummer ?? '—'}</span>,
  },
  {
    key: 'leverancier',
    label: 'Leverancier',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: (r) => r.leverancier ?? '',
    render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.leverancier ?? '—'}</span>,
  },
  {
    key: 'aankoopdatum',
    label: 'Aankoop',
    standaard_zichtbaar: false,
    sorteerWaarde: (r) => r.aankoopdatum ?? '',
    render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{r.aankoopdatum ? new Date(r.aankoopdatum).toLocaleDateString('nl-NL') : '—'}</span>,
  },
  {
    key: 'aanschafwaarde',
    label: 'Aanschafwaarde',
    standaard_zichtbaar: false,
    sorteerWaarde: (r) => r.aanschafwaarde ?? 0,
    render: (r) => <span style={{ fontSize: 12, color: 'var(--fg-soft)' }}>{euro(r.aanschafwaarde)}</span>,
  },
]

type Props = {
  objecten: MaterieelObjectRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export default function MaterieelOverzicht({ objecten, layouts, user_id }: Props) {
  const router = useRouter()

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Materieelbeheer" title="Materieel" />

      {objecten.length === 0 ? (
        <div style={{
          marginTop: 24, padding: '48px 24px', textAlign: 'center',
          border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--bg-subtle)',
        }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 600, color: 'var(--fg)' }}>
            Nog geen materieel geregistreerd
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', marginTop: 4, marginBottom: 16 }}>
            Voeg je eerste gereedschap, machine of aanhanger toe om te beginnen.
          </div>
          <Link href="/materieelbeheer/nieuw">
            <Button variant="primary"><IconPlus size={14} /> Nieuw materieel</Button>
          </Link>
        </div>
      ) : (
        <OverzichtTabel
          scherm="materieel-objecten"
          data={objecten}
          kolommen={KOLOMMEN}
          layouts={layouts}
          user_id={user_id}
          onRijKlik={(r) => router.push(`/materieelbeheer/${r.id}`)}
          acties={
            <Link href="/materieelbeheer/nieuw">
              <Button variant="primary"><IconPlus size={14} /> Nieuw materieel</Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
