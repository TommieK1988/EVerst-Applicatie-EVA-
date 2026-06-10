'use client'

import { useState } from 'react'
import type { BagPand, Facade, GeoJsonPolygon } from '@/lib/types'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FootprintPreview } from './FootprintPreview'
import { ArrowRight, Compass, Ruler } from 'lucide-react'

interface Props {
  address: string
  pand: { pandId: string; bouwjaar: number; footprint: GeoJsonPolygon }
  facades: Facade[]
  onContinue: (selected: Facade[]) => void
}

export function FacadeSelector({ address, pand, facades, onContinue }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedFacades = facades.filter((f) => selected.has(f.id))

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Welke gevels wil je uitwerken?</CardTitle>
        <CardDescription>
          {address} — pand uit {pand.bouwjaar || 'onbekend jaar'} ({facades.length} gevelvlakken
          gedetecteerd)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 md:grid-cols-[360px_1fr]">
          <div className="flex flex-col items-center gap-2">
            <FootprintPreview
              footprint={pand.footprint}
              facades={facades}
              selectedIds={selected}
              onToggle={toggle}
            />
            <p className="text-center text-xs text-muted-foreground">
              Klik een gevel aan om te selecteren
            </p>
          </div>

          <div className="space-y-2">
            {facades.map((f, i) => {
              const active = selected.has(f.id)
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => toggle(f.id)}
                  className={`w-full rounded-md border p-3 text-left transition-colors ${
                    active
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:bg-accent/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className="font-medium">{f.label}</span>
                      </div>
                      <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Ruler className="h-3 w-3" />
                          {f.widthMeters.toFixed(2)} m breed
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Compass className="h-3 w-3" />
                          {f.orientation.compass} ({Math.round(f.orientation.azimuthDegrees)}°)
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {selected.size === 0
              ? 'Nog geen gevels geselecteerd'
              : `${selected.size} ${selected.size === 1 ? 'gevel' : 'gevels'} geselecteerd`}
          </div>
          <Button
            disabled={selected.size === 0}
            onClick={() => onContinue(selectedFacades)}
          >
            Doorgaan naar tekening
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
