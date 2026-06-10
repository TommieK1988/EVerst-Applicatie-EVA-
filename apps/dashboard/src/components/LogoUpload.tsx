'use client'

import { useState, useRef, useCallback } from 'react'
import { createClient } from '@everts/database/client'
import { Button } from '@/components/ui'

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const ALLOWED = ['image/png', 'image/svg+xml', 'image/jpeg', 'image/webp']

type Props = {
  slot: string
  label: string
  description: string
  currentUrl: string | null
  bedrijfsId: string
  onUploaded: (url: string | null) => void
}

export function LogoUpload({ slot, label, description, currentUrl, bedrijfsId, onUploaded }: Props) {
  const [preview, setPreview]   = useState<string | null>(currentUrl)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver]  = useState(false)
  const [error, setError]        = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = useCallback(async (file: File) => {
    setError(null)
    if (!ALLOWED.includes(file.type)) { setError('Gebruik PNG, SVG, JPG of WEBP.'); return }
    if (file.size > MAX_SIZE)         { setError('Max 5 MB.'); return }

    setUploading(true)
    try {
      const supabase = createClient()
      const ext  = file.name.split('.').pop() ?? 'png'
      const path = `${bedrijfsId}/${slot}_${Date.now()}.${ext}`

      if (currentUrl) {
        const oldPath = extractStoragePath(currentUrl)
        if (oldPath) await supabase.storage.from('brand-assets').remove([oldPath])
      }

      const { error: uploadError } = await supabase.storage
        .from('brand-assets').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage.from('brand-assets').getPublicUrl(path)
      setPreview(publicUrl)
      onUploaded(publicUrl)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload mislukt.')
    } finally {
      setUploading(false)
    }
  }, [bedrijfsId, slot, currentUrl, onUploaded])

  const remove = useCallback(async () => {
    if (!currentUrl) return
    setUploading(true)
    try {
      const supabase = createClient()
      const oldPath = extractStoragePath(currentUrl)
      if (oldPath) await supabase.storage.from('brand-assets').remove([oldPath])
      setPreview(null)
      onUploaded(null)
    } catch { setError('Verwijderen mislukt.') }
    finally   { setUploading(false) }
  }, [currentUrl, onUploaded])

  return (
    <div style={{
      background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 2 }}>{description}</div>
      </div>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }}
        style={{
          aspectRatio: '3/2', display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, cursor: 'pointer', overflow: 'hidden',
          border: dragOver ? '2px dashed var(--accent)' : preview ? '1px solid var(--border)' : '2px dashed var(--border)',
          background: dragOver ? 'color-mix(in srgb, var(--accent) 6%, var(--bg))' : preview ? 'var(--bg)' : 'var(--bg)',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {uploading ? (
          <svg width="28" height="28" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            style={{ color: 'var(--accent)', animation: 'spin 0.7s linear infinite' }}>
            <path d="M10 3a7 7 0 0 1 7 7"/>
          </svg>
        ) : preview ? (
          <img src={preview} alt={label} style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', padding: 12 }} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--fg-muted)' }}>
            <svg width="32" height="32" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="16" height="12" rx="2"/>
              <circle cx="7" cy="9" r="1.5"/>
              <path d="M2 13l4-3 3 2.5 3-3 4 3.5"/>
            </svg>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11 }}>Sleep of klik om te uploaden</span>
          </div>
        )}
      </div>

      <input ref={inputRef} type="file" accept=".png,.svg,.jpg,.jpeg,.webp" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button type="button" variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 15V5M6 9l4-4 4 4"/><path d="M4 17h12"/>
          </svg>
          {preview ? 'Vervangen' : 'Uploaden'}
        </Button>
        {preview && (
          <Button type="button" variant="destructive" size="sm" onClick={remove} disabled={uploading}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5l10 10M15 5 5 15"/>
            </svg>
            Verwijderen
          </Button>
        )}
      </div>

      {error && <p style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: '#dc2626', margin: 0 }}>{error}</p>}
    </div>
  )
}

function extractStoragePath(url: string): string | null {
  const match = url.match(/\/storage\/v1\/object\/public\/brand-assets\/(.+)/)
  return match?.[1] ?? null
}
