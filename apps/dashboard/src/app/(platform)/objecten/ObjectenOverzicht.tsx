'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { GebruikerLayout } from '@everts/database'
import { VASTGOED_OBJECT_SOORTEN } from '@everts/database'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { PageHeader, Button, Badge } from '@/components/ui'
import { IconPlus } from '@/components/eva/Icons'
import type { ObjectRij } from '@/lib/objecten/data'
import { objectAdresRegel } from '@/lib/objecten/adres'
import { bouw7StatusLabel } from '@/lib/objecten/types'
import { synchroniseerObjecten } from './actions'

const soortLabel = (key: string) =>
  VASTGOED_OBJECT_SOORTEN.find(s => s.key === key)?.label ?? key

const zacht = { fontSize: 13, color: 'var(--fg-soft)' } as const

const KOLOMMEN: KolomDefinitie<ObjectRij>[] = [
  {
    key: 'naam',
    label: 'Naam',
    vast: true,
    filterType: 'tekst',
    breedte: 300,
    sorteerWaarde: r => r.naam.toLowerCase(),
    render: r => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontWeight: 600 }}>{r.naam}</span>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{r.objectnummer}</span>
      </div>
    ),
  },
  {
    key: 'soort',
    label: 'Soort',
    filterType: 'select',
    filterOpties: VASTGOED_OBJECT_SOORTEN.map(s => s.label),
    sorteerWaarde: r => soortLabel(r.soort),
    render: r => <Badge tone="neutral">{soortLabel(r.soort)}</Badge>,
  },
  {
    key: 'adres',
    label: 'Adres',
    filterType: 'tekst',
    breedte: 320,
    sorteerWaarde: r => (r.adres_straat ?? '').toLowerCase(),
    render: r => <span style={zacht}>{objectAdresRegel(r) || '—'}</span>,
  },
  {
    key: 'adres_plaats',
    label: 'Plaats',
    filterType: 'tekst',
    sorteerWaarde: r => (r.adres_plaats ?? '').toLowerCase(),
    render: r => <span style={zacht}>{r.adres_plaats ?? '—'}</span>,
  },
  {
    key: 'vve_code',
    label: 'VvE-code',
    standaard_zichtbaar: false,
    filterType: 'tekst',
    sorteerWaarde: r => r.vve_code ?? '',
    render: r => <span style={zacht}>{r.vve_code ?? '—'}</span>,
  },
  {
    key: 'opdrachtgever',
    label: 'Opdrachtgever',
    filterType: 'tekst',
    breedte: 220,
    sorteerWaarde: r => (r.opdrachtgever_naam ?? '').toLowerCase(),
    render: r => <span style={zacht}>{r.opdrachtgever_naam ?? '—'}</span>,
  },
  {
    key: 'aantal_dossiers',
    label: 'Dossiers',
    breedte: 100,
    sorteerWaarde: r => r.aantal_dossiers,
    render: r => (
      <span style={{ fontSize: 13, fontWeight: r.aantal_dossiers > 0 ? 600 : 400, color: r.aantal_dossiers > 0 ? 'var(--fg)' : 'var(--fg-muted)' }}>
        {r.aantal_dossiers}
      </span>
    ),
  },
  {
    key: 'bouw7',
    label: 'Bouw7',
    standaard_zichtbaar: false,
    filterType: 'select',
    filterOpties: ['In Bouw7', 'Nog niet in Bouw7', 'Fout bij Bouw7'],
    sorteerWaarde: r => bouw7StatusLabel(r).label,
    render: r => {
      const { label, toon } = bouw7StatusLabel(r)
      return <Badge tone={toon === 'ok' ? 'success' : toon === 'fout' ? 'error' : 'warning'}>{label}</Badge>
    },
  },
  {
    key: 'actief',
    label: 'Actief',
    standaard_zichtbaar: false,
    filterType: 'select',
    filterOpties: ['Ja', 'Nee'],
    sorteerWaarde: r => (r.actief ? 'Ja' : 'Nee'),
    render: r => <Badge tone={r.actief ? 'success' : 'neutral'}>{r.actief ? 'Ja' : 'Nee'}</Badge>,
  },
]

type Props = {
  objecten: ObjectRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  magSchrijven: boolean
  magBeheren: boolean
}

export default function ObjectenOverzicht({ objecten, layouts, user_id, magSchrijven, magBeheren }: Props) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)

  async function haalUitBouw7() {
    setBezig(true)
    try {
      const res = await synchroniseerObjecten()
      if (!res.ok) { toast.error(res.fout); return }
      toast.success(`Objecten bijgewerkt: ${res.data?.melding ?? 'klaar'}`)
      if (res.waarschuwing) toast(res.waarschuwing, { icon: '⚠️' })
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Beheer" title="Objecten" />

      <OverzichtTabel
        scherm="objecten"
        data={objecten}
        kolommen={KOLOMMEN}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'naam', desc: false }]}
        onRijKlik={r => router.push(`/objecten/${r.id}`)}
        acties={
          <>
            {magBeheren && (
              <Button variant="secondary" onClick={haalUitBouw7} disabled={bezig}>
                {bezig ? 'Bezig…' : 'Ophalen uit Bouw7'}
              </Button>
            )}
            {magSchrijven && (
              <Button variant="primary" onClick={() => router.push('/objecten/nieuw')}>
                <IconPlus size={14} />
                Nieuw object
              </Button>
            )}
          </>
        }
      />
    </div>
  )
}
