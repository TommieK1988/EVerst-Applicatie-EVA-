'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { importeerRegels } from '@/app/(platform)/everts-calc/actions/quotes'
import type { Groep, Calculatieregel } from '@/lib/everts-calc/types'
import { isTekstregel } from '@/lib/everts-calc/types'
import { buildNummers, buildStructuur } from '@/lib/everts-calc/import-structuur'

interface Props {
  quoteId: string
  hasSections: boolean
  /** Calculatieproject van deze offerte; bepaalt welke regels geïmporteerd worden. */
  projectId?: string | null
  /** Gekozen calculatieversie; zonder deze wordt de standaardversie gebruikt. */
  scenarioId?: string | null
}

export default function AutoImporter({ quoteId, hasSections, projectId, scenarioId }: Props) {
  const router = useRouter()
  const hasRun = useRef(false)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    // Sla over als offerte al secties heeft
    if (hasSections) return
    if (hasRun.current) return
    hasRun.current = true

    async function doImport() {
      setImporting(true)
      try {
        if (!projectId) return
        const {
          getGroepen, getCalculatieregels, getComponentregels, getScenarios, hydrateCalculatie,
        } = await import('@/lib/everts-calc/local-store')
        const { berekenCalculatieregel } = await import('@/lib/everts-calc/calculations')
        const { laadCalculatieSnapshot } = await import('@/app/(platform)/everts-calc/actions/sync')

        // De calculatie van dít project uit Supabase halen. Vroeger werd geïmporteerd
        // wat er toevallig in deze browser stond — dat kon de calculatie van een
        // heel ander project zijn.
        const snap = await laadCalculatieSnapshot(projectId)
        if (!snap) return
        hydrateCalculatie(projectId, snap)

        const scenarios = getScenarios(projectId)
        const actief = scenarioId
          ? scenarios.find(s => s.id === scenarioId)
          : (scenarios.find(s => s.is_standaard) ?? scenarios[0])
        if (!actief) return

        const alleGroepen: Groep[] = getGroepen(actief.id)
        const groepIds = new Set(alleGroepen.map(g => g.id))
        const alleRegels: Calculatieregel[] = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
        const alleComps = getComponentregels()

        if (alleGroepen.length === 0 || alleRegels.length === 0) {
          return
        }

        const nummers = buildNummers(alleGroepen)
        const DEFAULT_OPSLAG = 18
        const importRegels: Parameters<typeof importeerRegels>[1] = []

        for (const groep of alleGroepen) {
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
              // Tekstregel: de server zet hoeveelheid/prijs/BTW op nul en laat hem
              // buiten de subtotalen. Alleen de omschrijving haalt de offerte.
              soort: isTekstregel(regel) ? 'tekst' : null,
              btw_pct: regel.btw_pct ?? null,
              btw_tarief_id: regel.btw_tarief_id ?? null,
              // Alleen de koppeling; de tekst bevriest de server op dít moment.
              schilderbehandeling_id: regel.schilderbehandeling_id ?? null,
              schilderbehandeling: regel.schilderbehandeling ?? null,
              werkomschrijving_afbeeldingen: regel.werkomschrijving_afbeeldingen ?? null,
            })
          }
        }

        if (importRegels.length > 0) {
          // Structuur incl. lege hoofdstuk-groepen (niveau 1), in outline-volgorde.
          const groepenMetRegels = new Set(importRegels.map(r => r.groep_id))
          const structuur = buildStructuur(alleGroepen, id => groepenMetRegels.has(id), nummers)
          await importeerRegels(quoteId, importRegels, structuur)
          // Refresh pagina zodat nieuwe secties geladen worden
          router.refresh()
        }
      } catch (e) {
        console.error('Auto-import mislukt:', e)
      } finally {
        setImporting(false)
        // Verwijder ?import=1 uit URL indien aanwezig
        const url = new URL(window.location.href)
        if (url.searchParams.has('import')) {
          url.searchParams.delete('import')
          router.replace(url.pathname + (url.search || ''))
        }
      }
    }

    doImport()
  }, [quoteId, hasSections, router])

  if (!importing) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl px-8 py-6 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-3 border-everts border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-700">Calculatie importeren…</p>
      </div>
    </div>
  )
}
