'use client'

import React, { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, useDialogen } from '@/components/ui'
import {
  organisatieTypeLabels, organisatieTypeTone, contactpersoonSoortLabels, kerstkaartAdresLabels,
  type OrganisatieType, type ContactpersoonSoort, type KerstkaartAdres,
} from '@everts/database'
import {
  updateContactpersoon,
  ontkoppelContactpersoonVanOrganisatie,
  updateContactpersoonLink,
  type ContactpersoonMetOrganisaties,
} from '@/lib/relaties/contactpersonen-actions'
import { zetContactpersoonSoort } from '@/lib/relaties/ontdubbelen'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import DossierLijstBlok from '@/components/relaties/DossierLijstBlok'
import SamenvoegenModal from '@/components/relaties/SamenvoegenModal'
import EmailadressenBlok from '@/components/relaties/EmailadressenBlok'
import AdreskoppelingenBlok from '@/components/relaties/AdreskoppelingenBlok'

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

/**
 * Adres als één leesbare regel; leeg blijft leeg. Nederland laten we weg — dat is de regel,
 * geen informatie.
 */
function adresRegel(a: { straat?: string | null; postcode?: string | null; plaats?: string | null; land?: string | null }): string | null {
  return [
    a.straat,
    [a.postcode, a.plaats].filter(Boolean).join('  '),
    a.land && a.land !== 'Nederland' ? a.land : null,
  ].filter(Boolean).join(', ') || null
}

const AANHEF_OPTIES = ['', 'De heer', 'Mevrouw', 'Dhr.', 'Mevr.', 'Dr.', 'Prof. dr.', 'Ir.', 'Mr.']

type Koppeling = ContactpersoonMetOrganisaties['koppelingen'][number]

/**
 * Eén werkgever van deze persoon, met de gegevens die specifiek bij dát bedrijf horen.
 *
 * Werkt iemand voor twee opdrachtgevers, dan heeft hij daar vaak een ander zakelijk
 * e-mailadres en doorkiesnummer. Leeg laten betekent: gebruik het adres van de persoon zelf.
 * Bouw7 bewaart die gegevens op zijn eigen contactpersoon-rij per bedrijf; in EVA landen ze
 * hier, zodat de twee bedrijven elkaar niet overschrijven.
 */
