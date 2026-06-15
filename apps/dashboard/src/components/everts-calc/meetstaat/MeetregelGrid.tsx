'use client'

import { useState, useEffect, useCallback } from 'react'
import type { Meetregel, Groep } from '@/lib/everts-calc/types'
import {
  getMeetregels, slaMeetregelOp, verwijderMeetregel,
  getMeetregelAggregaten,
} from '@/lib/everts-calc/local-store'
import { nieuweId } from '@/lib/everts-calc/utils'
import {
  berekenHoeveelheid, isRegelActief, aggregaatSleutel, herberekeningAggregaat,
  calculatieregelOmschrijving,
} from '@/lib/everts-calc/meetstaat-utils'
import MeetregelRij from './MeetregelRij'

interface SchilderData {
  onderdelen: { id: string; naam: string; code: string | null }[]
  types: { id: string; onderdeel_id: string; naam: string; eenheid: string; formule: string | null; code: string | null }[]
  behandelingen: { id: string; naam: string; code: string | null }[]
  combinaties: { id: string; onderdeel_id: string; type_id: string; behandeling_id: string }[]
}

interface Props {
  meetstaatId: string
  groepId: string
  groepen: Groep[]
  onWijziging?: () => void
  schilderData?: SchilderData
}

function nieuweLegeRegel(meetstaatId: string, groepId: string, volgorde: number): Meetregel {
  return {
    id: nieuweId(),
    meetstaat_id: meetstaatId,
    groep_id: groepId,
    volgorde,
    aantal: 1,
    eenheid: 'm²',
    is_leeg: true,
    aangepast_op: new Date().toISOString(),
  }
}

