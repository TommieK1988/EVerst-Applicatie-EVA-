'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { FormField, FormVersie, FormTemplate, FormInzending } from '../types'
import { evaluateConditions } from '../types'
import FieldRenderer from './FieldRenderer'
import {
  saveFormInzending,
  submitFormInzending,
} from '@/app/(platform)/formulieren/actions'

type Props = {
  template: FormTemplate
  versie: FormVersie
  bestaandeInzending?: FormInzending
  vooringevuld?: Record<string, unknown>
  taskId?: string
  dossierId?: string
  /** Compacte, touch-vriendelijke weergave voor de mobiele omgeving. */
  mobiel?: boolean
  /** Waar de terug-knop en de redirect-na-indienen naartoe gaan. */
  terugHref?: string
}

const DRAFT_KEY = (templateId: string) => `form_draft_${templateId}`

export default function FormFiller({ template, versie, bestaandeInzending, vooringevuld, taskId, dossierId, mobiel = false, terugHref }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // Priority: bestaande inzending > vooringevuld > localStorage draft > leeg
    let initial: Record<string, unknown> = {}

    if (bestaandeInzending) {
      initial = { ...bestaandeInzending.waarden }
    } else if (vooringevuld && Object.keys(vooringevuld).length > 0) {
      initial = { ...vooringevuld }
    } else if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(DRAFT_KEY(template.id))
        if (raw) initial = JSON.parse(raw)
      } catch { /* ignore */ }
    }

    // Datum- en tijdvelden: pre-vullen met huidige datum/tijd als nog niet ingevuld
    const now = new Date()
    const vandaag = now.toISOString().slice(0, 10)                                    // YYYY-MM-DD
    const nuTijd  = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}` // HH:MM

    for (const field of versie.schema.fields ?? []) {
      const leeg = initial[field.id] === undefined || initial[field.id] === null || initial[field.id] === ''
      if (leeg) {
        if (field.type === 'date') initial[field.id] = vandaag
        if (field.type === 'time') initial[field.id] = nuTijd
      }
    }

    return initial
  })

  const [inzendingId, setInzendingId] = useState<string | undefined>(bestaandeInzending?.id)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Sla concept automatisch op in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY(template.id), JSON.stringify(values))
    } catch { /* storage full */ }
  }, [values, template.id])

  function updateValue(fieldId: string, value: unknown) {
    setValues(prev => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) {
      setErrors(prev => { const next = { ...prev }; delete next[fieldId]; return next })
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    const visibleFields = getVisibleFields(versie.schema.fields)

    for (const field of visibleFields) {
      if (field.required) {
        const val = values[field.id]
        if (val === undefined || val === null || val === '' ||
            (Array.isArray(val) && val.length === 0)) {
          newErrors[field.id] = `${field.label} is verplicht.`
        }
      }
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function getVisibleFields(fields: FormField[]): FormField[] {
    return fields.filter(f => evaluateConditions(f, fields, values))
  }

  async function handleSaveDraft() {
    setIsSaving(true)
    try {
      const result = await saveFormInzending({
        template_id: template.id,
        versie_id: versie.id,
        waarden: values,
        inzending_id: inzendingId,
        submission_uuid: inzendingId ?? crypto.randomUUID(),
        task_id: taskId,
        dossier_id: dossierId,
      })
      if (!result.ok) {
        toast.error('Opslaan mislukt: ' + result.error)
        return
      }
      if (!inzendingId) setInzendingId(result.data.id)
      toast.success('Concept opgeslagen')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit() {
    if (!validate()) {
      toast.error('Vul alle verplichte velden in.')
      return
    }

    setIsSubmitting(true)
    try {
      // Eerst concept opslaan / bijwerken
      const saveResult = await saveFormInzending({
        template_id: template.id,
        versie_id: versie.id,
        waarden: values,
        inzending_id: inzendingId,
        submission_uuid: inzendingId ?? crypto.randomUUID(),
        task_id: taskId,
        dossier_id: dossierId,
      })
      if (!saveResult.ok) {
        toast.error('Opslaan mislukt: ' + saveResult.error)
        return
      }

      const id = saveResult.data.id
      const submitResult = await submitFormInzending(id)
      if (!submitResult.ok) {
        toast.error('Indienen mislukt: ' + submitResult.error)
        return
      }

      // Verwijder localStorage draft
      try { localStorage.removeItem(DRAFT_KEY(template.id)) } catch { /* ignore */ }

      toast.success(taskId ? 'Formulier ingediend — taak voltooid!' : 'Formulier ingediend!')
      router.push(terugHref ?? (mobiel ? '/m/taken' : `/formulieren/${template.id}/inzendingen`))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fields = versie.schema.fields
  const visibleFields = getVisibleFields(fields)

  const terug = () => router.push(terugHref ?? (mobiel ? '/m/taken' : '/formulieren/sjablonen'))

  return (
    <div style={{
      maxWidth: mobiel ? '100%' : 680,
      margin: '0 auto',
      padding: mobiel ? '14px 14px 112px' : '32px 24px',
    }}>
      {/* Header */}
      <div style={{ marginBottom: mobiel ? 20 : 32 }}>
        <button
          type="button"
          onClick={terug}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: 13, padding: 0, marginBottom: 14,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          {terugHref || mobiel ? 'Terug' : 'Formulieren'}
        </button>
        <h1 style={{ fontSize: mobiel ? 19 : 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
          {template.naam}
        </h1>
        {template.omschrijving && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{template.omschrijving}</p>
        )}
      </div>

      {/* Fields */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: mobiel ? 18 : 20 }}>
        {visibleFields.map(field => (
          <FieldRenderer
            key={field.id}
            field={field}
            value={values[field.id]}
            error={errors[field.id]}
            onChange={val => updateValue(field.id, val)}
            mobiel={mobiel}
          />
        ))}

        {visibleFields.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Dit formulier heeft geen velden.</p>
        )}
      </div>

      {/* Actions — sticky onderbalk op mobiel, inline op desktop */}
      {fields.length > 0 && (
        <div style={mobiel ? {
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 20,
          display: 'flex', gap: 10,
          padding: '12px 14px calc(12px + env(safe-area-inset-bottom))',
          background: 'var(--surface, #fff)',
          borderTop: '1px solid var(--border)',
        } : {
          display: 'flex', gap: 12,
          marginTop: 40, paddingTop: 24,
          borderTop: '1px solid var(--border)',
        }}>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            style={{
              padding: mobiel ? '13px 16px' : '9px 18px', borderRadius: 9,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: mobiel ? 15 : 14, cursor: 'pointer',
            }}
          >
            {isSaving ? 'Opslaan...' : (mobiel ? 'Concept' : 'Opslaan als concept')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              flex: 1,
              padding: mobiel ? '13px 16px' : '9px 18px', borderRadius: 9,
              border: 'none',
              background: 'var(--primary, #3b82f6)',
              color: 'white',
              fontSize: mobiel ? 15 : 14, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {isSubmitting ? 'Indienen...' : 'Indienen'}
          </button>
        </div>
      )}
    </div>
  )
}
