'use client'

import React, { useState } from 'react'
import type { FormField, FormFieldType, FieldCondition, FieldOption } from '../types'
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPE_GROUPS,
  labelToName,
  defaultField,
  isInvoerVeld,
} from '../types'
import { DOSSIER_VARIABELEN } from '../dossier-variabelen'

type Props = {
  field: FormField
  allFields: FormField[]
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

// ── Hoofd FieldSettings component ──────────────────────────────────────

export default function FieldSettings({ field, allFields, onChange }: Props) {
  const isStructural = !isInvoerVeld(field)
  const hasOptions   = field.type === 'dropdown' || field.type === 'radio' || field.type === 'checkbox'
  const isRepeatable = field.type === 'repeatable'
  const isDossier    = field.type === 'dossier'
  const isRating     = field.type === 'rating'
  const otherFields  = allFields.filter(f => f.id !== field.id && isInvoerVeld(f))

  function update(patch: Partial<FormField>) {
    onChange({ ...field, ...patch })
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

      {/* Label */}
      {field.type !== 'divider' && (
        <InputRow label="Tekst / Label">
          <TextInput
            value={field.label}
            onChange={e => {
              const label = e.target.value
              const autoName = labelToName(label)
              const nameWasAuto = field.name === labelToName(field.label)
              update({ label, ...(nameWasAuto ? { name: autoName } : {}) })
            }}
            placeholder={field.type === 'heading' ? 'Kopregel tekst' : field.type === 'paragraph' ? 'Tekst­blok inhoud' : 'Veldlabel'}
          />
        </InputRow>
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

      {/* Cijferbereik voor rating */}
      {isRating && (
        <InputRow label="Cijferbereik">
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
            Bijv. 1 t/m 10 of 1 t/m 5. De invuller kiest één cijfer.
          </p>
        </InputRow>
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

      {/* Toggles */}
      {!isStructural && !isDossier && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {!isRepeatable && (
            <Toggle checked={field.required} onChange={v => update({ required: v })} label="Verplicht veld" />
          )}
          <Toggle checked={field.readOnly} onChange={v => update({ readOnly: v })} label="Alleen lezen" />
          {!isRepeatable && (
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
