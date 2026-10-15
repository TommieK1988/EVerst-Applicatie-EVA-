'use client'

import { useState } from 'react'
import { X } from 'lucide-react'
import SchilderbehandelingZoekveld from '@/components/everts-calc/calculatie/SchilderbehandelingZoekveld'
import type { SchilderBehandeling } from '@/lib/everts-calc/services/schilderwerk'
import type { Calculatieregel } from '@/lib/everts-calc/types'
import { omschrijvingMetBehandeling } from '@/lib/everts-calc/behandeling-label'
import { cn } from '@/lib/everts-calc/utils'
import type { ColId } from './kolommen'
import { voorOmschrijving } from './RegelDetail'
import { useBehandelingKoppeling } from './BehandelingContext'

/** Komt de regel uit de meetstaat? Alleen daar hoort een schilderbehandeling bij. */
export function uitMeetstaat(regel: Calculatieregel): boolean {
  return !!regel.meetstaat_aggregaat_id || !!regel.bestekcode
}

/**
 * Het label achter de omschrijving: de behandelingscode (OHD 03), oranje als de
 * bibliotheek voor dit onderdeel geen normen heeft, of "+ behandeling" op een regel uit
 * de meetstaat zonder behandeling. Bouwkundige regels tonen niets. De volledige naam
 * staat in de tooltip, in het zoekveld en op de offerte.
 */
export function BehandelingLabel({ regel, open, readOnly, onWissel }: {
  regel: Calculatieregel
  open: boolean
  readOnly?: boolean
  onWissel: () => void
}) {
  const { behandelingen, heeftNormen } = useBehandelingKoppeling()
  const id = regel.schilderbehandeling_id
  const gekozen = id ? behandelingen.find(b => b.id === id) : undefined
  const basis = 'inline-flex h-5 max-w-[160px] flex-shrink-0 items-center rounded-full border px-2 text-[10.5px] font-semibold transition-colors'

  if (!id && !regel.schilderbehandeling) {
    if (!uitMeetstaat(regel) || readOnly) return null
    return (
      <button
        type="button" onClick={e => { e.stopPropagation(); onWissel() }}
        className={cn(basis, 'border-dashed border-info-300 text-info-700 hover:border-info-500', open && 'bg-info-50')}
        title="Schilderbehandeling kiezen uit de bibliotheek"
      >
        + behandeling
      </button>
    )
  }

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
 * Kiezen van de behandeling, in een eigen rij onder de regel. Links het zoekveld, rechts
 * of de normen uit de bibliotheek meekomen en hoe de regel op de offerte staat. Werkt
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
  const gekozen = behandelingen.find(b => b.id === regel.schilderbehandeling_id)
  const onderdeel = onderdeelVan(regel)
  const metNormen = uitMeetstaat(regel)

  const kies = (b: SchilderBehandeling) => {
    const vervangt = normenOvernemen && heeftNormen(regel, b.id) === true && aantalNormen > 0
    if (vervangt) setTeBevestigen(b)
    else void koppel(regel, b, normenOvernemen)
  }

  return (
    <tr className="border-b border-info-100 bg-info-50/40" onKeyDown={e => { if (e.key === 'Escape') onSluit() }}>
      {voor > 0 && <td colSpan={voor} />}
      <td colSpan={colOrder.length - voor} className="py-2 pr-3">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 max-w-2xl">
            <SchilderbehandelingZoekveld
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
          {metNormen && !readOnly && (
            <div className="w-[340px] flex-shrink-0 space-y-2">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox" checked={normenOvernemen}
                  onChange={e => setNormenOvernemen(e.target.checked)}
                  className="mt-0.5 h-3.5 w-3.5 accent-brand-500"
                />
                <span>
                  <span className="block text-xs font-semibold text-neutral-800">Normen overnemen uit de bibliotheek</span>
                  <span className="block text-[11px] text-neutral-500">
                    {aantalNormen === 0
                      ? 'Deze regel heeft nog geen normen.'
                      : `Deze regel heeft ${aantalNormen} eigen norm${aantalNormen === 1 ? '' : 'en'}; EVA vraagt of ze vervangen mogen worden.`}
                    {' '}Uren rekenen met het uurtarief van deze calculatie.
                  </span>
                </span>
              </label>
              {teBevestigen && (
                <div className="rounded-lg border border-warning-300 bg-warning-50 p-2">
                  <p className="text-[11px] text-warning-700">
                    {aantalNormen} eigen norm{aantalNormen === 1 ? '' : 'en'} vervangen door de normen van {teBevestigen.code || teBevestigen.naam}?
                  </p>
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => { void koppel(regel, teBevestigen, true); setTeBevestigen(null) }}
                      className="rounded border border-warning-500 bg-warning-500 px-2 py-0.5 text-[11px] font-semibold text-white"
                    >
                      Vervangen
                    </button>
                    <button
                      type="button"
                      onClick={() => { void koppel(regel, teBevestigen, false); setTeBevestigen(null) }}
                      className="rounded border border-neutral-300 bg-white px-2 py-0.5 text-[11px] text-neutral-700"
                    >
                      Eigen normen houden
                    </button>
                  </div>
                </div>
              )}
              {gekozen && (
                <div className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Op de offerte</div>
                  <div className="text-xs text-neutral-800">{omschrijvingMetBehandeling(regel.omschrijving, gekozen.naam)}</div>
                </div>
              )}
            </div>
          )}
          <button onClick={onSluit} className="mt-0.5 rounded p-1 text-neutral-400 hover:text-neutral-700" title="Inklappen (Esc)">
            <X className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  )
}
