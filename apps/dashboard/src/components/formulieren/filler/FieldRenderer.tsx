'use client'

import React from 'react'
import { useTranslations } from 'next-intl'
import type { AandachtspuntWaarde, FormField, VeldOpmaak } from '../types'
import { CALLOUT_VARIANTEN, STANDAARD_ACCENT } from '../types'
import type { MedewerkerWaarde } from '../format'
import { Combobox } from '@/components/ui/combobox'
import { useDialogen } from '@/components/ui/dialogen'
import { useFormTeksten } from './formulier-vertaling'
import { AandachtspuntFotos, LocatieVeld, SterrenRating, SignaturePad, type LocatieWaarde } from './FieldRendererOnderdelen'

type Props = {
  field: FormField
  value: unknown
  error?: string
  onChange: (value: unknown) => void
  /** Touch-vriendelijke maatvoering voor de mobiele omgeving. */
  mobiel?: boolean
  /** Keuzelijst voor `medewerker`-velden (actieve medewerkers). */
  medewerkers?: { id: string; naam: string }[]
  /** Accentkleur van het sjabloon (knoppen, rating, selectie). */
  accent?: string
  /**
   * Uploadt een foto bij een aandachtspunt en geeft de opgeslagen URL terug (of null bij een fout).
   * Wordt door de host meegegeven omdat elke omgeving zijn eigen endpoint heeft: ingelogd invullen,
   * het publieke bewonersportaal, of de sjabloon-preview (die geen upload heeft — dan is de
   * fotoknop uitgeschakeld).
   */
  onFotoUpload?: (file: File) => Promise<string | null>
}

/** CSS-uitlijning uit een opmaak-object. */
function tekstAlign(o?: VeldOpmaak): React.CSSProperties['textAlign'] {
  return o?.uitlijning === 'midden' ? 'center' : o?.uitlijning === 'rechts' ? 'right' : 'left'
}

const inputBase: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 7,
  border: '1px solid var(--border)',
  fontSize: 14,
  background: 'var(--bg)',
  color: 'var(--text)',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color 0.15s',
}

// Op mobiel: 16px tegen iOS-zoom + ruimere padding voor touch.
const inputMobiel: React.CSSProperties = {
  padding: '12px 14px',
  borderRadius: 9,
  fontSize: 16,
}

function Label({ field }: { field: FormField }) {
  const [label, helpText] = useFormTeksten([field.label, field.helpText])
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
        {label}
        {field.required && <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>}
      </label>
      {field.helpText && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{helpText}</p>
      )}
    </div>
  )
}

