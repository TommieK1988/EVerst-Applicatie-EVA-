'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { cn } from '@everts/ui'
import type {
  Relatie,
  RelatieFactuuradres,
  RelatieBankgegevens,
  RelatieFacturatie,
  RelatieInkoop,
  RelatieVerkoopPrijsafspraak,
  RelatieInkoopKortingsafspraak,
  RelatieInkoopPrijsafspraak,
  OrganisatieType,
  Contactpersoon,
  ContactpersoonOrganisatie,
  OmzetData,
} from '@everts/database'
import { organisatieTypeLabels, organisatieTypeTone, opdrachtSubstatusLabels } from '@everts/database'
import {
  Alert, Button, Card, CardBody, CardHeader, Badge, EmptyState,
  FormField, FormRow, FormSection, Input, Textarea, Checkbox,
} from '@/components/ui'
import {
  updateOrganisatieGegevens,
  updateOrganisatieTypes,
  upsertFactuuradres,
  deleteFactuuradres,
  upsertBankgegevens,
  upsertFacturatie,
  upsertInkoop,
  upsertVerkoopPrijsafspraak,
  deleteVerkoopPrijsafspraak,
  upsertKortingsafspraak,
  deleteKortingsafspraak,
  upsertInkoopPrijsafspraak,
  deleteInkoopPrijsafspraak,
} from '@/lib/relaties/actions'
import { ontkoppelContactpersoonVanOrganisatie } from '@/lib/relaties/contactpersonen-actions'

/* ─── Shared UI primitives ───────────────────────────────────────────── */

function Blok({ titel, actie, children }: { titel: string; actie?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <span>{titel}</span>
        {actie}
      </CardHeader>
      <CardBody>{children}</CardBody>
    </Card>
  )
}

function Rij({ label, waarde }: { label: string; waarde?: string | null }) {
  return (
    <div
      className="grid gap-2 py-1.5 border-b border-neutral-100 last:border-0"
      style={{ gridTemplateColumns: '150px 1fr' }}
    >
      <span className="text-[10.5px] font-bold text-neutral-500 uppercase tracking-[0.08em] pt-px">
        {label}
      </span>
      <span className={cn('text-[13px] font-medium', waarde ? 'text-neutral-900' : 'text-neutral-400')}>
        {waarde ?? '—'}
      </span>
    </div>
  )
}

/* ─── Type badges ────────────────────────────────────────────────────── */

const ALLE_TYPES: OrganisatieType[] = ['opdrachtgever', 'leverancier', 'onderaannemer']

