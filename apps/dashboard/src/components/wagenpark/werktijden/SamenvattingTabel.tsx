'use client'

import React, { useCallback, useMemo } from 'react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { minutenLabel, teltMee, omrekening, UREN_PER_WERKDAG } from '@/lib/wagenpark/werktijd'
import { MAAND_LABEL, type Periode, maandenInPeriode } from '@/lib/wagenpark/periode'
import type { WerktijdRij } from '@/components/wagenpark/werktijden/WerktijdenTabel'
import type { Totalen } from '@/components/wagenpark/werktijden/TelKaarten'

/** Eén regel per medewerker: de totalen over de gekozen periode. */
export type SamenvattingRij = {
  /** OverzichtTabel eist een id; de ULU-bestuurder-id is hier de sleutel. */
  id: string
  bestuurder: string
  dagenLaat: number
  minutenLaat: number
  dagenVroeg: number
  minutenVroeg: number
  totaalMinuten: number
  /** Minuten per kalendermaand, sleutel 1..12. Alleen gevulde maanden staan erin. */
  perMaand: Record<number, number>
  /** Weggestreepte minuten; blijven zichtbaar maar tellen nergens in mee. */
  verklaardMinuten: number
  verklaardDagen: number
}

/**
 * Bouw één regel per medewerker uit de detailregels.
 *
 * De detailregels bevatten alleen anker-bevindingen (zie lib/wagenpark/werktijd.ts),
 * dus optellen mag hier zonder verdere ontdubbeling.
 */
export function bouwSamenvatting(rijen: WerktijdRij[]): SamenvattingRij[] {
  const perMedewerker = new Map<string, SamenvattingRij>()

  for (const r of rijen) {
    let s = perMedewerker.get(r.user_id_ulu)
    if (!s) {
      s = {
        id: r.user_id_ulu,
        bestuurder: r.bestuurder,
        dagenLaat: 0,
        minutenLaat: 0,
        dagenVroeg: 0,
        minutenVroeg: 0,
        totaalMinuten: 0,
        perMaand: {},
        verklaardMinuten: 0,
        verklaardDagen: 0,
      }
      perMedewerker.set(r.user_id_ulu, s)
    }
    // Verklaarde dagen krijgen een eigen kolom en blijven daarmee zichtbaar,
    // maar ze tellen niet mee in het totaal of in de maandkolommen. Zo blijft
    // een medewerker die alles netjes verklaard heeft wél in de lijst staan.
    if (!teltMee(r.status)) {
      s.verklaardMinuten += r.minuten
      s.verklaardDagen += 1
      continue
    }
    if (r.soort === 'te_laat') {
      s.dagenLaat += 1
      s.minutenLaat += r.minuten
    } else {
      s.dagenVroeg += 1
      s.minutenVroeg += r.minuten
    }
    s.totaalMinuten += r.minuten
    const maand = Number(r.datum.slice(5, 7))
    s.perMaand[maand] = (s.perMaand[maand] ?? 0) + r.minuten
  }

  return [...perMedewerker.values()].sort((a, b) => b.totaalMinuten - a.totaalMinuten)
}

