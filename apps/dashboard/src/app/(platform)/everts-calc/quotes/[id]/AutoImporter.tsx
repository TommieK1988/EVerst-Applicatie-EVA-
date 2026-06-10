'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { importeerRegels } from '@/app/(platform)/everts-calc/actions/quotes'
import type { Groep, Calculatieregel } from '@/lib/everts-calc/types'

interface Props {
  quoteId: string
  hasSections: boolean
}

/** Bouwt dotted nummering (1, 1.1, 1.1.1) vanuit niveau + volgorde */
function buildNummers(groepen: Groep[]): Map<string, string> {
  const result = new Map<string, string>()

  const niveau1 = groepen.filter(g => g.niveau === 1).sort((a, b) => a.volgorde - b.volgorde)
  const niveau2 = groepen.filter(g => g.niveau === 2).sort((a, b) => a.volgorde - b.volgorde)
  const niveau3 = groepen.filter(g => g.niveau === 3).sort((a, b) => a.volgorde - b.volgorde)

  niveau1.forEach((g, i) => {
    const num = String(i + 1)
    result.set(g.id, num)

    niveau2.filter(k => k.parent_id === g.id).forEach((k, j) => {
      const num2 = `${num}.${j + 1}`
      result.set(k.id, num2)

      niveau3.filter(k3 => k3.parent_id === k.id).forEach((k3, l) => {
        result.set(k3.id, `${num2}.${l + 1}`)
      })
    })
  })

  return result
}

export default function AutoImporter({ quoteId, hasSections }: Props) {
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
        const { getGroepen, getCalculatieregels, getComponentregels } = await import('@/lib/everts-calc/local-store')
        const { berekenCalculatieregel } = await import('@/lib/everts-calc/calculations')

        const alleGroepen: Groep[] = getGroepen()
        const alleRegels: Calculatieregel[] = getCalculatieregels()
        const alleComps = getComponentregels()

        if (alleGroepen.length === 0 || alleRegels.length === 0) {
          return
        }

        const nummers = buildNummers(alleGroepen)
        const DEFAULT_OPSLAG = 18
        const importRegels: Parameters<typeof importeerRegels>[1] = []

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
              btw_pct: regel.btw_pct ?? null,
              schilderbehandeling: regel.schilderbehandeling ?? null,
            })
          }
        }

        if (importRegels.length > 0) {
          await importeerRegels(quoteId, importRegels)
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
