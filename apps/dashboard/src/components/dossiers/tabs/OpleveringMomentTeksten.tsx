'use client'

import React, { useState } from 'react'
import toast from 'react-hot-toast'
import { FormField, Textarea } from '@/components/ui'
import { updateMomentTeksten } from '@/lib/dossiers/oplever-goed'

type Veld = 'opmerking' | 'afspraken'

/**
 * "Algemene opmerkingen" en "Afspraken" van een oplevermoment. Beide komen in het opleverrapport
 * onder de punten, vóór de handtekeningen. Opslaan bij het verlaten van het veld.
 */
export default function OpleveringMomentTeksten({ momentId, opmerking, afspraken, readOnly }: {
  momentId: string
  opmerking: string | null
  afspraken: string | null
  readOnly: boolean
}) {
  const [waarden, setWaarden] = useState<Record<Veld, string>>({
    opmerking: opmerking ?? '', afspraken: afspraken ?? '',
  })
  const [opgeslagen, setOpgeslagen] = useState<Record<Veld, string>>({
    opmerking: opmerking ?? '', afspraken: afspraken ?? '',
  })

  async function bewaar(veld: Veld) {
    const waarde = waarden[veld]
    if (waarde === opgeslagen[veld]) return
    const r = await updateMomentTeksten(momentId, { [veld]: waarde })
    if (!r.ok) { toast.error(r.error); return }
    setOpgeslagen(o => ({ ...o, [veld]: waarde }))
    toast.success('Opgeslagen')
  }

  if (readOnly && !opmerking && !afspraken) return null

  const veld = (naam: Veld, label: string, placeholder: string) => (
    <FormField label={label} upper optional helper="Komt in het opleverrapport.">
      <Textarea rows={3} value={waarden[naam]} disabled={readOnly} placeholder={placeholder}
        onChange={e => setWaarden(w => ({ ...w, [naam]: e.target.value }))}
        onBlur={() => bewaar(naam)} />
    </FormField>
  )

  return (
    <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
      {veld('opmerking', 'Algemene opmerkingen', 'Bijv. alle werkzaamheden zijn volgens afspraak uitgevoerd.')}
      {veld('afspraken', 'Afspraken', 'Bijv. restpunt kozijn achtergevel wordt in week 44 hersteld.')}
    </div>
  )
}
