'use client'

/**
 * "Projectbezoek starten" op de mobiele dossierpagina.
 *
 * De ad-hoc ingang naast de geplande: een projectleider staat vaak ongepland op locatie, en dan
 * is er geen actie om vanuit te starten. Loopt er nog een eigen concept op dit dossier, dan
 * hervat de server dat in plaats van een tweede bezoek aan te maken — anders levert elke tik een
 * nieuw half ingevuld bezoek op.
 */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { startBezoekVoorDossier } from '@/lib/bezoek/bezoeken'

export default function BezoekStartKnop({ dossierId }: { dossierId: string }) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)

  return (
    <button
      type="button"
      disabled={bezig}
      onClick={async () => {
        setBezig(true)
        const r = await startBezoekVoorDossier(dossierId)
        if (!r.ok) { setBezig(false); toast.error(r.error); return }
        router.push(`/m/bezoek/${r.id}`)
      }}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        width: '100%', padding: '14px 16px', marginBottom: 14,
        borderRadius: 12, border: 'none', background: '#009439', color: '#fff',
        fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        opacity: bezig ? 0.6 : 1,
      }}
    >
      <svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z" />
        <path d="M12 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
      </svg>
      {bezig ? 'Bezig…' : 'Projectbezoek starten'}
    </button>
  )
}
