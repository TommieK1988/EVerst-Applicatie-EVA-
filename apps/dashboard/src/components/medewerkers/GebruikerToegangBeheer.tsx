'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { GebruikerType, RechtenSet } from '@everts/database/platform-types'
import { RECHTEN_MODULES } from '@everts/database/platform-types'
import {
  updateGebruikerType,
  verstuurUitnodiging,
  updateRechtenOverride,
  ontkoppelOffice365,
} from '@/app/(platform)/medewerkers/[id]/actions'
import { Button } from '@/components/ui'

const MODULES = RECHTEN_MODULES

const NIVEAUS: { value: 'lezen' | 'schrijven' | 'beheren' | null; label: string }[] = [
  { value: null,        label: 'Geen' },
  { value: 'lezen',     label: 'Lezen' },
  { value: 'schrijven', label: 'Schrijven' },
  { value: 'beheren',   label: 'Beheren' },
]

const GEBRUIKER_TYPE_LABELS: Record<GebruikerType, string> = {
  geen:               'Geen toegang',
  app_gebruiker:      'App-gebruiker',
  platform_gebruiker: 'Platform gebruiker',
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

const valueStyle: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)',
}

export default function GebruikerToegangBeheer({
  medewerker_id,
  medewerker_email,
  gebruiker_type: initial_type,
  auth_user_id,
  o365_email: initial_o365_email,
  rechten_override: initial_rechten,
  afdeling_standaard_rechten,
}: {
  medewerker_id: string
  medewerker_email: string | null
  gebruiker_type: GebruikerType
  auth_user_id: string | null
  o365_email: string | null
  rechten_override: RechtenSet
  afdeling_standaard_rechten: RechtenSet
}) {
  const [type, setType] = useState<GebruikerType>(initial_type)
  const [rechten, setRechten] = useState<RechtenSet>(initial_rechten)
  const [editingRechten, setEditingRechten] = useState(false)
  const [editRechten, setEditRechten] = useState<Record<string, 'lezen' | 'schrijven' | 'beheren' | null>>({})
  const [isPending, startTransition] = useTransition()
  const [authUserId, setAuthUserId] = useState<string | null>(auth_user_id)

  const o365Configured = !!(
    process.env.NEXT_PUBLIC_O365_CONFIGURED === 'true'
  )

  function changeType(newType: GebruikerType) {
    if (newType === type) return
    startTransition(async () => {
      const res = await updateGebruikerType(medewerker_id, newType)
      if (!res.ok) { toast.error(res.error); return }
      setType(newType)

      // Stuur automatisch een uitnodiging als toegang wordt geactiveerd en er nog geen account is
      if (newType !== 'geen' && medewerker_email && !authUserId) {
        const inviteRes = await verstuurUitnodiging(medewerker_id)
        if (!inviteRes.ok) {
          toast.success('Gebruikertype opgeslagen')
          toast.error(`Uitnodiging mislukt: ${inviteRes.error}`)
        } else {
          if (inviteRes.auth_user_id) setAuthUserId(inviteRes.auth_user_id)
          toast.success('Gebruikertype opgeslagen & uitnodiging verstuurd')
        }
      } else {
        toast.success('Gebruikertype opgeslagen')
      }
    })
  }

  function sendInvite() {
    startTransition(async () => {
      const res = await verstuurUitnodiging(medewerker_id)
      if (!res.ok) { toast.error(res.error); return }
      if (res.auth_user_id) setAuthUserId(res.auth_user_id)
      toast.success('Uitnodiging verstuurd')
    })
  }

  function startEditRechten() {
    // Formulier starten vanaf de effectieve rechten, niet alleen de override
    const seed: Record<string, 'lezen' | 'schrijven' | 'beheren' | null> = {}
    for (const m of MODULES) {
      seed[m.key] = (effectiefRechten as Record<string, 'lezen' | 'schrijven' | 'beheren' | null>)[m.key] ?? null
    }
    setEditRechten(seed)
    setEditingRechten(true)
  }

  function saveRechten() {
    // Alleen afwijkingen t.o.v. de afdeling-standaard als override bewaren,
    // zodat ongewijzigde modules de afdeling-standaard blijven volgen.
    const override: RechtenSet = {}
    for (const m of MODULES) {
      const val = editRechten[m.key] ?? null
      const std = (afdeling_standaard_rechten as Record<string, string | null>)[m.key] ?? null
      if (val !== std) (override as Record<string, unknown>)[m.key] = val
    }
    startTransition(async () => {
      const res = await updateRechtenOverride(medewerker_id, override)
      if (!res.ok) { toast.error(res.error); return }
      setRechten(override)
      setEditingRechten(false)
      toast.success('Rechten opgeslagen')
    })
  }

  function disconnectO365() {
    startTransition(async () => {
      const res = await ontkoppelOffice365(medewerker_id)
      if (!res.ok) { toast.error(res.error); return }
      toast.success('Office 365 ontkoppeld')
    })
  }

  // Effective rechten = afdeling defaults merged with user override
  const effectiefRechten: RechtenSet = { ...afdeling_standaard_rechten }
  for (const [k, v] of Object.entries(rechten)) {
    if (v !== undefined) (effectiefRechten as Record<string, unknown>)[k] = v
  }

  return (
    <div>
      <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: '0 0 16px' }}>
        Toegang & gebruiker
      </h3>

      {/* Gebruiker type */}
      <div style={{ marginBottom: 20 }}>
        <label style={labelStyle}>Gebruikertype</label>
        <select
          className="eva-input"
          style={{ width: 240 }}
          value={type}
          onChange={e => changeType(e.target.value as GebruikerType)}
          disabled={isPending}
        >
          {Object.entries(GEBRUIKER_TYPE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <p style={{ margin: '5px 0 0', fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
          {type === 'geen' && 'Medewerker heeft geen toegang tot het platform of de app.'}
          {type === 'app_gebruiker' && 'Toegang tot de mobiele app: urenregistratie, werkbonnen en foto\'s.'}
          {type === 'platform_gebruiker' && 'Volledige toegang tot het EVA-platform (web).'}
        </p>
      </div>

      {/* Platformaccount — alleen zichtbaar als type != geen */}
      {type !== 'geen' && (
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <label style={labelStyle}>Platformaccount</label>
          {authUserId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ ...valueStyle, color: 'var(--accent)', fontWeight: 600 }}>● Gekoppeld</span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                {medewerker_email ?? '—'}
              </span>
            </div>
          ) : (
            <div>
              <div style={{ ...valueStyle, color: 'var(--fg-muted)', marginBottom: 8 }}>
                {type === 'platform_gebruiker'
                  ? 'Nog niet ingelogd. Het account koppelt zichzelf zodra deze medewerker één keer met Microsoft inlogt.'
                  : 'Nog geen account aangemaakt.'}
                {!medewerker_email && (
                  <span style={{ color: 'var(--warning, #f59e0b)', marginLeft: 6 }}>
                    Voeg eerst een e-mailadres toe.
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={sendInvite}
                loading={isPending}
                disabled={isPending || !medewerker_email}
              >
                Uitnodiging versturen
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Rechten override — alleen zichtbaar als type = platform_gebruiker */}
      {type === 'platform_gebruiker' && (
        <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>Rechten (override op afdeling-standaard)</label>
            {!editingRechten && (
              <Button variant="ghost" size="sm" onClick={startEditRechten}>
                Aanpassen
              </Button>
            )}
          </div>

          {editingRechten ? (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto auto', gap: '6px 12px', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ ...labelStyle, marginBottom: 0 }}>Module</div>
                {NIVEAUS.map(n => (
                  <div key={n.label} style={{ ...labelStyle, marginBottom: 0, textAlign: 'center' }}>{n.label}</div>
                ))}
                {MODULES.map(m => {
                  const huidig = editRechten[m.key] ?? null
                  return (
                    <React.Fragment key={m.key}>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>{m.label}</span>
                      {NIVEAUS.map(n => (
                        <div key={n.label} style={{ display: 'flex', justifyContent: 'center' }}>
                          <input
                            type="radio"
                            name={`rechten_${m.key}`}
                            checked={huidig === n.value}
                            onChange={() => setEditRechten(prev => ({ ...prev, [m.key]: n.value }))}
                          />
                        </div>
                      ))}
                    </React.Fragment>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="ghost" size="sm" onClick={() => setEditingRechten(false)}>
                  Annuleren
                </Button>
                <Button variant="primary" size="sm" onClick={saveRechten} loading={isPending} disabled={isPending}>
                  Opslaan
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {MODULES.map(m => {
                const effectief = (effectiefRechten as Record<string, string | null>)[m.key] ?? null
                const override  = (rechten as Record<string, string | null>)[m.key]
                const heeftOverride = override !== undefined
                return (
                  <span
                    key={m.key}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      padding: '2px 8px', borderRadius: 4,
                      fontSize: 10,
                      background: effectief ? 'rgba(31,122,58,0.08)' : 'var(--bg-active)',
                      color: effectief ? 'var(--accent)' : 'var(--fg-muted)',
                      border: heeftOverride ? '1px solid var(--accent)' : '1px solid var(--border)',
                    }}
                  >
                    {m.label}: {effectief ?? 'geen'}
                    {heeftOverride && <span title="Handmatig aangepast">*</span>}
                  </span>
                )
              })}
              {Object.keys(rechten).length === 0 && Object.keys(afdeling_standaard_rechten).length === 0 && (
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                  Geen rechten ingesteld — stel standaard in via{' '}
                  <a href="/instellingen/gebruikers" style={{ color: 'var(--accent)' }}>Instellingen → Gebruikers</a>.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Office 365 */}
      <div>
        <label style={labelStyle}>Office 365</label>
        {initial_o365_email ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...valueStyle, color: 'var(--accent)', fontWeight: 600 }}>● Gekoppeld</span>
              <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                {initial_o365_email}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={disconnectO365}
              disabled={isPending}
            >
              Ontkoppelen
            </Button>
          </div>
        ) : o365Configured ? (
          <Button asChild variant="primary" size="sm">
            <a href={`/api/auth/o365?medewerker_id=${medewerker_id}`}>
              Koppel Office 365
            </a>
          </Button>
        ) : (
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
            Office 365 koppeling is nog niet geconfigureerd.{' '}
            Voeg <code>O365_CLIENT_ID</code> en <code>O365_CLIENT_SECRET</code> toe aan <code>.env.local</code>.
          </p>
        )}
      </div>
    </div>
  )
}
