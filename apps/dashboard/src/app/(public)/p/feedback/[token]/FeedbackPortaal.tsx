'use client'

import React, { useState } from 'react'
import FieldRenderer from '@/components/formulieren/filler/FieldRenderer'
import { evaluateConditions, isInvoerVeld, isVeldLeeg, type FormField } from '@/components/formulieren/types'
import { portaalFeedbackSubmit, portaalUploadAandachtspuntFoto, type FeedbackPortaalData } from '../../actions'

// FieldRenderer werkt op DS-tokens (--text, --bg, --border, hsl(var(--primary)) …). De publieke
// layout zit buiten de EVA-shell, dus we zetten de benodigde tokens hier expliciet.
const tokenScope: React.CSSProperties = {
  ['--text' as any]: '#1a1f24',
  ['--text-muted' as any]: '#6b757c',
  ['--bg' as any]: '#ffffff',
  ['--surface' as any]: '#ffffff',
  ['--border' as any]: '#d4dad8',
  ['--primary' as any]: '142 100% 29%',
}

export function FeedbackPortaal({ token, data }: { token: string; data: FeedbackPortaalData }) {
  const fields = data.fields ?? []
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [bezig, setBezig] = useState(false)
  const [klaar, setKlaar] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const zichtbaar = (f: FormField) => evaluateConditions(f, fields, values)

  function update(id: string, v: unknown) {
    setValues(prev => ({ ...prev, [id]: v }))
    if (errors[id]) setErrors(prev => { const n = { ...prev }; delete n[id]; return n })
  }

  /** Foto's bij een aandachtspunt gaan meteen naar de opslag; alleen de URL komt in de waarden. */
  async function fotoUpload(file: File): Promise<string | null> {
    const fd = new FormData()
    fd.append('foto', file)
    const r = await portaalUploadAandachtspuntFoto(token, fd)
    if (!r.ok) { setFout(r.error); return null }
    return r.url
  }

  async function verstuur() {
    const missend = fields
      .filter(f => zichtbaar(f) && isInvoerVeld(f) && f.required)
      .filter(f => isVeldLeeg(f, values[f.id]))
    if (missend.length > 0) {
      setErrors(Object.fromEntries(missend.map(f => [f.id, `${f.label} is verplicht.`])))
      return
    }
    setBezig(true); setFout(null)
    const r = await portaalFeedbackSubmit(token, values)
    setBezig(false)
    if (!r.ok) { setFout(r.error); return }
    setKlaar(true)
  }

  if (klaar) {
    return (
      <div style={{ background: '#e7f6ec', border: '1px solid #bfe6cd', borderRadius: 12, padding: '32px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 30, marginBottom: 6 }}>💬</div>
        <h1 style={{ fontSize: 19, fontWeight: 700, color: '#1c7a3f', margin: '0 0 4px' }}>Bedankt voor uw feedback!</h1>
        <p style={{ fontSize: 13.5, color: '#3a6b4a', margin: 0 }}>Uw reactie is ontvangen en helpt ons om onze service te verbeteren.</p>
      </div>
    )
  }

  return (
    <div style={tokenScope}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8a938f' }}>Uw mening telt</div>
        <h1 style={{ fontSize: 21, fontWeight: 700, margin: '2px 0 4px' }}>{data.titel ?? 'Feedback'}</h1>
        {data.omschrijving && <p style={{ fontSize: 13.5, color: '#6b757c', margin: 0 }}>{data.omschrijving}</p>}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e4e8e7', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {fields.filter(zichtbaar).map(f => (
            <div key={f.id}>
              <FieldRenderer field={f} value={values[f.id]} error={errors[f.id]} onChange={v => update(f.id, v)} mobiel onFotoUpload={fotoUpload} />
            </div>
          ))}
          {fields.length === 0 && <p style={{ fontSize: 13.5, color: '#6b757c' }}>Deze vragenlijst bevat nog geen vragen.</p>}
        </div>

        {fout && <div style={{ color: '#a12020', fontSize: 12.5, marginTop: 12 }}>{fout}</div>}

        {fields.length > 0 && (
          <button onClick={verstuur} disabled={bezig}
            style={{ marginTop: 20, width: '100%', background: '#009439', color: '#fff', border: 'none', borderRadius: 8, padding: '13px 16px', fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: bezig ? 0.6 : 1 }}>
            {bezig ? 'Versturen…' : 'Feedback versturen'}
          </button>
        )}
      </div>
    </div>
  )
}
