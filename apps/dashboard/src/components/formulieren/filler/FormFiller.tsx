'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { FormField, FormVersie, FormTemplate, FormInzending } from '../types'
import { evaluateConditions, isInvoerVeld } from '../types'
import FieldRenderer from './FieldRenderer'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
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
  /**
   * Scope-sleutel voor de lokale concept-cache. Uniek per invul-exemplaar
   * (inzending-id of een nonce voor een nieuw exemplaar), zodat invullingen
   * van hetzelfde sjabloon elkaars draft niet overschrijven.
   */
  draftScope?: string
  /** Compacte, touch-vriendelijke weergave voor de mobiele omgeving. */
  mobiel?: boolean
  /** Waar de terug-knop en de redirect-na-indienen naartoe gaan. */
  terugHref?: string
  /** Keuzelijst voor `medewerker`-velden (actieve medewerkers). */
  medewerkers?: { id: string; naam: string }[]
  /**
   * Waarden voor `dossier`-velden, opgehaald uit het gekoppelde dossier.
   * Worden alleen-lezen over de overige waarden heen gelegd (dossier is leidend).
   */
  dossierWaarden?: Record<string, unknown>
}

const DRAFT_KEY = (scope: string) => `form_draft_${scope}`

export default function FormFiller({ template, versie, bestaandeInzending, vooringevuld, taskId, dossierId, draftScope, mobiel = false, terugHref, medewerkers, dossierWaarden }: Props) {
  const router = useRouter()
  // Cache-sleutel per exemplaar: voorkomt dat verschillende invullingen van
  // hetzelfde sjabloon dezelfde localStorage-draft delen.
  const draftKey = DRAFT_KEY(draftScope ?? template.id)
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    // Priority: bestaande inzending > vooringevuld > localStorage draft > leeg
    let initial: Record<string, unknown> = {}

    if (bestaandeInzending) {
      initial = { ...bestaandeInzending.waarden }
    } else if (vooringevuld && Object.keys(vooringevuld).length > 0) {
      initial = { ...vooringevuld }
    } else if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(draftKey)
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

    // Dossier-gegevens zijn alleen-lezen en altijd leidend: leg ze als laatste
    // over de overige waarden heen, ook bij het hervatten van een concept.
    if (dossierWaarden) initial = { ...initial, ...dossierWaarden }

    return initial
  })

  const [inzendingId, setInzendingId] = useState<string | undefined>(bestaandeInzending?.id)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Sla concept automatisch op in localStorage
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(values))
    } catch { /* storage full */ }
  }, [values, draftKey])

  function updateValue(fieldId: string, value: unknown) {
    setValues(prev => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) {
      setErrors(prev => { const next = { ...prev }; delete next[fieldId]; return next })
    }
  }

  /** Zichtbare, verplichte invoervelden die nog leeg zijn. */
  function getMissingFields(): FormField[] {
    return getVisibleFields(versie.schema.fields).filter(field => {
      // Weergave-only velden (kop/tekstblok/scheidingslijn) hebben geen invoer
      // en mogen het indienen nooit blokkeren.
      if (!isInvoerVeld(field)) return false
      if (!field.required) return false
      const val = values[field.id]
      return val === undefined || val === null || val === '' ||
        (Array.isArray(val) && val.length === 0)
    })
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
    const missing = getMissingFields()
    if (missing.length > 0) {
      // Markeer de ontbrekende velden, benoem ze concreet en scroll naar de eerste,
      // zodat duidelijk is wélke vraag nog open staat (niet de koppen/tekstblokken).
      setErrors(Object.fromEntries(missing.map(f => [f.id, `${f.label} is verplicht.`])))
      const namen = missing.slice(0, 3).map(f => f.label).join(', ')
      toast.error(
        missing.length === 1
          ? `Nog 1 verplicht veld in te vullen: ${namen}.`
          : `Nog ${missing.length} verplichte velden in te vullen: ${namen}${missing.length > 3 ? '…' : ''}.`
      )
      document.getElementById(`veld-${missing[0].id}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }

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
      // Mobiel: vul de scroll-container zodat de sticky onderbalk ook bij korte
      // formulieren onderaan blijft (en nooit achter de bottom-nav valt).
      ...(mobiel
        ? { display: 'flex', flexDirection: 'column', minHeight: '100%', padding: '14px 14px 0' }
        : { padding: '32px 24px' }),
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
          <div key={field.id} id={`veld-${field.id}`} style={{ scrollMarginTop: 80 }}>
            <FieldRenderer
              field={field}
              value={values[field.id]}
              error={errors[field.id]}
              onChange={val => updateValue(field.id, val)}
              mobiel={mobiel}
              medewerkers={medewerkers}
            />
          </div>
        ))}

        {visibleFields.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Dit formulier heeft geen velden.</p>
        )}
      </div>

      {/* Actions — sticky onderbalk op mobiel (binnen de scroll-container, dus
          nooit achter de bottom-nav), inline onderaan op desktop. */}
      {fields.length > 0 && (() => {
        const knoppen = (
          <>
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
          </>
        )

        return mobiel ? (
          <MobielStickyFooter style={{ marginLeft: -14, marginRight: -14, marginTop: 'auto' }}>
            {knoppen}
          </MobielStickyFooter>
        ) : (
          <div style={{
            display: 'flex', gap: 12,
            marginTop: 40, paddingTop: 24,
            borderTop: '1px solid var(--border)',
          }}>
            {knoppen}
          </div>
        )
      })()}
    </div>
  )
}
