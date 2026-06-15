'use client'

import React, { useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateProfiel } from './actions'
import type { Medewerker } from '@everts/database/platform-types'
import { Input, Button } from '@/components/ui'

type Props = {
  medewerker: Pick<Medewerker,
    | 'voornaam' | 'tussenvoegsel' | 'achternaam'
    | 'telefoon' | 'functie' | 'afdeling'
  >
}

const labelStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  color: 'var(--fg-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: 5,
  display: 'block',
}

export default function ProfielForm({ medewerker }: Props) {
  const [voornaam,      setVoornaam]      = useState(medewerker.voornaam)
  const [tussenvoegsel, setTussenvoegsel] = useState(medewerker.tussenvoegsel ?? '')
  const [achternaam,    setAchternaam]    = useState(medewerker.achternaam)
  const [telefoon,      setTelefoon]      = useState(medewerker.telefoon ?? '')
  const [isPending,     startTransition]  = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await updateProfiel({
        voornaam,
        tussenvoegsel: tussenvoegsel || null,
        achternaam,
        telefoon: telefoon || null,
      })
      if (result.ok) {
        toast.success('Profiel opgeslagen')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Naam-rij */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Voornaam</label>
          <Input
            value={voornaam}
            onChange={e => setVoornaam(e.target.value)}
            required
          />
        </div>
        <div>
          <label style={labelStyle}>Tussenv.</label>
          <Input
            style={{ width: 80 }}
            value={tussenvoegsel}
            onChange={e => setTussenvoegsel(e.target.value)}
            placeholder="de"
          />
        </div>
        <div>
          <label style={labelStyle}>Achternaam</label>
          <Input
            value={achternaam}
            onChange={e => setAchternaam(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Telefoon */}
      <div>
        <label style={labelStyle}>Telefoonnummer</label>
        <Input
          value={telefoon}
          onChange={e => setTelefoon(e.target.value)}
          placeholder="+31 6 00000000"
          type="tel"
        />
      </div>

      {/* Read-only velden */}
      {(medewerker.functie || medewerker.afdeling) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {medewerker.functie && (
            <div>
              <label style={labelStyle}>Functie</label>
              <Input value={medewerker.functie} readOnly />
            </div>
          )}
          {medewerker.afdeling && (
            <div>
              <label style={labelStyle}>Afdeling</label>
              <Input value={medewerker.afdeling} readOnly />
            </div>
          )}
        </div>
      )}
      {(medewerker.functie || medewerker.afdeling) && (
        <p style={{ fontSize: 10, color: 'var(--fg-muted)', margin: 0 }}>
          Functie en afdeling worden beheerd door een beheerder.
        </p>
      )}

      <div>
        <Button type="submit" loading={isPending}>
          {isPending ? 'Opslaan…' : 'Wijzigingen opslaan'}
        </Button>
      </div>
    </form>
  )
}
