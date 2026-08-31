'use client'

import { useEffect, useState } from 'react'
import { berekenBtwBreakdown, formatEuro, formatGetal, formatPct, scenarioDefaultOpslag } from '@/lib/everts-calc/calculations'
import ConfirmDialog from '@/components/everts-calc/shared/ConfirmDialog'
import type { Scenario, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'

interface Props {
  scenario: Scenario
  kostprijs_live: number
  verkoopprijs_live: number
  regels?: Calculatieregel[]
  componenten?: Componentregel[]
  onScenarioWijzig: (patch: Partial<Scenario>) => void
  /** Zet de standaard-opslag én wist het eigen opslag% van alle regels. */
  onOpslagToepassen: (pct: number) => void
  /** Aantal regels dat nu een eigen opslag% heeft; die raken hun percentage kwijt. */
  aantalEigenOpslag?: number
  /** Bevroren of afgesloten calculatie: alles in deze balk alleen-lezen. */
  readOnly?: boolean
}


export default function TotalsBar({
  scenario, kostprijs_live, verkoopprijs_live, regels, componenten, onScenarioWijzig,
  onOpslagToepassen, aantalEigenOpslag = 0, readOnly = false,
}: Props) {
  const defaultOpslag = scenarioDefaultOpslag(scenario)
  const btwDefault = scenario.btw_pct_default ?? 0

  // Tarieven uit de stamgegevens, zodat een verlegd tarief hier als "21% verlegd" leest
  // in plaats van als een kale 0%.
  const [tarieven, setTarieven] = useState<BtwTariefKeuze[]>([])
  useEffect(() => {
    laadBtwTarieven().then(setTarieven).catch(() => setTarieven([]))
  }, [])

  const [btw_groepen, setBtwGroepen] = useState(() =>
    regels && componenten && regels.length > 0
      ? berekenBtwBreakdown(regels, componenten, defaultOpslag, btwDefault)
      : [{ pct: btwDefault, basis: verkoopprijs_live, btw: verkoopprijs_live * (btwDefault / 100) }]
  )

  useEffect(() => {
    if (regels && componenten && regels.length > 0) {
      setBtwGroepen(berekenBtwBreakdown(regels, componenten, defaultOpslag, btwDefault, tarieven))
    } else {
      setBtwGroepen([{
        pct: btwDefault,
        basis: verkoopprijs_live,
        btw: verkoopprijs_live * (btwDefault / 100),
      }])
    }
  }, [verkoopprijs_live, kostprijs_live, regels, componenten, defaultOpslag, btwDefault, tarieven])

  const btw_totaal   = btw_groepen.reduce((s, g) => s + g.btw, 0)
  const totaal_incl  = verkoopprijs_live + btw_totaal
  const marge_euro   = verkoopprijs_live - kostprijs_live
  const marge_pct    = verkoopprijs_live > 0 ? (marge_euro / verkoopprijs_live) * 100 : 0
  const opslag_euro  = verkoopprijs_live - kostprijs_live
  const opslag_pct   = kostprijs_live > 0 ? (opslag_euro / kostprijs_live) * 100 : 0
  // Vrij typen zonder dat de invoer onder je handen terugspringt. De waarde gaat pas
  // door bij verlaten van het veld of Enter, en alleen na bevestiging: hij zet álle
  // regels om. Annuleren → het veld valt terug op de opgeslagen opslag.
  const [opslagEdit, setOpslagEdit] = useState(String(scenarioDefaultOpslag(scenario)))
  const [opslagFocus, setOpslagFocus] = useState(false)
  const [teBevestigen, setTeBevestigen] = useState<number | null>(null)
  useEffect(() => {
    if (!opslagFocus && teBevestigen === null) setOpslagEdit(String(scenarioDefaultOpslag(scenario)))
  }, [scenario, opslagFocus, teBevestigen])

  /** Verlaten van het veld of Enter: vraag bevestiging als het percentage echt wijzigt. */
  const commitOpslag = () => {
    setOpslagFocus(false)
    const v = parseFloat(opslagEdit.replace(',', '.'))
    const nieuw = isNaN(v) ? 0 : v
    if (Math.abs(nieuw - defaultOpslag) < 0.005) return
    setTeBevestigen(nieuw)
  }
  // Regels met een eigen Opsl.% trekken het effectieve percentage weg van de standaard.
  const afwijkendeOpslag = Math.abs(opslag_pct - defaultOpslag) > 0.005
  const margeWidth = Math.min(100, Math.max(0, (marge_pct / 30) * 100))

  const eigenOpslagZin = aantalEigenOpslag > 0
    ? ` ${aantalEigenOpslag} ${aantalEigenOpslag === 1 ? 'regel heeft' : 'regels hebben'} nu een eigen opslag%; dat percentage vervalt.`
    : ''

  return (
    <div className="flex-shrink-0 bg-brand-900 border-t-2 border-brand-500 text-white">
      <div className="flex items-stretch gap-0 divide-x divide-white/10 overflow-x-auto">

        {/* Standaard uurtarief */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5 flex items-center gap-1">
            Uurtarief AB
          </div>
          <div className="flex items-center gap-0.5  text-sm">
            <span className="text-white/50 text-xs">€</span>
            <input
              type="number" step="0.50" min="0"
              value={scenario.standaard_uurtarief ?? ''}
              placeholder="—"
              disabled={readOnly}
              onChange={e => {
                const v = parseFloat(e.target.value)
                onScenarioWijzig({ standaard_uurtarief: isNaN(v) ? undefined : v })
              }}
              className="w-14 bg-paper/10 hover:bg-paper/20 focus:bg-paper/30 rounded px-1 py-0.5 text-xs  text-white focus:outline-none focus:ring-1 focus:ring-white/40 border-0 placeholder-white/30"
            />
            <span className="text-white/50 text-xs">/u</span>
          </div>
        </div>

        {/* Kostprijs */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Kostprijs</div>
          <div className="font-semibold  text-sm">{formatEuro(kostprijs_live)}</div>
        </div>

        {/* Standaard-opslag van de calculatie (instelbaar) + wat het effectief wordt.
            De twee lopen uiteen zodra regels een eigen Opsl.% hebben. */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Opslag</div>
          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-0.5 text-sm">
              <input
                type="number" step="0.5" min="0" max="100"
                value={opslagEdit}
                placeholder="0"
                disabled={readOnly}
                onFocus={() => setOpslagFocus(true)}
                onBlur={commitOpslag}
                onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
                title="Standaard-opslag van deze calculatie; wordt op alle regels toegepast"
                onChange={e => setOpslagEdit(e.target.value)}
                className="w-14 bg-paper/10 hover:bg-paper/20 focus:bg-paper/30 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-white/40 border-0 placeholder-white/30 disabled:opacity-60"
              />
              <span className="text-white/50 text-xs">%</span>
            </div>
            <span className="text-white/40 text-xs whitespace-nowrap">
              {afwijkendeOpslag ? `→ ${formatGetal(opslag_pct, 2)}% ` : ''}
              ({opslag_euro >= 0 ? '+' : ''}{formatEuro(opslag_euro)})
            </span>
          </div>
        </div>

        {/* Verkoopprijs excl. BTW */}
        <div className="px-4 py-2.5 flex-1 min-w-0">
          <div className="text-white/50 text-xs mb-0.5">VP excl. BTW</div>
          <div className="font-bold  text-base text-everts-light">{formatEuro(verkoopprijs_live)}</div>
        </div>

        {/* BTW: per tarief (altijd read-only; instellen via rekenregels) */}
        {btw_groepen.map(g => (
          <div key={g.tarief_id ?? `pct:${g.pct}`} className="px-4 py-2.5 min-w-0 flex-shrink-0">
            <div className="text-white/50 text-xs mb-0.5" title={g.label}>
              {g.verlegd ? `BTW ${g.nominaal_pct ?? g.pct}% verlegd` : `BTW ${g.pct}%`}
            </div>
            <div className=" text-sm text-white/80">+ {formatEuro(g.btw)}</div>
          </div>
        ))}

        {/* Totaal incl. BTW */}
        <div className="px-4 py-2.5 min-w-0 flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Totaal incl. BTW</div>
          <div className="font-bold  text-base text-white">{formatEuro(totaal_incl)}</div>
        </div>

        {/* Marge */}
        <div className="px-5 py-2.5 min-w-[130px] flex-shrink-0">
          <div className="text-white/50 text-xs mb-0.5">Marge</div>
          <div
            className="font-bold  text-base"
            style={{ color: marge_pct >= 20 ? '#61ac2b' : marge_pct >= 12 ? '#ffb866' : '#fda29b' }}
          >
            {formatPct(marge_pct)}
          </div>
          <div className="mt-1 h-1 bg-paper/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${margeWidth}%`,
                background: marge_pct >= 20 ? '#61ac2b' : marge_pct >= 12 ? '#ffb866' : '#fda29b',
              }}
            />
          </div>
        </div>

      </div>

      <ConfirmDialog
        open={teBevestigen !== null}
        onOpenChange={open => { if (!open) setTeBevestigen(null) }}
        title={`Opslag op ${formatGetal(teBevestigen ?? 0, 2)}% zetten?`}
        description={
          `Dit past de verkoopprijs van alle regels in deze calculatie aan.${eigenOpslagZin}`
          + ' Daarna kun je per regel nog een afwijkend percentage invullen.'
        }
        confirmLabel="Toepassen"
        onConfirm={() => {
          if (teBevestigen !== null) onOpslagToepassen(teBevestigen)
          setTeBevestigen(null)
        }}
      />
    </div>
  )
}
