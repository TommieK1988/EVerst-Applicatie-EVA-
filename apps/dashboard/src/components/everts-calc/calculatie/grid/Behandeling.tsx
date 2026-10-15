'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import SchilderbehandelingZoekveld from '@/components/everts-calc/calculatie/SchilderbehandelingZoekveld'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import type { Calculatieregel } from '@/lib/everts-calc/types'
import { cn } from '@/lib/everts-calc/utils'
import type { ColId } from './kolommen'
import { voorOmschrijving } from './RegelDetail'
import { useBehandelingKoppeling } from './BehandelingContext'

/** Komt de regel uit de meetstaat? Alleen daar hoort een schilderbehandeling bij. */
export function uitMeetstaat(regel: Calculatieregel): boolean {
  return !!regel.meetstaat_aggregaat_id || !!regel.bestekcode
}

/**
 * Het label achter de omschrijving: welke behandeling er gekoppeld is (OHD 03), oranje
 * als de bibliotheek voor dit onderdeel geen normen heeft. Zonder behandeling niets:
 * koppelen gaat via "Behandeling per code" of ⋯ › Schilderbehandeling kiezen. De
 * volledige naam staat in de tooltip, in het zoekveld en op de offerte.
 */
export function BehandelingLabel({ regel, open, onWissel }: {
  regel: Calculatieregel
  open: boolean
  onWissel: () => void
}) {
  const { behandelingen, heeftNormen } = useBehandelingKoppeling()
  const id = regel.schilderbehandeling_id
  const gekozen = id ? behandelingen.find(b => b.id === id) : undefined
  const basis = 'inline-flex h-[18px] max-w-[110px] flex-shrink-0 items-center rounded-full border px-1.5 text-[10px] font-semibold transition-colors'

  if (!id && !regel.schilderbehandeling) return null

  const zonderNormen = id ? heeftNormen(regel, id) === false : false
  const tekst = gekozen?.code || gekozen?.naam || 'Behandeling'
  return (
    <button
      type="button" onClick={e => { e.stopPropagation(); onWissel() }}
      aria-expanded={open}
      className={cn(
        basis,
        zonderNormen
          ? 'border-warning-300 bg-warning-50 text-warning-700 hover:border-warning-500'
          : 'border-info-300 bg-info-50 text-info-700 hover:border-info-500',
        open && 'ring-2 ring-info-100',
      )}
      title={`${gekozen?.naam ?? 'Schilderbehandeling'}${zonderNormen ? ' — de bibliotheek heeft geen normen voor dit onderdeel' : ''}. Klik om te wijzigen.`}
    >
      <span className="truncate">{tekst}{zonderNormen ? ' · geen normen' : ''}</span>
    </button>
  )
}

/**
 * Kiezen van de behandeling, in één compacte rij onder de normen: het zoekveld en of de
 * normen uit de bibliotheek meekomen. Werkt
 * precies als "Behandeling per code": met normen overnemen aan vervangen de
 * bibliotheeknormen die van de regel, na een vraag als de regel al eigen normen heeft.
 */
export function BehandelingRij({ regel, colOrder, aantalNormen, readOnly, onSluit }: {
  regel: Calculatieregel
  colOrder: ColId[]
  aantalNormen: number
  readOnly?: boolean
  onSluit: () => void
}) {
  const { behandelingen, heeftNormen, onderdeelVan, koppel } = useBehandelingKoppeling()
  const [normenOvernemen, setNormenOvernemen] = useState(true)
  const [teBevestigen, setTeBevestigen] = useState<SchilderBehandeling | null>(null)
  const voor = voorOmschrijving(colOrder)
  const onderdeel = onderdeelVan(regel)
  const metNormen = uitMeetstaat(regel)

  const kies = (b: SchilderBehandeling) => {
    const vervangt = normenOvernemen && heeftNormen(regel, b.id) === true && aantalNormen > 0
    if (vervangt) setTeBevestigen(b)
    else void koppel(regel, b, normenOvernemen)
  }

  return (
    <tr className="border-b border-slate-100 bg-slate-50/30" onKeyDown={e => { if (e.key === 'Escape') onSluit() }}>
      {voor > 0 && <td colSpan={voor} />}
      <td colSpan={colOrder.length - voor} className="py-1 pr-3">
        <div className="flex items-center gap-3">
          <div className="w-full max-w-md min-w-0">
            <SchilderbehandelingZoekveld
              compact
              behandelingId={regel.schilderbehandeling_id}
              behandelingTekst={regel.schilderbehandeling}
              bibliotheek={behandelingen}
              normenVoor={metNormen ? b => heeftNormen(regel, b.id) : undefined}
              onderdeel={onderdeel}
              autoFocus={!regel.schilderbehandeling_id}
              onSelecteer={kies}
              onWis={() => { void koppel(regel, null, false); setTeBevestigen(null) }}
            />
          </div>
          {metNormen && !readOnly && !teBevestigen && (
            <label
              className="flex flex-shrink-0 cursor-pointer items-center gap-1.5 text-[11px] text-neutral-600"
              title="Bij het kiezen komen de normen uit de schilderwerkbibliotheek mee, met het uurtarief van deze calculatie. Heeft de regel al eigen normen, dan vraagt EVA eerst of ze vervangen mogen worden."
            >
              <input
                type="checkbox" checked={normenOvernemen}
                onChange={e => setNormenOvernemen(e.target.checked)}
                className="h-3 w-3 accent-brand-500"
              />
              Normen overnemen
            </label>
          )}
          {teBevestigen && (
            <div className="flex flex-shrink-0 items-center gap-1.5 text-[11px] text-warning-700">
              {aantalNormen} eigen norm{aantalNormen === 1 ? '' : 'en'} vervangen?
              <button
                type="button"
                onClick={() => { void koppel(regel, teBevestigen, true); setTeBevestigen(null) }}
                className="rounded border border-warning-500 bg-warning-500 px-1.5 py-px font-semibold text-white"
              >
                Vervangen
              </button>
              <button
                type="button"
                onClick={() => { void koppel(regel, teBevestigen, false); setTeBevestigen(null) }}
                className="rounded border border-neutral-300 bg-white px-1.5 py-px text-neutral-700"
              >
                Houden
              </button>
            </div>
          )}
          <button onClick={onSluit} className="ml-auto rounded p-1 text-neutral-400 hover:text-neutral-700" title="Inklappen (Esc)">
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}
