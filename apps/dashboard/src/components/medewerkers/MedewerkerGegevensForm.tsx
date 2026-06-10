'use client'

import React, { useState, useTransition, useMemo } from 'react'
import toast from 'react-hot-toast'
import type {
  Medewerker, Bedrijfsgegevens, Relatie,
  MedewerkerFunctie, MedewerkerAfdeling,
  CaoDocument, CaoLoonschaal,
} from '@everts/database/platform-types'
import { updateMedewerkerGegevens } from '@/app/(platform)/medewerkers/[id]/actions'
import { Button, Input } from '@/components/ui'

type FormState = {
  voornaam: string
  tussenvoegsel: string
  achternaam: string
  email: string
  telefoon: string
  functie: string
  afdeling: string
  in_dienst_vanaf: string
  uit_dienst_per: string
  extern: boolean
  actief: boolean
  uurtarief_verkoop: string
  uurtarief_kostprijs: string
  cao_schaal: string
  cao_document_id: string
  cao_trede: string
  adres_straat: string
  adres_postcode: string
  adres_plaats: string
  geboortedatum: string
  bsn: string
  werkmaatschappij_id: string
  relatie_id: string
  kleur: string
}

function toForm(m: Medewerker): FormState {
  return {
    voornaam:            m.voornaam,
    tussenvoegsel:       m.tussenvoegsel ?? '',
    achternaam:          m.achternaam,
    email:               m.email ?? '',
    telefoon:            m.telefoon ?? '',
    functie:             m.functie ?? '',
    afdeling:            m.afdeling ?? '',
    in_dienst_vanaf:     m.in_dienst_vanaf ?? '',
    uit_dienst_per:      m.uit_dienst_per ?? '',
    extern:              m.extern,
    actief:              m.actief,
    uurtarief_verkoop:   m.uurtarief_verkoop?.toString() ?? '',
    uurtarief_kostprijs: m.uurtarief_kostprijs?.toString() ?? '',
    cao_schaal:          m.cao_schaal ?? '',
    cao_document_id:     m.cao_document_id ?? '',
    cao_trede:           m.cao_trede ?? '',
    adres_straat:        m.adres_straat ?? '',
    adres_postcode:      m.adres_postcode ?? '',
    adres_plaats:        m.adres_plaats ?? '',
    geboortedatum:       m.geboortedatum ?? '',
    bsn:                 m.bsn ?? '',
    werkmaatschappij_id: m.werkmaatschappij_id ?? '',
    relatie_id:          m.relatie_id ?? '',
    kleur:               m.kleur ?? '',
  }
}

// ── BSN-veld ──────────────────────────────────────────────────────────────────
function BsnVeld({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [revealed, setRevealed] = useState(false)
  const masked = value ? value.slice(0, -4).replace(/./g, '*') + value.slice(-4) : ''
  return (
    <div style={{ position: 'relative' }}>
      <Input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="BSN"
        style={{ width: '100%', paddingRight: 70 }}
        autoComplete="off"
      />
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setRevealed(r => !r)}
          style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}
        >
          {revealed ? 'Verberg' : masked || 'Toon'}
        </Button>
      )}
    </div>
  )
}

