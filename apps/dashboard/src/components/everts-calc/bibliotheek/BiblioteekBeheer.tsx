'use client'

import { useState, useTransition, useRef, useEffect } from 'react'
import { Search, BookOpen, Pencil, Trash2, Plus, Upload, ChevronDown, Download } from 'lucide-react'
import toast from 'react-hot-toast'
import PageHeader from '@/components/everts-calc/shared/PageHeader'
import {
  updateLaborNorm, updateMaterialNorm, updateRecept, verwijderRecept,
  voegLaborNormToe, verwijderLaborNorm, voegMaterialNormToe, verwijderMaterialNorm,
  importeerExcel, maakRecept, leegMaakBibliotheek,
} from '@/app/(platform)/everts-calc/actions/bibliotheek'
import { formatEuro } from '@/lib/everts-calc/calculations'
import { getInstellingen } from '@/lib/everts-calc/local-store'
import { getActieveMaterialen } from '@/app/(platform)/everts-calc/actions/materialen'
import type { PaintItemMetNormen, LaborNorm, MaterialNorm } from '@/lib/everts-calc/services/bibliotheek'
import type { Materiaal, EenheidConfig } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'

const STANDAARD_CATEGORIEEN = ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig']
const STANDAARD_CATEGORIE_CODES: Record<string, string> = {
  Schilderwerk: 'SC', Timmerwerk: 'TI', Metselwerk: 'ME',
  Dakwerk: 'DA', Voegwerk: 'VO', Overig: 'OV',
}
const BTW_TARIEVEN = [
  { value: 'hoog',        label: 'Hoog (21%)' },
  { value: 'laag',        label: 'Laag (9%)' },
  { value: 'vrijgesteld', label: 'Vrijgesteld (0%)' },
]

// ─── Inline bewerkbaar numeriek veld ─────────────────────────────────────────

function InlineGetal({
  waarde, stap = '0.001', breedte = 'w-20',
  onOpslaan,
}: { waarde: number; stap?: string; breedte?: string; onOpslaan: (v: number) => void }) {
  const [lokaal, setLokaal] = useState(waarde.toString())
  const [dirty, setDirty]   = useState(false)

  return (
    <input
      type="number" step={stap} min="0" value={lokaal}
      onChange={e => { setLokaal(e.target.value); setDirty(true) }}
      onBlur={() => {
        if (!dirty) return
        const v = parseFloat(lokaal)
        if (!isNaN(v)) onOpslaan(v)
        setDirty(false)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setLokaal(waarde.toString()); setDirty(false) }
      }}
      className={`${breedte} text-right px-2 py-1 border border-transparent hover:border-slate-300 focus:border-everts focus:outline-none rounded  bg-transparent text-sm`}
    />
  )
}

// ─── Inline bewerkbaar tekstveld ──────────────────────────────────────────────

function InlineTekst({
  waarde, placeholder = '', breedte = 'w-full',
  onOpslaan,
}: { waarde: string; placeholder?: string; breedte?: string; onOpslaan: (v: string) => void }) {
  const [lokaal, setLokaal] = useState(waarde)
  const [dirty, setDirty]   = useState(false)

  return (
    <input
      type="text" value={lokaal} placeholder={placeholder}
      onChange={e => { setLokaal(e.target.value); setDirty(true) }}
      onBlur={() => {
        if (!dirty) return
        onOpslaan(lokaal)
        setDirty(false)
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') { setLokaal(waarde); setDirty(false) }
      }}
      className={`${breedte} px-2 py-1 border border-transparent hover:border-slate-300 focus:border-everts focus:outline-none rounded bg-transparent text-sm`}
    />
  )
}

// ─── Textarea met bullet-knop ─────────────────────────────────────────────────

