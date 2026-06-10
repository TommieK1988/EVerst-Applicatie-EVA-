'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { AddressAutocomplete } from '@/components/AddressAutocomplete'
import { FacadeSelector } from '@/components/FacadeSelector'
import { FacadeEditor } from '@/components/FacadeEditor'
import { Button } from '@/components/ui/button'
import type { Facade, FacadeElement, GeoJsonPolygon } from '@/lib/types'
import { Loader2, Building2, ChevronRight, ArrowLeft } from 'lucide-react'

interface BuildingData {
  address: { weergavenaam: string }
  pand: { pandId: string; bouwjaar: number; status: string; footprint: GeoJsonPolygon }
  facades: Facade[]
}

function slugifyAddress(weergavenaam: string): string {
  return weergavenaam
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40)
}

type Step = 'address' | 'facades' | 'editor'

export default function HomePage() {
  const [loading, setLoading] = useState(false)
  const [building, setBuilding] = useState<BuildingData | null>(null)
  const [selectedFacades, setSelectedFacades] = useState<Facade[] | null>(null)
  const [activeFacadeId, setActiveFacadeId] = useState<string | null>(null)
  const [elementsByFacadeId, setElementsByFacadeId] = useState<Record<string, FacadeElement[]>>({})

  const step: Step = selectedFacades && activeFacadeId ? 'editor' : building ? 'facades' : 'address'

  async function handleAddressSelect(id: string) {
    setLoading(true)
    setBuilding(null)
    setSelectedFacades(null)
    setActiveFacadeId(null)
    setElementsByFacadeId({})
    try {
      const res = await fetch(`/api/building?id=${encodeURIComponent(id)}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Kon gebouw niet laden')
      }
      const data = await res.json()
      setBuilding(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Onbekende fout'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  function resetAll() {
    setBuilding(null)
    setSelectedFacades(null)
    setActiveFacadeId(null)
    setElementsByFacadeId({})
  }

  const activeFacade = selectedFacades?.find((f) => f.id === activeFacadeId) ?? null

  return (
    <div className="h-full">
      {/* Stap-indicator balk */}
      <div className="border-b bg-white px-4 sm:px-6 py-3 flex items-center gap-3 text-sm overflow-x-auto">
        <StepBadge index={1} label="Werkadres" active={step === 'address'} done={step !== 'address'} onClick={resetAll} />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <StepBadge
          index={2}
          label="Gevels selecteren"
          active={step === 'facades'}
          done={step === 'editor'}
          onClick={() => {
            setSelectedFacades(null)
            setActiveFacadeId(null)
          }}
          disabled={!building}
        />
        <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <StepBadge index={3} label="Tekening" active={step === 'editor'} done={false} disabled={!selectedFacades} />
        {building && step === 'facades' && (
          <Button variant="ghost" size="sm" className="ml-auto" onClick={resetAll}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            Ander adres
          </Button>
        )}
      </div>

      <div className="p-4 sm:p-6">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Gebouwgegevens ophalen...
          </div>
        )}

        {step === 'address' && !loading && (
          <div className="max-w-2xl mx-auto pt-12">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-everts text-white">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-slate-800">Nieuwe geveltekening</h2>
                <p className="text-sm text-muted-foreground">
                  Start met een werkadres; gebouwgegevens komen uit PDOK BAG + 3D BAG (TU Delft).
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-white p-5 shadow-sm">
              <AddressAutocomplete onSelect={(s) => handleAddressSelect(s.id)} />
            </div>
          </div>
        )}

        {step === 'facades' && building && (
          <FacadeSelector
            address={building.address.weergavenaam}
            pand={building.pand}
            facades={building.facades}
            onContinue={(sel) => {
              setSelectedFacades(sel)
              setActiveFacadeId(sel[0]?.id ?? null)
            }}
          />
        )}

        {step === 'editor' && selectedFacades && activeFacade && (
          <div className="space-y-4">
            {selectedFacades.length > 1 && (
              <div className="flex flex-wrap gap-2">
                {selectedFacades.map((f) => (
                  <Button
                    key={f.id}
                    size="sm"
                    variant={f.id === activeFacadeId ? 'default' : 'outline'}
                    onClick={() => setActiveFacadeId(f.id)}
                  >
                    {f.label}
                  </Button>
                ))}
              </div>
            )}
            <FacadeEditor
              key={activeFacade.id}
              facade={activeFacade}
              onBack={() => {
                setSelectedFacades(null)
                setActiveFacadeId(null)
              }}
              addressLine={building?.address.weergavenaam}
              addressSlug={building ? slugifyAddress(building.address.weergavenaam) : undefined}
              pandId={building?.pand.pandId}
              bouwjaar={building?.pand.bouwjaar}
              selectedFacades={selectedFacades}
              elementsByFacadeId={elementsByFacadeId}
              onElementsChange={(facadeId, els) =>
                setElementsByFacadeId((prev) => ({ ...prev, [facadeId]: els }))
              }
            />
          </div>
        )}
      </div>
    </div>
  )
}

interface StepBadgeProps {
  index: number
  label: string
  active: boolean
  done: boolean
  onClick?: () => void
  disabled?: boolean
}

function StepBadge({ index, label, active, done, onClick, disabled }: StepBadgeProps) {
  const clickable = !!onClick && !disabled && !active
  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`flex items-center gap-2 px-2.5 py-1 rounded-md transition-colors flex-shrink-0 ${
        active
          ? 'bg-everts/10 text-everts-dark font-semibold'
          : done
          ? 'text-slate-600 hover:bg-slate-100'
          : 'text-slate-400'
      } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
    >
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold ${
          active
            ? 'bg-everts text-white'
            : done
            ? 'bg-everts-light text-white'
            : 'bg-slate-200 text-slate-500'
        }`}
      >
        {done ? '✓' : index}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}
