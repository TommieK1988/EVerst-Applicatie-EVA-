'use client'

import React, { useMemo } from 'react'
import { FileDown } from 'lucide-react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import {
  minutenLabel, teltMee, omrekening, urenLabel, saldoLabel, UREN_PER_WERKDAG,
} from '@/lib/wagenpark/werktijd'
import { MAAND_LABEL, maandenInPeriode, type Periode } from '@/lib/wagenpark/periode'
import { bouwSamenvatting, telSaldo } from '@/lib/wagenpark/werktijd-samenvatting'
import WerktijdenTabel, {
  type WerktijdRij,
} from '@/components/wagenpark/werktijden/WerktijdenTabel'

/**
 * Alle gemarkeerde dagen van één bestuurder: te laat aangekomen, te vroeg weg.
 *
 * Staat op de bestuurderpagina, want daar wordt het gesprek voorbereid — de
 * cijfers, het verloop per maand, elke dag afzonderlijk (met de ritten in het
 * zijpaneel) en de uitdraai zitten zo op dezelfde plek als de rest van wat je
 * over die bestuurder weet.
 *
 * Bewust ongegroepeerd: de lijst gaat al over één persoon, dus een groepsbalk
 * zou alleen een extra klik tussen jou en de dagen zetten.
 */
export default function WerktijdenBlok({
  data,
  periode,
  layouts,
  user_id,
  pdfUrl,
}: {
  /** Alleen de rijen van deze bestuurder; verklaarde dagen horen erbij. */
  data: WerktijdRij[]
  periode: Periode
  layouts: GebruikerLayout[]
  user_id: string | null
  /** Link naar de PDF-uitdraai voor de gekozen periode. */
  pdfUrl: string
}) {
  const samenvatting = useMemo(() => bouwSamenvatting(data)[0] ?? null, [data])
  const saldo = useMemo(() => telSaldo(data), [data])
  const maanden = useMemo(() => maandenInPeriode(periode), [periode])
  const meetellendeDagen = useMemo(() => data.filter((r) => teltMee(r.status)).length, [data])

  const totaalMinuten = samenvatting?.totaalMinuten ?? 0
  const om = omrekening(totaalMinuten)
  const getal = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

  if (data.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Geen te late aankomsten of vroege vertrekken in deze periode.
      </p>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 mb-4">
        <Cijfer
          label="Totaal afwijking"
          waarde={minutenLabel(totaalMinuten)}
          sub={`${getal(om.uren)} uur · ${getal(om.dagen)} werkdagen (bij ${UREN_PER_WERKDAG} uur per dag)`}
        />
        <Cijfer
          label="Te laat"
          waarde={minutenLabel(samenvatting?.minutenLaat ?? 0)}
          sub={`${samenvatting?.dagenLaat ?? 0} ${samenvatting?.dagenLaat === 1 ? 'dag' : 'dagen'}`}
        />
        <Cijfer
          label="Te vroeg weg"
          waarde={minutenLabel(samenvatting?.minutenVroeg ?? 0)}
          sub={`${samenvatting?.dagenVroeg ?? 0} ${samenvatting?.dagenVroeg === 1 ? 'dag' : 'dagen'}`}
        />
        <Cijfer
          label="Verklaard"
          waarde={
            samenvatting && samenvatting.verklaardDagen > 0
              ? minutenLabel(samenvatting.verklaardMinuten)
              : '—'
          }
          sub={
            samenvatting && samenvatting.verklaardDagen > 0
              ? `${samenvatting.verklaardDagen} dagen · telt niet mee`
              : 'niets weggestreept'
          }
        />
        <Cijfer
          label="Dagen die meetellen"
          waarde={String(meetellendeDagen)}
          sub={`van ${data.length} gemarkeerde ${data.length === 1 ? 'dag' : 'dagen'}`}
        />
        {/* Aanwezig tegenover verantwoord. Staat naast de afwijkingen en niet in
            plaats daarvan: een dag kan keurig binnen de roostertijden vallen en
            toch een saldo hebben, en andersom. Het aantal dagen staat er altijd
            bij — een saldo zonder noemer zegt niets. */}
        <Cijfer
          label="Saldo aanwezig − geboekt"
          waarde={saldo.dagen > 0 ? `${saldoLabel(saldo.saldoUren)} u` : '—'}
          sub={
            saldo.dagen > 0
              ? `${urenLabel(saldo.aanwezigUren)} aanwezig tegenover ${urenLabel(saldo.arbeidsuren)} arbeidsuren, over ${saldo.dagen} ${saldo.dagen === 1 ? 'dag' : 'dagen'}`
              : 'geen dag met zowel een ritvenster als arbeidsuren'
          }
        />

        <a
          href={pdfUrl}
          className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
        >
          <FileDown className="w-4 h-4" />
          Uitdraai (PDF)
        </a>
      </div>

      {/* Wat er buiten het saldo viel. Zonder deze regel leest een saldo over
          drie dagen hetzelfde als een saldo over dertig, en dat is precies het
          verschil tussen een signaal en een toevalstreffer. */}
      {saldo.overgeslagen > 0 && (
        <p className="mb-4 -mt-2 text-xs text-slate-500">
          {saldo.overgeslagen} van deze dagen {saldo.overgeslagen === 1 ? 'telt' : 'tellen'} niet
          mee in het saldo: daar is de aanwezigheid niet uit de ritten af te leiden (maar één
          ritketen, of geen zakelijke ritten) of zijn de arbeidsuren niet op te halen.
        </p>
      )}

      {/* Verloop over de periode: waar zit de afwijking, en wordt het beter of
          slechter? Eén regel, want meer dan twaalf maanden komt hier nooit voorbij. */}
      {samenvatting && (
        <div className="mb-4 flex flex-wrap gap-2">
          {maanden.map((m) => {
            const min = samenvatting.perMaand[m] ?? 0
            return (
              <span
                key={m}
                className={`px-2.5 py-1 rounded-md text-xs border ${
                  min > 0
                    ? 'border-slate-300 bg-slate-50 text-slate-800'
                    : 'border-slate-200 bg-white text-slate-300'
                }`}
              >
                <span className="uppercase tracking-wide">{MAAND_LABEL[m]}</span>{' '}
                <span className="tabular-nums font-medium">
                  {min > 0 ? minutenLabel(min) : '—'}
                </span>
              </span>
            )
          })}
        </div>
      )}

      <WerktijdenTabel data={data} layouts={layouts} user_id={user_id} />
    </>
  )
}

function Cijfer({ label, waarde, sub }: { label: string; waarde: string; sub: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="block text-xl font-semibold text-slate-900">{waarde}</span>
      <span className="block text-xs text-slate-400">{sub}</span>
    </span>
  )
}
