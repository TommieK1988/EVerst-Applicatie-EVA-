'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Download, Upload, Search, X } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getMaterialen,
  maakMateriaal,
  wijzigMateriaal,
  verwijderMateriaal as verwijderMateriaalDb,
  importMaterialen,
  getMateriaalgroepen,
} from '@/app/(platform)/everts-calc/actions/materialen'
import type { Materiaal, MateriaalStatus } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'

// ─── Inline bewerkbare cellen ─────────────────────────────────────────────────

function InlineTekst({
  waarde, placeholder = '', cls = '',
  onOpslaan,
}: { waarde: string; placeholder?: string; cls?: string; onOpslaan: (v: string) => void }) {
  const [lokaal, setLokaal] = useState(waarde)
  useEffect(() => setLokaal(waarde), [waarde])

  return (
    <input
      type="text"
      value={lokaal}
      placeholder={placeholder}
      onChange={e => setLokaal(e.target.value)}
      onBlur={() => onOpslaan(lokaal)}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`w-full text-xs px-1.5 py-1 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white placeholder-slate-300 ${cls}`}
    />
  )
}

function InlineGetal({
  waarde, decimalen = 2, cls = '', onOpslaan,
}: { waarde: number; decimalen?: number; cls?: string; onOpslaan: (v: number) => void }) {
  const toon = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: decimalen, maximumFractionDigits: decimalen })
  const [lokaal, setLokaal] = useState(toon(waarde))
  useEffect(() => setLokaal(toon(waarde)), [waarde]) // eslint-disable-line react-hooks/exhaustive-deps

  const bevestig = () => {
    // Nederlandse invoer: komma als decimaalteken, punt als duizendtal.
    const genormaliseerd = lokaal.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
    const n = parseFloat(genormaliseerd)
    if (isNaN(n) || n === waarde) { setLokaal(toon(waarde)); return }
    onOpslaan(n)
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={lokaal}
      onChange={e => setLokaal(e.target.value)}
      onBlur={bevestig}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setLokaal(toon(waarde)); (e.target as HTMLInputElement).blur() }
      }}
      className={`w-full text-xs px-1.5 py-1 rounded border border-transparent text-right
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white ${cls}`}
    />
  )
}

