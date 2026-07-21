'use client'

import React, { useMemo, useState } from 'react'
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'
import RitPaneel from '@/components/wagenpark/ritten/RitPaneel'
import type { RitBevinding, RegelOptie } from '@/components/wagenpark/ritten/RitPaneel'

export type RitRij = {
  id: string
  start_datum: string
  start_tijd: string | null
  stop_tijd: string | null
  kenteken: string
  bestuurder_naam_raw: string | null
  user_id_ulu: number | null
  afstand_km: number | null
  rit_type_effectief: 'zakelijk' | 'prive' | null
  rit_type_handmatig: boolean
  rit_type_ulu: string | null
  score: number | null
  adres_start: string | null
  adres_stop: string | null
  /** Open bevindingen die aan déze rit hangen (R1, R3, R7, R9, R10). */
  bevindingen: RitBevinding[]
}

type Ernst = 'overtreding' | 'waarschuwing' | 'info'

/** Zwaarste ernst wint: bepaalt kleur, sortering en filterwaarde van de signaalkolom. */
const ERNST_RANG: Record<Ernst, number> = { overtreding: 3, waarschuwing: 2, info: 1 }

const ERNST_STIJL: Record<
  Ernst,
  { label: string; badge: string; tekst: string; icon: React.ElementType }
> = {
  overtreding:  { label: 'Overtreding',  badge: 'bg-red-100 text-red-700',       tekst: 'text-red-700',    icon: AlertCircle },
  waarschuwing: { label: 'Waarschuwing', badge: 'bg-orange-100 text-orange-700', tekst: 'text-orange-700', icon: AlertTriangle },
  info:         { label: 'Info',         badge: 'bg-blue-100 text-blue-700',     tekst: 'text-slate-600',  icon: Info },
}

