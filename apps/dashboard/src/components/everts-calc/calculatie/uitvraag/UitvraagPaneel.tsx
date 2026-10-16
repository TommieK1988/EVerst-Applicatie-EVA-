'use client'

import { useEffect, useRef } from 'react'
import { Plus, X } from 'lucide-react'
import { Badge, Button, Spinner } from '@/components/ui'
import { cn } from '@/lib/everts-calc/utils'
import type { UitvraagPakket, UitvraagPakketPartij } from '@/lib/dossiers/uitvraag-pakket-types'
import { pakketOmschrijving, partijWeergave } from '@/lib/everts-calc/uitvraag-weergave'

export interface UitvraagPaneelProps {
  open: boolean
  pakketten: UitvraagPakket[]
  laden?: boolean
  fout?: string | null
  /** Pakket waar je vanuit een regellabel naartoe springt. */
  focusPakketId?: string | null
  /** Partij waarvoor een actie loopt (knoppen even uit). */
  bezigId?: string | null
  onSluit: () => void
  onLosseUitvraag: () => void
  onRekentMet: (pakketId: string, uitvraagId: string | null) => void
  onMail: (uitvraagId: string) => void
  onOfferteBinnen: (uitvraagId: string, bestand: File) => void
}

/**
 * Paneel "Uitvragen" rechts naast het rekenblad, zoals Controle. Per pakket een kaart met de
 * partijen; met het rondje kies je met wie de calculatie rekent (geen gunning). Alleen
 * weergave: alle acties gaan via props naar de container.
 */
