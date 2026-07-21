'use client'

import { useState, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  Loader2, Save, Camera, Search, X, ChevronDown,
  Euro, Clock, Package, Calculator
} from 'lucide-react'
import { registratieSchema, type RegistratieFormValues } from '@/lib/houtrotherstel/validations'
import { createRegistratie } from '@/services/houtrotherstel/registraties'
import { formatCurrency, formatNumber } from '@/lib/houtrotherstel/utils'
import FotoUpload from '@/components/houtrotherstel/registraties/FotoUpload'
import { ONDERDEEL_TYPEN, GEVEL_ZIJDEN } from '@/lib/houtrotherstel/types'

interface RegistratieFormulierProps {
  userId: string
  projecten: Array<{ id: string; name: string; project_number: string }>
  standaardReparaties: Array<{
    id: string; code: string; name: string; category: string
    labor_hours: number; labor_rate: number; labor_cost: number
    material_cost: number; cost_price: number; sale_price: number
    description: string | null
  }>
  defaultProjectId?: string
  registratieId?: string // voor bewerken
}

export default function RegistratieFormulier({
  userId,
  projecten,
  standaardReparaties,
  defaultProjectId,
  registratieId,
}: RegistratieFormulierProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [newRegistrationId, setNewRegistrationId] = useState<string | null>(null)
  const [reparatieZoek, setReparatieZoek] = useState('')
  const [showReparatieDropdown, setShowReparatieDropdown] = useState(false)
  const [selectedReparatie, setSelectedReparatie] = useState<typeof standaardReparaties[0] | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegistratieFormValues>({
    resolver: zodResolver(registratieSchema),
    defaultValues: {
      project_id: defaultProjectId || '',
      registration_date: new Date().toISOString().split('T')[0],
      status: 'open',
      control_status: 'niet_gecontroleerd',
    },
  })

  const watchedValues = watch([
    'labor_hours_snapshot', 'labor_rate_snapshot',
    'material_cost_snapshot', 'actual_labor_hours',
    'actual_material_cost', 'actual_sale_price', 'sale_price_snapshot'
  ])

  // Automatisch berekenen kostprijs
  const laborCost = (watchedValues[0] || 0) * (watchedValues[1] || 0)
  const costPrice = laborCost + (watchedValues[2] || 0)
  const actualLaborCost = (watchedValues[3] || 0) * (watchedValues[1] || 0)
  const actualCostPrice = actualLaborCost + (watchedValues[4] || 0)
  const marge = ((watchedValues[5] || watchedValues[6] || 0) - costPrice)

  // Standaard reparatie selecteren
  const selectReparatie = (reparatie: typeof standaardReparaties[0]) => {
    setSelectedReparatie(reparatie)
    setValue('standard_repair_id', reparatie.id)
    setValue('labor_hours_snapshot', reparatie.labor_hours)
    setValue('labor_rate_snapshot', reparatie.labor_rate)
    setValue('labor_cost_snapshot', reparatie.labor_cost)
    setValue('material_cost_snapshot', reparatie.material_cost)
    setValue('cost_price_snapshot', reparatie.cost_price)
    setValue('sale_price_snapshot', reparatie.sale_price)
    setValue('repair_code_snapshot', reparatie.code)
    setValue('repair_name_snapshot', reparatie.name)
    setValue('repair_description_snapshot', reparatie.description || '')
    if (reparatie.description) {
      setValue('custom_work_description', reparatie.description)
    }
    setShowReparatieDropdown(false)
    setReparatieZoek('')
  }

  const clearReparatie = () => {
    setSelectedReparatie(null)
    setValue('standard_repair_id', '')
    setValue('labor_hours_snapshot', undefined)
    setValue('labor_rate_snapshot', undefined)
    setValue('labor_cost_snapshot', undefined)
    setValue('material_cost_snapshot', undefined)
    setValue('cost_price_snapshot', undefined)
    setValue('sale_price_snapshot', undefined)
    setValue('repair_code_snapshot', '')
    setValue('repair_name_snapshot', '')
    setValue('repair_description_snapshot', '')
  }

  const gefilterdeReparaties = standaardReparaties.filter(r =>
    !reparatieZoek ||
    r.name.toLowerCase().includes(reparatieZoek.toLowerCase()) ||
    r.code.toLowerCase().includes(reparatieZoek.toLowerCase()) ||
    r.category.toLowerCase().includes(reparatieZoek.toLowerCase())
  )

  // Groepeer per categorie
  const reparatiesPerCategorie = gefilterdeReparaties.reduce((acc, r) => {
    if (!acc[r.category]) acc[r.category] = []
    acc[r.category].push(r)
    return acc
  }, {} as Record<string, typeof standaardReparaties>)

  const onSubmit = async (data: RegistratieFormValues, action: 'save' | 'save_new' | 'save_view' = 'save_view') => {
    setIsLoading(true)
    try {
      const result = await createRegistratie(
        {
          ...data,
          standard_repair_id: data.standard_repair_id || undefined,
        },
        userId
      )

      toast.success('Registratie opgeslagen')
      setNewRegistrationId(result.id)

      if (action === 'save_new') {
        router.push('/houtrotherstel/registraties/nieuw' + (defaultProjectId ? `?project=${defaultProjectId}` : ''))
      } else if (action === 'save_view') {
        router.push(`/houtrotherstel/registraties/${result.id}`)
      }
    } catch (error: any) {
      toast.error(error.message || 'Er is een fout opgetreden')
    } finally {
      setIsLoading(false)
    }
  }

  const inputClass = (hasError?: boolean) =>
    `w-full px-3 py-2.5 border rounded-lg text-sm transition-colors
    focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts
    ${hasError ? 'border-red-300 bg-red-50' : 'border-slate-300 hover:border-slate-400'}`

  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
  const errorClass = 'mt-1 text-xs text-red-600'
  const sectionClass = 'bg-white rounded-xl border border-slate-200 p-5 sm:p-6 space-y-4'

  return (
    <form className="space-y-5">
      {/* SECTIE 1: Project en locatie */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-everts-100 text-everts rounded-full flex items-center justify-center text-xs font-bold">1</div>
          <h2 className="font-semibold text-slate-800">Project en locatie</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Project *</label>
            <select
              {...register('project_id')}
              className={inputClass(!!errors.project_id)}
            >
              <option value="">Selecteer project...</option>
              {projecten.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (#{p.project_number})
                </option>
              ))}
            </select>
            {errors.project_id && <p className={errorClass}>{errors.project_id.message}</p>}
          </div>

          <div>
            <label className={labelClass}>Registratiedatum *</label>
            <input
              type="date"
              {...register('registration_date')}
              className={inputClass(!!errors.registration_date)}
            />
            {errors.registration_date && <p className={errorClass}>{errors.registration_date.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Blok / Bouwdeel</label>
            <input {...register('location_block')} className={inputClass()} placeholder="Blok A" />
          </div>
          <div>
            <label className={labelClass}>Verdieping</label>
            <input {...register('floor')} className={inputClass()} placeholder="2e verdieping" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <label className={labelClass}>Woning / Ruimte</label>
            <input {...register('room_or_unit')} className={inputClass()} placeholder="Woning 12" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className={labelClass}>Gevelzijde</label>
            <select {...register('facade_side')} className={inputClass()}>
              <option value="">Selecteer...</option>
              {GEVEL_ZIJDEN.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Onderdeeltype</label>
            <select {...register('component_type')} className={inputClass()}>
              <option value="">Selecteer...</option>
              {ONDERDEEL_TYPEN.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Elementnummer</label>
            <input {...register('element_number')} className={inputClass()} placeholder="K-03" />
          </div>
        </div>
      </div>

      {/* SECTIE 2: Schade informatie */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center text-xs font-bold">2</div>
          <h2 className="font-semibold text-slate-800">Schade-informatie</h2>
        </div>

        <div>
          <label className={labelClass}>Omschrijving schade</label>
          <textarea
            {...register('damage_description')}
            rows={3}
            className={inputClass()}
            placeholder="Beschrijf de schade..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Ernst van de schade</label>
            <select {...register('damage_severity')} className={inputClass()}>
              <option value="">Selecteer ernst...</option>
              <option value="licht">Licht</option>
              <option value="matig">Matig</option>
              <option value="ernstig">Ernstig</option>
              <option value="kritiek">Kritiek</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Oorzaak (indien bekend)</label>
            <input {...register('damage_cause')} className={inputClass()} placeholder="Bijv. houtrot door vochtigheid" />
          </div>
        </div>
      </div>

      {/* SECTIE 3: Standaard reparatie */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs font-bold">3</div>
          <h2 className="font-semibold text-slate-800">Standaard reparatie</h2>
        </div>

        {/* Reparatie zoeken */}
        <div className="relative" ref={dropdownRef}>
          {selectedReparatie ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-green-800 text-sm">{selectedReparatie.name}</div>
                <div className="text-xs text-green-600">{selectedReparatie.code} · {selectedReparatie.category}</div>
              </div>
              <button
                type="button"
                onClick={clearReparatie}
                className="text-green-600 hover:text-green-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Zoek standaard reparatie op naam, code of categorie..."
                  value={reparatieZoek}
                  onChange={(e) => {
                    setReparatieZoek(e.target.value)
                    setShowReparatieDropdown(true)
                  }}
                  onFocus={() => setShowReparatieDropdown(true)}
                  className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              </div>

              {showReparatieDropdown && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowReparatieDropdown(false)}
                  />
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200
                    rounded-xl shadow-lg max-h-72 overflow-y-auto">
                    {Object.entries(reparatiesPerCategorie).length === 0 ? (
                      <div className="p-4 text-sm text-slate-400 text-center">
                        Geen reparaties gevonden
                      </div>
                    ) : (
                      Object.entries(reparatiesPerCategorie).map(([category, reparaties]) => (
                        <div key={category}>
                          <div className="px-3 py-2 text-xs font-semibold text-slate-400 bg-slate-50 sticky top-0">
                            {category}
                          </div>
                          {reparaties.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => selectReparatie(r)}
                              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-everts-50
                                transition-colors text-left border-b border-slate-100 last:border-0"
                            >
                              <div>
                                <div className="text-sm font-medium text-slate-800">{r.name}</div>
                                <div className="text-xs text-slate-400">{r.code}</div>
                              </div>
                              <div className="text-sm font-medium text-slate-700 ml-4">
                                {formatCurrency(r.sale_price)}
                              </div>
                            </button>
                          ))}
                        </div>
                      ))
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* SECTIE 4: Arbeid en materiaal */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-bold">4</div>
          <h2 className="font-semibold text-slate-800">Arbeid en materiaal</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Standaard (normatief) */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Normatief (uit standaard reparatie)
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Uren
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    {...register('labor_hours_snapshot', { valueAsNumber: true })}
                    className={inputClass()}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Euro className="w-3 h-3" /> Tarief/uur
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('labor_rate_snapshot', { valueAsNumber: true })}
                    className={inputClass()}
                    placeholder="0.00"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                    <Package className="w-3 h-3" /> Materiaal
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('material_cost_snapshot', { valueAsNumber: true })}
                    className={inputClass()}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Verkoopprijs</label>
                  <input
                    type="number"
                    step="0.01"
                    {...register('sale_price_snapshot', { valueAsNumber: true })}
                    className={inputClass()}
                    placeholder="0.00"
                  />
                </div>
              </div>
              {(watchedValues[0] || watchedValues[2]) ? (
                <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1">
                  <div className="flex justify-between text-slate-500">
                    <span>Arbeidskosten</span>
                    <span>{formatCurrency(laborCost)}</span>
                  </div>
                  <div className="flex justify-between text-slate-500">
                    <span>Kostprijs totaal</span>
                    <span>{formatCurrency(costPrice)}</span>
                  </div>
                  {watchedValues[6] && (
                    <div className="flex justify-between font-medium border-t border-slate-200 pt-1">
                      <span>Marge</span>
                      <span className={marge >= 0 ? 'text-green-600' : 'text-red-600'}>
                        {formatCurrency(marge)}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>

          {/* Werkelijk */}
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Werkelijk (afwijkend invullen indien nodig)
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Werkelijke uren
                </label>
                <input
                  type="number"
                  step="0.25"
                  {...register('actual_labor_hours', { valueAsNumber: true })}
                  className={inputClass()}
                  placeholder="Laat leeg als gelijk aan normatief"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Package className="w-3 h-3" /> Werkelijk materiaal
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('actual_material_cost', { valueAsNumber: true })}
                  className={inputClass()}
                  placeholder="Laat leeg als gelijk aan normatief"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
                  <Euro className="w-3 h-3" /> Werkelijke verkoopprijs
                </label>
                <input
                  type="number"
                  step="0.01"
                  {...register('actual_sale_price', { valueAsNumber: true })}
                  className={inputClass()}
                  placeholder="Laat leeg als gelijk aan normatief"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Werkzaamheden omschrijving */}
        <div>
          <label className={labelClass}>Omschrijving werkzaamheden</label>
          <textarea
            {...register('custom_work_description')}
            rows={3}
            className={inputClass()}
            placeholder="Beschrijf de uit te voeren of uitgevoerde werkzaamheden..."
          />
        </div>
      </div>

      {/* SECTIE 5: Foto's */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center text-xs font-bold">5</div>
          <h2 className="font-semibold text-slate-800">Foto&apos;s</h2>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          {newRegistrationId
            ? 'Upload foto\'s van de schade en het herstelwerk.'
            : 'Sla eerst de registratie op om foto\'s toe te voegen. Of voeg ze toe na het opslaan.'}
        </p>
        {newRegistrationId ? (
          <FotoUpload registratieId={newRegistrationId} />
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {['Vóór herstel', 'Tijdens herstel', 'Na herstel'].map((label) => (
              <div key={label} className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                <Camera className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">{label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SECTIE 6: Status en controle */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold">6</div>
          <h2 className="font-semibold text-slate-800">Status en controle</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Status *</label>
            <select {...register('status')} className={inputClass(!!errors.status)}>
              <option value="open">Open</option>
              <option value="ingepland">Ingepland</option>
              <option value="in_uitvoering">In uitvoering</option>
              <option value="gereed">Gereed</option>
              <option value="gecontroleerd">Gecontroleerd</option>
              <option value="afgekeurd">Afgekeurd</option>
              <option value="hersteld_na_afkeur">Hersteld na afkeur</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Controlestatus</label>
            <select {...register('control_status')} className={inputClass()}>
              <option value="niet_gecontroleerd">Niet gecontroleerd</option>
              <option value="goedgekeurd">Goedgekeurd</option>
              <option value="afgekeurd">Afgekeurd</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Datum gereed</label>
            <input type="date" {...register('completed_at')} className={inputClass()} />
          </div>
          <div>
            <label className={labelClass}>Datum gecontroleerd</label>
            <input type="date" {...register('checked_at')} className={inputClass()} />
          </div>
        </div>
      </div>

      {/* SECTIE 7: Opmerkingen */}
      <div className={sectionClass}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-6 h-6 bg-slate-100 text-slate-600 rounded-full flex items-center justify-center text-xs font-bold">7</div>
          <h2 className="font-semibold text-slate-800">Opmerkingen</h2>
        </div>
        <textarea
          {...register('notes')}
          rows={3}
          className={inputClass()}
          placeholder="Aanvullende opmerkingen..."
        />
      </div>

      {/* Actie knoppen - sticky op mobiel */}
      <div className="fixed bottom-0 left-0 right-0 lg:relative lg:bottom-auto bg-white
        lg:bg-transparent border-t border-slate-200 lg:border-0 p-4 lg:p-0
        flex gap-2 z-40 shadow-lg lg:shadow-none lg:justify-end">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 lg:flex-none px-4 py-2.5 text-sm font-medium text-slate-700
            bg-white border border-slate-300 hover:border-slate-400 rounded-lg transition-colors"
        >
          Annuleren
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={handleSubmit((data: RegistratieFormValues) => onSubmit(data, 'save_new'))}
          className="flex-1 lg:flex-none px-4 py-2.5 text-sm font-medium text-slate-700
            bg-white border border-slate-300 hover:border-slate-400 rounded-lg transition-colors
            disabled:opacity-50 hidden sm:flex items-center justify-center gap-1"
        >
          Opslaan & nieuwe
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={handleSubmit((data: RegistratieFormValues) => onSubmit(data, 'save_view'))}
          className="flex-1 lg:flex-none inline-flex items-center justify-center gap-2
            bg-everts hover:bg-everts-dark disabled:bg-everts-light text-white
            font-medium px-6 py-2.5 rounded-lg text-sm transition-colors"
        >
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" />
          Opslaan
        </button>
      </div>
    </form>
  )
}
