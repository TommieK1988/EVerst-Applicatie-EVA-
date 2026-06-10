'use client'

import { useState } from 'react'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Loader2, Save, Plus, Trash2 } from 'lucide-react'
import { standardRepairSchema, type StandardRepairFormValues } from '@/lib/houtrotherstel/validations'
import { createStandaardReparatie, updateStandaardReparatie } from '@/services/houtrotherstel/standaard-reparaties'
import { formatCurrency } from '@/lib/houtrotherstel/utils'
import { REPARATIE_CATEGORIEEN } from '@/lib/houtrotherstel/types'
import type { StandardRepair } from '@/lib/houtrotherstel/types'

interface StandaardReparatieFormProps {
  reparatie?: StandardRepair
}

export default function StandaardReparatieForm({ reparatie }: StandaardReparatieFormProps) {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const isEdit = !!reparatie

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<StandardRepairFormValues>({
    resolver: zodResolver(standardRepairSchema),
    defaultValues: {
      code: reparatie?.code || '',
      name: reparatie?.name || '',
      category: reparatie?.category || '',
      description: reparatie?.description || '',
      unit: reparatie?.unit || 'st',
      labor_hours: reparatie?.labor_hours || 0,
      labor_rate: reparatie?.labor_rate || 65,
      material_cost: reparatie?.material_cost || 0,
      sale_price: reparatie?.sale_price || 0,
      active: reparatie?.active ?? true,
      price_date: reparatie?.price_date || new Date().toISOString().split('T')[0],
      version: reparatie?.version || '1.0',
      notes: reparatie?.notes || '',
      materials: reparatie?.materials?.map(m => ({
        id: m.id,
        material_name: m.material_name,
        quantity: m.quantity,
        unit: m.unit,
        unit_cost: m.unit_cost,
      })) || [],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'materials',
  })

  const watchedValues = watch(['labor_hours', 'labor_rate', 'material_cost', 'sale_price'])
  const laborCost = (watchedValues[0] || 0) * (watchedValues[1] || 0)
  const costPrice = laborCost + (watchedValues[2] || 0)
  const marge = watchedValues[3] > 0
    ? ((watchedValues[3] - costPrice) / watchedValues[3] * 100)
    : 0

  // Materialen automatisch optellen
  const watchedMaterials = watch('materials')
  const totalMaterialCost = (watchedMaterials || []).reduce(
    (sum, m) => sum + (m.quantity || 0) * (m.unit_cost || 0), 0
  )

  const onSubmit = async (data: StandardRepairFormValues) => {
    setIsLoading(true)
    try {
      if (isEdit) {
        await updateStandaardReparatie(reparatie!.id, data)
        toast.success('Standaard reparatie bijgewerkt')
        router.push(`/houtrotherstel/standaard-reparaties/${reparatie!.id}`)
      } else {
        const result = await createStandaardReparatie(data)
        toast.success('Standaard reparatie aangemaakt')
        router.push(`/houtrotherstel/standaard-reparaties/${result.id}`)
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
  const sectionClass = 'bg-white rounded-xl border border-slate-200 p-6 space-y-4'

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Basis */}
      <div className={sectionClass}>
        <h2 className="font-semibold text-slate-800">Basisinformatie</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Reparatiecode *</label>
            <input {...register('code')} className={inputClass(!!errors.code)} placeholder="EP-K-001" />
            {errors.code && <p className={errorClass}>{errors.code.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Versie</label>
            <input {...register('version')} className={inputClass()} placeholder="1.0" />
          </div>
        </div>

        <div>
          <label className={labelClass}>Naam *</label>
          <input {...register('name')} className={inputClass(!!errors.name)} placeholder="Epoxyherstel klein (< 50cm²)" />
          {errors.name && <p className={errorClass}>{errors.name.message}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Categorie *</label>
            <select {...register('category')} className={inputClass(!!errors.category)}>
              <option value="">Selecteer categorie...</option>
              {REPARATIE_CATEGORIEEN.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="Anders">Anders (vrij invoeren)</option>
            </select>
            {errors.category && <p className={errorClass}>{errors.category.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Eenheid *</label>
            <select {...register('unit')} className={inputClass()}>
              <option value="st">st (stuk)</option>
              <option value="m1">m1 (meter)</option>
              <option value="m2">m² (vierkante meter)</option>
              <option value="uur">uur</option>
              <option value="kg">kg</option>
              <option value="l">liter</option>
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>Omschrijving</label>
          <textarea {...register('description')} rows={3} className={inputClass()} placeholder="Gedetailleerde omschrijving van de werkzaamheden..." />
        </div>

        <div className="flex items-center gap-3">
          <input type="checkbox" id="active" {...register('active')} className="w-4 h-4 rounded border-slate-300 text-everts" />
          <label htmlFor="active" className="text-sm font-medium text-slate-700">Actief (beschikbaar voor selectie)</label>
        </div>
      </div>

      {/* Prijzen */}
      <div className={sectionClass}>
        <h2 className="font-semibold text-slate-800">Arbeid en prijzen</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Arbeidsuren</label>
            <input type="number" step="0.25" {...register('labor_hours', { valueAsNumber: true })} className={inputClass(!!errors.labor_hours)} placeholder="1.5" />
            {errors.labor_hours && <p className={errorClass}>{errors.labor_hours.message}</p>}
          </div>
          <div>
            <label className={labelClass}>Tarief per uur (€)</label>
            <input type="number" step="0.01" {...register('labor_rate', { valueAsNumber: true })} className={inputClass(!!errors.labor_rate)} placeholder="65.00" />
            {errors.labor_rate && <p className={errorClass}>{errors.labor_rate.message}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Materiaalkosten (€)</label>
            <input type="number" step="0.01" {...register('material_cost', { valueAsNumber: true })} className={inputClass(!!errors.material_cost)} placeholder="0.00" />
            <p className="text-xs text-slate-400 mt-1">Of automatisch berekend uit materialenlijst</p>
            {totalMaterialCost > 0 && (
              <p className="text-xs text-everts mt-0.5">
                Materiaallijst totaal: {formatCurrency(totalMaterialCost)}
              </p>
            )}
          </div>
          <div>
            <label className={labelClass}>Verkoopprijs (€) *</label>
            <input type="number" step="0.01" {...register('sale_price', { valueAsNumber: true })} className={inputClass(!!errors.sale_price)} placeholder="185.00" />
            {errors.sale_price && <p className={errorClass}>{errors.sale_price.message}</p>}
          </div>
        </div>

        {/* Live berekening */}
        <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-400">Arbeidskosten</div>
            <div className="font-semibold text-slate-700">{formatCurrency(laborCost)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Kostprijs</div>
            <div className="font-semibold text-slate-700">{formatCurrency(costPrice)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Verkoopprijs</div>
            <div className="font-semibold text-everts-dark">{formatCurrency(watchedValues[3] || 0)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-400">Marge</div>
            <div className={`font-semibold ${marge >= 20 ? 'text-green-600' : marge >= 10 ? 'text-yellow-600' : 'text-red-600'}`}>
              {marge.toFixed(1)}%
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Prijspeilkdatum</label>
            <input type="date" {...register('price_date')} className={inputClass()} />
          </div>
        </div>
      </div>

      {/* Materialenlijst */}
      <div className={sectionClass}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Materialenlijst</h2>
          <button
            type="button"
            onClick={() => append({ material_name: '', quantity: 1, unit: 'st', unit_cost: 0 })}
            className="inline-flex items-center gap-1.5 text-sm text-everts hover:text-everts-dark"
          >
            <Plus className="w-4 h-4" />
            Materiaal toevoegen
          </button>
        </div>

        {fields.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">
            Nog geen materialen. Voeg materialen toe voor automatische berekening.
          </p>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 text-xs font-medium text-slate-400 px-1">
              <div className="col-span-4">Materiaalnaam</div>
              <div className="col-span-2">Hoeveelheid</div>
              <div className="col-span-2">Eenheid</div>
              <div className="col-span-2">Prijs/eenheid</div>
              <div className="col-span-1">Totaal</div>
              <div className="col-span-1" />
            </div>

            {fields.map((field, index) => {
              const qty = watchedMaterials?.[index]?.quantity || 0
              const cost = watchedMaterials?.[index]?.unit_cost || 0
              const total = qty * cost

              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-12 sm:col-span-4">
                    <input
                      {...register(`materials.${index}.material_name`)}
                      className={inputClass()}
                      placeholder="Materiaalnaam"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <input
                      type="number"
                      step="0.001"
                      {...register(`materials.${index}.quantity`, { valueAsNumber: true })}
                      className={inputClass()}
                      placeholder="0"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <select {...register(`materials.${index}.unit`)} className={inputClass()}>
                      <option value="st">st</option>
                      <option value="m1">m1</option>
                      <option value="m2">m²</option>
                      <option value="kg">kg</option>
                      <option value="l">l</option>
                      <option value="rol">rol</option>
                      <option value="pak">pak</option>
                    </select>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <input
                      type="number"
                      step="0.01"
                      {...register(`materials.${index}.unit_cost`, { valueAsNumber: true })}
                      className={inputClass()}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-1 text-sm font-medium text-slate-600 text-right">
                    {formatCurrency(total)}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1 text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
            })}

            {fields.length > 0 && (
              <div className="flex justify-end pt-2 border-t border-slate-100">
                <div className="text-sm font-semibold text-slate-800">
                  Totaal materiaal: {formatCurrency(totalMaterialCost)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notities */}
      <div className={sectionClass}>
        <h2 className="font-semibold text-slate-800">Notities</h2>
        <textarea {...register('notes')} rows={2} className={inputClass()} placeholder="Interne notities over deze reparatie..." />
      </div>

      {/* Acties */}
      <div className="flex gap-3 justify-end">
        <button type="button" onClick={() => router.back()}
          className="px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:border-slate-400 rounded-lg transition-colors">
          Annuleren
        </button>
        <button type="submit" disabled={isLoading}
          className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark disabled:bg-everts-light
            text-white font-medium px-6 py-2.5 rounded-lg text-sm transition-colors">
          {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          <Save className="w-4 h-4" />
          {isLoading ? 'Opslaan...' : isEdit ? 'Wijzigingen opslaan' : 'Reparatie aanmaken'}
        </button>
      </div>
    </form>
  )
}
