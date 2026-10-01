'use client'

/**
 * Een bericht aan een bestaand dossier koppelen, met de bevestiging die erbij hoort.
 *
 * Losgetrokken van het behandelscherm omdat dat bestand anders over de 800 regels
 * gaat. De tekst van de bevestiging is het punt van deze functie: bij meerwerk
 * verandert er iets op het dossier zelf, en dat hoort te staan vóór je klikt en niet
 * pas in de melding achteraf.
 */

import React from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { useDialogen } from '@/components/ui'
import { dossierHref } from '@/lib/dossiers/href'
import { koppelBerichtAanDossier } from '@/lib/mailintake/actions'

export type KoppelSoort = 'gekoppeld_bestaand' | 'meerwerk' | 'offerte_gewonnen'

export function useKoppelen(berichtId: string, zetBezig: (v: boolean) => void) {
  const { bevestig } = useDialogen()
  const router = useRouter()

  return React.useCallback(
      async (dossierId: string, soort: KoppelSoort, label: string) => {
      // Bij meerwerk verandert er iets op het dossier zelf; dat hoort in de
      // bevestiging te staan en niet pas in de toast achteraf.
      const ok = await bevestig({
        titel: label,
        omschrijving: soort === 'meerwerk' ? (
          <span className="block">
            <span className="block">
              Het bericht wordt aan dit dossier gekoppeld en verdwijnt uit je postvak.
            </span>
            <span className="mt-2 block">
              Staat er precies één meerwerkregel open, dan zet EVA die op akkoord — met een
              bewakingscode naar Bouw7. Staat er geen of staan er meerdere, dan krijgt de
              projectleider een actie; EVA maakt zelf nooit een meerwerkregel aan.
            </span>
          </span>
        ) : 'Het bericht wordt aan dit dossier gekoppeld en verdwijnt uit je postvak.',
        bevestigLabel: 'Koppelen',
      })
      if (!ok) return
      zetBezig(true)
      try {
        const res = await koppelBerichtAanDossier(berichtId, dossierId, soort)
        if (!res.ok) { toast.error(res.error ?? 'Koppelen mislukt'); return }
        toast.success(res.melding ?? 'Gekoppeld')
        router.push('/mailintake')
      } finally {
        zetBezig(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [berichtId],
  )
}
