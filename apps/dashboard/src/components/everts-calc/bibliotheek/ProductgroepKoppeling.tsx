'use client'

import { useEffect, useState, useCallback } from 'react'
import toast from 'react-hot-toast'
import { Save, Link2 } from 'lucide-react'
import { MATERIAAL_GROEPEN } from '@/lib/everts-calc/types'
import {
  getLeveranciers, getProductgroepKoppelingen, slaProductgroepKoppelingenOp,
  type ProductgroepKoppeling as Koppeling,
} from '@/app/(platform)/everts-calc/actions/materialen'

// Koppel de productgroepen die een leverancier aanlevert (DICO BuyingGroup) aan je eigen
// materiaalgroepen. De koppeling wordt per leverancier onthouden en bij elke volgende
// upload automatisch toegepast.
export default function ProductgroepKoppeling() {
  const [leveranciers, setLeveranciers] = useState<string[]>([])
  const [leverancier, setLeverancier] = useState('')
  const [rijen, setRijen] = useState<Koppeling[]>([])
  // Lokale keuzes: productgroep -> eigen materiaalgroep ('' = niet gekoppeld)
  const [keuzes, setKeuzes] = useState<Record<string, string>>({})
  const [laden, setLaden] = useState(false)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    getLeveranciers().then(setLeveranciers).catch(() => setLeveranciers([]))
  }, [])

  const laadGroepen = useCallback(async (lev: string) => {
    if (!lev) { setRijen([]); setKeuzes({}); return }
    setLaden(true)
    try {
      const data = await getProductgroepKoppelingen(lev)
      setRijen(data)
      setKeuzes(Object.fromEntries(data.map(r => [r.leverancier_productgroep, r.materiaalgroep ?? ''])))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Laden mislukt')
    } finally {
      setLaden(false)
    }
  }, [])

  useEffect(() => { void laadGroepen(leverancier) }, [leverancier, laadGroepen])

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
        wordt onthouden en bij elke volgende upload automatisch toegepast.
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
              <div className="text-xs text-slate-500">
                {gekoppeld} van {rijen.length} productgroepen gekoppeld
              </div>
              <div className="border border-slate-100 rounded-lg divide-y divide-slate-100 max-h-[420px] overflow-auto">
                {rijen.map(r => (
                  <div key={r.leverancier_productgroep} className="flex items-center gap-3 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-700 truncate" title={r.leverancier_productgroep}>
                        {r.leverancier_productgroep}
                      </div>
                      <div className="text-[11px] text-slate-400">{r.aantal} artikelen</div>
                    </div>
                    <span className="text-slate-300">→</span>
                    <select
                      value={keuzes[r.leverancier_productgroep] ?? ''}
                      onChange={e => setKeuzes(prev => ({ ...prev, [r.leverancier_productgroep]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-everts/40 bg-white w-52"
                    >
                      <option value="">— Niet gekoppeld —</option>
                      {MATERIAAL_GROEPEN.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>
                ))}
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
