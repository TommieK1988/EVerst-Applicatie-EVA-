'use client'

import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { refreshRdwAction } from '@/app/(platform)/wagenpark/actions/voertuigen'

export default function RefreshRdwButton({
  voertuigId,
  kenteken,
}: {
  voertuigId: string
  kenteken: string
}) {
  const [pending, startTransition] = useTransition()

  function onClick() {
    startTransition(async () => {
      const res = await refreshRdwAction(voertuigId, kenteken)
      if (res.ok) toast.success('RDW-data bijgewerkt')
      else toast.error(res.error ?? 'Fout')
    })
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded border bg-white hover:bg-slate-50 disabled:opacity-50"
    >
      <RefreshCw className={`w-3 h-3 ${pending ? 'animate-spin' : ''}`} />
      {pending ? 'Bezig…' : 'Refresh RDW'}
    </button>
  )
}
