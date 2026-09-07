'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, useDialogen } from '@/components/ui'
import { herstelMedewerkerBouw7Velden } from '@/app/(platform)/medewerkers/[id]/actions'

const LABELS: Record<string, string> = {
  voornaam: 'voornaam', tussenvoegsel: 'tussenvoegsel', achternaam: 'achternaam',
  email: 'e-mailadres', telefoon: 'telefoon',
  adres_straat: 'straat', adres_postcode: 'postcode', adres_plaats: 'plaats',
  actief: 'actief', extern: 'extern', geboortedatum: 'geboortedatum',
  in_dienst_vanaf: 'in dienst vanaf', uit_dienst_per: 'uit dienst per',
  uurtarief_verkoop: 'verkooptarief', uurtarief_kostprijs: 'kostprijstarief',
}

/**
 * Toont welke medewerkervelden in EVA zijn aangepast en daardoor niet meer uit Bouw7 worden
 * bijgewerkt, met de knop om ze weer te laten meelopen. Zelfde patroon als bij relaties.
 */
export default function Bouw7VeldenNotitie({ medewerkerId, bouw7Id, handmatigeVelden }: {
  medewerkerId: string
  bouw7Id: string | null
  handmatigeVelden: string[] | null | undefined
}) {
  const [bezig, setBezig] = useState(false)
  const router = useRouter()
  const { bevestig } = useDialogen()

  const velden = (handmatigeVelden ?? []).filter(v => v in LABELS)
  if (velden.length === 0 || !bouw7Id) return null

  async function herstel() {
    if (!await bevestig({
      titel: 'Weer bijwerken vanuit Bouw7?',
      omschrijving: 'De eerstvolgende synchronisatie zet deze velden terug op de waarden uit Bouw7. Je aanpassingen in EVA gaan daarbij verloren.',
      bevestigLabel: 'Weer laten bijwerken',
    })) return
    setBezig(true)
    const res = await herstelMedewerkerBouw7Velden(medewerkerId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    router.refresh()
    toast.success('Velden volgen weer Bouw7')
  }

  return (
    <div className="mb-3 pb-3 border-b border-neutral-100 flex items-start justify-between gap-3">
      <p className="text-[11.5px] text-neutral-500 leading-snug">
        In EVA aangepast en niet meer bijgewerkt vanuit Bouw7:{' '}
        <span className="font-semibold text-neutral-700">{velden.map(v => LABELS[v]).join(', ')}</span>
      </p>
      <Button variant="ghost" size="sm" onClick={herstel} disabled={bezig}>
        {bezig ? 'Bezig…' : 'Weer uit Bouw7'}
      </Button>
    </div>
  )
}
