'use client'

import React, { useState, useEffect } from 'react'
import type { FormField, FieldCondition } from '../types'
import { evaluateConditions, conditionMatches } from '../types'
import FieldRenderer from '../filler/FieldRenderer'
import { getMedewerkersVoorToewijzing } from '@/app/(platform)/taken/actions/sjablonen'

type Props = {
  fields: FormField[]
}

function getVandaag() {
  return new Date().toISOString().slice(0, 10)
}
function getNuTijd() {
  const n = new Date()
  return `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`
}

function initValues(fields: FormField[]): Record<string, unknown> {
  const vals: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.type === 'date') vals[f.id] = getVandaag()
    if (f.type === 'time') vals[f.id] = getNuTijd()
  }
  return vals
}

function fieldLabel(fields: FormField[], id: string): string {
  return fields.find(f => f.id === id)?.label ?? '?'
}

function fieldOptionLabel(fields: FormField[], fieldId: string, value: string): string {
  const f = fields.find(x => x.id === fieldId)
  if (!f) return value
  const opt = f.options?.find(o => o.value === value)
  return opt?.label ?? value
}

function operatorLabel(op: FieldCondition['operator']): string {
  switch (op) {
    case 'equals':       return '='
    case 'not_equals':   return '≠'
    case 'contains':     return 'bevat'
    case 'is_empty':     return 'is leeg'
    case 'is_not_empty': return 'is niet leeg'
  }
}

