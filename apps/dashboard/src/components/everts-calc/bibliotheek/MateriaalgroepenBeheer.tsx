'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Plus, Trash2, Check, X, Pencil, Tags } from 'lucide-react'
import {
  getMateriaalgroepen, maakMateriaalgroep, hernoemMateriaalgroep, verwijderMateriaalgroep,
} from '@/app/(platform)/everts-calc/actions/materialen'

// Beheer van de eigen materiaalgroepen: toevoegen, hernoemen, verwijderen. Deze lijst
// vult de materiaalgroep-dropdowns in de bibliotheek en de productgroep-koppeling.
export default function MateriaalgroepenBeheer() {
  const [groepen, setGroepen] = useState<string[]>([])
  const [laden, setLaden] = useState(true)
  const [nieuw, setNieuw] = useState('')
  const [bewerk, setBewerk] = useState<{ oud: string; waarde: string } | null>(null)

  const laad = async () => {
    setLaden(true)
    try { setGroepen(await getMateriaalgroepen()) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Laden mislukt') }
    finally { setLaden(false) }
  }
  useEffect(() => { void laad() }, [])

  const voegToe = async () => {
    const naam = nieuw.trim()
    if (!naam) return
    try { await maakMateriaalgroep(naam); setNieuw(''); await laad() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Aanmaken mislukt') }
  }

  const hernoem = async () => {
    if (!bewerk) return
    try { await hernoemMateriaalgroep(bewerk.oud, bewerk.waarde); setBewerk(null); await laad() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Hernoemen mislukt') }
  }

  const verwijder = async (naam: string) => {
    if (!confirm(`Materiaalgroep "${naam}" verwijderen? Artikelen in deze groep raken hun groep kwijt.`)) return
    try { await verwijderMateriaalgroep(naam); await laad() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Verwijderen mislukt') }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Tags className="w-4 h-4 text-everts" />
        <h3 className="font-semibold text-slate-800 text-sm">Materiaalgroepen</h3>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Je eigen indeling. Deze groepen verschijnen in de materialenbibliotheek en bij de
        productgroep-koppeling.
      </p>

      {/* Toevoegen */}
      <div className="flex items-center gap-2">
        <input
          value={nieuw}
          onChange={e => setNieuw(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void voegToe() }}
          placeholder="Nieuwe materiaalgroep…"
          className="w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
        />
        <button
          onClick={voegToe}
          className="inline-flex items-center gap-1 text-sm text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Toevoegen
        </button>
      </div>

      {/* Lijst */}
      {laden ? (
        <div className="text-sm text-slate-400">Laden…</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {groepen.map(g => (
            <div key={g} className="inline-flex items-center gap-1.5 bg-slate-100 rounded-lg px-2.5 py-1">
              {bewerk?.oud === g ? (
                <>
                  <input
                    value={bewerk.waarde}
                    onChange={e => setBewerk({ oud: g, waarde: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') void hernoem(); if (e.key === 'Escape') setBewerk(null) }}
                    autoFocus
                    className="text-sm px-1 py-0.5 rounded border border-slate-300 focus:outline-none focus:border-everts w-40"
                  />
                  <button onClick={hernoem} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setBewerk(null)} className="text-slate-400 hover:text-slate-600"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="text-sm text-slate-700">{g}</span>
                  <button onClick={() => setBewerk({ oud: g, waarde: g })} className="text-slate-400 hover:text-everts" title="Hernoemen">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => verwijder(g)} className="text-slate-400 hover:text-red-500" title="Verwijderen">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </div>
          ))}
          {groepen.length === 0 && <span className="text-xs text-slate-400 italic">Nog geen materiaalgroepen</span>}
        </div>
      )}
    </div>
  )
}
