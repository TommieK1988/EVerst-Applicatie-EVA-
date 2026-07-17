'use client'

import React, { useRef, useEffect, useState } from 'react'
import type { AandachtspuntWaarde, FormField, VeldOpmaak } from '../types'
import { CALLOUT_VARIANTEN, STANDAARD_ACCENT } from '../types'
import type { MedewerkerWaarde } from '../format'
import { Combobox } from '@/components/ui/combobox'

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
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)' }}>
        {field.label}
        {field.required && <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>}
      </label>
      {field.helpText && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '3px 0 0' }}>{field.helpText}</p>
      )}
    </div>
  )
}

export default function FieldRenderer({ field, value, error, onChange, mobiel = false, medewerkers, accent = STANDAARD_ACCENT, onFotoUpload }: Props) {

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
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Pagina-einde</span>
        <div style={{ flex: 1, borderTop: '1px dashed var(--border)' }}/>
      </div>
    )
  }

  if (field.type === 'heading') {
    const niveau = field.opmaak?.niveau ?? 'middel'
    const grootte = niveau === 'groot' ? (mobiel ? 20 : 22) : niveau === 'klein' ? 15 : 17
    return <h3 style={{ fontSize: grootte, fontWeight: 600, color: field.opmaak?.kleur ?? 'var(--text)', margin: 0, textAlign: tekstAlign(field.opmaak) }}>{field.label}</h3>
  }

  if (field.type === 'paragraph') {
    return (
      <p style={{
        fontSize: 14, margin: 0,
        color: field.opmaak?.kleur ?? 'var(--text-muted)',
        textAlign: tekstAlign(field.opmaak),
        fontWeight: field.opmaak?.vet ? 600 : 400,
        fontStyle: field.opmaak?.cursief ? 'italic' : 'normal',
      }}>{field.label}</p>
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
        <span style={{ fontSize: mobiel ? 14 : 13, lineHeight: 1.5 }}>{field.label}</span>
      </div>
    )
  }

  if (field.type === 'image') {
    const align = field.opmaak?.uitlijning === 'midden' ? 'center' : field.opmaak?.uitlijning === 'rechts' ? 'flex-end' : 'flex-start'
    if (!field.afbeeldingUrl) return null
    return (
      <div style={{ display: 'flex', justifyContent: align }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={field.afbeeldingUrl} alt={field.label} style={{ width: field.afbeeldingBreedte ?? 200, maxWidth: '100%', borderRadius: 6 }} />
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
        placeholder={field.placeholder}
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
        placeholder={field.placeholder}
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
        placeholder={field.placeholder}
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
        <option value="">{field.placeholder || 'Kies een optie...'}</option>
        {(field.options ?? []).map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    )
  }

  if (field.type === 'radio') {
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(field.options ?? []).map(opt => (
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
            {opt.label}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === 'checkbox') {
    const vals = Array.isArray(value) ? (value as string[]) : []
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(field.options ?? []).map(opt => (
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
            {opt.label}
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
            {opt}
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
          Foto toevoegen
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
          Bestand kiezen
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
            <img src={sigData} alt="Handtekening" style={{ maxWidth: '100%', border: '1px solid var(--border)', borderRadius: 6 }}/>
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{
                marginTop: 6, fontSize: 12, color: 'var(--text-muted)',
                background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              Opnieuw tekenen
            </button>
          </div>
        ) : (
          <SignaturePad onSave={onChange} />
        )}
      </div>
    )
  }

  if (field.type === 'location') {
    const locVal = value as { lat: number; lng: number; adres?: string } | null
    return wrap(
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {locVal ? (
          <div style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--surface-2)', fontSize: 13 }}>
            📍 {locVal.adres ?? `${locVal.lat.toFixed(6)}, ${locVal.lng.toFixed(6)}`}
            <button
              type="button"
              onClick={() => onChange(null)}
              style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
            >
              Wissen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!navigator.geolocation) { alert('GPS niet beschikbaar'); return }
              navigator.geolocation.getCurrentPosition(
                pos => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                () => alert('Locatie ophalen mislukt')
              )
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <circle cx="12" cy="11" r="3"/>
            </svg>
            Huidige locatie gebruiken
          </button>
        )}
      </div>
    )
  }

  if (field.type === 'barcode') {
    return wrap(
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          placeholder="Scan of typ barcode/QR"
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
            placeholder={field.placeholder || 'Medewerker toevoegen…'}
            searchPlaceholder="Zoek medewerker…"
            emptyText={(medewerkers?.length ?? 0) > 0 ? 'Geen medewerker gevonden.' : 'Geen medewerkers beschikbaar.'}
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
        {tekst ?? '(wordt automatisch uit het dossier gehaald)'}
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
              {punten.length === 0
                ? 'Nog geen punten gemeld'
                : `${punten.length} punt${punten.length === 1 ? '' : 'en'}`}
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
                {cfg.toevoegLabel || 'Punt toevoegen'}
              </button>
            )}
          </div>

          {punten.map((punt, i) => (
            <div key={i} style={{
              padding: '12px 14px',
              borderBottom: i < punten.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>Punt {i + 1}</span>
                <button
                  type="button"
                  onClick={() => onChange(punten.filter((_, j) => j !== i))}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 12 }}
                >
                  Verwijderen
                </button>
              </div>

              <textarea
                value={punt?.omschrijving ?? ''}
                onChange={e => wijzig(i, { omschrijving: e.target.value })}
                placeholder={field.placeholder || 'Wat is er niet in orde?'}
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
              />

              {cfg.toonRuimte !== false && (
                <input
                  type="text"
                  value={punt?.ruimte ?? ''}
                  onChange={e => wijzig(i, { ruimte: e.target.value })}
                  placeholder="Ruimte of plek (bijv. woonkamer)"
                  style={{ ...inputStyle, marginTop: 8 }}
                />
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
          <span style={{ fontSize: 14, fontWeight: 500 }}>{field.label}</span>
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
            Toevoegen
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
                Verwijderen
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
      [Veldtype '{field.type}' niet ondersteund in invulweergave]
    </div>
  )
}

// ── Foto's bij een aandachtspunt ──────────────────────────────────────
//
// Anders dan het `photo`-veld slaan we hier géén data-URL op: de foto gaat meteen naar de opslag en
// alleen de URL komt in de inzending. Dat houdt de payload klein genoeg om te kunnen versturen.

function AandachtspuntFotos({
  fotos, max, onFotoUpload, onChange,
}: {
  fotos: string[]
  max: number
  onFotoUpload?: (file: File) => Promise<string | null>
  onChange: (fotos: string[]) => void
}) {
  const [bezig, setBezig] = useState(0)
  const [fout, setFout] = useState<string | null>(null)

  async function kies(e: React.ChangeEvent<HTMLInputElement>) {
    if (!onFotoUpload) return
    const files = Array.from(e.target.files ?? []).slice(0, Math.max(0, max - fotos.length))
    e.target.value = ''
    if (files.length === 0) return

    setFout(null)
    setBezig(n => n + files.length)
    const urls: string[] = []
    for (const file of files) {
      try {
        const url = await onFotoUpload(file)
        if (url) urls.push(url)
        else setFout('Een foto kon niet worden geüpload.')
      } catch {
        setFout('Een foto kon niet worden geüpload.')
      } finally {
        setBezig(n => n - 1)
      }
    }
    if (urls.length) onChange([...fotos, ...urls])
  }

  const vol = fotos.length + bezig >= max

  return (
    <div style={{ marginTop: 8 }}>
      {(fotos.length > 0 || bezig > 0) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {fotos.map((url, i) => (
            <div key={url} style={{ position: 'relative' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
              />
              <button
                type="button"
                onClick={() => onChange(fotos.filter((_, j) => j !== i))}
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
          {Array.from({ length: bezig }).map((_, i) => (
            <div
              key={`bezig-${i}`}
              style={{
                width: 64, height: 64, borderRadius: 6,
                border: '1px dashed var(--border)', background: 'var(--surface)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, color: 'var(--text-muted)',
              }}
            >…</div>
          ))}
        </div>
      )}

      {!onFotoUpload ? (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
          Foto&apos;s toevoegen kan in het echte formulier.
        </p>
      ) : !vol && (
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px', borderRadius: 7,
          border: '1px dashed var(--border)',
          cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)',
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          Foto toevoegen
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            style={{ display: 'none' }}
            onChange={kies}
          />
        </label>
      )}

      {fout && <p style={{ fontSize: 12, color: '#e53e3e', margin: '4px 0 0' }}>{fout}</p>}
    </div>
  )
}

// ── Sterren-rating ────────────────────────────────────────────────────

function SterrenRating({
  opties, huidig, accent, readOnly, mobiel, onChange,
}: {
  opties: number[]
  huidig: number | null
  accent: string
  readOnly?: boolean
  mobiel?: boolean
  onChange: (v: number | null) => void
}) {
  const [hover, setHover] = useState<number | null>(null)
  const maat = mobiel ? 34 : 28
  const actiefTot = hover ?? huidig ?? 0
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {opties.map(n => {
        const gevuld = n <= actiefTot
        return (
          <button
            key={n}
            type="button"
            disabled={readOnly}
            aria-label={`${n}`}
            aria-pressed={huidig === n}
            onClick={() => onChange(huidig === n ? null : n)}
            onMouseEnter={() => !readOnly && setHover(n)}
            onMouseLeave={() => !readOnly && setHover(null)}
            style={{
              background: 'none', border: 'none', padding: 0, lineHeight: 0,
              cursor: readOnly ? 'default' : 'pointer',
            }}
          >
            <svg
              width={maat} height={maat} viewBox="0 0 24 24"
              fill={gevuld ? accent : 'none'}
              stroke={gevuld ? accent : 'var(--border)'}
              strokeWidth={1.5}
            >
              <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
            </svg>
          </button>
        )
      })}
    </div>
  )
}

// ── Handtekening-component ────────────────────────────────────────────

const SIG_HEIGHT = 160

function SignaturePad({ onSave }: { onSave: (data: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing   = useRef(false)
  const hasData   = useRef(false)

  // Canvas-buffer afstemmen op de werkelijke (responsive) weergavebreedte ×
  // devicePixelRatio. Zónder dit loopt de teken-coördinaat (CSS-px) niet gelijk
  // met de buffer (was hard 560px), wat de lijn verschoven/uitgerekt maakte op
  // smalle schermen. Configureert tevens de penstijl; canvas.width-toewijzing
  // reset namelijk de context-transform.
  function sizeCanvas() {
    const c = canvasRef.current
    if (!c) return
    const cssW = c.clientWidth || 300
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(cssW * dpr)
    c.height = Math.round(SIG_HEIGHT * dpr)
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    hasData.current = false
  }

  useEffect(() => {
    sizeCanvas()
    window.addEventListener('resize', sizeCanvas)
    window.addEventListener('orientationchange', sizeCanvas)
    return () => {
      window.removeEventListener('resize', sizeCanvas)
      window.removeEventListener('orientationchange', sizeCanvas)
    }
  }, [])

  function getPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    drawing.current = true
    canvasRef.current?.setPointerCapture(e.pointerId)
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasData.current = true
  }

  function onUp() {
    drawing.current = false
    if (hasData.current && canvasRef.current) {
      onSave(canvasRef.current.toDataURL('image/png'))
    }
  }

  function clear() {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    // wis in buffer-coördinaten
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.restore()
    hasData.current = false
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        style={{
          border: '1px solid var(--border)',
          borderRadius: 7,
          background: '#fafafa',
          touchAction: 'none',
          cursor: 'crosshair',
          width: '100%',
          height: SIG_HEIGHT,
          display: 'block',
        }}
      />
      <button
        type="button"
        onClick={clear}
        style={{
          marginTop: 6, fontSize: 12, color: 'var(--text-muted)',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
        }}
      >
        Leegmaken
      </button>
    </div>
  )
}
