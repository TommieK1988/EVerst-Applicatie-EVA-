'use client'

import { useState, useTransition, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, ChevronDown, Plus, Trash2, Check, X, Upload, Download, Pencil, Search,
} from 'lucide-react'
import { Button, Card, CardHeader, CardBody, Spinner, EmptyState, Alert } from '@/components/ui'
import type { SchilderOnderdeel, SchilderType, SchilderBehandeling, SchilderCombinatie } from '@/lib/everts-calc/services/schilderwerk'
import {
  haalCombinaties,
  maakOnderdeel, wijzigOnderdeel, verwijderOnderdeel,
  maakType, wijzigType, verwijderType,
  maakBehandeling, wijzigBehandeling, verwijderBehandeling,
  maakCombinatie, verwijderCombinatie,
  maakArbeidNorm, wijzigArbeidNorm, verwijderArbeidNorm,
  maakMateriaalNorm, wijzigMateriaalNorm, verwijderMateriaalNorm,
  importeerSchilderwerkExcel,
} from '@/app/(platform)/everts-calc/actions/schilderwerk'
import { valideerFormule, formuleTekst } from '@/lib/everts-calc/schilder-formule'
import { getInstellingen, getMaterialen } from '@/lib/everts-calc/local-store'
import type { Materiaal } from '@/lib/everts-calc/types'

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onderdelen: SchilderOnderdeel[]
  types: SchilderType[]
  behandelingen: SchilderBehandeling[]
}

// ─── Helpers: standaard Schilder A tarief ────────────────────────────────────

function getSchilderATarief(): number {
  try {
    const inst = getInstellingen()
    return inst.uurtarieven?.find(u => u.label.toLowerCase().includes('schilder a'))?.tarief ?? 58
  } catch {
    return 58
  }
}

// ─── Hulp: getal-input ────────────────────────────────────────────────────────

function NumInput({ value, onChange, cls = '', step = '0.0001', min = '0' }: {
  value: number; onChange: (v: number) => void; cls?: string; step?: string; min?: string
}) {
  return (
    <input
      type="number" step={step} min={min}
      defaultValue={value}
      onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(v) }}
      className={`w-full text-right  text-xs px-1 py-0.5 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent hover:bg-white focus:bg-white ${cls}`}
    />
  )
}

function TxtInput({ value, onChange, placeholder = '' }: {
  value: string | null; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="text"
      defaultValue={value ?? ''}
      placeholder={placeholder}
      onBlur={e => onChange(e.target.value)}
      className="w-full text-xs px-1 py-0.5 rounded border border-transparent
        hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent hover:bg-white focus:bg-white placeholder-slate-300"
    />
  )
}

// ─── Materialen bibliotheek zoeker ───────────────────────────────────────────

