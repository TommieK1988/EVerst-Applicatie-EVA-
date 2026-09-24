'use client'

/**
 * De vervolgstap van de bon, als één knop.
 *
 * Eén knop en niet een rij: er is per stand precies één stap die vanzelf spreekt ("het werk is
 * begonnen", "het is klaar"). Alles waar een keuze in zit staat eronder, in `BonActies`.
 */

import React, { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { zetVolgendeStap } from '@/lib/dossiers/servicedesk-acties'
import type { StatusStap } from './status-stappen'

export default function StatusStapKnop({ dossierId, stap, blok }: {
  dossierId: string
  stap: StatusStap
  /**
   * Volle breedte, zonder de uitleg ernaast. Voor de knoppenkolom op de Bon-pagina, waar de
   * uitleg onder elke knop staat en alle knoppen even breed horen te zijn.
   */
  blok?: boolean
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()

  const knop = (
    <Button
      variant="primary"
      disabled={bezig}
      loading={bezig}
      className={blok ? 'w-full justify-center' : undefined}
      onClick={() => start(async () => {
        // De server bepaalt zelf welke stap volgt; dit scherm kan verouderd zijn.
        const res = await zetVolgendeStap(dossierId)
        if (!res.ok) { toast.error(res.error); return }
        // Alleen bevestigen wát er is gebeurd. De nieuwe stand staat een seconde later op het
        // scherm zelf; die hier in woorden herhalen vraagt om twee teksten die uit elkaar lopen.
        toast.success(res.label)
        router.refresh()
      })}
    >
      {stap.label}
    </Button>
  )

  if (blok) return knop

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, color: 'var(--fg-muted)', maxWidth: 200, lineHeight: 1.3 }}>
        {stap.uitleg}
      </span>
      {knop}
    </div>
  )
}
