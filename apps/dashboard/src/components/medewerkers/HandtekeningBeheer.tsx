'use client'

import React, { useRef, useState, useEffect, useTransition } from 'react'
import toast from 'react-hot-toast'
import { updateHandtekening } from '@/app/(platform)/medewerkers/[id]/actions'
import { createClient } from '@everts/database/client'
import { Button } from '@/components/ui/button'
import { Card, CardBody } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

type Tab = 'upload' | 'tekenen'

export default function HandtekeningBeheer({
  medewerker_id,
  initial_url,
}: {
  medewerker_id: string
  initial_url: string | null
}) {
  const [url, setUrl] = useState<string | null>(initial_url)
  const [tab, setTab] = useState<Tab>('upload')
  const [showEditor, setShowEditor] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawing = useRef(false)
  const lastPos = useRef<{ x: number; y: number } | null>(null)

  // Canvas drawing setup
  useEffect(() => {
    if (!showEditor || tab !== 'tekenen') return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a1a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [showEditor, tab])

  function getPos(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top }
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function startDraw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    isDrawing.current = true
    lastPos.current = getPos(e)
  }

  function draw(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
  }

  function stopDraw() {
    isDrawing.current = false
    lastPos.current = null
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
  }

  async function saveCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.toBlob(async blob => {
      if (!blob) return
      await uploadFile(new File([blob], 'handtekening.png', { type: 'image/png' }))
    }, 'image/png')
  }

  async function uploadFile(file: File) {
    setUploading(true)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createClient() as any
      const path = `medewerkers/${medewerker_id}/handtekening_${Date.now()}.${file.name.split('.').pop()}`
      const { data: uploaded, error: upErr } = await supabase.storage
        .from('medewerker-bestanden')
        .upload(path, file, { upsert: true })

      if (upErr || !uploaded) { toast.error(upErr?.message ?? 'Upload mislukt'); return }

      const { data: { publicUrl } } = supabase.storage
        .from('medewerker-bestanden')
        .getPublicUrl(uploaded.path)

      const result = await updateHandtekening(medewerker_id, publicUrl)
      if (!result.ok) { toast.error(result.error); return }

      setUrl(publicUrl)
      setShowEditor(false)
      toast.success('Handtekening opgeslagen')
    } finally {
      setUploading(false)
    }
  }

  function handleVerwijder() {
    startTransition(async () => {
      const result = await updateHandtekening(medewerker_id, null)
      if (!result.ok) { toast.error(result.error); return }
      setUrl(null)
      toast.success('Handtekening verwijderd')
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--fg)', margin: 0 }}>
          Handtekening
        </h3>
        <Button variant="ghost" size="sm" onClick={() => setShowEditor(s => !s)}>
          {showEditor ? 'Annuleren' : url ? 'Wijzigen' : 'Toevoegen'}
        </Button>
      </div>

      {/* Huidige handtekening */}
      {url && !showEditor && (
        <Card>
          <CardBody className="inline-flex flex-col gap-2 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Handtekening" style={{ maxHeight: 80, maxWidth: 300, objectFit: 'contain' }} />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleVerwijder}
              disabled={isPending}
            >
              Verwijderen
            </Button>
          </CardBody>
        </Card>
      )}

      {!url && !showEditor && (
        <EmptyState
          size="sm"
          tone="neutral"
          title="Nog geen handtekening ingesteld"
        />
      )}

      {/* Editor */}
      {showEditor && (
        <Card>
          <CardBody>
            {/* Tabs */}
            <div className="flex gap-1 mb-3">
              <Button
                variant={tab === 'upload' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTab('upload')}
              >
                Uploaden
              </Button>
              <Button
                variant={tab === 'tekenen' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setTab('tekenen')}
              >
                Tekenen
              </Button>
            </div>

            {tab === 'upload' && (
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  style={{ display: 'none' }}
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) uploadFile(file)
                  }}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  loading={uploading}
                >
                  {uploading ? 'Uploaden…' : 'Afbeelding kiezen (PNG / JPG)'}
                </Button>
              </div>
            )}

            {tab === 'tekenen' && (
              <div>
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={120}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 6,
                    background: 'white', cursor: 'crosshair', touchAction: 'none',
                    maxWidth: '100%',
                  }}
                />
                <div className="flex gap-2 mt-2">
                  <Button type="button" variant="ghost" size="sm" onClick={clearCanvas}>Wissen</Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={saveCanvas}
                    disabled={uploading}
                    loading={uploading}
                  >
                    {uploading ? 'Opslaan…' : 'Handtekening opslaan'}
                  </Button>
                </div>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}
