'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { koppelBestuurder, ontkoppelBestuurder } from '@/app/(platform)/medewerkers/[id]/actions'
import { Button, Badge } from '@/components/ui'

export type BestuurderOptie = {
  id: string
  volledige_naam: string | null
  email: string | null
}

export default function BestuurderKoppeling({
  medewerker_id,
  gekoppeld,
  beschikbaar,
  suggestie_id,
  fout,
}: {
  medewerker_id: string
  /** Huidige gekoppelde ULU-bestuurder, of null. */
  gekoppeld: BestuurderOptie | null
  /** Nog niet gekoppelde, actieve bestuurders. */
  beschikbaar: BestuurderOptie[]
  /** Voorselectie op basis van e-mailmatch. */
  suggestie_id: string | null
  /** Foutmelding als de wagenpark-database niet bereikbaar is. */
  fout: string | null
}) {
  const [selectie, setSelectie] = useState(suggestie_id ?? '')
  const [isPending, startTransition] = useTransition()

  function koppel() {
    if (!selectie) return
    startTransition(async () => {
      const result = await koppelBestuurder(medewerker_id, selectie)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Bestuurder gekoppeld')
    })
  }

  function ontkoppel() {
    if (!gekoppeld) return
    startTransition(async () => {
      const result = await ontkoppelBestuurder(medewerker_id, gekoppeld.id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Bestuurder ontkoppeld')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, minHeight: 32 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Wagenpark-bestuurder
        </h3>
        {gekoppeld && (
          <Button variant="ghost" size="sm" onClick={ontkoppel} disabled={isPending}>Ontkoppelen</Button>
        )}
      </div>

      {fout ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
          Wagenpark-gegevens niet beschikbaar: {fout}
        </p>
      ) : gekoppeld ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <Link
              href={`/wagenpark/bestuurders/${gekoppeld.id}`}
              style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--accent)', textDecoration: 'none' }}
            >
              {gekoppeld.volledige_naam || `Bestuurder #${gekoppeld.id}`}
            </Link>
            {gekoppeld.email && (
              <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>
                {gekoppeld.email}
              </div>
            )}
          </div>
          <Badge tone="success" dot>Gekoppeld</Badge>
        </div>
      ) : (
        <div>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 8px' }}>
            Koppel deze medewerker aan een ULU-bestuurder uit het wagenpark — dezelfde persoon,
            zodat ritten en compliance aan de medewerker hangen.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              className="eva-input"
              style={{ flex: 1 }}
              value={selectie}
              onChange={e => setSelectie(e.target.value)}
            >
              <option value="">— Selecteer bestuurder —</option>
              {beschikbaar.map(b => (
                <option key={b.id} value={b.id}>
                  {b.volledige_naam || `#${b.id}`}{b.email ? ` — ${b.email}` : ''}{b.id === suggestie_id ? '  (e-mailmatch)' : ''}
                </option>
              ))}
            </select>
            <Button variant="primary" size="sm" onClick={koppel} disabled={!selectie || isPending} loading={isPending}>
              Koppelen
            </Button>
          </div>
          {suggestie_id && selectie === suggestie_id && (
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--accent)', margin: '6px 0 0' }}>
              Voorgesteld op basis van overeenkomend e-mailadres.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
