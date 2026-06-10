'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, FileText, Loader2, X } from 'lucide-react'
import { getLayouts } from '@/app/actions/quote-instellingen'
import { getBetalingscondities } from '@/app/actions/betalingscondities'
import { maakQuoteVanuitProjectMetImport } from '@/app/actions/quotes'
import type { QuoteType } from '@/lib/types-quotes'
import type { Groep, Calculatieregel } from '@/lib/types'

interface Props {
  open: boolean
  onClose: () => void
  projectId: string
  projectNaam: string
  clientNaam: string | null
  projectNummer: string | null
  type: QuoteType
}

interface Layout {
  id: string
  naam: string
  beschrijving?: string | null
  is_standaard: boolean
}

/** Bouwt dotted nummering (1, 1.1, 1.1.1) vanuit niveau + volgorde */
function buildNummers(groepen: Groep[]): Map<string, string> {
  const result = new Map<string, string>()
  const n1 = groepen.filter(g => g.niveau === 1).sort((a, b) => a.volgorde - b.volgorde)
  const n2 = groepen.filter(g => g.niveau === 2).sort((a, b) => a.volgorde - b.volgorde)
  const n3 = groepen.filter(g => g.niveau === 3).sort((a, b) => a.volgorde - b.volgorde)
  n1.forEach((g, i) => {
    const num = String(i + 1)
    result.set(g.id, num)
    n2.filter(k => k.parent_id === g.id).forEach((k, j) => {
      const num2 = `${num}.${j + 1}`
      result.set(k.id, num2)
      n3.filter(k3 => k3.parent_id === k.id).forEach((k3, l) => {
        result.set(k3.id, `${num2}.${l + 1}`)
      })
    })
  })
  return result
}

