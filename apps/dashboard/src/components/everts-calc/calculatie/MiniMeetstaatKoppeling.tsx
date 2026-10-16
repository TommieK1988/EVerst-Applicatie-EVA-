'use client'

// Bovenkant van de mini-meetstaat: een meting uit een andere regel van deze calculatie
// overnemen, en zien met welke regels deze meting gedeeld is. Logica:
// lib/everts-calc/mini-meetstaat-koppeling.ts.

import { useState } from 'react'
import { Link2, Unlink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FormField } from '@/components/ui/form-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { MetingKeuze } from '@/lib/everts-calc/mini-meetstaat-koppeling'

const kort = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

/** "Gevelvlak voorgevel · 412,8 bruto / 320,4 netto m²", of zonder aftrek "Dak · 284 m²". */
export function keuzeLabel(k: MetingKeuze): string {
  const eenh = k.meting.eenheid
  return k.heeftAftrek
    ? `${k.naam} · ${kort(k.bruto)} bruto / ${kort(k.netto)} netto ${eenh}`
    : `${k.naam} · ${kort(k.bruto)} ${eenh}`
}

const regelsTekst = (n: number) => `${n} andere ${n === 1 ? 'regel' : 'regels'}`

export function MetingKoppeling({ keuzes, gedeeldMet, onKies, onOntkoppel }: {
  keuzes: MetingKeuze[]
  /** Omschrijvingen van de andere regels met deze meting; leeg = niet gekoppeld. */
  gedeeldMet: string[]
  onKies: (k: MetingKeuze) => void
  onOntkoppel: () => void
}) {
  // De lijst is een actie, geen waarde: na een keuze staat hij weer op de placeholder.
  const [herstart, setHerstart] = useState(0)
  if (keuzes.length === 0 && gedeeldMet.length === 0) return null

  return (
    <div className="flex flex-col gap-3">
      {keuzes.length > 0 && (
        <FormField label="Gemeten in deze calculatie" upper htmlFor="mini-meetstaat-keuze">
          <Select
            key={herstart}
            onValueChange={sleutel => {
              const k = keuzes.find(x => x.sleutel === sleutel)
              if (k) onKies(k)
              setHerstart(n => n + 1)
            }}
          >
            <SelectTrigger id="mini-meetstaat-keuze" className="[&>span]:truncate">
              <SelectValue placeholder="Overnemen uit een andere regel…" />
            </SelectTrigger>
            <SelectContent>
              {keuzes.map(k => (
                <SelectItem key={k.sleutel} value={k.sleutel} title={`Gemeten bij: ${k.regels.join(', ')}`}>
                  {keuzeLabel(k)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      )}

      {gedeeldMet.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2">
          <Link2 className="h-4 w-4 shrink-0 text-brand-700" aria-hidden />
          <Badge tone="brand" variant="outline" title={gedeeldMet.join('\n')}>
            Gedeeld met {regelsTekst(gedeeldMet.length)}
          </Badge>
          <span className="min-w-0 flex-1 truncate text-xs text-neutral-600" title={gedeeldMet.join('\n')}>
            {gedeeldMet.join(' · ')}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onOntkoppel}
            title="Alleen deze regel loskoppelen; de maten blijven hier als losse kopie staan"
          >
            <Unlink className="h-3.5 w-3.5" />
            Ontkoppelen
          </Button>
        </div>
      )}
    </div>
  )
}
