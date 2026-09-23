'use client'

/**
 * "Wat wil je doen?" — de vier kernhandelingen van een servicedeskbon, bovenaan de Bon-pagina.
 *
 * Deze vier zijn het werk: uitbesteden, zelf inplannen, offreren, of meer mandaat vragen. Ze
 * staan er altijd en op dezelfde plek, zodat je ze niet per status hoeft te zoeken. Welke nu kan
 * en waarom staat in `bon-acties.ts`; dit bestand gaat alleen over hoe ze eruitzien en wat ze
 * aanroepen.
 */

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { maakOfferteVoorServicedesk, offerteAkkoordServicedesk } from '@/lib/dossiers/actions'
import { bonActies, type BonActieSleutel } from './bon-acties'
import MandaatVerhogingModal from './MandaatVerhogingModal'

export default function BonActies({
  dossierId, heeftCalculatie, mandaatBedrag, verhogingLoopt, alleenLezen,
}: {
  dossierId: string
  heeftCalculatie: boolean
  mandaatBedrag: number | null
  /** De bon staat op "Mandaat verhoging aangevraagd": dan is toekennen de vervolgstap. */
  verhogingLoopt: boolean
  alleenLezen: boolean
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  const [mandaatOpen, setMandaatOpen] = useState(false)

  const acties = bonActies({
    heeftCalculatie,
    heeftMandaat: mandaatBedrag != null && mandaatBedrag > 0,
    verhogingLoopt,
    alleenLezen,
  })

  function doe(sleutel: BonActieSleutel) {
    switch (sleutel) {
      // Bestellen loopt nu nog via de werkbegroting: daar stel je de regels samen waar de
      // onderaannemersopdracht uit ontstaat. Die staat niet meer in de navigatie van een bon —
      // begroten kost op een bon van een paar honderd euro meer tijd dan het werk zelf — maar
      // het scherm blijft op zijn eigen adres bestaan zolang deze knop er nog heen wijst.
      case 'onderaannemer':
        router.push(`/servicedesk/${dossierId}/werkbegroting`)
        return
      case 'inplannen':
        router.push(`/servicedesk/${dossierId}/uitvoering?deel=planning`)
        return
      case 'mandaatverhoging':
        setMandaatOpen(true)
        return
      case 'offerte':
        start(async () => {
          if (heeftCalculatie) {
            const r = await offerteAkkoordServicedesk(dossierId)
            if (!r.ok) { toast.error(r.error); return }
            toast.success('Offerte op akkoord — de bon rekent nu af op aangenomen')
            router.refresh()
            return
          }
          const r = await maakOfferteVoorServicedesk(dossierId)
          if (!r.ok) { toast.error(r.error); return }
          router.push(`/servicedesk/${dossierId}/voorbereiding?deel=calculatie`)
          router.refresh()
        })
    }
  }

  return (
    <>
      <div style={{
        border: '1px solid var(--border)', borderRadius: 10,
        background: 'var(--bg-elev, #fff)', padding: '14px 16px', marginBottom: 20,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase',
          color: 'var(--fg-muted)', marginBottom: 12,
        }}>
          Wat wil je doen?
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {acties.map(a => (
            <div key={a.sleutel} style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 240 }}>
              <Button
                variant={a.primair ? 'primary' : 'secondary'}
                onClick={() => doe(a.sleutel)}
                disabled={!a.kan || bezig}
                loading={bezig && a.sleutel === 'offerte'}
              >
                {a.label}
              </Button>
              <span style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--fg-muted)' }}>
                {a.uitleg}
              </span>
            </div>
          ))}
        </div>
      </div>

      {mandaatOpen && (
        <MandaatVerhogingModal
          dossierId={dossierId}
          huidigMandaat={mandaatBedrag}
          modus={verhogingLoopt ? 'toekennen' : 'aanvragen'}
          onSluit={() => setMandaatOpen(false)}
          onKlaar={() => router.refresh()}
        />
      )}
    </>
  )
}
