'use client'

import { useState, useTransition } from 'react'
import { X, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import type { Calculatieregel, Componentregel } from '@/lib/everts-calc/types'
import { slaRegelOpAlsRecept } from '@/app/(platform)/everts-calc/actions/bibliotheek'

// ─── Opslaan als recept modal ─────────────────────────────────────────────────

export function OpslaanAlsReceptModal({
  regel, componenten, onSluiten,
}: {
  regel: Calculatieregel
  componenten: Componentregel[]
  onSluiten: () => void
}) {
  const categorieen = useInstellingen().categorieen ?? ['Schilderwerk', 'Timmerwerk', 'Metselwerk', 'Dakwerk', 'Voegwerk', 'Overig']
  const [isPending, start] = useTransition()
  const [naam, setNaam] = useState(regel.omschrijving)
  const [categorie, setCategorie] = useState(categorieen[0] ?? 'Schilderwerk')

  const opslaan = () => {
    if (!naam.trim()) return
    start(async () => {
      try {
        const normen = componenten.map(c => ({
          type: c.type as 'arbeid' | 'materieel' | 'onderaanneming',
          norm_hoeveelheid: c.norm_hoeveelheid,
          tarief: c.tarief,
          omschrijving: c.omschrijving,
          eenheid: c.eenheid,
        }))
        const { code } = await slaRegelOpAlsRecept({
          naam: naam.trim(),
          eenheid: regel.eenheid,
          categorie,
          normen,
        })
        toast.success(`Opgeslagen als recept ${code}`)
        onSluiten()
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Fout bij opslaan')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onSluiten} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Opslaan als recept</h2>
          <button onClick={onSluiten} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Naam recept</label>
            <input
              autoFocus
              value={naam}
              onChange={e => setNaam(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') opslaan() }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Categorie</label>
            <select
              value={categorie}
              onChange={e => setCategorie(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
            >
              {categorieen.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {componenten.length === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
              Deze regel heeft geen componentnormen. Het recept wordt opgeslagen zonder kosten.
            </p>
          )}
          <div className="text-xs text-slate-400 space-y-0.5">
            <div>Eenheid: <span className=" text-slate-600">{regel.eenheid}</span></div>
            <div>{componenten.length} {componenten.length === 1 ? 'norm' : 'normen'} ({componenten.filter(c => c.type === 'arbeid').length} arb, {componenten.filter(c => c.type === 'materieel').length} mat, {componenten.filter(c => c.type === 'onderaanneming').length} OA)</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onSluiten} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Annuleren
          </button>
          <button
            onClick={opslaan}
            disabled={isPending || !naam.trim()}
            className="px-4 py-2 text-sm font-semibold bg-everts hover:bg-everts-dark disabled:opacity-60 text-white rounded-lg flex items-center gap-2"
          >
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Opslaan als recept
          </button>
        </div>
      </div>
    </div>
  )
}
