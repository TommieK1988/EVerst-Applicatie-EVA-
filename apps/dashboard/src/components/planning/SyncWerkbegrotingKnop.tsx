'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { syncWerkbegrotingVanEvertsCalc } from '@/app/(platform)/planning/actions'

export default function SyncWerkbegrotingKnop({ dossier_id }: { dossier_id: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [pending, setPending] = useState(false)

  async function handleSync() {
    setPending(true)
    const result = await syncWerkbegrotingVanEvertsCalc(dossier_id)
    setPending(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    if (result.ongematch.length > 0) {
      toast(`${result.gematch} uursoort(en) gesynchroniseerd. Niet gematcht: ${result.ongematch.join(', ')}`, { icon: '⚠️' })
    } else {
      toast.success(`Werkbegroting gesynchroniseerd (${result.gematch} uursoort(en))`)
    }

    startTransition(() => router.refresh())
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSync}
        loading={pending}
      >
        {pending ? 'Synchroniseren…' : '↻ Sync werkbegroting vanuit everts-calc'}
      </Button>
    </div>
  )
}
