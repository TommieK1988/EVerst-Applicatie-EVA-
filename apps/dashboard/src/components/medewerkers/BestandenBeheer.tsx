'use client'

import React, { useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'
import type { MedewerkerBestand, BestandCategorie } from '@everts/database/platform-types'
import { bestandCategorieLabels } from '@everts/database/platform-types'
import { registreerBestand, verwijderBestand } from '@/app/(platform)/medewerkers/[id]/actions'
import { createClient } from '@everts/database/client'
import {
  Button,
  Card,
  CardBody,
  EmptyState,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui'

const CATEGORIE_COLORS: Record<BestandCategorie, string> = {
  contract:    '#3182ce',
  certificaat: '#38a169',
  id_bewijs:   '#d69e2e',
  vca_diploma: '#805ad5',
  overig:      '#718096',
}

function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function BestandenBeheer({
  medewerker_id,
  initial,
}: {
  medewerker_id: string
  initial: MedewerkerBestand[]
}) {
  const [bestanden, setBestanden] = useState<MedewerkerBestand[]>(initial)
  const [uploading, setUploading] = useState(false)
  const [categorie, setCategorie] = useState<BestandCategorie>('overig')
  const [showUpload, setShowUpload] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
      const path = `medewerkers/${medewerker_id}/${Date.now()}_${file.name}`
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('medewerker-bestanden')
        .upload(path, file, { upsert: false })

      if (upErr || !uploaded) { toast.error(upErr?.message ?? 'Upload mislukt'); return }

      const { data: { publicUrl } } = supabase.storage
        .from('medewerker-bestanden')
        .getPublicUrl(uploaded.path)

      const result = await registreerBestand(medewerker_id, {
        naam:         file.name,
        url:          publicUrl,
        categorie,
        bestandstype: file.type || undefined,
        grootte:      file.size,
      })

      if (!result.ok) { toast.error(result.error); return }

      toast.success('Bestand geüpload')
      setShowUpload(false)
      // Reload to get fresh server data
      window.location.reload()
    } finally {
      setUploading(false)
    }
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await verwijderBestand(id, medewerker_id)
      if (!result.ok) { toast.error(result.error); return }
      setBestanden(prev => prev.filter(b => b.id !== id))
      toast.success('Bestand verwijderd')
    })
  }

  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
    color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
    display: 'block', marginBottom: 4,
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Bestanden
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowUpload(s => !s)}>
          {showUpload ? 'Annuleren' : '+ Uploaden'}
        </Button>
      </div>

      {showUpload && (
        <Card style={{ marginBottom: 12 }}>
          <CardBody>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={labelStyle}>Categorie</label>
                <Select value={categorie} onValueChange={v => setCategorie(v as BestandCategorie)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(bestandCategorieLabels) as BestandCategorie[]).map(c => (
                      <SelectItem key={c} value={c}>{bestandCategorieLabels[c]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label style={labelStyle}>Bestand</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleUpload(file)
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  style={{ width: '100%' }}
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? 'Uploaden…' : 'Bestand kiezen'}
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {bestanden.length === 0 ? (
        <EmptyState size="sm" title="Nog geen bestanden geüpload." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {bestanden.map(b => (
            <Card key={b.id}>
              <CardBody className="flex items-center gap-3 px-[14px] py-[10px]">
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, textTransform: 'uppercase',
                  padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                  background: `${CATEGORIE_COLORS[b.categorie]}1a`,
                  color: CATEGORIE_COLORS[b.categorie],
                }}>
                  {bestandCategorieLabels[b.categorie]}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.naam}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-muted)', marginTop: 1 }}>
                    {formatDate(b.created_at)}{b.grootte ? ` · ${formatBytes(b.grootte)}` : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <Button asChild variant="ghost" size="sm">
                    <a href={b.url} target="_blank" rel="noopener noreferrer">
                      Openen
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(b.id)}
                    disabled={isPending}
                  >
                    Verwijder
                  </Button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
