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
      titel: 'Bouw7 volgen?',
      omschrijving: 'EVA stopt met proberen deze velden naar Bouw7 te schrijven en neemt bij de '
        + 'eerstvolgende synchronisatie de waarden uit Bouw7 over. Je aanpassingen in EVA gaan daarbij verloren.',
      bevestigLabel: 'Bouw7 volgen',
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
        Staat nog niet in Bouw7 en wordt daar automatisch opnieuw naartoe gestuurd:{' '}
        <span className="font-semibold text-neutral-700">{velden.map(v => LABELS[v]).join(', ')}</span>.
        Tot die tijd blijft de EVA-waarde staan. Het e-mailadres gaat nooit naar Bouw7: dat is daar de inlognaam.
      </p>
      <Button variant="ghost" size="sm" onClick={herstel} disabled={bezig}>
        {bezig ? 'Bezig…' : 'Bouw7 volgen'}
      </Button>
    </div>
  )
}
