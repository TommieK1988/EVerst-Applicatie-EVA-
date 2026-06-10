'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Pencil, Trash2, X, Upload, Download, FileSpreadsheet, AlertCircle, CheckCircle2, ChevronDown } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import {
  getAllBibliotheekActief, saveBibliotheekItem, deleteBibliotheekItem,
  getUurtarief, getEenheden, getReparatieTypes,
} from '@/lib/local-store'
import type { StandardRepair } from '@/lib/types'
import * as XLSX from 'xlsx'

// ─── Berekeningen ──────────────────────────────────────────────────────────────

const leegItem = (uurtarief = 65): Omit<StandardRepair, 'id' | 'created_at' | 'updated_at'> => ({
  code: '', name: '', extended_description: '', category: '', description: '',
  unit: 'st', labor_hours: 0, labor_rate: uurtarief, labor_cost: 0,
  material_cost: 0, cost_price: 0, sale_price: 0, vat_percentage: 21,
  margin: 0, active: true, price_date: null, version: null, notes: null,
})

type FormData = ReturnType<typeof leegItem>

function bereken(form: FormData): FormData {
  const labor_cost = Math.round(form.labor_hours * form.labor_rate * 100) / 100
  const cost_price = Math.round((labor_cost + form.material_cost) * 100) / 100
  const margin = form.sale_price > 0
    ? Math.round(((form.sale_price - cost_price) / form.sale_price) * 1000) / 10
    : 0
  return { ...form, labor_cost, cost_price, margin }
}

// ─── Item Modal ────────────────────────────────────────────────────────────────

