'use client'

/**
 * De acties waarmee een bericht van de lijst af gaat zonder dossier: negeren,
 * "geen aanvraag", opnieuw laten lezen en heropenen.
 *
 * Eigen onderwerp, en daarom een eigen bestand. Ze delen één patroon -- vraag
 * eventueel om een reden, roep de server aan, meld het en ga terug -- en hebben
 * niets te maken met het invullen van het formulier ernaast.
 *
 * Twee dingen zitten er bewust in en horen niet weggeoptimaliseerd te worden:
 *
 * - **Negeren van een bekende klant vraagt eerst een bevestiging.** Post van
 *   iemand die als opdrachtgever in EVA staat wegklikken is zelden de bedoeling.
 * - **Negeren eist een reden.** Die reden is het enige spoor dat later laat zien
 *   of er terecht is weggelegd; zonder dat is de bak "genegeerd" niet te
 *   beoordelen.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'

import { useDialogen } from '@/components/ui'
import {
  negeerBericht, markeerGeenAanvraag, leesOpnieuw, heropenBericht, getBijlageUrl,
} from '@/lib/mailintake/actions'

export function useWeglegActies(bericht: {
  id: string
  /** Bepaalt de toast na heropenen: uit het archief wordt opnieuw gelezen. */
  status?: string | null
  relatie?: { id?: string | null; naam?: string | null } | null
}) {
  const router = useRouter()
  const { bevestig, vraagTekst } = useDialogen()
  const [bezig, setBezig] = useState(false)

  async function negeren() {
    if (bericht.relatie?.id) {
      const ok = await bevestig({
        titel: 'Dit bericht komt van een bekende klant',
        omschrijving: `${bericht.relatie.naam} staat als opdrachtgever in EVA. Weet je zeker dat hier niets mee hoeft?`,
        bevestigLabel: 'Ja, negeren',
        destructief: true,
      })
      if (!ok) return
    }
    const reden = await vraagTekst({
      titel: 'Waarom kan dit genegeerd worden?',
      omschrijving: 'Eén regel is genoeg. Dit is later terug te lezen.',
      verplicht: true,
      meerregelig: true,
    })
    if (!reden) return

    setBezig(true)
    try {
      const res = await negeerBericht(bericht.id, reden)
      if (!res.ok) { toast.error(res.error ?? 'Negeren mislukt'); return }
      toast.success('Bericht genegeerd')
      router.push('/mailintake')
    } finally {
      setBezig(false)
    }
  }

  async function geenAanvraag() {
    const reden = await vraagTekst({
      titel: 'Geen aanvraag',
      omschrijving: 'Wat is het wél? (nieuwsbrief, factuur, reclame…)',
      verplicht: false,
    })
    setBezig(true)
    try {
      await markeerGeenAanvraag(bericht.id, reden ?? '')
      toast.success('Weggezet als geen aanvraag')
      router.push('/mailintake')
    } finally {
      setBezig(false)
    }
  }

  async function opnieuwLezen() {
    setBezig(true)
    try {
      const res = await leesOpnieuw(bericht.id)
      if (!res.ok) toast.error(res.error ?? 'Opnieuw lezen mislukt')
      else toast.success('Opnieuw gelezen')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  async function heropen() {
    setBezig(true)
    try {
      const res = await heropenBericht(bericht.id)
      if (!res.ok) { toast.error(res.error ?? 'Heropenen mislukt'); return }
      // Uit het archief betekent opnieuw lezen: EVA weet nu dat het wél werk is en
      // gaat dieper zoeken. Dat duurt even, dus zeg dat erbij -- anders lijkt het
      // alsof er niets gebeurt omdat het bericht nog niet op Te behandelen staat.
      toast.success(bericht.status === 'geen_aanvraag'
        ? 'EVA leest hem opnieuw en zoekt nu dieper'
        : 'Terug op de lijst')
      router.refresh()
    } finally {
      setBezig(false)
    }
  }

  async function openBijlage(id: string) {
    const res = await getBijlageUrl(id)
    if (!res.ok || !res.url) { toast.error(res.error ?? 'Bijlage niet beschikbaar'); return }
    window.open(res.url, '_blank', 'noopener,noreferrer')
  }

  return { bezig, negeren, geenAanvraag, opnieuwLezen, heropen, openBijlage }
}
