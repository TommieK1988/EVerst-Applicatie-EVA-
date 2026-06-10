'use client'

import { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateRitTypeAction } from '@/app/(platform)/wagenpark/actions/trip-override'

/**
 * Inline toggle tussen zakelijk / privé voor een rit.
 * Klik op de badge → wissel. Dubbelklik (of knop) → reset naar automatisch.
 */
export default function RitTypeToggle({
  tripId,
  initialType,
  initialHandmatig,
  showResetBij = true,
}: {
  tripId: string
  initialType: 'zakelijk' | 'prive' | null
  initialHandmatig: boolean
  showResetBij?: boolean
}) {
  const [type, setType] = useState(initialType)
  const [handmatig, setHandmatig] = useState(initialHandmatig)
  const [pending, startTransition] = useTransition()

  function toggle() {
    const nieuw = type === 'zakelijk' ? 'prive' : 'zakelijk'
    const vorigType = type
    const vorigHandmatig = handmatig
    setType(nieuw)
    setHandmatig(true)
    startTransition(async () => {
      const res = await updateRitTypeAction(tripId, nieuw)
      if (res.ok) {
        toast.success(`Rit → ${nieuw}`, { id: 'rtt-' + tripId })
      } else {
        setType(vorigType)
        setHandmatig(vorigHandmatig)
        toast.error(res.error ?? 'Fout')
      }
    })
  }

  function reset() {
    const vorigType = type
    const vorigHandmatig = handmatig
    setHandmatig(false)
    startTransition(async () => {
      const res = await updateRitTypeAction(tripId, null)
      if (res.ok) {
        toast.success('Reset naar automatisch', { id: 'rtt-' + tripId })
        // We weten nu de echte berekende waarde niet hier — tonen gewoon het laatste
      } else {
        setHandmatig(vorigHandmatig)
        toast.error(res.error ?? 'Fout')
      }
    })
  }

  const cls = type === 'prive'
    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
    : 'bg-green-100 text-green-700 hover:bg-green-200'

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className={`text-xs px-2 py-0.5 rounded-full ${cls} disabled:opacity-50`}
        title="Klik om te wisselen tussen zakelijk/privé"
      >
        {type ?? '—'}
        {handmatig && <span className="ml-1 text-[9px] opacity-70">●</span>}
      </button>
      {showResetBij && handmatig && (
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="text-[10px] text-slate-400 hover:text-slate-700 underline"
          title="Reset naar automatische classificatie (dag + tijd)"
        >
          reset
        </button>
      )}
    </span>
  )
}
