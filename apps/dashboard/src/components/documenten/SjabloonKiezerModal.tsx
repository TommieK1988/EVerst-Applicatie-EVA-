'use client'

/**
 * Simpele keuzepopup: "welk document wil ik opstellen?". Toont de beschikbare
 * sjablonen als lijst; klik er één om de genereermodal te openen.
 *
 * Bewust licht: een zoekveld verschijnt pas als er veel sjablonen zijn, en de
 * lijst sluit met Escape of een klik naast de kaart.
 */

import { useEffect, useMemo, useState } from 'react'
import { X, FileText, Search } from 'lucide-react'
import { documentsoortLabels, type DocumentSjabloon } from '@/lib/documenten/types'

interface Props {
  sjablonen: DocumentSjabloon[]
  onKies: (s: DocumentSjabloon) => void
  onSluit: () => void
  /** Kop van de popup; standaard "Document opstellen". */
  titel?: string
}

export default function SjabloonKiezerModal({ sjablonen, onKies, onSluit, titel = 'Document opstellen' }: Props) {
  const [zoek, setZoek] = useState('')

  // Escape sluit de popup.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onSluit() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onSluit])

  const toonZoek = sjablonen.length > 6
  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase()
    if (!q) return sjablonen
    return sjablonen.filter(s =>
      s.naam.toLowerCase().includes(q) ||
      (documentsoortLabels[s.documentsoort] ?? s.documentsoort).toLowerCase().includes(q) ||
      (s.beschrijving ?? '').toLowerCase().includes(q))
  }, [sjablonen, zoek])

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-6"
      onMouseDown={e => { if (e.target === e.currentTarget) onSluit() }}
    >
      <div className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        {/* Kop */}
        <div className="flex flex-shrink-0 items-center gap-2.5 border-b border-neutral-200 px-5 py-3.5">
          <FileText className="h-4 w-4 text-neutral-400" />
          <div className="text-[13.5px] font-semibold text-neutral-800">{titel}</div>
          <button onClick={onSluit} className="ml-auto rounded p-1.5 text-neutral-400 hover:bg-neutral-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Zoek (alleen bij veel sjablonen) */}
        {toonZoek && (
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-neutral-200 px-5 py-2.5">
            <Search className="h-3.5 w-3.5 text-neutral-400" />
            <input
              autoFocus
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              placeholder="Zoek een sjabloon…"
              className="w-full bg-transparent text-[12.5px] text-neutral-700 placeholder:text-neutral-400 focus:outline-none"
            />
          </div>
        )}

        {/* Lijst */}
        <div className="flex-1 overflow-y-auto p-3">
          {gefilterd.length === 0 ? (
            <p className="px-2 py-6 text-center text-[12.5px] text-neutral-500">Geen sjabloon gevonden.</p>
          ) : (
            <div className="space-y-1.5">
              {gefilterd.map(s => (
                <button
                  key={s.id}
                  onClick={() => onKies(s)}
                  className="group flex w-full items-start gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-brand-500 hover:bg-brand-50/40"
                >
                  <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-neutral-100 text-neutral-500 group-hover:bg-brand-100 group-hover:text-brand-600">
                    <FileText className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[12.5px] font-medium text-neutral-800">{s.naam}</span>
                    <span className="block text-[10.5px] text-neutral-400">
                      {documentsoortLabels[s.documentsoort] ?? s.documentsoort}
                    </span>
                    {s.beschrijving && (
                      <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{s.beschrijving}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