function ItemModal({ item, uurtarief, eenheden, reparatieTypes, onSave, onClose }: {
  item: StandardRepair | null; uurtarief: number; eenheden: string[]
  reparatieTypes: string[]; onSave: (item: StandardRepair) => void; onClose: () => void
}) {
  const [form, setForm] = useState<FormData>(item ? { ...item } : leegItem(uurtarief))

  function set(field: keyof FormData, value: string | number) {
    setForm(prev => bereken({ ...prev, [field]: value }))
  }

  function opslaan() {
    if (!form.code.trim() || !form.name.trim()) return
    const now = new Date().toISOString()
    onSave({ ...form, id: item?.id ?? `sr-${Date.now()}`, created_at: item?.created_at ?? now, updated_at: now } as StandardRepair)
  }

  const Input = ({ field, type = 'text', placeholder = '' }: { field: keyof FormData; type?: string; placeholder?: string }) => (
    <input
      type={type}
      value={String(form[field] ?? '')}
      onChange={e => set(field, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
    />
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800 text-lg">{item ? 'Reparatie bewerken' : 'Nieuwe reparatie'}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Code *</label>
              <Input field="code" placeholder="EP-K-001" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Type / Categorie</label>
              {reparatieTypes.length > 0 ? (
                <select value={form.category} onChange={e => set('category', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                  <option value="">— Kies type —</option>
                  {reparatieTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : <Input field="category" placeholder="Epoxyherstel" />}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Omschrijving *</label>
            <Input field="name" placeholder="Epoxyherstel klein (< 50cm²)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Uitgebreide omschrijving</label>
            <textarea value={form.extended_description ?? ''} onChange={e => set('extended_description', e.target.value)}
              rows={3} placeholder="Gedetailleerde omschrijving van de werkzaamheden..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Eenheid</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                {(eenheden.length > 0 ? eenheden : ['st', 'm1', 'm2', 'm3', 'uur', 'dag']).map(u => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Aantal minuten</label>
              <input type="number" min={0} value={Math.round(form.labor_hours * 60)}
                onChange={e => set('labor_hours', (parseFloat(e.target.value) || 0) / 60)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">BTW %</label>
              <select value={form.vat_percentage} onChange={e => set('vat_percentage', parseFloat(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                <option value={9}>9%</option>
                <option value={21}>21%</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Materiaalkosten (€)</label>
              <Input field="material_cost" type="number" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Verkoopprijs (€)</label>
              <Input field="sale_price" type="number" />
            </div>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Arbeidskosten</div>
              <div className="font-semibold text-slate-700">{formatCurrency(form.labor_cost)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Totale kostprijs</div>
              <div className="font-semibold text-slate-700">{formatCurrency(form.cost_price)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-0.5">Marge</div>
              <div className={`font-semibold ${form.margin >= 20 ? 'text-green-600' : 'text-orange-600'}`}>{form.margin.toFixed(1)}%</div>
            </div>
          </div>
        </div>
        <div className="flex gap-3 justify-end px-6 pb-6">
          <button onClick={onClose} className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium rounded-lg text-sm transition-colors">
            Annuleren
          </button>
          <button onClick={opslaan} disabled={!form.code.trim() || !form.name.trim()}
            className="px-5 py-2.5 bg-everts hover:bg-everts-dark disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors">
            Opslaan
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Import helpers ────────────────────────────────────────────────────────────

type VeldSleutel = 'code' | 'name' | 'extended_description' | 'category' | 'unit' | 'minuten' | 'material_cost' | 'sale_price' | 'vat_percentage'

const VELD_ALIASSEN: Record<VeldSleutel, string[]> = {
  code:                 ['code'],
  name:                 ['omschrijving', 'naam', 'name', 'reparatie'],
  extended_description: ['uitgebreide omschrijving', 'uitgebreideomschrijving', 'extended description', 'detail', 'toelichting'],
  category:             ['type', 'categorie', 'category'],
  unit:                 ['eenheid', 'unit'],
  minuten:              ['minuten', 'min', 'arbeidsminuten', 'arbeid', 'arbeid minuten'],
  material_cost:        ['materiaalkosten', 'materiaal', 'material', 'materiaalkosten (€)'],
  sale_price:           ['verkoopprijs', 'verkoop', 'prijs', 'sale price', 'verkoopprijs (€)'],
  vat_percentage:       ['btw%', 'btw', 'vat', 'vat%', 'btw percentage'],
}

type KolomMapping = Partial<Record<VeldSleutel, string>>

function detecteerMapping(headers: string[]): KolomMapping {
  const mapping: KolomMapping = {}
  for (const header of headers) {
    const h = header.toLowerCase().trim()
    for (const [veld, aliassen] of Object.entries(VELD_ALIASSEN) as [VeldSleutel, string[]][]) {
      if (!mapping[veld] && aliassen.some(a => h === a || h.includes(a))) {
        mapping[veld] = header
      }
    }
  }
  return mapping
}

function rijNaarItem(rij: Record<string, unknown>, mapping: KolomMapping, uurtarief: number): StandardRepair | null {
  const get = (veld: VeldSleutel) => {
    const col = mapping[veld]
    return col ? rij[col] : undefined
  }

  const code = String(get('code') ?? '').trim()
  const name = String(get('name') ?? '').trim()
  if (!code || !name) return null

  const minuten = parseFloat(String(get('minuten') ?? 0)) || 0
  const labor_hours = minuten / 60
  const material_cost = parseFloat(String(get('material_cost') ?? 0)) || 0
  const sale_price = parseFloat(String(get('sale_price') ?? 0)) || 0
  const vat_raw = get('vat_percentage')
  const vat_percentage = vat_raw !== undefined ? parseFloat(String(vat_raw)) || 21 : 21

  const labor_cost = Math.round(labor_hours * uurtarief * 100) / 100
  const cost_price = Math.round((labor_cost + material_cost) * 100) / 100
  const margin = sale_price > 0 ? Math.round(((sale_price - cost_price) / sale_price) * 1000) / 10 : 0

  const now = new Date().toISOString()
  return {
    id: `sr-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    code, name,
    extended_description: String(get('extended_description') ?? '').trim() || null,
    category: String(get('category') ?? '').trim(),
    description: '',
    unit: String(get('unit') ?? 'st').trim() || 'st',
    labor_hours, labor_rate: uurtarief, labor_cost,
    material_cost, cost_price, sale_price, vat_percentage, margin,
    active: true, price_date: null, version: null, notes: null,
    created_at: now, updated_at: now,
  }
}

const VELD_LABELS: Record<VeldSleutel, string> = {
  code: 'Code', name: 'Omschrijving', extended_description: 'Uitgebreide omschrijving',
  category: 'Type', unit: 'Eenheid', minuten: 'Minuten',
  material_cost: 'Materiaalkosten', sale_price: 'Verkoopprijs', vat_percentage: 'BTW%',
}

// ─── Import Modal ──────────────────────────────────────────────────────────────

function ImportModal({ uurtarief, onImport, onClose }: {
  uurtarief: number; onImport: (items: StandardRepair[]) => void; onClose: () => void
}) {
  const [stap, setStap] = useState<'upload' | 'preview'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rijen, setRijen] = useState<Record<string, unknown>[]>([])
  const [mapping, setMapping] = useState<KolomMapping>({})
  const [fout, setFout] = useState<string | null>(null)
  const [slepen, setSlepen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function verwerkBestand(file: File) {
    setFout(null)
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setFout('Alleen .xlsx en .xls bestanden worden ondersteund.')
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
        if (rows.length === 0) { setFout('Het bestand bevat geen data.'); return }
        const hdrs = Object.keys(rows[0])
        setHeaders(hdrs)
        setRijen(rows)
        setMapping(detecteerMapping(hdrs))
        setStap('preview')
      } catch {
        setFout('Kon het bestand niet inlezen. Controleer of het een geldig Excel-bestand is.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setSlepen(false)
    const file = e.dataTransfer.files[0]
    if (file) verwerkBestand(file)
  }, [])

  const geldigeItems = stap === 'preview'
    ? rijen.map(r => rijNaarItem(r, mapping, uurtarief)).filter((x): x is StandardRepair => x !== null)
    : []

  const missendeVelden = stap === 'preview'
    ? (['code', 'name'] as VeldSleutel[]).filter(v => !mapping[v])
    : []

  function setKolom(veld: VeldSleutel, kolom: string) {
    setMapping(prev => ({ ...prev, [veld]: kolom || undefined }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-everts-dark rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold text-slate-800">Importeren uit Excel</h2>
              <p className="text-xs text-slate-400">
                {stap === 'upload' ? 'Upload een .xlsx of .xls bestand' : `${rijen.length} rijen gevonden · ${geldigeItems.length} te importeren`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="overflow-y-auto flex-1 p-6">
          {stap === 'upload' && (
            <div className="space-y-5">
              {/* Dropzone */}
              <div
                onDragOver={e => { e.preventDefault(); setSlepen(true) }}
                onDragLeave={() => setSlepen(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                  slepen ? 'border-everts bg-everts-50' : 'border-slate-300 hover:border-everts hover:bg-slate-50'
                }`}
              >
                <Upload className={`w-10 h-10 ${slepen ? 'text-everts' : 'text-slate-300'}`} />
                <div className="text-center">
                  <p className="font-medium text-slate-700">Sleep een bestand hierheen of klik om te selecteren</p>
                  <p className="text-sm text-slate-400 mt-1">Ondersteund: .xlsx, .xls</p>
                </div>
                <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) verwerkBestand(f) }} />
              </div>

              {fout && (
                <div className="flex items-center gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {fout}
                </div>
              )}

              {/* Verwachte kolommen */}
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Verwachte kolomnamen</p>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(VELD_LABELS).map(([, label]) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-slate-600">
                      <div className="w-1.5 h-1.5 rounded-full bg-everts flex-shrink-0" />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {stap === 'preview' && (
            <div className="space-y-5">
              {/* Kolom mapping */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Kolom koppeling</p>
                <div className="grid grid-cols-2 gap-2.5">
                  {(Object.keys(VELD_LABELS) as VeldSleutel[]).map(veld => (
                    <div key={veld} className="flex items-center gap-2">
                      <span className="text-xs text-slate-500 w-36 flex-shrink-0 flex items-center gap-1">
                        {(['code', 'name'] as VeldSleutel[]).includes(veld) && (
                          <span className="text-red-500">*</span>
                        )}
                        {VELD_LABELS[veld]}
                      </span>
                      <div className="relative flex-1">
                        <select
                          value={mapping[veld] ?? ''}
                          onChange={e => setKolom(veld, e.target.value)}
                          className={`w-full px-2.5 py-1.5 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white appearance-none pr-6 ${
                            mapping[veld] ? 'border-green-300 text-slate-700' : 'border-slate-300 text-slate-400'
                          }`}
                        >
                          <option value="">— niet gekoppeld —</option>
                          {headers.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <ChevronDown className="absolute right-1.5 top-1.5 w-3 h-3 text-slate-400 pointer-events-none" />
                      </div>
                      {mapping[veld]
                        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                        : <div className="w-4 h-4 flex-shrink-0" />}
                    </div>
                  ))}
                </div>
                {missendeVelden.length > 0 && (
                  <div className="flex items-center gap-2 mt-3 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-orange-700 text-xs">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Koppel de verplichte velden: {missendeVelden.map(v => VELD_LABELS[v]).join(', ')}
                  </div>
                )}
              </div>

              {/* Preview tabel */}
              {geldigeItems.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Voorbeeld (eerste {Math.min(5, geldigeItems.length)} van {geldigeItems.length} rijen)
                  </p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Code</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Omschrijving</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Type</th>
                            <th className="text-left px-3 py-2 font-semibold text-slate-500">Eenheid</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">Min.</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">Materiaal</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">Verkoop</th>
                            <th className="text-right px-3 py-2 font-semibold text-slate-500">BTW</th>
                          </tr>
                        </thead>
                        <tbody>
                          {geldigeItems.slice(0, 5).map((item, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0">
                              <td className="px-3 py-2">
                                <span className="font-mono font-semibold text-everts-dark bg-everts-50 px-1.5 py-0.5 rounded">
                                  {item.code}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-slate-700 max-w-[160px] truncate">{item.name}</td>
                              <td className="px-3 py-2 text-slate-500">{item.category || '—'}</td>
                              <td className="px-3 py-2 text-slate-500">{item.unit}</td>
                              <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{Math.round(item.labor_hours * 60)}</td>
                              <td className="px-3 py-2 text-right text-slate-600 tabular-nums">{formatCurrency(item.material_cost)}</td>
                              <td className="px-3 py-2 text-right font-semibold text-slate-700 tabular-nums">{formatCurrency(item.sale_price)}</td>
                              <td className="px-3 py-2 text-right text-slate-500">{item.vat_percentage}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {geldigeItems.length === 0 && (
                <div className="flex items-center gap-2.5 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 text-orange-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  Geen geldige rijen gevonden. Controleer de kolom koppeling.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 flex-shrink-0">
          <button
            onClick={() => stap === 'preview' ? setStap('upload') : onClose()}
            className="px-4 py-2.5 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium rounded-lg text-sm transition-colors"
          >
            {stap === 'preview' ? 'Terug' : 'Annuleren'}
          </button>

          {stap === 'preview' && (
            <button
              onClick={() => onImport(geldigeItems)}
              disabled={geldigeItems.length === 0 || missendeVelden.length > 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-everts hover:bg-everts-dark disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
            >
              <Upload className="w-4 h-4" />
              {geldigeItems.length} reparaties importeren
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sjabloon download ─────────────────────────────────────────────────────────

function downloadSjabloon() {
  const data = [
    ['Code', 'Omschrijving', 'Uitgebreide omschrijving', 'Type', 'Eenheid', 'Minuten', 'Materiaalkosten', 'Verkoopprijs', 'BTW%'],
    ['EP-K-001', 'Epoxyherstel klein (< 50cm²)', 'Herstellen houtrotherstel met epoxy voor kleine oppervlakken.', 'Epoxyherstel', 'st', 90, 18.50, 185, 21],
    ['EP-M-001', 'Epoxyherstel middel (50-200cm²)', 'Herstellen houtrotherstel met epoxy voor middelgrote oppervlakken.', 'Epoxyherstel', 'st', 150, 35, 285, 21],
    ['DV-DOR-001', 'Deelvervanging dorpel', 'Gedeeltelijk vervangen aangetaste dorpel incl. kit- en schilderwerk.', 'Deelvervanging', 'st', 180, 85, 380, 21],
  ]
  const ws = XLSX.utils.aoa_to_sheet(data)
  ws['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 52 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 14 }, { wch: 8 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Bibliotheek')
  XLSX.writeFile(wb, 'bibliotheek-sjabloon.xlsx')
}

// ─── Hoofdcomponent ────────────────────────────────────────────────────────────

export default function BibliotheekTabel() {
  const [items, setItems] = useState<StandardRepair[]>([])
  const [zoek, setZoek] = useState('')
  const [modal, setModal] = useState<{ open: boolean; item: StandardRepair | null }>({ open: false, item: null })
  const [importOpen, setImportOpen] = useState(false)
  const [importResultaat, setImportResultaat] = useState<string | null>(null)
  const [uurtarief, setUurtarief] = useState(65)
  const [eenheden, setEenheden] = useState<string[]>(['st', 'm1', 'm2', 'm3', 'uur', 'dag'])
  const [reparatieTypes, setReparatieTypes] = useState<string[]>([])

  function laden() {
    setItems(getAllBibliotheekActief())
    setUurtarief(getUurtarief())
    setEenheden(getEenheden())
    setReparatieTypes(getReparatieTypes().map(t => t.naam))
  }

  useEffect(() => { laden() }, [])

  const gefilterd = items.filter(i => {
    if (!zoek) return true
    const q = zoek.toLowerCase()
    return (
      i.code.toLowerCase().includes(q) ||
      i.name.toLowerCase().includes(q) ||
      i.category.toLowerCase().includes(q) ||
      (i.description?.toLowerCase().includes(q) ?? false)
    )
  })

  function opslaan(item: StandardRepair) {
    saveBibliotheekItem(item)
    setModal({ open: false, item: null })
    laden()
  }

  function verwijder(id: string) {
    if (!confirm('Reparatie verwijderen uit de bibliotheek?')) return
    deleteBibliotheekItem(id)
    laden()
  }

  function handleImport(nieuweItems: StandardRepair[]) {
    nieuweItems.forEach(i => saveBibliotheekItem(i))
    setImportOpen(false)
    setImportResultaat(`${nieuweItems.length} reparaties succesvol geïmporteerd.`)
    laden()
    setTimeout(() => setImportResultaat(null), 4000)
  }

  const TH = ({ children, right }: { children?: React.ReactNode; right?: boolean }) => (
    <th className={`px-3 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )

  return (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <input
          type="text"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder="Zoeken op code, omschrijving of type..."
          className="flex-1 min-w-[200px] max-w-sm px-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
        />
        <span className="text-sm text-slate-400">{gefilterd.length} items</span>

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={downloadSjabloon}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-medium px-3 py-2.5 rounded-lg text-sm transition-colors"
            title="Download Excel sjabloon"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Sjabloon</span>
          </button>
          <button
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:border-everts hover:border-slate-400 text-slate-700 font-medium px-3 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">Importeren</span>
          </button>
          <button
            onClick={() => setModal({ open: true, item: null })}
            className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nieuwe reparatie</span>
          </button>
        </div>
      </div>

      {/* Succesmelding */}
      {importResultaat && (
        <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-green-700 text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {importResultaat}
        </div>
      )}

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1100px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <TH>Code</TH>
                <TH>Omschrijving</TH>
                <TH>Uitgebreide omschrijving</TH>
                <TH>Type</TH>
                <TH>Eenheid</TH>
                <TH right>Min.</TH>
                <TH right>Materiaal</TH>
                <TH right>Kostprijs</TH>
                <TH right>Verkoop</TH>
                <TH right>BTW</TH>
                <TH></TH>
              </tr>
            </thead>
            <tbody>
              {gefilterd.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center py-12 text-slate-400 text-sm">
                    {zoek ? 'Geen resultaten gevonden' : 'Bibliotheek is leeg'}
                  </td>
                </tr>
              ) : (
                gefilterd.map(item => (
                  <tr key={item.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 group">
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs font-semibold text-everts-dark bg-everts-50 px-1.5 py-0.5 rounded">
                        {item.code}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-slate-800 max-w-[180px] truncate" title={item.name}>{item.name}</div>
                      {item.description && (
                        <div className="text-xs text-slate-400 truncate max-w-[180px]">{item.description}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-xs text-slate-500 max-w-[200px] line-clamp-2" title={item.extended_description ?? ''}>
                        {item.extended_description || '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                        {item.category}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-600 text-center">{item.unit}</td>
                    <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{Math.round(item.labor_hours * 60)}</td>
                    <td className="px-3 py-3 text-right text-slate-600 tabular-nums">{formatCurrency(item.material_cost)}</td>
                    <td className="px-3 py-3 text-right font-medium text-slate-700 tabular-nums">{formatCurrency(item.cost_price)}</td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-800 tabular-nums">{formatCurrency(item.sale_price)}</td>
                    <td className="px-3 py-3 text-right text-slate-500 tabular-nums">{item.vat_percentage}%</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal({ open: true, item })}
                          className="p-1.5 text-slate-400 hover:text-everts hover:bg-everts-50 rounded-lg transition-colors" title="Bewerken">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => verwijder(item.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Verwijderen">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal.open && (
        <ItemModal
          item={modal.item} uurtarief={uurtarief} eenheden={eenheden} reparatieTypes={reparatieTypes}
          onSave={opslaan} onClose={() => setModal({ open: false, item: null })}
        />
      )}

      {importOpen && (
        <ImportModal uurtarief={uurtarief} onImport={handleImport} onClose={() => setImportOpen(false)} />
      )}
    </>
  )
}
