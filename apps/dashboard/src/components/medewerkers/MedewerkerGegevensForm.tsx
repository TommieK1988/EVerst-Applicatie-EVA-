'use client'

import React, { useState, useTransition, useMemo } from 'react'
import toast from 'react-hot-toast'
import type {
  Medewerker, Bedrijfsgegevens, Relatie,
  MedewerkerFunctie, MedewerkerAfdeling, Ploeg,
  CaoDocument, CaoLoonschaal, PlanningUursoort,
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
  ploeg_id: string
  standaard_uursoort_id: string
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
    ploeg_id:            m.ploeg_id ?? '',
    standaard_uursoort_id: m.standaard_uursoort_id ?? '',
  }
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}
const valueStyle: React.CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg)' }
const mutedStyle: React.CSSProperties = { ...valueStyle, color: 'var(--fg-muted)' }
const sectieKopStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px',
}

/**
 * Eén veld-cel die in beide modi dezelfde plek en hoogte inneemt: label boven,
 * content eronder met vaste min-hoogte (= input-hoogte), zodat wisselen tussen
 * bekijken en bewerken niets laat verspringen.
 */
function Veld({ label, span, children }: { label: React.ReactNode; span?: boolean; children: React.ReactNode }) {
  return (
    <div style={span ? { gridColumn: '1 / -1' } : undefined}>
      <span style={labelStyle}>{label}</span>
      <div style={{ minHeight: 32, display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  )
}

function Waarde({ value }: { value: string | null | undefined }) {
  return <span style={value ? valueStyle : mutedStyle}>{value || '—'}</span>
}

// ── BSN-veld ──────────────────────────────────────────────────────────────────
function BsnVeld({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [revealed, setRevealed] = useState(false)
  const masked = value ? value.slice(0, -4).replace(/./g, '*') + value.slice(-4) : ''
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <Input
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="BSN"
        style={{ width: '100%', paddingRight: 70 }}
        autoComplete="off"
        disabled={disabled}
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
      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
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
  editing,
}: {
  documenten: Pick<CaoDocument, 'id' | 'naam' | 'werkmaatschappij_id'>[]
  schalen:    CaoLoonschaal[]
  cao_document_id: string
  cao_schaal: string
  cao_trede: string
  medewerker_wm_id?: string
  werkmaatschappijenMap?: Record<string, string>
  onChange: (field: 'cao_document_id' | 'cao_schaal' | 'cao_trede', value: string) => void
  editing: boolean
}) {
  // Filter: toon alleen CAOs die overeenkomen met de medewerker's werkmaatschappij (of organisatiebrede)
  const gefilterdeDocumenten = medewerker_wm_id
    ? documenten.filter(d => !d.werkmaatschappij_id || d.werkmaatschappij_id === medewerker_wm_id)
    : documenten

  const doc = gefilterdeDocumenten.find(d => d.id === cao_document_id) ?? documenten.find(d => d.id === cao_document_id)
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

  if (!editing) {
    return (
      <div style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Veld label="CAO document"><Waarde value={doc?.naam} /></Veld>
        <Veld label="Loonschaal"><Waarde value={cao_schaal ? `Schaal ${cao_schaal}` : null} /></Veld>
        <Veld label="Trede">
          <span style={cao_trede ? valueStyle : mutedStyle}>
            {cao_trede ? `Trede ${cao_trede}` : '—'}
            {bruto != null && (
              <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>
                € {bruto.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}/mnd
              </span>
            )}
          </span>
        </Veld>
      </div>
    )
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
              <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, fontWeight: 600 }}>
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
  ploegen,
  uursoorten,
  caoDocumenten,
  caoSchalen,
}: {
  medewerker: Medewerker
  werkmaatschappijen: Pick<Bedrijfsgegevens, 'id' | 'naam'>[]
  relaties: Pick<Relatie, 'id' | 'naam' | 'types'>[]
  functies: MedewerkerFunctie[]
  afdelingen: MedewerkerAfdeling[]
  ploegen: Pick<Ploeg, 'id' | 'naam'>[]
  uursoorten: Pick<PlanningUursoort, 'id' | 'naam'>[]
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
        ploeg_id:            state.ploeg_id || null,
        standaard_uursoort_id: state.standaard_uursoort_id || null,
      })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Gegevens opgeslagen')
      setEditing(false)
    })
  }

  const functieopties = functies.filter(f => f.actief).sort((a, b) => a.volgorde - b.volgorde).map(f => f.naam)
  const afdelingopties = afdelingen.filter(a => a.actief).sort((a, b) => a.volgorde - b.volgorde).map(a => a.naam)

  // In view-modus tonen we de opgeslagen medewerker-waarden; in edit-modus de formulier-state.
  const m = medewerker

  return (
    <div>
      {/* Kop met knoppen — zelfde plek in beide modi */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, minHeight: 32 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>Gegevens</h3>
        {editing ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="ghost" size="sm" onClick={() => { setState(toForm(medewerker)); setEditing(false) }} disabled={isPending}>Annuleren</Button>
            <Button type="button" variant="primary" size="sm" onClick={save} loading={isPending} disabled={isPending || !state.voornaam || !state.achternaam}>
              {isPending ? 'Opslaan…' : 'Opslaan'}
            </Button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => { setState(toForm(medewerker)); setEditing(true) }}>Bewerken</Button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Persoonlijk */}
        <section>
          <p style={sectieKopStyle}>Persoonlijk</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Veld label="Voornaam">
              {editing ? <Input style={{ width: '100%' }} value={state.voornaam} onChange={e => set('voornaam', e.target.value)} /> : <Waarde value={m.voornaam} />}
            </Veld>
            <Veld label="Tussenvoegsel">
              {editing ? <Input style={{ width: '100%' }} value={state.tussenvoegsel} onChange={e => set('tussenvoegsel', e.target.value)} placeholder="optioneel" /> : <Waarde value={m.tussenvoegsel} />}
            </Veld>
            <Veld label="Achternaam" span>
              {editing ? <Input style={{ width: '100%' }} value={state.achternaam} onChange={e => set('achternaam', e.target.value)} /> : <Waarde value={m.achternaam} />}
            </Veld>
            <Veld label="E-mail">
              {editing ? <Input type="email" style={{ width: '100%' }} value={state.email} onChange={e => set('email', e.target.value)} /> : <Waarde value={m.email} />}
            </Veld>
            <Veld label="Telefoon">
              {editing ? <Input type="tel" style={{ width: '100%' }} value={state.telefoon} onChange={e => set('telefoon', e.target.value)} /> : <Waarde value={m.telefoon} />}
            </Veld>
            <Veld label="Adres" span>
              {editing ? <Input style={{ width: '100%' }} value={state.adres_straat} onChange={e => set('adres_straat', e.target.value)} placeholder="Straat en huisnummer" /> : <Waarde value={m.adres_straat} />}
            </Veld>
            <Veld label="Postcode">
              {editing ? <Input style={{ width: '100%' }} value={state.adres_postcode} onChange={e => set('adres_postcode', e.target.value)} /> : <Waarde value={m.adres_postcode} />}
            </Veld>
            <Veld label="Plaats">
              {editing ? <Input style={{ width: '100%' }} value={state.adres_plaats} onChange={e => set('adres_plaats', e.target.value)} /> : <Waarde value={m.adres_plaats} />}
            </Veld>
            <Veld label="Geboortedatum">
              {editing ? <Input type="date" style={{ width: '100%' }} value={state.geboortedatum} onChange={e => set('geboortedatum', e.target.value)} /> : <Waarde value={m.geboortedatum} />}
            </Veld>
            <Veld label={<>BSN <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(AVG-gevoelig)</span></>}>
              <BsnVeld value={editing ? state.bsn : (m.bsn ?? '')} onChange={v => set('bsn', v)} disabled={!editing} />
            </Veld>
          </div>
        </section>

        {/* Organisatie */}
        <section>
          <p style={sectieKopStyle}>Organisatie</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Veld label="Functie">
              {editing ? <ComboSelect opties={functieopties} value={state.functie} onChange={v => set('functie', v)} placeholder="bijv. Timmerman" /> : <Waarde value={m.functie} />}
            </Veld>
            <Veld label="Afdeling">
              {editing ? <ComboSelect opties={afdelingopties} value={state.afdeling} onChange={v => set('afdeling', v)} placeholder="bijv. Uitvoering" /> : <Waarde value={m.afdeling} />}
            </Veld>
            <Veld label="Ploeg">
              {editing ? (
                <select className="eva-input" style={{ width: '100%' }} value={state.ploeg_id} onChange={e => set('ploeg_id', e.target.value)}>
                  <option value="">— Geen ploeg —</option>
                  {ploegen.map(p => <option key={p.id} value={p.id}>{p.naam}</option>)}
                </select>
              ) : <Waarde value={ploegen.find(p => p.id === m.ploeg_id)?.naam} />}
            </Veld>
            <Veld label="Uursoort (werkvoorraad)">
              {editing ? (
                <select className="eva-input" style={{ width: '100%' }} value={state.standaard_uursoort_id} onChange={e => set('standaard_uursoort_id', e.target.value)}>
                  <option value="">— Geen —</option>
                  {uursoorten.map(u => <option key={u.id} value={u.id}>{u.naam}</option>)}
                </select>
              ) : <Waarde value={uursoorten.find(u => u.id === m.standaard_uursoort_id)?.naam} />}
            </Veld>
            <Veld label="In dienst vanaf">
              {editing ? <Input type="date" style={{ width: '100%' }} value={state.in_dienst_vanaf} onChange={e => set('in_dienst_vanaf', e.target.value)} /> : <Waarde value={m.in_dienst_vanaf} />}
            </Veld>
            <Veld label="Uit dienst per">
              {editing ? <Input type="date" style={{ width: '100%' }} value={state.uit_dienst_per} onChange={e => set('uit_dienst_per', e.target.value)} /> : <Waarde value={m.uit_dienst_per} />}
            </Veld>
            <Veld label="Administratie">
              {editing ? (
                <select className="eva-input" style={{ width: '100%' }} value={state.werkmaatschappij_id} onChange={e => set('werkmaatschappij_id', e.target.value)}>
                  <option value="">— Geen —</option>
                  {werkmaatschappijen.map(w => <option key={w.id} value={w.id}>{w.naam}</option>)}
                </select>
              ) : <Waarde value={werkmaatschappijen.find(w => w.id === m.werkmaatschappij_id)?.naam} />}
            </Veld>
            <div style={{ display: 'flex', gap: 20, alignItems: 'flex-end', paddingBottom: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: editing ? 'pointer' : 'default', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                <input type="checkbox" checked={editing ? state.extern : m.extern} disabled={!editing} onChange={e => set('extern', e.target.checked)} />
                Extern
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: editing ? 'pointer' : 'default', fontFamily: 'var(--font-ui)', fontSize: 13 }}>
                <input type="checkbox" checked={editing ? state.actief : m.actief} disabled={!editing} onChange={e => set('actief', e.target.checked)} />
                Actief
              </label>
            </div>
            {(editing ? state.extern : m.extern) && (
              <Veld label="Relatie (ZZP-bedrijf / uitzendbureau)" span>
                {editing ? (
                  <select className="eva-input" style={{ width: '100%' }} value={state.relatie_id} onChange={e => set('relatie_id', e.target.value)}>
                    <option value="">— Geen —</option>
                    {relaties.map(r => <option key={r.id} value={r.id}>{r.naam} ({r.types.join(', ')})</option>)}
                  </select>
                ) : <Waarde value={relaties.find(r => r.id === m.relatie_id)?.naam} />}
              </Veld>
            )}
            <div style={{ gridColumn: '1 / -1' }}>
              <span style={labelStyle}>Kleur in planning</span>
              <div style={{ minHeight: 32, display: 'flex', alignItems: 'center', gap: 8 }}>
                {editing ? (
                  <>
                    <input
                      type="color"
                      value={state.kleur || '#3b82f6'}
                      onChange={e => set('kleur', e.target.value)}
                      style={{ width: 36, height: 32, padding: 2, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', background: 'none' }}
                    />
                    <Input
                      type="text"
                      value={state.kleur}
                      onChange={e => set('kleur', e.target.value)}
                      placeholder="#3b82f6 — leeg = automatisch"
                      maxLength={7}
                      style={{ width: 160, fontSize: 12 }}
                    />
                    {state.kleur && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => set('kleur', '')}>
                        Wissen
                      </Button>
                    )}
                  </>
                ) : m.kleur ? (
                  <>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: m.kleur, border: '1px solid var(--border)' }} />
                    <span style={{ ...valueStyle, fontSize: 12 }}>{m.kleur}</span>
                  </>
                ) : (
                  <span style={mutedStyle}>Automatisch (op basis van naam)</span>
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
          <p style={sectieKopStyle}>Beloning</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Veld label="Kostprijs / uur">
              {editing
                ? <Input type="number" min={0} step={0.01} style={{ width: '100%' }} value={state.uurtarief_kostprijs} onChange={e => set('uurtarief_kostprijs', e.target.value)} placeholder="0.00" />
                : <Waarde value={m.uurtarief_kostprijs != null ? `€ ${m.uurtarief_kostprijs}` : null} />}
            </Veld>
            <Veld label="Verkoop / uur">
              {editing
                ? <Input type="number" min={0} step={0.01} style={{ width: '100%' }} value={state.uurtarief_verkoop} onChange={e => set('uurtarief_verkoop', e.target.value)} placeholder="0.00" />
                : <Waarde value={m.uurtarief_verkoop != null ? `€ ${m.uurtarief_verkoop}` : null} />}
            </Veld>
            <CaoSelectie
              editing={editing}
              documenten={caoDocumenten}
              schalen={caoSchalen}
              cao_document_id={editing ? state.cao_document_id : (m.cao_document_id ?? '')}
              cao_schaal={editing ? state.cao_schaal : (m.cao_schaal ?? '')}
              cao_trede={editing ? state.cao_trede : (m.cao_trede ?? '')}
              medewerker_wm_id={(editing ? state.werkmaatschappij_id : m.werkmaatschappij_id) || undefined}
              werkmaatschappijenMap={Object.fromEntries(werkmaatschappijen.map(w => [w.id, w.naam]))}
              onChange={(field, value) => set(field, value)}
            />
          </div>
        </section>
      </div>
    </div>
  )
}
