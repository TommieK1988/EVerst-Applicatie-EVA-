'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, GripVertical, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getUurtarief, saveUurtarief,
  getEenheden, saveEenheden,
  getReparatieTypes, saveReparatieTypes,
} from '@/lib/local-store'
import type { ReparatieType } from '@/lib/local-store'

// ─── Kleurenpalet ─────────────────────────────────────────────────────────────
const KLEUREN = [
  { hex: '#6b7280', naam: 'Grijs' },
  { hex: '#ef4444', naam: 'Rood' },
  { hex: '#f97316', naam: 'Oranje' },
  { hex: '#eab308', naam: 'Geel' },
  { hex: '#22c55e', naam: 'Groen' },
  { hex: '#0a7a35', naam: 'Everts groen' },
  { hex: '#14b8a6', naam: 'Turquoise' },
  { hex: '#3b82f6', naam: 'Blauw' },
  { hex: '#8b5cf6', naam: 'Paars' },
  { hex: '#ec4899', naam: 'Roze' },
  { hex: '#854d0e', naam: 'Bruin' },
  { hex: '#0f172a', naam: 'Zwart' },
]

// ─── Kleurkiezer ──────────────────────────────────────────────────────────────
function KleurKiezer({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {KLEUREN.map(k => (
        <button
          key={k.hex}
          type="button"
          title={k.naam}
          onClick={() => onChange(k.hex)}
          className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-transform hover:scale-110"
          style={{
            backgroundColor: k.hex,
            borderColor: value === k.hex ? '#0f172a' : 'transparent',
          }}
        >
          {value === k.hex && <Check className="w-3.5 h-3.5 text-white drop-shadow" />}
        </button>
      ))}
    </div>
  )
}

