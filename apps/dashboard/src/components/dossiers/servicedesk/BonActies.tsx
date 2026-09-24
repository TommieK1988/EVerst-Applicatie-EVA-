'use client'

/**
 * "Wat wil je doen?" — de handelingen van een servicedeskbon, rechts in het Servicedesk-blok.
 *
 * Bovenaan de stap die uit de huidige stand volgt (Werk gestart, Gereedmelden, Kosten
 * controleren…): dat is een vaststelling, geen keuze, en daarom de primaire knop. Daaronder de
 * vier handelingen waar wél iets te kiezen valt: uitbesteden, zelf inplannen, offreren, of meer
 * mandaat vragen.
 *
 * Ze staan onder elkaar en altijd op dezelfde plek, zodat je ze niet per status hoeft te zoeken.
 * Welke nu kan en waarom staat in `bon-acties.ts`; dit bestand gaat alleen over hoe ze eruitzien
 * en wat ze aanroepen.
 */

import React, { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui'
import { maakOfferteVoorServicedesk, offerteAkkoordServicedesk } from '@/lib/dossiers/actions'
import { bonActies, type BonActieSleutel } from './bon-acties'
import { volgendeStap } from './status-stappen'
import type { ServicedeskSubstatus } from '../types'
import MandaatVerhogingModal from './MandaatVerhogingModal'
import InplannenModal from './InplannenModal'
import BestelVenster from './BestelVenster'
import StatusStapKnop from './StatusStapKnop'

export default function BonActies({
  dossierId, heeftCalculatie, mandaatBedrag, verhogingLoopt, kostengroep, calcProjectId,
  substatus, alleenLezen,
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
  /** De kolom waar de bon nu op staat; bepaalt de vaste vervolgstap bovenaan. */
  substatus: ServicedeskSubstatus | null
  alleenLezen: boolean
}) {
  const router = useRouter()
  const [bezig, start] = useTransition()
  const [mandaatOpen, setMandaatOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [bestelOpen, setBestelOpen] = useState(false)

  const stap = alleenLezen ? null : volgendeStap(substatus)

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
      <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-neutral-400">
        Wat wil je doen?
      </div>

      <div className="flex flex-col gap-2.5">
        {stap && (
          <div className="flex flex-col gap-1">
            <StatusStapKnop dossierId={dossierId} stap={stap} blok />
            <span className="text-[11px] leading-snug text-neutral-500">
              De vervolgstap die uit de huidige stand volgt.
            </span>
          </div>
        )}

        {acties.map(a => (
          <div key={a.sleutel} className="flex flex-col gap-1">
            <Button
              // Eén primaire knop per blok. Is er een vervolgstap, dan is dát de primaire
              // handeling en worden de keuzes eronder secundair — anders staan er twee knoppen
              // die allebei "doe mij eerst" zeggen.
              variant={a.primair && !stap ? 'primary' : 'secondary'}
              onClick={() => doe(a.sleutel)}
              disabled={!a.kan || bezig}
              loading={bezig && a.sleutel === 'offerte'}
              className="w-full justify-center"
            >
              {a.label}
            </Button>
            <span className="text-[11px] leading-snug text-neutral-500">{a.uitleg}</span>
          </div>
        ))}
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
