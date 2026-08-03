'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, useDialogen } from '@/components/ui'
import { organisatieTypeLabels, organisatieTypeTone, type OrganisatieType } from '@everts/database'
import {
  updateContactpersoon,
  ontkoppelContactpersoonVanOrganisatie,
  type ContactpersoonMetOrganisaties,
} from '@/lib/relaties/contactpersonen-actions'

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
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', paddingTop: 2 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: waarde ? 'var(--fg)' : 'var(--fg-muted)' }}>{waarde ?? '—'}</span>
    </div>
  )
}

function VeldInput({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <div style={veldLabel}>{label}</div>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} style={baseInput} placeholder={placeholder} />
    </div>
  )
}

const AANHEF_OPTIES = ['', 'De heer', 'Mevrouw', 'Dhr.', 'Mevr.', 'Dr.', 'Prof. dr.', 'Ir.', 'Mr.']

type Props = { contactpersoon: ContactpersoonMetOrganisaties }

export default function ContactpersoonDetailView({ contactpersoon: initial }: Props) {
  const [cp, setCp] = useState(initial)
  const [bewerken, setBewerken] = useState(false)
  const [form, setForm] = useState({
    aanhef: initial.aanhef ?? '',
    geslacht: initial.geslacht ?? '' as '' | 'man' | 'vrouw' | 'overig',
    voorletter: initial.voorletter ?? '',
    voornaam: initial.voornaam,
    tussenvoegsel: initial.tussenvoegsel ?? '',
    achternaam: initial.achternaam,
    // Werk
    email: initial.email ?? '',
    telefoon: initial.telefoon ?? '',
    mobiel: initial.mobiel ?? '',
    linkedin_url: initial.linkedin_url ?? '',
    // Privé
    prive_email: initial.prive_email ?? '',
    prive_telefoon: initial.prive_telefoon ?? '',
    prive_adres_straat: initial.prive_adres_straat ?? '',
    prive_adres_postcode: initial.prive_adres_postcode ?? '',
    prive_adres_plaats: initial.prive_adres_plaats ?? '',
    prive_adres_land: initial.prive_adres_land ?? 'Nederland',
    geboortedatum: initial.geboortedatum ?? '',
    opmerkingen: initial.opmerkingen ?? '',
  })
  const [bezig, setBezig] = useState(false)
  const router = useRouter()
  const { bevestig } = useDialogen()

  const volledigeNaam = [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ')
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  async function opslaan() {
    setBezig(true)
    const res = await updateContactpersoon(cp.id, {
      aanhef: form.aanhef || null,
      geslacht: (form.geslacht || null) as 'man' | 'vrouw' | 'overig' | null,
      voorletter: form.voorletter || null,
      voornaam: form.voornaam || undefined,
      tussenvoegsel: form.tussenvoegsel || null,
      achternaam: form.achternaam || undefined,
      email: form.email || null,
      telefoon: form.telefoon || null,
      mobiel: form.mobiel || null,
      linkedin_url: form.linkedin_url || null,
      prive_email: form.prive_email || null,
      prive_telefoon: form.prive_telefoon || null,
      prive_adres_straat: form.prive_adres_straat || null,
      prive_adres_postcode: form.prive_adres_postcode || null,
      prive_adres_plaats: form.prive_adres_plaats || null,
      prive_adres_land: form.prive_adres_land || null,
      geboortedatum: form.geboortedatum || null,
      opmerkingen: form.opmerkingen || null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setBewerken(false)
    router.refresh()
    toast.success('Gegevens opgeslagen')
  }

  async function ontkoppel(link: ContactpersoonMetOrganisaties['koppelingen'][0]) {
    if (!await bevestig({
      titel: `Ontkoppelen van ${link.organisatie.naam}?`,
      omschrijving: 'De contactpersoon blijft bestaan, alleen de koppeling met deze organisatie vervalt.',
      bevestigLabel: 'Ontkoppelen',
    })) return
    setBezig(true)
    const res = await ontkoppelContactpersoonVanOrganisatie(link.id, cp.id, link.organisatie.id)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setCp(prev => ({ ...prev, koppelingen: prev.koppelingen.filter(k => k.id !== link.id) }))
    router.refresh()
  }

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Breadcrumb */}
      <Link href="/relaties?tab=contactpersonen" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--fg-muted)', textDecoration: 'none', marginBottom: 20 }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7"/></svg>
        Contactpersonen
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-active)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--fg-soft)' }}>
          {volledigeNaam.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{volledigeNaam}</h1>
          {cp.aanhef && <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{cp.aanhef}</span>}
          {!cp.actief && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Inactief</span>}
        </div>
      </div>

      {/* Hoofd-layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Linker kolom ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Werkgegevens */}
          <Blok
            titel="Werkgegevens"
            actie={!bewerken
              ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button>
              : null}
          >
            {bewerken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                {/* Naam-sectie */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={veldLabel}>Aanhef</div>
                    <select value={form.aanhef} onChange={e => setForm(p => ({ ...p, aanhef: e.target.value }))} style={{ ...baseInput }}>
                      {AANHEF_OPTIES.map(o => <option key={o} value={o}>{o || '— geen —'}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={veldLabel}>Geslacht</div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {(['man', 'vrouw', 'overig'] as const).map(g => (
                        <label key={g} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg)', cursor: 'pointer' }}>
                          <input type="radio" name="geslacht" value={g} checked={form.geslacht === g} onChange={() => setForm(p => ({ ...p, geslacht: g }))} style={{ accentColor: 'var(--accent)' }} />
                          {g.charAt(0).toUpperCase() + g.slice(1)}
                        </label>
                      ))}
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-muted)', cursor: 'pointer' }}>
                        <input type="radio" name="geslacht" value="" checked={!form.geslacht} onChange={() => setForm(p => ({ ...p, geslacht: '' as any }))} />
                        Niet opgegeven
                      </label>
                    </div>
                  </div>
                  <VeldInput label="Voorletter(s)" value={form.voorletter} onChange={set('voorletter')} placeholder="J.A." />
                  <VeldInput label="Voornaam *" value={form.voornaam} onChange={set('voornaam')} />
                  <VeldInput label="Tussenvoegsel" value={form.tussenvoegsel} onChange={set('tussenvoegsel')} placeholder="van" />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <VeldInput label="Achternaam *" value={form.achternaam} onChange={set('achternaam')} />
                  </div>
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                {/* Contact werk */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <VeldInput label="E-mail werk" value={form.email} onChange={set('email')} type="email" />
                  <VeldInput label="Telefoon werk" value={form.telefoon} onChange={set('telefoon')} />
                  <VeldInput label="Mobiel" value={form.mobiel} onChange={set('mobiel')} />
                  <VeldInput label="LinkedIn URL" value={form.linkedin_url} onChange={set('linkedin_url')} />
                </div>

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={opslaan} disabled={bezig || !form.voornaam.trim() || !form.achternaam.trim()}>
                    {bezig ? 'Opslaan…' : 'Opslaan'}
                  </Button>
                  <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
                </div>
              </div>
            ) : (
              <div>
                {cp.aanhef && <Rij label="Aanhef" waarde={cp.aanhef} />}
                {cp.geslacht && <Rij label="Geslacht" waarde={cp.geslacht === 'man' ? 'Man' : cp.geslacht === 'vrouw' ? 'Vrouw' : 'Overig'} />}
                {cp.voorletter && <Rij label="Voorletter(s)" waarde={cp.voorletter} />}
                <Rij label="E-mail werk" waarde={cp.email} />
                <Rij label="Telefoon werk" waarde={cp.telefoon} />
                <Rij label="Mobiel" waarde={cp.mobiel} />
                {cp.linkedin_url && <Rij label="LinkedIn" waarde={cp.linkedin_url} />}
              </div>
            )}
          </Blok>

          {/* Privégegevens */}
          <Blok
            titel="Privégegevens"
            actie={!bewerken
              ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button>
              : null}
          >
            {bewerken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <VeldInput label="Privé e-mail" value={form.prive_email} onChange={set('prive_email')} type="email" />
                  <VeldInput label="Privé telefoon" value={form.prive_telefoon} onChange={set('prive_telefoon')} />
                  <div style={{ gridColumn: '1 / -1' }}>
                    <VeldInput label="Straat + nummer" value={form.prive_adres_straat} onChange={set('prive_adres_straat')} />
                  </div>
                  <VeldInput label="Postcode" value={form.prive_adres_postcode} onChange={set('prive_adres_postcode')} />
                  <VeldInput label="Plaats" value={form.prive_adres_plaats} onChange={set('prive_adres_plaats')} />
                  <VeldInput label="Land" value={form.prive_adres_land} onChange={set('prive_adres_land')} />
                  <VeldInput label="Geboortedatum" value={form.geboortedatum} onChange={set('geboortedatum')} type="date" />
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
                  <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
                </div>
              </div>
            ) : (
              <div>
                <Rij label="Privé e-mail" waarde={cp.prive_email} />
                <Rij label="Privé telefoon" waarde={cp.prive_telefoon} />
                <Rij label="Privé adres" waarde={[
                  cp.prive_adres_straat,
                  [cp.prive_adres_postcode, cp.prive_adres_plaats].filter(Boolean).join('  '),
                  cp.prive_adres_land !== 'Nederland' ? cp.prive_adres_land : null,
                ].filter(Boolean).join(', ') || null} />
                <Rij label="Geboortedatum" waarde={cp.geboortedatum} />
              </div>
            )}
          </Blok>

          {/* Opmerkingen */}
          <Blok
            titel="Opmerkingen"
            actie={!bewerken
              ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button>
              : null}
          >
            {bewerken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <textarea
                  value={form.opmerkingen}
                  onChange={e => setForm(p => ({ ...p, opmerkingen: e.target.value }))}
                  rows={4}
                  style={{ ...baseInput, resize: 'vertical' }}
                  placeholder="Interne notities…"
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
                  <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 13, color: cp.opmerkingen ? 'var(--fg)' : 'var(--fg-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
                {cp.opmerkingen || 'Geen opmerkingen'}
              </p>
            )}
          </Blok>
        </div>

        {/* ── Rechter sidebar: Gekoppelde organisaties ── */}
        <div style={{ position: 'sticky', top: 20 }}>
          <Blok titel={`Gekoppelde organisaties${cp.koppelingen.length > 0 ? ` · ${cp.koppelingen.length}` : ''}`}>
            {cp.koppelingen.length === 0 ? (
              <EmptyState size="sm" tone="neutral" title="Geen organisaties" description="Koppel via de organisatiepagina." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cp.koppelingen.map(link => (
                  <div key={link.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                        <Link href={`/relaties/${link.organisatie.id}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}>
                          {link.organisatie.naam}
                        </Link>
                        {link.is_primair && <Badge tone="brand" size="sm">Primair</Badge>}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: link.functie ? 4 : 0 }}>
                        {(link.organisatie.types as OrganisatieType[]).map((t: OrganisatieType) => (
                          <Badge key={t} tone={organisatieTypeTone[t]} size="sm">{organisatieTypeLabels[t]}</Badge>
                        ))}
                      </div>
                      {link.functie && <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{link.functie}</span>}
                    </div>
                    <Button onClick={() => ontkoppel(link)} variant="ghost" size="icon-sm" title="Ontkoppelen" disabled={bezig}>
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Blok>
        </div>
      </div>
    </div>
  )
}
