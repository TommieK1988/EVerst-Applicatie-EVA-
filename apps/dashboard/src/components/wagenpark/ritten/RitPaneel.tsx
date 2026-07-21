'use client'

import React from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import {
  Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerBody,
} from '@/components/ui'
import BevindingRij from '@/components/wagenpark/bevindingen/BevindingRij'
import RitTypeToggle from '@/components/wagenpark/ritten/RitTypeToggle'
import { formatDatumMetDag, formatKm } from '@/lib/wagenpark/utils'

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

function tijd(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

export default function RitPaneel({
  rit,
  onClose,
}: {
  rit: Rit | null
  onClose: () => void
}) {
  const bevindingen = rit?.bevindingen ?? []

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

              {/* Bevindingen */}
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Signalen ({bevindingen.length})
                </h3>
                {bevindingen.length === 0 ? (
                  <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2.5 text-sm text-green-800">
                    <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    Geen afwijkingen op deze rit.
                  </div>
                ) : (
                  <div className="rounded-lg border divide-y -mx-2">
                    {bevindingen.map((b) => (
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
