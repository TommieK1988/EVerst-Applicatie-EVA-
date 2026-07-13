'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { koppelMedewerkerAanBestuurderAction } from '@/app/(platform)/wagenpark/actions/bestuurders'

export type MedewerkerOptie = {
  id: string
  naam: string
  email: string | null
}

export default function MedewerkerKoppeling({
  ulu_user_id,
  gekoppeld,
  beschikbaar,
  suggestie_id,
  fout,
}: {
  ulu_user_id: number
  /** Huidige gekoppelde medewerker, of null. */
  gekoppeld: MedewerkerOptie | null
  /** Actieve medewerkers die nog niet aan een bestuurder gekoppeld zijn. */
  beschikbaar: MedewerkerOptie[]
  /** Voorselectie op basis van e-mailmatch. */
  suggestie_id: string | null
  /** Foutmelding als de wagenpark-database niet bereikbaar is. */
  fout: string | null
}) {
  const [selectie, setSelectie] = useState(suggestie_id ?? '')
  const [isPending, startTransition] = useTransition()

  function koppel() {
    if (!selectie) return
    startTransition(async () => {
      const result = await koppelMedewerkerAanBestuurderAction(ulu_user_id, selectie)
      if (!result.ok) { toast.error(result.error ?? 'Koppelen mislukt'); return }
      toast.success('Medewerker gekoppeld')
    })
  }

  function ontkoppel() {
    startTransition(async () => {
      const result = await koppelMedewerkerAanBestuurderAction(ulu_user_id, null)
      if (!result.ok) { toast.error(result.error ?? 'Ontkoppelen mislukt'); return }
      toast.success('Medewerker ontkoppeld')
    })
  }

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-700">Gekoppelde medewerker</span>
        {gekoppeld && (
          <button
            type="button"
            onClick={ontkoppel}
            disabled={isPending}
            className="text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50"
          >
            Ontkoppelen
          </button>
        )}
      </div>

      {fout ? (
        <p className="text-xs text-slate-500">Medewerker-gegevens niet beschikbaar: {fout}</p>
      ) : gekoppeld ? (
        <div className="flex items-center gap-2">
          <Link
            href={`/medewerkers/${gekoppeld.id}`}
            className="text-sm font-medium text-green-700 hover:underline"
          >
            {gekoppeld.naam || `Medewerker ${gekoppeld.id}`}
          </Link>
          {gekoppeld.email && <span className="text-xs text-slate-400">{gekoppeld.email}</span>}
        </div>
      ) : (
        <div>
          <p className="text-xs text-slate-500 mb-2">
            Koppel deze bestuurder aan een medewerker — dezelfde persoon — zodat ritten en
            compliance aan de medewerker hangen.
          </p>
          <div className="flex gap-2">
            <select
              value={selectie}
              onChange={(e) => setSelectie(e.target.value)}
              className="flex-1 rounded border px-2 py-1.5 text-sm"
            >
              <option value="">— Selecteer medewerker —</option>
              {beschikbaar.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.naam || `#${m.id}`}
                  {m.email ? ` — ${m.email}` : ''}
                  {m.id === suggestie_id ? '  (e-mailmatch)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={koppel}
              disabled={!selectie || isPending}
              className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm hover:bg-green-700 disabled:opacity-50"
            >
              Koppelen
            </button>
          </div>
          {suggestie_id && selectie === suggestie_id && (
            <p className="text-xs text-green-700 mt-1.5">
              Voorgesteld op basis van overeenkomend e-mailadres.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
