'use client'

import { useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'
import { runComplianceAction } from '@/app/(platform)/wagenpark/actions/compliance'

export default function RunComplianceButton() {
  const [pending, startTransition] = useTransition()

  function run() {
    startTransition(async () => {
      try {
        const res = await runComplianceAction()
        toast.success(`Compliance-check klaar — ${res.totaal} bevindingen`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Check mislukt')
      }
    })
  }

  return (
    <button
      onClick={run}
      disabled={pending}
      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-md text-sm hover:bg-slate-800 disabled:opacity-50"
    >
      <RefreshCw className={`w-4 h-4 ${pending ? 'animate-spin' : ''}`} />
      {pending ? 'Bezig…' : 'Draai compliance-check'}
    </button>
  )
}