function TypeBadgeRij({ types }: { types: OrganisatieType[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {types.map(t => (
        <Badge key={t} tone={organisatieTypeTone[t]}>{organisatieTypeLabels[t]}</Badge>
      ))}
    </div>
  )
}

/* ─── Types bewerken blok ────────────────────────────────────────────── */

function TypesBlok({ relatieId, initial }: { relatieId: string; initial: OrganisatieType[] }) {
  const [types, setTypes] = useState<OrganisatieType[]>(initial)
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  async function opslaan(nieuweTypes: OrganisatieType[]) {
    if (nieuweTypes.length === 0) return
    setBezig(true)
    const res = await updateOrganisatieTypes(relatieId, nieuweTypes)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setTypes(nieuweTypes)
    router.refresh()
    toast.success('Types bijgewerkt')
  }

  function toggle(type: OrganisatieType) {
    const nieuweTypes = types.includes(type)
      ? types.filter(t => t !== type)
      : [...types, type]
    if (nieuweTypes.length === 0) return
    opslaan(nieuweTypes)
  }

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {ALLE_TYPES.map(t => {
        const actief = types.includes(t)
        return (
          <button
            key={t}
            onClick={() => !bezig && toggle(t)}
            disabled={bezig || (actief && types.length === 1)}
            style={{
              padding: '4px 12px', borderRadius: 20, border: 'none', cursor: bezig ? 'wait' : 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
              transition: 'all 0.15s',
              opacity: bezig ? 0.6 : 1,
              background: actief
                ? (t === 'opdrachtgever' ? '#ecfaf0' : t === 'leverancier' ? '#eff8ff' : '#fff6ec')
                : 'var(--bg-subtle)',
              color: actief
                ? (t === 'opdrachtgever' ? '#0a5e28' : t === 'leverancier' ? '#175cd3' : '#b85a00')
                : 'var(--fg-muted)',
              outline: actief ? '2px solid currentColor' : '1px solid var(--border)',
              outlineOffset: actief ? -1 : 0,
            }}
          >
            {organisatieTypeLabels[t]}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Basisgegevens blok ─────────────────────────────────────────────── */

function BasisgegevensBlok({ relatie }: { relatie: Relatie }) {
  const [bewerken, setBewerken] = useState(false)
  const [form, setForm] = useState({
    naam: relatie.naam,
    kvk_nummer: relatie.kvk_nummer ?? '',
    btw_nummer: relatie.btw_nummer ?? '',
    email: relatie.email ?? '',
    telefoon: relatie.telefoon ?? '',
    website: relatie.website ?? '',
    adres_straat: relatie.adres_straat ?? '',
    adres_postcode: relatie.adres_postcode ?? '',
    adres_plaats: relatie.adres_plaats ?? '',
    adres_land: relatie.adres_land ?? 'Nederland',
    betalingstermijn_dagen: relatie.betalingstermijn_dagen != null ? String(relatie.betalingstermijn_dagen) : '',
  })
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const router = useRouter()

  async function opslaan() {
    setBezig(true); setFout(null)
    const res = await updateOrganisatieGegevens(relatie.id, {
      naam: form.naam || undefined,
      kvk_nummer: form.kvk_nummer || null,
      btw_nummer: form.btw_nummer || null,
      email: form.email || null,
      telefoon: form.telefoon || null,
      website: form.website || null,
      adres_straat: form.adres_straat || null,
      adres_postcode: form.adres_postcode || null,
      adres_plaats: form.adres_plaats || null,
      adres_land: form.adres_land || null,
      betalingstermijn_dagen: form.betalingstermijn_dagen.trim() === '' ? null : Number(form.betalingstermijn_dagen),
    })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setBewerken(false)
    router.refresh()
    toast.success('Gegevens opgeslagen')
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <Blok
      titel="Basisgegevens"
      actie={
        !bewerken
          ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button>
          : null
      }
    >
      {fout && <Alert tone="error" className="mb-3">{fout}</Alert>}
      {bewerken ? (
        <div className="flex flex-col gap-4">
          <FormRow cols="2">
            <FormField label="Naam" upper required className="col-span-full">
              <Input value={form.naam} onChange={set('naam')} />
            </FormField>
            <FormField label="KvK-nummer" upper>
              <Input value={form.kvk_nummer} onChange={set('kvk_nummer')} />
            </FormField>
            <FormField label="BTW-nummer" upper>
              <Input value={form.btw_nummer} onChange={set('btw_nummer')} />
            </FormField>
            <FormField label="E-mailadres" upper>
              <Input value={form.email} onChange={set('email')} />
            </FormField>
            <FormField label="Telefoon" upper>
              <Input value={form.telefoon} onChange={set('telefoon')} />
            </FormField>
            <FormField label="Website" upper className="col-span-full">
              <Input value={form.website} onChange={set('website')} />
            </FormField>
            <FormField label="Straat + nummer" upper className="col-span-full">
              <Input value={form.adres_straat} onChange={set('adres_straat')} />
            </FormField>
            <FormField label="Postcode" upper>
              <Input value={form.adres_postcode} onChange={set('adres_postcode')} />
            </FormField>
            <FormField label="Plaats" upper>
              <Input value={form.adres_plaats} onChange={set('adres_plaats')} />
            </FormField>
            <FormField label="Land" upper>
              <Input value={form.adres_land} onChange={set('adres_land')} />
            </FormField>
            <FormField label="Betalingstermijn (dagen)" upper>
              <Input type="number" inputMode="numeric" value={form.betalingstermijn_dagen} onChange={set('betalingstermijn_dagen')} placeholder="bijv. 30" />
            </FormField>
          </FormRow>
          <div className="flex gap-2">
            <Button variant="primary" onClick={opslaan} disabled={bezig || !form.naam.trim()}>
              {bezig ? 'Opslaan…' : 'Opslaan'}
            </Button>
            <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
          </div>
        </div>
      ) : (
        <div>
          <Rij label="KvK-nummer" waarde={relatie.kvk_nummer} />
          <Rij label="BTW-nummer" waarde={relatie.btw_nummer} />
          <Rij label="E-mailadres" waarde={relatie.email} />
          <Rij label="Telefoon" waarde={relatie.telefoon} />
          <Rij label="Website" waarde={relatie.website} />
          <Rij label="Adres" waarde={[
            relatie.adres_straat,
            [relatie.adres_postcode, relatie.adres_plaats].filter(Boolean).join('  '),
            relatie.adres_land !== 'Nederland' ? relatie.adres_land : null,
          ].filter(Boolean).join(', ') || null} />
          <Rij label="Betalingstermijn" waarde={relatie.betalingstermijn_dagen != null ? `${relatie.betalingstermijn_dagen} dagen` : null} />
        </div>
      )}
    </Blok>
  )
}

/* ─── Opmerkingen blok ───────────────────────────────────────────────── */

function OmerkingenBlok({ relatie }: { relatie: Relatie }) {
  const [bewerken, setBewerken] = useState(false)
  const [tekst, setTekst] = useState(relatie.opmerkingen ?? '')
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  async function opslaan() {
    setBezig(true)
    const res = await updateOrganisatieGegevens(relatie.id, { opmerkingen: tekst || null })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setBewerken(false)
    router.refresh()
  }

  return (
    <Blok
      titel="Opmerkingen"
      actie={!bewerken
        ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button>
        : null
      }
    >
      {bewerken ? (
        <div className="flex flex-col gap-4">
          <FormField label="Interne notities" upper>
            <Textarea
              value={tekst}
              onChange={e => setTekst(e.target.value)}
              rows={4}
              placeholder="Interne notities over deze relatie…"
            />
          </FormField>
          <div className="flex gap-2">
            <Button variant="primary" onClick={opslaan} disabled={bezig}>
              {bezig ? 'Opslaan…' : 'Opslaan'}
            </Button>
            <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, color: relatie.opmerkingen ? 'var(--fg)' : 'var(--fg-muted)', margin: 0, whiteSpace: 'pre-wrap' }}>
          {relatie.opmerkingen || 'Geen opmerkingen'}
        </p>
      )}
    </Blok>
  )
}

/* ─── Contactpersonen blok ───────────────────────────────────────────── */

type ContactpersoonLink = ContactpersoonOrganisatie & { contactpersoon: Contactpersoon }

function ContactpersonenBlok({ relatieId, initial }: { relatieId: string; initial: ContactpersoonLink[] }) {
  const [links, setLinks] = useState<ContactpersoonLink[]>(initial)
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  async function ontkoppel(link: ContactpersoonLink) {
    if (!confirm(`${link.contactpersoon.voornaam} ${link.contactpersoon.achternaam} ontkoppelen?`)) return
    setBezig(true)
    const res = await ontkoppelContactpersoonVanOrganisatie(link.id, link.contactpersoon_id, relatieId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setLinks(prev => prev.filter(l => l.id !== link.id))
    router.refresh()
  }

  return (
    <Blok
      titel={`Contactpersonen${links.length > 0 ? ` · ${links.length}` : ''}`}
      actie={
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/relaties/contactpersonen?koppel=${relatieId}`}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Toevoegen
          </Link>
        </Button>
      }
    >
      {links.length === 0 ? (
        <EmptyState size="sm" tone="neutral" title="Geen contactpersonen" description="Koppel een contactpersoon aan deze organisatie." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {links.map(link => {
            const cp = link.contactpersoon
            const naam = [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ')
            return (
              <div key={link.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                    background: 'var(--bg-active)', display: 'grid', placeItems: 'center',
                    fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--fg-soft)',
                  }}>
                    {naam.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{naam}</span>
                      {link.is_primair && (
                        <Badge tone="brand" size="sm">Primair</Badge>
                      )}
                    </div>
                    {link.functie && (
                      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{link.functie}</span>
                    )}
                    {cp.email && (
                      <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{cp.email}</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Button asChild variant="ghost" size="icon-sm" title="Bekijk contactpersoon">
                    <Link href={`/relaties/contactpersonen/${cp.id}`}>
                      <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 3H3v14h14v-4M17 3l-7 7M11 3h6v6"/>
                      </svg>
                    </Link>
                  </Button>
                  <Button
                    onClick={() => !bezig && ontkoppel(link)}
                    variant="ghost"
                    size="icon-sm"
                    title="Ontkoppelen"
                    disabled={bezig}
                  >
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Blok>
  )
}

/* ─── Factuuradressen blok ───────────────────────────────────────────── */

type AdresForm = { label: string; straat: string; postcode: string; plaats: string; land: string; opmerkingen: string }
const leegAdresForm = (): AdresForm => ({ label: '', straat: '', postcode: '', plaats: '', land: 'Nederland', opmerkingen: '' })

function FactuuradresForm({ initial, onOpslaan, onAnnuleer, bezig }: {
  initial: AdresForm; onOpslaan: (v: AdresForm) => void; onAnnuleer: () => void; bezig: boolean
}) {
  const [form, setForm] = useState<AdresForm>(initial)
  const set = (key: keyof AdresForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div className="flex flex-col gap-4 p-3 bg-white border border-neutral-200 rounded-xl mt-2">
      <FormRow cols="2">
        <FormField label="Label" upper required className="col-span-full">
          <Input value={form.label} onChange={set('label')} />
        </FormField>
        <FormField label="Straat + nummer" upper className="col-span-full">
          <Input value={form.straat} onChange={set('straat')} />
        </FormField>
        <FormField label="Postcode" upper>
          <Input value={form.postcode} onChange={set('postcode')} />
        </FormField>
        <FormField label="Plaats" upper>
          <Input value={form.plaats} onChange={set('plaats')} />
        </FormField>
        <FormField label="Land" upper>
          <Input value={form.land} onChange={set('land')} />
        </FormField>
        <FormField label="Opmerkingen" upper>
          <Input value={form.opmerkingen} onChange={set('opmerkingen')} />
        </FormField>
      </FormRow>
      <div className="flex gap-2">
        <Button onClick={() => onOpslaan(form)} disabled={bezig || !form.label.trim()} variant="primary">
          {bezig ? 'Opslaan…' : 'Opslaan'}
        </Button>
        <Button onClick={onAnnuleer} variant="ghost">Annuleer</Button>
      </div>
    </div>
  )
}

function FactuuradrressenBlok({ relatieId, initial }: { relatieId: string; initial: RelatieFactuuradres[] }) {
  const [adressen, setAdressen] = useState<RelatieFactuuradres[]>(initial)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | 'nieuw' | null>(null)

  const formVan = (fa?: RelatieFactuuradres): AdresForm => fa
    ? { label: fa.label, straat: fa.straat ?? '', postcode: fa.postcode ?? '', plaats: fa.plaats ?? '', land: fa.land ?? 'Nederland', opmerkingen: fa.opmerkingen ?? '' }
    : leegAdresForm()

  async function opslaan(id: string | undefined, v: AdresForm) {
    setBezig(true); setFout(null)
    const res = await upsertFactuuradres({ id, relatie_id: relatieId, label: v.label, straat: v.straat || null, postcode: v.postcode || null, plaats: v.plaats || null, land: v.land || null, opmerkingen: v.opmerkingen || null })
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setAdressen(prev => id ? prev.map(a => a.id === id ? res.data : a) : [...prev, res.data])
    setEditId(null)
  }

  async function verwijder(id: string) {
    if (!confirm('Factuuradres verwijderen?')) return
    setBezig(true)
    const res = await deleteFactuuradres(id, relatieId)
    setBezig(false)
    if (!res.ok) { setFout(res.error); return }
    setAdressen(prev => prev.filter(a => a.id !== id))
  }

  return (
    <Blok
      titel={`Factuuradressen${adressen.length > 0 ? ` · ${adressen.length}` : ''}`}
      actie={<Button onClick={() => setEditId('nieuw')} variant="ghost" size="sm">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        Toevoegen
      </Button>}
    >
      {fout && <Alert tone="error" className="mb-2.5">{fout}</Alert>}
      {adressen.length === 0 && editId !== 'nieuw' && (
        <EmptyState size="sm" tone="neutral" title="Nog geen factuuradressen" description="Gebruik de knop om er een toe te voegen." />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {adressen.map(fa => (
          <div key={fa.id}>
            {editId === fa.id ? (
              <FactuuradresForm initial={formVan(fa)} onOpslaan={v => opslaan(fa.id, v)} onAnnuleer={() => setEditId(null)} bezig={bezig} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, padding: '10px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginBottom: 3 }}>{fa.label}</div>
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', lineHeight: 1.6 }}>
                    {[fa.straat, [fa.postcode, fa.plaats].filter(Boolean).join('  ')].filter(Boolean).join(', ') || '—'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  <Button onClick={() => setEditId(fa.id)} title="Bewerken" variant="ghost" size="icon-sm">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L6 17l-4 1 1-4L14.5 2.5z"/></svg>
                  </Button>
                  <Button onClick={() => verwijder(fa.id)} title="Verwijderen" variant="destructive" size="icon-sm">
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14M8 6V4h4v2M19 6l-1 12H2L1 6"/></svg>
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {editId === 'nieuw' && (
          <FactuuradresForm initial={leegAdresForm()} onOpslaan={v => opslaan(undefined, v)} onAnnuleer={() => setEditId(null)} bezig={bezig} />
        )}
      </div>
    </Blok>
  )
}

/* ─── Bankgegevens blok ──────────────────────────────────────────────── */

function BankgegevensBlok({ relatieId, initial }: { relatieId: string; initial: RelatieBankgegevens | null }) {
  const [bewerken, setBewerken] = useState(false)
  const [form, setForm] = useState({ iban: initial?.iban ?? '', bic: initial?.bic ?? '', tenaamstelling: initial?.tenaamstelling ?? '', opmerkingen: initial?.opmerkingen ?? '' })
  const [bezig, setBezig] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  const router = useRouter()

  async function opslaan() {
    setBezig(true)
    const res = await upsertBankgegevens(relatieId, { iban: form.iban || null, bic: form.bic || null, tenaamstelling: form.tenaamstelling || null, opmerkingen: form.opmerkingen || null })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setBewerken(false)
    router.refresh()
    toast.success('Bankgegevens opgeslagen')
  }

  return (
    <Blok titel="Bankgegevens" actie={!bewerken ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button> : null}>
      {bewerken ? (
        <div className="flex flex-col gap-4">
          <FormRow cols="2">
            <FormField label="IBAN" upper className="col-span-full">
              <Input value={form.iban} onChange={set('iban')} />
            </FormField>
            <FormField label="BIC / SWIFT" upper>
              <Input value={form.bic} onChange={set('bic')} />
            </FormField>
            <FormField label="Tenaamstelling" upper>
              <Input value={form.tenaamstelling} onChange={set('tenaamstelling')} />
            </FormField>
            <FormField label="Opmerkingen" upper className="col-span-full">
              <Input value={form.opmerkingen} onChange={set('opmerkingen')} />
            </FormField>
          </FormRow>
          <div className="flex gap-2">
            <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
            <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
          </div>
        </div>
      ) : initial ? (
        <div>
          <Rij label="IBAN" waarde={initial.iban} />
          <Rij label="BIC / SWIFT" waarde={initial.bic} />
          <Rij label="Tenaamstelling" waarde={initial.tenaamstelling} />
          {initial.opmerkingen && <Rij label="Opmerkingen" waarde={initial.opmerkingen} />}
        </div>
      ) : (
        <EmptyState size="sm" tone="neutral" title="Nog geen bankgegevens" description="Klik op Bewerken om toe te voegen." />
      )}
    </Blok>
  )
}

/* ─── Facturatie blok (opdrachtgever) ───────────────────────────────── */

function FacturatieBlok({ relatieId, initial }: { relatieId: string; initial: RelatieFacturatie | null }) {
  const [bewerken, setBewerken] = useState(false)
  const [form, setForm] = useState({
    betaaltermijn_dagen: String(initial?.betaaltermijn_dagen ?? '30'),
    facturatie_email: initial?.facturatie_email ?? '',
    inkoopnummer_verplicht: initial?.inkoopnummer_verplicht ?? false,
    kredietlimiet: initial?.kredietlimiet != null ? String(initial.kredietlimiet) : '',
    g_rekening_tekst: initial?.g_rekening_tekst ?? '',
    g_rekening_percentage: initial?.g_rekening_percentage != null ? String(initial.g_rekening_percentage) : '',
    loonkostenbestanddeel_pct: initial?.loonkostenbestanddeel_pct != null ? String(initial.loonkostenbestanddeel_pct) : '',
    n_rekening_tekst: initial?.n_rekening_tekst ?? '',
    opmerkingen: initial?.opmerkingen ?? '',
  })
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  async function opslaan() {
    setBezig(true)
    const res = await upsertFacturatie(relatieId, {
      betaaltermijn_dagen: Number(form.betaaltermijn_dagen) || null,
      facturatie_email: form.facturatie_email || null,
      inkoopnummer_verplicht: form.inkoopnummer_verplicht,
      kredietlimiet: form.kredietlimiet ? Number(form.kredietlimiet) : null,
      g_rekening_tekst: form.g_rekening_tekst || null,
      g_rekening_percentage: form.g_rekening_percentage ? Number(form.g_rekening_percentage) : null,
      loonkostenbestanddeel_pct: form.loonkostenbestanddeel_pct ? Number(form.loonkostenbestanddeel_pct) : null,
      n_rekening_tekst: form.n_rekening_tekst || null,
      opmerkingen: form.opmerkingen || null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setBewerken(false)
    router.refresh()
    toast.success('Facturatie-instellingen opgeslagen')
  }

  return (
    <Blok titel="Facturatie" actie={!bewerken ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button> : null}>
      {bewerken ? (
        <div className="flex flex-col gap-4">
          <FormRow cols="2">
            <FormField label="Betaaltermijn (dagen)" upper>
              <Input
                type="number"
                value={form.betaaltermijn_dagen}
                onChange={e => setForm(p => ({ ...p, betaaltermijn_dagen: e.target.value }))}
              />
            </FormField>
            <FormField label="Kredietlimiet (€)" upper>
              <Input
                type="number"
                value={form.kredietlimiet}
                onChange={e => setForm(p => ({ ...p, kredietlimiet: e.target.value }))}
                placeholder="Geen limiet"
              />
            </FormField>
            <FormField label="Facturatie e-mailadres" upper className="col-span-full">
              <Input
                value={form.facturatie_email}
                onChange={e => setForm(p => ({ ...p, facturatie_email: e.target.value }))}
                placeholder="Kan afwijken van algemeen e-mailadres"
              />
            </FormField>
            <div className="col-span-full flex items-center gap-2">
              <Checkbox
                id="inkoopnr"
                checked={form.inkoopnummer_verplicht}
                onCheckedChange={checked => setForm(p => ({ ...p, inkoopnummer_verplicht: checked === true }))}
              />
              <label htmlFor="inkoopnr" className="text-[13px] text-neutral-900 cursor-pointer select-none">
                Inkoopordernummer verplicht op facturen
              </label>
            </div>
          </FormRow>

          <FormSection title="Ketenaansprakelijkheid" className="mb-0">
            <FormRow cols="2">
              <FormField label="G-rekening" upper>
                <Input
                  value={form.g_rekening_tekst}
                  onChange={e => setForm(p => ({ ...p, g_rekening_tekst: e.target.value }))}
                  placeholder="Rekeningnummer"
                />
              </FormField>
              <FormField label="G-rekening %" upper>
                <Input
                  type="number" min="0" max="100" step="0.5"
                  value={form.g_rekening_percentage}
                  onChange={e => setForm(p => ({ ...p, g_rekening_percentage: e.target.value }))}
                  placeholder="bijv. 25"
                />
              </FormField>
              <FormField label="Loonkostenbestanddeel %" upper>
                <Input
                  type="number" min="0" max="100" step="0.5"
                  value={form.loonkostenbestanddeel_pct}
                  onChange={e => setForm(p => ({ ...p, loonkostenbestanddeel_pct: e.target.value }))}
                  placeholder="bijv. 40"
                />
              </FormField>
              <FormField label="N-rekening" upper>
                <Input
                  value={form.n_rekening_tekst}
                  onChange={e => setForm(p => ({ ...p, n_rekening_tekst: e.target.value }))}
                  placeholder="Rekeningnummer"
                />
              </FormField>
            </FormRow>
          </FormSection>

          <FormField label="Opmerkingen" upper>
            <Input
              value={form.opmerkingen}
              onChange={e => setForm(p => ({ ...p, opmerkingen: e.target.value }))}
            />
          </FormField>

          <div className="flex gap-2">
            <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
            <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
          </div>
        </div>
      ) : (
        <div>
          <Rij label="Betaaltermijn" waarde={initial?.betaaltermijn_dagen != null ? `${initial.betaaltermijn_dagen} dagen` : null} />
          <Rij label="Facturatie e-mail" waarde={initial?.facturatie_email} />
          <Rij label="Inkoopnr. verplicht" waarde={initial != null ? (initial.inkoopnummer_verplicht ? 'Ja' : 'Nee') : null} />
          <Rij label="Kredietlimiet" waarde={initial?.kredietlimiet != null ? `€ ${initial.kredietlimiet}` : 'Geen'} />
          {(initial?.g_rekening_tekst || initial?.g_rekening_percentage != null) && (
            <>
              <Rij label="G-rekening" waarde={initial.g_rekening_tekst} />
              <Rij label="G-rekening %" waarde={initial.g_rekening_percentage != null ? `${initial.g_rekening_percentage}%` : null} />
            </>
          )}
          {initial?.loonkostenbestanddeel_pct != null && (
            <Rij label="Loonkostenbestanddeel" waarde={`${initial.loonkostenbestanddeel_pct}%`} />
          )}
          {initial?.n_rekening_tekst && <Rij label="N-rekening" waarde={initial.n_rekening_tekst} />}
          {initial?.opmerkingen && <Rij label="Opmerkingen" waarde={initial.opmerkingen} />}
        </div>
      )}
    </Blok>
  )
}

/* ─── Inkoop blok (leverancier + onderaannemer) ──────────────────────── */

function InkoopBlok({ relatieId, initial }: { relatieId: string; initial: RelatieInkoop | null }) {
  const [bewerken, setBewerken] = useState(false)
  const [form, setForm] = useState({
    leveranciernummer: initial?.leveranciernummer ?? '',
    standaard_levertijd_dagen: String(initial?.standaard_levertijd_dagen ?? ''),
    minimumbestelling: initial?.minimumbestelling != null ? String(initial.minimumbestelling) : '',
    opmerkingen: initial?.opmerkingen ?? '',
  })
  const [bezig, setBezig] = useState(false)
  const router = useRouter()

  async function opslaan() {
    setBezig(true)
    const res = await upsertInkoop(relatieId, {
      leveranciernummer: form.leveranciernummer || null,
      standaard_levertijd_dagen: form.standaard_levertijd_dagen ? Number(form.standaard_levertijd_dagen) : null,
      minimumbestelling: form.minimumbestelling ? Number(form.minimumbestelling) : null,
      opmerkingen: form.opmerkingen || null,
    })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setBewerken(false)
    router.refresh()
    toast.success('Inkoop-instellingen opgeslagen')
  }

  return (
    <Blok titel="Inkoop" actie={!bewerken ? <Button variant="ghost" size="sm" onClick={() => setBewerken(true)}>Bewerken</Button> : null}>
      {bewerken ? (
        <div className="flex flex-col gap-4">
          <FormRow cols="2">
            <FormField label="Leveranciernummer" upper className="col-span-full">
              <Input
                value={form.leveranciernummer}
                onChange={e => setForm(p => ({ ...p, leveranciernummer: e.target.value }))}
              />
            </FormField>
            <FormField label="Standaard levertijd (dagen)" upper>
              <Input
                type="number"
                value={form.standaard_levertijd_dagen}
                onChange={e => setForm(p => ({ ...p, standaard_levertijd_dagen: e.target.value }))}
              />
            </FormField>
            <FormField label="Minimumbestelling (€)" upper>
              <Input
                type="number"
                value={form.minimumbestelling}
                onChange={e => setForm(p => ({ ...p, minimumbestelling: e.target.value }))}
              />
            </FormField>
            <FormField label="Opmerkingen" upper className="col-span-full">
              <Input
                value={form.opmerkingen}
                onChange={e => setForm(p => ({ ...p, opmerkingen: e.target.value }))}
              />
            </FormField>
          </FormRow>
          <div className="flex gap-2">
            <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
            <Button variant="ghost" onClick={() => setBewerken(false)}>Annuleer</Button>
          </div>
        </div>
      ) : (
        <div>
          <Rij label="Leveranciernummer" waarde={initial?.leveranciernummer} />
          <Rij label="Levertijd" waarde={initial?.standaard_levertijd_dagen != null ? `${initial.standaard_levertijd_dagen} dagen` : null} />
          <Rij label="Minimumbestelling" waarde={initial?.minimumbestelling != null ? `€ ${initial.minimumbestelling}` : null} />
          {initial?.opmerkingen && <Rij label="Opmerkingen" waarde={initial.opmerkingen} />}
        </div>
      )}
    </Blok>
  )
}

/* ─── Omzet blok ──────────────────────────────────────────────────────── */

function OmzetBlok({ omzet }: { omzet: OmzetData }) {
  const geenData = omzet.perJaar.length === 0 && omzet.openstaand.length === 0

  return (
    <Blok titel="Omzet">
      {geenData ? (
        <EmptyState size="sm" tone="neutral" title="Nog geen opdrachtdossiers" description="Dossiers in de opdracht-fase voor deze relatie verschijnen hier." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Per boekjaar */}
          {omzet.perJaar.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Gefactureerd per boekjaar
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Boekjaar', 'Dossiers', 'Totaal excl. BTW'].map(h => (
                      <th key={h} style={{ textAlign: h === 'Totaal excl. BTW' ? 'right' : 'left', fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {omzet.perJaar.map(r => (
                    <tr key={r.jaar}>
                      <td style={{ padding: '7px 0', fontSize: 13, fontWeight: 600, color: 'var(--fg)', borderBottom: '1px solid var(--border)' }}>{r.jaar}</td>
                      <td style={{ padding: '7px 0', fontSize: 13, color: 'var(--fg-muted)', borderBottom: '1px solid var(--border)' }}>{r.aantalDossiers}</td>
                      <td style={{ padding: '7px 0', fontSize: 13, fontWeight: 600, color: 'var(--fg)', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
                        € {r.bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Openstaande opdrachten */}
          {omzet.openstaand.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Openstaande opdrachten
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {omzet.openstaand.map(d => (
                  <div key={d.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={`/dossiers/${d.id}`} style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)', textDecoration: 'none' }}>
                        {d.dossiernummer ? `${d.dossiernummer} · ` : ''}{d.titel}
                      </a>
                      <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>
                        {(opdrachtSubstatusLabels as Record<string, string>)[d.substatus] ?? d.substatus}
                      </div>
                    </div>
                    {d.bedrag != null && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)', flexShrink: 0 }}>
                        € {d.bedrag.toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Blok>
  )
}

/* ─── Placeholder blokken ────────────────────────────────────────────── */

function PlaceholderBlok({ titel }: { titel: string }) {
  return (
    <Blok titel={titel}>
      <EmptyState size="sm" tone="neutral" title="Nog niet beschikbaar" description="Dit onderdeel wordt binnenkort uitgewerkt." />
    </Blok>
  )
}

/* ─── Prijsafspraken blok (generiek) ────────────────────────────────── */

type PrijsAfspraakItem = { id: string; omschrijving: string; eenheid: string | null; prijs: number | null; geldig_vanaf: string | null; geldig_tot: string | null; opmerkingen: string | null }
type PrijsAfspraakForm = { omschrijving: string; eenheid: string; prijs: string; geldig_vanaf: string; geldig_tot: string; opmerkingen: string }
const leegPrijsForm = (): PrijsAfspraakForm => ({ omschrijving: '', eenheid: '', prijs: '', geldig_vanaf: '', geldig_tot: '', opmerkingen: '' })

function PrijsafspraakRegel({ item, onBewerk, onVerwijder }: { item: PrijsAfspraakItem; onBewerk: () => void; onVerwijder: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{item.omschrijving}</span>
        <div style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 12 }}>
          {item.prijs != null && <span>€ {item.prijs}{item.eenheid ? ` / ${item.eenheid}` : ''}</span>}
          {item.geldig_vanaf && <span>vanaf {item.geldig_vanaf}</span>}
          {item.geldig_tot && <span>t/m {item.geldig_tot}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <Button onClick={onBewerk} variant="ghost" size="icon-sm">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L6 17l-4 1 1-4L14.5 2.5z"/></svg>
        </Button>
        <Button onClick={onVerwijder} variant="destructive" size="icon-sm">
          <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14M8 6V4h4v2M19 6l-1 12H2L1 6"/></svg>
        </Button>
      </div>
    </div>
  )
}

function PrijsAfspraakFormUI({ initial, onOpslaan, onAnnuleer, bezig }: {
  initial: PrijsAfspraakForm; onOpslaan: (v: PrijsAfspraakForm) => void; onAnnuleer: () => void; bezig: boolean
}) {
  const [form, setForm] = useState<PrijsAfspraakForm>(initial)
  const set = (k: keyof PrijsAfspraakForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(p => ({ ...p, [k]: e.target.value }))
  return (
    <div className="flex flex-col gap-4 p-3 bg-white border border-neutral-200 rounded-xl mt-2">
      <FormRow cols="2">
        <FormField label="Omschrijving" upper required className="col-span-full">
          <Input value={form.omschrijving} onChange={set('omschrijving')} />
        </FormField>
        <FormField label="Prijs (€)" upper>
          <Input type="number" value={form.prijs} onChange={set('prijs')} />
        </FormField>
        <FormField label="Eenheid" upper>
          <Input value={form.eenheid} onChange={set('eenheid')} placeholder="m², uur, stuk…" />
        </FormField>
        <FormField label="Geldig vanaf" upper>
          <Input type="date" value={form.geldig_vanaf} onChange={set('geldig_vanaf')} />
        </FormField>
        <FormField label="Geldig t/m" upper>
          <Input type="date" value={form.geldig_tot} onChange={set('geldig_tot')} />
        </FormField>
        <FormField label="Opmerkingen" upper className="col-span-full">
          <Input value={form.opmerkingen} onChange={set('opmerkingen')} />
        </FormField>
      </FormRow>
      <div className="flex gap-2">
        <Button onClick={() => onOpslaan(form)} disabled={bezig || !form.omschrijving.trim()} variant="primary">{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
        <Button onClick={onAnnuleer} variant="ghost">Annuleer</Button>
      </div>
    </div>
  )
}

function VerkoopPrijsafsprakenBlok({ relatieId, initial }: { relatieId: string; initial: RelatieVerkoopPrijsafspraak[] }) {
  const [items, setItems] = useState<RelatieVerkoopPrijsafspraak[]>(initial)
  const [bezig, setBezig] = useState(false)
  const [editId, setEditId] = useState<string | 'nieuw' | null>(null)

  async function opslaan(id: string | undefined, v: PrijsAfspraakForm) {
    setBezig(true)
    const res = await upsertVerkoopPrijsafspraak({ id, relatie_id: relatieId, omschrijving: v.omschrijving, eenheid: v.eenheid || null, prijs: v.prijs ? Number(v.prijs) : null, geldig_vanaf: v.geldig_vanaf || null, geldig_tot: v.geldig_tot || null, opmerkingen: v.opmerkingen || null })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => id ? prev.map(i => i.id === id ? res.data : i) : [...prev, res.data])
    setEditId(null)
  }

  async function verwijder(id: string) {
    if (!confirm('Prijsafspraak verwijderen?')) return
    setBezig(true)
    const res = await deleteVerkoopPrijsafspraak(id, relatieId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <Blok titel={`Verkoop prijsafspraken${items.length > 0 ? ` · ${items.length}` : ''}`}
      actie={<Button onClick={() => setEditId('nieuw')} variant="ghost" size="sm"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Toevoegen</Button>}
    >
      {items.length === 0 && editId !== 'nieuw' && <EmptyState size="sm" tone="neutral" title="Geen prijsafspraken" description="Klik op Toevoegen om een afspraak vast te leggen." />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.id}>
            {editId === item.id
              ? <PrijsAfspraakFormUI initial={{ omschrijving: item.omschrijving, eenheid: item.eenheid ?? '', prijs: item.prijs != null ? String(item.prijs) : '', geldig_vanaf: item.geldig_vanaf ?? '', geldig_tot: item.geldig_tot ?? '', opmerkingen: item.opmerkingen ?? '' }} onOpslaan={v => opslaan(item.id, v)} onAnnuleer={() => setEditId(null)} bezig={bezig} />
              : <PrijsafspraakRegel item={item} onBewerk={() => setEditId(item.id)} onVerwijder={() => verwijder(item.id)} />
            }
          </div>
        ))}
        {editId === 'nieuw' && <PrijsAfspraakFormUI initial={leegPrijsForm()} onOpslaan={v => opslaan(undefined, v)} onAnnuleer={() => setEditId(null)} bezig={bezig} />}
      </div>
    </Blok>
  )
}

/* ─── Kortingsafspraken blok (leverancier) ───────────────────────────── */

function KortingsafsprakenBlok({ relatieId, initial }: { relatieId: string; initial: RelatieInkoopKortingsafspraak[] }) {
  const [items, setItems] = useState<RelatieInkoopKortingsafspraak[]>(initial)
  const [bezig, setBezig] = useState(false)
  const [editId, setEditId] = useState<string | 'nieuw' | null>(null)
  const [form, setForm] = useState({ categorie: '', korting_pct: '', geldig_vanaf: '', geldig_tot: '', opmerkingen: '' })

  async function opslaan(id?: string) {
    setBezig(true)
    const res = await upsertKortingsafspraak({ id, relatie_id: relatieId, categorie: form.categorie || null, korting_pct: form.korting_pct ? Number(form.korting_pct) : null, geldig_vanaf: form.geldig_vanaf || null, geldig_tot: form.geldig_tot || null, opmerkingen: form.opmerkingen || null })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => id ? prev.map(i => i.id === id ? res.data : i) : [...prev, res.data])
    setEditId(null)
    setForm({ categorie: '', korting_pct: '', geldig_vanaf: '', geldig_tot: '', opmerkingen: '' })
  }

  async function verwijder(id: string) {
    if (!confirm('Kortingsafspraak verwijderen?')) return
    setBezig(true)
    const res = await deleteKortingsafspraak(id, relatieId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <Blok titel={`Kortingsafspraken${items.length > 0 ? ` · ${items.length}` : ''}`}
      actie={<Button onClick={() => { setEditId('nieuw'); setForm({ categorie: '', korting_pct: '', geldig_vanaf: '', geldig_tot: '', opmerkingen: '' }) }} variant="ghost" size="sm"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Toevoegen</Button>}
    >
      {items.length === 0 && editId !== 'nieuw' && <EmptyState size="sm" tone="neutral" title="Geen kortingsafspraken" description="Leg kortingen per categorie vast." />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{item.categorie || 'Algemeen'}</span>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)', display: 'flex', gap: 12 }}>
                {item.korting_pct != null && <span>{item.korting_pct}% korting</span>}
                {item.geldig_vanaf && <span>vanaf {item.geldig_vanaf}</span>}
                {item.geldig_tot && <span>t/m {item.geldig_tot}</span>}
              </div>
            </div>
            <Button onClick={() => verwijder(item.id)} variant="destructive" size="icon-sm">
              <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h14M8 6V4h4v2M19 6l-1 12H2L1 6"/></svg>
            </Button>
          </div>
        ))}
        {editId === 'nieuw' && (
          <div className="flex flex-col gap-4 p-3 bg-white border border-neutral-200 rounded-xl mt-2">
            <FormRow cols="2">
              <FormField label="Categorie" upper>
                <Input
                  value={form.categorie}
                  onChange={e => setForm(p => ({ ...p, categorie: e.target.value }))}
                  placeholder="Raamwerk, Houtrot…"
                />
              </FormField>
              <FormField label="Korting %" upper>
                <Input
                  type="number"
                  value={form.korting_pct}
                  onChange={e => setForm(p => ({ ...p, korting_pct: e.target.value }))}
                />
              </FormField>
              <FormField label="Geldig vanaf" upper>
                <Input
                  type="date"
                  value={form.geldig_vanaf}
                  onChange={e => setForm(p => ({ ...p, geldig_vanaf: e.target.value }))}
                />
              </FormField>
              <FormField label="Geldig t/m" upper>
                <Input
                  type="date"
                  value={form.geldig_tot}
                  onChange={e => setForm(p => ({ ...p, geldig_tot: e.target.value }))}
                />
              </FormField>
            </FormRow>
            <div className="flex gap-2">
              <Button variant="primary" onClick={() => opslaan()} disabled={bezig}>{bezig ? 'Opslaan…' : 'Opslaan'}</Button>
              <Button variant="ghost" onClick={() => setEditId(null)}>Annuleer</Button>
            </div>
          </div>
        )}
      </div>
    </Blok>
  )
}

/* ─── Inkoop prijsafspraken blok (onderaannemer) ─────────────────────── */

function InkoopPrijsafsprakenBlok({ relatieId, initial }: { relatieId: string; initial: RelatieInkoopPrijsafspraak[] }) {
  const [items, setItems] = useState<RelatieInkoopPrijsafspraak[]>(initial)
  const [bezig, setBezig] = useState(false)
  const [editId, setEditId] = useState<string | 'nieuw' | null>(null)

  async function opslaan(id: string | undefined, v: PrijsAfspraakForm) {
    setBezig(true)
    const res = await upsertInkoopPrijsafspraak({ id, relatie_id: relatieId, omschrijving: v.omschrijving, eenheid: v.eenheid || null, prijs: v.prijs ? Number(v.prijs) : null, geldig_vanaf: v.geldig_vanaf || null, geldig_tot: v.geldig_tot || null, opmerkingen: v.opmerkingen || null })
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => id ? prev.map(i => i.id === id ? res.data : i) : [...prev, res.data])
    setEditId(null)
  }

  async function verwijder(id: string) {
    if (!confirm('Prijsafspraak verwijderen?')) return
    setBezig(true)
    const res = await deleteInkoopPrijsafspraak(id, relatieId)
    setBezig(false)
    if (!res.ok) { toast.error(res.error); return }
    setItems(prev => prev.filter(i => i.id !== id))
  }

  return (
    <Blok titel={`Inkoop prijsafspraken${items.length > 0 ? ` · ${items.length}` : ''}`}
      actie={<Button onClick={() => setEditId('nieuw')} variant="ghost" size="sm"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>Toevoegen</Button>}
    >
      {items.length === 0 && editId !== 'nieuw' && <EmptyState size="sm" tone="neutral" title="Geen inkoop prijsafspraken" description="Leg vaste prijzen met deze onderaannemer vast." />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <div key={item.id}>
            {editId === item.id
              ? <PrijsAfspraakFormUI initial={{ omschrijving: item.omschrijving, eenheid: item.eenheid ?? '', prijs: item.prijs != null ? String(item.prijs) : '', geldig_vanaf: item.geldig_vanaf ?? '', geldig_tot: item.geldig_tot ?? '', opmerkingen: item.opmerkingen ?? '' }} onOpslaan={v => opslaan(item.id, v)} onAnnuleer={() => setEditId(null)} bezig={bezig} />
              : <PrijsafspraakRegel item={item} onBewerk={() => setEditId(item.id)} onVerwijder={() => verwijder(item.id)} />
            }
          </div>
        ))}
        {editId === 'nieuw' && <PrijsAfspraakFormUI initial={leegPrijsForm()} onOpslaan={v => opslaan(undefined, v)} onAnnuleer={() => setEditId(null)} bezig={bezig} />}
      </div>
    </Blok>
  )
}

/* ─── Type sectie scheidingslijn ─────────────────────────────────────── */

const SECTIE_KLEUR: Record<OrganisatieType, { bg: string; border: string; fg: string }> = {
  opdrachtgever: { bg: '#ecfaf0', border: '#bbf0cc', fg: '#0a5e28' },
  leverancier:   { bg: '#eff8ff', border: '#bfdbfe', fg: '#175cd3' },
  onderaannemer: { bg: '#fff6ec', border: '#fcd5a3', fg: '#b85a00' },
}

function TypeSectie({ type, children }: { type: OrganisatieType; children: React.ReactNode }) {
  const k = SECTIE_KLEUR[type]
  return (
    <div style={{ marginTop: 8 }}>
      {/* Scheidingslijn met type-label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ height: 1, flex: 1, background: k.border }} />
        <span style={{
          padding: '3px 12px', borderRadius: 20,
          background: k.bg, color: k.fg, border: `1px solid ${k.border}`,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {organisatieTypeLabels[type]}
        </span>
        <div style={{ height: 1, flex: 1, background: k.border }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {children}
      </div>
    </div>
  )
}

/* ─── Hoofd component ────────────────────────────────────────────────── */

type Props = {
  relatie: Relatie
  factuuradressen: RelatieFactuuradres[]
  bankgegevens: RelatieBankgegevens | null
  facturatie: RelatieFacturatie | null
  inkoop: RelatieInkoop | null
  verkoopPrijsafspraken: RelatieVerkoopPrijsafspraak[]
  kortingsafspraken: RelatieInkoopKortingsafspraak[]
  inkoopPrijsafspraken: RelatieInkoopPrijsafspraak[]
  contactpersonen: (ContactpersoonOrganisatie & { contactpersoon: any })[]
  omzet: OmzetData
}

export default function RelatieDetailView({
  relatie,
  factuuradressen,
  bankgegevens,
  facturatie,
  inkoop,
  verkoopPrijsafspraken,
  kortingsafspraken,
  inkoopPrijsafspraken,
  contactpersonen,
  omzet,
}: Props) {
  const isOpdrachtgever = relatie.types.includes('opdrachtgever')
  const isLeverancier   = relatie.types.includes('leverancier')
  const isOnderaannemer = relatie.types.includes('onderaannemer')
  const heeftBank       = isLeverancier || isOnderaannemer

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Breadcrumb */}
      <Link href="/relaties" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500, color: 'var(--fg-muted)', textDecoration: 'none', marginBottom: 20 }}>
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7"/></svg>
        Relaties
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 28 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, background: 'var(--bg-active)', display: 'grid', placeItems: 'center', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 600, color: 'var(--fg-soft)', letterSpacing: '0.02em' }}>
          {relatie.naam.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--fg)', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            {relatie.naam}
          </h1>
          <TypesBlok relatieId={relatie.id} initial={relatie.types} />
          {!relatie.actief && (
            <span style={{ display: 'inline-block', marginTop: 6, fontSize: 11, fontWeight: 600, color: 'var(--fg-muted)' }}>Inactief</span>
          )}
        </div>
      </div>

      {/* Hoofd-layout: linker kolom + rechter sidebar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>

        {/* ── Linker kolom: alle informatieblokken ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Altijd: Basisgegevens */}
          <BasisgegevensBlok relatie={relatie} />

          {/* Altijd: Opmerkingen */}
          <OmerkingenBlok relatie={relatie} />

          {/* Type-specifieke secties */}
          {isOpdrachtgever && (
            <TypeSectie type="opdrachtgever">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FactuuradrressenBlok relatieId={relatie.id} initial={factuuradressen} />
                </div>
                <FacturatieBlok relatieId={relatie.id} initial={facturatie} />
                <PlaceholderBlok titel="Acquisitie" />
                <div style={{ gridColumn: '1 / -1' }}>
                  <VerkoopPrijsafsprakenBlok relatieId={relatie.id} initial={verkoopPrijsafspraken} />
                </div>
                <PlaceholderBlok titel="Gekoppelde dossiers" />
                <OmzetBlok omzet={omzet} />
              </div>
            </TypeSectie>
          )}

          {isLeverancier && (
            <TypeSectie type="leverancier">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <BankgegevensBlok relatieId={relatie.id} initial={bankgegevens} />
                <InkoopBlok relatieId={relatie.id} initial={inkoop} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <KortingsafsprakenBlok relatieId={relatie.id} initial={kortingsafspraken} />
                </div>
              </div>
            </TypeSectie>
          )}

          {isOnderaannemer && (
            <TypeSectie type="onderaannemer">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                {/* Bankgegevens alleen tonen als niet ook al getoond als leverancier */}
                {!isLeverancier && <BankgegevensBlok relatieId={relatie.id} initial={bankgegevens} />}
                {!isLeverancier && <InkoopBlok relatieId={relatie.id} initial={inkoop} />}
                <div style={{ gridColumn: '1 / -1' }}>
                  <InkoopPrijsafsprakenBlok relatieId={relatie.id} initial={inkoopPrijsafspraken} />
                </div>
              </div>
            </TypeSectie>
          )}
        </div>

        {/* ── Rechter sidebar: Contactpersonen (sticky) ── */}
        <div style={{ position: 'sticky', top: 20 }}>
          <ContactpersonenBlok relatieId={relatie.id} initial={contactpersonen} />
        </div>
      </div>
    </div>
  )
}
