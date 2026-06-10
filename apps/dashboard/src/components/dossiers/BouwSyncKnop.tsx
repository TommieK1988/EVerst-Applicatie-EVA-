'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { syncProjects } from '@/lib/bouw7/sync'
import { IconSync } from '@/components/eva/Icons'

function relatieveTijd(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'Zojuist'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min geleden`
  const uur = Math.floor(min / 60)
  if (uur < 24) return `${uur} uur geleden`
  const dag = Math.floor(uur / 24)
  return `${dag} dag${dag === 1 ? '' : 'en'} geleden`
}

type Props = { lasteSyncIso: string | null }

export function BouwSyncKnop({ lasteSyncIso }: Props) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [, setTick] = useState(0)

  // Herbereken relatieve tijd elke minuut
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleSync() {
    setBezig(true)
    setFout(null)
    try {
      await syncProjects()
      router.refresh()
    } catch (e: unknown) {
      setFout((e as Error)?.message ?? 'Sync mislukt')
    } finally {
      setBezig(false)
    }
  }

  const tijdLabel = lasteSyncIso
    ? `Sync: ${relatieveTijd(lasteSyncIso)}`
    : 'Nooit gesynchroniseerd'

  return (
    <div className="flex items-center gap-2">
      {fout ? (
        <span
          className="max-w-[160px] truncate text-xs text-destructive"
          title={fout}
        >
          Sync fout
        </span>
      ) : (
        <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:block">
          {tijdLabel}
        </span>
      )}
      <button
        onClick={handleSync}
        disabled={bezig}
        title="Synchroniseer met Bouw7"
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
      >
        <span
          className={bezig ? 'animate-spin' : ''}
          style={{ display: 'inline-flex' }}
        >
          <IconSync size={14} />
        </span>
        <span className="hidden sm:inline">{bezig ? 'Bezig…' : 'Sync'}</span>
      </button>
    </div>
  )
}
