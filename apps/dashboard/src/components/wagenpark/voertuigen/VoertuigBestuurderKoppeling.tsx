'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { setVoertuigBestuurderAction } from '@/app/(platform)/wagenpark/actions/koppelingen'

type Huidige = {
  id: string
  ulu_user_id: number
  volledige_naam: string | null
  start_datum: string
} | null

export default function VoertuigBestuurderKoppeling({
  voertuigId,
  huidige,
  beschikbaar,
}: {
  voertuigId: string
  huidige: Huidige
  beschikbaar: { id: number; volledige_naam: string | null }[]
}) {
  const [selected, setSelected] = useState<string>(
    huidige?.ulu_user_id ? String(huidige.ulu_user_id) : '',
  )
  const [pending, startTransition] = useTransition()

  function opslaan() {
    const uid = selected ? Number(selected) : null
    startTransition(async () => {
      const res = await setVoertuigBestuurderAction(voertuigId, uid)
      if (res.ok) {
        toast.success(uid ? 'Bestuurder gekoppeld' : 'Koppeling verwijderd')
      } else {
        toast.error(res.error ?? 'Fout')
      }
    })
  }

  function ontkoppel() {
    setSelected('')
    startTransition(async () => {
      const res = await setVoertuigBestuurderAction(voertuigId, null)
      if (res.ok) toast.success('Ontkoppeld')
      else toast.error(res.error ?? 'Fout')
    })
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="text-xs text-slate-500">
        {huidige ? (
          <>
            Huidige bestuurder sinds <strong>{huidige.start_datum}</strong>
          </>
        ) : (
          <>Geen actieve koppeling</>
        )}
      </div>

      <div className="flex gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={pending}
          className="flex-1 rounded border px-2 py-1.5 text-sm"
        >
          <option value="">— kies bestuurder —</option>
          {beschikbaar.map((b) => (
            <option key={b.id} value={b.id}>
              {b.volledige_naam ?? `ULU #${b.id}`}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={opslaan}
          disabled={pending || !selected}
          className="px-3 py-1.5 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {pending ? '…' : 'Koppel'}
        </button>
      </div>

      {huidige && (
        <button
          type="button"
          onClick={ontkoppel}
          disabled={pending}
          className="text-xs text-red-700 hover:underline disabled:opacity-50"
        >
          Ontkoppel huidige bestuurder
        </button>
      )}
    </div>
  )
}
