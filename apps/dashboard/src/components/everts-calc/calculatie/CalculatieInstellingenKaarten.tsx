'use client'

import { useState, useEffect } from 'react'
import {
  getScenarios, slaScenarioOp,
  getGroepen, getCalculatieregels, getComponentregels,
} from '@/lib/everts-calc/local-store'
import { berekenScenarioKostprijs, berekenScenarioVP, formatEuro } from '@/lib/everts-calc/calculations'
import { createClient } from '@/lib/everts-calc/supabase/client'
import type { Scenario } from '@/lib/everts-calc/types'
import type { Betalingsconditie } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import type { AlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'
import { Card, CardHeader, CardBody } from '@/components/ui/card'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Rij({ label, bedrag, accent = false }: { label: React.ReactNode; bedrag: number; accent?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${accent ? 'font-semibold' : ''}`}>
      <span className={`text-sm ${accent ? 'text-slate-800' : 'text-slate-500'}`}>{label}</span>
      <span className={`font-mono text-sm ${accent ? 'text-slate-900' : 'text-slate-700'}`}>
        {formatEuro(bedrag)}
      </span>
    </div>
  )
}

interface BtwGroep {
  pct:  number
  vp:   number   // verkoopprijs excl. BTW waarover dit tarief geldt
  btw:  number   // BTW-bedrag
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalculatieInstellingenKaarten({ projectId }: { projectId: string }) {
  const [scenario, setScenario]               = useState<Scenario | null>(null)
  const [kostprijs, setKostprijs]             = useState(0)
  const [verkoopprijs, setVerkoopprijs]       = useState(0)
  const [btwGroepen, setBtwGroepen]           = useState<BtwGroep[]>([])
  const [betalingscondities, setBetalingscondities] = useState<Betalingsconditie[]>([])
  const [algVoorwaarden, setAlgVoorwaarden]   = useState<AlgemeneVoorwaarden[]>([])

  useEffect(() => {
    const scs = getScenarios(projectId)
    if (scs.length === 0) return
    const sc = scs.find(s => s.is_standaard) ?? scs[0]
    setScenario(sc)

    const gs       = getGroepen(sc.id)
    const groepIds = new Set(gs.map(g => g.id))
    const rs       = getCalculatieregels().filter(r => groepIds.has(r.groep_id))
    const regelIds = new Set(rs.map(r => r.id))
    const cs       = getComponentregels().filter(c => regelIds.has(c.calculatieregel_id))

    setKostprijs(berekenScenarioKostprijs(gs, rs, cs))
    setVerkoopprijs(berekenScenarioVP(gs, rs, cs, sc.opslag_algemene_kosten))

    // ─── BTW breakdown: bereken VP per actief BTW-tarief ────────────────────
    // Per calculatieregel: kostprijs = hoeveelheid × som(components)
    // → verkoopprijs = kostprijs × (1 + opslagPct/100)
    // → BTW-tarief uit regel.btw_pct of scenario.btw_pct_default (0 als niet gezet)
    const btwMap = new Map<number, number>() // btwPct → totaal VP

    for (const r of rs) {
      const rComponents = cs.filter(c => c.calculatieregel_id === r.id)
      const regelKostprijs =
        rComponents.reduce((sum, c) => sum + (c.norm_hoeveelheid ?? 0) * (c.tarief ?? 0), 0) *
        (r.hoeveelheid ?? 1)
      const opslagPct = r.opslag_pct ?? sc.opslag_algemene_kosten
      const regelVP   = regelKostprijs * (1 + opslagPct / 100)
      const btwPct    = r.btw_pct ?? sc.btw_pct_default ?? 0
      btwMap.set(btwPct, (btwMap.get(btwPct) ?? 0) + regelVP)
    }

    const groepen: BtwGroep[] = Array.from(btwMap.entries())
      .filter(([pct, vp]) => pct > 0 && vp > 0)
      .sort(([a], [b]) => a - b)
      .map(([pct, vp]) => ({ pct, vp, btw: vp * pct / 100 }))

    setBtwGroepen(groepen)

    // Betalingscondities + AV ophalen via Supabase browser client
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any
    supabase.from('betalingscondities').select('*').order('volgorde').order('naam')
      .then(({ data }: { data: Betalingsconditie[] | null }) => setBetalingscondities(data ?? []))
    supabase.from('algemene_voorwaarden').select('*').order('naam')
      .then(({ data }: { data: AlgemeneVoorwaarden[] | null }) => setAlgVoorwaarden(data ?? []))
  }, [projectId])

  if (!scenario) return null

  const opslag_euro   = verkoopprijs - kostprijs
  const totaalBtw     = btwGroepen.reduce((sum, g) => sum + g.btw, 0)
  const totaalInclBtw = verkoopprijs + totaalBtw

  /** Sla scenario op voor offerte-instellingen (betalingsconditie, AV). */
  const wijzig = (patch: Partial<Scenario>) => {
    const bijgewerkt = { ...scenario, ...patch }
    slaScenarioOp(bijgewerkt)
    setScenario(bijgewerkt)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

      {/* ─── Opslagen kaart (informatief) ──────────────────────────────────── */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader className="border-blue-200 text-blue-800">Opslagen</CardHeader>
        <CardBody className="space-y-0.5">
          <Rij label="Kostprijs" bedrag={kostprijs} />
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-slate-500">
              AK {scenario.opslag_algemene_kosten.toFixed(1)}%
            </span>
            <span className="font-mono text-sm text-blue-700">
              + {formatEuro(opslag_euro)}
            </span>
          </div>
          <div className="border-t border-blue-200 mt-2 pt-2">
            <Rij label="Verkoopprijs excl. BTW" bedrag={verkoopprijs} accent />
          </div>
        </CardBody>
      </Card>

      {/* ─── BTW kaart (informatief, alle actieve tarieven) ─────────────────── */}
      <Card className="bg-green-50 border-green-200">
        <CardHeader className="border-green-200 text-green-800">BTW</CardHeader>
        <CardBody>
          {btwGroepen.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Geen BTW% ingesteld in de calculatie</p>
          ) : (
            <div className="space-y-0.5">
              {btwGroepen.map(({ pct, vp, btw }) => (
                <div key={pct} className="flex items-center justify-between py-1">
                  <span className="text-sm text-slate-500">
                    {pct}% over {formatEuro(vp)}
                  </span>
                  <span className="font-mono text-sm text-green-700">
                    + {formatEuro(btw)}
                  </span>
                </div>
              ))}
              <div className="border-t border-green-200 mt-2 pt-2">
                <Rij label="Totaal incl. BTW" bedrag={totaalInclBtw} accent />
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ─── Offerte-instellingen ────────────────────────────────────────────── */}
      <Card className="sm:col-span-2">
        <CardHeader>Offerte-instellingen</CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Betalingscondities</label>
              <select
                value={scenario.betalingsconditie_id ?? ''}
                onChange={e => wijzig({ betalingsconditie_id: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white"
              >
                <option value="">— Geen voorkeur —</option>
                {betalingscondities.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.naam}{b.is_standaard ? ' (standaard)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 block mb-1.5">Algemene Voorwaarden</label>
              <select
                value={scenario.algemene_voorwaarden_id ?? ''}
                onChange={e => wijzig({ algemene_voorwaarden_id: e.target.value || null })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts bg-white"
              >
                <option value="">— Geen voorkeur —</option>
                {algVoorwaarden.map(av => (
                  <option key={av.id} value={av.id}>
                    {av.naam}{av.versie ? ` (${av.versie})` : ''}{av.is_standaard ? ' (standaard)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardBody>
      </Card>

    </div>
  )
}
