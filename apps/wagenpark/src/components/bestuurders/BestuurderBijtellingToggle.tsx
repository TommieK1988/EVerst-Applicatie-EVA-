'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { toggleBestuurderBijtellingAction } from '@/app/actions/bestuurders'

export default function BestuurderBijtellingToggle({
  userId,
  initial,
  naam,
}: {
  userId: number
  initial: boolean
  naam: string
}) {
  const [waarde, setWaarde] = useState(initial)
  const [pending, startTransition] = useTransition()

  function onClick() {
    const nieuw = !waarde
    setWaarde(nieuw)
    startTransition(async () => {
      try {
        await toggleBestuurderBijtellingAction(userId, nieuw)
        toast.success(`${naam}: bijtelling ${nieuw ? 'aan' : 'uit'}`, { id: 'bb-' + userId })
      } catch (err) {
        setWaarde(!nieuw)
        toast.error(err instanceof Error ? err.message : 'Fout')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        waarde
          ? 'text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50'
          : 'text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-50'
      }
      title="Klik om bijtelling te togglen"
    >
      {waarde ? 'Ja' : 'Nee'}
    </button>
  )
}