function BulletTextarea({
  value, onChange, rows = 3, placeholder,
}: { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const insertBullet = () => {
    const el = ref.current
    if (!el) return
    const start = el.selectionStart
    const before = value.substring(0, start)
    const after = value.substring(el.selectionEnd)
    const prefix = before.length === 0 || before.endsWith('\n') ? '• ' : '\n• '
    const newVal = before + prefix + after
    onChange(newVal)
    setTimeout(() => {
      el.selectionStart = el.selectionEnd = start + prefix.length
      el.focus()
    }, 0)
  }

  return (
    <div>
      <div className="flex justify-end mb-1">
        <button type="button" onClick={insertBullet}
          className="text-xs text-slate-400 hover:text-slate-600 hover:bg-slate-100 px-2 py-0.5 rounded transition-colors"
          title="Bullet toevoegen">
          • Bullet
        </button>
      </div>
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts resize-none"
      />
    </div>
  )
}

// ─── Materialen bibliotheek zoeker ───────────────────────────────────────────

function MateriaalBibliotheekZoeker({ onSelect }: {
  onSelect: (m: Materiaal) => void
}) {
  const [open, setOpen] = useState(false)
  const [zoek, setZoek] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [materialen, setMaterialen] = useState<Materiaal[]>([])

  // Laad actieve materialen uit Supabase
  useEffect(() => {
    if (open) getActieveMaterialen().then(setMaterialen).catch(() => setMaterialen([]))
  }, [open])

  const gefilterd = zoek
    ? materialen.filter(m =>
        m.omschrijving.toLowerCase().includes(zoek.toLowerCase()) ||
        (m.artikelnummer?.toLowerCase().includes(zoek.toLowerCase()) ?? false) ||
        (m.leverancier?.toLowerCase().includes(zoek.toLowerCase()) ?? false)
      )
    : materialen

  const openDropdown = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 2, left: r.left })
    }
    setOpen(true)
    setZoek('')
  }

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openDropdown}
        title="Selecteer uit materialen bibliotheek"
        className="flex-shrink-0 p-0.5 text-slate-300 hover:text-everts rounded transition-colors"
      >
        <BookOpen className="w-3.5 h-3.5" />
      </button>
      {open && pos && (
        <div
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 320 }}
          className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
        >
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              type="text"
              value={zoek}
              onChange={e => setZoek(e.target.value)}
              placeholder="Zoek materiaal..."
              className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded focus:outline-none focus:border-everts"
            />
          </div>
          <div className="max-h-52 overflow-y-auto">
            {materialen.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Materialen bibliotheek is leeg</p>
            ) : gefilterd.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">Geen materialen gevonden</p>
            ) : (
              gefilterd.slice(0, 30).map(m => (
                <button
                  key={m.id}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); onSelect(m); setOpen(false) }}
                  className="w-full text-left px-3 py-2 hover:bg-everts/5 text-xs border-b border-slate-50 last:border-0"
                >
                  <div className="font-medium text-slate-700">{m.omschrijving}</div>
                  <div className="flex items-center gap-2 text-slate-400 mt-0.5">
                    {m.leverancier && <span>{m.leverancier}</span>}
                    {m.artikelnummer && <span className="">{m.artikelnummer}</span>}
                    <span className="ml-auto  text-everts">€{m.kostprijs.toFixed(2)}/{m.eenheid}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Arbeidsnorm rij ──────────────────────────────────────────────────────────

