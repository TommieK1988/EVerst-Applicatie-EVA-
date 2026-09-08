'use client'

import React, { useMemo } from 'react'
import { ArrowLeft, FileDown } from 'lucide-react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import {
  minutenLabel, teltMee, omrekening, UREN_PER_WERKDAG,
} from '@/lib/wagenpark/werktijd'
import { MAAND_LABEL, datumKort, maandenInPeriode, type Periode } from '@/lib/wagenpark/periode'
import { bouwSamenvatting } from '@/lib/wagenpark/werktijd-samenvatting'
import WerktijdenTabel, {
  type WerktijdRij,
} from '@/components/wagenpark/werktijden/WerktijdenTabel'

/**
 * Alle gemarkeerde dagen van één medewerker, ongegroepeerd.
 *
 * Bestaat omdat de samenvatting per medewerker wel de totalen gaf maar nergens
 * heen leidde: je zag dat iemand vier uur te laat was en kon niet zien op welke
 * dagen. Dit is het scherm dat je bij een functioneringsgesprek naast je legt,
 * en waar de PDF-uitdraai vandaan komt.
 *
 * Bewust zonder weekgroepen (`groeperen={false}`): de lijst gaat al over één
 * persoon, dus een groepsbalk zou alleen een extra klik tussen jou en de dagen
 * zetten. En met een eigen `scherm`-sleutel, zodat de kolomkeuze hier los staat
 * van die van het volledige overzicht.
 */
export default function MedewerkerDetail({
  medewerkerId,
  naam,
  data,
  periode,
  layouts,
  user_id,
  onTerug,
}: {
  /** ULU-bestuurder-id; ook de sleutel van de PDF-uitdraai. */
  medewerkerId: string
  naam: string
  /** Alleen de rijen van deze medewerker. */
  data: WerktijdRij[]
  periode: Periode
  layouts: GebruikerLayout[]
  user_id: string | null
  onTerug: () => void
}) {
  const samenvatting = useMemo(() => bouwSamenvatting(data)[0] ?? null, [data])
  const maanden = useMemo(() => maandenInPeriode(periode), [periode])

  const totaalMinuten = samenvatting?.totaalMinuten ?? 0
  const om = omrekening(totaalMinuten)

  // De dagen waarop niets is weggestreept; dat is het aantal waar het gesprek
  // over gaat.
  const meetellendeDagen = useMemo(() => data.filter((r) => teltMee(r.status)).length, [data])

  const pdfUrl = useMemo(() => {
    const q = new URLSearchParams({ medewerker: medewerkerId, van: periode.van, tot: periode.tot })
    return `/wagenpark/werktijden/pdf?${q.toString()}`
  }, [medewerkerId, periode])

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          onClick={onTerug}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Alle medewerkers
        </button>

        <span className="text-lg font-semibold text-slate-900">{naam}</span>
        <span className="text-sm text-slate-500">
          {datumKort(periode.van)} t/m {datumKort(periode.tot)}
        </span>

        {data.length > 0 && (
          <a
            href={pdfUrl}
            className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-slate-900 text-white hover:bg-slate-800"
          >
            <FileDown className="w-4 h-4" />
            Uitdraai (PDF)
          </a>
        )}
      </div>

      {samenvatting && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <Cijfer
              label="Totaal afwijking"
              waarde={minutenLabel(totaalMinuten)}
              sub={`${om.uren.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur · ` +
                `${om.dagen.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} werkdagen ` +
                `(bij ${UREN_PER_WERKDAG} uur per dag)`}
            />
            <Cijfer
              label="Te laat"
              waarde={minutenLabel(samenvatting.minutenLaat)}
              sub={`${samenvatting.dagenLaat} ${samenvatting.dagenLaat === 1 ? 'dag' : 'dagen'}`}
            />
            <Cijfer
              label="Te vroeg weg"
              waarde={minutenLabel(samenvatting.minutenVroeg)}
              sub={`${samenvatting.dagenVroeg} ${samenvatting.dagenVroeg === 1 ? 'dag' : 'dagen'}`}
            />
            <Cijfer
              label="Verklaard"
              waarde={
                samenvatting.verklaardDagen > 0
                  ? minutenLabel(samenvatting.verklaardMinuten)
                  : '—'
              }
              sub={
                samenvatting.verklaardDagen > 0
                  ? `${samenvatting.verklaardDagen} dagen · telt niet mee`
                  : 'niets weggestreept'
              }
            />
            <Cijfer
              label="Dagen die meetellen"
              waarde={String(meetellendeDagen)}
              sub={`van ${data.length} gemarkeerde ${data.length === 1 ? 'dag' : 'dagen'}`}
            />
          </div>

          {/* Verloop over de periode: waar zit de afwijking, en wordt het beter
              of slechter? Eén regel, want meer dan twaalf maanden komt hier
              nooit voorbij. */}
          <div className="mt-4 flex flex-wrap gap-2">
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
        </div>
      )}

      <WerktijdenTabel
        data={data}
        layouts={layouts}
        user_id={user_id}
        groeperen={false}
        scherm="wagenpark-werktijden-medewerker"
      />
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
