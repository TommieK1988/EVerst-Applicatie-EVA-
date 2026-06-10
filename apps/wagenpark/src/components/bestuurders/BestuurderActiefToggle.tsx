'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { toggleBestuurderActiefAction } from '@/app/actions/bestuurders'

export default function BestuurderActiefToggle({
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
        await toggleBestuurderActiefAction(userId, nieuw)
        toast.success(`${naam}: ${nieuw ? 'actief' : 'gearchiveerd'}`, { id: 'act-' + userId })
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
          ? 'text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50'
          : 'text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300 disabled:opacity-50'
      }
    >
      {waarde ? 'Actief' : 'Archief'}
    </button>
  )
}
