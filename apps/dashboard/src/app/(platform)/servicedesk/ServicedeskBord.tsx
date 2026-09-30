'use client'

/**
 * Het servicedeskbord: dagelijks onderhoud (regie) en mutatie (aangenomen) op één bord met
 * dezelfde kolommen. Tot oktober 2026 waren dat twee borden met elk een eigen kolomreeks; die
 * waren zo naar elkaar toegegroeid dat ze zijn samengevoegd.
 *
 * Bovenaan staat een filter (Alle / Dagelijks onderhoud / Mutatie). De query blijft één query —
 * alles zit al in de opgehaalde lijst, dus filteren kost geen serverronde.
 */

import React from 'react'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import {
  SERVICEDESK_STATUSSEN, SERVICEDESK_FILTER_COOKIE, isMutatieDossier,
  type DossierRij, type ServicedeskFilter,
} from '@/components/dossiers/types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import { laadContracttotalen } from '@/lib/dossiers/contracttotaal'

const COOKIE_MAXAGE = 60 * 60 * 24 * 365

const FILTERS: { key: ServicedeskFilter; label: string }[] = [
  { key: 'alle',      label: 'Alle'                },
  { key: 'onderhoud', label: 'Dagelijks onderhoud' },
  { key: 'mutatie',   label: 'Mutatie'             },
]

type Props = {
  dossiers: DossierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  mijnNaam?: string | null
  /** Filter dat de gebruiker het laatst koos, uit het cookie gelezen door de serverpagina. */
  initieelFilter?: ServicedeskFilter
  extraActies?: React.ReactNode
  onStatusChange?: (id: string, status: string) => Promise<{ ok: boolean; error?: string }>
}

export function ServicedeskBord({
  dossiers, layouts, user_id, mijnNaam, initieelFilter = 'alle', extraActies, onStatusChange,
}: Props) {
  const [filter, setFilter] = React.useState<ServicedeskFilter>(initieelFilter)

  function kiesFilter(keuze: ServicedeskFilter) {
    setFilter(keuze)
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${SERVICEDESK_FILTER_COOKIE}=${keuze}; Path=/; Max-Age=${COOKIE_MAXAGE}; SameSite=Lax${secure}`
  }

  /* Contracttotalen (zelfde getal als de Verkoop-tab) komen na de eerste render: ze kosten per bon
   * zo'n twintig lezingen en de pagina hoeft daar niet op te wachten. Opnieuw ophalen alleen als
   * er andere bonnen op het bord staan — een statuswissel verandert het bedrag niet. */
  const [totalen, setTotalen] = React.useState<Record<string, DossierRij['contracttotaal']>>({})
  const idSleutel = React.useMemo(() => dossiers.map(d => d.id).sort().join(','), [dossiers])
  React.useEffect(() => {
    if (!idSleutel) return
    let actief = true
    laadContracttotalen(idSleutel.split(','))
      .then(r => { if (actief) setTotalen(r) })
      // Lukt het niet, dan tonen de kaarten geen bedrag; het bord zelf blijft gewoon werken.
      .catch(() => { if (actief) setTotalen(Object.fromEntries(idSleutel.split(',').map(id => [id, null]))) })
    return () => { actief = false }
  }, [idSleutel])

  const { alle, onderhoud, mutatie } = React.useMemo(() => {
    const alle: DossierRij[] = []
    const onderhoud: DossierRij[] = []
    const mutatie: DossierRij[] = []
    for (const d of dossiers) {
      const rij = d.id in totalen ? { ...d, contracttotaal: totalen[d.id] } : d
      alle.push(rij)
      ;(isMutatieDossier(d) ? mutatie : onderhoud).push(rij)
    }
    return { alle, onderhoud, mutatie }
  }, [dossiers, totalen])

  const zichtbaar = filter === 'mutatie' ? mutatie : filter === 'onderhoud' ? onderhoud : alle
  const aantallen = { alle: alle.length, onderhoud: onderhoud.length, mutatie: mutatie.length }

  const toggle = (
    <div
      role="tablist"
      aria-label="Servicedesk-filter"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {FILTERS.map(l => {
        const actief = filter === l.key
        return (
          <button
            key={l.key}
            role="tab"
            aria-selected={actief}
            onClick={() => kiesFilter(l.key)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              height: 32, padding: '0 14px', borderRadius: 99,
              border: `1.5px solid ${actief ? 'var(--brand-600)' : 'var(--border)'}`,
              background: actief ? 'var(--brand-600)' : 'transparent',
              color: actief ? '#fff' : 'var(--neutral-500)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              transition: 'all 120ms',
            }}
          >
            {l.label}
            <span style={{
              minWidth: 18, height: 18, padding: '0 5px', borderRadius: 99,
              display: 'inline-grid', placeItems: 'center',
              background: actief ? 'rgba(255,255,255,.22)' : 'var(--neutral-100)',
              color: actief ? '#fff' : 'var(--neutral-500)',
              fontSize: 11, fontWeight: 700, lineHeight: 1,
            }}>
              {aantallen[l.key]}
            </span>
          </button>
        )
      })}
    </div>
  )

  return (
    <>
      {toggle}
      <DossierViewSwitcher
        sectie="servicedesk"
        statussen={SERVICEDESK_STATUSSEN}
        dossiers={zichtbaar}
        layouts={layouts}
        user_id={user_id}
        mijnNaam={mijnNaam}
        kolomKeyModus="servicedesk_substatus"
        onStatusChange={onStatusChange}
        extraActies={extraActies}
      />
    </>
  )
}
