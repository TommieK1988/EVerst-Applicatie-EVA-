'use client'

/**
 * De scope-samenvatting: wát wordt er gevraagd.
 *
 * Staat boven de losse velden, want dit is waar een calculator als eerste naar
 * kijkt. De tekst is een voorstel; wie hem bijschaaft slaat dát op bij het
 * aanmaken. De tussentijdse bewaring bij `onBlur` is er zodat een aanscherping
 * niet verdwijnt als iemand het scherm verlaat zonder een dossier te maken.
 *
 * De waarde zelf leeft bij het behandelscherm -- die gaat mee naar `maakAanvraag`.
 * Alleen het opnieuw laten samenvatten en het bewaren horen hier.
 */

import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Button, BulletTextarea, useDialogen } from '@/components/ui'
import { hervatSamenvatting, bewaarSamenvatting } from '@/lib/mailintake/actions'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const

export default function WerkzaamhedenBlok({
  berichtId, opgeslagen, bronnen, gemist, waarde, opWijzig, bewerkbaar,
}: {
  berichtId: string
  /** Wat er bij het bericht staat; bepaalt of `onBlur` iets te bewaren heeft. */
  opgeslagen: string | null
  bronnen: string[] | null
  gemist: string[] | null
  waarde: string
  opWijzig: (tekst: string) => void
  bewerkbaar: boolean
}) {
  const { bevestig } = useDialogen()
  const [bezig, setBezig] = useState(false)

  async function opnieuwSamenvatten() {
    // Stond er al tekst, dan is die mogelijk met de hand aangescherpt. Niet zomaar weg.
    if (waarde.trim()) {
      const ok = await bevestig({
        titel: 'Samenvatting opnieuw opstellen?',
        omschrijving: 'De huidige tekst wordt vervangen door een nieuwe samenvatting uit de mail en de bijlagen.',
        bevestigLabel: 'Opnieuw samenvatten',
      })
      if (!ok) return
    }
    setBezig(true)
    try {
      const res = await hervatSamenvatting(berichtId)
      if (!res.ok) { toast.error(res.error ?? 'Samenvatten mislukt'); return }
      opWijzig(res.tekst ?? '')
      toast.success('Samenvatting bijgewerkt')
    } finally {
      setBezig(false)
    }
  }

  /** Bewaart een handmatige aanscherping alvast bij het bericht. */
  async function bewaren() {
    if ((opgeslagen ?? '') === waarde) return
    await bewaarSamenvatting(berichtId, waarde).catch(() => {})
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={klein}>Gevraagde werkzaamheden</span>
        {bewerkbaar && (
          <Button variant="ghost" onClick={opnieuwSamenvatten} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Opnieuw samenvatten'}
          </Button>
        )}
      </div>
      <BulletTextarea
        value={waarde}
        onChange={opWijzig}
        onBlur={bewaren}
        minRows={6}
        maxRows={14}
        toonKnop={bewerkbaar}
        disabled={!bewerkbaar}
        placeholder="Nog geen samenvatting opgesteld."
      />
      {(bronnen?.length ?? 0) > 0 && (
        <span style={klein}>
          Uit de mail en {bronnen!.length} {bronnen!.length === 1 ? 'bijlage' : 'bijlagen'}.
        </span>
      )}
      {(gemist?.length ?? 0) > 0 && (
        <span style={{ ...klein, color: 'var(--wa-800, #92400e)' }}>
          Niet meegelezen: {gemist!.join(', ')}.
        </span>
      )}
    </div>
  )
}
