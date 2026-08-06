'use client'

import { useState, useTransition, useRef, useEffect, useMemo } from 'react'
import { BookOpen, Trash2, Plus, Upload, Download, Lock } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import PageHeader from '@/components/everts-calc/shared/PageHeader'
import {
  updateLaborNorm, updateMaterialNorm, updateRecept, verwijderRecept,
  voegLaborNormToe, verwijderLaborNorm, voegMaterialNormToe, verwijderMaterialNorm,
  importeerExcel, maakRecept, leegMaakBibliotheek,
} from '@/app/(platform)/everts-calc/actions/bibliotheek'
import { formatEuro } from '@/lib/everts-calc/calculations'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { getActieveMaterialen } from '@/app/(platform)/everts-calc/actions/materialen'
import type { PaintItemMetNormen, LaborNorm, MaterialNorm } from '@/lib/everts-calc/services/bibliotheek'
import type { Materiaal, EenheidConfig } from '@/lib/everts-calc/types'
import type { GebruikerLayout } from '@everts/database/platform-types'
import OverzichtTabel, { type KolomDefinitie } from '@/components/overzicht/OverzichtTabel'
import { Button } from '@/components/ui/button'
import { BulletTextarea } from '@/components/ui/bullet-textarea'
import { Spinner } from '@/components/ui/spinner'
import { useDialogen } from '@/components/ui/dialogen'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog'

const STANDAARD_CATEGORIEEN = ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Houtrot', 'Overig']
const STANDAARD_CATEGORIE_CODES: Record<string, string> = {
  Schilderwerk: 'SC', Timmerwerk: 'TI', Metselwerk: 'ME',
  Dakwerk: 'DA', Voegwerk: 'VO', Houtrot: 'HR', Overig: 'OV',
}
/** Categorie waaronder de houtrot-recepten vallen; alleen dan is de Houtrot-soort relevant. */
const HOUTROT_CATEGORIE = 'Houtrot'
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

