'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Card, CardBody, CardHeader } from '@/components/ui'
import type { Particulier } from '@everts/database'
import { updateParticulier } from '@/lib/relaties/particulieren-actions'

const baseInput: React.CSSProperties = {
  width: '100%', padding: '7px 10px',
  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 7,
  color: 'var(--fg)', fontFamily: 'var(--font-ui)', fontSize: 13,
  outline: 'none', boxSizing: 'border-box',
}

const veldLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3,
}

function Blok({ titel, actie, children }: { titel: string; actie?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><span>{titel}</span>{actie}</CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  )
}

function Rij({ label, waarde }: { label: string; waarde?: string | null }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: waarde ? 'var(--fg)' : 'var(--fg-muted)' }}>{waarde ?? '—'}</span>
    </div>
  )
}

type Props = { particulier: Particulier }

export default function ParticulierDetailView({ particulier: initial }: Props) {
  const [p, setP] = useState(initial)
  const [bewerken, setBewerken] = useState(false)
  const [form, setForm] = useState({
    voornaam: initial.voornaam,
    tussenvoegsel: initial.tussenvoegsel ?? '',
    achternaam: initial.achternaam,
    email: initial.email ?? '',
    telefoon: initial.telefoon ?? '',
    mobiel: initial.mobiel ?? '',
    adres_straat: initial.adres_straat ?? '',
    adres_postcode: initial.adres_postcode ?? '',
    adres_plaats: initial.adres_plaats ?? '',
    adres_land: initial.adres_land ?? 'Nederland',
    geboortedatum: initial.geboortedatum ?? '',
    opmerkingen: initial.opmerkingen ?? '',
  })
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  const volledigeNaam = [p.voornaam, p.tussenvoegsel, p.achternaam].filter(Boolean).join(' ')

  async function opslaan() {
    setBezig(true)
    const res = await updateParticulier(p.id, {
      voornaam: form.voornaam || undefined,
      tussenvoegsel: form.tussenvoegsel || null,
      achternaam: form.achternaam || undefined,
      email: form.email || null,
      telefoon: form.telefoon || null,
      mobiel: form.mobiel || null,
      adres_straat: form.adres_straat || null,
      adres_postcode: form.adres_postcode || null,
      adres_plaats: form.adres_plaats || null,
      adres_land: form.adres_land || null,
      geboortedatum: form.geboortedatum || null,
      opmerkingen: form.opmerkingen || null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setBewerken(false)
    router.refresh()
    toast.success('Gegevens opgeslagen')
  }

  return (
    <div style={{ padding: '28px 32px', maxWidth: 860 }}>
      {/* Breadcrumb */}
      <Link href="/relaties?tab=particulieren" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--fg-muted)', textDecoration: 'none', marginBottom: 20 }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7"/></svg>
        Particulieren
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, #64748b, #94a3b8)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'white' }}>
          {volledigeNaam.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 6px', letterSpacing: '-0.02em' }}>{volledigeNaam}</h1>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)', background: 'var(--bg-subtle)', padding: '2px 8px', borderRadius: 10 }}>Particulier</span>
          {!p.actief && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Inactief</span>}
        </div>
      </div>

      <Blok titel="Basisgegevens" actie={!bewerken ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button> : null}>
        {bewerken ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 10 }}>
              <div><div style={veldLabel}>Voornaam</div><input value={form.voornaam} onChange={e => setForm(p => ({ ...p, voornaam: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Tussenvoegsel</div><input value={form.tussenvoegsel} onChange={e => setForm(p => ({ ...p, tussenvoegsel: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Achternaam</div><input value={form.achternaam} onChange={e => setForm(p => ({ ...p, achternaam: e.target.value }))} style={baseInput} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><div style={veldLabel}>E-mail</div><input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Telefoon</div><input value={form.telefoon} onChange={e => setForm(p => ({ ...p, telefoon: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Mobiel</div><input value={form.mobiel} onChange={e => setForm(p => ({ ...p, mobiel: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Geboortedatum</div><input type="date" value={form.geboortedatum} onChange={e => setForm(p => ({ ...p, geboortedatum: e.target.value }))} style={baseInput} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ gridColumn: '1 / -1' }}><div style={veldLabel}>Straat + nummer</div><input value={form.adres_straat} onChange={e => setForm(p => ({ ...p, adres_straat: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Postcode</div><input value={form.adres_postcode} onChange={e => setForm(p => ({ ...p, adres_postcode: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Plaats</div><input value={form.adres_plaats} onChange={e => setForm(p => ({ ...p, adres_plaats: e.target.value }))} style={baseInput} /></div>
              <div><div style={veldLabel}>Land</div><input value={form.adres_land} onChange={e => setForm(p => ({ ...p, adres_land: e.target.value }))} style={baseInput} /></div>
            </div>
            <div><div style={veldLabel}>Opmerkingen</div><textarea value={form.opmerkingen} onChange={e => setForm(p => ({ ...p, opmerkingen: e.target.value }))} rows={3} style={{ ...baseInput, resize: 'vertical' }} /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
              <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
            </div>
          </div>
        ) : (
          <div>
            <Rij label="E-mailadres" waarde={p.email} />
            <Rij label="Telefoon" waarde={p.telefoon} />
            <Rij label="Mobiel" waarde={p.mobiel} />
            <Rij label="Geboortedatum" waarde={p.geboortedatum} />
            <Rij label="Adres" waarde={[p.adres_straat, [p.adres_postcode, p.adres_plaats].filter(Boolean).join('  '), p.adres_land !== 'Nederland' ? p.adres_land : null].filter(Boolean).join(', ') || null} />
            {p.opmerkingen && <Rij label="Opmerkingen" waarde={p.opmerkingen} />}
          </div>
        )}
      </Blok>
    </div>
  )
}