export default function OfferteAanmakenModal({
  open, onClose,
  projectId, projectNaam, clientNaam, projectNummer, type,
}: Props) {
  const router = useRouter()
  const [layouts, setLayouts] = useState<Layout[]>([])
  const [gekozenLayoutId, setGekozenLayoutId] = useState<string | null>(null)
  const [heeftBetalingscondities, setHeeftBetalingscondities] = useState(true)
  const [aantalRegels, setAantalRegels] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [fetchingData, setFetchingData] = useState(false)

  useEffect(() => {
    if (!open) return
    setFetchingData(true)

    Promise.all([getLayouts(), getBetalingscondities()]).then(([lays, bcs]) => {
      setLayouts(lays)
      const standaard = lays.find((l: Layout) => l.is_standaard)
      setGekozenLayoutId(standaard?.id ?? lays[0]?.id ?? null)
      setHeeftBetalingscondities(bcs.length > 0)
      setFetchingData(false)
    }).catch(() => setFetchingData(false))

    // Tel calculatieregels voor dit project (gefilterd op actief scenario)
    import('@/lib/local-store').then(({ getScenarios, getGroepen, getCalculatieregels }) => {
      try {
        const scenarios = getScenarios(projectId)
        const actief = scenarios.find(s => s.is_standaard) ?? scenarios[0]
        const groepen = actief ? getGroepen(actief.id) : getGroepen()
        const count = groepen.reduce((sum, g) => sum + getCalculatieregels(g.id).length, 0)
        setAantalRegels(count)
      } catch {
        setAantalRegels(0)
      }
    })
  }, [open, projectId])

  async function handleAanmaken() {
    setLoading(true)
    try {
      const { getGroepen, getCalculatieregels, getComponentregels, getScenarios } = await import('@/lib/local-store')
      const { berekenCalculatieregel } = await import('@/lib/calculations')

      // Filter op actief scenario van dit project
      const scenarios = getScenarios(projectId)
      const actiefScenario = scenarios.find(s => s.is_standaard) ?? scenarios[0]

      const alleGroepen: Groep[] = actiefScenario ? getGroepen(actiefScenario.id) : getGroepen()
      const alleRegels: Calculatieregel[] = getCalculatieregels()
      const alleComps = getComponentregels()

      const nummers = buildNummers(alleGroepen)
      const DEFAULT_OPSLAG = 18
      const importRegels: Parameters<typeof maakQuoteVanuitProjectMetImport>[0]['importRegels'] = []

      for (const groep of alleGroepen.sort((a, b) => a.volgorde - b.volgorde)) {
        const regelsBijGroep = alleRegels
          .filter(r => r.groep_id === groep.id)
          .sort((a, b) => a.volgorde - b.volgorde)

        if (regelsBijGroep.length === 0) continue

        for (const regel of regelsBijGroep) {
          const comps = alleComps.filter((c: { calculatieregel_id: string }) => c.calculatieregel_id === regel.id)
          const berekend = berekenCalculatieregel(regel, comps, regel.opslag_pct ?? DEFAULT_OPSLAG)

          importRegels.push({
            groep_id: groep.id,
            groep_naam: groep.naam,
            groep_nummer: nummers.get(groep.id) ?? null,
            groep_niveau: groep.niveau,
            groep_optioneel: groep.optioneel ?? false,
            omschrijving: regel.omschrijving,
            hoeveelheid: regel.hoeveelheid,
            eenheid: regel.eenheid,
            eenheidsprijs: +berekend.vp_pe.toFixed(2),
            kostprijs_pe: +berekend.kp_pe.toFixed(2),
            uren_pe: +berekend.uren_pe.toFixed(3),
            calculatieregel_id: regel.id,
            opmerking: regel.werkomschrijving ?? null,
            is_stelpost: regel.is_stelpost ?? false,
          })
        }
      }

      const { id } = await maakQuoteVanuitProjectMetImport({
        projectId,
        projectNaam,
        clientNaam,
        projectNummer,
        type,
        layoutId: gekozenLayoutId,
        importRegels,
      })

      router.push(`/quotes/${id}/preview`)
    } catch (e) {
      console.error('Offerte aanmaken mislukt:', e)
      setLoading(false)
    }
  }

  if (!open) return null

  const titel = type === 'interne_calculatie' ? 'Interne begroting aanmaken' : 'Offerte aanmaken'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{titel}</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[60vh]">

          {/* Betalingscondities waarschuwing */}
          {!heeftBetalingscondities && !fetchingData && (
            <div className="flex gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-medium">Geen betalingscondities ingesteld.</span>{' '}
                <a href="/instellingen/offertes" className="underline hover:text-amber-900">
                  Ga naar Instellingen
                </a>{' '}
                om dit in te stellen.
              </div>
            </div>
          )}

          {/* Lay-out keuze */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lay-out</div>
            {fetchingData ? (
              <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Laden…</span>
              </div>
            ) : layouts.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">Geen lay-outs beschikbaar. Je kunt later een lay-out kiezen.</p>
            ) : (
              <div className="space-y-2">
                {layouts.map(layout => (
                  <button
                    key={layout.id}
                    onClick={() => setGekozenLayoutId(layout.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                      gekozenLayoutId === layout.id
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      gekozenLayoutId === layout.id ? 'bg-emerald-500' : 'bg-slate-100'
                    }`}>
                      {gekozenLayoutId === layout.id
                        ? <Check className="w-3.5 h-3.5 text-white" />
                        : <FileText className="w-3.5 h-3.5 text-slate-400" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{layout.naam}</div>
                      {layout.beschrijving && (
                        <div className="text-xs text-slate-500 truncate">{layout.beschrijving}</div>
                      )}
                    </div>
                    {layout.is_standaard && (
                      <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full flex-shrink-0">
                        standaard
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Calculatieregels info */}
          {aantalRegels !== null && (
            <div className="flex items-center gap-2 text-sm text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5">
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
              {aantalRegels === 0
                ? 'Geen calculatieregels gevonden — je kunt ze later handmatig toevoegen.'
                : `${aantalRegels} calculatieregel${aantalRegels !== 1 ? 's' : ''} worden geïmporteerd.`
              }
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <button
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
          >
            Annuleren
          </button>
          <button
            onClick={handleAanmaken}
            disabled={loading || fetchingData}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-60"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Aanmaken…' : 'Aanmaken'}
          </button>
        </div>
      </div>
    </div>
  )
}