/** Werkomschrijving-veld: groeit mee met de tekst en kan opsommingen maken. */
function WerkomschrijvingVeld({
  value, onChange, minRows = 3, placeholder, disabled = false,
}: { value: string; onChange: (v: string) => void; minRows?: number; placeholder?: string; disabled?: boolean }) {
  return (
    <BulletTextarea
      value={value}
      onChange={onChange}
      minRows={minRows}
      placeholder={placeholder}
      disabled={disabled}
      toonKnop={!disabled}
      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts disabled:bg-slate-50 disabled:text-slate-500"
    />
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

function LaborRij({ norm, eenheid, vergrendeld = false }: { norm: LaborNorm; eenheid: string; vergrendeld?: boolean }) {
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
        {vergrendeld ? (
          <span className="px-1">{norm.description || `Arbeid (${eenheid})`}</span>
        ) : (
          <InlineTekst
            waarde={norm.description ?? ''}
            placeholder={`Arbeid (${eenheid})`}
            breedte="w-36"
            onOpslaan={v => sla({ description: v })}
          />
        )}
      </td>
      <td className="py-1 text-right">
        <div className="flex items-center justify-end gap-1">
          {vergrendeld
            ? <span className="px-1">{minuten}</span>
            : <InlineGetal waarde={minuten} stap="1" breedte="w-16"
                onOpslaan={v => sla({ hours_per_unit: v / 60 })} />}
          <span className="text-slate-400 text-xs">min</span>
        </div>
        <div className="text-right text-xs text-slate-400  pr-1">
          {norm.hours_per_unit.toFixed(4)} u
        </div>
      </td>
      <td className="py-1 text-right">
        {vergrendeld
          ? <span className="px-1">{norm.hour_rate}</span>
          : <InlineGetal waarde={norm.hour_rate} stap="0.01" onOpslaan={v => sla({ hour_rate: v })} />}
        <span className="text-slate-400 text-xs ml-1">€/u</span>
      </td>
      <td className="py-1 text-right  text-blue-700 pr-2">{formatEuro(norm.cost_per_unit)}</td>
      <td className="py-1 pr-2">
        {!vergrendeld && <Button variant="ghost" size="icon-sm" onClick={verwijder}
          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
          <Trash2 className="w-3.5 h-3.5" />
        </Button>}
      </td>
    </tr>
  )
}

// ─── Materiaalnorm rij ────────────────────────────────────────────────────────

function MateriaalRij({ norm, eenheid, vergrendeld = false }: { norm: MaterialNorm; eenheid: string; vergrendeld?: boolean }) {
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
          {vergrendeld ? (
            <span className="px-1">{norm.material_name}</span>
          ) : (
            <InlineTekst
              waarde={norm.material_name ?? ''}
              placeholder={isOA ? 'Onderaannemer omschrijving' : 'Materiaalomschrijving'}
              breedte="w-36"
              onOpslaan={v => sla({ material_name: v })}
            />
          )}
          {!isOA && !vergrendeld && (
            <MateriaalBibliotheekZoeker
              onSelect={m => sla({ material_name: m.omschrijving, unit_price: m.kostprijs, unit: m.eenheid })}
            />
          )}
        </div>
      </td>
      {isOA ? (
        <>
          <td className="py-1 text-right" colSpan={2}>
            {vergrendeld
              ? <span className="px-1">{norm.unit_price}</span>
              : <InlineGetal waarde={norm.unit_price} stap="0.01"
                  onOpslaan={v => sla({ unit_price: v, quantity_per_unit: 1 })} />}
            <span className="text-slate-400 text-xs ml-1">€/{eenheid}</span>
          </td>
        </>
      ) : (
        <>
          <td className="py-1 text-right">
            {vergrendeld
              ? <span className="px-1">{norm.quantity_per_unit}</span>
              : <InlineGetal waarde={norm.quantity_per_unit} stap="0.001"
                  onOpslaan={v => sla({ quantity_per_unit: v })} />}
            <span className="text-slate-400 text-xs ml-1">{norm.unit ?? 'ltr'}/{eenheid}</span>
          </td>
          <td className="py-1 text-right">
            {vergrendeld
              ? <span className="px-1">{norm.unit_price}</span>
              : <InlineGetal waarde={norm.unit_price} stap="0.01"
                  onOpslaan={v => sla({ unit_price: v })} />}
            <span className="text-slate-400 text-xs ml-1">€/{norm.unit ?? 'ltr'}</span>
          </td>
        </>
      )}
      <td className="py-1 text-right  pr-2" style={{ color: isOA ? '#7c3aed' : '#b45309' }}>
        {formatEuro(norm.cost_per_unit)}
      </td>
      <td className="py-1 pr-2">
        {!vergrendeld && (
          <Button variant="ghost" size="icon-sm" onClick={verwijder}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-opacity">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </td>
    </tr>
  )
}

// ─── Bewerk-paneel (slide-over) ────────────────────────────────────────────────

function BewerkPaneel({
  item,
  eenheden,
  categorieen,
  houtrotSoorten,
  onSluiten,
  onVerwijder,
}: {
  item: PaintItemMetNormen
  eenheden: EenheidConfig[]
  categorieen: string[]
  houtrotSoorten: string[]
  onSluiten: () => void
  onVerwijder: () => void
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
  const [groep,  setGroep]  = useState(item.groep ?? '')

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
          groep:        groep.trim() || null,
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
            <DialogTitle className="flex items-center gap-2">
              {item.vergrendeld && <Lock className="w-4 h-4 shrink-0 text-slate-400" />}
              {item.full_name}
            </DialogTitle>
            <div className="text-xs text-slate-400  mt-0.5">{item.item_code}</div>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-6">
          {/* Dit recept is een spiegel van de Schilderwerkbibliotheek: een
              database-trigger schrijft het bij elke bronwijziging opnieuw, dus
              een aanpassing hier zou stilzwijgend verdwijnen. */}
          {item.vergrendeld && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <Lock className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-900">
                <p className="font-medium">Dit recept wordt beheerd in de Schilderwerkbibliotheek.</p>
                <p className="mt-1 text-amber-800">
                  Hier is het alleen-lezen, zodat de twee bibliotheken niet uit elkaar lopen.{' '}
                  <Link href="/everts-calc/bibliotheek/schilderwerk"
                    className="font-medium underline underline-offset-2 hover:text-amber-950">
                    Pas het daar aan
                  </Link>{' '}
                  — de wijziging komt vanzelf hier terug.
                </p>
              </div>
            </div>
          )}

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
                  <input value={val} onChange={e => set(e.target.value)} disabled={item.vergrendeld}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts disabled:bg-slate-50 disabled:text-slate-500" />
                </div>
              ))}
              <div>
                <label className="block text-xs text-slate-500 mb-1">Eenheid</label>
                <select value={eenh} onChange={e => setEenh(e.target.value)} disabled={item.vergrendeld}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white disabled:bg-slate-50 disabled:text-slate-500">
                  {eenheden.map(e => <option key={e.afkorting} value={e.afkorting} title={e.omschrijving}>{e.afkorting}</option>)}
                  {!eenheden.some(e => e.afkorting === eenh) && eenh && <option value={eenh}>{eenh}</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Categorie</label>
                <select value={cat} onChange={e => setCat(e.target.value)} disabled={item.vergrendeld}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white disabled:bg-slate-50 disabled:text-slate-500">
                  {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
                  {!categorieen.includes(cat) && cat && <option value={cat}>{cat}</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">BTW tarief</label>
                <select value={btw} onChange={e => setBtw(e.target.value)} disabled={item.vergrendeld}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white disabled:bg-slate-50 disabled:text-slate-500">
                  {BTW_TARIEVEN.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {(cat === HOUTROT_CATEGORIE || !!groep) && (
                <div className="col-span-2">
                  <label className="block text-xs text-slate-500 mb-1">Houtrot-soort (tussengroep)</label>
                  <input value={groep} onChange={e => setGroep(e.target.value)} list="houtrot-soorten"
                    disabled={item.vergrendeld}
                    placeholder="bijv. Epoxyherstel — leeg = niet in de houtrot-app"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts" />
                  <datalist id="houtrot-soorten">
                    {houtrotSoorten.map(s => <option key={s} value={s} />)}
                  </datalist>
                  <p className="mt-1 text-xs text-slate-400">
                    Waarop de vakman in de app filtert (stap 1), waarna hij het recept kiest bij Werkzaamheden.
                    Alleen recepten mét een soort verschijnen in de houtrot-app.
                  </p>
                </div>
              )}
            </div>
          </section>

          {/* Uitgebreide werkomschrijving */}
          <section>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Werkomschrijving</h3>
            <WerkomschrijvingVeld
              value={omschr}
              onChange={setOmschr}
              minRows={3}
              disabled={item.vergrendeld}
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
              {!item.vergrendeld && (
                <Button variant="ghost" size="sm" onClick={() => setNwLaborOpen(o => !o)}>
                  <Plus className="w-3.5 h-3.5" /> Toevoegen
                </Button>
              )}
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
                    <LaborRij key={n.id} norm={n} eenheid={eenheid} vergrendeld={item.vergrendeld} />
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
              {!item.vergrendeld && (
                <Button variant="ghost" size="sm" onClick={() => setNwMatOpen(o => !o)}>
                  <Plus className="w-3.5 h-3.5" /> Toevoegen
                </Button>
              )}
            </div>

            {materiaalNorms.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {materiaalNorms.map(n => (
                    <MateriaalRij key={n.id} norm={n} eenheid={eenheid} vergrendeld={item.vergrendeld} />
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
              {!item.vergrendeld && (
                <Button variant="ghost" size="sm" onClick={() => setNwOaOpen(o => !o)}>
                  <Plus className="w-3.5 h-3.5" /> Toevoegen
                </Button>
              )}
            </div>

            {oaNorms.length > 0 ? (
              <table className="w-full">
                <tbody>
                  {oaNorms.map(n => (
                    <MateriaalRij key={n.id} norm={n} eenheid={eenheid} vergrendeld={item.vergrendeld} />
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
          {/* Verwijderen zit hier en niet als knopje per tabelrij: dat scheelt een
              kolom in het overzicht en je ziet eerst waar je van af wilt. */}
          <Button
            variant="ghost"
            onClick={onVerwijder}
            className="mr-auto text-error-700 hover:bg-error-50"
          >
            <Trash2 className="w-3.5 h-3.5" /> Verwijderen
          </Button>
          <Button variant="ghost" onClick={onSluiten}>Sluiten</Button>
          {!item.vergrendeld && (
            <Button onClick={slaBasiOp} loading={isPending}>Opslaan</Button>
          )}
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
  houtrotSoorten,
  onSluiten,
  onAangemaakt,
}: {
  items: PaintItemMetNormen[]
  eenheden: EenheidConfig[]
  categorieen: string[]
  categorieCodes: Record<string, string>
  houtrotSoorten: string[]
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
  const [groep,  setGroep]  = useState('')

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
          groep: cat === HOUTROT_CATEGORIE ? (groep.trim() || undefined) : undefined,
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

          {cat === HOUTROT_CATEGORIE && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Houtrot-soort (tussengroep)</label>
              <input value={groep} onChange={e => setGroep(e.target.value)} list="houtrot-soorten-nieuw"
                placeholder="bijv. Epoxyherstel"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts" />
              <datalist id="houtrot-soorten-nieuw">
                {houtrotSoorten.map(s => <option key={s} value={s} />)}
              </datalist>
              <p className="mt-1 text-xs text-slate-400">Waarop de vakman in de app filtert; daarna kiest hij het recept.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Werkomschrijving</label>
            <WerkomschrijvingVeld
              value={omschr}
              onChange={setOmschr}
              minRows={3}
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

// ─── Tabelkolommen ────────────────────────────────────────────────────────────

/** Recept met de drie kostenkolommen al uitgerekend, zodat sorteren en filteren
 *  op dezelfde getallen werken als de cellen tonen. */
type ReceptRij = PaintItemMetNormen & {
  arbeid:    number
  materiaal: number
  oa:        number
  totaal:    number
}

const BTW_LABEL: Record<string, string> = {
  hoog: 'Hoog (21%)', laag: 'Laag (9%)', vrijgesteld: 'Vrijgesteld (0%)',
}

/** De everts-calc-layout zet --border en --accent om naar losse HSL-kanalen voor de
 *  shadcn-primitives; OverzichtTabel gebruikt ze als kléur (`var(--border)`), en dan
 *  vallen randen en accenten weg. Binnen de tabel zetten we ze terug naar de
 *  DS-tokens — die volgen het thema, dus donkere modus blijft kloppen. */
const DS_TOKENS = {
  '--border': 'var(--neutral-200)',
  '--accent': 'var(--brand)',
} as React.CSSProperties

function Bedrag({ waarde, kleur, vet = false }: { waarde: number; kleur?: string; vet?: boolean }) {
  if (!waarde) return <div style={{ textAlign: 'right', color: 'var(--neutral-400)' }}>—</div>
  return (
    <div style={{ textAlign: 'right', fontSize: 12.5, fontWeight: vet ? 700 : 600, color: kleur ?? 'var(--neutral-700)' }}>
      {formatEuro(waarde)}
    </div>
  )
}

// ─── BiblioteekBeheer (hoofd) ─────────────────────────────────────────────────

interface Props {
  items:   PaintItemMetNormen[]
  layouts: GebruikerLayout[]
  user_id: string | null
}

export default function BiblioteekBeheer({ items, layouts, user_id }: Props) {
  const [bewerkItemId, setBewerkItemId] = useState<string | null>(null)
  const [nieuwOpen, setNieuwOpen]     = useState(false)
  const [importBezig, setImportBezig] = useState(false)

  const inst = useInstellingen()
  const eenheden      = inst.eenheden      ?? []
  // Houtrot altijd beschikbaar als categorie, ook als de instellingen een eigen lijst hebben.
  const categorieen   = Array.from(new Set([...(inst.categorieen ?? STANDAARD_CATEGORIEEN), HOUTROT_CATEGORIE]))
  const categorieCodes = { [HOUTROT_CATEGORIE]: 'HR', ...(inst.categorieCodes ?? STANDAARD_CATEGORIE_CODES) }
  const fileRef = useRef<HTMLInputElement>(null)
  const { bevestig } = useDialogen()

  const handleLeegMaak = async () => {
    if (!await bevestig({
      titel: 'Alle recepten en normen definitief verwijderen?',
      omschrijving: 'Dit kan niet ongedaan gemaakt worden.',
      bevestigLabel: 'Alles verwijderen',
      destructief: true,
    })) return
    leegMaakBibliotheek()
      .then(() => toast.success('Bibliotheek leeggemaakt'))
      .catch(err => toast.error(err instanceof Error ? err.message : 'Fout'))
  }

  const bewerkItem = items.find(i => i.id === bewerkItemId) ?? null
  // Bestaande houtrot-soorten als suggesties (datalist) bij het bewerken/aanmaken.
  const houtrotSoorten = Array.from(new Set(items.map(i => i.groep).filter((g): g is string => !!g))).sort()

  const rijen: ReceptRij[] = useMemo(() => items.map(item => {
    const arbeid    = item.labor_norms.reduce((s, n) => s + n.cost_per_unit, 0)
    const oa        = item.material_norms.filter(n => n.norm_type === 'onderaanneming').reduce((s, n) => s + n.cost_per_unit, 0)
    const materiaal = item.material_norms.filter(n => n.norm_type !== 'onderaanneming').reduce((s, n) => s + n.cost_per_unit, 0)
    return { ...item, arbeid, materiaal, oa, totaal: arbeid + materiaal + oa }
  }), [items])

  const kolommen: KolomDefinitie<ReceptRij>[] = useMemo(() => {
    const uniek = (waarden: (string | null | undefined)[]) =>
      Array.from(new Set(waarden.filter((w): w is string => !!w))).sort()

    return [
      {
        key: 'code',
        label: 'Code',
        vast: true,
        breedte: 110,
        filterType: 'tekst',
        sorteerWaarde: r => r.item_code ?? '',
        render: r => (
          <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--neutral-500)' }}>
            {r.item_code ?? '—'}
          </span>
        ),
      },
      {
        key: 'naam',
        label: 'Naam',
        breedte: 300,
        filterType: 'tekst',
        sorteerWaarde: r => r.full_name,
        render: r => (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {/* Slotje: dit recept wordt in de Schilderwerkbibliotheek beheerd en
                is hier alleen-lezen. */}
            {r.vergrendeld && (
              <Lock
                style={{ width: 12, height: 12, flexShrink: 0, color: 'var(--neutral-400)' }}
                aria-label="Beheerd in de Schilderwerkbibliotheek"
              />
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--neutral-900)' }}>{r.full_name}</span>
          </span>
        ),
      },
      {
        key: 'categorie',
        label: 'Categorie',
        breedte: 140,
        filterType: 'select',
        filterOpties: uniek(rijen.map(r => r.onderdeel)),
        sorteerWaarde: r => r.onderdeel ?? '',
        render: r => (
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
            background: 'var(--neutral-100)', color: 'var(--neutral-600)',
          }}>
            {r.onderdeel}
          </span>
        ),
      },
      {
        key: 'eenheid',
        label: 'Eenheid',
        breedte: 90,
        filterType: 'select',
        filterOpties: uniek(rijen.map(r => r.default_unit)),
        sorteerWaarde: r => r.default_unit ?? '',
        render: r => <span style={{ fontSize: 12.5, color: 'var(--neutral-600)' }}>{r.default_unit ?? '—'}</span>,
      },
      {
        key: 'arbeid',
        label: 'Arbeid',
        breedte: 110,
        sorteerWaarde: r => r.arbeid,
        render: r => <Bedrag waarde={r.arbeid} kleur="var(--info-700)" />,
      },
      {
        key: 'materiaal',
        label: 'Materiaal',
        breedte: 110,
        sorteerWaarde: r => r.materiaal,
        render: r => <Bedrag waarde={r.materiaal} kleur="var(--error-700)" />,
      },
      {
        key: 'onderaanneming',
        label: 'Onderaanneming',
        breedte: 130,
        sorteerWaarde: r => r.oa,
        render: r => <Bedrag waarde={r.oa} kleur="#7c3aed" />,
      },
      {
        key: 'totaal',
        label: 'Totaal',
        breedte: 110,
        sorteerWaarde: r => r.totaal,
        render: r => <Bedrag waarde={r.totaal} vet />,
      },
      {
        key: 'houtrot_soort',
        label: 'Houtrot-soort',
        breedte: 160,
        standaard_zichtbaar: false,
        filterType: 'select',
        filterOpties: uniek(rijen.map(r => r.groep)),
        sorteerWaarde: r => r.groep ?? '',
        render: r => r.groep
          ? <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 9999,
              background: 'var(--warning-50)', color: 'var(--warning-700)',
            }} title="Verschijnt in de houtrot-registratie">{r.groep}</span>
          : <span style={{ color: 'var(--neutral-400)' }}>—</span>,
      },
      {
        key: 'btw',
        label: 'BTW',
        breedte: 120,
        standaard_zichtbaar: false,
        filterType: 'select',
        filterOpties: Object.values(BTW_LABEL),
        sorteerWaarde: r => BTW_LABEL[r.btw_tarief ?? 'hoog'] ?? (r.btw_tarief ?? ''),
        render: r => (
          <span style={{ fontSize: 12, color: 'var(--neutral-600)' }}>
            {BTW_LABEL[r.btw_tarief ?? 'hoog'] ?? r.btw_tarief}
          </span>
        ),
      },
      {
        key: 'omschrijving',
        label: 'Werkomschrijving',
        breedte: 320,
        standaard_zichtbaar: false,
        filterType: 'tekst',
        sorteerWaarde: r => r.description ?? '',
        render: r => (
          <span style={{ fontSize: 12, color: 'var(--neutral-600)' }} title={r.description ?? undefined}>
            {r.description ?? '—'}
          </span>
        ),
      },
      {
        key: 'aantal_normen',
        label: 'Normregels',
        breedte: 110,
        standaard_zichtbaar: false,
        sorteerWaarde: r => r.labor_norms.length + r.material_norms.length,
        render: r => (
          <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--neutral-600)' }}>
            {r.labor_norms.length + r.material_norms.length}
          </div>
        ),
      },
    ]
  }, [rijen])

  const handleVerwijder = async (id: string) => {
    if (!await bevestig({ titel: 'Recept en alle normen verwijderen?', bevestigLabel: 'Verwijderen', destructief: true })) return
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

      <div style={DS_TOKENS}>
        <OverzichtTabel
          scherm="everts-calc-recepten"
          data={rijen}
          kolommen={kolommen}
          layouts={layouts}
          user_id={user_id}
          selecteerbaar={false}
          eenregelig
          dicht
          beginSortering={[{ id: 'code', desc: false }]}
          onRijKlik={r => setBewerkItemId(r.id)}
          acties={
            <>
              <Button variant="outline" size="sm" asChild>
                <a href="/everts-calc/api/bibliotheek/sjabloon" download="import-sjabloon.xlsx" className="whitespace-nowrap">
                  <Download className="w-3.5 h-3.5" /> Sjabloon
                </a>
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={importBezig}
                className="whitespace-nowrap"
              >
                {importBezig ? <><Spinner size="sm" /> Importeren…</> : <><Upload className="w-3.5 h-3.5" /> Excel</>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleLeegMaak}
                className="border-error-300 text-error-700 hover:bg-error-50 whitespace-nowrap"
                title="Alle recepten verwijderen"
              >
                <Trash2 className="w-3.5 h-3.5" /> Leeg maken
              </Button>
              <Button variant="primary" size="sm" onClick={() => setNieuwOpen(true)} className="whitespace-nowrap">
                <Plus className="w-3.5 h-3.5" /> Nieuw recept
              </Button>
            </>
          }
        />
      </div>

      {bewerkItem && (
        <BewerkPaneel
          item={bewerkItem}
          eenheden={eenheden}
          categorieen={categorieen}
          houtrotSoorten={houtrotSoorten}
          onSluiten={() => setBewerkItemId(null)}
          onVerwijder={() => handleVerwijder(bewerkItem.id)}
        />
      )}

      {nieuwOpen && (
        <NieuwReceptModal
          items={items}
          eenheden={eenheden}
          categorieen={categorieen}
          categorieCodes={categorieCodes}
          houtrotSoorten={houtrotSoorten}
          onSluiten={() => setNieuwOpen(false)}
          onAangemaakt={id => { setNieuwOpen(false); setBewerkItemId(id) }}
        />
      )}
    </div>
  )
}
