'use client'

import { useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateBestuurderFieldsAction } from '@/app/actions/bestuurders'

export default function BestuurderEditForm({
  userId,
  priveLimiet,
  zakelijkVerwacht,
  opmerkingen,
  werktijdStart,
  werktijdEind,
}: {
  userId: number
  priveLimiet: number | null
  zakelijkVerwacht: number | null
  opmerkingen: string | null
  werktijdStart: string | null
  werktijdEind: string | null
}) {
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateBestuurderFieldsAction(userId, fd)
      if (res.ok) toast.success('Opgeslagen')
      else toast.error(res.error ?? 'Fout')
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="prive_limiet_km_jaar">
            Privé-limiet (km/jaar)
          </label>
          <input
            id="prive_limiet_km_jaar"
            name="prive_limiet_km_jaar"
            type="number"
            defaultValue={priveLimiet ?? ''}
            placeholder="auto: 8000 met / 500 zonder bijtelling"
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="zakelijk_verwacht_km_jaar">
            Zakelijk verwacht (km/jaar)
          </label>
          <input
            id="zakelijk_verwacht_km_jaar"
            name="zakelijk_verwacht_km_jaar"
            type="number"
            defaultValue={zakelijkVerwacht ?? ''}
            placeholder="auto: 12000"
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2 border-t">
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="werktijd_start">
            Verwachte start werkdag
          </label>
          <input
            id="werktijd_start"
            name="werktijd_start"
            type="time"
            defaultValue={werktijdStart?.slice(0, 5) ?? ''}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
          <p className="text-[10px] text-slate-400 mt-1">R9 werkt alleen als ingevuld</p>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="werktijd_eind">
            Verwachte eind werkdag
          </label>
          <input
            id="werktijd_eind"
            name="werktijd_eind"
            type="time"
            defaultValue={werktijdEind?.slice(0, 5) ?? ''}
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
          <p className="text-[10px] text-slate-400 mt-1">R10 werkt alleen als ingevuld</p>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="opmerkingen">Opmerkingen</label>
        <textarea
          id="opmerkingen"
          name="opmerkingen"
          defaultValue={opmerkingen ?? ''}
          rows={3}
          className="w-full rounded border px-2 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="px-3 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        {pending ? 'Opslaan…' : 'Opslaan'}
      </button>
    </form>
  )
}
