'use client'

/**
 * De vervolgstap van de bon, als één knop in de balk.
 *
 * Eén knop en niet een rij: er is per stand precies één stap die vanzelf spreekt ("het werk is
 * begonnen", "het is klaar"). Alles waar een keuze in zit staat op de Bon-pagina.
 */

import React, { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { zetVolgendeStap } from '@/lib/dossiers/servicedesk-acties'
import type { StatusStap } from './status-stappen'

export default function StatusStapKnop({ dossierId, stap }: { dossierId: string; stap: StatusStap }) {
  const router = useRouter()
  const [bezig, start] = useTransition()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, color: 'var(--fg-muted)', maxWidth: 200, lineHeight: 1.3 }}>
        {stap.uitleg}
      </span>
      <Button
        variant="primary"
        disabled={bezig}
        loading={bezig}
        onClick={() => start(async () => {
          // De server bepaalt zelf welke stap volgt; dit scherm kan verouderd zijn.
          const res = await zetVolgendeStap(dossierId)
          if (!res.ok) { toast.error(res.error); return }
          // Alleen bevestigen wát er is gebeurd. De nieuwe kolom staat een seconde later in de
          // balk zelf; die hier in woorden herhalen vraagt om twee teksten die uit elkaar lopen.
          toast.success(res.label)
          router.refresh()
        })}
      >
        {stap.label}
      </Button>
    </div>
  )
}