// ── Combobox: dropdown + vrije invoer ─────────────────────────────────────────
function ComboSelect({
  opties, value, onChange, placeholder,
}: {
  opties: string[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const isVrij = value !== '' && !opties.includes(value)
  const [vrije, setVrije] = useState(isVrij)

  if (vrije) {
    return (
      <div style={{ display: 'flex', gap: 6 }}>
        <Input style={{ flex: 1 }} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus />
        <Button type="button" variant="ghost" size="sm" style={{ flexShrink: 0 }} onClick={() => { setVrije(false); onChange('') }}>
          ←
        </Button>
      </div>
    )
  }

  return (
    <select className="eva-input" style={{ width: '100%' }} value={value} onChange={e => {
      if (e.target.value === '__vrij__') { setVrije(true); onChange('') }
      else onChange(e.target.value)
    }}>
      <option value="">— Selecteer —</option>
      {opties.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__vrij__">+ Eigen invoer…</option>
    </select>
  )
}

// ── CAO-selectie ──────────────────────────────────────────────────────────────
function CaoSelectie({
  documenten, schalen,
  cao_document_id, cao_schaal, cao_trede,
  medewerker_wm_id,
  werkmaatschappijenMap,
  onChange,
}: {
  documenten: Pick<CaoDocument, 'id' | 'naam' | 'werkmaatschappij_id'>[]
  schalen:    CaoLoonschaal[]
  cao_document_id: string
  cao_schaal: string
  cao_trede: string
  medewerker_wm_id?: string
  werkmaatschappijenMap?: Record<string, string>
  onChange: (field: 'cao_document_id' | 'cao_schaal' | 'cao_trede', value: string) => void
}) {
  // Filter: toon alleen CAOs die overeenkomen met de medewerker's werkmaatschappij (of organisatiebrede)
  const gefilterdeDocumenten = medewerker_wm_id
    ? documenten.filter(d => !d.werkmaatschappij_id || d.werkmaatschappij_id === medewerker_wm_id)
    : documenten

  const doc = gefilterdeDocumenten.find(d => d.id === cao_document_id)
  const docSchalen = useMemo(() => {
    const uniek = [...new Set(schalen.filter(s => s.cao_id === cao_document_id).map(s => s.schaal))]
    return uniek.sort()
  }, [schalen, cao_document_id])

  const tredeLijst = useMemo(() => {
    return schalen
      .filter(s => s.cao_id === cao_document_id && s.schaal === cao_schaal)
      .sort((a, b) => a.volgorde - b.volgorde)
  }, [schalen, cao_document_id, cao_schaal])

  const geselecteerdeTrede = tredeLijst.find(t => t.trede === cao_trede)
  const bruto = geselecteerdeTrede?.bruto_maand

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 4,
  }

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: gefilterdeDocumenten.length ? '1fr 1fr 1fr' : '1fr', gap: 10 }}>
      {gefilterdeDocumenten.length === 0 ? (
        <div>
          <label style={labelStyle}>CAO</label>
          <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
            Geen CAO-documenten beschikbaar. Upload een CAO via{' '}
            <a href="/instellingen/cao" style={{ color: 'var(--accent)' }}>Instellingen → CAO beheer</a>.
          </p>
        </div>
      ) : (
        <>
          <div>
            <label style={labelStyle}>CAO document</label>
            <select className="eva-input" style={{ width: '100%' }} value={cao_document_id} onChange={e => { onChange('cao_document_id', e.target.value); onChange('cao_schaal', ''); onChange('cao_trede', '') }}>
              <option value="">— Geen —</option>
              {gefilterdeDocumenten.map(d => (
                <option key={d.id} value={d.id}>
                  {d.naam}{d.werkmaatschappij_id && werkmaatschappijenMap?.[d.werkmaatschappij_id] ? ` (${werkmaatschappijenMap[d.werkmaatschappij_id]})` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Loonschaal</label>
            <select className="eva-input" style={{ width: '100%' }} value={cao_schaal} onChange={e => { onChange('cao_schaal', e.target.value); onChange('cao_trede', '') }} disabled={!cao_document_id || docSchalen.length === 0}>
              <option value="">— Selecteer —</option>
              {docSchalen.map(s => <option key={s} value={s}>Schaal {s}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Trede</label>
            <select className="eva-input" style={{ width: '100%' }} value={cao_trede} onChange={e => onChange('cao_trede', e.target.value)} disabled={!cao_schaal || tredeLijst.length === 0}>
              <option value="">— Selecteer —</option>
              {tredeLijst.map(t => (
                <option key={t.id} value={t.trede}>
                  Trede {t.trede}{t.bruto_maand ? ` — € ${t.bruto_maand.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}` : ''}
                </option>
              ))}
            </select>
            {bruto != null && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
                ≈ € {bruto.toLocaleString('nl-NL', { minimumFractionDigits: 2 })} bruto/maand
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

// ── Hoofd component ───────────────────────────────────────────────────────────
export default function MedewerkerGegevensForm({
  medewerker,
  werkmaatschappijen,
  relaties,
  functies,
  afdelingen,
  caoDocumenten,
  caoSchalen,
}: {
  medewerker: Medewerker
  werkmaatschappijen: Pick<Bedrijfsgegevens, 'id' | 'naam'>[]
  relaties: Pick<Relatie, 'id' | 'naam' | 'types'>[]
  functies: MedewerkerFunctie[]
  afdelingen: MedewerkerAfdeling[]
  caoDocumenten: Pick<CaoDocument, 'id' | 'naam' | 'werkmaatschappij_id'>[]
  caoSchalen: CaoLoonschaal[]
}) {
  const [editing, setEditing] = useState(false)
  const [state, setState] = useState<FormState>(toForm(medewerker))
  const [isPending, startTransition] = useTransition()

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setState(prev => ({ ...prev, [k]: v }))

  function save() {
    startTransition(async () => {
      const result = await updateMedewerkerGegevens(medewerker.id, {
        ...state,
        uurtarief_verkoop:   state.uurtarief_verkoop   ? parseFloat(state.uurtarief_verkoop)   : null,
        uurtarief_kostprijs: state.uurtarief_kostprijs ? parseFloat(state.uurtarief_kostprijs) : null,
        tussenvoegsel:       state.tussenvoegsel  || null,
        email:               state.email          || null,
        telefoon:            state.telefoon        || null,
        functie:             state.functie         || null,
        afdeling:            state.afdeling        || null,
        in_dienst_vanaf:     state.in_dienst_vanaf || null,
        uit_dienst_per:      state.uit_dienst_per  || null,
        cao_schaal:          state.cao_schaal      || null,
        cao_document_id:     state.cao_document_id || null,
        cao_trede:           state.cao_trede       || null,
        adres_straat:        state.adres_straat    || null,
        adres_postcode:      state.adres_postcode  || null,
        adres_plaats:        state.adres_plaats    || null,
        geboortedatum:       state.geboortedatum   || null,
        bsn:                 state.bsn             || null,
        werkmaatschappij_id: state.werkmaatschappij_id || null,
        relatie_id:          state.relatie_id || null,
        kleur:               state.kleur || null,
      })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Gegevens opgeslagen')
      setEditing(false)
    })
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 4,
  }
  const valueStyle: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }
  const mutedStyle: React.CSSProperties = { ...valueStyle, color: 'var(--fg-muted)' }

  function Field({ label, value }: { label: string; value: string | null | undefined }) {
    return (
      <div>
        <span style={labelStyle}>{label}</span>
        <span style={value ? valueStyle : mutedStyle}>{value || '—'}</span>
      </div>
    )
  }

  // Loonschaal lookup voor read-only weergave
  const gekozenTrede = caoSchalen.find(
    s => s.cao_id === medewerker.cao_document_id && s.schaal === medewerker.cao_schaal && s.trede === medewerker.cao_trede
  )
  const caoNaam = caoDocumenten.find(d => d.id === medewerker.cao_document_id)?.naam

  if (!editing) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Gegevens</h3>
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Bewerken</Button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
          <Field label="Voornaam" value={medewerker.voornaam} />
          <Field label="Achternaam" value={[medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')} />
          <Field label="E-mail" value={medewerker.email} />
          <Field label="Telefoon" value={medewerker.telefoon} />
          <Field label="Adres" value={[medewerker.adres_straat, medewerker.adres_postcode, medewerker.adres_plaats].filter(Boolean).join(', ')} />
          <Field label="Geboortedatum" value={medewerker.geboortedatum} />
          <div>
            <span style={labelStyle}>BSN</span>
            <BsnVeld value={medewerker.bsn ?? ''} onChange={() => {}} />
          </div>
          <Field label="Functie" value={medewerker.functie} />
          <Field label="Afdeling" value={medewerker.afdeling} />
          <Field label="In dienst vanaf" value={medewerker.in_dienst_vanaf} />
          <Field label="Uit dienst per" value={medewerker.uit_dienst_per} />
          <Field label="Type" value={medewerker.extern ? 'Extern' : 'Intern'} />
          <Field label="Status" value={medewerker.actief ? 'Actief' : 'Inactief'} />
          <Field label="Administratie" value={werkmaatschappijen.find(w => w.id === medewerker.werkmaatschappij_id)?.naam} />
          {medewerker.extern && <Field label="Relatie" value={relaties.find(r => r.id === medewerker.relatie_id)?.naam} />}
          <Field label="Kostprijs uurtarief" value={medewerker.uurtarief_kostprijs != null ? `€ ${medewerker.uurtarief_kostprijs}` : null} />
          <Field label="Verkoop uurtarief" value={medewerker.uurtarief_verkoop != null ? `€ ${medewerker.uurtarief_verkoop}` : null} />
          {(caoNaam || medewerker.cao_schaal) && (
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>CAO loonschaal</span>
              <span style={valueStyle}>
                {[caoNaam, medewerker.cao_schaal && `Schaal ${medewerker.cao_schaal}`, medewerker.cao_trede && `Trede ${medewerker.cao_trede}`].filter(Boolean).join(' · ')}
                {gekozenTrede?.bruto_maand != null && (
                  <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                    € {gekozenTrede.bruto_maand.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}/mnd
                  </span>
                )}
              </span>
            </div>
          )}
          <div>
            <span style={labelStyle}>Kleur in planning</span>
            {medewerker.kleur ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, background: medewerker.kleur, border: '1px solid var(--border)' }} />
                <span style={{ ...valueStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }}>{medewerker.kleur}</span>
              </div>
            ) : (
              <span style={mutedStyle}>Automatisch (op basis van naam)</span>
            )}
          </div>
        </div>
      </div>
    )
  }

  const functieopties = functies.filter(f => f.actief).sort((a, b) => a.volgorde - b.volgorde).map(f => f.naam)
  const afdelingopties = afdelingen.filter(a => a.actief).sort((a, b) => a.volgorde - b.volgorde).map(a => a.naam)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Gegevens bewerken</h3>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Persoonlijk */}
        <section>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Persoonlijk</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Voornaam</label>
              <Input style={{ width: '100%' }} value={state.voornaam} onChange={e => set('voornaam', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Tussenvoegsel</label>
              <Input style={{ width: '100%' }} value={state.tussenvoegsel} onChange={e => set('tussenvoegsel', e.target.value)} placeholder="optioneel" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Achternaam</label>
              <Input style={{ width: '100%' }} value={state.achternaam} onChange={e => set('achternaam', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>E-mail</label>
              <Input type="email" style={{ width: '100%' }} value={state.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Telefoon</label>
              <Input type="tel" style={{ width: '100%' }} value={state.telefoon} onChange={e => set('telefoon', e.target.value)} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Adres</label>
              <Input style={{ width: '100%' }} value={state.adres_straat} onChange={e => set('adres_straat', e.target.value)} placeholder="Straat en huisnummer" />
            </div>
            <div>
              <label style={labelStyle}>Postcode</label>
              <Input style={{ width: '100%' }} value={state.adres_postcode} onChange={e => set('adres_postcode', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Plaats</label>
              <Input style={{ width: '100%' }} value={state.adres_plaats} onChange={e => set('adres_plaats', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Geboortedatum</label>
              <Input type="date" style={{ width: '100%' }} value={state.geboortedatum} onChange={e => set('geboortedatum', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>BSN <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(AVG-gevoelig)</span></label>
              <BsnVeld value={state.bsn} onChange={v => set('bsn', v)} />
            </div>
          </div>
        </section>

        {/* Organisatie */}
        <section>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Organisatie</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Functie</label>
              <ComboSelect opties={functieopties} value={state.functie} onChange={v => set('functie', v)} placeholder="bijv. Timmerman" />
            </div>
            <div>
              <label style={labelStyle}>Afdeling</label>
              <ComboSelect opties={afdelingopties} value={state.afdeling} onChange={v => set('afdeling', v)} placeholder="bijv. Uitvoering" />
            </div>
            <div>
              <label style={labelStyle}>In dienst vanaf</label>
              <Input type="date" style={{ width: '100%' }} value={state.in_dienst_vanaf} onChange={e => set('in_dienst_vanaf', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Uit dienst per</label>
              <Input type="date" style={{ width: '100%' }} value={state.uit_dienst_per} onChange={e => set('uit_dienst_per', e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>Administratie</label>
              <select className="eva-input" style={{ width: '100%' }} value={state.werkmaatschappij_id} onChange={e => set('werkmaatschappij_id', e.target.value)}>
                <option value="">— Geen —</option>
                {werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                <input type="checkbox" checked={state.extern} onChange={e => set('extern', e.target.checked)} />
                Extern
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                <input type="checkbox" checked={state.actief} onChange={e => set('actief', e.target.checked)} />
                Actief
              </label>
            </div>
            {state.extern && (
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Relatie (ZZP-bedrijf / uitzendbureau)</label>
                <select className="eva-input" style={{ width: '100%' }} value={state.relatie_id} onChange={e => set('relatie_id', e.target.value)}>
                  <option value="">— Geen —</option>
                  {relaties.map(r => <option key={r.id} value={r.id}>{r.naam} ({r.type})</option>)}
                </select>
              </div>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Kleur in planning</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="color"
                  value={state.kleur || '#3b82f6'}
                  onChange={e => set('kleur', e.target.value)}
                  style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }}
                />
                <Input
                  type="text"
                  value={state.kleur}
                  onChange={e => {
                    const v = e.target.value
                    set('kleur', v)
                  }}
                  placeholder="#3b82f6 — leeg = automatisch"
                  maxLength={7}
                  style={{ width: 160, fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
                {state.kleur && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => set('kleur', '')}>
                    Wissen
                  </Button>
                )}
              </div>
              <p style={{ margin: '4px 0 0', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>
                Wordt gebruikt als balkkleur in de planning. Leeg = automatisch gegenereerde kleur.
              </p>
            </div>
          </div>
        </section>

        {/* Tarieven + CAO */}
        <section>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px' }}>Beloning</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={labelStyle}>Kostprijs / uur</label>
              <Input type="number" min={0} step={0.01} style={{ width: '100%' }} value={state.uurtarief_kostprijs} onChange={e => set('uurtarief_kostprijs', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label style={labelStyle}>Verkoop / uur</label>
              <Input type="number" min={0} step={0.01} style={{ width: '100%' }} value={state.uurtarief_verkoop} onChange={e => set('uurtarief_verkoop', e.target.value)} placeholder="0.00" />
            </div>
            <CaoSelectie
              documenten={caoDocumenten}
              schalen={caoSchalen}
              cao_document_id={state.cao_document_id}
              cao_schaal={state.cao_schaal}
              cao_trede={state.cao_trede}
              medewerker_wm_id={state.werkmaatschappij_id || undefined}
              werkmaatschappijenMap={Object.fromEntries(werkmaatschappijen.map(w => [w.id, w.naam]))}
              onChange={(field, value) => set(field, value)}
            />
          </div>
        </section>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button type="button" variant="ghost" onClick={() => { setState(toForm(medewerker)); setEditing(false) }} disabled={isPending}>Annuleren</Button>
          <Button type="button" variant="primary" onClick={save} loading={isPending} disabled={isPending || !state.voornaam || !state.achternaam}>
            {isPending ? 'Opslaan…' : 'Opslaan'}
          </Button>
        </div>
      </div>
    </div>
  )
}
