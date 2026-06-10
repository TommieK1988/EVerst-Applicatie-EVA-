'use client'

import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { createClient } from '@everts/database/client'
import { Button } from '@/components/ui'
import { updateFoto } from './actions'

export default function AvatarBeheer({
  medewerker_id,
  initial_url,
  initials,
}: {
  medewerker_id: string
  initial_url: string | null
  initials: string
}) {
  const [url, setUrl] = useState<string | null>(initial_url)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      toast.error('Alleen afbeeldingsbestanden toegestaan')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Bestand mag maximaal 5 MB zijn')
      return
    }

    setUploading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
      const ext = file.name.split('.').pop() ?? 'jpg'
      const path = `medewerkers/${medewerker_id}/foto_${Date.now()}.${ext}`

      const { data: uploaded, error: upErr } = await supabase.storage
        .from('medewerker-bestanden')
        .upload(path, file, { upsert: true })

      if (upErr || !uploaded) {
        toast.error(upErr?.message ?? 'Upload mislukt')
        return
      }

      const { data: { publicUrl } } = supabase.storage
        .from('medewerker-bestanden')
        .getPublicUrl(uploaded.path)

      const result = await updateFoto(publicUrl)
      if (!result.ok) { toast.error(result.error); return }

      setUrl(publicUrl)
      toast.success('Profielfoto bijgewerkt')
    } finally {
      setUploading(false)
    }
  }

  async function handleVerwijder() {
    const result = await updateFoto(null)
    if (!result.ok) { toast.error(result.error); return }
    setUrl(null)
    toast.success('Profielfoto verwijderd')
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      {/* Avatar preview */}
      <div style={{
        width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
        background: url ? 'transparent' : 'linear-gradient(135deg, var(--accent), var(--accent-2))',
        display: 'grid', placeItems: 'center',
        overflow: 'hidden',
        border: '2px solid var(--border)',
      }}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Profielfoto" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: 'white', fontSize: 22, fontWeight: 700 }}>{initials}</span>
        )}
      </div>

      {/* Acties */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          loading={uploading}
        >
          {uploading ? 'Uploaden…' : url ? 'Foto wijzigen' : 'Foto uploaden'}
        </Button>
        {url && (
          <button
            type="button"
            onClick={handleVerwijder}
            style={{
              border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--fg-muted)', padding: 0, textAlign: 'left',
            }}
          >
            Verwijderen
          </button>
        )}
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-muted)', margin: 0 }}>
          PNG, JPG of WebP · max 5 MB
        </p>
      </div>
    </div>
  )
}