function LaborRij({ norm, eenheid }: { norm: LaborNorm; eenheid: string }) {
  const [, start] = useTransition()

  const sla = (data: { hours_per_unit?: number; hour_rate?: number; description?: string }) =>
    start(async () => {
      try { await updateLaborNorm(norm.id, data) }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Fout bij opslaan') }
    })

  const verwijder = () =>
    start(async () => {
      try { await verwijderLaborNorm(norm.id) }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })

  const minuten = Math.round(norm.hours_per_unit * 60 * 1000) / 1000

  return (
    <tr className="group text-sm border-b border-slate-100">
      <td className="py-1 pl-3">
        <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">AB</span>
      </td>
      <td className="py-1 text-slate-600">
        <InlineTekst
          waarde={norm.description ?? ''}
          placeholder={`Arbeid (${eenheid})`}
          breedte="w-36"
          onOpslaan={v => sla({ description: v })}
        />
      </td>
      <td className="py-1 text-right">
        <div className="flex items-center justify-end gap-1">
          <InlineGetal waarde={minuten} stap="1" breedte="w-16"
            onOpslaan={v => sla({ hours_per_unit: v / 60 })} />
          <span className="text-slate-400 text-xs">min</span>
        </div>
        <div className="text-right text-xs text-slate-400  pr-1">
          {norm.hours_per_unit.toFixed(4)} u
        </div>
      </td>
      <td className="py-1 text-right">
        <InlineGetal waarde={norm.hour_rate} stap="0.01"
          onOpslaan={v => sla({ hour_rate: v })} />
        <span className="text-slate-400 text-xs ml-1">€/u</span>
      </td>
      <td className="py-1 text-right  text-blue-700 pr-2">{formatEuro(norm.cost_per_unit)}</td>
      <td className="py-1 pr-2">
        <Button variant="ghost" size="icon-sm" onClick={verwijder}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ─── Materiaalnorm rij ────────────────────────────────────────────────────────

function MateriaalRij({ norm, eenheid }: { norm: MaterialNorm; eenheid: string }) {
  const [, start] = useTransition()
  const isOA = norm.norm_type === 'onderaanneming'

  const sla = (data: { quantity_per_unit?: number; unit_price?: number; material_name?: string; unit?: string }) =>
    start(async () => {
      try { await updateMaterialNorm(norm.id, data) }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Fout bij opslaan') }
    })

  const verwijder = () =>
    start(async () => {
      try { await verwijderMaterialNorm(norm.id) }
      catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })

  return (
    <tr className="group text-sm border-b border-slate-100">
      <td className="py-1 pl-3">
        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isOA ? 'bg-purple-100 text-purple-700' : 'bg-red-100 text-red-700'}`}>
          {isOA ? 'OA' : 'MA'}
        </span>
      </td>
      <td className="py-1 text-slate-600 text-xs">
        <div className="flex items-center gap-1">
          <InlineTekst
            waarde={norm.material_name ?? ''}
            placeholder={isOA ? 'Onderaannemer omschrijving' : 'Materiaalomschrijving'}
            breedte="w-36"
            onOpslaan={v => sla({ material_name: v })}
          />
          {!isOA && (
            <MateriaalBibliotheekZoeker
              onSelect={m => sla({ material_name: m.omschrijving, unit_price: m.kostprijs, unit: m.eenheid })}
            />
          )}
        </div>
      </td>
      {isOA ? (
        <>
          <td className="py-1 text-right" colSpan={2}>
            <InlineGetal waarde={norm.unit_price} stap="0.01"
              onOpslaan={v => sla({ unit_price: v, quantity_per_unit: 1 })} />
            <span className="text-slate-400 text-xs ml-1">€/{eenheid}</span>
          </td>
        </>
      ) : (
        <>
          <td className="py-1 text-right">
            <InlineGetal waarde={norm.quantity_per_unit} stap="0.001"
              onOpslaan={v => sla({ quantity_per_unit: v })} />
            <span className="text-slate-400 text-xs ml-1">{norm.unit ?? 'ltr'}/{eenheid}</span>
          </td>
          <td className="py-1 text-right">
            <InlineGetal waarde={norm.unit_price} stap="0.01"
              onOpslaan={v => sla({ unit_price: v })} />
            <span className="text-slate-400 text-xs ml-1">€/{norm.unit ?? 'ltr'}</span>
          </td>
        </>
      )}
      <td className="py-1 text-right  pr-2" style={{ color: isOA ? '#7c3aed' : '#b45309' }}>
        {formatEuro(norm.cost_per_unit)}
      </td>
      <td className="py-1 pr-2">
        <Button variant="ghost" size="icon-sm" onClick={verwijder}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ─── Bewerk-paneel (slide-over) ────────────────────────────────────────────────

function BewerkPaneel({
  item,
  eenheden,
  categorieen,
  onSluiten,
}: {
  item: PaintItemMetNormen
  eenheden: EenheidConfig[]
  categorieen: string[]
  onSluiten: () => void
}) {
  const [isPending, start] = useTransition()
  const [nwLaborOpen, setNwLaborOpen]   = useState(false)
  const [nwMatOpen,   setNwMatOpen]     = useState(false)
  const [nwOaOpen,    setNwOaOpen]      = useState(false)

  // Basisgegevens bewerkbaar
  const [code,   setCode]   = useState(item.item_code ?? '')
  const [naam,   setNaam]   = useState(item.full_name)
  const [eenh,   setEenh]   = useState(item.default_unit ?? '')
  const [cat,    setCat]    = useState(item.onderdeel)
  const [omschr, setOmschr] = useState(item.description ?? '')
  const [btw,    setBtw]    = useState(item.btw_tarief ?? 'hoog')

  const slaBasiOp = () => {
    start(async () => {
      try {
        await updateRecept(item.id, {
          item_code:    code,
          full_name:    naam,
          default_unit: eenh,
          onderdeel:    cat,
          description:  omschr,
          btw_tarief:   btw,
        })
        toast.success('Recept opgeslagen')
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })
  }

  // Nieuwe arbeidsnorm
  const [nwMin,    setNwMin]    = useState(0)
  const [nwTarief, setNwTarief] = useState(58)
  const [nwArbOmschr, setNwArbOmschr] = useState('')

  const voegLaborToe = () =>
    start(async () => {
      try {
        await voegLaborNormToe(item.id, item.treatment_id ?? '', item.item_code ?? item.id, {
          hours_per_unit: nwMin / 60,
          hour_rate: nwTarief,
          unit: 'uur',
          description: nwArbOmschr || undefined,
        })
        setNwLaborOpen(false); setNwMin(0); setNwTarief(58); setNwArbOmschr('')
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })

  // Nieuwe materiaalnorm
  const [nwMatNaam,  setNwMatNaam]  = useState('')
  const [nwMatQty,   setNwMatQty]   = useState(0)
  const [nwMatPrijs, setNwMatPrijs] = useState(0)
  const [nwMatEenh,  setNwMatEenh]  = useState('ltr')

  const voegMatToe = () =>
    start(async () => {
      if (!nwMatNaam) { toast.error('Vul een materiaalnaam in'); return }
      try {
        await voegMaterialNormToe(item.id, item.treatment_id ?? '', item.item_code ?? item.id, {
          material_name: nwMatNaam, quantity_per_unit: nwMatQty,
          unit_price: nwMatPrijs, unit: nwMatEenh, norm_type: 'materiaal',
        })
        setNwMatOpen(false); setNwMatNaam(''); setNwMatQty(0); setNwMatPrijs(0)
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })

  // Nieuwe onderaanneming
  const [nwOaNaam,  setNwOaNaam]  = useState('')
  const [nwOaPrijs, setNwOaPrijs] = useState(0)

  const voegOaToe = () =>
    start(async () => {
      if (!nwOaNaam) { toast.error('Vul een omschrijving in'); return }
      try {
        await voegMaterialNormToe(item.id, item.treatment_id ?? '', item.item_code ?? item.id, {
          material_name: nwOaNaam, quantity_per_unit: 1,
          unit_price: nwOaPrijs, unit: item.default_unit ?? 'eenh', norm_type: 'onderaanneming',
        })
        setNwOaOpen(false); setNwOaNaam(''); setNwOaPrijs(0)
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })

  const eenheid = item.default_unit ?? 'eenh'
  const materiaalNorms = item.material_norms.filter(n => n.norm_type !== 'onderaanneming')
  const oaNorms        = item.material_norms.filter(n => n.norm_type === 'onderaanneming')

  const totaalArbeid    = item.labor_norms.reduce((s, n) => s + n.cost_per_unit, 0)
  const totaalMateriaal = materiaalNorms.reduce((s, n) => s + n.cost_per_unit, 0)
  const totaalOa        = oaNorms.reduce((s, n) => s + n.cost_per_unit, 0)

  return (
    <Dialog open onOpenChange={open => { if (!open) onSluiten() }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div>
            <DialogTitle>{item.full_name}</DialogTitle>
            <div className="text-xs text-slate-400  mt-0.5">{item.item_code}</div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* Basisgegevens */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Basisgegevens</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Code', val: code, set: setCode },
                { label: 'Naam', val: naam, set: setNaam },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-xs text-slate-500 mb-1">{label}</label>
                  <input value={val} onChange={e => set(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Eenheid</label>
                <select value={eenh} onChange={e => setEenh(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                  {eenheden.map(e => <option key={e.afkorting} value={e.afkorting} title={e.omschrijving}>{e.afkorting}</option>)}
                  {!eenheden.some(e => e.afkorting === eenh) && eenh && <option value={eenh}>{eenh}</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Categorie</label>
                <select value={cat} onChange={e => setCat(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                  {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
                  {!categorieen.includes(cat) && cat && <option value={cat}>{cat}</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">BTW tarief</label>
                <select value={btw} onChange={e => setBtw(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                  {BTW_TARIEVEN.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Uitgebreide werkomschrijving */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Werkomschrijving</h3>
            <BulletTextarea
              value={omschr}
              onChange={setOmschr}
              rows={3}
              placeholder="Uitgebreide omschrijving van de werkzaamheden..."
            />
          </section>

          {/* Arbeidsnormen */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Arbeidsnormen
                <span className="ml-2 text-blue-700  normal-case">{formatEuro(totaalArbeid)}/{eenheid}</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setNwLaborOpen(o => !o)}>
                <Plus className="w-3.5 h-3.5" /> Toevoegen
              </Button>
            </div>

            {item.labor_norms.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-400 border-b border-slate-100">
                    <th className="text-left pb-1 pl-3 w-10" />
                    <th className="text-left pb-1">Omschrijving</th>
                    <th className="text-right pb-1">Minuten</th>
                    <th className="text-right pb-1">Tarief</th>
                    <th className="text-right pb-1 pr-2">Kosten</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {item.labor_norms.map(n => (
                    <LaborRij key={n.id} norm={n} eenheid={eenheid} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-400 italic">Geen arbeidsnormen</p>
            )}

            {nwLaborOpen && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                <div>
                  <label className="text-xs text-slate-500">Omschrijving</label>
                  <input value={nwArbOmschr} onChange={e => setNwArbOmschr(e.target.value)}
                    placeholder="bijv. Voorstrijken, Dekkend schilderen"
                    className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-everts" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Minuten/{eenheid}</label>
                    <input type="number" step="1" min="0" value={nwMin}
                      onChange={e => setNwMin(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm  text-right focus:outline-none focus:border-everts" />
                    <div className="text-xs text-slate-400 mt-0.5 text-right">{(nwMin / 60).toFixed(4)} uur</div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Tarief (€/uur)</label>
                    <input type="number" step="0.01" min="0" value={nwTarief}
                      onChange={e => setNwTarief(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm  text-right focus:outline-none focus:border-everts" />
                    <div className="text-xs text-slate-400 mt-0.5 text-right">
                      {formatEuro((nwMin / 60) * nwTarief)}/{eenheid}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={voegLaborToe}>Opslaan</Button>
                  <Button variant="ghost" size="sm" onClick={() => setNwLaborOpen(false)}>Annuleren</Button>
                </div>
              </div>
            )}
          </section>

          {/* Materiaalnormen */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Materiaalnormen
                <span className="ml-2 text-red-700  normal-case">{formatEuro(totaalMateriaal)}/{eenheid}</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setNwMatOpen(o => !o)}>
                <Plus className="w-3.5 h-3.5" /> Toevoegen
              </Button>
            </div>

            {materiaalNorms.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {materiaalNorms.map(n => (
                    <MateriaalRij key={n.id} norm={n} eenheid={eenheid} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-400 italic">Geen materiaalnormen</p>
            )}

            {nwMatOpen && (
              <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-200 space-y-2">
                <div>
                  <label className="text-xs text-slate-500">Materiaal omschrijving</label>
                  <div className="flex items-center gap-1 mt-1">
                    <input value={nwMatNaam} onChange={e => setNwMatNaam(e.target.value)}
                      placeholder="bijv. Grondverf alkyd"
                      className="flex-1 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-everts" />
                    <MateriaalBibliotheekZoeker
                      onSelect={m => { setNwMatNaam(m.omschrijving); setNwMatPrijs(m.kostprijs); setNwMatEenh(m.eenheid) }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Inzet/{eenheid}</label>
                    <input type="number" step="0.001" min="0" value={nwMatQty}
                      onChange={e => setNwMatQty(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm  text-right focus:outline-none focus:border-everts" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Eenheid</label>
                    <input value={nwMatEenh} onChange={e => setNwMatEenh(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-everts" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Prijs (€/eenh)</label>
                    <input type="number" step="0.01" min="0" value={nwMatPrijs}
                      onChange={e => setNwMatPrijs(parseFloat(e.target.value) || 0)}
                      className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm  text-right focus:outline-none focus:border-everts" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={voegMatToe}>Opslaan</Button>
                  <Button variant="ghost" size="sm" onClick={() => setNwMatOpen(false)}>Annuleren</Button>
                </div>
              </div>
            )}
          </section>

          {/* Onderaanneming */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Onderaanneming
                <span className="ml-2 text-purple-700  normal-case">{formatEuro(totaalOa)}/{eenheid}</span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setNwOaOpen(o => !o)}>
                <Plus className="w-3.5 h-3.5" /> Toevoegen
              </Button>
            </div>

            {oaNorms.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {oaNorms.map(n => (
                    <MateriaalRij key={n.id} norm={n} eenheid={eenheid} />
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-slate-400 italic">Geen onderaanneming</p>
            )}

            {nwOaOpen && (
              <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200 space-y-2">
                <div>
                  <label className="text-xs text-slate-500">Omschrijving onderaannemer</label>
                  <input value={nwOaNaam} onChange={e => setNwOaNaam(e.target.value)}
                    placeholder="bijv. Steiger huren, Spuitwerk"
                    className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm focus:outline-none focus:border-everts" />
                </div>
                <div>
                  <label className="text-xs text-slate-500">Prijs (€/{eenheid})</label>
                  <input type="number" step="0.01" min="0" value={nwOaPrijs}
                    onChange={e => setNwOaPrijs(parseFloat(e.target.value) || 0)}
                    className="w-full mt-1 px-2 py-1.5 border border-slate-200 rounded text-sm  text-right focus:outline-none focus:border-everts" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={voegOaToe}>Opslaan</Button>
                  <Button variant="ghost" size="sm" onClick={() => setNwOaOpen(false)}>Annuleren</Button>
                </div>
              </div>
            )}
          </section>

          {/* Totaal */}
          <div className="py-3 border-t border-slate-200 space-y-1">
            {totaalArbeid > 0 && (
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Arbeid</span>
                <span className=" text-blue-700">{formatEuro(totaalArbeid)}</span>
              </div>
            )}
            {totaalMateriaal > 0 && (
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Materiaal</span>
                <span className=" text-red-700">{formatEuro(totaalMateriaal)}</span>
              </div>
            )}
            {totaalOa > 0 && (
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Onderaanneming</span>
                <span className=" text-purple-700">{formatEuro(totaalOa)}</span>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <span className="text-sm font-medium text-slate-600">Totaal / {eenheid}</span>
              <span className="text-base font-bold text-everts-dark ">
                {formatEuro(totaalArbeid + totaalMateriaal + totaalOa)}
              </span>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onSluiten}>Sluiten</Button>
          <Button onClick={slaBasiOp} loading={isPending}>Opslaan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Nieuw recept modal ────────────────────────────────────────────────────────

function NieuwReceptModal({
  items,
  eenheden,
  categorieen,
  categorieCodes,
  onSluiten,
  onAangemaakt,
}: {
  items: PaintItemMetNormen[]
  eenheden: EenheidConfig[]
  categorieen: string[]
  categorieCodes: Record<string, string>
  onSluiten: () => void
  onAangemaakt: (id: string) => void
}) {
  const [, start] = useTransition()
  const [cat,    setCat]    = useState('')
  const [code,   setCode]   = useState('')
  const [naam,   setNaam]   = useState('')
  const [eenh,   setEenh]   = useState('m²')
  const [btw,    setBtw]    = useState('hoog')
  const [omschr, setOmschr] = useState('')

  const handleCatChange = (newCat: string) => {
    setCat(newCat)
    if (!newCat) { setCode(''); return }
    const prefix = (categorieCodes[newCat] || newCat.substring(0, 2)).toUpperCase()
    const pattern = new RegExp(`^${prefix}-(\\d+)$`)
    const nummers = items
      .map(i => i.item_code?.match(pattern)?.[1])
      .filter(Boolean)
      .map(Number)
    const nextNr = (nummers.length > 0 ? Math.max(...nummers) : 0) + 1
    setCode(`${prefix}-${String(nextNr).padStart(3, '0')}`)
  }

  const maak = () => {
    if (!code || !naam || !cat) { toast.error('Vul alle velden in'); return }
    start(async () => {
      try {
        const id = await maakRecept({
          item_code: code, full_name: naam, default_unit: eenh,
          onderdeel: cat, description: omschr || undefined, btw_tarief: btw,
        })
        toast.success('Recept aangemaakt')
        onAangemaakt(id)
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Fout') }
    })
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onSluiten() }}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Nieuw recept</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* Categorie bovenaan */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Categorie *</label>
            <select value={cat} onChange={e => handleCatChange(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
              <option value="">— kies categorie —</option>
              {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code *</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="bijv. SC-001"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts " />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Eenheid *</label>
              <select value={eenh} onChange={e => setEenh(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
                {eenheden.map(e => <option key={e.afkorting} value={e.afkorting} title={e.omschrijving}>{e.afkorting}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Naam *</label>
            <input value={naam} onChange={e => setNaam(e.target.value)} placeholder="bijv. Schilderen 1 laag dekkend"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts" />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">BTW tarief</label>
            <select value={btw} onChange={e => setBtw(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
              {BTW_TARIEVEN.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Werkomschrijving</label>
            <BulletTextarea
              value={omschr}
              onChange={setOmschr}
              rows={3}
              placeholder="Omschrijving van de werkzaamheden..."
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onSluiten}>Annuleren</Button>
          <Button onClick={maak}>Aanmaken</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── BiblioteekBeheer (hoofd) ─────────────────────────────────────────────────

interface Props {
  items: PaintItemMetNormen[]
}

export default function BiblioteekBeheer({ items }: Props) {
  const [zoek, setZoek]               = useState('')
  const [categorie, setCategorie]     = useState('')
  const [bewerkItemId, setBewerkItemId] = useState<string | null>(null)
  const [nieuwOpen, setNieuwOpen]     = useState(false)
  const [importBezig, setImportBezig] = useState(false)

  const inst = getInstellingen()
  const eenheden      = inst.eenheden      ?? []
  const categorieen   = inst.categorieen   ?? STANDAARD_CATEGORIEEN
  const categorieCodes = inst.categorieCodes ?? STANDAARD_CATEGORIE_CODES
  const fileRef = useRef<HTMLInputElement>(null)

  const handleLeegMaak = () => {
    if (!confirm('Alle recepten en normen definitief verwijderen? Dit kan niet ongedaan gemaakt worden.')) return
    leegMaakBibliotheek()
      .then(() => toast.success('Bibliotheek leeggemaakt'))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Fout'))
  }

  const bewerkItem = items.find(i => i.id === bewerkItemId) ?? null

  const gefilterd = items.filter(item => {
    if (categorie && item.onderdeel !== categorie) return false
    if (zoek) {
      const q = zoek.toLowerCase()
      return (
        item.full_name.toLowerCase().includes(q) ||
        (item.item_code ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  const handleVerwijder = (id: string) => {
    if (!confirm('Recept en alle normen verwijderen?')) return
    verwijderRecept(id).then(() => toast.success('Verwijderd')).catch(err => toast.error(err.message))
    if (bewerkItemId === id) setBewerkItemId(null)
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const bestand = e.target.files?.[0]
    if (!bestand) return
    setImportBezig(true)
    try {
      const fd = new FormData()
      fd.append('bestand', bestand)
      const result = await importeerExcel(fd)
      toast.success(`Import klaar: ${result.aangemaakt} nieuw, ${result.bijgewerkt} bijgewerkt`)
      if (result.fouten.length > 0) {
        console.warn('Import fouten:', result.fouten)
        toast.error(`${result.fouten.length} fouten — zie console`)
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import mislukt')
    } finally {
      setImportBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Recepten"
        description={`${items.length} recepten — arbeid en materiaal per activiteit`}
      />

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" value={zoek} onChange={e => setZoek(e.target.value)}
            placeholder="Zoeken op naam of code..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
        </div>

        <div className="relative">
          <select value={categorie} onChange={e => setCategorie(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2.5 border border-slate-300 rounded-lg text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white">
            <option value="">Alle categorieën</option>
            {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="md" asChild>
            <a href="/everts-calc/api/bibliotheek/sjabloon" download="import-sjabloon.xlsx" className="whitespace-nowrap">
              <Download className="w-4 h-4" /> Sjabloon
            </a>
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          <Button
            variant="outline"
            size="md"
            onClick={() => fileRef.current?.click()}
            disabled={importBezig}
            className="whitespace-nowrap"
          >
            {importBezig ? <><Spinner size="sm" /> Importeren...</> : <><Upload className="w-4 h-4" /> Importeer Excel</>}
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={handleLeegMaak}
            className="border-red-200 text-red-500 hover:bg-red-50 whitespace-nowrap"
            title="Alle recepten verwijderen"
          >
            <Trash2 className="w-4 h-4" /> Leeg maken
          </Button>
          <Button size="md" onClick={() => setNieuwOpen(true)} className="whitespace-nowrap">
            <Plus className="w-4 h-4" /> Nieuw recept
          </Button>
        </div>
      </div>

      {/* Tabel */}
      <Card>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-28">Code</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Naam</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-20">Eenh</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-32">Categorie</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Arbeid</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Materiaal</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">OA</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide w-24">Totaal</th>
              <th className="w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {gefilterd.map(item => {
              const arbeid    = item.labor_norms.reduce((s, n) => s + n.cost_per_unit, 0)
              const oa        = item.material_norms.filter(n => n.norm_type === 'onderaanneming').reduce((s, n) => s + n.cost_per_unit, 0)
              const materiaal = item.material_norms.filter(n => n.norm_type !== 'onderaanneming').reduce((s, n) => s + n.cost_per_unit, 0)
              const totaal    = arbeid + materiaal + oa

              return (
                <tr key={item.id}
                  className={`group hover:bg-slate-50 transition-colors ${!item.active ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3">
                    <span className=" text-xs text-slate-400">{item.item_code ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{item.full_name}</td>
                  <td className="px-4 py-3 text-slate-500">{item.default_unit ?? '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full w-fit">
                        {item.onderdeel}
                      </span>
                      {item.btw_tarief && item.btw_tarief !== 'hoog' && (
                        <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded w-fit">
                          BTW {item.btw_tarief}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right  text-blue-700">{formatEuro(arbeid)}</td>
                  <td className="px-4 py-3 text-right  text-red-700">{formatEuro(materiaal)}</td>
                  <td className="px-4 py-3 text-right  text-purple-700">{oa > 0 ? formatEuro(oa) : <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3 text-right  font-semibold text-everts-dark">{formatEuro(totaal)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon-sm" onClick={() => setBewerkItemId(item.id)} title="Bewerken">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" onClick={() => handleVerwijder(item.id)}
                        className="text-slate-400 hover:text-red-500 hover:bg-red-50" title="Verwijderen">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {gefilterd.length === 0 && (
          <EmptyState
            icon={<BookOpen className="w-6 h-6" />}
            title="Geen recepten gevonden"
            description={zoek ? 'Probeer een andere zoekterm' : undefined}
            tone="neutral"
          />
        )}
      </Card>

      {bewerkItem && (
        <BewerkPaneel
          item={bewerkItem}
          eenheden={eenheden}
          categorieen={categorieen}
          onSluiten={() => setBewerkItemId(null)}
        />
      )}

      {nieuwOpen && (
        <NieuwReceptModal
          items={items}
          eenheden={eenheden}
          categorieen={categorieen}
          categorieCodes={categorieCodes}
          onSluiten={() => setNieuwOpen(false)}
          onAangemaakt={id => { setNieuwOpen(false); setBewerkItemId(id) }}
        />
      )}
    </div>
  )
}
