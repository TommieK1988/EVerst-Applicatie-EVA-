'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { startOpname } from '@/lib/opname/opnames'
import { primaireKnop, ROOD } from './stijl'

/**
 * Start een nieuwe opname op dit dossier en springt er meteen in.
 *
 * De prijslijst volgt uit de opdrachtgever van het dossier; heeft die er geen actieve, dan komt er
 * een leesbare melding in plaats van een lege opname. Dat is met opzet: doorwerken met de verkeerde
 * prijslijst is erger dan niet kunnen beginnen.
 */
export default function NieuweOpnameKnop({ dossierId }: { dossierId: string }) {
  const router = useRouter()
  const [bezig, setBezig] = React.useState(false)
  const [fout, setFout] = React.useState<string | null>(null)

  async function start() {
    setBezig(true)
    setFout(null)
    const res = await startOpname(dossierId)
    if (!res.ok) {
      setFout(res.error)
      setBezig(false)
      return
    }
    router.push(`/m/opname/${res.id}`)
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={bezig}
        style={{ ...primaireKnop, width: '100%', opacity: bezig ? 0.6 : 1 }}
      >
        {bezig ? 'Bezig…' : 'Nieuwe opname starten'}
      </button>
      {fout && (
        <p style={{ margin: '8px 0 0', fontSize: 13, color: ROOD, fontWeight: 600 }}>{fout}</p>
      )}
    </div>
  )
}
