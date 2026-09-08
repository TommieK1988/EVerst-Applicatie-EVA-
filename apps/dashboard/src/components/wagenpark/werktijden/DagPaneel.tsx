'use client'

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Flag, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody,
} from '@/components/ui'
import { formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'
import { minutenLabel, urenLabel, SOORT_LABEL } from '@/lib/wagenpark/werktijd'
import {
  handelWerktijdSignaalAf,
  heropenWerktijdSignaal,
} from '@/app/(platform)/wagenpark/actions/werktijd-afhandeling'
import {
  laadRittenBijBevinding,
  type DagRit,
} from '@/app/(platform)/wagenpark/actions/werktijd-ritten'
import type { WerktijdRij } from '@/components/wagenpark/werktijden/WerktijdenTabel'

/**
 * Eén dag ter controle: wat het rooster zei, wat de auto deed, en wat er die dag
 * geboekt is. Vanaf hier vink je hem af.
 *
 * Alle drie de gegevens naast elkaar is het hele punt — de afwijking alleen zegt
 * niets, en de uren alleen ook niet.
 */
export default function DagPaneel({
  rij,
  onClose,
}: {
  rij: WerktijdRij | null
  onClose: () => void
}) {
  const [toelichting, setToelichting] = useState('')
  const [bezig, startTransition] = useTransition()
  const [ritten, setRitten] = useState<DagRit[] | null>(null)
  const [rittenFout, setRittenFout] = useState<string | null>(null)

  // Wissel je van regel, dan mag de toelichting van de vorige niet blijven
  // staan — die zou zo aan de verkeerde dag worden vastgelegd.
  useEffect(() => {
    setToelichting('')
  }, [rij?.id])

  // De ritten komen pas als het paneel opengaat; zie werktijd-ritten.ts.
  // `afgebroken` vangt het snel doorklikken naar een volgende dag af: zonder
  // die vlag kan het antwoord van de vórige dag over het nieuwe heen vallen.
  useEffect(() => {
    const id = rij?.id
    setRitten(null)
    setRittenFout(null)
    if (!id) return

    let afgebroken = false
    laadRittenBijBevinding(id).then((res) => {
      if (afgebroken) return
      if (res.ok) setRitten(res.ritten)
      else setRittenFout(res.error)
    })
    return () => {
      afgebroken = true
    }
  }, [rij?.id])

  function afhandelen(uitkomst: 'verklaard' | 'bespreken') {
    if (!rij) return
    startTransition(async () => {
      const res = await handelWerktijdSignaalAf(rij.id, uitkomst, toelichting)
      if (res.ok) {
        toast.success(uitkomst === 'verklaard' ? 'Afgevinkt als verklaard' : 'Gemarkeerd om te bespreken')
        onClose()
      } else {
        toast.error(res.error ?? 'Afhandelen mislukt')
      }
    })
  }

  function heropenen() {
    if (!rij) return
    startTransition(async () => {
      const res = await heropenWerktijdSignaal(rij.id)
      if (res.ok) {
        toast.success('Teruggezet naar te controleren')
        onClose()
      } else {
        toast.error(res.error ?? 'Heropenen mislukt')
      }
    })
  }

  const open = rij?.status === 'open'

  return (
    <Drawer open={!!rij} onOpenChange={(o) => { if (!o) onClose() }}>
      <DrawerContent width={520}>
        {rij && (
          <>
            <DrawerHeader>
              <DrawerTitle>{rij.bestuurder}</DrawerTitle>
              <DrawerDescription>
                {formatDatumMetDag(rij.datum)} · {SOORT_LABEL[rij.soort].toLowerCase()}
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-5">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Wat de auto deed
                </h3>
                <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-slate-500">Roostertijd</dt>
                  <dd className="text-slate-800">
                    {rij.verwacht?.slice(0, 5) ?? '—'}
                    {rij.benadering && (
                      <span
                        className="ml-1 text-xs text-slate-400"
                        title="Op deze datum gold nog geen rooster; het dichtstbijzijnde is gebruikt."
                      >
                        (benadering)
                      </span>
                    )}
                  </dd>
                  <dt className="text-slate-500">
                    {rij.soort === 'te_laat' ? 'Aangekomen' : 'Vertrokken'}
                  </dt>
                  <dd className="text-slate-800">{rij.werkelijk?.slice(0, 5) ?? '—'}</dd>
                  <dt className="text-slate-500">Afwijking</dt>
                  <dd
                    className={`font-medium ${
                      rij.ernst === 'overtreding' ? 'text-red-700' : 'text-orange-700'
                    }`}
                  >
                    {minutenLabel(rij.minuten)} {rij.soort === 'te_laat' ? 'te laat' : 'te vroeg'}
                  </dd>
                </dl>
                <p className="mt-2 text-xs text-slate-500">
                  {rij.soort === 'te_laat'
                    ? 'Aankomst = einde van de eerste zakelijke ritketen van de dag.'
                    : 'Vertrek = begin van de laatste zakelijke ritketen van de dag.'}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Wat er geboekt is
                </h3>
                {rij.geboekt == null ? (
                  <p className="text-sm text-slate-500">
                    De urenboekingen konden niet uit Bouw7 worden opgehaald. Zonder die
                    gegevens is niet te zien of deze dag verklaard is.
                  </p>
                ) : rij.geboekt === 0 ? (
                  <p className="text-sm text-slate-700">
                    <span className="font-medium">Niets geboekt.</span> Er staan die dag geen
                    uren op naam van deze medewerker.
                  </p>
                ) : (
                  <>
                    <p className="text-2xl font-semibold text-slate-900">
                      {urenLabel(rij.geboekt)} uur
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">{rij.uursoorten}</p>
                  </>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Ritten van deze dag
                </h3>
                <RittenLijst
                  ritten={ritten}
                  fout={rittenFout}
                  soort={rij.soort}
                />
                <Link
                  href="/wagenpark/ritten"
                  className="mt-2 inline-block text-sm text-green-700 hover:underline"
                >
                  Open de rittenlijst →
                </Link>
              </section>

              <section className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Controle
                </h3>

                {open ? (
                  <>
                    <textarea
                      value={toelichting}
                      onChange={(e) => setToelichting(e.target.value)}
                      rows={3}
                      placeholder="Toelichting (optioneel) — bijvoorbeeld: middagverlof niet geregistreerd."
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-1 focus:ring-green-600"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={() => afhandelen('verklaard')}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Verklaard
                      </button>
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={() => afhandelen('bespreken')}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Bespreken
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      Verklaard = geen actie nodig. Bespreken = meenemen in een gesprek met de
                      medewerker. Beide halen de dag uit je werklijst.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 mb-3">
                      Deze dag is al afgehandeld als{' '}
                      <span className="font-medium">
                        {rij.status === 'geaccepteerd_uitzondering' ? 'verklaard' : 'te bespreken'}
                      </span>
                      .
                    </p>
                    <button
                      type="button"
                      disabled={bezig}
                      onClick={heropenen}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Terug naar te controleren
                    </button>
                  </>
                )}
              </section>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/** "23 min" / "1 u 12" — duur van een rit. */
function duurLabel(seconden: number | null): string {
  if (seconden == null) return '—'
  const min = Math.round(seconden / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} u ${String(min % 60).padStart(2, '0')}`
}

const RIT_TYPE_STIJL: Record<string, string> = {
  zakelijk: 'bg-slate-100 text-slate-600',
  prive: 'bg-blue-100 text-blue-700',
  woon_werk: 'bg-slate-100 text-slate-600',
}

/**
 * De ritten van de dag, met de bepalende ritketen eruit gelicht.
 *
 * Waarom álle ritten en niet alleen de keten: het gesprek gaat juist over wat
 * er omheen gebeurde. Een privérit om kwart voor acht verklaart een late
 * aankomst; een tussenstop bij de groothandel laat zien dat er al gewerkt werd.
 * De keten is groen gemarkeerd zodat wél duidelijk blijft waar het getal
 * vandaan komt.
 */
function RittenLijst({
  ritten,
  fout,
  soort,
}: {
  ritten: DagRit[] | null
  fout: string | null
  soort: WerktijdRij['soort']
}) {
  if (fout) {
    return <p className="text-sm text-slate-500">De ritten konden niet worden opgehaald ({fout}).</p>
  }
  if (ritten === null) {
    return <p className="text-sm text-slate-400">Ritten laden…</p>
  }
  if (ritten.length === 0) {
    return <p className="text-sm text-slate-500">Geen ritten gevonden op deze dag.</p>
  }

  return (
    <ol className="space-y-1.5">
      {ritten.map((r) => (
        <li
          key={r.id}
          className={`rounded-md border px-3 py-2 ${
            r.in_keten ? 'border-green-300 bg-green-50/60' : 'border-slate-200 bg-white'
          }`}
        >
          <div className="flex items-baseline gap-2 text-sm">
            <span className="font-medium tabular-nums text-slate-900">
              {r.start_tijd?.slice(0, 5) ?? '—'}–{r.stop_tijd?.slice(0, 5) ?? '—'}
            </span>
            <span className="text-xs text-slate-500">{duurLabel(r.duur_seconden)}</span>
            <span className="text-xs text-slate-500">{formatKm(r.afstand_km, 1)}</span>
            {r.rit_type !== 'zakelijk' && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  RIT_TYPE_STIJL[r.rit_type] ?? 'bg-slate-100 text-slate-600'
                }`}
              >
                {r.rit_type === 'prive' ? 'privé' : r.rit_type.replace('_', '-')}
              </span>
            )}
            {r.is_anker && (
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
                <Flag className="w-3 h-3" />
                {soort === 'te_laat' ? 'bepaalt de aankomst' : 'bepaalt het vertrek'}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-slate-500 truncate" title={`${r.adres_start ?? '—'} → ${r.adres_stop ?? '—'}`}>
            {r.adres_start ?? '—'} → {r.adres_stop ?? '—'}
          </p>
        </li>
      ))}
    </ol>
  )
}
