'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateVoertuigFieldsAction } from '@/app/actions/voertuigen'

type Props = {
  id: string
  kenteken: string
  merk: string | null
  model: string | null
  type: string | null
  kleur: string | null
  carrosserietype: string | null
  bouwjaar: number | null
  brandstof: string | null
  opmerkingen: string | null
}

const voertuigTypes = [
  'werkbus',
  'bestelwagen',
  'station_mini_suv',
  'station_midi_suv',
  'personenauto',
  'aanhanger',
  'overig',
]

export default function VoertuigEditForm(props: Props) {
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await updateVoertuigFieldsAction(props.id, fd)
      if (res.ok) toast.success('Opgeslagen')
      else toast.error(res.error ?? 'Fout')
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 text-sm">
      {/* Read-only ULU-data */}
      <div className="bg-slate-50 rounded p-3 text-xs text-slate-500 space-y-1">
        <div><span className="font-medium">Kenteken:</span> <span className="font-mono">{props.kenteken}</span></div>
        <div><span className="font-medium">Merk:</span> {props.merk ?? '—'} (uit RDW/ULU)</div>
        <div><span className="font-medium">Model:</span> {props.model ?? '—'} (uit RDW/ULU)</div>
        <div><span className="font-medium">Brandstof:</span> {props.brandstof ?? '—'} (uit RDW)</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="type">Type</label>
          <select id="type" name="type" defaultValue={props.type ?? ''} className="w-full rounded border px-2 py-1.5 text-sm">
            <option value="">—</option>
            {voertuigTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="kleur">Kleur</label>
          <input id="kleur" name="kleur" defaultValue={props.kleur ?? ''} className="w-full rounded border px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="carrosserietype">
            Carrosserie (RDW)
          </label>
          <input
            id="carrosserietype"
            name="carrosserietype"
            defaultValue={props.carrosserietype ?? ''}
            placeholder="stationwagen, gesloten opbouw..."
            className="w-full rounded border px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1" htmlFor="bouwjaar">Bouwjaar</label>
          <input id="bouwjaar" name="bouwjaar" type="number" defaultValue={props.bouwjaar ?? ''} className="w-full rounded border px-2 py-1.5 text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium mb-1" htmlFor="opmerkingen">Opmerkingen</label>
        <textarea id="opmerkingen" name="opmerkingen" defaultValue={props.opmerkingen ?? ''} rows={3} className="w-full rounded border px-2 py-1.5 text-sm" />
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
