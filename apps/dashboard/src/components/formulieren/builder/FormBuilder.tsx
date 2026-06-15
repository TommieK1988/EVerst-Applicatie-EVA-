'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { FormField, FormFieldType, FormSchema, FormTemplate, FormVersie } from '../types'
import { defaultField } from '../types'
import FieldPalette from './FieldPalette'
import FormCanvas from './FormCanvas'
import FieldSettings from './FieldSettings'
import FormTester from './FormTester'
import { saveFormVersie, updateFormTemplate, publishFormTemplate } from '@/app/(platform)/formulieren/actions'

type Props = {
  template: FormTemplate & { is_kam_vgm?: boolean }
  versie: FormVersie
}

export default function FormBuilder({ template, versie }: Props) {
  const router = useRouter()
  const [templateNaam, setTemplateNaam] = useState(template.naam)
  const [fields, setFields] = useState<FormField[]>(versie.schema.fields ?? [])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showTester, setShowTester] = useState(false)
  const [showInstellingen, setShowInstellingen] = useState(false)
  const [isKamVgm, setIsKamVgm] = useState(template.is_kam_vgm ?? false)

  const selectedField = fields.find(f => f.id === selectedId) ?? null

  function markDirty() { setIsDirty(true) }

  function addField(type: FormFieldType) {
    const names = fields.map(f => f.name)
    const field = defaultField(type, names)
    setFields(prev => [...prev, field])
    setSelectedId(field.id)
    markDirty()
  }

  function updateField(updated: FormField) {
    setFields(prev => prev.map(f => f.id === updated.id ? updated : f))
    markDirty()
  }

  function deleteField(id: string) {
    setFields(prev => prev.filter(f => f.id !== id))
    if (selectedId === id) setSelectedId(null)
    markDirty()
  }

  function reorderFields(next: FormField[]) {
    setFields(next)
    markDirty()
  }

  async function handleSave() {
    setIsSaving(true)
    try {
      // Naam + KAM/VGM bijwerken als gewijzigd
      if (templateNaam !== template.naam || isKamVgm !== (template.is_kam_vgm ?? false)) {
        await updateFormTemplate(template.id, { naam: templateNaam, is_kam_vgm: isKamVgm })
      }

      const schema: FormSchema = { version: 1, fields }
      const result = await saveFormVersie(template.id, schema)
      if (!result.ok) {
        toast.error('Opslaan mislukt: ' + result.error)
        return
      }
      setIsDirty(false)
      toast.success('Formulier opgeslagen')
    } finally {
      setIsSaving(false)
    }
  }

  async function handlePublish() {
    if (isDirty) {
      await handleSave()
    }
    setIsPublishing(true)
    try {
      const result = await publishFormTemplate(template.id)
      if (!result.ok) {
        toast.error('Publiceren mislukt: ' + result.error)
        return
      }
      toast.success('Formulier gepubliceerd')
      router.refresh()
    } finally {
      setIsPublishing(false)
    }
  }

  const isPublished = template.status === 'gepubliceerd'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 20px',
        height: 52,
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        flexShrink: 0,
      }}>
        {/* Back */}
        <button
          type="button"
          onClick={() => router.push('/formulieren/sjablonen')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 13, padding: '4px 8px',
            borderRadius: 6,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Formulieren
        </button>

        <div style={{ width: 1, height: 20, background: 'var(--border)' }}/>

        {/* Template naam */}
        <input
          value={templateNaam}
          onChange={e => { setTemplateNaam(e.target.value); markDirty() }}
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 600,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            minWidth: 0,
          }}
          placeholder="Formuliernaam"
        />

        {/* Status badge */}
        <span style={{
          fontSize: 11,
          padding: '2px 8px',
          borderRadius: 10,
          background: isPublished ? '#dcfce7' : '#fef9c3',
          color: isPublished ? '#16a34a' : '#854d0e',
          fontWeight: 600,
          flexShrink: 0,
        }}>
          {isPublished ? 'Gepubliceerd' : 'Concept'}
        </span>

        {isDirty && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Niet opgeslagen
          </span>
        )}

        {/* Voorbeeld-toggle */}
        <button
          type="button"
          onClick={() => { setShowPreview(!showPreview); setShowTester(false) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: showPreview ? '#009439' : 'var(--surface)',
            color: showPreview ? 'white' : 'var(--text)',
            fontSize: 13, cursor: 'pointer',
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          Voorbeeld
        </button>

        {/* Test-modus */}
        <button
          type="button"
          onClick={() => { setShowTester(!showTester); setShowPreview(false) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: showTester ? '#f59e0b' : 'var(--surface)',
            color: showTester ? 'white' : 'var(--text)',
            fontSize: 13, cursor: 'pointer',
          }}
          title="Test condities en herhalende secties interactief"
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          Test
        </button>

        {/* PDF voorbeeld */}
        <a
          href={`/formulieren/${template.id}/preview-pdf`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 13, textDecoration: 'none', cursor: 'pointer',
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          PDF
        </a>

        {/* Instellingen dropdown */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            onClick={() => setShowInstellingen(!showInstellingen)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 6,
              border: `1px solid ${showInstellingen ? '#009439' : 'var(--border)'}`,
              background: showInstellingen ? 'rgba(0,148,57,0.06)' : 'var(--surface)',
              color: showInstellingen ? '#009439' : 'var(--text)',
              fontSize: 13, cursor: 'pointer',
            }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="12" cy="12" r="3"/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
            Instellingen
          </button>
          {showInstellingen && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 6,
              width: 260, padding: 14, borderRadius: 8,
              background: 'var(--bg-elev, white)',
              border: '1px solid var(--border)',
              boxShadow: '0 6px 20px rgba(0,0,0,0.1)',
              zIndex: 100,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 12 }}>
                Formulier instellingen
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <div
                  onClick={() => { setIsKamVgm(!isKamVgm); markDirty() }}
                  style={{
                    width: 34, height: 18, borderRadius: 9, flexShrink: 0, marginTop: 2,
                    background: isKamVgm ? '#009439' : 'var(--border)',
                    position: 'relative', cursor: 'pointer', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: isKamVgm ? 18 : 2,
                    width: 14, height: 14, borderRadius: '50%', background: 'white',
                    transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)',
                  }}/>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>KAM/VGM-formulier</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.4 }}>
                    Inzendingen verschijnen in het KAM/VGM-module en het VCA-tab van opdrachten.
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        {/* Save */}
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !isDirty}
          style={{
            padding: '6px 14px', borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: isDirty ? 'var(--text)' : 'var(--text-muted)',
            fontSize: 13, cursor: isDirty ? 'pointer' : 'default',
          }}
        >
          {isSaving ? 'Opslaan...' : 'Opslaan'}
        </button>

        {/* Publish */}
        {!isPublished && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isPublishing}
            style={{
              padding: '6px 14px', borderRadius: 6,
              border: 'none', background: '#009439', color: 'white',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {isPublishing ? 'Publiceren...' : 'Publiceren'}
          </button>
        )}
      </div>

      {/* Three-panel layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {!showPreview && !showTester && (
          <FieldPalette onAdd={addField} />
        )}

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {showTester ? (
            <FormTester fields={fields} />
          ) : showPreview ? (
            <FormPreview fields={fields} />
          ) : (
            <FormCanvas
              fields={fields}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={reorderFields}
              onDelete={deleteField}
              onDuplicate={id => setSelectedId(id)}
            />
          )}
        </div>

        {!showPreview && !showTester && selectedField && (
          <FieldSettings
            field={selectedField}
            allFields={fields}
            onChange={updateField}
          />
        )}

        {!showPreview && !showTester && !selectedField && (
          <aside style={{
            width: 280,
            flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            padding: 24,
            background: 'var(--surface)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            textAlign: 'center',
          }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ marginBottom: 12, opacity: 0.4 }}>
              <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
            <p style={{ fontSize: 13 }}>Selecteer een veld om de instellingen te bewerken.</p>
          </aside>
        )}
      </div>
    </div>
  )
}

// ── Eenvoudig preview ────────────────────────────────────────────────

function FormPreview({ fields }: { fields: FormField[] }) {
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '32px 24px', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <p style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
          color: 'var(--text-muted)', marginBottom: 20,
        }}>
          Voorbeeldweergave
        </p>
        {fields.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Geen velden.</p>
        )}
        {fields.map(field => (
          <PreviewField key={field.id} field={field} />
        ))}
      </div>
    </div>
  )
}

function PreviewField({ field }: { field: FormField }) {
  if (field.type === 'divider') {
    return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }}/>
  }
  if (field.type === 'heading') {
    return <h3 style={{ fontSize: 17, fontWeight: 600, margin: '20px 0 8px' }}>{field.label}</h3>
  }
  if (field.type === 'paragraph') {
    return <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 16 }}>{field.label}</p>
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    fontSize: 14,
    background: 'var(--bg)',
    color: 'var(--text)',
    boxSizing: 'border-box',
    marginTop: 4,
  }

  return (
    <div style={{ marginBottom: 20 }}>
      <label style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
        {field.label}
        {field.required && <span style={{ color: '#e53e3e' }}> *</span>}
      </label>
      {field.helpText && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, marginBottom: 4 }}>{field.helpText}</p>
      )}
      {(field.type === 'text' || field.type === 'number' || field.type === 'date' || field.type === 'time' || field.type === 'location' || field.type === 'barcode') && (
        <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} placeholder={field.placeholder} disabled style={inputStyle}/>
      )}
      {field.type === 'textarea' && (
        <textarea placeholder={field.placeholder} rows={3} disabled style={{ ...inputStyle, resize: 'vertical' }}/>
      )}
      {field.type === 'dropdown' && (
        <select disabled style={inputStyle}>
          <option value="">{field.placeholder || 'Kies een optie'}</option>
          {(field.options ?? []).map(opt => <option key={opt.value}>{opt.label}</option>)}
        </select>
      )}
      {(field.type === 'radio') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {(field.options ?? []).map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="radio" disabled/> {opt.label}
            </label>
          ))}
        </div>
      )}
      {field.type === 'checkbox' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {(field.options ?? []).map(opt => (
            <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" disabled/> {opt.label}
            </label>
          ))}
        </div>
      )}
      {field.type === 'boolean' && (
        <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="radio" name={field.id} disabled/> Ja
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="radio" name={field.id} disabled/> Nee
          </label>
        </div>
      )}
      {field.type === 'photo' && (
        <div style={{ ...inputStyle, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Foto uploaden
        </div>
      )}
      {field.type === 'signature' && (
        <div style={{ ...inputStyle, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Handtekening
        </div>
      )}
      {field.type === 'file' && (
        <div style={{ ...inputStyle, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Bestand kiezen
        </div>
      )}
      {field.type === 'repeatable' && (
        <div style={{ border: '1px dashed var(--border)', borderRadius: 6, padding: 12, marginTop: 4, color: 'var(--text-muted)', fontSize: 13 }}>
          Herhaalbare sectie ({field.children?.length ?? 0} sub-velden)
        </div>
      )}
    </div>
  )
}