export default function MeetregelGrid({ meetstaatId, groepId, groepen, onWijziging, schilderData }: Props) {
  const [regels, setRegels] = useState<Meetregel[]>([])
  const [actieveId, setActieveId] = useState<string | null>(null)
  const groep = groepen.find(g => g.id === groepId)

  // Laad regels voor deze groep
  useEffect(() => {
    const opgeslagen = getMeetregels(meetstaatId).filter(r => r.groep_id === groepId)
    const sorted = opgeslagen.sort((a, b) => a.volgorde - b.volgorde)
    // Voeg altijd een lege rij toe aan het einde
    const legeRij = nieuweLegeRegel(meetstaatId, groepId, (sorted[sorted.length - 1]?.volgorde ?? 0) + 10)
    setRegels([...sorted, legeRij])
    // Zet focus op eerste lege rij
    setActieveId(legeRij.id)
  }, [meetstaatId, groepId])

  // Zorg dat er altijd precies 1 lege rij aan het einde staat
  const ensureLegeRij = useCallback((huidigeRegels: Meetregel[]) => {
    const heeftLege = huidigeRegels.some(r => r.is_leeg)
    if (!heeftLege) {
      const max = Math.max(...huidigeRegels.map(r => r.volgorde), 0)
      const nieuw = nieuweLegeRegel(meetstaatId, groepId, max + 10)
      return [...huidigeRegels, nieuw]
    }
    return huidigeRegels
  }, [meetstaatId, groepId])

  const onWijzig = useCallback((id: string, patch: Partial<Meetregel>) => {
    setRegels(prev => {
      const bijgewerkt = prev.map(r => {
        if (r.id !== id) return r
        const nieuw = { ...r, ...patch, is_leeg: false }

        // Debounced opslaan
        clearTimeout((nieuw as any)._saveTimer)
        ;(nieuw as any)._saveTimer = setTimeout(() => {
          if (!nieuw.is_leeg) {
            slaMeetregelOp(nieuw)
            // Herbereken aggregaat
            const oudSleutel = aggregaatSleutel(r)
            const nieuwSleutel = aggregaatSleutel(nieuw)
            if (oudSleutel) herberekeningAggregaat(meetstaatId, oudSleutel)
            if (nieuwSleutel && nieuwSleutel !== oudSleutel) herberekeningAggregaat(meetstaatId, nieuwSleutel)
            onWijziging?.()
          }
        }, 500)

        return nieuw
      })

      return ensureLegeRij(bijgewerkt)
    })
  }, [meetstaatId, ensureLegeRij])

  const onEnter = useCallback((id: string) => {
    setRegels(prev => {
      const idx = prev.findIndex(r => r.id === id)
      if (idx === -1) return prev

      const regel = prev[idx]

      // Sla op als actief
      if (isRegelActief(regel)) {
        const definitief = { ...regel, is_leeg: false }
        slaMeetregelOp(definitief)
        const sleutel = aggregaatSleutel(definitief)
        if (sleutel) herberekeningAggregaat(meetstaatId, sleutel)
        onWijziging?.()

        const bijgewerkt = prev.map(r => r.id === id ? definitief : r)
        const metLege = ensureLegeRij(bijgewerkt)

        // Behandeling overnemen van huidige regel in nieuwe lege rij
        const resultaat = regel.behandeling_id
          ? metLege.map(r =>
              r.is_leeg
                ? { ...r, behandeling_id: regel.behandeling_id, behandeling: regel.behandeling }
                : r
            )
          : metLege

        // Focus volgende (lege) rij
        const volgende = resultaat[idx + 1] ?? resultaat[resultaat.length - 1]
        setTimeout(() => setActieveId(volgende?.id ?? null), 0)

        return resultaat
      }
      return prev
    })
  }, [meetstaatId, ensureLegeRij, onWijziging])

  const onVerwijder = useCallback((id: string) => {
    setRegels(prev => {
      const regel = prev.find(r => r.id === id)
      if (regel && !regel.is_leeg) {
        verwijderMeetregel(id)
        const sleutel = aggregaatSleutel(regel)
        if (sleutel) herberekeningAggregaat(meetstaatId, sleutel)
        onWijziging?.()
      }
      const gefilterd = prev.filter(r => r.id !== id)
      return ensureLegeRij(gefilterd)
    })
  }, [meetstaatId, ensureLegeRij, onWijziging])

  const actieveRegels = regels.filter(r => !r.is_leeg && isRegelActief(r))
  const totaalHoeveelheid = actieveRegels.reduce((s, r) => s + berekenHoeveelheid(r), 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Groepheader */}
      <div className="flex-shrink-0 px-4 py-2.5 bg-white border-b border-slate-200 flex items-center gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-slate-800">{groep?.naam ?? 'Groep'}</h2>
          <p className="text-xs text-slate-400">
            {actieveRegels.length} {actieveRegels.length === 1 ? 'meetregel' : 'meetregels'}
            {totaalHoeveelheid > 0 && ` · totaal ${totaalHoeveelheid.toFixed(2)} m²`}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '960px' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-[11px] text-slate-500 uppercase tracking-wide">
              <th className="w-8 px-2 py-2 text-center font-medium">#</th>
              <th className="min-w-[160px] px-2 py-2 text-left font-medium">Onderdeel</th>
              <th className="min-w-[140px] px-2 py-2 text-left font-medium">Type</th>
              <th className="min-w-[200px] px-2 py-2 text-left font-medium">Behandeling</th>
              <th className="w-16 px-1 py-2 text-right font-medium text-blue-500">B (m)</th>
              <th className="w-16 px-1 py-2 text-right font-medium text-blue-500">H (m)</th>
              <th className="w-16 px-1 py-2 text-right font-medium text-blue-400">L (m)</th>
              <th className="w-14 px-1 py-2 text-right font-medium">Aant.</th>
              <th className="w-20 px-2 py-2 text-right font-medium text-everts">Hoev.</th>
              <th className="w-12 px-1 py-2 text-center font-medium">Eenh.</th>
              <th className="min-w-[160px] px-2 py-2 text-left font-medium">Omschrijving</th>
              <th className="w-7 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {regels.map((r, i) => (
              <MeetregelRij
                key={r.id}
                regel={r}
                volgnummer={i + 1}
                isActief={r.id === actieveId}
                onFocus={() => setActieveId(r.id)}
                onWijzig={patch => onWijzig(r.id, patch)}
                onEnter={() => onEnter(r.id)}
                onVerwijder={() => onVerwijder(r.id)}
                schilderData={schilderData}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Subtotalen per aggregaat */}
      {actieveRegels.length > 0 && (
        <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2">
          <p className="text-xs font-semibold text-slate-500 mb-1.5">Aggregaten voor calculatie:</p>
          <AggregatenOverzicht meetstaatId={meetstaatId} groepId={groepId} />
        </div>
      )}
    </div>
  )
}

function AggregatenOverzicht({ meetstaatId, groepId }: { meetstaatId: string; groepId: string }) {
  const aggregaten = getMeetregelAggregaten(meetstaatId).filter(
    (a) => a.groep_id === groepId && a.totaal_hoeveelheid > 0
  )

  if (aggregaten.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {aggregaten.map((agg) => (
        <div key={agg.id} className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
          <span className="text-slate-600">{calculatieregelOmschrijving(agg.onderdeel, agg.type, agg.behandeling)}</span>
          <span className=" font-semibold text-everts">{agg.totaal_hoeveelheid.toFixed(2)} {agg.eenheid}</span>
          {agg.is_gesynchroniseerd && <span className="text-green-500">✓</span>}
          {!agg.is_gesynchroniseerd && <span className="text-amber-400">●</span>}
        </div>
      ))}
    </div>
  )
}
