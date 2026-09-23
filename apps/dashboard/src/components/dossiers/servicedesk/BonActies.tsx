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
import InplannenModal from './InplannenModal'
import BestelVenster from './BestelVenster'

export default function BonActies({
  dossierId, heeftCalculatie, mandaatBedrag, verhogingLoopt, kostengroep, calcProjectId, alleenLezen,
}: {
  dossierId: string
  heeftCalculatie: boolean
  mandaatBedrag: number | null
  /** De bon staat op "Mandaat verhoging aangevraagd": dan is toekennen de vervolgstap. */
  verhogingLoopt: boolean
  /** De vaste kostengroep van de bon; alles wat hier wordt uitgezet of ingepland landt erop. */
  kostengroep: { code: string; naam: string } | null
  /** Gekoppelde calculatie; bepaalt in welke werkbegroting de bestelregels terechtkomen. */
  calcProjectId: string | null
  alleenLezen: boolean
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  const [mandaatOpen, setMandaatOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [bestelOpen, setBestelOpen] = useState(false)

  const acties = bonActies({
    heeftCalculatie,
    heeftMandaat: mandaatBedrag != null && mandaatBedrag > 0,
    verhogingLoopt,
    alleenLezen,
  })

  function doe(sleutel: BonActieSleutel) {
    switch (sleutel) {
      // Een eigen venster in plaats van een sprong naar de werkbegroting: dat grid is gebouwd
      // voor een opdracht van drie ton, terwijl een bon meestal één regel heeft. Onder water
      // loopt het langs dezelfde weg naar Bouw7 — zie BestelVenster.
      case 'onderaannemer':
        setBestelOpen(true)
        return
      // Niet naar de planning springen maar hier inplannen. Daar moest je anders alsnog het
      // juiste bord, de juiste week en de juiste rij zoeken voordat je kon doen waarvoor je klikte.
      case 'inplannen':
        setPlanOpen(true)
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

      {bestelOpen && (
        <BestelVenster
          dossierId={dossierId}
          calcProjectId={calcProjectId}
          kostengroep={kostengroep}
          onSluit={() => setBestelOpen(false)}
          onKlaar={() => router.refresh()}
        />
      )}

      {planOpen && (
        <InplannenModal
          dossierId={dossierId}
          regieCode={kostengroep?.code ?? null}
          onSluit={() => setPlanOpen(false)}
          onKlaar={() => router.refresh()}
        />
      )}

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
