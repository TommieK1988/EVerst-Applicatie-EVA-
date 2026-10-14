'use client'

/**
 * Objectkiezer in het aanvraagformulier: kies een VvE/complex en het adres, de
 * opdrachtgever en de VvE-code komen mee. Puur voorinvullen — het object legt niets
 * vast wat je daarna niet meer kunt wijzigen.
 */

import React, { useEffect, useState } from 'react'
import type { VastgoedObject } from '@everts/database'
import { objectAdresRegel } from '@/lib/objecten/adres'
import { zoekObjecten, getObjectOpdrachtgeverNaam } from '@/lib/objecten/data'
import { Building2, Loader2, Search } from 'lucide-react'
import { Button, FormField, Input } from '@/components/ui'

type Props = {
  gekozen: VastgoedObject | null
  /** Krijgt het object plus de naam van de standaard-opdrachtgever (voor het klantveld). */
  onKies: (object: VastgoedObject, opdrachtgeverNaam: string | null) => void
  onWis: () => void
}

export default function ObjectVoorinvullen({ gekozen, onKies, onWis }: Props) {
  const [term, setTerm] = useState('')
  const [resultaten, setResultaten] = useState<VastgoedObject[]>([])
  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Debounce, anders vuurt elke toetsaanslag een server-action af.
  useEffect(() => {
    if (gekozen || !term.trim()) { setResultaten([]); return }
    let afgebroken = false
    setBezig(true)
    const t = setTimeout(async () => {
      try {
        const res = await zoekObjecten(term)
        if (!afgebroken) { setResultaten(res); setOpen(res.length > 0) }
      } finally {
        if (!afgebroken) setBezig(false)
      }
    }, 250)
    return () => { afgebroken = true; clearTimeout(t) }
  }, [term, gekozen])

  // Buiten de combobox klikken sluit de lijst.
  useEffect(() => {
    function bijKlik(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', bijKlik)
    return () => document.removeEventListener('mousedown', bijKlik)
  }, [])

  async function kies(o: VastgoedObject) {
    setOpen(false)
    setResultaten([])
    setTerm('')
    // Naam van de opdrachtgever apart ophalen: het klantveld toont een naam, niet een id.
    let naam: string | null = null
    if (o.standaard_opdrachtgever_id) {
      naam = await getObjectOpdrachtgeverNaam(o.id).catch(() => null)
    }
    onKies(o, naam)
  }

  if (gekozen) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-3">
          <Building2 className="h-4 w-4 shrink-0 text-brand-700" />
          <div className="min-w-0">
            <div className="truncate text-[13px] font-semibold text-neutral-900">{gekozen.naam}</div>
            <div className="truncate text-xs text-neutral-600">
              {gekozen.objectnummer}
              {objectAdresRegel(gekozen) ? ` · ${objectAdresRegel(gekozen)}` : ''}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onWis}>Losmaken</Button>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <FormField>
        <Input
          value={term}
          onChange={e => setTerm(e.target.value)}
          onFocus={() => resultaten.length > 0 && setOpen(true)}
          placeholder="Zoek een VvE, complex of pand — bv. Complex 1013 of HW1013"
          prefix={<Search className="h-4 w-4" />}
          suffix={bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        />
      </FormField>

      {open && resultaten.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-60 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-[0_12px_24px_-6px_rgba(16,24,40,0.18),0_4px_6px_-2px_rgba(16,24,40,0.06)]">
          {resultaten.map(o => (
            <button
              key={o.id} type="button" onClick={() => kies(o)}
              className="block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-brand-50"
            >
              <div className="truncate text-[13px] font-semibold text-neutral-900">{o.naam}</div>
              <div className="truncate text-xs text-neutral-500">
                {o.objectnummer}{objectAdresRegel(o) ? ` · ${objectAdresRegel(o)}` : ''}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
