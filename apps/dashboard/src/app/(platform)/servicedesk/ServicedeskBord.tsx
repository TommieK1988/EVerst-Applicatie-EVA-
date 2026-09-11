'use client'

/**
 * De servicedesk toont twee trajecten die niets met elkaar te maken hebben, en dus twee borden.
 *
 *  * **Dagelijks onderhoud** — bon binnen, mandaat toetsen, uitzetten, kosten verzamelen,
 *    factureren. Werk op regie.
 *  * **Mutatie** — opname, offerte, werkvoorbereiding, uitvoering. Aangenomen werk.
 *
 * Deze component doet drie dingen: de toggle tonen, de dossiers splitsen op categorie, en de
 * bijbehorende kolomreeks doorgeven. De query blijft één query — beide kanten zitten al in de
 * opgehaalde lijst, dus omschakelen kost geen serverronde.
 */

import React from 'react'
import { DossierViewSwitcher } from '@/components/dossiers/DossierViewSwitcher'
import { DossierLijst } from '@/components/dossiers/DossierLijst'
import {
  SERVICEDESK_STATUSSEN, SERVICEDESK_MUTATIE_STATUSSEN, SERVICEDESK_LADDER_COOKIE, isMutatieDossier,
  type DossierRij, type DossierSubstatus, type ServicedeskLadder, type StatusDef,
} from '@/components/dossiers/types'
import type { GebruikerLayout } from '@everts/database/platform-types'

const COOKIE_MAXAGE = 60 * 60 * 24 * 365

const LADDERS: { key: ServicedeskLadder; label: string }[] = [
  { key: 'onderhoud', label: 'Dagelijks onderhoud' },
  { key: 'mutatie',   label: 'Mutatie'             },
]

type Props = {
  dossiers: DossierRij[]
  layouts: GebruikerLayout[]
  user_id: string | null
  mijnNaam?: string | null
  /** Kant waarop de gebruiker het laatst stond, uit het cookie gelezen door de serverpagina. */
  initieleLadder?: ServicedeskLadder
  /** Archiefweergave: alleen de lijst, geen kanban en geen slepen. */
  archief?: boolean
  extraActies?: React.ReactNode
  onStatusChange?: (id: string, status: string) => Promise<{ ok: boolean; error?: string }>
}

export function ServicedeskBord({
  dossiers, layouts, user_id, mijnNaam, initieleLadder = 'onderhoud', archief, extraActies, onStatusChange,
}: Props) {
  const [ladder, setLadder] = React.useState<ServicedeskLadder>(initieleLadder)

  function kiesLadder(keuze: ServicedeskLadder) {
    setLadder(keuze)
    const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${SERVICEDESK_LADDER_COOKIE}=${keuze}; Path=/; Max-Age=${COOKIE_MAXAGE}; SameSite=Lax${secure}`
  }

  const { onderhoud, mutatie } = React.useMemo(() => {
    const onderhoud: DossierRij[] = []
    const mutatie: DossierRij[] = []
    for (const d of dossiers) (isMutatieDossier(d) ? mutatie : onderhoud).push(d)
    return { onderhoud, mutatie }
  }, [dossiers])

  const isMutatie = ladder === 'mutatie'
  const zichtbaar = isMutatie ? mutatie : onderhoud
  const statussen = isMutatie ? SERVICEDESK_MUTATIE_STATUSSEN : SERVICEDESK_STATUSSEN
  const aantallen = { onderhoud: onderhoud.length, mutatie: mutatie.length }

  const toggle = (
    <div
      role="tablist"
      aria-label="Servicedesk-traject"
      style={{
        display: 'flex', alignItems: 'center', gap: 4,
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      {LADDERS.map(l => {
        const actief = ladder === l.key
        return (
          <button
            key={l.key}
            role="tab"
            aria-selected={actief}
            onClick={() => kiesLadder(l.key)}
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

  if (archief) {
    return (
      <>
        {toggle}
        <DossierLijst
          sectie="servicedesk"
          statussen={statussen as StatusDef<DossierSubstatus>[]}
          dossiers={zichtbaar}
          layouts={layouts}
          user_id={user_id}
          extraActies={extraActies}
        />
      </>
    )
  }

  return (
    <>
      {toggle}
      <DossierViewSwitcher
        sectie="servicedesk"
        statussen={statussen}
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
