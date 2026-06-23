'use client'

import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Save, Link2 } from 'lucide-react'
import {
  getLeveranciers, getProductgroepKoppelingen, slaProductgroepKoppelingenOp, getMateriaalgroepen,
  type ProductgroepKoppeling as Koppeling,
} from '@/app/(platform)/everts-calc/actions/materialen'

// Koppel de productgroepen die een leverancier aanlevert (DICO BuyingGroup) aan je eigen
// materiaalgroepen. De koppeling wordt per leverancier onthouden en bij elke volgende
// upload automatisch toegepast. Meerdere groepen tegelijk koppelen kan via de selectie.
export default function ProductgroepKoppeling() {
  const [leveranciers, setLeveranciers] = useState<string[]>([])
  const [groepen, setGroepen] = useState<string[]>([])
  const [leverancier, setLeverancier] = useState('')
  const [rijen, setRijen] = useState<Koppeling[]>([])
  // Lokale keuzes: productgroep -> eigen materiaalgroep ('' = niet gekoppeld)
  const [keuzes, setKeuzes] = useState<Record<string, string>>({})
  const [selectie, setSelectie] = useState<Set<string>>(new Set())
  const [bulkGroep, setBulkGroep] = useState('')
  const [laden, setLaden] = useState(false)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    getLeveranciers().then(setLeveranciers).catch(() => setLeveranciers([]))
    getMateriaalgroepen().then(setGroepen).catch(() => setGroepen([]))
  }, [])

  const laadGroepen = useCallback(async (lev: string) => {
    if (!lev) { setRijen([]); setKeuzes({}); setSelectie(new Set()); return }
    setLaden(true)
    try {
      const data = await getProductgroepKoppelingen(lev)
      setRijen(data)
      setKeuzes(Object.fromEntries(data.map(r => [r.leverancier_productgroep, r.materiaalgroep ?? ''])))
      setSelectie(new Set())
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { void laadGroepen(leverancier) }, [leverancier, laadGroepen])

  const toggleSel = (pg: string) => setSelectie(prev => {
    const next = new Set(prev)
    if (next.has(pg)) next.delete(pg); else next.add(pg)
    return next
  })
  const allesGeselecteerd = rijen.length > 0 && selectie.size === rijen.length
  const toggleAlles = () => setSelectie(allesGeselecteerd ? new Set() : new Set(rijen.map(r => r.leverancier_productgroep)))

  // Bulk: ken de gekozen materiaalgroep toe aan alle geselecteerde productgroepen.
  const pasBulkToe = () => {
    if (!selectie.size) { toast.error('Selecteer eerst één of meer productgroepen'); return }
    setKeuzes(prev => {
      const next = { ...prev }
      for (const pg of selectie) next[pg] = bulkGroep
      return next
    })
  }

  const opslaan = async () => {
    setBezig(true)
    try {
      await slaProductgroepKoppelingenOp(
        leverancier,
        rijen.map(r => ({
          leverancier_productgroep: r.leverancier_productgroep,
          materiaalgroep: keuzes[r.leverancier_productgroep] || null,
        })),
      )
      toast.success('Koppelingen opgeslagen en toegepast')
      await laadGroepen(leverancier)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Opslaan mislukt')
    } finally {
      setBezig(false)
    }
  }

  const gekoppeld = rijen.filter(r => keuzes[r.leverancier_productgroep]).length

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-everts" />
        <h3 className="font-semibold text-slate-800 text-sm">Productgroep-koppeling</h3>
      </div>
      <p className="text-xs text-slate-400 -mt-2">
        Koppel de productgroepen van een leverancier aan je eigen materiaalgroepen. De koppeling
        wordt onthouden en bij elke volgende upload automatisch toegepast. Vink meerdere groepen aan
        om ze in één keer te koppelen.
      </p>

      <select
        value={leverancier}
        onChange={e => setLeverancier(e.target.value)}
        className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:border-everts/40 bg-white"
      >
        <option value="">— Kies leverancier —</option>
        {leveranciers.map(l => <option key={l} value={l}>{l}</option>)}
      </select>

      {leverancier && (
        <>
          {laden ? (
            <div className="text-sm text-slate-400 py-4">Laden…</div>
          ) : rijen.length === 0 ? (
            <div className="text-sm text-slate-400 py-4">Geen productgroepen gevonden voor deze leverancier.</div>
          ) : (
            <>
              {/* Bulk-balk */}
              <div className="flex items-center gap-2 flex-wrap bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-500">{selectie.size} geselecteerd</span>
                <span className="text-slate-300">→</span>
                <select
                  value={bulkGroep}
                  onChange={e => setBulkGroep(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-everts/40 bg-white w-52"
                >
                  <option value="">— Niet gekoppeld —</option>
                  {groepen.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
                <button
                  onClick={pasBulkToe}
                  className="text-xs text-everts hover:text-everts-dark border border-everts/30 hover:border-everts/60 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Toepassen op selectie
                </button>
                <span className="ml-auto text-xs text-slate-500">{gekoppeld} van {rijen.length} gekoppeld</span>
              </div>

              <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-[420px] overflow-auto">
                {/* Kop met selecteer-alles */}
                <label className="flex items-center gap-3 px-3 py-2 bg-slate-50/60 text-xs text-slate-500 cursor-pointer sticky top-0">
                  <input type="checkbox" checked={allesGeselecteerd} onChange={toggleAlles} />
                  Alles selecteren
                </label>
                {rijen.map(r => {
                  const pg = r.leverancier_productgroep
                  return (
                    <div key={pg} className="flex items-center gap-3 px-3 py-2">
                      <input type="checkbox" checked={selectie.has(pg)} onChange={() => toggleSel(pg)} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-slate-700 truncate" title={pg}>{pg}</div>
                        <div className="text-[11px] text-slate-400">{r.aantal} artikelen</div>
                      </div>
                      <span className="text-slate-300">→</span>
                      <select
                        value={keuzes[pg] ?? ''}
                        onChange={e => setKeuzes(prev => ({ ...prev, [pg]: e.target.value }))}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-everts/40 bg-white w-52"
                      >
                        <option value="">— Niet gekoppeld —</option>
                        {groepen.map(g => <option key={g} value={g}>{g}</option>)}
                        {keuzes[pg] && !groepen.includes(keuzes[pg]) && (
                          <option value={keuzes[pg]}>{keuzes[pg]}</option>
                        )}
                      </select>
                    </div>
                  )
                })}
              </div>
              <button
                onClick={opslaan}
                disabled={bezig}
                className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> Koppelingen opslaan & toepassen
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}
