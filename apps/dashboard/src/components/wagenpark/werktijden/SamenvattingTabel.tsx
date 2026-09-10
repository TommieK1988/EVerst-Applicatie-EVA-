'use client'

import React, { useCallback, useMemo } from 'react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { minutenLabel, omrekening, urenLabel, saldoLabel, UREN_PER_WERKDAG } from '@/lib/wagenpark/werktijd'
import { bouwSamenvatting, type SamenvattingRij } from '@/lib/wagenpark/werktijd-samenvatting'
import { MAAND_LABEL, type Periode, maandenInPeriode } from '@/lib/wagenpark/periode'
import type { WerktijdRij } from '@/lib/wagenpark/werktijd-dag'

export type { SamenvattingRij }

export default function SamenvattingTabel({
  data,
  layouts,
  user_id,
  periode,
  onMedewerkerKlik,
}: {
  data: WerktijdRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  periode: Periode
  /** Klik op een regel opent de bestuurderpagina van die medewerker. */
  onMedewerkerKlik?: (rij: SamenvattingRij) => void
}) {
  const rijen = useMemo(() => bouwSamenvatting(data), [data])
  const zichtbareMaanden = useMemo(() => maandenInPeriode(periode), [periode])

  const bestuurderOpties = useMemo(
    () => [...new Set(rijen.map((r) => r.bestuurder))].sort((a, b) => a.localeCompare(b, 'nl')),
    [rijen],
  )

  const kolommen = useMemo<KolomDefinitie<SamenvattingRij>[]>(() => {
    // De maandkolommen krijgen VASTE sleutels m01..m12 en bestaan altijd alle
    // twaalf, ook buiten de gekozen periode. Reden: een opgeslagen weergave
    // overschrijft de kolomvolgorde volledig, dus kolommen die per periode van
    // naam wisselen zouden zo'n weergave stukmaken.
    //
    // Ze zijn óók `vast`, en dat is geen sierlijkheid: de werkstand bewaart per
    // scherm welke kolommen aan stonden, en een niet-vaste kolom volgt die
    // bewaarde stand. Dan blijf je na het kiezen van een ander kwartaal naar de
    // maanden van het vórige kwartaal kijken — allemaal streepjes, terwijl de
    // totalen wél meebewegen. Een vaste kolom volgt altijd de code, en de code
    // is hier de gekozen periode. Zie werkstand.ts (`pasKolommenToe`) en de
    // remount-sleutel in WerktijdenWeergave.
    const maandKolommen: KolomDefinitie<SamenvattingRij>[] = Array.from(
      { length: 12 },
      (_, i) => {
        const maand = i + 1
        return {
          key: `m${String(maand).padStart(2, '0')}`,
          label: MAAND_LABEL[maand],
          vast: true,
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
      // Aanwezig tegenover verantwoord, over de hele periode. Los van de
      // afwijkingskolommen hiervoor: iemand kan elke dag netjes binnen zijn
      // roostertijden vallen en toch structureel meer of minder schrijven dan
      // de auto op het werk stond.
      {
        key: 'aanwezig',
        label: 'Aanwezig',
        breedte: 110,
        sorteerWaarde: (r) => r.saldo.aanwezigUren,
        render: (r) =>
          r.saldo.dagen > 0 ? (
            <span className="tabular-nums text-slate-600">{urenLabel(r.saldo.aanwezigUren)} u</span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
      {
        key: 'arbeidsuren',
        label: 'Arbeidsuren',
        breedte: 120,
        sorteerWaarde: (r) => r.saldo.arbeidsuren,
        render: (r) =>
          r.saldo.dagen > 0 ? (
            <span className="tabular-nums text-slate-600">{urenLabel(r.saldo.arbeidsuren)} u</span>
          ) : (
            <span className="text-slate-300">—</span>
          ),
      },
      {
        key: 'tvt',
        label: 'Tijd voor tijd',
        breedte: 130,
        sorteerWaarde: (r) => r.saldo.tvtUren,
        render: (r) =>
          r.saldo.tvtDagen === 0 ? (
            <span className="text-slate-300">—</span>
          ) : (
            <span
              className="tabular-nums font-medium text-sky-700"
              title={`Gereserveerd over ${r.saldo.tvtDagen} ${r.saldo.tvtDagen === 1 ? 'dag' : 'dagen'}; niet in Bouw7 geboekt`}
            >
              {saldoLabel(r.saldo.tvtUren)}
              <span className="ml-1 text-xs text-slate-400">({r.saldo.tvtDagen})</span>
            </span>
          ),
      },
      {
        key: 'werkdagen',
        label: 'Werkdagen',
        breedte: 100,
        standaard_zichtbaar: false,
        sorteerWaarde: (r) => r.werkdagen,
        render: (r) => <span className="tabular-nums text-slate-600">{r.werkdagen}</span>,
      },
      {
        key: 'saldo',
        label: 'Saldo',
        breedte: 130,
        sorteerWaarde: (r) => r.saldo.saldoUren,
        render: (r) => {
          if (r.saldo.dagen === 0) {
            return (
              <span className="text-slate-300" title="Geen dag met zowel een ritvenster als arbeidsuren">
                —
              </span>
            )
          }
          const s = r.saldo.saldoUren
          const kleur = s <= -2 ? 'text-red-700' : s >= 2 ? 'text-emerald-700' : 'text-slate-500'
          return (
            <span
              className={`tabular-nums font-medium ${kleur}`}
              // Het aantal dagen hoort bij het getal: −8 uur over vier dagen is
              // iets heel anders dan −8 uur over een heel kwartaal.
              title={
                `Over ${r.saldo.dagen} ${r.saldo.dagen === 1 ? 'dag' : 'dagen'}`
                + (r.saldo.overgeslagen > 0
                  ? `; ${r.saldo.overgeslagen} dagen tellen niet mee (geen bruikbaar ritvenster of geen arbeidsuren).`
                  : '.')
              }
            >
              {saldoLabel(s)}
              <span className="ml-1 text-xs text-slate-400">({r.saldo.dagen})</span>
            </span>
          )
        },
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
    let aanwezig = 0
    let arbeidsuren = 0
    let saldoDagen = 0
    let tvtUren = 0
    let tvtDagen = 0
    for (const r of gefilterd) {
      laat += r.minutenLaat
      vroeg += r.minutenVroeg
      verklaard += r.verklaardMinuten
      verklaardDagen += r.verklaardDagen
      // Per medewerker al ontdubbeld, dus hier mag gewoon opgeteld worden.
      aanwezig += r.saldo.aanwezigUren
      arbeidsuren += r.saldo.arbeidsuren
      saldoDagen += r.saldo.dagen
      tvtUren += r.saldo.tvtUren
      tvtDagen += r.saldo.tvtDagen
    }
    const totaal = laat + vroeg
    const om = omrekening(totaal)
    const rond = (n: number) => Math.round(n * 100) / 100
    return [
      ['Totaal te laat (minuten)', laat],
      ['Totaal te vroeg (minuten)', vroeg],
      ['Totaal (minuten)', totaal],
      ['Totaal (uren)', om.uren],
      [`Totaal (werkdagen bij ${UREN_PER_WERKDAG} uur per dag)`, om.dagen],
      ['', ''],
      [`Verklaard, telt niet mee (minuten) — ${verklaardDagen} dagen`, verklaard],
      ['', ''],
      [`Aanwezig netto (uren) — over ${saldoDagen} medewerkerdagen`, rond(aanwezig)],
      ['Geboekte arbeidsuren over diezelfde dagen', rond(arbeidsuren)],
      ['Saldo (uren)', rond(aanwezig - arbeidsuren)],
      [`Gereserveerd als tijd voor tijd (uren) — ${tvtDagen} dagen`, rond(tvtUren)],
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
      exportExtraRijen={exportTotalen}
      onRijKlik={onMedewerkerKlik}
    />
  )
}
