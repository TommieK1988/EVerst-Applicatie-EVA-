'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { syncPlanningVoorDossier } from '@/app/(platform)/planning/actions'

export default function SyncBouw7PlanningKnop({
  dossier_id,
  laatstSync,
}: {
  dossier_id: string
  laatstSync?: string | null
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState(false)

  async function handleSync() {
    setPending(true)
    const result = await syncPlanningVoorDossier(dossier_id)
    setPending(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    if (result.fouten > 0) {
      toast(`${result.nieuw} activiteit(en) gesynchroniseerd, ${result.fouten} overgeslagen`, { icon: '⚠️' })
    } else {
      toast.success(`Planning gesynchroniseerd (${result.nieuw} activiteit(en) uit Bouw7)`)
    }

    startTransition(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="ghost" size="sm" onClick={handleSync} loading={pending}>
        {pending ? 'Synchroniseren…' : '↻ Sync planning uit Bouw7'}
      </Button>
      {laatstSync && (
        <span style={{ fontSize: 11, color: 'var(--neutral-500, #6b757c)' }}>
          laatst gesynct {new Date(laatstSync).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
        </span>
      )}
    </div>
  )
}
