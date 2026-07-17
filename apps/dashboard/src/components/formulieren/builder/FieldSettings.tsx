'use client'

import React, { useState } from 'react'
import type { AandachtspuntConfig, FormField, FormFieldType, FieldCondition, FieldOption, VeldOpmaak, CalloutVariant } from '../types'
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_GROUPS,
  CALLOUT_VARIANTEN,
  labelToName,
  defaultField,
  isInvoerVeld,
} from '../types'
import { DOSSIER_VARIABELEN } from '../dossier-variabelen'
import { createClient } from '@everts/database/client'

type Props = {
  field: FormField
  allFields: FormField[]
  templateId: string
  onChange: (updated: FormField) => void
}

// ── Stijl-helpers ─────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  fontSize: 13,
  background: 'var(--bg)',
  color: 'var(--text)',
  boxSizing: 'border-box',
  outline: 'none',
}

const selectStyle: React.CSSProperties = { ...inputStyle }

const sectionLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.06em',
  textTransform: 'uppercase' as const,
  color: 'var(--text-muted)',
}

function InputRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', ...sectionLabelStyle, marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />
}

function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9,
          background: checked ? '#009439' : 'var(--border)',
          position: 'relative', flexShrink: 0, cursor: 'pointer',
          transition: 'background 0.2s',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%',
          background: 'white', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }}/>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
    </label>
  )
}

const OPERATORS = [
  { value: 'equals',       label: 'is gelijk aan' },
  { value: 'not_equals',   label: 'is niet gelijk aan' },
  { value: 'contains',     label: 'bevat' },
  { value: 'is_empty',     label: 'is leeg' },
  { value: 'is_not_empty', label: 'is niet leeg' },
]

// Veldtypen die toegestaan zijn als sub-veld (geen nesting van herhalende secties,
// geen dossier-gegeven binnen een rij)
const SUB_FIELD_TYPES: FormFieldType[] = [
  'text', 'textarea', 'number', 'rating', 'date', 'time',
  'dropdown', 'radio', 'checkbox', 'boolean',
  'photo', 'file', 'signature', 'medewerker',
  'heading', 'paragraph', 'divider',
]

// ── Sub-velden editor ─────────────────────────────────────────────────

