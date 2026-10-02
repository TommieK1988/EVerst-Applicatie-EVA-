'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import type { FormField, FormVersie, FormTemplate, FormInzending } from '../types'
import { evaluateConditions, isInvoerVeld, isVeldLeeg, resolveAccent } from '../types'
import FieldRenderer from './FieldRenderer'
import MobielStickyFooter from '@/components/mobiel/MobielStickyFooter'
import { VertaalLabel } from '@/components/vertalen/VertaalbareTekst'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import { FormulierVertaling, formulierTeksten } from './formulier-vertaling'
import {
  saveFormInzending,
  submitFormInzending,
  laadFormulierConcept,
  bewaarFormulierConcept,
  verwijderFormulierConcept,
  uploadAandachtspuntFoto,
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
  const t = useTranslations('formulieren')
  // Cache-sleutel per exemplaar: voorkomt dat verschillende invullingen van
  // hetzelfde sjabloon dezelfde draft delen.
  const scope = draftScope ?? template.id
  const draftKey = DRAFT_KEY(scope)
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
  const [currentStep, setCurrentStep] = useState(0)

  const accent = resolveAccent(versie.schema)

  // Formulierinhoud van kantoor in de taal van de app (alleen weergave, nooit de opgeslagen
  // waarden). Eén verzoek voor het hele formulier; één label bovenaan wisselt alles terug.
  const kantoorTeksten = useMemo(
    () => [template.naam, template.omschrijving ?? '', ...formulierTeksten(versie.schema.fields ?? [])],
    [template.naam, template.omschrijving, versie.schema.fields],
  )
  const vertalingen = useVertalingen(kantoorTeksten)
  const [origineel, setOrigineel] = useState(false)
  const vertaald = vertalingen.some(v => v.vertaald)
  const vertaalMap = new Map(vertalingen.map(v => [v.origineel, v.tekst]))
  const toon = (tekst: string) => (origineel ? tekst : vertaalMap.get(tekst) ?? tekst)

  /** Foutmeldingen bij ontbrekende verplichte velden (in de taal van de app). */
  function meldOntbrekend(missing: FormField[]) {
    setErrors(Object.fromEntries(missing.map(f => [f.id, t('veldVerplicht', { veld: toon(f.label) })])))
    const namen = missing.slice(0, 3).map(f => toon(f.label)).join(', ') + (missing.length > 3 ? '…' : '')
    toast.error(t('nogVerplicht', { aantal: missing.length, namen }))
  }

  // Hervat een gedeeld concept uit Supabase (meereist over apparaten). Alleen als er
  // geen bestaande inzending en geen vooringevulde waarden zijn — die gaan vóór het
  // concept (zie priority-volgorde). Dossierwaarden blijven altijd leidend.
  const conceptGeladen = useRef(false)
  useEffect(() => {
    if (conceptGeladen.current) return
    if (bestaandeInzending || (vooringevuld && Object.keys(vooringevuld).length > 0)) return
    let actief = true
    laadFormulierConcept(scope).then(concept => {
      if (!actief || !concept || Object.keys(concept).length === 0) return
      conceptGeladen.current = true
      setValues(prev => ({ ...prev, ...concept, ...(dossierWaarden ?? {}) }))
    }).catch(() => { /* val terug op lokaal/leeg */ })
    return () => { actief = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  // Sla concept automatisch op: direct in localStorage (offline-mirror) + debounced
  // gedeeld naar Supabase, zodat het concept op een ander apparaat/browser terugkomt.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(values))
    } catch { /* storage full */ }
    // Leeg concept niet naar de server schrijven (voorkomt lege rijen bij mount).
    if (bestaandeInzending || Object.keys(values).length === 0) return
    const t = setTimeout(() => {
      bewaarFormulierConcept(scope, values, template.id, dossierId ?? null).catch(() => { /* stil */ })
    }, 1000)
    return () => clearTimeout(t)
  }, [values, draftKey, scope, bestaandeInzending, template.id, dossierId])

  function updateValue(fieldId: string, value: unknown) {
    setValues(prev => ({ ...prev, [fieldId]: value }))
    if (errors[fieldId]) {
      setErrors(prev => { const next = { ...prev }; delete next[fieldId]; return next })
    }
  }

  /** Foto's bij een aandachtspunt gaan meteen naar de opslag; alleen de URL komt in de waarden. */
  async function fotoUpload(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('foto', file)
    const res = await uploadAandachtspuntFoto(dossierId ?? null, fd)
    if (!res.ok) { toast.error(res.error); return null }
    return res.data
  }

  /** Verplichte invoervelden binnen een set die nog leeg zijn. */
  function missendeInVelden(velden: FormField[]): FormField[] {
    return velden.filter(field => {
      // Weergave-only velden (kop/tekstblok/scheidingslijn/…) hebben geen invoer
      // en mogen het indienen nooit blokkeren.
      if (!isInvoerVeld(field)) return false
      if (!field.required) return false
      return isVeldLeeg(field, values[field.id])
    })
  }

  /** Alle zichtbare, verplichte invoervelden die nog leeg zijn. */
  function getMissingFields(): FormField[] {
    return missendeInVelden(getVisibleFields(versie.schema.fields))
  }

  function getVisibleFields(fields: FormField[]): FormField[] {
    return fields.filter(f => evaluateConditions(f, fields, values))
  }

  /** Splits de zichtbare velden in pagina's op elk pagina-einde. */
  function splitInPaginas(velden: FormField[]): FormField[][] {
    const paginas: FormField[][] = [[]]
    for (const f of velden) {
      if (f.type === 'pagebreak') { paginas.push([]); continue }
      paginas[paginas.length - 1].push(f)
    }
    // Verwijder lege pagina's die door een pagina-einde aan begin/eind ontstaan.
    return paginas.filter(p => p.length > 0).length > 0
      ? paginas.filter(p => p.length > 0)
      : [[]]
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
        toast.error(t('opslaanMislukt', { fout: result.error }))
        return
      }
      if (!inzendingId) setInzendingId(result.data.id)
      toast.success(t('conceptOpgeslagen'))
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSubmit() {
    const missing = getMissingFields()
    if (missing.length > 0) {
      // Markeer de ontbrekende velden, benoem ze concreet en scroll naar de eerste,
      // zodat duidelijk is wélke vraag nog open staat (niet de koppen/tekstblokken).
      meldOntbrekend(missing)
      // In een wizard: spring eerst naar de stap met het eerste ontbrekende veld.
      const doelStap = paginas.findIndex(p => p.some(f => f.id === missing[0].id))
      if (doelStap >= 0 && doelStap !== stap) setCurrentStep(doelStap)
      setTimeout(() => {
        document.getElementById(`veld-${missing[0].id}`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, doelStap !== stap ? 60 : 0)
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
        toast.error(t('opslaanMislukt', { fout: saveResult.error }))
        return
      }

      const id = saveResult.data.id
      const submitResult = await submitFormInzending(id)
      if (!submitResult.ok) {
        toast.error(t('indienenMislukt', { fout: submitResult.error }))
        return
      }

      // Verwijder het concept: lokaal (offline-mirror) én het gedeelde server-concept.
      try { localStorage.removeItem(draftKey) } catch { /* ignore */ }
      verwijderFormulierConcept(scope).catch(() => { /* stil */ })

      toast.success(taskId ? t('ingediendActieVoltooid') : t('ingediend'))
      router.push(terugHref ?? (mobiel ? '/m/taken' : `/formulieren/${template.id}/inzendingen`))
    } finally {
      setIsSubmitting(false)
    }
  }

  const fields = versie.schema.fields
  const visibleFields = getVisibleFields(fields)
  const paginas = splitInPaginas(visibleFields)
  const isWizard = paginas.length > 1
  const stap = Math.min(currentStep, paginas.length - 1)
  const laatsteStap = stap >= paginas.length - 1
  const stapVelden = paginas[stap] ?? []

  function scrollNaarTop() {
    setTimeout(() => {
      document.getElementById('form-top')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  function volgende() {
    const missing = missendeInVelden(stapVelden)
    if (missing.length > 0) {
      meldOntbrekend(missing)
      document.getElementById(`veld-${missing[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setCurrentStep(Math.min(stap + 1, paginas.length - 1))
    scrollNaarTop()
  }

  function vorige() {
    setCurrentStep(Math.max(stap - 1, 0))
    scrollNaarTop()
  }

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
          {terugHref || mobiel ? t('terug') : t('formulieren')}
        </button>
        <h1 style={{ fontSize: mobiel ? 19 : 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>
          {toon(template.naam)}
        </h1>
        {template.omschrijving && (
          <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: 0 }}>{toon(template.omschrijving)}</p>
        )}
        {vertaald && <VertaalLabel origineel={origineel} wissel={() => setOrigineel(o => !o)} />}
      </div>

      <div id="form-top" style={{ scrollMarginTop: 80 }} />

      {/* Voortgang (wizard) */}
      {isWizard && (
        <div style={{ marginBottom: mobiel ? 18 : 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('stapVan', { stap: stap + 1, totaal: paginas.length })}</span>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{Math.round(((stap + 1) / paginas.length) * 100)}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
            <div style={{ width: `${((stap + 1) / paginas.length) * 100}%`, height: '100%', background: accent, transition: 'width 0.25s' }} />
          </div>
        </div>
      )}

      {/* Fields */}
      <FormulierVertaling origineel={origineel}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: mobiel ? 18 : 20 }}>
        {stapVelden.map(field => (
          <div key={field.id} id={`veld-${field.id}`} style={{ scrollMarginTop: 80 }}>
            <FieldRenderer
              field={field}
              value={values[field.id]}
              error={errors[field.id]}
              onChange={val => updateValue(field.id, val)}
              mobiel={mobiel}
              medewerkers={medewerkers}
              accent={accent}
              onFotoUpload={fotoUpload}
            />
          </div>
        ))}

        {visibleFields.length === 0 && (
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('geenVelden')}</p>
        )}
      </div>
      </FormulierVertaling>

      {/* Actions — sticky onderbalk op mobiel (binnen de scroll-container, dus
          nooit achter de bottom-nav), inline onderaan op desktop. */}
      {fields.length > 0 && (() => {
        const secundairStijl: React.CSSProperties = {
          padding: mobiel ? '13px 16px' : '9px 18px', borderRadius: 9,
          border: '1px solid var(--border)', background: 'var(--surface)',
          color: 'var(--text)', fontSize: mobiel ? 15 : 14, cursor: 'pointer',
        }
        const primairStijl: React.CSSProperties = {
          flex: 1, padding: mobiel ? '13px 16px' : '9px 18px', borderRadius: 9,
          border: 'none', background: accent, color: 'white',
          fontSize: mobiel ? 15 : 14, fontWeight: 600, cursor: 'pointer',
        }

        // Linkerknop: in een wizard vanaf stap 2 is dat "Vorige"; anders "Concept".
        const linkerKnop = isWizard && stap > 0 ? (
          <button type="button" onClick={vorige} style={secundairStijl}>{t('vorige')}</button>
        ) : (
          <button type="button" onClick={handleSaveDraft} disabled={isSaving} style={secundairStijl}>
            {isSaving ? t('opslaanBezig') : (mobiel ? t('concept') : t('opslaanAlsConcept'))}
          </button>
        )

        // Rechterknop: "Volgende" tot de laatste stap, daarna "Indienen".
        const rechterKnop = isWizard && !laatsteStap ? (
          <button type="button" onClick={volgende} style={primairStijl}>{t('volgende')}</button>
        ) : (
          <button type="button" onClick={handleSubmit} disabled={isSubmitting} style={primairStijl}>
            {isSubmitting ? t('indienenBezig') : t('indienen')}
          </button>
        )

        const knoppen = <>{linkerKnop}{rechterKnop}</>

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
