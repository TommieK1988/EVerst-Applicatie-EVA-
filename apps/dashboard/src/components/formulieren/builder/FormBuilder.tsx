'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { FormField, FormFieldType, FormSchema, FormInstellingen, FormPdfConfig, FormTemplate, FormVersie } from '../types'
import { defaultField, STANDAARD_ACCENT, CALLOUT_VARIANTEN } from '../types'
import type { VeldOpmaak } from '../types'
import FieldPalette from './FieldPalette'
import FormCanvas from './FormCanvas'
import FieldSettings from './FieldSettings'
import FormTester from './FormTester'
import BriefpapierUpload from './BriefpapierUpload'
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
  const [accentkleur, setAccentkleur] = useState<string>(versie.schema.instellingen?.accentkleur ?? '')
  const [pdfCfg, setPdfCfg] = useState<FormPdfConfig>(versie.schema.instellingen?.pdf ?? {})

  function patchPdf(patch: Partial<FormPdfConfig>) {
    setPdfCfg(prev => ({ ...prev, ...patch }))
    markDirty()
  }

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

      // Instellingen alleen meesturen als er iets is ingesteld (leeg = val terug op standaard/globaal).
      const cleanPdf: FormPdfConfig = Object.fromEntries(
        Object.entries(pdfCfg).filter(([, v]) => v !== undefined && v !== '' && v !== null)
      )
      const instellingen: FormInstellingen = {}
      if (accentkleur) instellingen.accentkleur = accentkleur
      if (Object.keys(cleanPdf).length > 0) instellingen.pdf = cleanPdf

      const schema: FormSchema = {
        version: 1,
        fields,
        ...(Object.keys(instellingen).length > 0 ? { instellingen } : {}),
      }
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
              width: 300, maxHeight: '70vh', overflowY: 'auto', padding: 14, borderRadius: 8,
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

              {/* Accentkleur */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0', paddingTop: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                  Accentkleur
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input
                    type="color"
                    value={accentkleur || '#009439'}
                    onChange={e => { setAccentkleur(e.target.value); markDirty() }}
                    style={{ width: 34, height: 26, padding: 0, border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{accentkleur || 'Standaard (thema)'}</span>
                  {accentkleur && (
                    <button
                      type="button"
                      onClick={() => { setAccentkleur(''); markDirty() }}
                      style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0', lineHeight: 1.4 }}>
                  Kleurt knoppen, rating en de PDF-tabelkop.
                </p>
              </div>

              {/* PDF & briefpapier */}
              <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 0', paddingTop: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 8 }}>
                  PDF & briefpapier
                </p>

                <BriefpapierUpload
                  templateId={template.id}
                  url={pdfCfg.briefpapierUrl ?? null}
                  onChange={url => patchPdf({ briefpapierUrl: url })}
                />

                {/* Tri-state overrides van de globale PDF-instelling */}
                {([
                  { key: 'toonLogo' as const, label: 'Logo tonen' },
                  { key: 'toonInvuller' as const, label: 'Invuller/datum tonen' },
                  { key: 'toonProjectRef' as const, label: 'Projectreferentie tonen' },
                ]).map(({ key, label }) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: 'var(--text)' }}>{label}</span>
                    <select
                      value={pdfCfg[key] === undefined ? '' : pdfCfg[key] ? 'ja' : 'nee'}
                      onChange={e => {
                        const v = e.target.value
                        patchPdf({ [key]: v === '' ? undefined : v === 'ja' } as Partial<FormPdfConfig>)
                      }}
                      style={{ fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                    >
                      <option value="">Algemeen</option>
                      <option value="ja">Tonen</option>
                      <option value="nee">Verbergen</option>
                    </select>
                  </div>
                ))}

                <div style={{ marginTop: 10 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Koptekst (optioneel)</label>
                  <input
                    value={pdfCfg.koptekst ?? ''}
                    onChange={e => patchPdf({ koptekst: e.target.value })}
                    placeholder="Laat leeg voor algemene instelling"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  />
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>Voettekst (optioneel)</label>
                  <input
                    value={pdfCfg.voettekst ?? ''}
                    onChange={e => patchPdf({ voettekst: e.target.value })}
                    placeholder="Laat leeg voor algemene instelling"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}
                  />
                </div>

                <a
                  href="/instellingen/formulieren-pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 10, fontSize: 11, color: '#009439', textDecoration: 'none' }}
                >
                  Algemene PDF-instellingen →
                </a>
              </div>
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
            <FormTester fields={fields} accent={accentkleur || STANDAARD_ACCENT} />
          ) : showPreview ? (
            <FormPreview fields={fields} accent={accentkleur || STANDAARD_ACCENT} />
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
            templateId={template.id}
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

function FormPreview({ fields, accent }: { fields: FormField[]; accent: string }) {
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
          <PreviewField key={field.id} field={field} accent={accent} />
        ))}
      </div>
    </div>
  )
}

/** CSS-uitlijning uit een opmaak-object. */
function tekstAlign(o?: VeldOpmaak): React.CSSProperties['textAlign'] {
  return o?.uitlijning === 'midden' ? 'center' : o?.uitlijning === 'rechts' ? 'right' : 'left'
}

function PreviewField({ field, accent }: { field: FormField; accent: string }) {
  if (field.type === 'divider') {
    return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' }}/>
  }
  if (field.type === 'pagebreak') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0', color: 'var(--text-muted)' }}>
        <div style={{ flex: 1, borderTop: '1px dashed var(--border)' }}/>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Pagina-einde</span>
        <div style={{ flex: 1, borderTop: '1px dashed var(--border)' }}/>
      </div>
    )
  }
  if (field.type === 'heading') {
    const niveau = field.opmaak?.niveau ?? 'middel'
    const grootte = niveau === 'groot' ? 22 : niveau === 'klein' ? 15 : 17
    return (
      <h3 style={{ fontSize: grootte, fontWeight: 600, margin: '20px 0 8px', color: field.opmaak?.kleur ?? 'var(--text)', textAlign: tekstAlign(field.opmaak) }}>
        {field.label}
      </h3>
    )
  }
  if (field.type === 'paragraph') {
    return (
      <p style={{
        fontSize: 14, marginBottom: 16,
        color: field.opmaak?.kleur ?? 'var(--text-muted)',
        textAlign: tekstAlign(field.opmaak),
        fontWeight: field.opmaak?.vet ? 600 : 400,
        fontStyle: field.opmaak?.cursief ? 'italic' : 'normal',
      }}>
        {field.label}
      </p>
    )
  }
  if (field.type === 'callout') {
    const cfg = CALLOUT_VARIANTEN[field.opmaak?.variant ?? 'info']
    return (
      <div style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', margin: '12px 0 16px',
        padding: '10px 12px', borderRadius: 8,
        background: cfg.achtergrond, border: `1px solid ${cfg.rand}`, color: cfg.tekst,
      }}>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/>
        </svg>
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>{field.label}</span>
      </div>
    )
  }
  if (field.type === 'image') {
    const align = field.opmaak?.uitlijning === 'midden' ? 'center' : field.opmaak?.uitlijning === 'rechts' ? 'flex-end' : 'flex-start'
    return (
      <div style={{ display: 'flex', justifyContent: align, margin: '12px 0 16px' }}>
        {field.afbeeldingUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={field.afbeeldingUrl} alt={field.label} style={{ width: field.afbeeldingBreedte ?? 200, maxWidth: '100%', borderRadius: 6 }} />
        ) : (
          <div style={{ width: field.afbeeldingBreedte ?? 200, height: 80, border: '1px dashed var(--border)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
            Geen afbeelding
          </div>
        )}
      </div>
    )
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
      {field.type === 'rating' && (() => {
        const min = field.validation?.min ?? 1
        const max = field.validation?.max ?? 10
        const opties: number[] = []
        for (let n = min; n <= max; n++) opties.push(n)
        if (field.ratingStijl === 'sterren') {
          return (
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
              {opties.map(n => (
                <svg key={n} width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={1.5} style={{ color: accent }}>
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.196-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.783-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                </svg>
              ))}
            </div>
          )
        }
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {opties.map(n => (
              <span key={n} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text)' }}>{n}</span>
            ))}
          </div>
        )
      })()}
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