function SubFieldsEditor({
  children,
  onChange,
}: {
  children: FormField[]
  onChange: (children: FormField[]) => void
}) {
  const [addType, setAddType] = useState<FormFieldType>('text')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function addChild() {
    const names = children.map(c => c.name)
    const child = defaultField(addType, names)
    const next = [...children, child]
    onChange(next)
    setExpandedId(child.id)
  }

  function removeChild(id: string) {
    onChange(children.filter(c => c.id !== id))
    if (expandedId === id) setExpandedId(null)
  }

  function updateChild(updated: FormField) {
    onChange(children.map(c => c.id === updated.id ? updated : c))
  }

  function moveChild(id: string, dir: -1 | 1) {
    const idx = children.findIndex(c => c.id === id)
    if (idx < 0) return
    const next = [...children]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }

  const isStructural = (type: FormFieldType) =>
    type === 'heading' || type === 'paragraph' || type === 'divider'

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <label style={sectionLabelStyle}>Sub-velden</label>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {children.length} veld{children.length !== 1 ? 'en' : ''}
        </span>
      </div>

      {children.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          Nog geen sub-velden. Voeg velden toe die per herhaling worden getoond.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
        {children.map((child, i) => {
          const expanded = expandedId === child.id
          return (
            <div
              key={child.id}
              style={{
                border: `1px solid ${expanded ? '#009439' : 'var(--border)'}`,
                borderRadius: 6,
                overflow: 'hidden',
                background: expanded ? 'rgba(0,148,57,0.03)' : 'var(--bg)',
              }}
            >
              {/* Compact row */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 8px', cursor: 'pointer',
                }}
                onClick={() => setExpandedId(expanded ? null : child.id)}
              >
                {/* Up/down */}
                <div
                  style={{ display: 'flex', flexDirection: 'column', gap: 1, flexShrink: 0 }}
                  onClick={e => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={i === 0}
                    onClick={() => moveChild(child.id, -1)}
                    style={{
                      border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer',
                      padding: '1px 3px', color: i === 0 ? 'var(--border)' : 'var(--text-muted)',
                      fontSize: 9, lineHeight: 1,
                    }}
                  >▲</button>
                  <button
                    type="button"
                    disabled={i === children.length - 1}
                    onClick={() => moveChild(child.id, 1)}
                    style={{
                      border: 'none', background: 'transparent',
                      cursor: i === children.length - 1 ? 'default' : 'pointer',
                      padding: '1px 3px', color: i === children.length - 1 ? 'var(--border)' : 'var(--text-muted)',
                      fontSize: 9, lineHeight: 1,
                    }}
                  >▼</button>
                </div>

                {/* Type badge */}
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
                  background: 'var(--surface-2)', color: 'var(--text-muted)',
                  flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {FIELD_TYPE_LABELS[child.type].split(' ')[0]}
                </span>

                {/* Label */}
                <span style={{
                  flex: 1, fontSize: 12, color: 'var(--text)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {child.label || '(geen label)'}
                  {child.required && <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>}
                </span>

                {/* Expand indicator */}
                <span style={{ fontSize: 9, color: 'var(--text-muted)', flexShrink: 0 }}>
                  {expanded ? '▲' : '▼'}
                </span>

                {/* Delete */}
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); removeChild(child.id) }}
                  style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    color: 'var(--text-muted)', padding: '2px 4px', borderRadius: 4, flexShrink: 0,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                >
                  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              {/* Expanded settings */}
              {expanded && (
                <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                  {/* Label */}
                  {child.type !== 'divider' && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>
                        Label
                      </label>
                      <TextInput
                        value={child.label}
                        onChange={e => {
                          const label = e.target.value
                          const autoName = labelToName(label)
                          const nameWasAuto = child.name === labelToName(child.label)
                          updateChild({ ...child, label, ...(nameWasAuto ? { name: autoName } : {}) })
                        }}
                        placeholder="Veldlabel"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  )}

                  {/* Placeholder (for text/number/etc) */}
                  {!isStructural(child.type) && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 3 }}>
                        Placeholder
                      </label>
                      <TextInput
                        value={child.placeholder ?? ''}
                        onChange={e => updateChild({ ...child, placeholder: e.target.value })}
                        placeholder="(optioneel)"
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  )}

                  {/* Options for dropdown/radio/checkbox */}
                  {(child.type === 'dropdown' || child.type === 'radio' || child.type === 'checkbox') && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>
                        Opties
                      </label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {(child.options ?? []).map((opt, oi) => (
                          <div key={oi} style={{ display: 'flex', gap: 3 }}>
                            <TextInput
                              value={opt.label}
                              onChange={e => {
                                const options = [...(child.options ?? [])]
                                options[oi] = {
                                  label: e.target.value,
                                  value: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
                                }
                                updateChild({ ...child, options })
                              }}
                              placeholder={`Optie ${oi + 1}`}
                              style={{ flex: 1, fontSize: 11 }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const options = (child.options ?? []).filter((_, j) => j !== oi)
                                updateChild({ ...child, options })
                              }}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 4px' }}
                            >✕</button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const n = (child.options?.length ?? 0) + 1
                            const options = [...(child.options ?? []), { label: `Optie ${n}`, value: `optie_${n}` }]
                            updateChild({ ...child, options })
                          }}
                          style={{
                            fontSize: 11, color: 'var(--text-muted)', background: 'transparent',
                            border: '1px dashed var(--border)', borderRadius: 5,
                            padding: '3px 6px', cursor: 'pointer', textAlign: 'left',
                          }}
                        >
                          + Optie toevoegen
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Required toggle */}
                  {!isStructural(child.type) && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
                      <div
                        onClick={() => updateChild({ ...child, required: !child.required })}
                        style={{
                          width: 26, height: 14, borderRadius: 7,
                          background: child.required ? '#009439' : 'var(--border)',
                          position: 'relative', flexShrink: 0, cursor: 'pointer',
                          transition: 'background 0.2s',
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: 1, left: child.required ? 13 : 1,
                          width: 12, height: 12, borderRadius: '50%', background: 'white',
                          transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                        }}/>
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text)' }}>Verplicht veld</span>
                    </label>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add sub-field */}
      <div style={{
        border: '1px dashed var(--border)', borderRadius: 6,
        padding: '8px 10px', background: 'var(--surface)',
      }}>
        <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
          Veld toevoegen
        </label>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={addType}
            onChange={e => setAddType(e.target.value as FormFieldType)}
            style={{ ...selectStyle, flex: 1, fontSize: 12 }}
          >
            {FIELD_TYPE_GROUPS.filter(g => g.label !== 'Sectie').map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.types.filter(t => SUB_FIELD_TYPES.includes(t)).map(t => (
                  <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            onClick={addChild}
            style={{
              padding: '5px 10px', borderRadius: 5,
              border: 'none', background: '#009439', color: 'white',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            + Toevoegen
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Opmaak-hulpcomponenten ────────────────────────────────────────────

function SegmentedControl({
  options, value, onChange,
}: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {options.map((opt, i) => {
        const actief = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            style={{
              flex: 1, padding: '5px 6px', fontSize: 12, cursor: 'pointer',
              border: 'none', borderLeft: i === 0 ? 'none' : '1px solid var(--border)',
              background: actief ? '#009439' : 'var(--bg)',
              color: actief ? 'white' : 'var(--text)', fontWeight: actief ? 600 : 500,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

function UitlijningKiezer({
  value, onChange,
}: { value?: VeldOpmaak['uitlijning']; onChange: (u: VeldOpmaak['uitlijning']) => void }) {
  return (
    <SegmentedControl
      options={[
        { value: 'links', label: 'Links' },
        { value: 'midden', label: 'Midden' },
        { value: 'rechts', label: 'Rechts' },
      ]}
      value={value ?? 'links'}
      onChange={u => onChange(u as VeldOpmaak['uitlijning'])}
    />
  )
}

function KleurKiezer({ value, onChange }: { value?: string; onChange: (k: string | undefined) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        type="color"
        value={value ?? '#161b20'}
        onChange={e => onChange(e.target.value)}
        style={{ width: 34, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', cursor: 'pointer' }}
      />
      <span style={{ fontSize: 12, color: 'var(--text)' }}>{value ?? 'Standaard'}</span>
      {value && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          Reset
        </button>
      )}
    </div>
  )
}

function StijlKnop({
  actief, onClick, label, bold, cursief,
}: { actief: boolean; onClick: () => void; label: string; bold?: boolean; cursief?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 34, height: 30, borderRadius: 6, cursor: 'pointer',
        border: `1px solid ${actief ? '#009439' : 'var(--border)'}`,
        background: actief ? 'rgba(0,148,57,0.08)' : 'var(--bg)',
        color: actief ? '#009439' : 'var(--text)',
        fontSize: 14, fontWeight: bold ? 700 : 500, fontStyle: cursief ? 'italic' : 'normal',
      }}
    >
      {label}
    </button>
  )
}

// Statische sjabloon-afbeelding uploaden naar de publieke `brand-assets` bucket.
// Patroon uit components/LogoUpload.tsx; de URL wordt in het schema-JSONB bewaard.
function AfbeeldingUpload({
  templateId, fieldId, url, onChange,
}: { templateId: string; fieldId: string; url?: string; onChange: (url: string | undefined) => void }) {
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function upload(file: File) {
    setFout(null)
    if (!file.type.startsWith('image/')) { setFout('Alleen afbeeldingen.'); return }
    if (file.size > 5 * 1024 * 1024) { setFout('Maximaal 5 MB.'); return }
    setBezig(true)
    try {
      const supabase = createClient()
      const ext = (file.name.split('.').pop() || 'png').toLowerCase()
      const pad = `form-templates/${templateId}/${fieldId}_${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('brand-assets').upload(pad, file, { upsert: true })
      if (error) { setFout(error.message); return }
      const { data } = supabase.storage.from('brand-assets').getPublicUrl(pad)
      onChange(data.publicUrl)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div>
      {url && (
        <div style={{ marginBottom: 8, position: 'relative', display: 'inline-block' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" style={{ maxWidth: '100%', maxHeight: 120, borderRadius: 6, border: '1px solid var(--border)' }} />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            style={{
              position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.55)', border: 'none',
              borderRadius: '50%', width: 20, height: 20, color: 'white', cursor: 'pointer', fontSize: 11,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>
      )}
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 12px', borderRadius: 6,
        border: '1px dashed var(--border)', cursor: bezig ? 'default' : 'pointer', fontSize: 12,
        color: 'var(--text-muted)', background: 'var(--bg)',
      }}>
        {bezig ? 'Uploaden…' : (url ? 'Vervangen' : 'Afbeelding kiezen')}
        <input
          type="file"
          accept="image/*"
          disabled={bezig}
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }}
        />
      </label>
      {fout && <p style={{ fontSize: 11, color: '#e53e3e', margin: '6px 0 0' }}>{fout}</p>}
    </div>
  )
}

// ── Hoofd FieldSettings component ──────────────────────────────────────

export default function FieldSettings({ field, allFields, templateId, onChange }: Props) {
  const isStructural = !isInvoerVeld(field)
  const hasOptions   = field.type === 'dropdown' || field.type === 'radio' || field.type === 'checkbox'
  const isRepeatable = field.type === 'repeatable'
  const isAandachtspunt = field.type === 'aandachtspunt'
  const isDossier    = field.type === 'dossier'
  const isRating     = field.type === 'rating'
  const isCallout    = field.type === 'callout'
  const isImage      = field.type === 'image'
  const isPagebreak  = field.type === 'pagebreak'
  const isHeading    = field.type === 'heading'
  const isParagraph  = field.type === 'paragraph'
  // Velden zonder tekst-label: scheidingslijn, pagina-einde en afbeelding.
  const heeftLabel   = field.type !== 'divider' && !isPagebreak && !isImage
  const otherFields  = allFields.filter(f => f.id !== field.id && isInvoerVeld(f))

  function update(patch: Partial<FormField>) {
    onChange({ ...field, ...patch })
  }

  function updateOpmaak(patch: Partial<VeldOpmaak>) {
    update({ opmaak: { ...field.opmaak, ...patch } })
  }

  function updateAandachtspunt(patch: Partial<AandachtspuntConfig>) {
    update({ aandachtspunt: { ...field.aandachtspunt, ...patch } })
  }

  function updateOption(idx: number, patch: Partial<FieldOption>) {
    const options = [...(field.options ?? [])]
    options[idx] = { ...options[idx], ...patch }
    update({ options })
  }

  function addOption() {
    const n = (field.options?.length ?? 0) + 1
    update({ options: [...(field.options ?? []), { label: `Optie ${n}`, value: `optie_${n}` }] })
  }

  function removeOption(idx: number) {
    update({ options: (field.options ?? []).filter((_, i) => i !== idx) })
  }

  function addCondition() {
    const conditions: FieldCondition[] = [...(field.conditions ?? []), {
      fieldId: otherFields[0]?.id ?? '',
      operator: 'equals',
      value: '',
      action: 'show',
    }]
    update({ conditions })
  }

  function updateCondition(idx: number, patch: Partial<FieldCondition>) {
    const conditions = [...(field.conditions ?? [])]
    conditions[idx] = { ...conditions[idx], ...patch }
    update({ conditions })
  }

  function removeCondition(idx: number) {
    update({ conditions: (field.conditions ?? []).filter((_, i) => i !== idx) })
  }

  return (
    <aside style={{
      width: 288,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      overflowY: 'auto',
      padding: 16,
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
    }}>
      {/* Type label */}
      <div style={{ marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.06em', color: 'var(--text-muted)',
        }}>
          {FIELD_TYPE_LABELS[field.type]}
        </span>
      </div>

      {/* Divider has no settings */}
      {field.type === 'divider' && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Scheidingslijn heeft geen extra instellingen.
        </p>
      )}

      {/* Pagina-einde has no settings */}
      {isPagebreak && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Splitst het formulier hier in een nieuwe stap bij het invullen, en begint
          een nieuwe pagina in de PDF-export.
        </p>
      )}

      {/* Label */}
      {heeftLabel && (
        <InputRow label={isCallout ? 'Bloktekst' : 'Tekst / Label'}>
          <TextInput
            value={field.label}
            onChange={e => {
              const label = e.target.value
              const autoName = labelToName(label)
              const nameWasAuto = field.name === labelToName(field.label)
              update({ label, ...(nameWasAuto ? { name: autoName } : {}) })
            }}
            placeholder={isHeading ? 'Kopregel tekst' : isParagraph ? 'Tekst­blok inhoud' : isCallout ? 'Bloktekst' : 'Veldlabel'}
          />
        </InputRow>
      )}

      {/* Aandacht-blok: variant-keuze */}
      {isCallout && (
        <InputRow label="Type / kleur">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {(Object.keys(CALLOUT_VARIANTEN) as CalloutVariant[]).map(v => {
              const cfg = CALLOUT_VARIANTEN[v]
              const actief = (field.opmaak?.variant ?? 'info') === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => updateOpmaak({ variant: v })}
                  style={{
                    padding: '6px 8px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${actief ? cfg.tekst : 'var(--border)'}`,
                    background: actief ? cfg.achtergrond : 'var(--bg)',
                    color: cfg.tekst, fontSize: 12, fontWeight: actief ? 700 : 500,
                  }}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </InputRow>
      )}

      {/* Kop-opmaak */}
      {isHeading && (
        <InputRow label="Opmaak">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <SegmentedControl
              options={[
                { value: 'groot', label: 'Groot' },
                { value: 'middel', label: 'Middel' },
                { value: 'klein', label: 'Klein' },
              ]}
              value={field.opmaak?.niveau ?? 'middel'}
              onChange={v => updateOpmaak({ niveau: v as VeldOpmaak['niveau'] })}
            />
            <UitlijningKiezer value={field.opmaak?.uitlijning} onChange={u => updateOpmaak({ uitlijning: u })} />
            <KleurKiezer value={field.opmaak?.kleur} onChange={k => updateOpmaak({ kleur: k })} />
          </div>
        </InputRow>
      )}

      {/* Tekstblok-opmaak */}
      {isParagraph && (
        <InputRow label="Opmaak">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              <StijlKnop actief={!!field.opmaak?.vet} onClick={() => updateOpmaak({ vet: !field.opmaak?.vet })} label="B" bold />
              <StijlKnop actief={!!field.opmaak?.cursief} onClick={() => updateOpmaak({ cursief: !field.opmaak?.cursief })} label="I" cursief />
            </div>
            <UitlijningKiezer value={field.opmaak?.uitlijning} onChange={u => updateOpmaak({ uitlijning: u })} />
            <KleurKiezer value={field.opmaak?.kleur} onChange={k => updateOpmaak({ kleur: k })} />
          </div>
        </InputRow>
      )}

      {/* Afbeelding / Logo */}
      {isImage && (
        <>
          <InputRow label="Afbeelding">
            <AfbeeldingUpload
              templateId={templateId}
              fieldId={field.id}
              url={field.afbeeldingUrl}
              onChange={url => update({ afbeeldingUrl: url })}
            />
          </InputRow>
          <InputRow label={`Breedte (${field.afbeeldingBreedte ?? 200}px)`}>
            <input
              type="range" min={60} max={520} step={10}
              value={field.afbeeldingBreedte ?? 200}
              onChange={e => update({ afbeeldingBreedte: Number(e.target.value) })}
              style={{ width: '100%', accentColor: '#009439' }}
            />
          </InputRow>
          <InputRow label="Uitlijning">
            <UitlijningKiezer value={field.opmaak?.uitlijning} onChange={u => updateOpmaak({ uitlijning: u })} />
          </InputRow>
        </>
      )}

      {/* Internal field name */}
      {!isStructural && (
        <InputRow label="Interne veldnaam">
          <TextInput
            value={field.name}
            onChange={e => update({ name: e.target.value.replace(/\s+/g, '_').replace(/[^a-z0-9_]/gi, '').toLowerCase() })}
            placeholder="veld_naam"
          />
        </InputRow>
      )}

      {/* Placeholder */}
      {!isStructural && !isRepeatable && !isDossier && (
        <InputRow label="Placeholder">
          <TextInput
            value={field.placeholder ?? ''}
            onChange={e => update({ placeholder: e.target.value })}
            placeholder="(optioneel)"
          />
        </InputRow>
      )}

      {/* Help text */}
      {!isStructural && (
        <InputRow label="Helptekst">
          <TextInput
            value={field.helpText ?? ''}
            onChange={e => update({ helpText: e.target.value })}
            placeholder="Toelichting onder het veld"
          />
        </InputRow>
      )}

      {/* Options for dropdown/radio/checkbox */}
      {hasOptions && (
        <InputRow label="Opties">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(field.options ?? []).map((opt, i) => (
              <div key={i} style={{ display: 'flex', gap: 4 }}>
                <TextInput
                  value={opt.label}
                  onChange={e => updateOption(i, {
                    label: e.target.value,
                    value: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
                  })}
                  placeholder={`Optie ${i + 1}`}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  style={{ border: 'none', background: 'transparent', padding: '0 6px', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: 4 }}
                >
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addOption}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 12, color: 'var(--text-muted)', background: 'transparent',
                border: '1px dashed var(--border)', borderRadius: 6,
                padding: '4px 8px', cursor: 'pointer',
              }}
            >
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 5v14M5 12h14"/>
              </svg>
              Optie toevoegen
            </button>
          </div>
        </InputRow>
      )}

      {/* Weergave + bereik voor rating */}
      {isRating && (
        <>
          <InputRow label="Weergave">
            <SegmentedControl
              options={[
                { value: 'cijfers', label: 'Cijfers' },
                { value: 'sterren', label: 'Sterren' },
              ]}
              value={field.ratingStijl ?? 'cijfers'}
              onChange={v => {
                // Bij overschakelen naar sterren een handig standaardbereik (1 t/m 5) voorstellen.
                const naarSterren = v === 'sterren'
                const patch: Partial<FormField> = { ratingStijl: v as 'cijfers' | 'sterren' }
                if (naarSterren && (field.validation?.max ?? 10) > 6) {
                  patch.validation = { ...field.validation, min: 1, max: 5 }
                }
                update(patch)
              }}
            />
          </InputRow>
          <InputRow label={field.ratingStijl === 'sterren' ? 'Aantal sterren' : 'Cijferbereik'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TextInput
                type="number"
                value={String(field.validation?.min ?? 1)}
                onChange={e => update({ validation: { ...field.validation, min: e.target.value === '' ? undefined : Number(e.target.value) } })}
                style={{ width: 70 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>t/m</span>
              <TextInput
                type="number"
                value={String(field.validation?.max ?? 10)}
                onChange={e => update({ validation: { ...field.validation, max: e.target.value === '' ? undefined : Number(e.target.value) } })}
                style={{ width: 70 }}
              />
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              {field.ratingStijl === 'sterren'
                ? 'Bijv. 1 t/m 5. De invuller kiest een aantal sterren.'
                : 'Bijv. 1 t/m 10 of 1 t/m 5. De invuller kiest één cijfer.'}
            </p>
          </InputRow>
        </>
      )}

      {/* Dossier-variabele keuze */}
      {isDossier && (
        <InputRow label="Dossier-gegeven">
          <select
            value={field.dossierVariabele ?? ''}
            onChange={e => update({ dossierVariabele: e.target.value })}
            style={selectStyle}
          >
            {DOSSIER_VARIABELEN.map(v => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
            Wordt bij het invullen automatisch (alleen-lezen) gevuld vanuit het gekoppelde dossier.
          </p>
        </InputRow>
      )}

      {/* Sub-fields editor for repeatable */}
      {isRepeatable && (
        <div style={{ marginBottom: 16 }}>
          <SubFieldsEditor
            children={field.children ?? []}
            onChange={children => update({ children })}
          />
        </div>
      )}

      {/* Aandachtspunt-instellingen */}
      {isAandachtspunt && (
        <div style={{ marginBottom: 16 }}>
          <InputRow label="Soort">
            <SegmentedControl
              options={[
                { value: 'oplever', label: 'Opleverpunt' },
                { value: 'veiligheid', label: 'Veiligheid' },
              ]}
              value={field.aandachtspunt?.soort ?? 'oplever'}
              onChange={v => updateAandachtspunt({ soort: v as 'oplever' | 'veiligheid' })}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5 }}>
              Opleverpunten komen op de opleverlijst van het dossier. Veiligheid is bedoeld voor
              VCA-formulieren en heeft nog geen eigen overzicht.
            </p>
          </InputRow>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
            <Toggle
              checked={field.aandachtspunt?.toonRuimte !== false}
              onChange={v => updateAandachtspunt({ toonRuimte: v })}
              label="Vraag naar de ruimte"
            />
            <Toggle
              checked={field.aandachtspunt?.toonFotos !== false}
              onChange={v => updateAandachtspunt({ toonFotos: v })}
              label="Foto's toestaan"
            />
          </div>

          <InputRow label="Max. aantal punten">
            <TextInput
              type="number"
              min={1}
              value={field.validation?.max ?? ''}
              onChange={e => update({
                validation: { ...field.validation, max: e.target.value === '' ? undefined : Number(e.target.value) },
              })}
              placeholder="Onbeperkt"
            />
          </InputRow>

          {field.aandachtspunt?.toonFotos !== false && (
            <InputRow label="Max. foto's per punt">
              <TextInput
                type="number"
                min={1}
                value={field.aandachtspunt?.maxFotosPerPunt ?? 3}
                onChange={e => updateAandachtspunt({ maxFotosPerPunt: Math.max(1, Number(e.target.value) || 1) })}
              />
            </InputRow>
          )}

          <InputRow label="Tekst op de knop">
            <TextInput
              value={field.aandachtspunt?.toevoegLabel ?? ''}
              onChange={e => updateAandachtspunt({ toevoegLabel: e.target.value })}
              placeholder="Punt toevoegen"
            />
          </InputRow>

          <p style={{
            fontSize: 11, lineHeight: 1.5, margin: 0, padding: '8px 10px', borderRadius: 6,
            color: CALLOUT_VARIANTEN.let_op.tekst,
            background: CALLOUT_VARIANTEN.let_op.achtergrond,
            border: `1px solid ${CALLOUT_VARIANTEN.let_op.rand}`,
          }}>
            Gemelde punten belanden alleen op een opleverlijst als het formulier aan een dossier hangt.
            Wordt dit sjabloon los ingevuld, dan blijven de antwoorden staan maar ontstaat er geen punt.
          </p>
        </div>
      )}

      {/* Toggles */}
      {!isStructural && !isDossier && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {!isRepeatable && (
            <Toggle checked={field.required} onChange={v => update({ required: v })} label="Verplicht veld" />
          )}
          {!isAandachtspunt && (
            <Toggle checked={field.readOnly} onChange={v => update({ readOnly: v })} label="Alleen lezen" />
          )}
          {!isRepeatable && !isAandachtspunt && (
            <Toggle checked={field.rememberLastValue} onChange={v => update({ rememberLastValue: v })} label="Onthoud laatste invoer" />
          )}
        </div>
      )}

      {/* Scheidingslijn voor condities */}
      {!isStructural && (
        <>
          <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }}/>

          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={sectionLabelStyle}>
                Condities
              </label>
              {otherFields.length > 0 && (
                <button
                  type="button"
                  onClick={addCondition}
                  style={{ fontSize: 11, color: '#009439', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  + Toevoegen
                </button>
              )}
            </div>

            {isRepeatable && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, lineHeight: 1.5 }}>
                Voeg condities toe om deze sectie alleen te tonen wanneer aan een eerder antwoord is voldaan.
              </p>
            )}

            {(!field.conditions || field.conditions.length === 0) && (
              <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                Altijd zichtbaar. Voeg een conditie toe om dit {isRepeatable ? 'sectie' : 'veld'} conditioneel te maken.
              </p>
            )}

            {(field.conditions ?? []).map((cond, i) => {
              const bronVeld = otherFields.find(f => f.id === cond.fieldId)
              const heeftOpties =
                bronVeld?.type === 'dropdown' ||
                bronVeld?.type === 'radio'    ||
                bronVeld?.type === 'checkbox'
              const isBoolean = bronVeld?.type === 'boolean'
              const heeftWaarde = cond.operator === 'equals' || cond.operator === 'not_equals' || cond.operator === 'contains'

              return (
                <div key={i} style={{
                  border: '1px solid var(--border)', borderRadius: 6,
                  padding: 8, marginBottom: 6, fontSize: 12,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
                      Conditie {i + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeCondition(i)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
                    >
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <select
                      value={cond.action}
                      onChange={e => updateCondition(i, { action: e.target.value as 'show' | 'hide' })}
                      style={selectStyle}
                    >
                      <option value="show">Toon dit veld als</option>
                      <option value="hide">Verberg dit veld als</option>
                    </select>
                    <select
                      value={cond.fieldId}
                      onChange={e => {
                        // Bij wijzigen bron-veld: reset waarde
                        updateCondition(i, { fieldId: e.target.value, value: '' })
                      }}
                      style={selectStyle}
                    >
                      {otherFields.map(f => (
                        <option key={f.id} value={f.id}>{f.label || f.name}</option>
                      ))}
                    </select>
                    <select
                      value={cond.operator}
                      onChange={e => updateCondition(i, { operator: e.target.value as FieldCondition['operator'] })}
                      style={selectStyle}
                    >
                      {OPERATORS.map(op => (
                        <option key={op.value} value={op.value}>{op.label}</option>
                      ))}
                    </select>

                    {/* Waarde-input: slim op basis van bron-veld type */}
                    {heeftWaarde && heeftOpties && (
                      <select
                        value={cond.value ?? ''}
                        onChange={e => updateCondition(i, { value: e.target.value })}
                        style={selectStyle}
                      >
                        <option value="">— kies een optie —</option>
                        {(bronVeld?.options ?? []).map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}

                    {heeftWaarde && isBoolean && (
                      <select
                        value={cond.value ?? ''}
                        onChange={e => updateCondition(i, { value: e.target.value })}
                        style={selectStyle}
                      >
                        <option value="">— kies waarde —</option>
                        <option value="true">Ja</option>
                        <option value="false">Nee</option>
                      </select>
                    )}

                    {heeftWaarde && !heeftOpties && !isBoolean && (
                      <TextInput
                        value={cond.value ?? ''}
                        onChange={e => updateCondition(i, { value: e.target.value })}
                        placeholder="Waarde"
                      />
                    )}

                    {/* Hint bij ongeldige conditie */}
                    {heeftWaarde && !cond.value && (
                      <p style={{ fontSize: 10, color: '#f59e0b', margin: '2px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                          <path d="M12 9v2m0 4v.01M5.07 19h13.86a2 2 0 001.74-3L13.74 4a2 2 0 00-3.48 0L3.33 16a2 2 0 001.74 3z"/>
                        </svg>
                        Kies een vergelijkingswaarde
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Uitleg AND-logica */}
            {field.conditions && field.conditions.length > 1 && (
              <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.5, fontStyle: 'italic' }}>
                Bij meerdere condities: alle &quot;toon&quot;-condities moeten matchen. Eén &quot;verberg&quot;-conditie verbergt het veld direct.
              </p>
            )}
          </div>
        </>
      )}
    </aside>
  )
}
