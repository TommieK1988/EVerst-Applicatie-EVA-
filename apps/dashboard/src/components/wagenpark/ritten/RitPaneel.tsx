'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import { CheckCircle2, Plus, Trash2, UserPen } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody,
} from '@/components/ui'
import BevindingRij from '@/components/wagenpark/bevindingen/BevindingRij'
import RitTypeToggle from '@/components/wagenpark/ritten/RitTypeToggle'
import { formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'
import {
  voegHandmatigeBevindingToe, verwijderHandmatigeBevinding,
} from '@/app/(platform)/wagenpark/actions/handmatige-bevinding'

/** Regel uit het handboek, als keuze voor een handmatige toekenning. */
export type RegelOptie = {
  code: string
  titel: string
  actief: boolean
}

/** Bevinding zoals de ritten-query hem meelevert (json_build_object in de lateral join). */
export type RitBevinding = {
  id: string
  regel_code: string
  ernst: 'info' | 'waarschuwing' | 'overtreding'
  omschrijving: string
  status: string
  gegenereerd_op: string
  periode_start: string | null
  periode_eind: string | null
  bron: 'automatisch' | 'handmatig'
  data: unknown
}

type Rit = {
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
  score: number | null
  adres_start: string | null
  adres_stop: string | null
  bevindingen: RitBevinding[]
}

const ERNST_LABEL: Record<RitBevinding['ernst'], string> = {
  overtreding: 'Overtreding',
  waarschuwing: 'Waarschuwing',
  info: 'Info',
}

const ERNST_BADGE: Record<RitBevinding['ernst'], string> = {
  overtreding: 'bg-red-100 text-red-700',
  waarschuwing: 'bg-orange-100 text-orange-700',
  info: 'bg-blue-100 text-blue-700',
}

function tijd(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

export default function RitPaneel({
  rit,
  regels,
  onClose,
}: {
  rit: Rit | null
  regels: RegelOptie[]
  onClose: () => void
}) {
  const bevindingen = rit?.bevindingen ?? []
  const automatisch = bevindingen.filter((b) => b.bron !== 'handmatig')
  const handmatig = bevindingen.filter((b) => b.bron === 'handmatig')

  return (
    <Drawer open={!!rit} onOpenChange={(open) => { if (!open) onClose() }}>
      <DrawerContent width={560}>
        {rit && (
          <>
            <DrawerHeader>
              <DrawerTitle>
                {formatDatumMetDag(rit.start_datum)} · {tijd(rit.start_tijd)}–{tijd(rit.stop_tijd)}
              </DrawerTitle>
              <DrawerDescription>
                {rit.kenteken}
                {rit.bestuurder_naam_raw ? ` · ${rit.bestuurder_naam_raw}` : ''}
                {` · ${formatKm(rit.afstand_km, 1)}`}
              </DrawerDescription>
            </DrawerHeader>

            <DrawerBody className="space-y-5">
              {/* Rit-gegevens */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Rit
                </h3>
                <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-1.5 text-sm">
                  <dt className="text-slate-500">Vertrek</dt>
                  <dd className="text-slate-800">{rit.adres_start ?? '—'}</dd>
                  <dt className="text-slate-500">Bestemming</dt>
                  <dd className="text-slate-800">{rit.adres_stop ?? '—'}</dd>
                  <dt className="text-slate-500">Afstand</dt>
                  <dd className="text-slate-800">{formatKm(rit.afstand_km, 1)}</dd>
                  <dt className="text-slate-500">Rijscore</dt>
                  <dd
                    className={
                      rit.score != null && rit.score < 50
                        ? 'text-red-700 font-medium'
                        : rit.score != null && rit.score < 70
                        ? 'text-orange-700'
                        : 'text-slate-800'
                    }
                  >
                    {rit.score ?? '—'}
                  </dd>
                  <dt className="text-slate-500">Bestuurder</dt>
                  <dd className="text-slate-800">
                    {rit.user_id_ulu ? (
                      <Link
                        href={`/wagenpark/bestuurders/${rit.user_id_ulu}`}
                        className="text-green-700 hover:underline"
                      >
                        {rit.bestuurder_naam_raw ?? `ULU #${rit.user_id_ulu}`}
                      </Link>
                    ) : (
                      rit.bestuurder_naam_raw ?? '—'
                    )}
                  </dd>
                  <dt className="text-slate-500">Type</dt>
                  <dd>
                    <RitTypeToggle
                      tripId={rit.id}
                      initialType={rit.rit_type_effectief}
                      initialHandmatig={rit.rit_type_handmatig}
                    />
                  </dd>
                </dl>
                <p className="mt-2 text-xs text-slate-500">
                  Klik op het type-badge om deze rit handmatig van zakelijk ↔ privé te wisselen.
                  Overrides blijven behouden bij volgende syncs.
                </p>
              </section>

              {/* Signalen van de engine */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Signalen ({automatisch.length})
                </h3>
                {automatisch.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-800">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    De compliance-check vond geen afwijkingen op deze rit.
                  </div>
                ) : (
                  <div className="rounded-lg border divide-y -mx-2">
                    {automatisch.map((b) => (
                      <BevindingRij
                        key={b.id}
                        bevinding={{
                          ...b,
                          voertuig_id: null,
                          medewerker_id: null,
                          bestuurder_naam: rit.bestuurder_naam_raw,
                          kenteken: rit.kenteken,
                          ulu_user_id: rit.user_id_ulu,
                        }}
                      />
                    ))}
                  </div>
                )}
              </section>

              {/* Handmatig toegekend */}
              <HandmatigBlok rit={rit} regels={regels} bevindingen={handmatig} />

              <p className="text-xs text-slate-500">
                Signalen die niet over één rit gaan — privé-km, rijgedrag en parkeerkosten — staan
                op de{' '}
                {rit.user_id_ulu ? (
                  <Link
                    href={`/wagenpark/bestuurders/${rit.user_id_ulu}`}
                    className="text-green-700 hover:underline"
                  >
                    bestuurderspagina
                  </Link>
                ) : (
                  'bestuurderspagina'
                )}
                .
              </p>
            </DrawerBody>
          </>
        )}
      </DrawerContent>
    </Drawer>
  )
}

/**
 * Handmatig toegekende afwijkingen: de tegenhanger van de engine-signalen.
 * Zag de planner iets wat de check niet ving, dan legt hij het hier vast.
 */
function HandmatigBlok({
  rit,
  regels,
  bevindingen,
}: {
  rit: Rit
  regels: RegelOptie[]
  bevindingen: RitBevinding[]
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [regelCode, setRegelCode] = useState('')
  const [ernst, setErnst] = useState<RitBevinding['ernst']>('waarschuwing')
  const [toelichting, setToelichting] = useState('')
  const [pending, startTransition] = useTransition()

  // Regels die al een open signaal op deze rit hebben, kun je niet nog eens
  // toekennen — de server weigert dat en dan is aanbieden misleidend.
  const bezet = new Set(bevindingen.map((b) => b.regel_code))

  function reset() {
    setFormOpen(false)
    setRegelCode('')
    setErnst('waarschuwing')
    setToelichting('')
  }

  function opslaan() {
    if (!regelCode) {
      toast.error('Kies eerst een regel.')
      return
    }
    startTransition(async () => {
      const res = await voegHandmatigeBevindingToe({
        trip_id: rit.id,
        regel_code: regelCode,
        ernst,
        toelichting,
      })
      if (res.ok) {
        toast.success(`${regelCode} toegekend aan deze rit`)
        reset()
      } else {
        toast.error(res.error ?? 'Toekennen mislukt')
      }
    })
  }

  function intrekken(id: string, code: string) {
    startTransition(async () => {
      const res = await verwijderHandmatigeBevinding(id)
      if (res.ok) toast.success(`${code} ingetrokken`)
      else toast.error(res.error ?? 'Intrekken mislukt')
    })
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Handmatig toegekend ({bevindingen.length})
        </h3>
        {!formOpen && (
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700"
          >
            <Plus className="w-3 h-3" />
            Afwijking toekennen
          </button>
        )}
      </div>

      {bevindingen.length > 0 && (
        <ul className="mb-3 space-y-2">
          {bevindingen.map((b) => {
            const d = (b.data ?? {}) as Record<string, unknown>
            const tekst = typeof d.toelichting === 'string' ? d.toelichting : b.omschrijving
            return (
              <li
                key={b.id}
                className="rounded-md border border-slate-200 px-3 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className={`px-1.5 py-0.5 rounded font-medium ${ERNST_BADGE[b.ernst]}`}>
                    {b.regel_code}
                  </span>
                  <span className="text-slate-500">{ERNST_LABEL[b.ernst]}</span>
                  <span className="inline-flex items-center gap-1 text-slate-400">
                    <UserPen className="w-3 h-3" />
                    handmatig
                  </span>
                  <button
                    type="button"
                    onClick={() => intrekken(b.id, b.regel_code)}
                    disabled={pending}
                    className="ml-auto inline-flex items-center gap-1 text-slate-400 hover:text-red-700 disabled:opacity-50"
                    title="Intrekken"
                  >
                    <Trash2 className="w-3 h-3" />
                    Intrekken
                  </button>
                </div>
                <p className="text-slate-800 mt-1">{tekst}</p>
              </li>
            )
          })}
        </ul>
      )}

      {formOpen ? (
        <div className="rounded-lg border border-slate-200 p-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Regel</label>
            <select
              value={regelCode}
              onChange={(e) => setRegelCode(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-sm bg-white"
            >
              <option value="">— kies een regel —</option>
              {regels.map((r) => (
                <option key={r.code} value={r.code} disabled={bezet.has(r.code)}>
                  {r.code} — {r.titel}
                  {!r.actief ? ' (staat uit)' : ''}
                  {bezet.has(r.code) ? ' — al toegekend' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Ernst</label>
            <div className="flex gap-2">
              {(['info', 'waarschuwing', 'overtreding'] as const).map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setErnst(e)}
                  className={`text-xs px-3 py-1.5 rounded-full ${
                    ernst === e ? ERNST_BADGE[e] + ' ring-1 ring-current' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {ERNST_LABEL[e]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Wat klopt hier niet?
            </label>
            <textarea
              value={toelichting}
              onChange={(e) => setToelichting(e.target.value)}
              rows={3}
              placeholder="Bijvoorbeeld: omgereden zonder aanleiding, of privé-rit die de check niet ving…"
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">
              Deze toelichting wordt als leermoment bewaard naast het signaal.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={opslaan}
              disabled={pending}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {pending ? 'Opslaan…' : 'Toekennen'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-xs px-3 py-1.5 rounded-md bg-slate-100 hover:bg-slate-200"
            >
              Annuleren
            </button>
          </div>
        </div>
      ) : (
        bevindingen.length === 0 && (
          <p className="text-xs text-slate-500">
            Ziet de compliance-check iets over het hoofd? Ken de afwijking hier zelf toe — hij
            blijft staan bij volgende checks.
          </p>
        )
      )}
    </section>
  )
}