function KoppelingKaart({ link, contactpersoonId, spiegelBouw7Id, bezig, onOntkoppel, onOpgeslagen }: {
  link: Koppeling
  contactpersoonId: string
  spiegelBouw7Id: string | null
  bezig: boolean
  onOntkoppel: () => void
  onOpgeslagen: () => void
}) {
  const [open, setOpen] = useState(false)
  const [opslaan, setOpslaan] = useState(false)
  const [form, setForm] = useState({
    functie:  link.functie ?? '',
    email:    link.email ?? '',
    telefoon: link.telefoon ?? '',
    mobiel:   link.mobiel ?? '',
  })

  async function bewaar() {
    setOpslaan(true)
    const res = await updateContactpersoonLink(link.id, contactpersoonId, {
      functie:  form.functie || null,
      email:    form.email || null,
      telefoon: form.telefoon || null,
      mobiel:   form.mobiel || null,
    })
    setOpslaan(false)
    if (!res.ok) { toast.error(res.error); return }
    if (res.waarschuwing) toast(res.waarschuwing)
    else toast.success('Opgeslagen')
    setOpen(false)
    onOpgeslagen()
  }

  return (
    <div style={{ padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
            <Link href={`/relaties/${link.organisatie.id}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}>
              {link.organisatie.naam}
            </Link>
            {link.is_primair && <Badge tone="brand" size="sm">Primair</Badge>}
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {(link.organisatie.types as OrganisatieType[]).map((t: OrganisatieType) => (
              <Badge key={t} tone={organisatieTypeTone[t]} size="sm">{organisatieTypeLabels[t]}</Badge>
            ))}
          </div>
          {link.functie && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{link.functie}</div>}
          {(link.email || link.telefoon || link.mobiel) && (
            <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
              {[link.email, link.telefoon, link.mobiel].filter(Boolean).join(' · ')}
              {' '}
              <span style={{ fontSize: 10, color: 'var(--fg-muted)' }}>(bij dit bedrijf)</span>
            </div>
          )}
          {spiegelBouw7Id && (
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 3 }}>
              Bouw7-contactpersoon #{spiegelBouw7Id}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 2 }}>
          <Button onClick={() => setOpen(o => !o)} variant="ghost" size="icon-sm" title="Gegevens bij dit bedrijf" disabled={bezig}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 13.5V16h2.5l7.4-7.4-2.5-2.5L4 13.5zM15.7 6.3a1 1 0 000-1.4l-1.6-1.6a1 1 0 00-1.4 0l-1.2 1.2 2.5 2.5 1.7-1.7z"/></svg>
          </Button>
          <Button onClick={onOntkoppel} variant="ghost" size="icon-sm" title="Ontkoppelen" disabled={bezig}>
            <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </Button>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <VeldInput label="Functie" value={form.functie} onChange={v => setForm(p => ({ ...p, functie: v }))} />
          <VeldInput label="E-mail bij dit bedrijf" value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} type="email" placeholder={'leeg = ' + 'persoonlijk adres'} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <VeldInput label="Telefoon" value={form.telefoon} onChange={v => setForm(p => ({ ...p, telefoon: v }))} />
            <VeldInput label="Mobiel" value={form.mobiel} onChange={v => setForm(p => ({ ...p, mobiel: v }))} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="primary" size="sm" onClick={bewaar} disabled={opslaan}>{opslaan ? 'Opslaan…' : 'Opslaan'}</Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>Annuleer</Button>
          </div>
        </div>
      )}
    </div>
  )
}

type Props = {
  contactpersoon: ContactpersoonMetOrganisaties
  /** Dossiers waarop deze persoon de contactpersoon is. */
  dossiers: RelatieDossier[]
}

export default function ContactpersoonDetailView({ contactpersoon: initial, dossiers }: Props) {
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
    kerstkaart: initial.kerstkaart ?? false,
    kerstkaart_adres: (initial.kerstkaart_adres ?? 'zakelijk') as KerstkaartAdres,
    opmerkingen: initial.opmerkingen ?? '',
  })
  const [bezig, setBezig] = useState(false)
  const [samenvoegen, setSamenvoegen] = useState(false)
  const router = useRouter()
  const { bevestig } = useDialogen()

  /** Het Bouw7-contactpersoon-id dat bij een organisatie hoort — één mens, meerdere rijen daar. */
  const spiegelPerOrganisatie = new Map<string, string>(
    (cp.spiegels ?? [])
      .filter(s => s.organisatie_id)
      .map(s => [s.organisatie_id as string, s.bouw7_id])
  )

  async function wijzigSoort(soort: ContactpersoonSoort) {
    setBezig(true)
    const res = await zetContactpersoonSoort(cp.id, soort)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setCp(prev => ({ ...prev, soort }))
    toast.success(`Vastgelegd als ${contactpersoonSoortLabels[soort].toLowerCase()}`)
    router.refresh()
  }

  const volledigeNaam = [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ')
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }))

  // ── Kerstkaart: waar komt hij aan? ──
  // De werkgever is de primaire koppeling; die staat vooraan (gesorteerd op is_primair).
  const werkgever = cp.koppelingen[0] ?? null
  const zakelijkAdres = werkgever ? adresRegel({
    straat: werkgever.organisatie.adres_straat,
    postcode: werkgever.organisatie.adres_postcode,
    plaats: werkgever.organisatie.adres_plaats,
    land: werkgever.organisatie.adres_land,
  }) : null
  /** Het adres waar de kaart heen gaat; null betekent: we hebben het niet, dus hij kan niet weg. */
  function kaartAdres(keuze: KerstkaartAdres, prive: { straat: string | null; postcode: string | null; plaats: string | null; land: string | null }): string | null {
    if (keuze === 'zakelijk') return werkgever && zakelijkAdres ? `${werkgever.organisatie.naam}, ${zakelijkAdres}` : null
    return adresRegel(prive)
  }
  const kaartAdresOpgeslagen = kaartAdres(cp.kerstkaart_adres, {
    straat: cp.prive_adres_straat, postcode: cp.prive_adres_postcode,
    plaats: cp.prive_adres_plaats, land: cp.prive_adres_land,
  })
  const kaartAdresForm = kaartAdres(form.kerstkaart_adres, {
    straat: form.prive_adres_straat || null, postcode: form.prive_adres_postcode || null,
    plaats: form.prive_adres_plaats || null, land: form.prive_adres_land || null,
  })
  /** Waarom er geen adres is — dat is bruikbaarder dan een streepje bij "Gaat naar". */
  function kaartWaarschuwing(keuze: KerstkaartAdres): string {
    const oorzaak = keuze === 'zakelijk'
      ? werkgever
        ? `Bij ${werkgever.organisatie.naam} staat geen adres — vul dat op de relatiekaart in.`
        : 'Deze persoon is aan geen enkele organisatie gekoppeld.'
      : 'Er staat nog geen privé-adres bij Privégegevens.'
    return `${oorzaak} De kaart heeft zo geen bezorgadres.`
  }
  // Radio's krijgen een unieke naam: een vaste name is paginabreed en botst met andere groepen.
  const radioNaam = useId()

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
      kerstkaart: form.kerstkaart,
      kerstkaart_adres: form.kerstkaart_adres,
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

      {/* Deze rij is samengevoegd: dan is er maar één ding relevant, namelijk waar hij nu leeft. */}
      {cp.samengevoegd_naar && (
        <div style={{ marginBottom: 20, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-subtle)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 2 }}>
            Deze contactpersoon is samengevoegd
          </div>
          <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            De gegevens staan nu bij{' '}
            <Link href={`/relaties/contactpersonen/${cp.samengevoegd_naar.id}`} style={{ color: 'var(--fg)', fontWeight: 600 }}>
              {cp.samengevoegd_naar.naam}
            </Link>. Terugdraaien kan via Relaties → Dubbelen.
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-active)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--fg-soft)' }}>
          {volledigeNaam.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 4px', letterSpacing: '-0.02em' }}>{volledigeNaam}</h1>
          {cp.aanhef && <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{cp.aanhef}</span>}
          {!cp.actief && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Inactief</span>}
          {cp.soort !== 'persoon' && (
            <span style={{ marginLeft: 8 }}><Badge tone="warning" size="sm">{contactpersoonSoortLabels[cp.soort]}</Badge></span>
          )}
        </div>
        {!cp.samengevoegd_naar && (
          <div style={{ display: 'flex', gap: 6 }}>
            {cp.soort === 'persoon' ? (
              <Button variant="ghost" size="sm" onClick={() => wijzigSoort('postbus')} disabled={bezig} title="Geen mens maar een gedeeld mailadres; komt dan niet meer als dubbel terug">
                Is een postbus
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={() => wijzigSoort('persoon')} disabled={bezig}>
                Toch een persoon
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setSamenvoegen(true)} disabled={bezig}>
              Samenvoegen met…
            </Button>
          </div>
        )}
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

          {/* Alle e-mailadressen — het veld "E-mail werk" hierboven is hiervan het primaire. */}
          <Blok titel="E-mailadressen">
            <EmailadressenBlok contactpersoonId={cp.id} />
          </Blok>

          {/* Waar staat deze persoon voor? Bij een VvE of een vastgoedportefeuille hangt het
              factuuradres aan een bestuurder of assetmanager, niet aan het bedrijf. */}
          <Blok titel="Factuuradressen">
            <AdreskoppelingenBlok contactpersoonId={cp.id} />
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
                <Rij label="Privé adres" waarde={adresRegel({
                  straat: cp.prive_adres_straat, postcode: cp.prive_adres_postcode,
                  plaats: cp.prive_adres_plaats, land: cp.prive_adres_land,
                })} />
                <Rij label="Geboortedatum" waarde={cp.geboortedatum} />
              </div>
            )}
          </Blok>

          {/* Kerstkaart — staat los van Privégegevens: de kaart gaat lang niet altijd naar huis.
              Een factuuradres is bewust geen keuze: dat is een administratief adres (vaak een
              postbus of het boekhoudkantoor) en daar hoort geen kaart heen. */}
          <Blok
            titel="Kerstkaart"
            actie={!bewerken
              ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button>
              : null}
          >
            {bewerken ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    id="kerstkaart"
                    type="checkbox"
                    checked={form.kerstkaart}
                    onChange={e => setForm(f => ({ ...f, kerstkaart: e.target.checked }))}
                    style={{ accentColor: 'var(--accent)' }}
                  />
                  <span style={{ fontSize: 13 }}>Krijgt de kerstkaart</span>
                </label>

                {form.kerstkaart && (
                  <div>
                    <div style={veldLabel}>Verzendadres</div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 6 }}>
                      {(['prive', 'zakelijk'] as const).map(keuze => (
                        <label key={keuze} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg)', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name={`kerstkaart-adres-${radioNaam}`}
                            value={keuze}
                            checked={form.kerstkaart_adres === keuze}
                            onChange={() => setForm(f => ({ ...f, kerstkaart_adres: keuze }))}
                            style={{ accentColor: 'var(--accent)' }}
                          />
                          {kerstkaartAdresLabels[keuze]}
                        </label>
                      ))}
                    </div>
                    {kaartAdresForm ? (
                      <p style={{ fontSize: 12, color: 'var(--fg-soft)', margin: 0, lineHeight: 1.5 }}>{kaartAdresForm}</p>
                    ) : (
                      <p style={{ fontSize: 12, color: 'var(--warning-700)', margin: 0, lineHeight: 1.5 }}>
                        {kaartWaarschuwing(form.kerstkaart_adres)}
                      </p>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
                  <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
                </div>
              </div>
            ) : (
              <div>
                <Rij label="Kerstkaart" waarde={cp.kerstkaart ? 'Ja' : 'Nee'} />
                {cp.kerstkaart && (
                  <>
                    <Rij label="Verzendadres" waarde={kerstkaartAdresLabels[cp.kerstkaart_adres]} />
                    <Rij label="Gaat naar" waarde={kaartAdresOpgeslagen} />
                    {!kaartAdresOpgeslagen && (
                      <p style={{ fontSize: 12, color: 'var(--warning-700)', margin: '8px 0 0', lineHeight: 1.5 }}>
                        {kaartWaarschuwing(cp.kerstkaart_adres)}
                      </p>
                    )}
                  </>
                )}
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

          {/* Dossiers waarop deze persoon de contactpersoon is */}
          <DossierLijstBlok titel="Dossiers" dossiers={dossiers} />
        </div>

        {/* ── Rechter sidebar: Gekoppelde organisaties ── */}
        <div style={{ position: 'sticky', top: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Blok titel={`Werkt voor${cp.koppelingen.length > 0 ? ` · ${cp.koppelingen.length}` : ''}`}>
            {cp.koppelingen.length === 0 ? (
              <EmptyState size="sm" tone="neutral" title="Geen organisaties" description="Koppel via de organisatiepagina." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {cp.koppelingen.map(link => (
                  <KoppelingKaart
                    key={link.id}
                    link={link}
                    contactpersoonId={cp.id}
                    spiegelBouw7Id={spiegelPerOrganisatie.get(link.organisatie.id) ?? null}
                    bezig={bezig}
                    onOntkoppel={() => ontkoppel(link)}
                    onOpgeslagen={() => router.refresh()}
                  />
                ))}
              </div>
            )}
          </Blok>

          {/* Bouw7 kent geen gedeelde contactpersoon: bij twee werkgevers staan er twee rijen. */}
          {(cp.spiegels?.length ?? 0) > 1 && (
            <Blok titel={`Bouw7-koppelingen · ${cp.spiegels.length}`}>
              <p style={{ fontSize: 11, color: 'var(--fg-muted)', margin: '0 0 8px', lineHeight: 1.6 }}>
                Bouw7 kan één mens niet aan meerdere bedrijven hangen en heeft daarom per bedrijf
                een eigen contactpersoon. EVA houdt ze bij elkaar; een wijziging hier gaat naar
                allemaal.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {cp.spiegels.map(s => {
                  const org = cp.koppelingen.find(k => k.organisatie.id === s.organisatie_id)
                  return (
                    <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--fg-soft)' }}>
                      <span>{org?.organisatie.naam ?? 'Onbekend bedrijf'}</span>
                      <span style={{ color: 'var(--fg-muted)' }}>
                        #{s.bouw7_id}{s.is_primair ? ' · primair' : ''}
                      </span>
                    </div>
                  )
                })}
              </div>
            </Blok>
          )}
        </div>
      </div>

      {samenvoegen && (
        <SamenvoegenModal blijverId={cp.id} blijverNaam={volledigeNaam} onSluit={() => setSamenvoegen(false)} />
      )}
    </div>
  )
}
