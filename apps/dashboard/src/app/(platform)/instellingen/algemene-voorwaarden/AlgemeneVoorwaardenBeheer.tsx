'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { createClient } from '@/lib/everts-calc/supabase/client'
import {
  Button,
  Input,
  Label,
  Badge,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  useDialogen,
} from '@/components/ui'
import type { AlgemeneVoorwaarden } from './actions'
import {
  maakAlgemeneVoorwaarden,
  verwijderAlgemeneVoorwaarden,
  setStandaardAlgemeneVoorwaarden,
} from './actions'

export default function AlgemeneVoorwaardenBeheer({ initial }: { initial: AlgemeneVoorwaarden[] }) {
  const router = useRouter()
  const { bevestig } = useDialogen()
  const [, startT] = useTransition()
  const [items, setItems] = useState(initial)
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ naam: '', versie: '', bestand: null as File | null })
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function slaOp() {
    if (!form.naam.trim()) { toast.error('Geef een naam op'); return }
    if (!form.bestand) { toast.error('Selecteer een PDF-bestand'); return }
    setUploading(true)
    try {
      const supabase = createClient()
      const bestandsNaam = `${Date.now()}-${form.bestand.name.replace(/[^a-z0-9._-]/gi, '_')}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: upload, error: uploadErr } = await (supabase as any)
        .storage.from('algemene-voorwaarden')
        .upload(bestandsNaam, form.bestand, { contentType: 'application/pdf', upsert: false })
      if (uploadErr) throw new Error('Upload mislukt: ' + uploadErr.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: { publicUrl } } = (supabase as any)
        .storage.from('algemene-voorwaarden')
        .getPublicUrl(upload.path)
      const id = await maakAlgemeneVoorwaarden({
        naam: form.naam, bestand_url: publicUrl,
        versie: form.versie || undefined,
      })
      setItems(prev => [...prev, {
        id, naam: form.naam, bestand_url: publicUrl,
        versie: form.versie || null, is_standaard: false, created_at: '',
      }])
      toast.success('Algemene voorwaarden toegevoegd')
      setModal(false)
      setForm({ naam: '', versie: '', bestand: null })
      startT(() => router.refresh())
    } catch (e) {
      toast.error(String(e))
    } finally {
      setUploading(false)
    }
  }

  async function verwijder(id: string, naam: string) {
    if (!await bevestig({ titel: `"${naam}" verwijderen?`, bevestigLabel: 'Verwijderen', destructief: true })) return
    startT(async () => {
      try {
        await verwijderAlgemeneVoorwaarden(id)
        setItems(prev => prev.filter(x => x.id !== id))
        toast.success('Verwijderd')
        router.refresh()
      } catch (e) { toast.error(String(e)) }
    })
  }

  function setStandaard(id: string) {
    startT(async () => {
      try {
        await setStandaardAlgemeneVoorwaarden(id)
        setItems(prev => prev.map(x => ({ ...x, is_standaard: x.id === id })))
        router.refresh()
      } catch (e) { toast.error(String(e)) }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0 }}>
          Upload PDF-bestanden met algemene voorwaarden. Per offerte kies je welke van toepassing is.
        </p>
        <Button variant="primary" size="sm" onClick={() => setModal(true)} style={{ flexShrink: 0 }}>
          + PDF uploaden
        </Button>
      </div>

      {items.length === 0 ? (
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
          Nog geen algemene voorwaarden. Upload een PDF om te beginnen.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map(av => (
            <div key={av.id} style={{
              padding: '14px 16px', background: 'var(--bg)', border: '1px solid var(--border)',
              borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{av.naam}</span>
                  {av.versie && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--fg-muted)' }}>v{av.versie}</span>}
                  {av.is_standaard && (
                    <Badge variant="outline" tone="warning" size="sm">★ Standaard</Badge>
                  )}
                </div>
                <a
                  href={av.bestand_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--accent)', textDecoration: 'none', display: 'inline-block', marginTop: 2 }}
                >
                  PDF bekijken →
                </a>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {!av.is_standaard && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setStandaard(av.id)}
                    title="Als standaard instellen"
                  >☆</Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => verwijder(av.id, av.naam)}
                >Verwijder</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={modal} onOpenChange={(open) => {
        setModal(open)
        if (!open) setForm({ naam: '', versie: '', bestand: null })
      }}>
        <DialogContent style={{ maxWidth: 440 }}>
          <DialogHeader>
            <DialogTitle>Algemene voorwaarden uploaden</DialogTitle>
          </DialogHeader>
          <DialogBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <Label style={{ display: 'block', marginBottom: 6 }}>Naam *</Label>
              <Input placeholder="bv. Algemene Voorwaarden 2025" value={form.naam} onChange={e => setForm(f => ({ ...f, naam: e.target.value }))} />
            </div>
            <div>
              <Label style={{ display: 'block', marginBottom: 6 }}>Versie (optioneel)</Label>
              <Input placeholder="bv. 2025-01" value={form.versie} onChange={e => setForm(f => ({ ...f, versie: e.target.value }))} />
            </div>
            <div>
              <Label style={{ display: 'block', marginBottom: 6 }}>PDF-bestand *</Label>
              {form.bestand ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6 }}>
                  <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg)', flex: 1 }}>{form.bestand.name}</span>
                  <Button variant="ghost" size="icon-sm" onClick={() => setForm(f => ({ ...f, bestand: null }))}>×</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>
                  PDF kiezen...
                </Button>
              )}
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden" style={{ display: 'none' }} onChange={e => setForm(f => ({ ...f, bestand: e.target.files?.[0] ?? null }))} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => { setModal(false); setForm({ naam: '', versie: '', bestand: null }) }}>Annuleren</Button>
            <Button variant="primary" size="sm" onClick={slaOp} loading={uploading} disabled={uploading}>
              {uploading ? 'Uploaden…' : 'Uploaden & opslaan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
