'use client'

import React, { useMemo, useState } from 'react'
import { Clock, LogOut, Sigma } from 'lucide-react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { formatDatumMetDag } from '@/lib/wagenpark/utils'
import { minutenLabel, SOORT_LABEL, type WerktijdSoort } from '@/lib/wagenpark/werktijd'

/**
 * Eén regel = één medewerker, één dag, één soort afwijking. Een dag kan dus twee
 * regels opleveren (te laat begonnen én te vroeg weg). De pagina levert alleen
 * anker-bevindingen aan, zodat een opgesplitste ritketen niet dubbel telt.
 */
export type WerktijdRij = {
  id: string
  datum: string
  soort: WerktijdSoort
  minuten: number
  /** Roostertijd waartegen gemeten is. */
  verwacht: string | null
  /** Werkelijke aankomst (te laat) of vertrek (te vroeg). */
  werkelijk: string | null
  /** De roostertijd komt uit een rooster dat op die datum formeel nog niet gold. */
  benadering: boolean
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  status: string
  regel_code: string
  trip_id: string | null
  user_id_ulu: string
  bestuurder: string
  /** ISO-week als "2026-W29"; komt uit Postgres, niet uit de browser. */
  week: string
  /** Maandag van die week (YYYY-MM-DD). */
  week_start: string
}

const STATUS_LABEL: Record<string, string> = {
  open: 'Open',
  geaccepteerd_uitzondering: 'Uitzondering',
  opgelost: 'Opgelost',
}

