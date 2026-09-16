'use client'

/**
 * De werklijst: niet gesorteerd op dossier, maar gegroepeerd op urgentie.
 *
 * Het bord beantwoordt "waar staat de pijplijn?", deze lijst beantwoordt "wat moet ik vandaag
 * doen?". Dat is een andere vraag en dus een andere ordening. Wie hier bovenaan begint en naar
 * beneden werkt, heeft aan het eind van de dag niets laten liggen.
 *
 * Wat hier bewust NIET in staat: offertes die pas over weken spelen en slapende (uitgestelde)
 * kansen. Die staan achter de schakelaar "ook wat later speelt". Zonder die afbakening wordt de
 * lijst een tweede dossieroverzicht en verliest hij zijn functie.
 */

import * as React from 'react'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { StatCard } from '@/components/ui/stat-card'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import { dossierTabPad } from '@/components/dossiers/open-dossier'
import { formatDatumNL } from '@/lib/dossiers/datum-regels'
import { vandaagNL } from '@/lib/wagenpark/periode'
import {
  bewakingsStatus, stapOmschrijving, STATUS_PRESENTATIE,
  type BewakingStatus,
} from '@/lib/commercie/types'
import { dagenTussenKalender } from '@/lib/dossiers/datum-regels'
import type { DossierRij } from '@/components/dossiers/types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { AlertTriangle, CalendarClock, Clock, Euro, Users } from 'lucide-react'

/** Bedragdrempel waarboven een offerte zonder eigenaar of stap extra opvalt. */
const AANDACHT_BEDRAG = 20_000

type Bak =
  | 'verlopen'
  | 'vandaag'
  | 'ongetrieerd'
  | 'deze_week'
  | 'hercontrole'
  | 'later'

/** Volgorde én label van de groepen. De index stuurt de sortering, zie `wanneerWaarde`. */
const BAKKEN: { bak: Bak; label: string; uitleg: string }[] = [
  { bak: 'verlopen',    label: 'Verlopen',            uitleg: 'De afgesproken datum is voorbij.' },
  { bak: 'vandaag',     label: 'Vandaag',             uitleg: 'Nu aan de beurt.' },
  { bak: 'ongetrieerd', label: 'Nog niet beoordeeld', uitleg: 'Verzonden, maar nog zonder eigenaar of vervolgstap.' },
  { bak: 'deze_week',   label: 'Deze week',           uitleg: 'Staat klaar binnen zeven dagen.' },
  { bak: 'hercontrole', label: 'Hercontrole nadert',  uitleg: 'We wachten, en het controlemoment komt eraan.' },
  { bak: 'later',       label: 'Later',               uitleg: 'Speelt pas over langere tijd, inclusief uitgesteld werk.' },
]

const BAK_INDEX = new Map(BAKKEN.map((b, i) => [b.bak, i]))

type Rij = DossierRij & {
  _status: BewakingStatus
  _bak: Bak
  _dagen: number | null
  _bedrag: number | null
  _stap: string | null
  _aandacht: boolean
}

function bakVan(status: BewakingStatus, dagen: number | null): Bak | null {
  switch (status) {
    case 'afgerond':    return null
    case 'verlopen':    return 'verlopen'
    case 'nu':          return 'vandaag'
    case 'ongetrieerd': return 'ongetrieerd'
    case 'op_schema':   return dagen != null && dagen <= 7 ? 'deze_week' : 'later'
    case 'slapend':     return 'later'
    default:            return dagen != null && dagen <= 7 ? 'hercontrole' : 'later'
  }
}

const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

const eurKort = (n: number) =>
  n >= 1000
    ? `€ ${new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 0 }).format(Math.round(n / 1000))}k`
    : eur(n)

type Props = {
  dossiers: DossierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  /** Medewerker-id van de ingelogde gebruiker; draagt de schakelaar "alleen van mij". */
  mijnMedewerkerId: string | null
  viewToggle?: React.ReactNode
  extraActies?: React.ReactNode
}

