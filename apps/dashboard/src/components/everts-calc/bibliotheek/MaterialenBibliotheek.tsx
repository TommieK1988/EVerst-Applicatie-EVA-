'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Plus, Trash2, Download, Upload, Search, X } from 'lucide-react'
import { getMaterialen, slaMateriaalOp, verwijderMateriaal } from '@/lib/everts-calc/local-store'
import { nieuweId } from '@/lib/everts-calc/utils'
import type { Materiaal, MateriaalStatus } from '@/lib/everts-calc/types'
import { MATERIAAL_GROEPEN } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import { Alert } from '@/components/ui/alert'

const STANDAARD_EENHEDEN = ['m²', 'm¹', 'st', 'ltr', 'kg', 'set', 'uur', 'dag', 'm³']

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
  waarde, placeholder = '0', stap = '0.01', cls = '',
  onOpslaan,
}: { waarde: number; placeholder?: string; stap?: string; cls?: string; onOpslaan: (v: number) => void }) {
  const [lokaal, setLokaal] = useState(waarde === 0 ? '' : String(waarde))
  useEffect(() => setLokaal(waarde === 0 ? '' : String(waarde)), [waarde])

  return (
    <input
      type="number"
      step={stap}
      min="0"
      value={lokaal}
      placeholder={placeholder}
      onChange={e => setLokaal(e.target.value)}
      onBlur={() => { const v = parseFloat(lokaal); onOpslaan(isNaN(v) ? 0 : v) }}
      onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
      className={`w-full text-xs text-right  px-1.5 py-1 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
        hover:bg-white focus:bg-white placeholder-slate-300 ${cls}`}
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
  materiaal, onWijzig, onVerwijder,
}: {
  materiaal: Materiaal
  onWijzig: (patch: Partial<Materiaal>) => void
  onVerwijder: () => void
}) {
  const isInactief = materiaal.status === 'inactief'

  return (
    <tr className={`group border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${isInactief ? 'opacity-50' : ''}`}>
      {/* Leverancier */}
      <td className="px-1 py-0.5">
        <InlineTekst
          waarde={materiaal.leverancier ?? ''}
          placeholder="Leverancier..."
          onOpslaan={v => onWijzig({ leverancier: v || undefined })}
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
          {MATERIAAL_GROEPEN.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
      </td>

      {/* Eenheid */}
      <td className="px-1 py-0.5 w-16">
        <select
          value={materiaal.eenheid}
          onChange={e => onWijzig({ eenheid: e.target.value })}
          className="w-full text-xs px-1.5 py-1 rounded border border-transparent
            hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
            hover:bg-white focus:bg-white cursor-pointer "
        >
          {STANDAARD_EENHEDEN.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
      </td>

      {/* Kostprijs */}
      <td className="px-1 py-0.5 w-24">
        <div className="flex items-center gap-0.5">
          <span className="text-[10px] text-slate-300 flex-shrink-0">€</span>
          <InlineGetal
            waarde={materiaal.kostprijs}
            placeholder="0.00"
            stap="0.01"
            cls="text-slate-700"
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

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function MaterialenBibliotheek() {
  const [materialen, setMaterialen] = useState<Materiaal[]>([])
  const [zoek, setZoek] = useState('')
  const [filterGroep, setFilterGroep] = useState('')
  const [filterLeverancier, setFilterLeverancier] = useState('')
  const [filterStatus, setFilterStatus] = useState<'alle' | 'actief' | 'inactief'>('actief')
  const [importBezig, setImportBezig] = useState(false)
  const [importResultaat, setImportResultaat] = useState<{ aangemaakt: number; bijgewerkt: number; fouten: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const laad = useCallback(() => {
    setMaterialen(getMaterialen())
  }, [])

  useEffect(() => { laad() }, [laad])

  const wijzig = useCallback((id: string, patch: Partial<Materiaal>) => {
    setMaterialen(prev => {
      const bijgewerkt = prev.map(m => m.id === id ? { ...m, ...patch } : m)
      const mat = bijgewerkt.find(m => m.id === id)
      if (mat) slaMateriaalOp(mat)
      return bijgewerkt
    })
  }, [])

  const voegToe = useCallback(() => {
    const nieuw: Materiaal = {
      id: nieuweId(),
      omschrijving: '',
      eenheid: 'ltr',
      kostprijs: 0,
      status: 'actief',
      aangepast_op: new Date().toISOString(),
    }
    slaMateriaalOp(nieuw)
    setMaterialen(prev => [...prev, nieuw])
  }, [])

  const verwijder = useCallback((id: string) => {
    if (!confirm('Materiaal verwijderen?')) return
    verwijderMateriaal(id)
    setMaterialen(prev => prev.filter(m => m.id !== id))
  }, [])

  // ─── Filters ──────────────────────────────────────────────────────────────

  const leveranciers = Array.from(new Set(materialen.map(m => m.leverancier).filter(Boolean) as string[])).sort()
  const groepen      = Array.from(new Set(materialen.map(m => m.materiaalgroep).filter(Boolean) as string[])).sort()

  const gefilterd = materialen.filter(m => {
    if (filterStatus !== 'alle' && m.status !== filterStatus) return false
    if (filterGroep && m.materiaalgroep !== filterGroep) return false
    if (filterLeverancier && m.leverancier !== filterLeverancier) return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return (
        m.omschrijving.toLowerCase().includes(q) ||
        (m.leverancier?.toLowerCase().includes(q) ?? false) ||
        (m.artikelnummer?.toLowerCase().includes(q) ?? false) ||
        (m.materiaalgroep?.toLowerCase().includes(q) ?? false)
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

      let aangemaakt = 0
      let bijgewerkt = 0
      const fouten: string[] = []

      for (let i = 0; i < rijen.length; i++) {
        const rij = rijen[i]
        const omschr = String(rij['Omschrijving'] ?? rij['omschrijving'] ?? '').trim()
        if (!omschr) { fouten.push(`Rij ${i + 2}: Omschrijving ontbreekt`); continue }

        const leverancier  = String(rij['Leverancier']   ?? rij['leverancier']   ?? '').trim() || undefined
        const artikelnr    = String(rij['Artikelnummer']  ?? rij['artikelnummer'] ?? '').trim() || undefined
        const groep        = String(rij['Materiaalgroep'] ?? rij['materiaalgroep'] ?? '').trim() || undefined
        const eenheid      = String(rij['Eenheid']        ?? rij['eenheid']       ?? 'ltr').trim() || 'ltr'
        const kostprijsRaw = parseFloat(String(rij['Kostprijs'] ?? rij['kostprijs'] ?? '0').replace(',', '.'))
        const kostprijs    = isNaN(kostprijsRaw) ? 0 : kostprijsRaw
        const statusRaw    = String(rij['Status'] ?? rij['status'] ?? 'actief').trim().toLowerCase()
        const status: MateriaalStatus = statusRaw === 'inactief' ? 'inactief' : 'actief'

        // Find bestaand op artikelnummer+leverancier, anders nieuw aanmaken
        const huidig = materialen.find(m =>
          artikelnr && m.artikelnummer === artikelnr &&
          (!leverancier || m.leverancier === leverancier)
        )

        if (huidig) {
          const bijgewerktMat: Materiaal = {
            ...huidig, omschrijving: omschr, leverancier, artikelnummer: artikelnr,
            materiaalgroep: groep, eenheid, kostprijs, status,
          }
          slaMateriaalOp(bijgewerktMat)
          bijgewerkt++
        } else {
          const nieuw: Materiaal = {
            id: nieuweId(), omschrijving: omschr, leverancier, artikelnummer: artikelnr,
            materiaalgroep: groep, eenheid, kostprijs, status,
            aangepast_op: new Date().toISOString(),
          }
          slaMateriaalOp(nieuw)
          aangemaakt++
        }
      }

      laad()
      setImportResultaat({ aangemaakt, bijgewerkt, fouten })
    } catch (err) {
      setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [String(err)] })
    } finally {
      setImportBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const actieveFilters = [filterStatus !== 'actief', !!filterGroep, !!filterLeverancier].filter(Boolean).length

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

          {/* Reset filters */}
          {actieveFilters > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setFilterStatus('actief'); setFilterGroep(''); setFilterLeverancier('') }}
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
            Importeren
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={voegToe}
          >
            <Plus className="w-3.5 h-3.5" /> Materiaal toevoegen
          </Button>
        </div>
      </div>

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
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: '900px' }}>
          <thead className="sticky top-0 z-10">
            <tr className="bg-slate-100 text-[11px] text-slate-500 uppercase tracking-wide">
              <th className="min-w-[140px] px-2 py-2 text-left font-medium">Leverancier</th>
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
                onWijzig={patch => wijzig(m.id, patch)}
                onVerwijder={() => verwijder(m.id)}
              />
            ))}
          </tbody>
        </table>

        {gefilterd.length === 0 && (
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