export default function FormTester({ fields }: Props) {
  const [values, setValues]   = useState<Record<string, unknown>>(() => initValues(fields))
  const [ingediend, setIngediend] = useState(false)
  const [showDebug, setShowDebug] = useState(true)
  const [medewerkers, setMedewerkers] = useState<{ id: string; naam: string }[]>([])

  // Medewerkers laden voor `medewerker`-velden in de testweergave.
  useEffect(() => {
    let actief = true
    getMedewerkersVoorToewijzing()
      .then(list => { if (actief) setMedewerkers(list.map(m => ({ id: m.id, naam: m.naam }))) })
      .catch(() => { /* lijst blijft leeg */ })
    return () => { actief = false }
  }, [])

  const zichtbaar = fields.filter(f => evaluateConditions(f, fields, values))
  const verborgen = fields.filter(f => !evaluateConditions(f, fields, values))
  const metCondities = fields.filter(f => f.conditions && f.conditions.length > 0)

  function updateValue(fieldId: string, value: unknown) {
    setValues(prev => ({ ...prev, [fieldId]: value }))
  }

  function reset() {
    setValues(initValues(fields))
    setIngediend(false)
  }

  if (ingediend) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: '40px 32px' }}>
        <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>
            Test succesvol afgerond
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 24 }}>
            Dit is een testinzending — er is niets opgeslagen.
          </p>
          <button type="button" onClick={reset} style={{
            padding: '9px 22px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)',
            color: 'var(--text)', fontSize: 14, cursor: 'pointer',
          }}>
            Opnieuw testen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Hoofdpaneel: het formulier */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Banner */}
        <div style={{
          background: '#fef3c7',
          borderBottom: '1px solid #fde68a',
          padding: '8px 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth={2}>
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              Testmodus — niets wordt opgeslagen
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => setShowDebug(!showDebug)} style={{
              fontSize: 11, color: '#92400e', background: 'transparent',
              border: '1px solid #fcd34d', borderRadius: 5,
              padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
            }}>
              {showDebug ? '◀ Verberg debug' : '▶ Toon debug'}
            </button>
            <button type="button" onClick={reset} style={{
              fontSize: 11, color: '#92400e', background: 'transparent',
              border: '1px solid #fcd34d', borderRadius: 5,
              padding: '3px 10px', cursor: 'pointer', fontWeight: 600,
            }}>
              Reset
            </button>
          </div>
        </div>

        {/* Formulier */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px' }}>
          <div style={{ maxWidth: 640, margin: '0 auto' }}>
            {fields.length === 0 && (
              <p style={{ color: 'var(--text-muted)', fontSize: 14, textAlign: 'center', paddingTop: 40 }}>
                Voeg eerst velden toe in de builder om te testen.
              </p>
            )}

            {verborgen.length > 0 && (
              <div style={{
                marginBottom: 20, padding: '8px 14px', borderRadius: 7,
                background: 'rgba(0,148,57,0.08)', border: '1px solid rgba(0,148,57,0.2)',
                fontSize: 12, color: '#166534',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                {verborgen.length} veld{verborgen.length !== 1 ? 'en' : ''} verborgen door condities
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {zichtbaar.map(field => (
                <div key={field.id} style={{ position: 'relative' }}>
                  <FieldRenderer
                    field={field}
                    value={values[field.id]}
                    onChange={val => updateValue(field.id, val)}
                    medewerkers={medewerkers}
                  />
                  {field.conditions && field.conditions.length > 0 && (
                    <span style={{
                      position: 'absolute', top: 0, right: 0,
                      fontSize: 9, fontWeight: 700,
                      background: 'rgba(0,148,57,0.1)', color: '#15803d',
                      padding: '1px 5px', borderRadius: 4,
                      border: '1px solid rgba(0,148,57,0.2)',
                    }}>
                      ✓ conditie actief
                    </span>
                  )}
                </div>
              ))}
            </div>

            {fields.length > 0 && (
              <div style={{
                marginTop: 36, paddingTop: 20,
                borderTop: '1px solid var(--border)',
                display: 'flex', gap: 10,
              }}>
                <button type="button" onClick={reset} style={{
                  padding: '9px 18px', borderRadius: 7,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text)',
                  fontSize: 14, cursor: 'pointer',
                }}>
                  Reset
                </button>
                <button type="button" onClick={() => setIngediend(true)} style={{
                  flex: 1, padding: '9px 18px', borderRadius: 7,
                  border: 'none', background: '#009439', color: 'white',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer',
                }}>
                  Test indienen (simulatie)
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Debug-paneel rechts */}
      {showDebug && (
        <aside style={{
          width: 320, flexShrink: 0,
          borderLeft: '1px solid var(--border)',
          background: 'var(--surface)',
          overflowY: 'auto',
          padding: '16px 18px',
        }}>
          <h3 style={{
            margin: '0 0 12px', fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--text-muted)',
          }}>
            Conditie-debug
          </h3>

          {metCondities.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Geen velden met condities in dit formulier.
            </p>
          ) : (
            <>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.5 }}>
                Per veld zie je of het zichtbaar is en welke condities matchen.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {metCondities.map(f => {
                  const isVisible = evaluateConditions(f, fields, values)
                  return (
                    <div key={f.id} style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6, overflow: 'hidden',
                      background: 'var(--bg)',
                    }}>
                      <div style={{
                        padding: '6px 10px',
                        background: isVisible ? 'rgba(0,148,57,0.08)' : 'rgba(239,68,68,0.06)',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {f.label || f.name}
                        </span>
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: isVisible ? '#16a34a' : '#dc2626',
                          color: 'white',
                        }}>
                          {isVisible ? 'ZICHTBAAR' : 'VERBORGEN'}
                        </span>
                      </div>
                      <div style={{ padding: '6px 10px', fontSize: 11 }}>
                        {(f.conditions ?? []).map((cond, ci) => {
                          const matches = conditionMatches(cond, values)
                          const valLabel = cond.value
                            ? fieldOptionLabel(fields, cond.fieldId, cond.value)
                            : ''
                          return (
                            <div key={ci} style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '3px 0',
                              borderBottom: ci < (f.conditions?.length ?? 0) - 1 ? '1px dashed var(--border)' : 'none',
                            }}>
                              <span style={{
                                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                                background: matches ? '#16a34a' : 'var(--border)',
                                color: 'white', fontSize: 10,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {matches ? '✓' : '×'}
                              </span>
                              <span style={{ fontSize: 11, color: 'var(--text-muted)', flex: 1, minWidth: 0 }}>
                                <span style={{ fontWeight: 600, color: cond.action === 'hide' ? '#dc2626' : '#15803d' }}>
                                  {cond.action === 'show' ? 'toon' : 'verberg'}
                                </span>
                                {' als '}
                                <strong style={{ color: 'var(--text)' }}>{fieldLabel(fields, cond.fieldId)}</strong>
                                {' '}{operatorLabel(cond.operator)}
                                {valLabel && <> <strong style={{ color: 'var(--text)' }}>&quot;{valLabel}&quot;</strong></>}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Ruwe waarden */}
          <details style={{ marginTop: 18 }}>
            <summary style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Ruwe waarden
            </summary>
            <pre style={{
              marginTop: 8, fontSize: 10, lineHeight: 1.5,
              background: 'var(--bg)', padding: 8, borderRadius: 5,
              border: '1px solid var(--border)',
              overflow: 'auto', maxHeight: 200,
              color: 'var(--text)',
            }}>
              {JSON.stringify(values, null, 2)}
            </pre>
          </details>
        </aside>
      )}
    </div>
  )
}