export function UitvraagPaneel(p: UitvraagPaneelProps) {
  const kaarten = useRef(new Map<string, HTMLDivElement>())
  useEffect(() => {
    if (p.open && p.focusPakketId) kaarten.current.get(p.focusPakketId)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [p.open, p.focusPakketId])

  return (
    <aside className={`${p.open ? 'flex' : 'hidden'} w-80 xl:w-96 flex-shrink-0 flex-col bg-white border-l border-neutral-200`}>
      <div className="flex h-12 flex-shrink-0 items-center gap-2 border-b border-neutral-200 pl-3 pr-1">
        <span className="flex-1 text-[15px] font-semibold text-neutral-900">Uitvragen</span>
        <Button variant="outline" size="sm" onClick={p.onLosseUitvraag} className="border-calc-oa/30 text-calc-oa hover:border-calc-oa/60 hover:bg-calc-oa/5">
          <Plus className="h-3.5 w-3.5" /> Losse uitvraag
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={p.onSluit} className="text-neutral-400" title="Sluiten">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {p.laden && p.pakketten.length === 0 && (
          <div className="flex items-center gap-2 text-xs text-neutral-500"><Spinner size="sm" /> Uitvragen laden…</div>
        )}
        {!p.laden && p.fout && p.pakketten.length === 0 && (
          <p className="text-xs text-error-700">De uitvragen konden niet worden geladen.</p>
        )}
        {!p.laden && !p.fout && p.pakketten.length === 0 && (
          <p className="text-xs leading-relaxed text-neutral-500">
            Nog geen uitvragen. Vink posten aan en kies &ldquo;Uitvragen bij onderaannemer&rdquo;, of start een losse uitvraag.
          </p>
        )}
        {p.pakketten.map(pakket => {
          const rekent = pakket.partijen.find(x => x.rekent_mee)
          return (
            <div
              key={pakket.id}
              ref={el => { if (el) kaarten.current.set(pakket.id, el); else kaarten.current.delete(pakket.id) }}
              className={cn(
                'overflow-hidden rounded-[10px] border border-neutral-200 bg-white',
                p.focusPakketId === pakket.id && 'border-calc-oa/50 ring-[3px] ring-calc-oa/10',
              )}
            >
              <div className="flex items-baseline gap-2 border-b border-neutral-100 px-3 py-3">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-neutral-900" title={pakket.naam}>{pakket.naam}</span>
                <span className="flex-shrink-0 text-[11px] text-neutral-500">{pakketOmschrijving(pakket)}</span>
              </div>
              {pakket.partijen.map(partij => (
                <PartijRij
                  key={partij.id} partij={partij} bezig={p.bezigId === partij.id}
                  onRondje={() => p.onRekentMet(pakket.id, partij.rekent_mee ? null : partij.id)}
                  onMail={() => p.onMail(partij.id)}
                  onBestand={f => p.onOfferteBinnen(partij.id, f)}
                />
              ))}
              {rekent && (
                <p className="border-t border-neutral-100 bg-neutral-50 px-3 py-2 text-[11.5px] text-neutral-600">
                  Je rekent met {rekent.partij_naam}. Vul het bedrag uit hun offerte in bij de post.
                </p>
              )}
            </div>
          )
        })}
        <p className="px-1 text-[11px] leading-snug text-neutral-500">
          &ldquo;Offerte binnen&rdquo; vraagt om het pdf-bestand; dat komt in het dossier onder Bestanden.
          Alles staat ook in dossier › Uitvraag.
        </p>
      </div>
    </aside>
  )
}

function PartijRij({ partij, bezig, onRondje, onMail, onBestand }: {
  partij: UitvraagPakketPartij
  bezig: boolean
  onRondje: () => void
  onMail: () => void
  onBestand: (f: File) => void
}) {
  const invoer = useRef<HTMLInputElement>(null)
  const w = partijWeergave(partij)
  const kanRekenen = partij.status !== 'ingetrokken' && partij.status !== 'afgevallen'
  return (
    <div className="flex min-h-12 items-center gap-2 border-b border-neutral-100 px-3 py-2 last:border-b-0">
      <button
        type="button" role="radio" aria-checked={partij.rekent_mee} disabled={!kanRekenen}
        onClick={onRondje}
        title={partij.rekent_mee ? 'Je rekent met deze partij. Klik om de keuze op te heffen.' : 'Met deze partij rekenen (geen gunning)'}
        className={cn(
          'grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border-[1.5px] bg-white transition-colors',
          partij.rekent_mee ? 'border-calc-oa' : 'border-neutral-300 hover:border-calc-oa',
          'disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:hover:border-neutral-300',
        )}
      >
        {partij.rekent_mee && <span className="h-2 w-2 rounded-full bg-calc-oa" />}
      </button>
      {/* Naam en pil lopen door naar een tweede regel als de knoppen de ruimte nodig hebben. */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span
          className={cn('min-w-0 max-w-full truncate text-[13px]', partij.rekent_mee ? 'font-semibold text-neutral-900' : 'text-neutral-700')}
          title={partij.partij_naam}
        >
          {partij.partij_naam}
        </span>
        <Badge tone={w.toon} className="flex-shrink-0 whitespace-nowrap">{w.label}</Badge>
      </div>
      {partij.offerte_bestand_url && (
        <a
          href={partij.offerte_bestand_url} target="_blank" rel="noreferrer"
          className="flex-shrink-0 text-[11.5px] text-brand-700 underline underline-offset-2"
          title={partij.offerte_bestand_naam ?? 'Offerte openen'}
        >
          pdf
        </a>
      )}
      {w.actie === 'mailen' && <Button variant="outline" size="sm" disabled={bezig} onClick={onMail}>Mailen</Button>}
      {w.actie === 'open' && (
        <>
          <Button variant="ghost" size="sm" disabled={bezig} onClick={onMail} title="Herinnering mailen">Rappel</Button>
          <Button variant="outline" size="sm" disabled={bezig} loading={bezig} onClick={() => invoer.current?.click()}>
            Offerte binnen
          </Button>
          <input
            ref={invoer} type="file" accept="application/pdf,.pdf" className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) onBestand(f)
            }}
          />
        </>
      )}
    </div>
  )
}
