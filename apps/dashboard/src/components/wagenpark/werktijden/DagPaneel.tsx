'use client'

import React, { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody,
} from '@/components/ui'
import { formatDatumMetDag } from '@/lib/wagenpark/utils'
import {
  minutenLabel, urenLabel, SOORT_LABEL, teltMee, dagSaldoUren, saldoLabel,
} from '@/lib/wagenpark/werktijd'
import {
  handelWerktijdSignaalAf,
  heropenWerktijdSignaal,
} from '@/app/(platform)/wagenpark/actions/werktijd-afhandeling'
import {
  laadRittenVanDag,
  type DagRit,
} from '@/app/(platform)/wagenpark/actions/werktijd-ritten'
import {
  kiesWerktijdAnker,
  herstelWerktijdAnker,
  zetRitTypeVoorWerkdag,
} from '@/app/(platform)/wagenpark/actions/werktijd-anker'
import {
  reserveerTijdVoorTijd,
  verwijderTijdVoorTijd,
} from '@/app/(platform)/wagenpark/actions/werktijd-tvt'
import {
  afwijkingenVanDag,
  type WerktijdAfwijking,
  type WerktijdRij,
} from '@/lib/wagenpark/werktijd-dag'
import RittenLijst from '@/components/wagenpark/werktijden/DagRitten'

/**
 * Eén werkdag ter controle: wat het rooster zei, wat de auto deed, en wat er die
 * dag geboekt is. Vanaf hier zet je hem ook recht.
 *
 * Alle drie de gegevens naast elkaar is het hele punt — de afwijking alleen zegt
 * niets, en de uren alleen ook niet.
 *
 * Het paneel gaat over de DAG, niet over één signaal. Een dag kan twee
 * afwijkingen dragen (te laat gekomen én te vroeg weg) en die worden allebei
 * hier afgehandeld; hij kan er ook geen dragen, en dan is er niets af te vinken
 * maar valt er nog genoeg te zien — juist een dag zonder afwijking kan een
 * saldo hebben tussen de auto en de urenstaat.
 */
