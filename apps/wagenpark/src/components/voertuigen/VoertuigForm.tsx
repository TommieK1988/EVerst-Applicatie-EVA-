'use client'

import { useFormState, useFormStatus } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import toast from 'react-hot-toast'
import { createVoertuigAction, type VoertuigFormState } from '@/app/actions/voertuigen'

const voertuigTypes = [
  'werkbus',
  'bestelwagen',
  'station_mini_suv',
  'station_midi_suv',
  'personenauto',
  'aanhanger',
  'overig',
]

export default function VoertuigForm() {
  const [state, formAction] = useFormState<VoertuigFormState | null, FormData>(
    createVoertuigAction,
    null,
  )
  const router = useRouter()

  useEffect(() => {
    if (state?.ok && state.voertuig_id) {
      toast.success('Voertuig aangemaakt — RDW-gegevens opgehaald')
      router.push(`/voertuigen/${state.voertuig_id}`)
    } else if (state && !state.ok) {
      toast.error(state.error ?? 'Aanmaken mislukt')
    }
  }, [state, router])

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="kenteken">
          Kenteken <span className="text-red-500">*</span>
        </label>
        <input
          id="kenteken"
          name="kenteken"
          type="text"
          required
          placeholder="P-931-XN"
          className="w-full rounded-md border px-3 py-2 text-sm font-mono uppercase"
        />
        <p className="text-xs text-slate-500 mt-1">
          Hoofdletters, met of zonder streepjes. RDW wordt automatisch geraadpleegd
          (merk, model, brandstof, APK).
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="type">Type</label>
        <select id="type" name="type" className="w-full rounded-md border px-3 py-2 text-sm">
          <option value="">— kies (optioneel) —</option>
          {voertuigTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="kleur">Kleur</label>
        <input id="kleur" name="kleur" type="text" className="w-full rounded-md border px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="opmerkingen">Opmerkingen</label>
        <textarea
          id="opmerkingen"
          name="opmerkingen"
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <p className="text-xs text-slate-500">
        <strong>Bijtelling</strong> wordt beheerd op bestuurder-niveau, niet per voertuig.
        Ga na aanmaak naar <em>Bestuurders</em> om te zetten.
      </p>

      <SubmitButton />
    </form>
  )
}

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:opacity-50"
    >
      {pending ? 'Bezig met aanmaken…' : 'Voertuig aanmaken'}
    </button>
  )
}