// ─── Reparatietypes blok ───────────────────────────────────────────────────────
function ReparatieTypesBlok() {
  const [types, setTypes] = useState<ReparatieType[]>([])
  const [nieuwNaam, setNieuwNaam] = useState('')
  const [nieuwKleur, setNieuwKleur] = useState(KLEUREN[5].hex)
  const [editId, setEditId] = useState<string | null>(null)
  const [editNaam, setEditNaam] = useState('')
  const [editKleur, setEditKleur] = useState('')

  useEffect(() => { setTypes(getReparatieTypes()) }, [])

  function opslaan(lijst: ReparatieType[]) {
    saveReparatieTypes(lijst)
    setTypes(lijst)
  }

  function toevoegen() {
    if (!nieuwNaam.trim()) return
    const nieuw: ReparatieType = {
      id: `rt-${Date.now()}`,
      naam: nieuwNaam.trim(),
      kleur: nieuwKleur,
    }
    opslaan([...types, nieuw])
    setNieuwNaam('')
    setNieuwKleur(KLEUREN[5].hex)
    toast.success('Type toegevoegd')
  }

  function verwijder(id: string) {
    opslaan(types.filter(t => t.id !== id))
    toast.success('Type verwijderd')
  }

  function startEdit(t: ReparatieType) {
    setEditId(t.id)
    setEditNaam(t.naam)
    setEditKleur(t.kleur)
  }

  function bewerkOpslaan() {
    opslaan(types.map(t => t.id === editId ? { ...t, naam: editNaam, kleur: editKleur } : t))
    setEditId(null)
    toast.success('Type bijgewerkt')
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-slate-800">Reparatietypes</h2>
        <p className="text-sm text-slate-400 mt-0.5">Definieer de types die gebruikt worden in de bibliotheek en bij reparaties</p>
      </div>

      {/* Bestaande types */}
      <div className="space-y-2">
        {types.length === 0 && (
          <p className="text-sm text-slate-400 py-2">Nog geen types gedefinieerd</p>
        )}
        {types.map(t => (
          <div key={t.id} className="group">
            {editId === t.id ? (
              /* Edit modus */
              <div className="border border-everts/30 bg-everts-50 rounded-xl p-4 space-y-3">
                <input
                  autoFocus
                  value={editNaam}
                  onChange={e => setEditNaam(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && bewerkOpslaan()}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
                />
                <KleurKiezer value={editKleur} onChange={setEditKleur} />
                <div className="flex gap-2">
                  <button
                    onClick={bewerkOpslaan}
                    className="px-4 py-1.5 bg-everts hover:bg-everts-dark text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    Opslaan
                  </button>
                  <button
                    onClick={() => setEditId(null)}
                    className="px-4 py-1.5 bg-white border border-slate-300 text-slate-600 text-sm font-medium rounded-lg hover:border-slate-400 transition-colors"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            ) : (
              /* Weergave modus */
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-slate-300 cursor-pointer transition-colors"
                onClick={() => startEdit(t)}
              >
                <div
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: t.kleur }}
                />
                <span className="flex-1 text-sm font-medium text-slate-700">{t.naam}</span>
                <button
                  onClick={e => { e.stopPropagation(); verwijder(t.id) }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-red-500 transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Nieuw type toevoegen */}
      <div className="border-t border-slate-100 pt-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Nieuw type</p>
        <input
          type="text"
          value={nieuwNaam}
          onChange={e => setNieuwNaam(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && toevoegen()}
          placeholder="Naam van het type, bijv. Epoxyherstel"
          className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
        />
        <KleurKiezer value={nieuwKleur} onChange={setNieuwKleur} />
        <button
          onClick={toevoegen}
          disabled={!nieuwNaam.trim()}
          className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Toevoegen
        </button>
      </div>
    </div>
  )
}

// ─── Uurtarief blok ────────────────────────────────────────────────────────────
function UurtariefBlok() {
  const [tarief, setTarief] = useState<number>(65)
  const [opgeslagen, setOpgeslagen] = useState(false)

  useEffect(() => { setTarief(getUurtarief()) }, [])

  function opslaan() {
    saveUurtarief(tarief)
    setOpgeslagen(true)
    setTimeout(() => setOpgeslagen(false), 2000)
    toast.success('Uurtarief opgeslagen')
  }

  const arbeidskosten = (minuten: number) =>
    ((minuten / 60) * tarief).toFixed(2).replace('.', ',')

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-slate-800">Uurtarief</h2>
        <p className="text-sm text-slate-400 mt-0.5">Wordt gebruikt voor het berekenen van de arbeidskosten in de bibliotheek</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">€</span>
          <input
            type="number"
            min={0}
            step={0.5}
            value={tarief}
            onChange={e => setTarief(parseFloat(e.target.value) || 0)}
            className="pl-8 pr-4 py-2.5 w-36 border border-slate-300 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
        </div>
        <span className="text-sm text-slate-400">per uur</span>
        <button
          onClick={opslaan}
          className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            opgeslagen
              ? 'bg-green-100 text-green-700'
              : 'bg-everts hover:bg-everts-dark text-white'
          }`}
        >
          {opgeslagen ? '✓ Opgeslagen' : 'Opslaan'}
        </button>
      </div>

      {/* Voorbeeldberekening */}
      <div className="bg-slate-50 rounded-xl p-4">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Voorbeeldberekening</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="text-left pb-2 font-medium">Minuten</th>
              <th className="text-right pb-2 font-medium">Arbeidskosten</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            {[30, 60, 90, 120, 180, 240].map(min => (
              <tr key={min} className="border-t border-slate-100">
                <td className="py-1.5">{min} min</td>
                <td className="py-1.5 text-right font-medium">€ {arbeidskosten(min)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Eenheden blok ─────────────────────────────────────────────────────────────
function EenhedenBlok() {
  const [eenheden, setEenheden] = useState<string[]>([])
  const [nieuw, setNieuw] = useState('')

  useEffect(() => { setEenheden(getEenheden()) }, [])

  function opslaan(lijst: string[]) {
    saveEenheden(lijst)
    setEenheden(lijst)
  }

  function toevoegen() {
    const val = nieuw.trim().toLowerCase()
    if (!val || eenheden.includes(val)) return
    opslaan([...eenheden, val])
    setNieuw('')
    toast.success('Eenheid toegevoegd')
  }

  function verwijder(e: string) {
    opslaan(eenheden.filter(x => x !== e))
    toast.success('Eenheid verwijderd')
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <div>
        <h2 className="font-semibold text-slate-800">Eenheden</h2>
        <p className="text-sm text-slate-400 mt-0.5">De eenheden die beschikbaar zijn in de bibliotheek</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {eenheden.map(e => (
          <div key={e} className="group flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-full text-sm font-medium text-slate-700">
            <span>{e}</span>
            <button
              onClick={() => verwijder(e)}
              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all leading-none"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {eenheden.length === 0 && (
          <p className="text-sm text-slate-400">Geen eenheden gedefinieerd</p>
        )}
      </div>

      <div className="flex gap-2 border-t border-slate-100 pt-4">
        <input
          type="text"
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && toevoegen()}
          placeholder="bijv. m2, kg, set..."
          className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts w-40"
        />
        <button
          onClick={toevoegen}
          disabled={!nieuw.trim()}
          className="inline-flex items-center gap-1.5 bg-everts hover:bg-everts-dark disabled:opacity-40 text-white text-sm font-medium px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Toevoegen
        </button>
      </div>
    </div>
  )
}

// ─── Hoofd export ──────────────────────────────────────────────────────────────
export default function AppInstellingen() {
  return (
    <div className="space-y-5">
      <UurtariefBlok />
      <ReparatieTypesBlok />
      <EenhedenBlok />
    </div>
  )
}
