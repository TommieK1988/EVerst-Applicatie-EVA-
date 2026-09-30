'use client'

import React from 'react'
import toast from 'react-hot-toast'
import { ImagePlus, X } from 'lucide-react'
import { verkleinFoto } from '@/lib/foto/verkleinFoto'

/** Eén foto als bijlage: base64 voor de server, `url` alleen voor het voorbeeld hier. */
export type MailFoto = { naam: string; contentType: string; base64: string; grootte: number; url: string }

/** Zelfde grenzen als `verstuurBestelling` aan de serverkant (Outlook-limiet per verzoek). */
const MAX_FOTOS = 6
const MAX_BYTES = 2.5 * 1024 * 1024

function naarBase64(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ''))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

/** Voor de server: zonder het voorbeeld-URL en de grootte. */
export const alsBijlagen = (fotos: MailFoto[]) =>
  fotos.map(({ naam, contentType, base64 }) => ({ naam, contentType, base64 }))

/**
 * Foto's toevoegen aan een uitgaande mail, bijvoorbeeld van de situatie ter plaatse bij een
 * opdracht aan een onderaannemer. Worden hier al verkleind (max 1600 px), zodat zes foto's
 * ruim binnen wat Outlook in één keer meeneemt blijven.
 */
export default function MailFotoBijlagen({ fotos, onChange, disabled }: {
  fotos: MailFoto[]
  onChange: (fotos: MailFoto[]) => void
  disabled?: boolean
}) {
  const invoer = React.useRef<HTMLInputElement>(null)
  const [bezig, setBezig] = React.useState(false)
  const totaal = fotos.reduce((s, f) => s + f.grootte, 0)

  async function kies(lijst: FileList | null) {
    if (!lijst || lijst.length === 0) return
    setBezig(true)
    try {
      const nieuw: MailFoto[] = []
      let som = totaal
      for (const bestand of Array.from(lijst)) {
        if (fotos.length + nieuw.length >= MAX_FOTOS) { toast.error(`Maximaal ${MAX_FOTOS} foto's per mail.`); break }
        const klein = await verkleinFoto(bestand)
        if (som + klein.size > MAX_BYTES) { toast.error("De foto's worden samen te groot voor één mail (max 2,5 MB)."); break }
        som += klein.size
        nieuw.push({
          naam: klein.name || bestand.name || `foto-${fotos.length + nieuw.length + 1}.jpg`,
          contentType: klein.type || 'image/jpeg',
          base64: await naarBase64(klein),
          grootte: klein.size,
          url: URL.createObjectURL(klein),
        })
      }
      if (nieuw.length) onChange([...fotos, ...nieuw])
    } finally {
      setBezig(false)
    }
  }

  function haalWeg(url: string) {
    URL.revokeObjectURL(url)
    onChange(fotos.filter(f => f.url !== url))
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">
          Foto&apos;s{fotos.length > 0 ? ` (${fotos.length})` : ''}
        </span>
        {fotos.length > 0 && (
          <span className="text-[11px] text-neutral-400">{(totaal / 1024 / 1024).toFixed(1)} van 2,5 MB</span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {fotos.map(f => (
          <div key={f.url} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.naam} className="h-16 w-16 rounded border border-neutral-200 object-cover" />
            <button
              type="button" onClick={() => haalWeg(f.url)} disabled={disabled}
              aria-label="Foto weghalen"
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-white hover:bg-neutral-900"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        {fotos.length < MAX_FOTOS && (
          <button
            type="button" onClick={() => invoer.current?.click()} disabled={disabled || bezig}
            className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded border border-dashed border-neutral-300 text-[10.5px] text-neutral-500 hover:border-brand-400 hover:text-brand-700 disabled:opacity-50"
          >
            <ImagePlus className="h-4 w-4" />
            {bezig ? 'Bezig…' : 'Toevoegen'}
          </button>
        )}
      </div>
      <input
        ref={invoer} type="file" accept="image/*" multiple className="hidden"
        onChange={e => { kies(e.target.files); e.target.value = '' }}
      />
    </div>
  )
}
