'use client'

import React, { useCallback, useMemo } from 'react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { formatDatumMetDag } from '@/lib/wagenpark/utils'
import { minutenLabel, urenLabel, SOORT_LABEL, type WerktijdSoort } from '@/lib/wagenpark/werktijd'
import type { Totalen } from '@/components/wagenpark/werktijden/TelKaarten'

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
  /**
   * Uren die deze medewerker die dag in Bouw7 schreef, om het signaal mee te
   * controleren. `null` = niet op te halen (Bouw7 onbereikbaar of medewerker
   * zonder Bouw7-koppeling); `0` = wél gekeken, niets geboekt. Dat onderscheid
   * moet zichtbaar blijven: een storing mag er niet uitzien als een lege dag.
   */
  geboekt: number | null
  /** "6,0 normaal · 2,0 verlof", of null als er niets geboekt is. */
  uursoorten: string | null
  /** Bouw7-medewerkersnummer; de server koppelt hiermee de urenboekingen. */
  bouw7_id: string | null
}

/** De rij zoals hij uit de database komt, nog zonder de uren uit Bouw7. */
export type WerktijdBevindingRij = Omit<WerktijdRij, 'geboekt' | 'uursoorten'>

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
  onTotalen,
}: {
  data: WerktijdRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  /** Totalen over de rijen die de kolomfilters overleven; voedt de tel-kaarten. */
  onTotalen?: (t: Totalen) => void
}) {
  // De tabel meldt terug welke rijen door zoekbalk en kolomfilters komen, zodat
  // de kaarten boven de pagina hetzelfde tellen als wat je op je scherm ziet.
  const meldTotalen = useCallback(
    (rijen: WerktijdRij[]) => {
      const t = { dagenLaat: 0, minutenLaat: 0, dagenVroeg: 0, minutenVroeg: 0 }
      for (const r of rijen) {
        if (r.soort === 'te_laat') {
          t.dagenLaat += 1
          t.minutenLaat += r.minuten
        } else {
          t.dagenVroeg += 1
          t.minutenVroeg += r.minuten
        }
      }
      onTotalen?.(t)
    },
    [onTotalen],
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
        // Controlekolom: schreef deze medewerker die dag genoeg uren? Getal, dus
        // sorteerbaar op "veel afwijking maar toch volle dag geboekt" — precies
        // de regels die je wilt bekijken.
        key: 'geboekt',
        label: 'Geboekt',
        breedte: 100,
        sorteerWaarde: (r) => r.geboekt ?? -1,
        render: (r) =>
          r.geboekt == null ? (
            <span className="text-slate-300" title="Uren niet opgehaald uit Bouw7">
              —
            </span>
          ) : (
            <span
              className={`tabular-nums ${r.geboekt === 0 ? 'text-slate-400' : 'text-slate-700'}`}
            >
              {urenLabel(r.geboekt)} u
            </span>
          ),
      },
      {
        key: 'uursoorten',
        label: 'Uursoorten',
        breedte: 240,
        sorteerWaarde: (r) => r.uursoorten ?? '',
        render: (r) => (
          <span className="block max-w-[240px] truncate text-xs text-slate-600" title={r.uursoorten ?? ''}>
            {r.uursoorten ?? '—'}
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
    <OverzichtTabel
      scherm="wagenpark-werktijden"
      data={data}
      kolommen={kolommen}
      layouts={layouts}
      user_id={user_id}
      beginSortering={[{ id: 'datum', desc: true }]}
      selecteerbaar={false}
      toonRijActie={false}
      dicht
      groepering={groepering}
      onGefilterd={meldTotalen}
    />
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
