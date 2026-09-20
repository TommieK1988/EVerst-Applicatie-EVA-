'use client'

/**
 * De gesprekshistorie met deze klant, nieuwste bovenaan.
 *
 * Dezelfde notities als het blok Acquisitie op de relatiepagina — wat je onderweg vastlegt
 * staat op kantoor in hetzelfde lijstje. Verwijderen kan alleen bij je eigen notitie, en dat
 * wordt server-side afgedwongen (`.eq('medewerker_id', …)`), niet alleen hier in de knop.
 */

import React from 'react'
import { Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'
import { verwijderRelatieNotitie } from '@/lib/relaties/notities-actions'
import type { RelatieNotitie } from '@/lib/relaties/notities-types'
import { GRIJS, OPPERVLAK, RAND, TEKST } from './stijl'

function fmtTijd(iso: string): string {
  return new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function NotitieLijst({
  notities, currentMedewerkerId, magVerwijderen,
}: {
  notities: RelatieNotitie[]
  currentMedewerkerId: string | null
  magVerwijderen: boolean
}) {
  const router = useRouter()
  // Optimistisch verbergen: de server-action revalideert daarna de route, en dan is de
  // server-lijst weer leidend.
  const [verborgen, setVerborgen] = React.useState<Set<string>>(new Set())

  async function verwijder(id: string) {
    setVerborgen(prev => new Set(prev).add(id))
    const res = await verwijderRelatieNotitie(id)
    if (!res.ok) {
      setVerborgen(prev => { const n = new Set(prev); n.delete(id); return n })
      toast.error(res.error)
      return
    }
    router.refresh()
  }

  return (
    <>
      {notities.filter(n => !verborgen.has(n.id)).map(n => (
        <div
          key={n.id}
          style={{
            padding: '11px 12px', borderRadius: 12,
            background: OPPERVLAK, border: `1px solid ${RAND}`, marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: TEKST }}>{n.auteur_naam}</span>
            <span style={{ fontSize: 11.5, color: GRIJS }}>{fmtTijd(n.created_at)}</span>
            {magVerwijderen && currentMedewerkerId && n.medewerker_id === currentMedewerkerId && (
              <button
                type="button"
                onClick={() => verwijder(n.id)}
                aria-label="Notitie verwijderen"
                style={{
                  marginLeft: 'auto', flexShrink: 0,
                  width: 32, height: 32, borderRadius: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', background: 'transparent', color: GRIJS,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              >
                <Trash2 size={15} aria-hidden />
              </button>
            )}
          </div>
          {n.contactpersoon_naam && (
            <div style={{ fontSize: 11.5, color: GRIJS, marginBottom: 3 }}>
              met {n.contactpersoon_naam}
            </div>
          )}
          <div style={{
            fontSize: 13.5, lineHeight: 1.5, color: TEKST,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {n.inhoud}
          </div>
        </div>
      ))}
    </>
  )
}
