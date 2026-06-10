'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateVoertuigStatusAction } from '@/app/(platform)/wagenpark/actions/voertuigen'

const opties = [
  { waarde: 'actief',        label: 'Actief',        kleur: 'bg-green-100 text-green-700' },
  { waarde: 'in_onderhoud',  label: 'Onderhoud',     kleur: 'bg-amber-100 text-amber-800' },
  { waarde: 'uit_dienst',    label: 'Uit dienst',    kleur: 'bg-slate-200 text-slate-700' },
  { waarde: 'verkocht',      label: 'Verkocht',      kleur: 'bg-slate-200 text-slate-500' },
]

export default function VoertuigStatusSelect({
  id,
  initial,
}: {
  id: string
  initial: string
}) {
  const [waarde, setWaarde] = useState(initial)
  const [pending, startTransition] = useTransition()

  function onChange(nieuw: string) {
    const oud = waarde
    setWaarde(nieuw)
    startTransition(async () => {
      try {
        await updateVoertuigStatusAction(id, nieuw)
        toast.success('Status bijgewerkt', { id: 'stat-' + id })
      } catch (err) {
        setWaarde(oud)
        toast.error(err instanceof Error ? err.message : 'Fout')
      }
    })
  }

  const huidig = opties.find((o) => o.waarde === waarde) ?? opties[0]
  return (
    <select
      value={waarde}
      onChange={(e) => onChange(e.target.value)}
      disabled={pending}
      className={`text-xs px-2 py-0.5 rounded-full border-0 ${huidig.kleur} disabled:opacity-50 cursor-pointer`}
    >
      {opties.map((o) => (
        <option key={o.waarde} value={o.waarde}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
