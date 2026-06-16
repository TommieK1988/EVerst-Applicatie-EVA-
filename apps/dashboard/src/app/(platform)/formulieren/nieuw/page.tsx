'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createFormTemplate } from '../actions'

const CATEGORIEEN = [
  { value: '',           label: 'Kies categorie (optioneel)' },
  { value: 'werkbon',    label: 'Werkbon' },
  { value: 'inspectie',  label: 'Inspectie' },
  { value: 'oplevering', label: 'Oplevering' },
  { value: 'checklist',  label: 'Checklist' },
  { value: 'overig',     label: 'Overig' },
]

export default function NieuwFormulierPage() {
  const router = useRouter()
  const [naam, setNaam] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [categorie, setCategorie] = useState('')
  const [bezig, setBezig] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!naam.trim()) { toast.error('Voer een naam in.'); return }
    setBezig(true)
    try {
      const result = await createFormTemplate({ naam: naam.trim(), omschrijving: omschrijving.trim() || undefined, categorie: categorie || undefined })
      if (!result.ok) { toast.error('Aanmaken mislukt: ' + result.error); return }
      router.push(`/formulieren/${result.data.id}/bewerken`)
    } finally {
      setBezig(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 7,
    border: '1px solid var(--border)',
    fontSize: 14,
    background: 'var(--bg)',
    color: 'var(--text)',
    boxSizing: 'border-box',
    outline: 'none',
  }

  return (
    <div style={{ padding: '32px', maxWidth: 520 }}>
      <button
        type="button"
        onClick={() => router.push('/formulieren/sjablonen')}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 13, padding: 0, marginBottom: 24,
        }}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Terug
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 24px', color: 'var(--text)' }}>
        Nieuw formulier
      </h1>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Naam *
          </label>
          <input
            value={naam}
            onChange={e => setNaam(e.target.value)}
            placeholder="bijv. Werkbon houtrotherstel"
            style={inputStyle}
            autoFocus
          />
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Categorie
          </label>
          <select
            value={categorie}
            onChange={e => setCategorie(e.target.value)}
            style={inputStyle}
          >
            {CATEGORIEEN.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
            Omschrijving
          </label>
          <textarea
            value={omschrijving}
            onChange={e => setOmschrijving(e.target.value)}
            placeholder="Korte uitleg voor medewerkers (optioneel)"
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            type="button"
            onClick={() => router.push('/formulieren/sjablonen')}
            style={{
              padding: '9px 18px', borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--surface)', color: 'var(--text)',
              fontSize: 14, cursor: 'pointer',
            }}
          >
            Annuleren
          </button>
          <button
            type="submit"
            disabled={bezig || !naam.trim()}
            style={{
              flex: 1,
              padding: '9px 18px', borderRadius: 7,
              border: 'none',
              background: '#009439', color: 'white',
              fontSize: 14, fontWeight: 600, cursor: bezig ? 'wait' : 'pointer',
            }}
          >
            {bezig ? 'Aanmaken...' : 'Aanmaken & bewerken'}
          </button>
        </div>
      </form>
    </div>
  )
}
