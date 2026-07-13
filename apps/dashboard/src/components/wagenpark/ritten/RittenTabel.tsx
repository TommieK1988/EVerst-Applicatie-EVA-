'use client'

import React, { useMemo } from 'react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'

export type RitRij = {
  id: string
  start_datum: string
  start_tijd: string | null
  stop_tijd: string | null
  kenteken: string
  bestuurder_naam_raw: string | null
  afstand_km: number | null
  rit_type_effectief: 'zakelijk' | 'prive' | null
  rit_type_ulu: string | null
  score: number | null
  adres_stop: string | null
}

function tijd(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

function typeLabel(t: RitRij['rit_type_effectief']): string {
  if (t === 'zakelijk') return 'Zakelijk'
  if (t === 'prive') return 'Privé'
  return '—'
}

export default function RittenTabel({
  data,
  layouts,
  user_id,
}: {
  data: RitRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  const bestuurderOpties = useMemo(
    () =>
      [...new Set(data.map((r) => r.bestuurder_naam_raw).filter((v): v is string => !!v))].sort(
        (a, b) => a.localeCompare(b, 'nl'),
      ),
    [data],
  )
  const uluOpties = useMemo(
    () => [...new Set(data.map((r) => r.rit_type_ulu).filter((v): v is string => !!v))].sort(),
    [data],
  )

  const kolommen = useMemo<KolomDefinitie<RitRij>[]>(
    () => [
      {
        key: 'datum',
        label: 'Datum',
        vast: true,
        breedte: 150,
        sorteerWaarde: (r) => r.start_datum,
        render: (r) => formatDatumMetDag(r.start_datum),
      },
      {
        key: 'start',
        label: 'Start',
        breedte: 80,
        sorteerWaarde: (r) => r.start_tijd ?? '',
        render: (r) => tijd(r.start_tijd),
      },
      {
        key: 'einde',
        label: 'Einde rit',
        breedte: 90,
        sorteerWaarde: (r) => r.stop_tijd ?? '',
        render: (r) => tijd(r.stop_tijd),
      },
      {
        key: 'kenteken',
        label: 'Kenteken',
        breedte: 110,
        filterType: 'tekst',
        sorteerWaarde: (r) => r.kenteken,
        render: (r) => r.kenteken,
      },
      {
        key: 'bestuurder',
        label: 'Bestuurder',
        breedte: 170,
        filterType: 'select',
        filterOpties: bestuurderOpties,
        sorteerWaarde: (r) => r.bestuurder_naam_raw ?? '',
        render: (r) => (
          <span className="block max-w-[170px] truncate">{r.bestuurder_naam_raw ?? '—'}</span>
        ),
      },
      {
        key: 'bestemming',
        label: 'Bestemming',
        breedte: 220,
        filterType: 'tekst',
        sorteerWaarde: (r) => r.adres_stop ?? '',
        render: (r) => (
          <span className="block max-w-[220px] truncate">{r.adres_stop ?? '—'}</span>
        ),
      },
      {
        key: 'afstand',
        label: 'Afstand',
        breedte: 100,
        sorteerWaarde: (r) => r.afstand_km ?? 0,
        render: (r) => formatKm(r.afstand_km ?? null, 1),
      },
      {
        key: 'type',
        label: 'Type (systeem)',
        breedte: 120,
        filterType: 'select',
        filterOpties: ['Zakelijk', 'Privé'],
        sorteerWaarde: (r) => typeLabel(r.rit_type_effectief),
        render: (r) => (
          <span
            className={
              r.rit_type_effectief === 'prive'
                ? 'text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600'
                : 'text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700'
            }
          >
            {typeLabel(r.rit_type_effectief)}
          </span>
        ),
      },
      {
        key: 'ulu',
        label: 'ULU',
        breedte: 100,
        standaard_zichtbaar: false,
        filterType: 'select',
        filterOpties: uluOpties,
        sorteerWaarde: (r) => r.rit_type_ulu ?? '',
        render: (r) => <span className="text-xs text-slate-500">{r.rit_type_ulu ?? '—'}</span>,
      },
      {
        key: 'score',
        label: 'Score',
        breedte: 80,
        sorteerWaarde: (r) => (r.score == null ? -1 : r.score),
        render: (r) => (
          <span
            className={
              r.score != null && r.score < 50
                ? 'text-red-700 font-medium'
                : r.score != null && r.score < 70
                ? 'text-orange-700'
                : ''
            }
          >
            {r.score ?? '—'}
          </span>
        ),
      },
    ],
    [bestuurderOpties, uluOpties],
  )

  return (
    <OverzichtTabel
      scherm="wagenpark-ritten"
      data={data}
      kolommen={kolommen}
      layouts={layouts}
      user_id={user_id}
      beginSortering={[{ id: 'datum', desc: true }]}
      selecteerbaar={false}
      toonRijActie={false}
    />
  )
}
