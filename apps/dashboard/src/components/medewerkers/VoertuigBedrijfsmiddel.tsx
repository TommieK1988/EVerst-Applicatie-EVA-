'use client'

import React, { useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { koppelBestuurder, ontkoppelBestuurder } from '@/app/(platform)/medewerkers/[id]/actions'
import { Button, Badge, Card, CardBody } from '@/components/ui'

export type BestuurderOptie = {
  id: string
  volledige_naam: string | null
  email: string | null
}

export type VoertuigKoppeling = {
  voertuig_id: string
  kenteken: string
  merk: string | null
  model: string | null
}

/**
 * De voertuigregel in het blok Bedrijfsmiddelen.
 *
 * Wagenpark koppelt een auto aan een ULU-bestuurder, niet aan een medewerker. Deze regel
 * toont dus twee dingen samen: welke bestuurder bij deze medewerker hoort, en welke auto
 * die bestuurder nu rijdt. Zonder bestuurderkoppeling is er ook geen auto te vinden.
 */
export default function VoertuigBedrijfsmiddel({
  medewerker_id,
  voertuig,
  gekoppeld,
  beschikbaar,
  suggestie_id,
  fout,
}: {
  medewerker_id: string
  /** Auto die de gekoppelde bestuurder nu rijdt, of null. */
  voertuig: VoertuigKoppeling | null
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

  const subtekst: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }

  return (
    <Card>
      <CardBody className="flex items-start gap-3 py-2.5">
        <span style={{ fontSize: 18 }}>🚐</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>
              Voertuig
            </span>
            {voertuig && (
              <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }}>
                — {voertuig.kenteken}{voertuig.merk ? ` · ${voertuig.merk} ${voertuig.model ?? ''}` : ''}
              </span>
            )}
          </div>

          {fout ? (
            <div style={subtekst}>Wagenpark-gegevens niet beschikbaar: {fout}</div>
          ) : gekoppeld ? (
            <>
              {!voertuig && <div style={subtekst}>Geen voertuig toegewezen in wagenpark</div>}
              <div style={{ ...subtekst, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Bestuurder:</span>
                <Link
                  href={`/wagenpark/bestuurders/${gekoppeld.id}`}
                  style={{ color: 'var(--accent)', textDecoration: 'none' }}
                >
                  {gekoppeld.volledige_naam || `Bestuurder #${gekoppeld.id}`}
                </Link>
                <Badge tone="success" dot size="sm">Gekoppeld</Badge>
              </div>
            </>
          ) : (
            <div style={{ marginTop: 4 }}>
              <div style={subtekst}>
                Koppel de wagenpark-bestuurder, dan verschijnt hier de auto en hangen ritten en
                compliance aan deze medewerker.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <select
                  className="eva-input"
                  style={{ flex: 1, minWidth: 0 }}
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
                <div style={{ ...subtekst, color: 'var(--accent)', marginTop: 4 }}>
                  Voorgesteld op basis van overeenkomend e-mailadres.
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {voertuig && (
            <Link
              href={`/wagenpark/voertuigen/${voertuig.voertuig_id}`}
              style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
            >
              Wagenpark →
            </Link>
          )}
          {gekoppeld && !fout && (
            <Button variant="ghost" size="sm" onClick={ontkoppel} disabled={isPending}>Ontkoppelen</Button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}
