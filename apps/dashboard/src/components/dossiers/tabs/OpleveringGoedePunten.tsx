'use client'

import React, { useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { Badge, Button, FormField, Input, Textarea, useDialogen } from '@/components/ui'
import {
  uploadOpleverFoto, verwijderOpleverFoto, verwijderOpleverpunt, updateOpleverpunt,
  type OpleverPuntView,
} from '@/lib/dossiers/oplevering'
import { maakGoedPunt } from '@/lib/dossiers/oplever-goed'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'

/**
 * Punten die goed zijn uitgevoerd: foto + omschrijving, meteen akkoord. In het opleverrapport
 * krijgen ze een eigen hoofdstuk "Goed uitgevoerd", naar het voorbeeld van de rapporten die het
 * team eerder in Word maakte (per ruimte een foto met "Status: akkoord").
 *
 * Geen status, toewijzing of na-foto: er valt niets te herstellen.
 */
export default function OpleveringGoedePunten({ momentId, punten, readOnly, onChange }: {
  momentId: string
  punten: OpleverPuntView[]
  readOnly: boolean
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  if (punten.length === 0 && readOnly) return null

  return (
    <div className="mt-5">
      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
        Goed uitgevoerd{punten.length > 0 && ` (${punten.length})`}
      </div>
      <div className="space-y-2">
        {punten.map((p, i) => (
          <GoedPuntRij key={p.id} punt={p} nr={i + 1} readOnly={readOnly} onChange={onChange} />
        ))}
      </div>
      {punten.length === 0 && (
        <p className="text-[12px] text-neutral-500">
          Leg hier vast wat goed is uitgevoerd — een foto per ruimte met een korte omschrijving.
        </p>
      )}
      {!readOnly && (
        <div className="mt-3">
          {open
            ? <NieuwGoedPunt momentId={momentId} onDone={() => { setOpen(false); onChange() }} onCancel={() => setOpen(false)} />
            : <Button variant="secondary" onClick={() => setOpen(true)}>+ Goed uitgevoerd toevoegen</Button>}
        </div>
      )}
    </div>
  )
}

async function uploadAlles(puntId: string, files: File[]): Promise<boolean> {
  for (const file of files) {
    const fd = new FormData()
    fd.append('foto', await verkleinFoto(file))
    fd.append('soort', 'algemeen')
    const r = await uploadOpleverFoto(puntId, fd)
    if (!r.ok) { toast.error(r.error); return false }
  }
  return true
}

function NieuwGoedPunt({ momentId, onDone, onCancel }: {
  momentId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [omschrijving, setOmschrijving] = useState('')
  const [ruimte, setRuimte] = useState('')
  const [fotos, setFotos] = useState<File[]>([])
  const [bezig, setBezig] = useState(false)

  async function opslaan() {
    if (!omschrijving.trim()) { toast.error('Geef een omschrijving op.'); return }
    setBezig(true)
    const r = await maakGoedPunt(momentId, { omschrijving, ruimte })
    if (!r.ok) { setBezig(false); toast.error(r.error); return }
    await uploadAlles(r.id, fotos)
    setBezig(false)
    toast.success('Toegevoegd aan "Goed uitgevoerd"')
    onDone()
  }

  return (
    <div className="space-y-3 rounded-lg border border-success-200 bg-success-50/40 p-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Ruimte / onderdeel" upper optional>
          <Input value={ruimte} onChange={e => setRuimte(e.target.value)} placeholder="Bijv. centrale hal" />
        </FormField>
        <FormField label="Foto's" upper optional>
          <input type="file" accept="image/*" multiple className="text-[12px]"
            onChange={e => setFotos(Array.from(e.target.files ?? []))} />
        </FormField>
      </div>
      <FormField label="Omschrijving" upper required>
        <Textarea rows={3} value={omschrijving} onChange={e => setOmschrijving(e.target.value)}
          placeholder="Wat is er gedaan? Bijv. deuren en kozijnen geschilderd, wanden voorzien van nieuwe latex." />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={bezig}>Annuleren</Button>
        <Button variant="primary" onClick={opslaan} disabled={bezig}>{bezig ? 'Opslaan…' : 'Toevoegen'}</Button>
      </div>
    </div>
  )
}

function GoedPuntRij({ punt, nr, readOnly, onChange }: {
  punt: OpleverPuntView
  nr: number
  readOnly: boolean
  onChange: () => void
}) {
  const [bezig, setBezig] = useState(false)
  const [bewerk, setBewerk] = useState(false)
  const [omschrijving, setOmschrijving] = useState(punt.omschrijving)
  const [ruimte, setRuimte] = useState(punt.ruimte ?? '')
  const fotoRef = useRef<HTMLInputElement>(null)
  const { bevestig } = useDialogen()

  async function fotosToevoegen(files: FileList | null) {
    if (!files?.length) return
    setBezig(true)
    await uploadAlles(punt.id, Array.from(files))
    setBezig(false)
    onChange()
  }
  async function fotoWeg(id: string) {
    setBezig(true)
    const r = await verwijderOpleverFoto(id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onChange()
  }
  async function opslaan() {
    if (!omschrijving.trim()) { toast.error('Geef een omschrijving op.'); return }
    setBezig(true)
    const r = await updateOpleverpunt(punt.id, { omschrijving: omschrijving.trim(), ruimte: ruimte.trim() || null })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    setBewerk(false); onChange()
  }
  async function verwijder() {
    if (!await bevestig({ titel: 'Dit punt verwijderen?', bevestigLabel: 'Verwijderen', destructief: true })) return
    setBezig(true)
    const r = await verwijderOpleverpunt(punt.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    onChange()
  }

  return (
    <div className="flex gap-3 rounded-lg border border-neutral-200 bg-white p-3">
      <div className="flex w-[148px] shrink-0 flex-wrap content-start gap-1">
        {punt.fotos.length === 0 && (
          <div className="flex h-[100px] w-[148px] items-center justify-center rounded-md border border-dashed border-neutral-300 text-[11px] text-neutral-400">
            geen foto
          </div>
        )}
        {punt.fotos.map((f, i) => (
          <div key={f.id} className={`relative overflow-hidden rounded-md border border-neutral-200 ${i === 0 ? 'h-[100px] w-[148px]' : 'h-9 w-9'}`}>
            <a href={f.url} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="foto goed uitgevoerd" className="h-full w-full object-cover" />
            </a>
            {!readOnly && (
              <button onClick={() => fotoWeg(f.id)} disabled={bezig} aria-label="Foto verwijderen"
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-bl bg-black/50 text-[10px] text-white">×</button>
            )}
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold tabular-nums text-neutral-400">G{String(nr).padStart(2, '0')}</span>
          <Badge tone="success" size="sm">Goed uitgevoerd</Badge>
          {punt.ruimte && !bewerk && <span className="text-[11px] text-neutral-500">{punt.ruimte}</span>}
        </div>
        {bewerk ? (
          <div className="mt-2 space-y-2">
            <Input value={ruimte} onChange={e => setRuimte(e.target.value)} placeholder="Ruimte / onderdeel" />
            <Textarea rows={3} value={omschrijving} onChange={e => setOmschrijving(e.target.value)} />
            <div className="flex gap-2">
              <Button variant="primary" onClick={opslaan} disabled={bezig}>Opslaan</Button>
              <Button variant="secondary" onClick={() => setBewerk(false)} disabled={bezig}>Annuleren</Button>
            </div>
          </div>
        ) : (
          <div className="mt-1 whitespace-pre-line text-[13px] text-neutral-800">{punt.omschrijving}</div>
        )}
        {!readOnly && !bewerk && (
          <div className="mt-2 flex gap-3 text-[11px] font-medium">
            <button className="text-brand-600 hover:underline" disabled={bezig} onClick={() => fotoRef.current?.click()}>Foto toevoegen</button>
            <button className="text-brand-600 hover:underline" disabled={bezig} onClick={() => setBewerk(true)}>Bewerken</button>
            <button className="text-error-600 hover:underline" disabled={bezig} onClick={verwijder}>Verwijderen</button>
            <input ref={fotoRef} type="file" accept="image/*" multiple hidden onChange={e => fotosToevoegen(e.target.files)} />
          </div>
        )}
      </div>
    </div>
  )
}
