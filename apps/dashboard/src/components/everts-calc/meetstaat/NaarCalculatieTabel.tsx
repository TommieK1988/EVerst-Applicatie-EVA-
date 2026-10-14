'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getMeetregelAggregaten, getCalculatieregels } from '@/lib/everts-calc/local-store'
import { teVerwerken } from '@/lib/everts-calc/meetstaat-verwerken'
import { naarCalculatie, telPerStatus, type VerwerkStatus } from '@/lib/everts-calc/naar-calculatie'
import { calculatieregelOmschrijving } from '@/lib/everts-calc/meetstaat-utils'

const getal = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const LABEL: Record<VerwerkStatus, { tekst: string; tone: 'error' | 'info' | 'warning' | 'success' }> = {
  vervallen: { tekst: 'Vervallen', tone: 'error' },
  nieuw: { tekst: 'Nieuw', tone: 'info' },
  gewijzigd: { tekst: 'Gewijzigd', tone: 'warning' },
  gelijk: { tekst: 'Gelijk', tone: 'success' },
}

const VERSCHIL_KLEUR: Record<VerwerkStatus, string> = {
  vervallen: 'text-error-700', nieuw: 'text-info-700', gewijzigd: 'text-warning-700', gelijk: 'text-neutral-400',
}

/**
 * Wat de meetstaat per code oplevert, naast wat er nu in de calculatie staat.
 * Vervangt de losse labels met ✓ / ●: daaraan zag je niet wát er zou veranderen,
 * en een vervallen code verdween gewoon uit beeld.
 */
export default function NaarCalculatieTabel({ meetstaatId, groepId, groepNaam }: {
  meetstaatId: string
  groepId: string
  groepNaam: string
}) {
  const calcRegels = getCalculatieregels()
  const alle = getMeetregelAggregaten(meetstaatId)
  const openIds = new Set(teVerwerken(alle, new Map(calcRegels.map(r => [r.id, r.hoeveelheid]))).map(a => a.id))
  const hoeveelheidPerRegel = new Map(calcRegels.map(r => [r.id, r.hoeveelheid]))
  const rijen = naarCalculatie(alle.filter(a => a.groep_id === groepId), openIds, hoeveelheidPerRegel)
  // Standaard ingeklapt: de meetregels houden de ruimte, de kop toont de samenvatting
  // (bijv. "2 nieuw · 1 gewijzigd"). Het venster Verwerken laat alles toch nog zien.
  const [open, setOpen] = useState(false)

  if (rijen.length === 0) return null
  const tel = telPerStatus(rijen)
  const samenvatting = (['gelijk', 'nieuw', 'gewijzigd', 'vervallen'] as const)
    .filter(s => tel[s] > 0)
    .map(s => `${tel[s]} ${LABEL[s].tekst.toLowerCase()}`)
    .join(' · ')

  return (
    <section className="flex-shrink-0 rounded-xl border border-neutral-200 bg-white flex flex-col max-h-[40%] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        className={`px-4 py-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-left hover:bg-neutral-50 ${open ? 'border-b border-neutral-200' : ''}`}
      >
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.10em] text-neutral-600">
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
          Naar calculatie · {groepNaam}
        </span>
        {open && <span className="text-xs text-neutral-500">Per code wat de meetstaat oplevert, naast wat er nu in de calculatie staat</span>}
        <span className="ml-auto text-xs text-neutral-600">{samenvatting}</span>
      </button>
      {open && <div className="overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead className="sticky top-0 bg-white">
            <tr className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 border-b border-neutral-200">
              <th className="px-4 py-2 text-left w-28">Status</th>
              <th className="px-2 py-2 text-left w-24">Code</th>
              <th className="px-2 py-2 text-left">Omschrijving</th>
              <th className="px-2 py-2 text-right w-32">Calculatie nu</th>
              <th className="px-2 py-2 text-right w-32">Meetstaat</th>
              <th className="px-4 py-2 text-right w-28">Verschil</th>
            </tr>
          </thead>
          <tbody>
            {rijen.map(({ aggregaat: a, status, nu, wordt, verschil }) => (
              <tr key={a.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-1.5"><Badge tone={LABEL[status].tone} size="sm">{LABEL[status].tekst}</Badge></td>
                <td className="px-2 py-1.5 text-xs font-semibold text-info-700 tabular-nums">{a.bestekcode || '—'}</td>
                <td className="px-2 py-1.5 text-neutral-800">{calculatieregelOmschrijving(a.onderdeel, a.type, a.behandeling)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-neutral-600">
                  {nu === null ? '—' : `${getal(nu)} ${a.eenheid}`}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${status === 'gelijk' ? 'text-neutral-600' : 'font-semibold text-neutral-900'}`}>
                  {getal(wordt)} {a.eenheid}
                </td>
                <td className={`px-4 py-1.5 text-right tabular-nums ${VERSCHIL_KLEUR[status]}`}>
                  {status === 'gelijk' ? '—' : `${verschil > 0 ? '+' : '−'}${getal(Math.abs(verschil))}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>}
    </section>
  )
}