export function BewakingWerklijst(props: Props) {
  const [alleenVanMij, setAlleenVanMij] = React.useState(false)
  const [toonLater, setToonLater] = React.useState(false)
  const vandaag = React.useMemo(() => vandaagNL(), [])

  const alle: Rij[] = React.useMemo(() => {
    return props.dossiers.map(d => {
      const status = bewakingsStatus(
        {
          stap_soort: d.bewaking_stap_soort ?? null,
          stap_datum: d.bewaking_stap_datum ?? null,
          wacht_op:   d.bewaking_wacht_op ?? null,
        },
        { vandaag, afgerond: d.hoofdstatus === 'opdracht' },
      )
      const dagen = d.bewaking_stap_datum
        ? dagenTussenKalender(vandaag, d.bewaking_stap_datum)
        : null
      const bedrag = berekenKaartBedrag(d, 'offerte').totaalExclBtw
      return {
        ...d,
        _status: status,
        _bak: bakVan(status, dagen) ?? 'later',
        _dagen: dagen,
        _bedrag: bedrag,
        _stap: stapOmschrijving({
          stap_soort: d.bewaking_stap_soort ?? null,
          stap_tekst: d.bewaking_stap_tekst ?? null,
          stap_datum: d.bewaking_stap_datum ?? null,
          wacht_op:   d.bewaking_wacht_op ?? null,
        }),
        // Grote offerte zonder eigenaar of zonder afgesproken vervolg: het geval waarin stil
        // blijven liggen het meeste kost.
        _aandacht:
          (bedrag ?? 0) >= AANDACHT_BEDRAG
          && (!d.bewaking_eigenaar_id || !d.bewaking_stap_soort),
      }
    })
  }, [props.dossiers, vandaag])

  const vanMij = React.useMemo(
    () => alleenVanMij && props.mijnMedewerkerId
      ? alle.filter(r => r.bewaking_actiehouder_id === props.mijnMedewerkerId
          || r.bewaking_eigenaar_id === props.mijnMedewerkerId)
      : alle,
    [alle, alleenVanMij, props.mijnMedewerkerId],
  )

  const zichtbaar = React.useMemo(
    () => toonLater ? vanMij : vanMij.filter(r => r._bak !== 'later'),
    [vanMij, toonLater],
  )

  // De tegels rekenen over de hele (eventueel op "van mij" gefilterde) pijplijn, niet over de
  // zichtbare bakken: "€ 1,2 mln staat open" is een pijplijncijfer, geen werklijstcijfer.
  const tellers = React.useMemo(() => {
    const t = { verlopen: 0, vandaag: 0, wachtKlant: 0, wachtIntern: 0, bedrag: 0, aandacht: 0 }
    for (const r of vanMij) {
      if (r._status === 'verlopen') t.verlopen++
      if (r._status === 'nu') t.vandaag++
      if (r._status === 'wacht_klant') t.wachtKlant++
      if (r._status === 'wacht_intern' || r._status === 'wacht_extern') t.wachtIntern++
      if (r._aandacht) t.aandacht++
      t.bedrag += r._bedrag ?? 0
    }
    return t
  }, [vanMij])

  const kolommen: KolomDefinitie<Rij>[] = React.useMemo(() => [
    {
      key: 'dossier', label: 'Dossier', vast: true, breedte: 300,
      render: r => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{r.titel}</span>
          <span className="text-[11px] text-neutral-500">{r.dossiernummer ?? 'Nieuw'}</span>
        </span>
      ),
      sorteerWaarde: r => r.titel ?? '',
    },
    {
      key: 'status', label: 'Status', breedte: 160,
      render: r => {
        const pres = STATUS_PRESENTATIE[r._status]
        return (
          <span className="flex items-center gap-1.5" title={pres.uitleg}>
            <span className={`h-2 w-2 shrink-0 rounded-full ${pres.stip}`} aria-hidden />
            {pres.label}
          </span>
        )
      },
      // Sorteren op urgentie, filteren op het getoonde label — anders vergelijkt het
      // select-filter een volgnummer met een label en valt de lijst leeg.
      sorteerWaarde: r => BAK_INDEX.get(r._bak) ?? 99,
      filterType: 'select',
      filterWaarde: r => STATUS_PRESENTATIE[r._status].label,
      filterOpties: [...new Set(Object.values(STATUS_PRESENTATIE).map(p => p.label))],
    },
    {
      key: 'stap', label: 'Volgende stap', breedte: 340,
      render: r => r._stap
        ? (
          <span>
            {r._stap}
            {/* Uit de actielijst overgenomen: wel een afspraak, nog geen commerciële beslissing. */}
            {r.bewaking_stap_bron === 'actie' && (
              <span className="text-neutral-400" title="Overgenomen uit de actielijst van dit dossier"> · uit de actielijst</span>
            )}
          </span>
        )
        : <span className="text-neutral-400">Nog niets afgesproken</span>,
      sorteerWaarde: r => r._stap ?? '',
    },
    {
      key: 'datum', label: 'Wanneer', breedte: 140,
      render: r => (r.bewaking_stap_datum ? formatDatumNL(r.bewaking_stap_datum) : '—'),
      // Groepen komen in de volgorde waarin hun eerste rij staat; door de bak-index in de
      // sorteerwaarde te verwerken staan Verlopen/Vandaag altijd bovenaan.
      sorteerWaarde: r => (BAK_INDEX.get(r._bak) ?? 99) * 100_000 + (r._dagen ?? 0) + 50_000,
    },
    {
      key: 'actiehouder', label: 'Nu aan zet', breedte: 160,
      render: r => r.bewaking_actiehouder ?? <span className="text-neutral-400">—</span>,
      sorteerWaarde: r => r.bewaking_actiehouder ?? '',
      filterType: 'select',
      filterWaarde: r => r.bewaking_actiehouder ?? 'Niemand',
      filterOpties: [
        ...new Set(alle.map(r => r.bewaking_actiehouder ?? 'Niemand')),
      ].sort(),
    },
    {
      key: 'klant', label: 'Klant', breedte: 200,
      render: r => r.klant_naam ?? '—',
      sorteerWaarde: r => r.klant_naam ?? '',
    },
    {
      key: 'bedrag', label: 'Bedrag', breedte: 120,
      render: r => (
        <span className="tabular-nums">
          {eur(r._bedrag)}
          {r._aandacht && (
            <span className="ml-1 text-warning-700" title={`Vanaf ${eur(AANDACHT_BEDRAG)} zonder eigenaar of vervolgstap`}>!</span>
          )}
        </span>
      ),
      sorteerWaarde: r => r._bedrag ?? 0,
    },
    {
      key: 'fase', label: 'Fase', standaard_zichtbaar: false, breedte: 160,
      render: r => r.offerte_substatus ?? '—',
      sorteerWaarde: r => r.offerte_substatus ?? '',
    },
  ], [alle])

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Schakelaar
            aan={alleenVanMij}
            onKlik={() => setAlleenVanMij(v => !v)}
            label={alleenVanMij ? 'Alleen van mij' : 'Van iedereen'}
            uit={!props.mijnMedewerkerId}
          />
          <Schakelaar
            aan={toonLater}
            onKlik={() => setToonLater(v => !v)}
            label="Ook wat later speelt"
          />
        </div>
        <div className="flex items-center gap-2">{props.extraActies}{props.viewToggle}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Verlopen" tone={tellers.verlopen > 0 ? 'error' : 'success'}
          icon={<AlertTriangle className="h-5 w-5" />} value={String(tellers.verlopen)} />
        <StatCard label="Vandaag" tone="info"
          icon={<Clock className="h-5 w-5" />} value={String(tellers.vandaag)} />
        <StatCard label="Wacht op klant" tone="warning"
          icon={<CalendarClock className="h-5 w-5" />} value={String(tellers.wachtKlant)} />
        <StatCard label="Wacht intern/extern" tone="lime"
          icon={<Users className="h-5 w-5" />} value={String(tellers.wachtIntern)} />
        <StatCard label="Openstaand" tone="brand"
          icon={<Euro className="h-5 w-5" />} value={eurKort(tellers.bedrag)}
          trend={{ direction: 'flat', value: `${vanMij.length} offertes` }} />
      </div>

      <OverzichtTabel<Rij>
        scherm="offerte-bewaking"
        data={zichtbaar}
        kolommen={kolommen}
        layouts={props.layouts}
        user_id={props.user_id}
        dicht
        eenregelig
        selecteerbaar={false}
        beginSortering={[{ id: 'datum', desc: false }]}
        onRijKlik={r => { window.location.href = dossierTabPad('offerte', r.id, 'bewaking') }}
        groepering={{
          sleutel: r => r._bak,
          standaardOpen: true,
          kop: (rijen, sleutel) => {
            const def = BAKKEN.find(b => b.bak === sleutel)
            const som = rijen.reduce((t, r) => t + (r._bedrag ?? 0), 0)
            return (
              <span className="flex items-baseline gap-2">
                <span className="font-semibold">{def?.label ?? sleutel}</span>
                <span className="text-[11px] text-neutral-500">{def?.uitleg}</span>
                <span className="ml-auto text-[11px] text-neutral-500">
                  {rijen.length} · {eurKort(som)}
                </span>
              </span>
            )
          },
        }}
      />
    </div>
  )
}

function Schakelaar({ aan, onKlik, label, uit }: {
  aan: boolean; onKlik: () => void; label: string; uit?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onKlik}
      disabled={uit}
      className={[
        'rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-40',
        aan
          ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
          : 'border-neutral-300 text-neutral-700 hover:bg-neutral-50',
      ].join(' ')}
    >
      {label}
    </button>
  )
}
