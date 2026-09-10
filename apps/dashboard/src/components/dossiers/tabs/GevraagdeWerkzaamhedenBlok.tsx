'use client'

/**
 * Het blok "Gevraagde werkzaamheden" op het Informatie-tabblad.
 *
 * Bevat de scope-samenvatting: wat er in deze aanvraag aan werk gevraagd wordt,
 * opgesteld uit de mail en alle bijlagen. Dit is wat een calculator als eerste
 * leest, dus staat het bovenaan en niet tussen de notities.
 *
 * "Opnieuw samenvatten" overschrijft nooit meteen: het voorstel komt eerst naast
 * de huidige tekst te staan. Wie hier iets heeft aangescherpt, mag dat niet
 * kwijtraken aan een knop.
 */

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { Button, InklapbareCard, BulletTextarea, useDialogen } from '@/components/ui'
import { bewaarWerkzaamheden, stelSamenvattingVoor } from '@/lib/dossiers/werkzaamheden-actions'

const klein = { fontSize: 12, color: 'var(--fg-muted)' } as const

export default function GevraagdeWerkzaamhedenBlok({
  dossierId,
  tekst,
  herkomst,
  bijgewerktOp,
  bewerkbaar,
}: {
  dossierId: string
  tekst: string | null
  herkomst: string | null
  bijgewerktOp: string | null
  bewerkbaar: boolean
}) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [waarde, setWaarde] = useState(tekst ?? '')
  const [bezig, setBezig] = useState(false)

  // De opgeslagen tekst, om te bepalen of er iets te bewaren valt.
  const [opgeslagen, setOpgeslagen] = useState(tekst ?? '')
  const gewijzigd = waarde.trim() !== opgeslagen.trim()

  async function bewaar() {
    if (!gewijzigd) return
    setBezig(true)
    try {
      const res = await bewaarWerkzaamheden(dossierId, waarde)
      if (!res.ok) { toast.error(res.error ?? 'Opslaan mislukt'); return }
      setOpgeslagen(waarde)
      toast.success('Opgeslagen')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  async function opnieuw() {
    setBezig(true)
    try {
      const res = await stelSamenvattingVoor(dossierId)
      if (!res.ok || !res.tekst) {
        toast.error(res.error ?? 'Samenvatten mislukt')
        return
      }

      // Stond er al iets, dan eerst oud en nieuw naast elkaar. Zonder deze stap
      // wist één klik het werk van een collega.
      if (opgeslagen.trim()) {
        const ok = await bevestig({
          titel: 'Nieuwe samenvatting overnemen?',
          omschrijving:
            `EVA heeft de dossierbestanden opnieuw gelezen.\n\n` +
            `── Nu ──\n${opgeslagen.trim()}\n\n` +
            `── Voorstel ──\n${res.tekst}\n\n` +
            (res.gemist?.length ? `Niet meegelezen: ${res.gemist.join(', ')}.\n\n` : '') +
            `Overnemen vervangt de huidige tekst.`,
          bevestigLabel: 'Overnemen',
          annuleerLabel: 'Laten staan',
        })
        if (!ok) return
      }

      const bewaard = await bewaarWerkzaamheden(dossierId, res.tekst, res.herkomst ?? null)
      if (!bewaard.ok) { toast.error(bewaard.error ?? 'Opslaan mislukt'); return }
      setWaarde(res.tekst)
      setOpgeslagen(res.tekst)
      toast.success('Samenvatting bijgewerkt')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Samenvatten mislukt')
    } finally {
      setBezig(false)
    }
  }

  const leeg = !waarde.trim()

  return (
    <InklapbareCard
      titel="Gevraagde werkzaamheden"
      altijdOpen
      headerActies={bewerkbaar ? (
        <div style={{ display: 'flex', gap: 6 }}>
          {gewijzigd && (
            <Button variant="outline" onClick={bewaar} disabled={bezig}>Opslaan</Button>
          )}
          <Button variant="ghost" onClick={opnieuw} disabled={bezig}>
            {bezig ? 'Bezig…' : 'Opnieuw samenvatten'}
          </Button>
        </div>
      ) : undefined}
    >
      {bewerkbaar ? (
        <BulletTextarea
          value={waarde}
          onChange={setWaarde}
          onBlur={bewaar}
          minRows={4}
          maxRows={16}
          toonKnop
          placeholder="Nog geen samenvatting. Druk op “Opnieuw samenvatten” om EVA de dossierbestanden te laten lezen, of typ hem zelf."
        />
      ) : leeg ? (
        <p style={klein}>Nog geen samenvatting.</p>
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.55 }}>{waarde}</div>
      )}

      {(herkomst || bijgewerktOp) && (
        <p style={{ ...klein, marginTop: 8 }}>
          {herkomst}
          {bijgewerktOp && (
            <> {' · '}{new Date(bijgewerktOp).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })}</>
          )}
        </p>
      )}
    </InklapbareCard>
  )
}