/** Zwaarste ernst binnen de bevindingen van een rit, of null als de rit schoon is. */
function zwaarste(r: RitRij): Ernst | null {
  let uit: Ernst | null = null
  for (const b of r.bevindingen ?? []) {
    if (!uit || ERNST_RANG[b.ernst] > ERNST_RANG[uit]) uit = b.ernst
  }
  return uit
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
  regels,
}: {
  data: RitRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  regels: RegelOptie[]
}) {
  // Snelfilter via de tel-kaarten boven de tabel. null = alles tonen.
  const [ernstFilter, setErnstFilter] = useState<Ernst | 'gevlagd' | null>(null)
  // Bewust het id bewaren en niet de rij zelf: na het toekennen of intrekken van
  // een handmatige afwijking komt er via revalidatePath verse data binnen. Een
  // vastgehouden rij-object zou dan de oude signalen blijven tonen.
  const [geopendId, setGeopendId] = useState<string | null>(null)
  const geopend = useMemo(
    () => (geopendId ? data.find((r) => r.id === geopendId) ?? null : null),
    [data, geopendId],
  )

  const tellingen = useMemo(() => {
    const t = { overtreding: 0, waarschuwing: 0, info: 0, gevlagd: 0 }
    for (const r of data) {
      const e = zwaarste(r)
      if (!e) continue
      t[e] += 1
      t.gevlagd += 1
    }
    return t
  }, [data])

  const zichtbaar = useMemo(() => {
    if (!ernstFilter) return data
    if (ernstFilter === 'gevlagd') return data.filter((r) => zwaarste(r) !== null)
    return data.filter((r) => zwaarste(r) === ernstFilter)
  }, [data, ernstFilter])

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
      {
        // Rechts in de tabel: is deze rit gevlagd, en waarom. Niet uit te zetten —
        // zonder deze kolom is de tabel weer het oude, signaalloze ritten-overzicht.
        key: 'signaal',
        label: 'Signaal',
        vast: true,
        breedte: 320,
        // Bewust geen kolomfilter: filteren gaat via de tel-kaarten boven de tabel.
        // Sorteren gebeurt op ernst-rang, zodat overtredingen bovenaan komen.
        sorteerWaarde: (r) => {
          const e = zwaarste(r)
          return e ? ERNST_RANG[e] : 0
        },
        render: (r) => {
          const e = zwaarste(r)
          if (!e) return <span className="text-slate-300">—</span>
          const bevs = r.bevindingen
          const stijl = ERNST_STIJL[e]
          return (
            <span className="flex items-center gap-2 max-w-[320px]">
              <span className="flex gap-1 flex-shrink-0">
                {bevs.slice(0, 3).map((b) => (
                  <span
                    key={b.id}
                    className={`text-[11px] px-1.5 py-0.5 rounded font-medium ${ERNST_STIJL[b.ernst].badge}`}
                    title={
                      b.bron === 'handmatig'
                        ? `${b.regel_code} — handmatig toegekend`
                        : b.regel_code
                    }
                  >
                    {b.regel_code}
                    {/* Punt = handmatig toegekend, zelfde taal als de type-badge */}
                    {b.bron === 'handmatig' && <span className="ml-0.5 opacity-70">●</span>}
                  </span>
                ))}
                {bevs.length > 3 && (
                  <span className="text-[11px] text-slate-400 px-1">+{bevs.length - 3}</span>
                )}
              </span>
              <span className={`truncate text-xs ${stijl.tekst}`} title={bevs[0].omschrijving}>
                {bevs[0].omschrijving}
              </span>
            </span>
          )
        },
      },
    ],
    [bestuurderOpties, uluOpties],
  )

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <TelKaart
          label="Alle ritten"
          aantal={data.length}
          icon={CheckCircle2}
          kleurBadge="bg-slate-100 text-slate-600"
          actief={ernstFilter === null}
          onKlik={() => setErnstFilter(null)}
        />
        <TelKaart
          label="Overtredingen"
          aantal={tellingen.overtreding}
          icon={AlertCircle}
          kleurBadge={ERNST_STIJL.overtreding.badge}
          actief={ernstFilter === 'overtreding'}
          onKlik={() => setErnstFilter(ernstFilter === 'overtreding' ? null : 'overtreding')}
        />
        <TelKaart
          label="Waarschuwingen"
          aantal={tellingen.waarschuwing}
          icon={AlertTriangle}
          kleurBadge={ERNST_STIJL.waarschuwing.badge}
          actief={ernstFilter === 'waarschuwing'}
          onKlik={() => setErnstFilter(ernstFilter === 'waarschuwing' ? null : 'waarschuwing')}
        />
        <TelKaart
          label="Info"
          aantal={tellingen.info}
          icon={Info}
          kleurBadge={ERNST_STIJL.info.badge}
          actief={ernstFilter === 'info'}
          onKlik={() => setErnstFilter(ernstFilter === 'info' ? null : 'info')}
        />
      </div>

      <OverzichtTabel
        scherm="wagenpark-ritten"
        data={zichtbaar}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'datum', desc: true }]}
        selecteerbaar={false}
        toonRijActie={false}
        onRijKlik={(r) => setGeopendId(r.id)}
      />

      <RitPaneel rit={geopend} regels={regels} onClose={() => setGeopendId(null)} />
    </>
  )
}

function TelKaart({
  label,
  aantal,
  icon: Icon,
  kleurBadge,
  actief,
  onKlik,
}: {
  label: string
  aantal: number
  icon: React.ElementType
  kleurBadge: string
  actief: boolean
  onKlik: () => void
}) {
  return (
    <button
      type="button"
      onClick={onKlik}
      className={`rounded-lg p-4 text-left transition-all flex items-start gap-3 border ${
        actief ? 'border-slate-900 shadow-sm bg-white' : 'border-slate-200 bg-white hover:shadow-sm'
      }`}
    >
      <span className={`p-1.5 rounded-md ${kleurBadge}`}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <span className="block text-2xl font-semibold text-slate-900">{aantal}</span>
      </span>
    </button>
  )
}
