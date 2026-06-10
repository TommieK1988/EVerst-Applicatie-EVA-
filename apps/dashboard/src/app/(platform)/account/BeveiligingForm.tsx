'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { Button, Input, FormField, Separator } from '@/components/ui'
import { updateWachtwoord, updateEmail, logoutAndereSessies } from './actions'

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 style={{
      fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600,
      color: 'var(--fg)', margin: '0 0 14px',
    }}>{title}</h3>
  )
}

export default function BeveiligingForm({ currentEmail }: { currentEmail: string }) {
  // Wachtwoord
  const [nieuw,       setNieuw]       = useState('')
  const [bevestig,    setBevestig]    = useState('')
  const [pwPending,   startPwTrans]   = useTransition()

  // E-mail
  const [email,       setEmail]       = useState(currentEmail)
  const [emailPending,startEmailTrans]= useTransition()

  // Sessies
  const [sessiePending, startSessieTrans] = useTransition()

  function handleWachtwoord(e: React.FormEvent) {
    e.preventDefault()
    startPwTrans(async () => {
      const result = await updateWachtwoord({ nieuw, bevestig })
      if (result.ok) {
        toast.success('Wachtwoord gewijzigd')
        setNieuw('')
        setBevestig('')
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleEmail(e: React.FormEvent) {
    e.preventDefault()
    startEmailTrans(async () => {
      const result = await updateEmail({ email })
      if (result.ok) {
        toast.success('Verificatiemail verstuurd naar het nieuwe adres')
      } else {
        toast.error(result.error)
      }
    })
  }

  function handleLogoutSessies() {
    startSessieTrans(async () => {
      const result = await logoutAndereSessies()
      if (result.ok) {
        toast.success('Andere sessies afgemeld')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div>
      {/* ── Wachtwoord ── */}
      <SectionHeader title="Wachtwoord wijzigen" />
      <form onSubmit={handleWachtwoord} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormField label="Nieuw wachtwoord" helper="Minimaal 8 tekens">
          <Input
            type="password"
            value={nieuw}
            onChange={e => setNieuw(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Bevestig wachtwoord">
          <Input
            type="password"
            value={bevestig}
            onChange={e => setBevestig(e.target.value)}
            required
            autoComplete="new-password"
          />
        </FormField>
        <div>
          <Button type="submit" variant="ghost" loading={pwPending}>
            Wachtwoord wijzigen
          </Button>
        </div>
      </form>

      <Separator className="my-6" />

      {/* ── E-mailadres ── */}
      <SectionHeader title="E-mailadres wijzigen" />
      <form onSubmit={handleEmail} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <FormField label="E-mailadres" helper="Er wordt een verificatiemail verstuurd naar het nieuwe adres.">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </FormField>
        <div>
          <Button
            type="submit"
            variant="ghost"
            loading={emailPending}
            disabled={email === currentEmail}
          >
            Verificatiemail sturen
          </Button>
        </div>
      </form>

      <Separator className="my-6" />

      {/* ── Sessies ── */}
      <SectionHeader title="Actieve sessies" />
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', margin: '0 0 14px' }}>
        Log alle andere apparaten en browsers uit. Je huidige sessie blijft actief.
      </p>
      <Button
        type="button"
        variant="destructive"
        onClick={handleLogoutSessies}
        loading={sessiePending}
      >
        Andere sessies uitloggen
      </Button>
    </div>
  )
}