function InlineSelect({
  waarde, opties, onOpslaan, cls = '',
}: { waarde: string; opties: { value: string; label: string }[]; onOpslaan: (v: string) => void; cls?: string }) {
  return (
    <select
      value={waarde}
      onChange={e => onOpslaan(e.target.value)}
      className={`w-full text-xs px-1.5 py-1 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white cursor-pointer ${cls}`}
    >
      {opties.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

// ─── Materiaal rij ────────────────────────────────────────────────────────────

function MateriaalRij({
  materiaal, groepOpties, isNieuw = false, onWijzig, onVerwijder,
}: {
  materiaal: Materiaal
  groepOpties: string[]
  isNieuw?: boolean
  onWijzig: (patch: Partial<Materiaal>) => void
  onVerwijder: () => void
}) {
  const isInactief = materiaal.status === 'inactief'

  return (
    <tr className={`group border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${isInactief ? 'opacity-50' : ''} ${isNieuw ? 'bg-everts/5 ring-1 ring-inset ring-everts/30' : ''}`}>
      {/* Leverancier */}
      <td className="px-1 py-0.5">
        <InlineTekst
          waarde={materiaal.leverancier ?? ''}
          placeholder="Leverancier..."
          onOpslaan={v => onWijzig({ leverancier: v || undefined })}
        />
      </td>

      {/* Merk */}
      <td className="px-1 py-0.5">
        <InlineTekst
          waarde={materiaal.merk ?? ''}
          placeholder="Merk..."
          onOpslaan={v => onWijzig({ merk: v || undefined })}
        />
      </td>

      {/* Artikelnummer */}
      <td className="px-1 py-0.5">
        <InlineTekst
          waarde={materiaal.artikelnummer ?? ''}
          placeholder="Artikelnr..."
          cls=""
          onOpslaan={v => onWijzig({ artikelnummer: v || undefined })}
        />
      </td>

      {/* Omschrijving */}
      <td className="px-1 py-0.5">
        <InlineTekst
          waarde={materiaal.omschrijving}
          placeholder="Omschrijving..."
          cls="font-medium"
          onOpslaan={v => onWijzig({ omschrijving: v })}
        />
      </td>

      {/* Materiaalgroep */}
      <td className="px-1 py-0.5">
        <select
          value={materiaal.materiaalgroep ?? ''}
          onChange={e => onWijzig({ materiaalgroep: e.target.value || undefined })}
          className="w-full text-xs px-1.5 py-1 rounded border border-transparent
            hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
            hover:bg-white focus:bg-white cursor-pointer"
        >
          <option value="">— Kies —</option>
          {groepOpties.map(g => <option key={g} value={g}>{g}</option>)}
          {/* Bestaande waarde die (nog) niet in de beheerlijst staat, blijven tonen */}
          {materiaal.materiaalgroep && !groepOpties.includes(materiaal.materiaalgroep) && (
            <option value={materiaal.materiaalgroep}>{materiaal.materiaalgroep}</option>
          )}
        </select>
        {materiaal.leverancier_productgroep && (
          <div className="px-1.5 text-[10px] text-slate-400 truncate" title={materiaal.leverancier_productgroep}>
            lev.: {materiaal.leverancier_productgroep}
          </div>
        )}
      </td>

      {/* Eenheid — bewerkbaar; bij import gevuld vanuit de leverancier */}
      <td className="px-1 py-0.5 w-16">
        <InlineTekst
          waarde={materiaal.eenheid}
          placeholder="ltr"
          onOpslaan={v => onWijzig({ eenheid: v.trim() || 'ltr' })}
        />
      </td>

      {/* Kostprijs — bewerkbaar; bij import gevuld vanuit de leverancier */}
      <td className="px-1 py-0.5 w-24">
        <div className="flex items-center gap-0.5">
          <span className="text-xs text-slate-400">€</span>
          <InlineGetal
            waarde={materiaal.kostprijs}
            onOpslaan={v => onWijzig({ kostprijs: v })}
          />
        </div>
      </td>

      {/* Status */}
      <td className="px-2 py-0.5 w-24 text-center">
        <Button
          variant={materiaal.status === 'actief' ? 'secondary' : 'ghost'}
          size="sm"
          onClick={() => onWijzig({ status: materiaal.status === 'actief' ? 'inactief' : 'actief' })}
          className={materiaal.status === 'actief' ? 'bg-green-100 text-green-700 hover:bg-green-200 border-transparent' : ''}
        >
          {materiaal.status === 'actief' ? 'Actief' : 'Inactief'}
        </Button>
      </td>

      {/* Verwijder */}
      <td className="px-1 py-0.5 w-8 text-center">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onVerwijder}
          title="Verwijder materiaal"
          className="opacity-0 group-hover:opacity-100 hover:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ─── Nieuw materiaal ──────────────────────────────────────────────────────────

/**
 * Aanmaken gaat via dit formulier en niet via een lege regel in de tabel: zo'n lege
 * regel valt weg achter een actief filter, staat tussen ~1900 andere regels en laat
 * halve records achter als je hem niet afmaakt.
 */
function NieuwMateriaalModal({
  groepOpties, onSluiten, onOpslaan,
}: {
  groepOpties: string[]
  onSluiten: () => void
  onOpslaan: (m: Partial<Materiaal>) => Promise<void>
}) {
  const [omschrijving,   setOmschrijving]   = useState('')
  const [leverancier,    setLeverancier]    = useState('')
  const [merk,           setMerk]           = useState('')
  const [artikelnummer,  setArtikelnummer]  = useState('')
  const [materiaalgroep, setMateriaalgroep] = useState('')
  const [eenheid,        setEenheid]        = useState('ltr')
  const [kostprijs,      setKostprijs]      = useState('0,00')
  const [bezig,          setBezig]          = useState(false)

  const kostprijsGetal = (() => {
    const n = parseFloat(kostprijs.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
    return isNaN(n) ? 0 : n
  })()

  const kanOpslaan = omschrijving.trim().length > 0 && !bezig

  const bewaar = async () => {
    if (!kanOpslaan) return
    setBezig(true)
    try {
      await onOpslaan({
        omschrijving:   omschrijving.trim(),
        leverancier:    leverancier.trim()   || undefined,
        merk:           merk.trim()          || undefined,
        artikelnummer:  artikelnummer.trim() || undefined,
        materiaalgroep: materiaalgroep       || undefined,
        eenheid:        eenheid.trim()       || 'ltr',
        kostprijs:      kostprijsGetal,
        status:         'actief',
      })
      onSluiten()
    } catch {
      // Fout is al als toast getoond; modal blijft open met de ingevulde gegevens.
    } finally {
      setBezig(false)
    }
  }

  const veld = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts'
  const label = 'block text-xs font-medium text-slate-500 mb-1'

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
      onMouseDown={e => { if (e.target === e.currentTarget) onSluiten() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg my-auto">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800">Nieuw materiaal</h3>
          <Button variant="ghost" size="icon-sm" onClick={onSluiten} title="Sluiten">
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div
          className="p-5 space-y-4"
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void bewaar() } }}
        >
          <div>
            <label className={label}>Omschrijving *</label>
            <input
              autoFocus
              type="text"
              value={omschrijving}
              onChange={e => setOmschrijving(e.target.value)}
              placeholder="Bijv. Grondverf wit 2,5 ltr"
              className={veld}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Leverancier</label>
              <input type="text" value={leverancier} onChange={e => setLeverancier(e.target.value)} className={veld} />
            </div>
            <div>
              <label className={label}>Merk</label>
              <input type="text" value={merk} onChange={e => setMerk(e.target.value)} className={veld} />
            </div>
            <div>
              <label className={label}>Artikelnummer</label>
              <input type="text" value={artikelnummer} onChange={e => setArtikelnummer(e.target.value)} className={veld} />
            </div>
            <div>
              <label className={label}>Materiaalgroep</label>
              <select value={materiaalgroep} onChange={e => setMateriaalgroep(e.target.value)} className={veld}>
                <option value="">— Kies —</option>
                {groepOpties.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Eenheid</label>
              <input
                type="text"
                value={eenheid}
                onChange={e => setEenheid(e.target.value)}
                placeholder="ltr"
                className={veld}
              />
            </div>
            <div>
              <label className={label}>Kostprijs (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={kostprijs}
                onChange={e => setKostprijs(e.target.value)}
                className={`${veld} text-right`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200">
          <Button variant="ghost" size="sm" onClick={onSluiten}>Annuleren</Button>
          <Button variant="primary" size="sm" onClick={() => { void bewaar() }} disabled={!kanOpslaan}>
            {bezig ? <Spinner size="sm" /> : <Plus className="w-3.5 h-3.5" />}
            Materiaal toevoegen
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function MaterialenBibliotheek() {
  const [materialen, setMaterialen] = useState<Materiaal[]>([])
  const [zoek, setZoek] = useState('')
  const [filterGroep, setFilterGroep] = useState('')
  const [filterLeverancier, setFilterLeverancier] = useState('')
  const [filterMerk, setFilterMerk] = useState('')
  const [filterStatus, setFilterStatus] = useState<'alle' | 'actief' | 'inactief'>('actief')
  const [laden, setLaden] = useState(true)
  const [importBezig, setImportBezig] = useState(false)
  const [importResultaat, setImportResultaat] = useState<{ aangemaakt: number; bijgewerkt: number; fouten: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const dicoRef = useRef<HTMLInputElement>(null)
  const tabelRef = useRef<HTMLDivElement>(null)
  // Zojuist toegevoegde regel: krijgt een accent zodat hij niet ongemerkt tussen
  // de rest verdwijnt.
  const [nieuwId, setNieuwId] = useState<string | null>(null)
  const [nieuwOpen, setNieuwOpen] = useState(false)

  const [groepOpties, setGroepOpties] = useState<string[]>([])

  const laad = useCallback(async () => {
    setLaden(true)
    try {
      setMaterialen(await getMaterialen())
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { void laad() }, [laad])
  useEffect(() => { getMateriaalgroepen().then(setGroepOpties).catch(() => setGroepOpties([])) }, [])

  const wijzig = useCallback((id: string, patch: Partial<Materiaal>) => {
    // Optimistisch in de UI, daarna persisteren naar Supabase.
    setMaterialen(prev => prev.map(m => m.id === id ? { ...m, ...patch } : m))
    void wijzigMateriaal(id, patch).catch(() => { void laad() })
  }, [laad])

  const voegToe = useCallback(async (invoer: Partial<Materiaal>) => {
    try {
      const nieuw = await maakMateriaal(invoer)
      // De nieuwe regel zou anders wegvallen achter een actief filter of onderaan de
      // (op omschrijving gesorteerde) lijst van ~1900 regels belanden. Filters wissen
      // en bovenaan tonen, met accent.
      setZoek('')
      setFilterGroep('')
      setFilterLeverancier('')
      setFilterMerk('')
      setFilterStatus('actief')
      setMaterialen(prev => [nieuw, ...prev])
      setNieuwId(nieuw.id)
      tabelRef.current?.scrollTo({ top: 0 })
      toast.success('Materiaal toegevoegd')
    } catch (err) {
      toast.error(`Materiaal aanmaken mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
      throw err
    }
  }, [])

  const verwijder = useCallback((id: string) => {
    if (!confirm('Materiaal verwijderen?')) return
    setMaterialen(prev => prev.filter(m => m.id !== id))
    void verwijderMateriaalDb(id).catch(() => { void laad() })
  }, [laad])

  // ─── Filters ──────────────────────────────────────────────────────────────

  const leveranciers = Array.from(new Set(materialen.map(m => m.leverancier).filter(Boolean) as string[])).sort()
  const groepen      = Array.from(new Set(materialen.map(m => m.materiaalgroep).filter(Boolean) as string[])).sort()
  const merken       = Array.from(new Set(materialen.map(m => m.merk).filter(Boolean) as string[])).sort()

  const gefilterd = materialen.filter(m => {
    if (filterStatus !== 'alle' && m.status !== filterStatus) return false
    if (filterGroep && m.materiaalgroep !== filterGroep) return false
    if (filterLeverancier && m.leverancier !== filterLeverancier) return false
    if (filterMerk && m.merk !== filterMerk) return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return (
        m.omschrijving.toLowerCase().includes(q) ||
        (m.leverancier?.toLowerCase().includes(q) ?? false) ||
        (m.merk?.toLowerCase().includes(q) ?? false) ||
        (m.artikelnummer?.toLowerCase().includes(q) ?? false) ||
        (m.materiaalgroep?.toLowerCase().includes(q) ?? false) ||
        (m.leverancier_productgroep?.toLowerCase().includes(q) ?? false)
      )
    }
    return true
  })

  // ─── Excel export ─────────────────────────────────────────────────────────

  const downloadSjabloon = () => {
    window.location.href = '/everts-calc/api/materialen/sjabloon'
  }

  // ─── Excel import ─────────────────────────────────────────────────────────

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setImportBezig(true)
    setImportResultaat(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await bestand.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rijen = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      const items: Partial<Materiaal>[] = rijen.map(rij => {
        const kostprijsRaw = parseFloat(String(rij['Kostprijs'] ?? rij['kostprijs'] ?? '0').replace(',', '.'))
        const statusRaw    = String(rij['Status'] ?? rij['status'] ?? 'actief').trim().toLowerCase()
        const status: MateriaalStatus = statusRaw === 'inactief' ? 'inactief' : 'actief'
        return {
          omschrijving:   String(rij['Omschrijving']   ?? rij['omschrijving']   ?? '').trim(),
          leverancier:    String(rij['Leverancier']    ?? rij['leverancier']    ?? '').trim() || undefined,
          artikelnummer:  String(rij['Artikelnummer']  ?? rij['artikelnummer']  ?? '').trim() || undefined,
          materiaalgroep: String(rij['Materiaalgroep'] ?? rij['materiaalgroep'] ?? '').trim() || undefined,
          eenheid:        String(rij['Eenheid']        ?? rij['eenheid']        ?? 'ltr').trim() || 'ltr',
          kostprijs:      isNaN(kostprijsRaw) ? 0 : kostprijsRaw,
          status,
        }
      })

      const resultaat = await importMaterialen(items, 'excel')
      await laad()
      setImportResultaat(resultaat)
    } catch (err) {
      setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [String(err)] })
    } finally {
      setImportBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ─── DICO-import ──────────────────────────────────────────────────────────

  const handleDicoImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setImportBezig(true)
    setImportResultaat(null)
    try {
      const form = new FormData()
      form.append('file', bestand)
      const res = await fetch('/everts-calc/api/materialen/dico', { method: 'POST', body: form })
      const json = await res.json()
      if (!res.ok) {
        setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [json.error ?? 'DICO-import mislukt'] })
      } else {
        await laad()
        setImportResultaat({ aangemaakt: json.aangemaakt ?? 0, bijgewerkt: json.bijgewerkt ?? 0, fouten: json.fouten ?? [] })
      }
    } catch (err) {
      setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [String(err)] })
    } finally {
      setImportBezig(false)
      if (dicoRef.current) dicoRef.current.value = ''
    }
  }

  const actieveFilters = [filterStatus !== 'actief', !!filterGroep, !!filterLeverancier, !!filterMerk].filter(Boolean).length

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ─── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-3 bg-white border-b border-slate-200 flex items-center gap-3 flex-wrap">

        {/* Zoekbalk */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoeken op omschrijving, leverancier, artikelnr..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
          {zoek && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setZoek('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as typeof filterStatus)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-everts/40 bg-white"
          >
            <option value="alle">Alle statussen</option>
            <option value="actief">Alleen actief</option>
            <option value="inactief">Alleen inactief</option>
          </select>

          {/* Groep filter */}
          <select
            value={filterGroep}
            onChange={e => setFilterGroep(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-everts/40 bg-white"
          >
            <option value="">Alle groepen</option>
            {groepen.map(g => <option key={g} value={g}>{g}</option>)}
          </select>

          {/* Leverancier filter */}
          {leveranciers.length > 0 && (
            <select
              value={filterLeverancier}
              onChange={e => setFilterLeverancier(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-everts/40 bg-white"
            >
              <option value="">Alle leveranciers</option>
              {leveranciers.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}

          {/* Merk filter */}
          {merken.length > 0 && (
            <select
              value={filterMerk}
              onChange={e => setFilterMerk(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:border-everts/40 bg-white"
            >
              <option value="">Alle merken</option>
              {merken.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          )}

          {/* Reset filters */}
          {actieveFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterStatus('actief'); setFilterGroep(''); setFilterLeverancier(''); setFilterMerk('') }}
            >
              Filters wissen ({actieveFilters})
            </Button>
          )}
        </div>

        {/* Acties */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={downloadSjabloon}
            title="Excel sjabloon downloaden"
          >
            <Download className="w-3.5 h-3.5" /> Sjabloon
          </Button>

          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={importBezig}
            title="Excel importeren"
          >
            {importBezig ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
            Excel
          </Button>

          <input ref={dicoRef} type="file" accept=".xml,.dico,text/xml,application/xml" className="hidden" onChange={handleDicoImport} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => dicoRef.current?.click()}
            disabled={importBezig}
            title="DICO-bestand importeren (Ketenstandaard artikel-XML)"
          >
            {importBezig ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
            DICO
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setNieuwOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Materiaal toevoegen
          </Button>
        </div>
      </div>

      {nieuwOpen && (
        <NieuwMateriaalModal
          groepOpties={groepOpties}
          onSluiten={() => setNieuwOpen(false)}
          onOpslaan={voegToe}
        />
      )}

      {/* ─── Import resultaat ─────────────────────────────────────────────── */}
      {importResultaat && (
        <div className="flex-shrink-0 px-4 py-2 border-b">
          <Alert
            tone={importResultaat.fouten.length > 0 ? 'warning' : 'success'}
            onClose={() => setImportResultaat(null)}
          >
            {importResultaat.aangemaakt} aangemaakt, {importResultaat.bijgewerkt} bijgewerkt
            {importResultaat.fouten.length > 0 && ` · ${importResultaat.fouten.length} fouten`}
            {importResultaat.fouten.slice(0, 2).map((f, i) => (
              <span key={i} className="block text-error-700">{f}</span>
            ))}
          </Alert>
        </div>
      )}

      {/* ─── Samenvatting ─────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-700">{gefilterd.length}</span> van {materialen.length} materialen
        </span>
        {zoek && <span>· filter: <em>"{zoek}"</em></span>}
      </div>

      {/* ─── Tabel ────────────────────────────────────────────────────────── */}
      <div ref={tabelRef} className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '900px' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-[11px] text-slate-500 uppercase tracking-wide">
              <th className="min-w-[140px] px-2 py-2 text-left font-medium">Leverancier</th>
              <th className="min-w-[120px] px-2 py-2 text-left font-medium">Merk</th>
              <th className="min-w-[120px] px-2 py-2 text-left font-medium">Artikelnummer</th>
              <th className="min-w-[200px] px-2 py-2 text-left font-medium">Omschrijving</th>
              <th className="min-w-[160px] px-2 py-2 text-left font-medium">Materiaalgroep</th>
              <th className="w-16 px-2 py-2 text-left font-medium">Eenheid</th>
              <th className="w-24 px-2 py-2 text-right font-medium">Kostprijs</th>
              <th className="w-24 px-2 py-2 text-center font-medium">Status</th>
              <th className="w-8 px-1 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {gefilterd.map(m => (
              <MateriaalRij
                key={m.id}
                materiaal={m}
                groepOpties={groepOpties}
                isNieuw={m.id === nieuwId}
                onWijzig={patch => wijzig(m.id, patch)}
                onVerwijder={() => verwijder(m.id)}
              />
            ))}
          </tbody>
        </table>

        {laden && (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Spinner size="sm" /> <span className="ml-2 text-sm">Materialen laden…</span>
          </div>
        )}

        {!laden && gefilterd.length === 0 && (
          <EmptyState
            tone="neutral"
            title={materialen.length === 0 ? 'Nog geen materialen' : 'Geen materialen gevonden'}
            description={
              materialen.length === 0
                ? 'Klik op "Materiaal toevoegen" om te beginnen, of importeer een Excel-bestand.'
                : 'Pas de filters of zoekterm aan.'
            }
          />
        )}
      </div>
    </div>
  )
}