function MateriaalBibliotheekZoeker({ onSelect, cls = '' }: {
  onSelect: (m: Materiaal) => void
  cls?: string
}) {
  const [open, setOpen] = useState(false)
  const [zoek, setZoek] = useState('')
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [materialen, setMaterialen] = useState<Materiaal[]>([])

  useEffect(() => {
    if (open) setMaterialen(getMaterialen().filter(m => m.status === 'actief'))
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
        className={`flex-shrink-0 p-0.5 text-slate-300 hover:text-everts rounded transition-colors ${cls}`}
      >
        <Search className="w-3 h-3" />
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

// ─── Norm rijen ───────────────────────────────────────────────────────────────

function ArbeidNormRij({ norm, onRefresh }: {
  norm: SchilderCombinatie['arbeid_normen'][number]
  onRefresh: () => void
}) {
  const [, start] = useTransition()
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deb = (fn: () => Promise<void>) => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => start(async () => { await fn(); onRefresh() }), 600)
  }
  const kosten = ((norm.minutes_per_unit / 60) * norm.hour_rate).toFixed(2)
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 group">
      <td className="pl-2 py-0.5 w-48">
        <TxtInput value={norm.omschrijving} placeholder="Omschrijving" onChange={v => deb(() => wijzigArbeidNorm(norm.id, { omschrijving: v }))} />
      </td>
      <td className="py-0.5 w-20">
        <NumInput value={norm.minutes_per_unit} step="1" onChange={v => deb(() => wijzigArbeidNorm(norm.id, { minutes_per_unit: v }))} />
      </td>
      <td className="py-0.5 w-20">
        <NumInput value={norm.hour_rate} step="0.01" onChange={v => deb(() => wijzigArbeidNorm(norm.id, { hour_rate: v }))} />
      </td>
      <td className="py-0.5 pr-1 text-right text-xs  text-slate-500 w-20">
        € {kosten}
      </td>
      <td className="py-0.5 pr-1 w-6">
        <button
          onClick={() => start(async () => { await verwijderArbeidNorm(norm.id); onRefresh() })}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-400 rounded transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

function MateriaalNormRij({ norm, onRefresh }: {
  norm: SchilderCombinatie['materiaal_normen'][number]
  onRefresh: () => void
}) {
  const [, start] = useTransition()
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deb = (fn: () => Promise<void>) => {
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => start(async () => { await fn(); onRefresh() }), 600)
  }
  const isOA = norm.norm_type === 'onderaanneming'
  return (
    <tr className="border-b border-slate-50 hover:bg-slate-50/50 group">
      <td className="pl-2 py-0.5 w-48">
        <div className="flex items-center gap-0.5">
          <TxtInput value={norm.naam} placeholder={isOA ? 'Onderaannemer' : 'Materiaal'} onChange={v => deb(() => wijzigMateriaalNorm(norm.id, { naam: v }))} />
          {!isOA && (
            <MateriaalBibliotheekZoeker
              onSelect={m => {
                start(async () => {
                  await wijzigMateriaalNorm(norm.id, { naam: m.omschrijving, unit_price: m.kostprijs, eenheid: m.eenheid })
                  onRefresh()
                })
              }}
            />
          )}
        </div>
      </td>
      <td className="py-0.5 w-20">
        {!isOA && <NumInput value={norm.quantity_per_unit} onChange={v => deb(() => wijzigMateriaalNorm(norm.id, { quantity_per_unit: v }))} />}
        {isOA && <span className="text-xs text-slate-400 px-1">—</span>}
      </td>
      <td className="py-0.5 w-20">
        <NumInput value={norm.unit_price} step="0.01" onChange={v => deb(() => wijzigMateriaalNorm(norm.id, { unit_price: v }))} />
      </td>
      <td className="py-0.5 pr-1 text-right text-xs  text-slate-500 w-20">
        € {(norm.quantity_per_unit * norm.unit_price).toFixed(2)}
      </td>
      <td className="py-0.5 pr-1 w-6">
        <button
          onClick={() => start(async () => { await verwijderMateriaalNorm(norm.id); onRefresh() })}
          className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-300 hover:text-red-400 rounded transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </td>
    </tr>
  )
}

// ─── Schilderrecept kaart ─────────────────────────────────────────────────────

function SchilderReceptCard({ combinatie, onRefresh }: {
  combinatie: SchilderCombinatie
  onRefresh: () => void
}) {
  const [, start] = useTransition()
  const [addArbeid, setAddArbeid] = useState(false)
  const [addMat, setAddMat] = useState(false)
  const [addOA, setAddOA] = useState(false)

  const standaardTarief = getSchilderATarief()

  const [arbOmschr, setArbOmschr] = useState('')
  const [arbMin, setArbMin] = useState('')
  const [arbTarief, setArbTarief] = useState(String(standaardTarief))

  const [matNaam, setMatNaam] = useState('')
  const [matInzet, setMatInzet] = useState('')
  const [matPrijs, setMatPrijs] = useState('')
  const [matEenh, setMatEenh] = useState('ltr')

  const [oaNaam, setOaNaam] = useState('')
  const [oaPrijs, setOaPrijs] = useState('')

  const submitArbeid = () => {
    const m = parseFloat(arbMin); const t = parseFloat(arbTarief)
    if (isNaN(m) || m <= 0) return
    start(async () => {
      await maakArbeidNorm(combinatie.id, { omschrijving: arbOmschr || undefined, minutes_per_unit: m, hour_rate: isNaN(t) ? standaardTarief : t })
      setArbOmschr(''); setArbMin(''); setArbTarief(String(standaardTarief)); setAddArbeid(false)
      onRefresh()
    })
  }

  const submitMat = () => {
    const q = parseFloat(matInzet); const p = parseFloat(matPrijs)
    if (!matNaam || isNaN(q) || isNaN(p)) return
    start(async () => {
      await maakMateriaalNorm(combinatie.id, { naam: matNaam, norm_type: 'materiaal', quantity_per_unit: q, eenheid: matEenh, unit_price: p })
      setMatNaam(''); setMatInzet(''); setMatPrijs(''); setAddMat(false)
      onRefresh()
    })
  }

  const submitOA = () => {
    const p = parseFloat(oaPrijs)
    if (!oaNaam || isNaN(p)) return
    start(async () => {
      await maakMateriaalNorm(combinatie.id, { naam: oaNaam, norm_type: 'onderaanneming', quantity_per_unit: 1, eenheid: 'eenh', unit_price: p })
      setOaNaam(''); setOaPrijs(''); setAddOA(false)
      onRefresh()
    })
  }

  const inpCls = 'text-xs border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-everts/40'
  const arbeid = combinatie.arbeid_normen
  const materiaal = combinatie.materiaal_normen.filter(n => n.norm_type === 'materiaal')
  const oa = combinatie.materiaal_normen.filter(n => n.norm_type === 'onderaanneming')

  return (
    <Card>
      <CardHeader className="bg-slate-50">
        <div>
          <span className="text-sm font-semibold text-slate-800">{combinatie.behandeling.naam}</span>
          {combinatie.behandeling.code && (
            <span className="ml-2 text-xs  text-slate-400">{combinatie.behandeling.code}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => start(async () => { await verwijderCombinatie(combinatie.id); onRefresh() })}
          className="text-slate-300 hover:text-red-400"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>

      <CardBody className="px-4 py-3 space-y-4">
        {/* Arbeid */}
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Arbeid</p>
          {arbeid.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-slate-400">
                  <th className="text-left pl-2 pb-0.5">Omschrijving</th>
                  <th className="text-right pb-0.5">Min/eenh</th>
                  <th className="text-right pb-0.5">€/uur</th>
                  <th className="text-right pb-0.5">Kosten</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {arbeid.map(n => <ArbeidNormRij key={n.id} norm={n} onRefresh={onRefresh} />)}
              </tbody>
            </table>
          )}
          {addArbeid ? (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <input className={`${inpCls} flex-1 min-w-28`} placeholder="Omschrijving" value={arbOmschr} onChange={e => setArbOmschr(e.target.value)} />
              <input className={`${inpCls} w-20`} placeholder="Min/eenh" type="number" step="1" min="0" value={arbMin} onChange={e => setArbMin(e.target.value)} />
              <input className={`${inpCls} w-20`} placeholder="€/uur" type="number" step="0.01" value={arbTarief} onChange={e => setArbTarief(e.target.value)} />
              <button onClick={submitArbeid} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setAddArbeid(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => { setAddArbeid(true); setArbTarief(String(getSchilderATarief())) }} className="mt-1 text-xs text-slate-400 hover:text-everts flex items-center gap-1">
              <Plus className="w-3 h-3" /> Arbeidsnorm toevoegen
            </button>
          )}
        </div>

        {/* Materiaal */}
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Materiaal</p>
          {materiaal.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-slate-400">
                  <th className="text-left pl-2 pb-0.5">Naam</th>
                  <th className="text-right pb-0.5">Inzet</th>
                  <th className="text-right pb-0.5">Prijs</th>
                  <th className="text-right pb-0.5">Kosten</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {materiaal.map(n => <MateriaalNormRij key={n.id} norm={n} onRefresh={onRefresh} />)}
              </tbody>
            </table>
          )}
          {addMat ? (
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <input className={`${inpCls} flex-1 min-w-28`} placeholder="Naam materiaal" value={matNaam} onChange={e => setMatNaam(e.target.value)} />
              <MateriaalBibliotheekZoeker
                onSelect={m => { setMatNaam(m.omschrijving); setMatPrijs(String(m.kostprijs)); setMatEenh(m.eenheid) }}
              />
              <input className={`${inpCls} w-20`} placeholder="Inzet" type="number" step="0.0001" value={matInzet} onChange={e => setMatInzet(e.target.value)} />
              <input className={`${inpCls} w-14`} placeholder="Eenh." value={matEenh} onChange={e => setMatEenh(e.target.value)} />
              <input className={`${inpCls} w-20`} placeholder="€/eenh" type="number" step="0.01" value={matPrijs} onChange={e => setMatPrijs(e.target.value)} />
              <button onClick={submitMat} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setAddMat(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setAddMat(true)} className="mt-1 text-xs text-slate-400 hover:text-everts flex items-center gap-1">
              <Plus className="w-3 h-3" /> Materiaalnorm toevoegen
            </button>
          )}
        </div>

        {/* Onderaanneming */}
        <div>
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Onderaanneming</p>
          {oa.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-slate-400">
                  <th className="text-left pl-2 pb-0.5">Omschrijving</th>
                  <th className="text-right pb-0.5"></th>
                  <th className="text-right pb-0.5">Prijs/eenh</th>
                  <th className="text-right pb-0.5">Kosten</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {oa.map(n => <MateriaalNormRij key={n.id} norm={n} onRefresh={onRefresh} />)}
              </tbody>
            </table>
          )}
          {addOA ? (
            <div className="flex items-center gap-1.5 mt-1">
              <input className={`${inpCls} flex-1`} placeholder="Omschrijving" value={oaNaam} onChange={e => setOaNaam(e.target.value)} />
              <input className={`${inpCls} w-24`} placeholder="€/eenh" type="number" step="0.01" value={oaPrijs} onChange={e => setOaPrijs(e.target.value)} />
              <button onClick={submitOA} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setAddOA(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <button onClick={() => setAddOA(true)} className="mt-1 text-xs text-slate-400 hover:text-everts flex items-center gap-1">
              <Plus className="w-3 h-3" /> OA-norm toevoegen
            </button>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

// ─── Inline code bewerken ─────────────────────────────────────────────────────

function InlineCodeEdit({ code, displayCode, onSave }: {
  code: string | null
  displayCode?: string | null   // gecombineerde code om te tonen (bijv. "001 A2"); editeert altijd eigen code
  onSave: (code: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(code ?? '')

  if (editing) {
    return (
      <input
        type="text"
        value={val}
        autoFocus
        placeholder="Code..."
        onChange={e => setVal(e.target.value.toUpperCase())}
        onBlur={() => { onSave(val); setEditing(false) }}
        onKeyDown={e => {
          if (e.key === 'Enter') { onSave(val); setEditing(false) }
          if (e.key === 'Escape') { setVal(code ?? ''); setEditing(false) }
          e.stopPropagation()
        }}
        onClick={e => e.stopPropagation()}
        className="w-16 text-[10px]  px-1 py-0.5 border border-everts/40 rounded focus:outline-none bg-white"
      />
    )
  }

  const shown = displayCode ?? code

  return (
    <span
      onClick={e => { e.stopPropagation(); setEditing(true) }}
      title={code ? `Code: ${code} — klik om te wijzigen` : 'Klik om code toe te voegen'}
      className={`flex-shrink-0 text-[10px]  font-semibold px-1.5 py-0.5 rounded cursor-pointer transition-colors min-w-[2.5rem] text-center ${
        shown
          ? 'text-everts bg-everts/10 hover:bg-everts/20'
          : 'text-slate-300 hover:text-slate-500 hover:bg-slate-100'
      }`}
    >
      {shown ?? '···'}
    </span>
  )
}

// ─── Type-formulier (inline) ──────────────────────────────────────────────────

function TypeFormulier({ onderdeelId, onOpslaan, onAnnuleer }: {
  onderdeelId: string
  onOpslaan: (naam: string, eenheid: string, formule: string, code: string) => void
  onAnnuleer: () => void
}) {
  const [naam, setNaam] = useState('')
  const [code, setCode] = useState('')
  const [eenheid, setEenheid] = useState('m²')
  const [formule, setFormule] = useState('')
  const [formuleFout, setFormuleFout] = useState<string | null>(null)

  const inpCls = 'text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-everts/40 w-full'

  const checkFormule = (v: string) => {
    setFormule(v)
    if (!v.trim()) { setFormuleFout(null); return }
    const { geldig, fout } = valideerFormule(v)
    setFormuleFout(geldig ? null : (fout ?? 'Ongeldige formule'))
  }

  const submit = () => {
    if (!naam.trim()) return
    if (eenheid === 'm¹' && formule.trim()) {
      const { geldig, fout } = valideerFormule(formule)
      if (!geldig) { setFormuleFout(fout ?? 'Ongeldige formule'); return }
    }
    onOpslaan(naam.trim(), eenheid, eenheid === 'm¹' ? formule.trim() : '', code.trim().toUpperCase())
  }

  return (
    <div className="px-3 py-2 space-y-1.5 border-b border-slate-100 bg-slate-50/50">
      <div className="flex gap-1.5">
        <input
          className={`${inpCls} w-16 flex-shrink-0  uppercase`}
          placeholder="Code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onAnnuleer() }}
        />
        <input
          className={inpCls}
          placeholder="Naam type..."
          value={naam}
          onChange={e => setNaam(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onAnnuleer() }}
          autoFocus
        />
      </div>
      <div className="flex gap-1.5">
        <select
          value={eenheid}
          onChange={e => { setEenheid(e.target.value); setFormule(''); setFormuleFout(null) }}
          className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-everts/40"
        >
          <option value="m²">m²</option>
          <option value="m¹">m¹</option>
          <option value="m³">m³</option>
          <option value="st">st</option>
        </select>
        {eenheid === 'm²' && <span className="text-[10px] text-slate-400 self-center">Formule: H × B × Aantal</span>}
        {eenheid === 'm³' && <span className="text-[10px] text-slate-400 self-center">Formule: H × B × L × Aantal</span>}
        {eenheid === 'm¹' && (
          <div className="flex-1 space-y-0.5">
            <input
              className={`${inpCls} ${formuleFout ? 'border-red-300' : ''}`}
              placeholder="Formule, bijv. 2*B+2*H"
              value={formule}
              onChange={e => checkFormule(e.target.value)}
            />
            {formuleFout && <p className="text-[10px] text-red-500">{formuleFout}</p>}
            {!formuleFout && formule.trim() && (
              <p className="text-[10px] text-slate-400">= {formuleTekst(formule)} × Aantal</p>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-1.5 justify-end">
        <Button variant="primary" size="sm" onClick={submit}>Toevoegen</Button>
        <Button variant="outline" size="sm" onClick={onAnnuleer}>Annuleren</Button>
      </div>
    </div>
  )
}

// ─── Behandelingen tab ────────────────────────────────────────────────────────

function BehandelingRijInline({
  behandeling, onRefresh,
}: {
  behandeling: SchilderBehandeling
  onRefresh: () => void
}) {
  const [, start] = useTransition()

  const wijzig = (data: Parameters<typeof wijzigBehandeling>[1]) => {
    start(async () => {
      try { await wijzigBehandeling(behandeling.id, data); onRefresh() } catch { /* stil */ }
    })
  }

  const verwijder = () => {
    if (!confirm(`Behandeling "${behandeling.naam}" verwijderen?`)) return
    start(async () => {
      try { await verwijderBehandeling(behandeling.id); onRefresh() } catch { /* stil */ }
    })
  }

  return (
    <tr className="group hover:bg-slate-50 border-b border-slate-100 last:border-0">
      <td className="px-2 py-1 w-24 align-top">
        <TxtInput
          value={behandeling.code}
          placeholder="Code"
          onChange={v => wijzig({ code: v || undefined })}
        />
      </td>
      <td className="px-2 py-1 w-52 align-top">
        <TxtInput
          value={behandeling.naam}
          placeholder="Naam..."
          onChange={v => { if (v.trim()) wijzig({ naam: v }) }}
        />
      </td>
      <td className="px-2 py-1 w-60 align-top">
        <TxtInput
          value={behandeling.korte_omschrijving}
          placeholder="Korte omschrijving..."
          onChange={v => wijzig({ korte_omschrijving: v || null })}
        />
      </td>
      <td className="px-2 py-1 align-top">
        <textarea
          key={behandeling.id + '_werk'}
          defaultValue={behandeling.uitgebreide_werkomschrijving ?? ''}
          rows={2}
          placeholder="Uitgebreide werkomschrijving..."
          onBlur={e => wijzig({ uitgebreide_werkomschrijving: e.target.value || null })}
          className="w-full text-xs px-1 py-0.5 rounded border border-transparent
            hover:border-slate-200 focus:border-everts/40 focus:outline-none bg-transparent
            hover:bg-white focus:bg-white placeholder-slate-300 resize-y leading-relaxed"
        />
      </td>
      <td className="px-2 py-1 w-10 text-center align-top">
        <button
          onClick={verwijder}
          className="p-1 text-slate-200 opacity-0 group-hover:opacity-100 hover:text-red-400 rounded transition-all"
          title="Verwijderen"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  )
}

function BehandelingenTab({
  behandelingen, onRefresh,
}: {
  behandelingen: SchilderBehandeling[]
  onRefresh: () => void
}) {
  const [, start] = useTransition()
  const [zoek, setZoek] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addCode, setAddCode] = useState('')
  const [addNaam, setAddNaam] = useState('')

  const gefilterd = behandelingen.filter(b => {
    if (!zoek) return true
    const q = zoek.toLowerCase()
    return b.naam.toLowerCase().includes(q) || (b.code?.toLowerCase().includes(q) ?? false)
  })

  const handleAdd = () => {
    if (!addNaam.trim()) return
    start(async () => {
      try {
        await maakBehandeling(addNaam.trim(), addCode.trim().toUpperCase() || undefined)
        setAddNaam(''); setAddCode(''); setAddOpen(false)
        onRefresh()
      } catch { /* stil */ }
    })
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={zoek}
            onChange={e => setZoek(e.target.value)}
            placeholder="Zoeken op naam of code..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-everts/40"
          />
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setAddOpen(v => !v)}
        >
          <Plus className="w-3.5 h-3.5" /> Nieuwe behandeling
        </Button>
      </div>

      {/* Nieuw formulier */}
      {addOpen && (
        <div className="flex-shrink-0 px-4 py-3 bg-everts/5 border-b border-everts/20 flex items-end gap-3 flex-wrap">
          <div className="w-28">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Code</label>
            <input
              value={addCode}
              onChange={e => setAddCode(e.target.value.toUpperCase())}
              placeholder="bijv. BAS1"
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5  uppercase focus:outline-none focus:border-everts/40"
            />
          </div>
          <div className="flex-1 min-w-40">
            <label className="text-xs font-medium text-slate-500 mb-1 block">Naam *</label>
            <input
              value={addNaam}
              onChange={e => setAddNaam(e.target.value)}
              placeholder="Naam behandeling..."
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-everts/40"
            />
          </div>
          <Button variant="primary" size="sm" onClick={handleAdd}>Aanmaken</Button>
          <Button variant="outline" size="sm" onClick={() => setAddOpen(false)}>Annuleren</Button>
        </div>
      )}

      {/* Tabel */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-24">Code</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-52">Naam</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide w-60">Korte omschrijving</th>
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Uitgebreide werkomschrijving</th>
              <th className="w-10 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {gefilterd.map(b => (
              <BehandelingRijInline key={b.id} behandeling={b} onRefresh={onRefresh} />
            ))}
          </tbody>
        </table>

        {gefilterd.length === 0 && (
          <EmptyState
            tone="neutral"
            size="sm"
            title="Geen behandelingen gevonden"
            description={zoek ? 'Probeer een andere zoekterm' : 'Voeg een behandeling toe via de knop rechtsbovenin'}
          />
        )}
      </div>
    </div>
  )
}

// ─── Hoofd component ──────────────────────────────────────────────────────────

export default function SchilderwerkBibliotheek({ onderdelen: initOnderdelen, types: initTypes, behandelingen }: Props) {
  const router = useRouter()
  const [, start] = useTransition()
  const [isLoading, setIsLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importBezig, setImportBezig] = useState(false)
  const [importResultaat, setImportResultaat] = useState<{ aangemaakt: number; bijgewerkt: number; fouten: string[] } | null>(null)

  const onderdelen = initOnderdelen
  const types = initTypes

  const [tabActief, setTabActief] = useState<'schilderwerk' | 'behandelingen'>('schilderwerk')

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [selectedTypeId, setSelectedTypeId] = useState<string | null>(null)
  const [selectedOnderdeelId, setSelectedOnderdeelId] = useState<string | null>(null)
  const [combinaties, setCombinaties] = useState<SchilderCombinatie[]>([])

  const [editNaam, setEditNaam] = useState<{ id: string; value: string; entity: 'onderdeel' | 'type' } | null>(null)

  const [addOnderdeelNaam, setAddOnderdeelNaam] = useState('')
  const [addOnderdeelCode, setAddOnderdeelCode] = useState('')
  const [showAddOnderdeel, setShowAddOnderdeel] = useState(false)
  const [showAddType, setShowAddType] = useState<string | null>(null)
  const [showAddRecept, setShowAddRecept] = useState(false)
  const [addReceptBehandelingId, setAddReceptBehandelingId] = useState('')
  const [addNieuwBehandeling, setAddNieuwBehandeling] = useState('')

  const refreshRouter = useCallback(() => router.refresh(), [router])

  const saveNaam = useCallback((entity: 'onderdeel' | 'type', id: string, naam: string) => {
    if (!naam.trim()) { setEditNaam(null); return }
    start(async () => {
      if (entity === 'onderdeel') await wijzigOnderdeel(id, { naam: naam.trim() })
      else await wijzigType(id, { naam: naam.trim() })
      setEditNaam(null)
      refreshRouter()
    })
  }, [refreshRouter])

  const laadCombinaties = useCallback(async (typeId: string) => {
    setIsLoading(true)
    try {
      const data = await haalCombinaties(typeId)
      setCombinaties(data)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const onTypeKlik = useCallback((typeId: string, onderdeelId: string) => {
    setSelectedTypeId(typeId)
    setSelectedOnderdeelId(onderdeelId)
    laadCombinaties(typeId)
  }, [laadCombinaties])

  const onCombinatiRefresh = useCallback(() => {
    if (selectedTypeId) laadCombinaties(selectedTypeId)
  }, [selectedTypeId, laadCombinaties])

  const toggleOnderdeel = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const handleAddOnderdeel = () => {
    if (!addOnderdeelNaam.trim()) return
    start(async () => {
      await maakOnderdeel(addOnderdeelNaam.trim(), addOnderdeelCode.trim().toUpperCase() || undefined)
      setAddOnderdeelNaam(''); setAddOnderdeelCode(''); setShowAddOnderdeel(false)
      refreshRouter()
    })
  }

  const handleAddType = (onderdeelId: string, naam: string, eenheid: string, formule: string, code: string) => {
    start(async () => {
      await maakType(onderdeelId, naam, eenheid, formule || undefined, code || undefined)
      setShowAddType(null)
      refreshRouter()
    })
  }

  const handleAddRecept = () => {
    if (!selectedTypeId || !selectedOnderdeelId) return
    const bestaandeId = addReceptBehandelingId
    const nieuwNaam = addNieuwBehandeling.trim()
    if (!bestaandeId && !nieuwNaam) return

    start(async () => {
      let behandelingId = bestaandeId
      if (!behandelingId && nieuwNaam) {
        behandelingId = await maakBehandeling(nieuwNaam)
        refreshRouter()
      }
      if (!behandelingId) return
      await maakCombinatie(selectedOnderdeelId, selectedTypeId, behandelingId)
      setAddReceptBehandelingId(''); setAddNieuwBehandeling(''); setShowAddRecept(false)
      const data = await haalCombinaties(selectedTypeId)
      setCombinaties(data)
    })
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportBezig(true)
    setImportResultaat(null)
    try {
      const fd = new FormData()
      fd.append('bestand', file)
      const result = await importeerSchilderwerkExcel(fd)
      setImportResultaat(result)
      refreshRouter()
      if (selectedTypeId) laadCombinaties(selectedTypeId)
    } catch (err) {
      setImportResultaat({ aangemaakt: 0, bijgewerkt: 0, fouten: [String(err)] })
    } finally {
      setImportBezig(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const geselecteerdType = types.find(t => t.id === selectedTypeId)
  const geselecteerdOnderdeel = onderdelen.find(o => o.id === selectedOnderdeelId)
  const gekoppeldeBehandelingIds = new Set(combinaties.map(c => c.behandeling_id))
  const beschikbareBehandelingen = behandelingen.filter(b => !gekoppeldeBehandelingIds.has(b.id))

  const inpCls = 'text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-everts/40 w-full'

  const tabCls = (tab: typeof tabActief) =>
    `px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      tabActief === tab
        ? 'border-everts text-everts'
        : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
    }`

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ─── Tabs ─────────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 flex border-b border-slate-200 bg-white">
        <button className={tabCls('schilderwerk')} onClick={() => setTabActief('schilderwerk')}>
          Onderdelen &amp; Recepten
        </button>
        <button className={tabCls('behandelingen')} onClick={() => setTabActief('behandelingen')}>
          Behandelingen
          <span className="ml-1.5 text-[10px] font-normal px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
            {behandelingen.length}
          </span>
        </button>
      </div>

      {tabActief === 'behandelingen' ? (
        <BehandelingenTab behandelingen={behandelingen} onRefresh={refreshRouter} />
      ) : (
      <div className="flex flex-1 overflow-hidden">
      {/* ─── Linker boom ─────────────────────────────────────────────────── */}
      <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Onderdelen</h2>
          <div className="flex items-center gap-1">
            {/* Sjabloon downloaden */}
            <a href="/everts-calc/api/schilderwerk/sjabloon" download>
              <button
                type="button"
                className="p-1 text-slate-400 hover:text-everts hover:bg-everts/5 rounded transition-colors"
                title="Sjabloon downloaden"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </a>
            {/* Import knop */}
            <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={importBezig}
              className="p-1 text-slate-400 hover:text-everts hover:bg-everts/5 rounded transition-colors"
              title="Excel importeren"
            >
              {importBezig ? <Spinner size="sm" /> : <Upload className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={() => setShowAddOnderdeel(v => !v)}
              className="p-1 text-slate-400 hover:text-everts hover:bg-everts/5 rounded transition-colors"
              title="Onderdeel toevoegen"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Import resultaat */}
        {importResultaat && (
          <Alert
            tone={importResultaat.fouten.length > 0 ? 'warning' : 'success'}
            title={`${importResultaat.aangemaakt} aangemaakt, ${importResultaat.bijgewerkt} bijgewerkt`}
            onClose={() => setImportResultaat(null)}
            className="rounded-none border-x-0 border-t-0"
          >
            {importResultaat.fouten.length > 0 && (
              <div className="space-y-0.5 mt-1">
                {importResultaat.fouten.slice(0, 3).map((f, i) => (
                  <p key={i} className="text-xs">{f}</p>
                ))}
                {importResultaat.fouten.length > 3 && (
                  <p className="text-xs">... en {importResultaat.fouten.length - 3} meer fouten</p>
                )}
              </div>
            )}
          </Alert>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {showAddOnderdeel && (
            <div className="px-3 py-2 flex gap-1.5 border-b border-slate-100">
              <input
                className={`${inpCls} w-16 flex-shrink-0  uppercase`}
                placeholder="Code"
                value={addOnderdeelCode}
                onChange={e => setAddOnderdeelCode(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') handleAddOnderdeel(); if (e.key === 'Escape') setShowAddOnderdeel(false) }}
              />
              <input
                className={inpCls}
                placeholder="Naam onderdeel..."
                value={addOnderdeelNaam}
                onChange={e => setAddOnderdeelNaam(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddOnderdeel(); if (e.key === 'Escape') setShowAddOnderdeel(false) }}
                autoFocus
              />
              <button onClick={handleAddOnderdeel} className="p-1 text-green-600 hover:bg-green-50 rounded flex-shrink-0"><Check className="w-3.5 h-3.5" /></button>
              <button onClick={() => setShowAddOnderdeel(false)} className="p-1 text-slate-400 hover:bg-slate-50 rounded flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          {onderdelen.length === 0 && (
            <EmptyState tone="neutral" size="sm" title="Nog geen onderdelen" />
          )}

          {onderdelen.map(onderdeel => {
            const isExpanded = expandedIds.has(onderdeel.id)
            const onderdeelTypes = types.filter(t => t.onderdeel_id === onderdeel.id)
            return (
              <div key={onderdeel.id} className="border-b border-slate-100 last:border-0">
                {/* ── Onderdeel-rij ── */}
                <div
                  className="w-full flex items-center gap-1.5 px-3 py-2 hover:bg-slate-50 transition-colors group cursor-pointer"
                  onClick={() => toggleOnderdeel(onderdeel.id)}
                >
                  {isExpanded
                    ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                    : <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                  <InlineCodeEdit
                    code={onderdeel.code}
                    onSave={code => start(async () => { await wijzigOnderdeel(onderdeel.id, { code: code || undefined }); refreshRouter() })}
                  />
                  {editNaam?.id === onderdeel.id && editNaam.entity === 'onderdeel' ? (
                    <input
                      value={editNaam.value}
                      onChange={e => setEditNaam(prev => prev ? { ...prev, value: e.target.value } : null)}
                      onBlur={() => saveNaam('onderdeel', onderdeel.id, editNaam.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveNaam('onderdeel', onderdeel.id, editNaam.value)
                        if (e.key === 'Escape') setEditNaam(null)
                        e.stopPropagation()
                      }}
                      onClick={e => e.stopPropagation()}
                      autoFocus
                      className="flex-1 text-xs font-semibold px-1.5 py-0.5 border border-everts/40 rounded focus:outline-none bg-white"
                    />
                  ) : (
                    <span className="flex-1 font-semibold text-[13px] text-slate-800 text-left leading-tight">{onderdeel.naam}</span>
                  )}
                  {/* Knoppen altijd zichtbaar — geen hover-only */}
                  {editNaam?.id !== onderdeel.id && (
                    <button
                      onClick={e => { e.stopPropagation(); setEditNaam({ id: onderdeel.id, value: onderdeel.naam, entity: 'onderdeel' }) }}
                      className="flex-shrink-0 p-0.5 text-slate-300 opacity-40 group-hover:opacity-100 hover:text-blue-400 rounded transition-all"
                      title="Naam bewerken"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); start(async () => { await verwijderOnderdeel(onderdeel.id); refreshRouter() }) }}
                    className="flex-shrink-0 p-0.5 text-slate-300 opacity-40 group-hover:opacity-100 hover:text-red-400 rounded transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-l-2 border-slate-100 ml-5">
                    {/* Type-formulier */}
                    {showAddType === onderdeel.id && (
                      <TypeFormulier
                        onderdeelId={onderdeel.id}
                        onOpslaan={(naam, eenheid, formule, code) => handleAddType(onderdeel.id, naam, eenheid, formule, code)}
                        onAnnuleer={() => setShowAddType(null)}
                      />
                    )}

                    {onderdeelTypes.map(type => {
                      const volleCode = [onderdeel.code, type.code].filter(Boolean).join(' ') || null
                      const isGeselecteerd = selectedTypeId === type.id
                      return (
                        <div
                          key={type.id}
                          onClick={() => onTypeKlik(type.id, onderdeel.id)}
                          className={`w-full flex items-center gap-1.5 pl-3 pr-2 py-1.5 text-sm transition-colors group cursor-pointer ${
                            isGeselecteerd
                              ? 'bg-everts/10 border-l-2 border-everts -ml-0.5 text-everts font-medium'
                              : 'text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <InlineCodeEdit
                            code={type.code}
                            displayCode={volleCode}
                            onSave={code => start(async () => { await wijzigType(type.id, { code: code || undefined }); refreshRouter() })}
                          />
                          {editNaam?.id === type.id && editNaam.entity === 'type' ? (
                            <input
                              value={editNaam.value}
                              onChange={e => setEditNaam(prev => prev ? { ...prev, value: e.target.value } : null)}
                              onBlur={() => saveNaam('type', type.id, editNaam.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveNaam('type', type.id, editNaam.value)
                                if (e.key === 'Escape') setEditNaam(null)
                                e.stopPropagation()
                              }}
                              onClick={e => e.stopPropagation()}
                              autoFocus
                              className="flex-1 text-xs px-1.5 py-0.5 border border-everts/40 rounded focus:outline-none bg-white"
                            />
                          ) : (
                            <span className="flex-1 text-left text-xs">{type.naam}</span>
                          )}
                          <span className="text-[10px] text-slate-400  flex-shrink-0 mr-0.5">{type.eenheid}</span>
                          {editNaam?.id !== type.id && (
                            <button
                              onClick={e => { e.stopPropagation(); setEditNaam({ id: type.id, value: type.naam, entity: 'type' }) }}
                              className="flex-shrink-0 p-0.5 text-slate-300 opacity-40 group-hover:opacity-100 hover:text-blue-400 rounded transition-all"
                              title="Naam bewerken"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); start(async () => { await verwijderType(type.id); if (selectedTypeId === type.id) { setSelectedTypeId(null); setCombinaties([]) } refreshRouter() }) }}
                            className="flex-shrink-0 p-0.5 text-slate-300 opacity-40 group-hover:opacity-100 hover:text-red-400 rounded transition-all"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}

                    {showAddType !== onderdeel.id && (
                      <button
                        onClick={() => { setShowAddType(onderdeel.id); setExpandedIds(prev => new Set(Array.from(prev).concat(onderdeel.id))) }}
                        className="w-full flex items-center gap-1.5 pl-3 py-1.5 text-xs text-slate-400 hover:text-everts transition-colors"
                      >
                        <Plus className="w-3 h-3" /> Type toevoegen
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── Rechter content ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
        {!selectedTypeId ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              tone="neutral"
              title="Selecteer een type links"
              description="om de schilderrecepten te beheren"
            />
          </div>
        ) : (
          <>
            <div className="flex-shrink-0 px-6 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400">{geselecteerdOnderdeel?.naam}</p>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-800">{geselecteerdType?.naam}</h2>
                  <span className="text-xs  text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{geselecteerdType?.eenheid}</span>
                  {geselecteerdType?.formule && (
                    <span className="text-xs text-slate-500">= {formuleTekst(geselecteerdType.formule)} × Aantal</span>
                  )}
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowAddRecept(v => !v)}
              >
                <Plus className="w-3.5 h-3.5" />
                Schilderrecept toevoegen
              </Button>
            </div>

            {showAddRecept && (
              <div className="flex-shrink-0 px-6 py-3 bg-blue-50 border-b border-blue-100">
                <p className="text-xs font-medium text-slate-600 mb-2">Behandeling koppelen aan dit type:</p>
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-40">
                    <label className="text-xs text-slate-500 mb-1 block">Bestaande behandeling</label>
                    <select
                      value={addReceptBehandelingId}
                      onChange={e => { setAddReceptBehandelingId(e.target.value); setAddNieuwBehandeling('') }}
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-everts/40"
                    >
                      <option value="">— Selecteer —</option>
                      {beschikbareBehandelingen.map(b => (
                        <option key={b.id} value={b.id}>{b.naam}{b.code ? ` (${b.code})` : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="text-xs text-slate-400 flex-shrink-0 pb-1.5">of</div>
                  <div className="flex-1 min-w-40">
                    <label className="text-xs text-slate-500 mb-1 block">Nieuwe behandeling aanmaken</label>
                    <input
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:border-everts/40"
                      placeholder="Naam behandeling..."
                      value={addNieuwBehandeling}
                      onChange={e => { setAddNieuwBehandeling(e.target.value); setAddReceptBehandelingId('') }}
                    />
                  </div>
                  <Button variant="primary" size="sm" onClick={handleAddRecept} className="flex-shrink-0">Toevoegen</Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowAddRecept(false); setAddReceptBehandelingId(''); setAddNieuwBehandeling('') }} className="flex-shrink-0">Annuleren</Button>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {isLoading && (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-8 justify-center">
                  <Spinner size="sm" /> Laden...
                </div>
              )}
              {!isLoading && combinaties.length === 0 && (
                <EmptyState
                  tone="neutral"
                  title="Geen schilderrecepten"
                  description="Voeg een behandeling toe via de knop rechtsbovenin"
                />
              )}
              {!isLoading && combinaties.map(c => (
                <SchilderReceptCard key={c.id} combinatie={c} onRefresh={onCombinatiRefresh} />
              ))}
            </div>
          </>
        )}
      </div>
      </div>
      )}
    </div>
  )
}
