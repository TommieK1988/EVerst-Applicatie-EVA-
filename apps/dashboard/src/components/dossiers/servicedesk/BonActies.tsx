'use client'

/**
 * "Wat wil je doen?" — de handelingen van een servicedeskbon, rechts in het Servicedesk-blok.
 *
 * Bovenaan de stap die uit de huidige stand volgt (Werk gestart, Gereedmelden, Kosten
 * controleren…): dat is een vaststelling, geen keuze, en daarom de primaire knop. Staat de bon op
 * Wachten op opdrachtgever, dan staan daar de drie mogelijke antwoorden: mandaatverhoging
 * goedgekeurd, offerte gewonnen (beide naar In voorbereiding) of vervallen. Daaronder de
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
import { useDialogen } from '@/components/ui/dialogen'
import { laatServicedeskbonVervallen } from '@/lib/dossiers/servicedesk-acties'
import { maakOfferteVoorServicedesk, offerteAkkoordServicedesk } from '@/lib/dossiers/actions'
import { bonActies, type BonActieSleutel } from './bon-acties'
import { volgendeStap } from './status-stappen'
import type { ServicedeskSubstatus } from '../types'
import MandaatVerhogingModal from './MandaatVerhogingModal'
import InplannenModal from './InplannenModal'
import BestelVenster from './BestelVenster'
import BonOpenOpdrachten from './BonOpenOpdrachten'
import StatusStapKnop from './StatusStapKnop'

/**
 * Knoppen in deze kolom zijn even breed en mogen afbreken. Met de vaste hoogte en
 * `whitespace-nowrap` van de standaardknop liep 'Onderaannemerscontract maken' buiten zijn
 * eigen rand — de kaart kapt dat af, dus je las een halve knop.
 */
const KNOP = 'h-auto min-h-8 w-full justify-center whitespace-normal py-1.5 leading-tight'

export default function BonActies({
  dossierId, heeftCalculatie, mandaatBedrag, kostengroep, calcProjectId,
  substatus, alleenLezen,
}: {
  dossierId: string
  heeftCalculatie: boolean
  mandaatBedrag: number | null
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
  const { bevestig, vraagTekst } = useDialogen()
  /** Welke kant van het mandaatvenster open staat: de vraag, of het antwoord vastleggen. */
  const [mandaatOpen, setMandaatOpen] = useState<null | 'aanvragen' | 'toekennen'>(null)
  const [planOpen, setPlanOpen] = useState(false)
  const [bestelOpen, setBestelOpen] = useState(false)
  /** Ververst de opdrachten in de wacht na het bestelvenster. */
  const [opdrachtVersie, setOpdrachtVersie] = useState(0)

  const wacht = !alleenLezen && substatus === 'wacht_op_opdrachtgever'
  const stap = alleenLezen || wacht ? null : volgendeStap(substatus)

  const acties = bonActies({
    heeftCalculatie,
    heeftMandaat: mandaatBedrag != null && mandaatBedrag > 0,
    wachtOpOpdrachtgever: wacht,
    alleenLezen,
  })

  // De vraag staat buiten de transition: anders draait de knop al terwijl je nog aan het lezen bent.
  async function offerteGewonnen() {
    const ok = await bevestig({
      titel: 'Offerte gewonnen?',
      omschrijving: heeftCalculatie
        ? 'De bon gaat naar In voorbereiding. Het offertebedrag wordt de aanneemsom (ook in Bouw7), '
          + 'de termijnen worden aangemaakt volgens de betalingsconditie van de offerte en de bon '
          + 'rekent af op aangenomen.'
        : 'De bon gaat naar In voorbereiding.',
      bevestigLabel: 'Offerte gewonnen',
    })
    if (!ok) return
    start(async () => {
      const r = await offerteAkkoordServicedesk(dossierId)
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Offerte gewonnen — de bon staat op In voorbereiding')
      // Het akkoord staat; dit is wat er nog met de hand moet (termijnen, aanneemsom in Bouw7).
      if (r.waarschuwing) toast(r.waarschuwing, { icon: '⚠️', duration: 10000 })
      router.refresh()
    })
  }

  async function vervallen() {
    const reden = await vraagTekst({
      titel: 'Bon laten vervallen?',
      omschrijving: 'De bon gaat van het bord af en staat daarna alleen nog onder Afgesloten, '
        + 'alleen-lezen. In Bouw7 gaat het project naar 08. Afgewezen. Dit is niet terug te draaien.',
      label: 'Reden',
      placeholder: 'Bijv. opdrachtgever gaat niet akkoord met de offerte',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Vervallen',
    })
    if (reden == null) return
    start(async () => {
      const r = await laatServicedeskbonVervallen(dossierId, { reden })
      if (!r.ok) { toast.error(r.error); return }
      toast.success('Bon vervallen')
      if (r.waarschuwing) toast(r.waarschuwing, { icon: '⚠️', duration: 6000 })
      router.push('/servicedesk')
      router.refresh()
    })
  }

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
        setMandaatOpen('aanvragen')
        return
      case 'offerte':
        if (heeftCalculatie) { void offerteGewonnen(); return }
        start(async () => {
          const r = await maakOfferteVoorServicedesk(dossierId)
          if (!r.ok) { toast.error(r.error); return }
          router.push(`/servicedesk/${dossierId}/calculatie`)
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
        {wacht && (
          <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3">
            <span className="text-[11px] leading-snug text-neutral-500">
              De bon wacht op de opdrachtgever. Wat is het antwoord?
            </span>
            <Button variant="primary" className={KNOP} disabled={bezig}
              onClick={() => setMandaatOpen('toekennen')}>
              Mandaatverhoging goedgekeurd
            </Button>
            <Button variant="secondary" className={KNOP} disabled={bezig}
              onClick={() => void offerteGewonnen()}>
              Offerte gewonnen
            </Button>
            <Button variant="outline" className={KNOP} disabled={bezig}
              onClick={() => void vervallen()}>
              Vervallen
            </Button>
          </div>
        )}

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
              variant={a.primair && !stap && !wacht ? 'primary' : 'secondary'}
              onClick={() => doe(a.sleutel)}
              disabled={!a.kan || bezig}
              loading={bezig && a.sleutel === 'offerte'}
              className={KNOP}
            >
              {a.label}
            </Button>
            <span className="text-[11px] leading-snug text-neutral-500">{a.uitleg}</span>
          </div>
        ))}
      </div>

      <BonOpenOpdrachten
        dossierId={dossierId}
        versie={opdrachtVersie}
        alleenLezen={alleenLezen}
        onGewijzigd={() => router.refresh()}
      />

      {bestelOpen && (
        <BestelVenster
          dossierId={dossierId}
          calcProjectId={calcProjectId}
          kostengroep={kostengroep}
          onSluit={() => { setBestelOpen(false); setOpdrachtVersie(v => v + 1) }}
          onKlaar={() => { router.refresh(); setOpdrachtVersie(v => v + 1) }}
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
          modus={mandaatOpen}
          onSluit={() => setMandaatOpen(null)}
          onKlaar={() => router.refresh()}
        />
      )}
    </>
  )
}