export default function DagPaneel({
  rij,
  onClose,
  onVervangen,
}: {
  rij: WerktijdRij | null
  onClose: () => void
  /**
   * De dag is herrekend. Het paneel blijft open op dezelfde dag; deze melding
   * is er zodat de lijst eromheen zich kan verversen.
   */
  onVervangen: (dag_id: string | null) => void
}) {
  const [bezig, startTransition] = useTransition()
  const [ritten, setRitten] = useState<DagRit[] | null>(null)
  const [rittenFout, setRittenFout] = useState<string | null>(null)
  const [handmatigAnker, setHandmatigAnker] = useState({ R9: false, R10: false })
  // Loopt op na elke wijziging aan een rit, om de ritten opnieuw op te halen.
  // Dat moet: verandert een rit van zakelijk naar privé, dan schuift de hele
  // ketenbepaling mee en klopt de gemarkeerde "bepaalt de aankomst" niet meer.
  const [herlaad, setHerlaad] = useState(0)

  // De ritten komen pas als het paneel opengaat; zie werktijd-ritten.ts.
  // `afgebroken` vangt het snel doorklikken naar een volgende dag af: zonder
  // die vlag kan het antwoord van de vórige dag over het nieuwe heen vallen.
  useEffect(() => {
    const user = rij?.user_id_ulu
    const datum = rij?.datum
    setRitten(null)
    setRittenFout(null)
    setHandmatigAnker({ R9: false, R10: false })
    if (!user || !datum) return

    let afgebroken = false
    laadRittenVanDag(user, datum)
      .then((res) => {
        if (afgebroken) return
        if (res.ok) {
          setRitten(res.ritten)
          setHandmatigAnker(res.handmatigAnker)
        } else setRittenFout(res.error)
      })
      // De actie kan ook GOOIEN in plaats van een fout terug te geven — een
      // verlopen sessie of ingetrokken recht komt als exceptie binnen. Zonder
      // deze vangst blijft het paneel eeuwig op "Ritten laden…" staan en lijkt
      // het alsof de server hangt.
      .catch((e: unknown) => {
        if (afgebroken) return
        setRittenFout(e instanceof Error ? e.message : 'Ritten niet op te halen')
      })
    return () => {
      afgebroken = true
    }
  }, [rij?.user_id_ulu, rij?.datum, herlaad])

  /**
   * De bepalende rit verzetten, of de handmatige keuze weer intrekken.
   *
   * Beide leveren een herrekende dag op. De lijst eromheen moet daarna verse
   * gegevens ophalen, en de ritten in dit paneel ook — de ketenmarkering is
   * verschoven.
   */
  function verzetAnker(afwijking: WerktijdAfwijking, trip_id: string | null) {
    startTransition(async () => {
      const res = trip_id
        ? await kiesWerktijdAnker(afwijking.id, trip_id)
        : await herstelWerktijdAnker(afwijking.id)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        trip_id
          ? afwijking.soort === 'te_laat'
            ? 'Aankomst opnieuw bepaald'
            : 'Vertrek opnieuw bepaald'
          : 'Terug naar de automatische bepaling',
      )
      setHerlaad((n) => n + 1)
      onVervangen(rij?.id ?? null)
    })
  }

  /**
   * Een rit op zakelijk of privé zetten en de dag opnieuw laten doorrekenen.
   *
   * Het paneel blijft open en haalt de ritten opnieuw op: de ketenbepaling kan
   * door deze wissel verschoven zijn, dus de markering "bepaalt de aankomst"
   * moet mee, en de aanwezigheid en het saldo van de dag zijn herrekend.
   */
  function wisselRitType(trip_id: string, nieuwType: 'zakelijk' | 'prive' | null) {
    if (!rij) return
    startTransition(async () => {
      const res = await zetRitTypeVoorWerkdag(rij.user_id_ulu, rij.datum, trip_id, nieuwType)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      toast.success(
        nieuwType === null
          ? 'Terug naar de automatische classificatie'
          : `Rit op ${nieuwType === 'prive' ? 'privé' : 'zakelijk'} gezet`,
      )
      setHerlaad((n) => n + 1)
      onVervangen(rij.id)
    })
  }

  function afhandelen(afwijking: WerktijdAfwijking, uitkomst: 'verklaard' | 'bespreken', toelichting: string) {
    startTransition(async () => {
      const res = await handelWerktijdSignaalAf(afwijking.id, uitkomst, toelichting)
      if (res.ok) {
        toast.success(
          uitkomst === 'verklaard' ? 'Afgevinkt als verklaard' : 'Gemarkeerd om te bespreken',
        )
        onVervangen(rij?.id ?? null)
      } else {
        toast.error(res.error ?? 'Afhandelen mislukt')
      }
    })
  }

  function reserveerTvt(uren: number, toelichting: string) {
    if (!rij) return
    startTransition(async () => {
      const res = await reserveerTijdVoorTijd(rij.user_id_ulu, rij.datum, uren, toelichting)
      if (res.ok) {
        toast.success('Gereserveerd als tijd voor tijd')
        onVervangen(rij.id)
      } else {
        toast.error(res.error)
      }
    })
  }

  function trekTvtIn() {
    if (!rij) return
    startTransition(async () => {
      const res = await verwijderTijdVoorTijd(rij.user_id_ulu, rij.datum)
      if (res.ok) {
        toast.success('Reservering ingetrokken')
        onVervangen(rij.id)
      } else {
        toast.error(res.error)
      }
    })
  }

  function heropenen(afwijking: WerktijdAfwijking) {
    startTransition(async () => {
      const res = await heropenWerktijdSignaal(afwijking.id)
      if (res.ok) {
        toast.success('Teruggezet naar te controleren')
        onVervangen(rij?.id ?? null)
      } else {
        toast.error(res.error ?? 'Heropenen mislukt')
      }
    })
  }

  const afwijkingen = rij ? afwijkingenVanDag(rij) : []
  const saldo = rij ? dagSaldoUren(rij.aanwezigMinuten, rij.arbeidsuren) : null

  return (
    <Drawer open={!!rij} onOpenChange={(o) => { if (!o) onClose() }}>
      <DrawerContent width={560}>
        {rij && (
          <>
            <DrawerHeader>
              <DrawerTitle>{rij.bestuurder}</DrawerTitle>
              <DrawerDescription>
                {formatDatumMetDag(rij.datum)}
                {afwijkingen.length === 0
                  ? ' · binnen de roostertijden'
                  : ` · ${afwijkingen
                      .map((a) => `${minutenLabel(a.minuten)} ${SOORT_LABEL[a.soort].toLowerCase()}`)
                      .join(' · ')}`}
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
                    {rij.roosterStart || rij.roosterEind
                      ? `${rij.roosterStart?.slice(0, 5) ?? '—'} – ${rij.roosterEind?.slice(0, 5) ?? '—'}`
                      : '—'}
                  </dd>
                  <dt className="text-slate-500">Aangekomen</dt>
                  <dd className="text-slate-800">
                    {rij.aankomst ?? '—'}
                    <RoosterNoot afwijking={rij.teLaat} handmatig={handmatigAnker.R9} />
                  </dd>
                  <dt className="text-slate-500">Vertrokken</dt>
                  <dd className="text-slate-800">
                    {rij.vertrek ?? '—'}
                    <RoosterNoot afwijking={rij.teVroeg} handmatig={handmatigAnker.R10} />
                  </dd>
                  <dt className="text-slate-500">Pauze</dt>
                  <dd className="text-slate-800">
                    {rij.pauzeMinuten > 0 ? (
                      minutenLabel(rij.pauzeMinuten)
                    ) : (
                      <span className="text-slate-500">
                        {rij.pauzeInRooster
                          ? 'geen — de roosterpauze valt buiten dit venster'
                          : 'geen pauze in het rooster'}
                      </span>
                    )}
                  </dd>
                  <dt className="text-slate-500">Netto aanwezig</dt>
                  <dd className="font-medium text-slate-900">
                    {rij.aanwezigMinuten == null ? (
                      <span className="font-normal text-slate-500">
                        niet te bepalen — {rij.aanwezigReden ?? 'geen bruikbaar ritvenster'}
                      </span>
                    ) : (
                      minutenLabel(rij.aanwezigMinuten)
                    )}
                  </dd>
                </dl>
                <p className="mt-2 text-xs text-slate-500">
                  Aankomst = einde van de eerste zakelijke ritketen van de dag, vertrek = begin van
                  de laatste.
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
                      {rij.arbeidsuren == null ? '—' : urenLabel(rij.arbeidsuren)} uur
                      <span className="ml-2 text-sm font-normal text-slate-500">arbeidsuren</span>
                    </p>
                    <p className="text-sm text-slate-600 mt-0.5">{rij.uursoorten}</p>
                    {rij.arbeidsuren != null && rij.geboekt !== rij.arbeidsuren && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Van de {urenLabel(rij.geboekt)} geboekte uren telt alleen het werkdeel mee;
                        verlof, ziek, feestdag en tijd voor tijd niet.
                      </p>
                    )}
                  </>
                )}
                {saldo != null && (
                  <p className="mt-2 text-sm">
                    <span className="text-slate-500">Saldo aanwezig − arbeidsuren: </span>
                    <span
                      className={`font-semibold tabular-nums ${
                        saldo <= -0.5
                          ? 'text-red-700'
                          : saldo >= 0.5
                            ? 'text-emerald-700'
                            : 'text-slate-600'
                      }`}
                    >
                      {saldoLabel(saldo)}
                    </span>
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Ritten van deze dag
                </h3>
                <RittenLijst
                  ritten={ritten}
                  fout={rittenFout}
                  teLaat={rij.teLaat}
                  teVroeg={rij.teVroeg}
                  bezig={bezig}
                  onKies={verzetAnker}
                  onWisselType={wisselRitType}
                />
                {afwijkingen.map((a) => {
                  const handmatig = a.soort === 'te_laat' ? handmatigAnker.R9 : handmatigAnker.R10
                  if (!handmatig) return null
                  return (
                    <p key={a.id} className="mt-2 text-xs text-slate-600">
                      De rit die {a.soort === 'te_laat' ? 'de aankomst' : 'het vertrek'} bepaalt is
                      handmatig aangewezen.{' '}
                      <button
                        type="button"
                        disabled={bezig}
                        onClick={() => verzetAnker(a, null)}
                        className="underline text-green-700 hover:text-green-800 disabled:opacity-50"
                      >
                        Terug naar automatisch
                      </button>
                    </p>
                  )
                })}
                <p className="mt-2 text-xs text-slate-500">
                  Klopt zakelijk of privé niet? Klik op het label om te wisselen. Alleen zakelijke
                  ritten tellen mee in de werkdag, dus de aankomst, het vertrek en het saldo van
                  deze dag worden meteen opnieuw uitgerekend.
                </p>
                <Link
                  href="/wagenpark/ritten"
                  className="mt-2 inline-block text-sm text-green-700 hover:underline"
                >
                  Open de rittenlijst →
                </Link>
              </section>

              <section className="border-t border-slate-200 pt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Tijd voor tijd
                </h3>
                <TvtBlok
                  saldo={saldo}
                  gereserveerd={rij.tvtUren}
                  toelichting={rij.tvtToelichting}
                  bezig={bezig}
                  onReserveer={reserveerTvt}
                  onIntrekken={trekTvtIn}
                />
              </section>

              {afwijkingen.length > 0 && (
                <section className="border-t border-slate-200 pt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                    Controle
                  </h3>
                  {/* Elke afwijking wordt apart afgehandeld: een late aankomst kan
                      verklaard zijn terwijl het vroege vertrek nog uitgezocht moet
                      worden. */}
                  <div className="space-y-4">
                    {afwijkingen.map((a) => (
                      <AfwijkingControle
                        key={a.id}
                        afwijking={a}
                        meerdere={afwijkingen.length > 1}
                        bezig={bezig}
                        onAfhandelen={(uitkomst, toelichting) => afhandelen(a, uitkomst, toelichting)}
                        onHeropenen={() => heropenen(a)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/** De roostertijd en de afwijking als kleine noot achter een tijd. */
function RoosterNoot({
  afwijking,
  handmatig,
}: {
  afwijking: WerktijdAfwijking | null
  handmatig: boolean
}) {
  return (
    <>
      {afwijking && (
        <span
          className={`ml-2 text-xs ${teltMee(afwijking.status) ? 'text-orange-700' : 'text-slate-400 line-through'}`}
          title={`Roostertijd ${afwijking.verwacht?.slice(0, 5) ?? '—'}${
            afwijking.benadering
              ? ' (benadering: op deze datum gold nog geen rooster)'
              : ''
          }`}
        >
          {minutenLabel(afwijking.minuten)} {afwijking.soort === 'te_laat' ? 'te laat' : 'te vroeg'}
        </span>
      )}
      {handmatig && (
        <span
          className="ml-1 text-xs text-slate-400"
          title="De bepalende rit is handmatig aangewezen; zie de ritten hieronder."
        >
          (handmatig bepaald)
        </span>
      )}
    </>
  )
}

/**
 * Het saldo van deze dag vastleggen als tijd voor tijd.
 *
 * Bewust GEEN urenboeking: dit raakt niets in Bouw7 en verandert geen enkele
 * geaccordeerde regel. Het legt alleen vast dat het verschil van deze dag
 * bekend is en als tijd voor tijd geldt, waarna de dag uit het openstaande
 * saldo valt en het bedrag in een eigen totaal terugkomt.
 *
 * Het aantal uren staat voorgevuld op het dagsaldo maar is aanpasbaar: de helft
 * van een verschil afspreken is een normale uitkomst van een gesprek, en een
 * knop die alleen het hele bedrag kan vastleggen dwingt je dan naar Bouw7.
 */
function TvtBlok({
  saldo,
  gereserveerd,
  toelichting: bestaandeToelichting,
  bezig,
  onReserveer,
  onIntrekken,
}: {
  saldo: number | null
  gereserveerd: number | null
  toelichting: string | null
  bezig: boolean
  onReserveer: (uren: number, toelichting: string) => void
  onIntrekken: () => void
}) {
  const [uren, setUren] = useState('')
  const [toelichting, setToelichting] = useState('')

  // Het saldo van deze dag als startwaarde, met een komma zoals de rest van EVA
  // getallen toont. Verandert de dag (of het saldo, na een ritwissel), dan
  // schuift het voorstel mee.
  useEffect(() => {
    setUren(saldo == null ? '' : String(saldo).replace('.', ','))
    setToelichting('')
  }, [saldo])

  if (gereserveerd != null) {
    return (
      <>
        <p className="text-sm text-slate-700">
          <span className="font-semibold tabular-nums">{saldoLabel(gereserveerd)}</span>{' '}
          gereserveerd als tijd voor tijd. Deze dag telt niet meer mee in het saldo.
        </p>
        {bestaandeToelichting && (
          <p className="mt-0.5 text-sm text-slate-600">{bestaandeToelichting}</p>
        )}
        <button
          type="button"
          disabled={bezig}
          onClick={onIntrekken}
          className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCcw className="w-4 h-4" />
          Reservering intrekken
        </button>
      </>
    )
  }

  if (saldo == null) {
    return (
      <p className="text-sm text-slate-500">
        Er is voor deze dag geen saldo te bepalen, dus er valt niets te reserveren.
      </p>
    )
  }

  const getal = Number(uren.replace(',', '.'))
  const geldig = Number.isFinite(getal) && getal !== 0 && Math.abs(getal) <= 24

  return (
    <>
      <div className="flex items-end gap-2">
        <label className="text-sm">
          <span className="block text-xs text-slate-500 mb-1">Uren</span>
          <input
            type="text"
            inputMode="decimal"
            value={uren}
            onChange={(e) => setUren(e.target.value)}
            className="w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-green-600"
          />
        </label>
        <button
          type="button"
          disabled={bezig || !geldig}
          onClick={() => onReserveer(getal, toelichting)}
          className="px-3 py-2 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-50"
        >
          Reserveren
        </button>
      </div>
      <input
        type="text"
        value={toelichting}
        onChange={(e) => setToelichting(e.target.value)}
        placeholder="Toelichting (optioneel) — bijvoorbeeld: afgesproken met de uitvoerder."
        className="mt-2 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-green-600"
      />
      <p className="mt-2 text-xs text-slate-500">
        Voorgevuld met het saldo van deze dag: {saldoLabel(saldo)}, dus {urenLabel(saldo)} uur.
        Pas het aan als er iets anders is afgesproken. Er wordt niets in Bouw7 geboekt — de
        reservering staat alleen in EVA en haalt deze dag uit het openstaande saldo.
      </p>
    </>
  )
}

/** Het afvink-blok van één afwijking. */
function AfwijkingControle({
  afwijking,
  meerdere,
  bezig,
  onAfhandelen,
  onHeropenen,
}: {
  afwijking: WerktijdAfwijking
  /** Bij twee afwijkingen op een dag moet erbij staan welke je afvinkt. */
  meerdere: boolean
  bezig: boolean
  onAfhandelen: (uitkomst: 'verklaard' | 'bespreken', toelichting: string) => void
  onHeropenen: () => void
}) {
  const [toelichting, setToelichting] = useState('')
  // Wissel je van dag, dan mag de toelichting van de vorige niet blijven staan —
  // die zou zo aan de verkeerde afwijking worden vastgelegd.
  useEffect(() => {
    setToelichting('')
  }, [afwijking.id])

  const open = afwijking.status === 'open'
  return (
    <div className={meerdere ? 'rounded-md border border-slate-200 p-3' : ''}>
      {meerdere && (
        <p className="mb-2 text-xs font-medium text-slate-700">
          {SOORT_LABEL[afwijking.soort]} · {minutenLabel(afwijking.minuten)}
        </p>
      )}
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
              onClick={() => onAfhandelen('verklaard', toelichting)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Verklaard
            </button>
            <button
              type="button"
              disabled={bezig}
              onClick={() => onAfhandelen('bespreken', toelichting)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <AlertTriangle className="w-4 h-4" />
              Bespreken
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Verklaard = geen actie nodig; de dag telt daarna niet meer mee in het saldo. Bespreken =
            meenemen in een gesprek met de medewerker. Beide halen de dag uit je werklijst.
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700 mb-3">
            Afgehandeld als{' '}
            <span className="font-medium">
              {afwijking.status === 'geaccepteerd_uitzondering' ? 'verklaard' : 'te bespreken'}
            </span>
            .
          </p>
          <button
            type="button"
            disabled={bezig}
            onClick={onHeropenen}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-white border border-slate-300 text-slate-700 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Terug naar te controleren
          </button>
        </>
      )}
    </div>
  )
}
