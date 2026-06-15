'use client'

import React from 'react'
import { CalendarCheck, Lock } from 'lucide-react'
import type { BedrijfsagendaRegel, BedrijfsagendaType, GebruikerLayout } from '@everts/database/platform-types'
import { bedrijfsagendaTypeLabels, bedrijfsagendaTypeKleur } from '@everts/database/platform-types'
import OverzichtTabel from '@/components/overzicht/OverzichtTabel'
import type { KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { Badge } from '@/components/ui'

function itemKleur(regel: BedrijfsagendaRegel): string {
  if (regel.bron === 'berekend') return regel.kleur
  return regel.kleur ?? bedrijfsagendaTypeKleur[regel.type as BedrijfsagendaType] ?? '#64748b'
}

function typeLabel(type: string): string {
  if (type === 'verjaardag') return 'Verjaardag'
  if (type === 'jubileum')   return 'Jubileum'
  if (type === 'feestdag')   return 'Feestdag'
  return bedrijfsagendaTypeLabels[type as BedrijfsagendaType] ?? type
}

function formatDatum(start: string, eind: string): string {
  if (start === eind) return start.split('-').reverse().join('-')
  return `${start.split('-').reverse().join('-')} – ${eind.split('-').reverse().join('-')}`
}

type Props = {
  regels: BedrijfsagendaRegel[]
  layouts: GebruikerLayout[]
  user_id: string | null
  onItemClick: (item: BedrijfsagendaRegel) => void
}

const KOLOMMEN: KolomDefinitie<BedrijfsagendaRegel>[] = [
  {
    key: 'type',
    label: 'Type',
    standaard_zichtbaar: true,
    render: (item) => (
      <Badge
        dot
        size="md"
        style={{
          background: itemKleur(item) + '22',
          color: itemKleur(item),
          fontWeight: 700,
          whiteSpace: 'nowrap',
        }}
      >
        {typeLabel(item.type)}
      </Badge>
    ),
    sorteerWaarde: (item) => typeLabel(item.type),
    filterType: 'select',
    filterOpties: ['Verjaardag', 'Jubileum', 'Feestdag', 'VCA Toolbox', 'Audit', 'Teamoverleg', 'Activiteit', 'Herinnering', 'ATV-dag', 'Overig'],
  },
  {
    key: 'titel',
    label: 'Titel',
    vast: true,
    standaard_zichtbaar: true,
    render: (item) => (
      <span style={{ fontWeight: 500, color: 'var(--fg)' }}>{item.titel}</span>
    ),
    sorteerWaarde: (item) => item.titel,
    filterType: 'tekst',
  },
  {
    key: 'datum',
    label: 'Datum',
    standaard_zichtbaar: true,
    render: (item) => (
      <span style={{ fontSize: 12 }}>
        {formatDatum(item.start_datum, item.eind_datum)}
      </span>
    ),
    sorteerWaarde: (item) => item.start_datum,
  },
  {
    key: 'locatie',
    label: 'Locatie',
    standaard_zichtbaar: true,
    render: (item) => (
      <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>
        {item.bron === 'handmatig' ? (item.locatie ?? '—') : '—'}
      </span>
    ),
    sorteerWaarde: (item) => (item.bron === 'handmatig' ? (item.locatie ?? '') : ''),
    filterType: 'tekst',
  },
  {
    key: 'in_planning',
    label: 'Planning',
    standaard_zichtbaar: true,
    render: (item) => (
      item.in_planning
        ? <CalendarCheck size={14} style={{ color: 'var(--accent)' }} />
        : <span style={{ color: 'var(--fg-muted)', fontSize: 11 }}>—</span>
    ),
    sorteerWaarde: (item) => (item.in_planning ? 1 : 0),
  },
  {
    key: 'bron',
    label: 'Bron',
    standaard_zichtbaar: true,
    render: (item) => (
      item.bron === 'berekend'
        ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--fg-muted)' }}>
            <Lock size={10} /> berekend
          </span>
        )
        : (
          <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
            handmatig
          </span>
        )
    ),
    sorteerWaarde: (item) => item.bron,
    filterType: 'select',
    filterOpties: ['handmatig', 'berekend'],
  },
]

export default function AgendaLijst({ regels, layouts, user_id, onItemClick }: Props) {
  return (
    <OverzichtTabel
      data={regels}
      kolommen={KOLOMMEN}
      scherm="bedrijfsagenda-lijst"
      layouts={layouts}
      user_id={user_id}
      onRijKlik={onItemClick}
    />
  )
}
