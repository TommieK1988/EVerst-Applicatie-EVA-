'use client'

import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'

type Props = {
  templateId: string
  url: string | null
  onChange: (url: string | null) => void
}

/**
 * Uploadt een briefpapier-PDF (achtergrond onder elke formulier-PDF-pagina) via de
 * bestaande route POST /everts-calc/api/briefpapier/upload (bucket `docx-templates`).
 * `templateId` dient alleen als mapnaam. De URL wordt in `schema.instellingen.pdf.briefpapierUrl`
 * bewaard; pas na Opslaan is hij actief.
 */
export default function BriefpapierUpload({ templateId, url, onChange }: Props) {
  const [bezig, setBezig] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Alleen .pdf bestanden zijn toegestaan')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    setBezig(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('layoutId', templateId)
      const res = await fetch('/everts-calc/api/briefpapier/upload', { method: 'POST', body: formData })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onChange(json.url)
      toast.success('Briefpapier geüpload — klik op Opslaan')
    } catch (err) {
      toast.error('Upload mislukt: ' + String(err))
    } finally {
      setBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const knopStijl: React.CSSProperties = {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '6px 8px', borderRadius: 6, fontSize: 12, cursor: bezig ? 'default' : 'pointer',
    border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)',
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px', lineHeight: 1.4 }}>
        PDF-achtergrond onder elke pagina. Bevat het briefpapier een eigen logo? Zet dan &quot;Logo tonen&quot; op Verbergen.
      </p>
      {url ? (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={bezig} style={knopStijl}>
            {bezig ? 'Uploaden…' : 'Vervangen'}
          </button>
          <a href={url} target="_blank" rel="noopener noreferrer" style={{ ...knopStijl, textDecoration: 'none' }}>
            Bekijk
          </a>
          <button
            type="button"
            onClick={() => onChange(null)}
            title="Verwijderen"
            style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #fecaca', background: 'var(--bg)', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={bezig}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '8px 10px', borderRadius: 6, fontSize: 12, cursor: bezig ? 'default' : 'pointer',
            border: '2px dashed var(--border)', background: 'var(--bg)', color: 'var(--text-muted)',
          }}
        >
          {bezig ? 'Uploaden…' : 'Briefpapier-PDF uploaden'}
        </button>
      )}
      <input ref={fileRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={upload} />
    </div>
  )
}