function tijd(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

/** "wk 29 · 13 t/m 19 jul" — leesbaar bereik bij een ISO-weeknummer. */
function weekLabel(week: string, weekStart: string): string {
  const maandag = new Date(weekStart + 'T12:00:00Z')
  const zondag = new Date(maandag)
  zondag.setUTCDate(zondag.getUTCDate() + 6)
  const kort = (d: Date) =>
    d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  return `wk ${week.slice(-2)} · ${kort(maandag)} t/m ${kort(zondag)}`
}

export default function WerktijdenTabel({
  data,
  layouts,
  user_id,
}: {
  data: WerktijdRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
}) {
  // Snelfilter via de tel-kaarten boven de tabel. null = alles tonen.
  const [soortFilter, setSoortFilter] = useState<WerktijdSoort | null>(null)

  const tellingen = useMemo(() => {
    const t = { te_laat: 0, te_vroeg: 0, min_laat: 0, min_vroeg: 0 }
    for (const r of data) {
      if (r.soort === 'te_laat') {
        t.te_laat += 1
        t.min_laat += r.minuten
      } else {
        t.te_vroeg += 1
        t.min_vroeg += r.minuten
      }
    }
    return t
  }, [data])

  const zichtbaar = useMemo(
    () => (soortFilter ? data.filter((r) => r.soort === soortFilter) : data),
    [data, soortFilter],
  )

  const bestuurderOpties = useMemo(
    () => [...new Set(data.map((r) => r.bestuurder))].sort((a, b) => a.localeCompare(b, 'nl')),
    [data],
  )

  const kolommen = useMemo<KolomDefinitie<WerktijdRij>[]>(
    () => [
      {
        key: 'datum',
        label: 'Datum',
        vast: true,
        breedte: 150,
        sorteerWaarde: (r) => r.datum,
        render: (r) => formatDatumMetDag(r.datum),
      },
      {
        key: 'bestuurder',
        label: 'Medewerker',
        breedte: 180,
        filterType: 'select',
        filterOpties: bestuurderOpties,
        sorteerWaarde: (r) => r.bestuurder,
        render: (r) => <span className="block max-w-[180px] truncate">{r.bestuurder}</span>,
      },
      {
        key: 'week',
        label: 'Week',
        breedte: 90,
        standaard_zichtbaar: false,
        sorteerWaarde: (r) => r.week,
        render: (r) => <span className="text-slate-500">{r.week}</span>,
      },
      {
        key: 'soort',
        label: 'Soort',
        breedte: 110,
        filterType: 'select',
        filterOpties: [SOORT_LABEL.te_laat, SOORT_LABEL.te_vroeg],
        sorteerWaarde: (r) => SOORT_LABEL[r.soort],
        render: (r) => (
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              r.soort === 'te_laat'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-violet-100 text-violet-700'
            }`}
          >
            {SOORT_LABEL[r.soort]}
          </span>
        ),
      },
      {
        key: 'verwacht',
        label: 'Roostertijd',
        breedte: 110,
        sorteerWaarde: (r) => r.verwacht ?? '',
        render: (r) => (
          <span className={r.benadering ? 'text-slate-400' : ''} title={
            r.benadering
              ? 'Benadering: op deze datum gold nog geen rooster, het dichtstbijzijnde is gebruikt.'
              : undefined
          }>
            {tijd(r.verwacht)}
            {r.benadering && <span className="ml-1 text-[10px]">≈</span>}
          </span>
        ),
      },
      {
        key: 'werkelijk',
        label: 'Werkelijk',
        breedte: 110,
        sorteerWaarde: (r) => r.werkelijk ?? '',
        render: (r) => tijd(r.werkelijk),
      },
      {
        key: 'minuten',
        label: 'Afwijking (min)',
        breedte: 140,
        // Getal, geen tekst: sorteert op omvang én komt als rekenbare cel in de
        // Excel-export terecht, zodat je er in Excel een SOM overheen kunt zetten.
        sorteerWaarde: (r) => r.minuten,
        render: (r) => (
          <span
            className={`font-medium ${
              r.ernst === 'overtreding' ? 'text-red-700' : 'text-orange-700'
            }`}
          >
            {minutenLabel(r.minuten)}
          </span>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        breedte: 120,
        standaard_zichtbaar: false,
        filterType: 'select',
        filterOpties: [...new Set(data.map((r) => STATUS_LABEL[r.status] ?? r.status))],
        sorteerWaarde: (r) => STATUS_LABEL[r.status] ?? r.status,
        render: (r) => (
          <span className="text-xs text-slate-500">{STATUS_LABEL[r.status] ?? r.status}</span>
        ),
      },
    ],
    [bestuurderOpties, data],
  )

  // Gebundeld per medewerker per week. De sleutel wordt in een useMemo gehouden:
  // een objectliteral in de prop geeft TanStack elke render een nieuwe referentie,
  // waarna het grouped row model herbouwt en de tab in een update-lus vastloopt.
  const groepering = useMemo(
    () => ({
      sleutel: (r: WerktijdRij) => `${r.user_id_ulu}|${r.week}`,
      kop: (rijen: WerktijdRij[]) => <WeekKop rijen={rijen} />,
      standaardOpen: false,
    }),
    [],
  )

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <TelKaart
          label="Te laat"
          hoofd={minutenLabel(tellingen.min_laat)}
          sub={`${tellingen.te_laat} dagen`}
          icon={Clock}
          kleurBadge="bg-amber-100 text-amber-700"
          actief={soortFilter === 'te_laat'}
          onKlik={() => setSoortFilter(soortFilter === 'te_laat' ? null : 'te_laat')}
        />
        <TelKaart
          label="Te vroeg weg"
          hoofd={minutenLabel(tellingen.min_vroeg)}
          sub={`${tellingen.te_vroeg} dagen`}
          icon={LogOut}
          kleurBadge="bg-violet-100 text-violet-700"
          actief={soortFilter === 'te_vroeg'}
          onKlik={() => setSoortFilter(soortFilter === 'te_vroeg' ? null : 'te_vroeg')}
        />
        <TelKaart
          label="Totaal"
          hoofd={minutenLabel(tellingen.min_laat + tellingen.min_vroeg)}
          sub={`${data.length} regels`}
          icon={Sigma}
          kleurBadge="bg-slate-100 text-slate-600"
          actief={soortFilter === null}
          onKlik={() => setSoortFilter(null)}
        />
      </div>

      <OverzichtTabel
        scherm="wagenpark-werktijden"
        data={zichtbaar}
        kolommen={kolommen}
        layouts={layouts}
        user_id={user_id}
        beginSortering={[{ id: 'datum', desc: true }]}
        selecteerbaar={false}
        toonRijActie={false}
        dicht
        groepering={groepering}
      />
    </>
  )
}

/** Groepsbalk: medewerker + week, met het subtotaal van die week erachter. */
function WeekKop({ rijen }: { rijen: WerktijdRij[] }) {
  const eerste = rijen[0]
  if (!eerste) return null

  let laatDagen = 0
  let laatMin = 0
  let vroegDagen = 0
  let vroegMin = 0
  for (const r of rijen) {
    if (r.soort === 'te_laat') {
      laatDagen += 1
      laatMin += r.minuten
    } else {
      vroegDagen += 1
      vroegMin += r.minuten
    }
  }

  return (
    <span className="flex items-center gap-3 min-w-0 flex-1">
      <span className="font-medium text-slate-900 truncate">{eerste.bestuurder}</span>
      <span className="text-xs text-slate-500 flex-shrink-0">
        {weekLabel(eerste.week, eerste.week_start)}
      </span>
      <span className="flex items-center gap-2 text-xs flex-shrink-0 ml-auto">
        {laatDagen > 0 && (
          <span className="text-amber-700">
            {laatDagen}× te laat {minutenLabel(laatMin)}
          </span>
        )}
        {vroegDagen > 0 && (
          <span className="text-violet-700">
            {vroegDagen}× te vroeg {minutenLabel(vroegMin)}
          </span>
        )}
        <span className="px-2 py-0.5 rounded bg-slate-900 text-white font-medium">
          {minutenLabel(laatMin + vroegMin)}
        </span>
      </span>
    </span>
  )
}

function TelKaart({
  label,
  hoofd,
  sub,
  icon: Icon,
  kleurBadge,
  actief,
  onKlik,
}: {
  label: string
  hoofd: string
  sub: string
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
        <span className="block text-2xl font-semibold text-slate-900">{hoofd}</span>
        <span className="block text-xs text-slate-400">{sub}</span>
      </span>
    </button>
  )
}