export default function FieldRenderer({ field, value, error, onChange, mobiel = false, medewerkers, accent = STANDAARD_ACCENT, onFotoUpload }: Props) {
  // Let op: dit component keert op tientallen plekken vroegtijdig terug per veldtype,
  // dus elke hook hoort hierboven te staan.
  const { meld } = useDialogen()
  const t = useTranslations('formulieren')
  // Teksten van kantoor alleen voor de weergave vertalen; `opt.value` blijft wat er opgeslagen wordt.
  const [label, placeholder, toevoegLabel, ...optieLabels] = useFormTeksten([
    field.label, field.placeholder, field.aandachtspunt?.toevoegLabel, ...(field.options ?? []).map(o => o.label),
  ])

  const inputStyle: React.CSSProperties = mobiel ? { ...inputBase, ...inputMobiel } : inputBase
  const optieFont = mobiel ? 15 : 14

  if (field.type === 'divider') {
    return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }}/>
  }

  // Pagina-einde is een wizard-splitspunt; als het toch los gerenderd wordt, tonen
  // we een subtiele markering.
  if (field.type === 'pagebreak') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
        <div style={{ flex: 1, borderTop: '1px dashed var(--border)' }}/>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{t('veld.paginaEinde')}</span>
        <div style={{ flex: 1, borderTop: '1px dashed var(--border)' }}/>
      </div>
    )
  }

  if (field.type === 'heading') {
    const niveau = field.opmaak?.niveau ?? 'middel'
    const grootte = niveau === 'groot' ? (mobiel ? 20 : 22) : niveau === 'klein' ? 15 : 17
    return <h3 style={{ fontSize: grootte, fontWeight: 600, color: field.opmaak?.kleur ?? 'var(--text)', margin: 0, textAlign: tekstAlign(field.opmaak) }}>{label}</h3>
  }

  if (field.type === 'paragraph') {
    return (
      <p style={{
        fontSize: 14, margin: 0,
        color: field.opmaak?.kleur ?? 'var(--text-muted)',
        textAlign: tekstAlign(field.opmaak),
        fontWeight: field.opmaak?.vet ? 600 : 400,
        fontStyle: field.opmaak?.cursief ? 'italic' : 'normal',
      }}>{label}</p>
    )
  }

  if (field.type === 'callout') {
    const cfg = CALLOUT_VARIANTEN[field.opmaak?.variant ?? 'info']
    return (
      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-start',
        padding: mobiel ? '12px 14px' : '10px 12px', borderRadius: 8,
        background: cfg.achtergrond, border: `1px solid ${cfg.rand}`, color: cfg.tekst,
      }}>
        <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>
        </svg>
        <span style={{ fontSize: mobiel ? 14 : 13, lineHeight: 1.5 }}>{label}</span>
      </div>
    )
  }

  if (field.type === 'image') {
    const align = field.opmaak?.uitlijning === 'midden' ? 'center' : field.opmaak?.uitlijning === 'rechts' ? 'flex-end' : 'flex-start'
    if (!field.afbeeldingUrl) return null
    return (
      <div style={{ display: 'flex', justifyContent: align }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={field.afbeeldingUrl} alt={label} style={{ width: field.afbeeldingBreedte ?? 200, maxWidth: '100%', borderRadius: 6 }} />
      </div>
    )
  }

  const errorStyle: React.CSSProperties = error
    ? { borderColor: '#e53e3e' }
    : {}

  function wrap(input: React.ReactNode) {
    return (
      <div>
        <Label field={field} />
        {input}
        {error && (
          <p style={{ fontSize: 12, color: '#e53e3e', margin: '4px 0 0' }}>{error}</p>
        )}
      </div>
    )
  }

  // ── Tekst ─────────────────────────────────────────────────────────
  if (field.type === 'text') {
    return wrap(
      <input
        type="text"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || undefined}
        disabled={field.readOnly}
        style={{ ...inputStyle, ...errorStyle }}
      />
    )
  }

  if (field.type === 'textarea') {
    return wrap(
      <textarea
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || undefined}
        disabled={field.readOnly}
        rows={4}
        style={{ ...inputStyle, ...errorStyle, resize: 'vertical' }}
      />
    )
  }

  if (field.type === 'number') {
    return wrap(
      <input
        type="number"
        value={value === undefined || value === null ? '' : String(value)}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        placeholder={placeholder || undefined}
        disabled={field.readOnly}
        style={{ ...inputStyle, ...errorStyle }}
      />
    )
  }

  // ── Cijfer / rating ───────────────────────────────────────────────
  if (field.type === 'rating') {
    const min = field.validation?.min ?? 1
    const max = field.validation?.max ?? 10
    const huidig = typeof value === 'number' ? value : null
    const opties: number[] = []
    for (let n = min; n <= max; n++) opties.push(n)

    // Sterren-weergave: gevuld t/m de gekozen waarde, klik = kies, klik op zelfde = deselect.
    if (field.ratingStijl === 'sterren') {
      return wrap(<SterrenRating opties={opties} huidig={huidig} accent={accent} readOnly={field.readOnly} mobiel={mobiel} onChange={onChange} />)
    }

    const knopMaat = mobiel ? 40 : 34
    return wrap(
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {opties.map(n => {
          const actief = huidig === n
          return (
            <button
              key={n}
              type="button"
              disabled={field.readOnly}
              onClick={() => onChange(actief ? null : n)}
              aria-pressed={actief}
              style={{
                width: knopMaat, height: knopMaat, borderRadius: 8,
                border: `1px solid ${actief ? accent : 'var(--border)'}`,
                background: actief ? accent : 'var(--bg)',
                color: actief ? 'white' : 'var(--text)',
                fontSize: mobiel ? 15 : 14, fontWeight: 600, cursor: field.readOnly ? 'default' : 'pointer',
                transition: 'background 0.12s, border-color 0.12s',
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
    )
  }

  if (field.type === 'date') {
    return wrap(
      <input
        type="date"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        disabled={field.readOnly}
        style={{ ...inputStyle, ...errorStyle }}
      />
    )
  }

  if (field.type === 'time') {
    return wrap(
      <input
        type="time"
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        disabled={field.readOnly}
        style={{ ...inputStyle, ...errorStyle }}
      />
    )
  }

  // ── Keuze ─────────────────────────────────────────────────────────
  if (field.type === 'dropdown') {
    return wrap(
      <select
        value={String(value ?? '')}
        onChange={e => onChange(e.target.value)}
        disabled={field.readOnly}
        style={{ ...inputStyle, ...errorStyle }}
      >
        <option value="">{placeholder || t('veld.kiesOptie')}</option>
        {(field.options ?? []).map((opt, i) => (
          <option key={opt.value} value={opt.value}>{optieLabels[i]}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'radio') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(field.options ?? []).map((opt, i) => (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer', fontSize: optieFont, color: 'var(--text)',
              padding: mobiel ? '4px 0' : 0,
            }}
          >
            <input
              type="radio"
              name={field.id}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              disabled={field.readOnly}
              style={{ accentColor: accent }}
            />
            {optieLabels[i]}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === 'checkbox') {
    const vals = Array.isArray(value) ? (value as string[]) : []
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(field.options ?? []).map((opt, i) => (
          <label
            key={opt.value}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              cursor: 'pointer', fontSize: optieFont, color: 'var(--text)',
              padding: mobiel ? '4px 0' : 0,
            }}
          >
            <input
              type="checkbox"
              checked={vals.includes(opt.value)}
              onChange={e => {
                const next = e.target.checked
                  ? [...vals, opt.value]
                  : vals.filter(v => v !== opt.value)
                onChange(next)
              }}
              disabled={field.readOnly}
              style={{ accentColor: accent }}
            />
            {optieLabels[i]}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === 'boolean') {
    return wrap(
      <div style={{ display: 'flex', gap: 16 }}>
        {(['Ja', 'Nee'] as const).map(opt => (
          <label
            key={opt}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              cursor: 'pointer', fontSize: optieFont, color: 'var(--text)',
            }}
          >
            <input
              type="radio"
              name={field.id}
              value={opt}
              checked={value === (opt === 'Ja' ? true : false)}
              onChange={() => onChange(opt === 'Ja' ? true : false)}
              disabled={field.readOnly}
              style={{ accentColor: accent }}
            />
            {opt === 'Ja' ? t('veld.ja') : t('veld.nee')}
          </label>
        ))}
      </div>
    )
  }

  // ── Media ─────────────────────────────────────────────────────────
  if (field.type === 'photo') {
    const photos = Array.isArray(value) ? (value as string[]) : []
    return wrap(
      <div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {photos.map((url, i) => (
            <div key={i} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                onClick={() => onChange(photos.filter((_, j) => j !== i))}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  background: 'rgba(0,0,0,0.5)', border: 'none',
                  borderRadius: '50%', width: 18, height: 18,
                  color: 'white', cursor: 'pointer', fontSize: 10,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >✕</button>
            </div>
          ))}
        </div>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 7,
          border: '1px dashed var(--border)',
          cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)',
        }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          {t('veld.fotoToevoegen')}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={e => {
              const files = Array.from(e.target.files ?? [])
              files.forEach(file => {
                const reader = new FileReader()
                reader.onload = ev => {
                  onChange([...photos, ev.target?.result as string])
                }
                reader.readAsDataURL(file)
              })
            }}
          />
        </label>
      </div>
    )
  }

  if (field.type === 'file') {
    const fileVal = value as { name: string; size: number } | null
    return wrap(
      <div>
        {fileVal && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 12px', borderRadius: 6, background: 'var(--surface-2)',
            marginBottom: 8, fontSize: 13,
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"/>
            </svg>
            {fileVal.name}
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >✕</button>
          </div>
        )}
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '8px 14px', borderRadius: 7,
          border: '1px dashed var(--border)',
          cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)',
        }}>
          {t('veld.bestandKiezen')}
          <input
            type="file"
            style={{ display: 'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) onChange({ name: f.name, size: f.size, type: f.type })
            }}
          />
        </label>
      </div>
    )
  }

  if (field.type === 'signature') {
    const sigData = value as string | null
    return wrap(
      <div>
        {sigData ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sigData} alt={t('veld.handtekening')} style={{ maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 6 }}/>
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{
                marginTop: 6, fontSize: 12, color: 'var(--text-muted)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              {t('veld.opnieuwTekenen')}
            </button>
          </div>
        ) : (
          <SignaturePad onSave={onChange} />
        )}
      </div>
    )
  }

  if (field.type === 'location') {
    return wrap(<LocatieVeld value={value as LocatieWaarde} onChange={onChange} />)
  }

  if (field.type === 'barcode') {
    return wrap(
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder={t('veld.barcodePlaceholder')}
          style={{ ...inputStyle, ...errorStyle, flex: 1 }}
        />
      </div>
    )
  }

  // ── Koppeling ─────────────────────────────────────────────────────
  if (field.type === 'medewerker') {
    const gekozen = Array.isArray(value) ? (value as MedewerkerWaarde[]) : []
    const gekozenIds = new Set(gekozen.map(m => m.id))
    const opties = (medewerkers ?? [])
      .filter(m => !gekozenIds.has(m.id))
      .map(m => ({ value: m.id, label: m.naam }))

    return wrap(
      <div>
        {gekozen.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: field.readOnly ? 0 : 8 }}>
            {gekozen.map(m => (
              <span
                key={m.id}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: mobiel ? '5px 10px' : '3px 8px', borderRadius: 14,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  fontSize: mobiel ? 14 : 13, color: 'var(--text)',
                }}
              >
                {m.naam}
                {!field.readOnly && (
                  <button
                    type="button"
                    onClick={() => onChange(gekozen.filter(x => x.id !== m.id))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, lineHeight: 1, fontSize: 12 }}
                  >✕</button>
                )}
              </span>
            ))}
          </div>
        )}
        {!field.readOnly && (
          <Combobox
            options={opties}
            value=""
            onChange={id => {
              const med = (medewerkers ?? []).find(m => m.id === id)
              if (med) onChange([...gekozen, { id: med.id, naam: med.naam }])
            }}
            placeholder={placeholder || t('veld.medewerkerToevoegen')}
            searchPlaceholder={t('veld.zoekMedewerker')}
            emptyText={(medewerkers?.length ?? 0) > 0 ? t('veld.geenMedewerkerGevonden') : t('veld.geenMedewerkers')}
          />
        )}
      </div>
    )
  }

  if (field.type === 'dossier') {
    const tekst = value === undefined || value === null || value === '' ? null : String(value)
    return wrap(
      <div style={{
        ...inputStyle,
        background: 'var(--surface-2)',
        color: tekst ? 'var(--text)' : 'var(--text-muted)',
        cursor: 'default',
      }}>
        {tekst ?? t('veld.uitDossier')}
      </div>
    )
  }

  if (field.type === 'aandachtspunt') {
    const cfg = field.aandachtspunt ?? {}
    const punten = Array.isArray(value) ? (value as AandachtspuntWaarde[]) : []
    const maxPunten = field.validation?.max
    const magToevoegen = maxPunten === undefined || punten.length < maxPunten

    const wijzig = (i: number, patch: Partial<AandachtspuntWaarde>) => {
      const next = [...punten]
      next[i] = { ...next[i], ...patch }
      onChange(next)
    }

    return (
      <div>
        <Label field={field} />
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', ...errorStyle }}>
          <div style={{
            padding: '10px 14px',
            background: 'var(--surface)',
            borderBottom: punten.length > 0 ? '1px solid var(--border)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {punten.length === 0 ? t('veld.geenPunten') : t('veld.aantalPunten', { aantal: punten.length })}
            </span>
            {magToevoegen && (
              <button
                type="button"
                onClick={() => onChange([...punten, { omschrijving: '', ruimte: null, fotos: [] }])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: accent, color: 'white',
                  border: 'none', borderRadius: 5, padding: mobiel ? '8px 14px' : '4px 10px',
                  fontSize: mobiel ? 14 : 12, cursor: 'pointer',
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                {toevoegLabel || t('veld.puntToevoegen')}
              </button>
            )}
          </div>

          {punten.map((punt, i) => (
            <div key={i} style={{
              padding: '12px 14px',
              borderBottom: i < punten.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{t('veld.puntNummer', { nummer: i + 1 })}</span>
                <button
                  type="button"
                  onClick={() => onChange(punten.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
                >
                  {t('veld.verwijderen')}
                </button>
              </div>

              <textarea
                value={punt?.omschrijving ?? ''}
                onChange={e => wijzig(i, { omschrijving: e.target.value })}
                placeholder={placeholder || t('veld.watNietInOrde')}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              {cfg.toonRuimte !== false && (
                <input
                  type="text"
                  value={punt?.ruimte ?? ''}
                  onChange={e => wijzig(i, { ruimte: e.target.value })}
                  placeholder={t('veld.ruimtePlaceholder')}
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              )}

              {cfg.toonDeadline && (
                <input
                  type="date"
                  value={punt?.deadline ?? ''}
                  onChange={e => wijzig(i, { deadline: e.target.value || null })}
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              )}

              {cfg.toonMeerwerk && (
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
                  fontSize: optieFont, color: 'var(--text)', cursor: 'pointer',
                }}>
                  <input
                    type="checkbox"
                    checked={punt?.isExtraWerk === true}
                    onChange={e => wijzig(i, { isExtraWerk: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: accent }}
                  />
                  {t('veld.ditIsMeerwerk')}
                </label>
              )}

              {cfg.toonFotos !== false && (
                <AandachtspuntFotos
                  fotos={punt?.fotos ?? []}
                  max={cfg.maxFotosPerPunt ?? 3}
                  onFotoUpload={onFotoUpload}
                  onChange={fotos => wijzig(i, { fotos })}
                />
              )}
            </div>
          ))}
        </div>
        {error && <p style={{ fontSize: 12, color: '#e53e3e', margin: '4px 0 0' }}>{error}</p>}
      </div>
    )
  }

  if (field.type === 'repeatable') {
    const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          padding: '10px 14px',
          background: 'var(--surface)',
          borderBottom: rows.length > 0 ? '1px solid var(--border)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
          <button
            type="button"
            onClick={() => onChange([...rows, {}])}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              background: accent, color: 'white',
              border: 'none', borderRadius: 5, padding: '4px 10px',
              fontSize: 12, cursor: 'pointer',
            }}
          >
            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M12 5v14M5 12h14"/>
            </svg>
            {t('veld.toevoegen')}
          </button>
        </div>
        {rows.map((row, i) => (
          <div key={i} style={{
            padding: '12px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>#{i + 1}</span>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
              >
                {t('veld.verwijderen')}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(field.children ?? []).map(child => (
                <FieldRenderer
                  key={child.id}
                  field={child}
                  value={row[child.id]}
                  mobiel={mobiel}
                  medewerkers={medewerkers}
                  accent={accent}
                  onFotoUpload={onFotoUpload}
                  onChange={val => {
                    const next = [...rows]
                    next[i] = { ...next[i], [child.id]: val }
                    onChange(next)
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
      {t('veld.nietOndersteund', { type: field.type })}
    </div>
  )
}
