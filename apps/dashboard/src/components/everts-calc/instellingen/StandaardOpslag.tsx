'use client'

import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button, Input } from '@/components/ui'
import { getInstellingen, slaInstellingenOp } from '@/lib/everts-calc/local-store'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { geldigeStandaardOpslag } from '@/lib/everts-calc/calculatie-opslag'

/**
 * Opslag% waarmee een nieuwe calculatie begint. Bestaande calculaties houden hun eigen
 * opslag: die invullen zou de prijzen van al uitgebrachte calculaties veranderen.
 */
export default function StandaardOpslag() {
  const inst = useInstellingen()
  const opgeslagen = geldigeStandaardOpslag(inst.standaard_opslag_pct)
  const [pct, setPct] = useState(String(opgeslagen))
  const [bezig, setBezig] = useState(false)
  useEffect(() => { setPct(String(opgeslagen)) }, [opgeslagen])

  const opslaan = async () => {
    const n = parseFloat(pct.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) { toast.error('Vul een percentage van 0 of hoger in'); return }
    setBezig(true)
    try {
      await slaInstellingenOp({ ...getInstellingen(), standaard_opslag_pct: n })
      toast.success('Standaardopslag opgeslagen')
    } catch (err) {
      toast.error(`Opslaan mislukt: ${err instanceof Error ? err.message : 'onbekende fout'}`)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <h3 className="font-semibold text-slate-800 mb-1">Standaardopslag</h3>
      <p className="text-xs text-slate-400 mb-4">
        Een nieuwe calculatie begint met deze opslag. In de calculatie zelf kun je hem
        aanpassen, en per regel afwijken. Bestaande calculaties veranderen niet.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={pct}
          onChange={e => setPct(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void opslaan() }}
          inputMode="decimal"
          style={{ maxWidth: 96 }}
          aria-label="Standaardopslag in procenten"
        />
        <span className="text-sm text-slate-500">%</span>
        <Button onClick={opslaan} disabled={bezig || parseFloat(pct.replace(',', '.')) === opgeslagen}>
          {bezig ? 'Opslaan…' : 'Opslaan'}
        </Button>
      </div>
    </div>
  )
}