export default function SamenvattingTabel({
  data,
  layouts,
  user_id,
  periode,
  onTotalen,
  onMedewerkerKlik,
}: {
  data: WerktijdRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  periode: Periode
  onTotalen?: (t: Totalen) => void
  /** Klik op een regel opent de detailweergave, gefilterd op die medewerker. */
  onMedewerkerKlik?: (rij: SamenvattingRij) => void
}) {
  const rijen = useMemo(() => bouwSamenvatting(data), [data])
  const zichtbareMaanden = useMemo(() => maandenInPeriode(periode), [periode])

  const meldTotalen = useCallback(
    (gefilterd: SamenvattingRij[]) => {
      const t = { dagenLaat: 0, minutenLaat: 0, dagenVroeg: 0, minutenVroeg: 0 }
      for (const r of gefilterd) {
        t.dagenLaat += r.dagenLaat
        t.minutenLaat += r.minutenLaat
        t.dagenVroeg += r.dagenVroeg
        t.minutenVroeg += r.minutenVroeg
      }
      onTotalen?.(t)
    },
    [onTotalen],
  )

  const bestuurderOpties = useMemo(
    () => [...new Set(rijen.map((r) => r.bestuurder))].sort((a, b) => a.localeCompare(b, 'nl')),
    [rijen],
  )

  const kolommen = useMemo<KolomDefinitie<SamenvattingRij>[]>(() => {
    // De maandkolommen krijgen VASTE sleutels m01..m12 en bestaan altijd alle
    // twaalf, ook buiten de gekozen periode. Reden: een opgeslagen weergave
    // overschrijft de kolomvolgorde volledig, dus kolommen die per periode van
    // naam wisselen zouden zo'n weergave stukmaken. Buiten de periode staan ze
    // simpelweg standaard uit.
    const maandKolommen: KolomDefinitie<SamenvattingRij>[] = Array.from(
      { length: 12 },
      (_, i) => {
        const maand = i + 1
        return {
          key: `m${String(maand).padStart(2, '0')}`,
          label: MAAND_LABEL[maand],
          breedte: 80,
          standaard_zichtbaar: zichtbareMaanden.includes(maand),
          sorteerWaarde: (r: SamenvattingRij) => r.perMaand[maand] ?? 0,
          render: (r: SamenvattingRij) => {
            const m = r.perMaand[maand]
            if (!m) return <span className="text-slate-300">—</span>
            return <span className="tabular-nums">{minutenLabel(m)}</span>
          },
        }
      },
    )

    return [
      {
        key: 'bestuurder',
        label: 'Medewerker',
        vast: true,
        breedte: 200,
        filterType: 'select',
        filterOpties: bestuurderOpties,
        sorteerWaarde: (r) => r.bestuurder,
        render: (r) => <span className="font-medium">{r.bestuurder}</span>,
      },
      ...maandKolommen,
      {
        key: 'dagen',
        label: 'Dagen',
        breedte: 80,
        sorteerWaarde: (r) => r.dagenLaat + r.dagenVroeg,
        render: (r) => (
          <span className="tabular-nums text-slate-600">{r.dagenLaat + r.dagenVroeg}</span>
        ),
      },
      {
        key: 'telaat',
        label: 'Te laat',
        breedte: 110,
        sorteerWaarde: (r) => r.minutenLaat,
        render: (r) =>
          r.minutenLaat > 0 ? (
            <span className="text-amber-700 tabular-nums">
              {minutenLabel(r.minutenLaat)}
              <span className="text-slate-400 ml-1 text-xs">({r.dagenLaat})</span>
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
      {
        key: 'tevroeg',
        label: 'Te vroeg',
        breedte: 110,
        sorteerWaarde: (r) => r.minutenVroeg,
        render: (r) =>
          r.minutenVroeg > 0 ? (
            <span className="text-violet-700 tabular-nums">
              {minutenLabel(r.minutenVroeg)}
              <span className="text-slate-400 ml-1 text-xs">({r.dagenVroeg})</span>
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
      {
        key: 'verklaard',
        label: 'Verklaard',
        breedte: 110,
        sorteerWaarde: (r) => r.verklaardMinuten,
        render: (r) =>
          r.verklaardDagen > 0 ? (
            <span className="text-slate-400 tabular-nums" title="Weggestreept; telt niet mee">
              {minutenLabel(r.verklaardMinuten)}
              <span className="ml-1 text-xs">({r.verklaardDagen})</span>
            </span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
      {
        key: 'totaal',
        label: 'Totaal',
        vast: true,
        breedte: 110,
        sorteerWaarde: (r) => r.totaalMinuten,
        render: (r) => (
          <span className="font-semibold tabular-nums">{minutenLabel(r.totaalMinuten)}</span>
        ),
      },
    ]
  }, [bestuurderOpties, zichtbareMaanden])

  // Zelfde totalen onderaan de export als in de dagweergave, zodat de twee
  // bestanden niet verschillende uitkomsten geven voor dezelfde periode.
  const exportTotalen = useCallback((gefilterd: SamenvattingRij[]) => {
    let laat = 0
    let vroeg = 0
    let verklaard = 0
    let verklaardDagen = 0
    for (const r of gefilterd) {
      laat += r.minutenLaat
      vroeg += r.minutenVroeg
      verklaard += r.verklaardMinuten
      verklaardDagen += r.verklaardDagen
    }
    const totaal = laat + vroeg
    const om = omrekening(totaal)
    return [
      ['Totaal te laat (minuten)', laat],
      ['Totaal te vroeg (minuten)', vroeg],
      ['Totaal (minuten)', totaal],
      ['Totaal (uren)', om.uren],
      [`Totaal (werkdagen bij ${UREN_PER_WERKDAG} uur per dag)`, om.dagen],
      ['', ''],
      [`Verklaard, telt niet mee (minuten) — ${verklaardDagen} dagen`, verklaard],
    ]
  }, [])

  return (
    <OverzichtTabel
      scherm="wagenpark-werktijden-samenvatting"
      data={rijen}
      kolommen={kolommen}
      layouts={layouts}
      user_id={user_id}
      beginSortering={[{ id: 'totaal', desc: true }]}
      selecteerbaar={false}
      toonRijActie={false}
      dicht
      onGefilterd={meldTotalen}
      exportExtraRijen={exportTotalen}
      onRijKlik={onMedewerkerKlik}
    />
  )
}
