'use client'

import { useEffect, useState } from 'react'
import { berekenBtwBreakdown, formatEuro, formatGetal, formatPct, scenarioDefaultOpslag } from '@/lib/everts-calc/calculations'
import { TriangleAlert } from 'lucide-react'
import ConfirmDialog from '@/components/everts-calc/shared/ConfirmDialog'
import type { Scenario, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'
import { useInstellingen } from '@/lib/everts-calc/use-instellingen'
import { laadBtwTarieven } from '@/lib/stamdata/btw-actions'
import type { BtwTariefKeuze } from '@/lib/stamdata/btw'
import { volgtCalculatietarief } from '@/lib/everts-calc/calculatietarief'

interface Props {
  scenario: Scenario
  kostprijs_live: number
  verkoopprijs_live: number
  regels?: Calculatieregel[]
  componenten?: Componentregel[]
  /** Zet de standaard-opslag én wist het eigen opslag% van alle regels. */
  onOpslagToepassen: (pct: number) => void
  /** Zet het uurtarief van de calculatie en van de arbeidsregels die het oude tarief volgden. */
  onUurtariefToepassen: (tarief: number) => void
  /** Aantal regels dat nu een eigen opslag% heeft; die raken hun percentage kwijt. */
  aantalEigenOpslag?: number
  /** Bevroren of afgesloten calculatie: alles in deze balk alleen-lezen. */
  readOnly?: boolean
}

const VAK = 'px-3 xl:px-4 py-2 min-w-0 flex-shrink-0'
const KOP = 'text-white/55 text-[10.5px] font-medium uppercase tracking-[0.06em] mb-0.5 whitespace-nowrap'

/** Rekenteken tussen twee vakken (+ of =). */
function Teken({ children }: { children: string }) {
  return <span aria-hidden className="hidden xl:inline self-center px-0.5 text-sm text-white/35 flex-shrink-0">{children}</span>
}

export default function TotalsBar({
  scenario, kostprijs_live, verkoopprijs_live, regels, componenten,
  onOpslagToepassen, onUurtariefToepassen, aantalEigenOpslag = 0, readOnly = false,
}: Props) {
  const defaultOpslag = scenarioDefaultOpslag(scenario)

  // Het tarief waarop arbeidsregels zonder eigen tarief terugvallen: het ★-tarief uit
  // Stamgegevens → Uursoorten & uurtarieven. Laat het hier zien, zodat zichtbaar is
  // welk tarief er gerekend wordt als dit veld leeg blijft.
  const uurtarieven = useInstellingen().uurtarieven ?? []
  const globaalTarief = (uurtarieven.find(t => t.is_favoriet) ?? uurtarieven[0])?.tarief ?? 0

  // Arbeidsregels: hoeveel er zijn, hoeveel er zonder tarief staan (uren voor € 0).
  const arbeidComps      = (componenten ?? []).filter(c => c.type === 'arbeid')
  const zonderUurtarief  = arbeidComps.filter(c => c.norm_hoeveelheid !== 0 && !c.tarief).length
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
  // Uurtarief: net als de opslag pas doorvoeren bij verlaten van het veld of Enter, en
  // alleen na bevestiging — het zet álle arbeidsregels om.
  const [tariefEdit,  setTariefEdit]  = useState(scenario.standaard_uurtarief != null ? String(scenario.standaard_uurtarief) : '')
  const [tariefFocus, setTariefFocus] = useState(false)
  const [tariefTeBevestigen, setTariefTeBevestigen] = useState<number | null>(null)
  useEffect(() => {
    if (!tariefFocus && tariefTeBevestigen === null) {
      setTariefEdit(scenario.standaard_uurtarief != null ? String(scenario.standaard_uurtarief) : '')
    }
  }, [scenario, tariefFocus, tariefTeBevestigen])

  /** Verlaten van het veld of Enter: bevestiging vragen als het tarief echt wijzigt. */
  const commitTarief = () => {
    setTariefFocus(false)
    const v = parseFloat(tariefEdit.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      setTariefEdit(scenario.standaard_uurtarief != null ? String(scenario.standaard_uurtarief) : '')
      return
    }
    if (scenario.standaard_uurtarief != null && Math.abs(v - scenario.standaard_uurtarief) < 0.005) return
    setTariefTeBevestigen(v)
  }

  // Wie volgt het huidige calculatietarief (gaat mee) en wie heeft een eigen tarief (blijft)?
  const huidigTarief = scenario.standaard_uurtarief || globaalTarief
  const gaatMee = tariefTeBevestigen === null ? 0
    : arbeidComps.filter(c => c.tarief !== tariefTeBevestigen && volgtCalculatietarief(c.tarief, huidigTarief)).length
  const eigenTarief = tariefTeBevestigen === null ? 0
    : arbeidComps.filter(c => !volgtCalculatietarief(c.tarief, huidigTarief)).length

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
  const margeKleur = marge_pct >= 20 ? '#61ac2b' : marge_pct >= 12 ? '#ffb866' : '#fda29b'

  const eigenOpslagZin = aantalEigenOpslag > 0
    ? ` ${aantalEigenOpslag} ${aantalEigenOpslag === 1 ? 'regel heeft' : 'regels hebben'} nu een eigen opslag%; dat percentage vervalt.`
    : ''

  return (
    /* `sticky bottom-0`: vangnet naast de gemeten schermhoogte in CalculatieHoofdscherm.
       Valt de onderkant van het scherm toch onder de vouw (de pagina scrolt), dan blijft
       de balk aan de onderrand van het venster plakken in plaats van mee te schuiven. */
    <div className="sticky bottom-0 z-20 flex-shrink-0 bg-brand-900 border-t-2 border-brand-500 text-white">
      <div className="flex items-stretch overflow-x-auto">

        {/* Invoer: wat je instelt. Apart gezet van de uitkomsten ernaast. */}
        <div className="flex items-stretch flex-shrink-0 bg-white/[0.06] border-r border-white/10">
          <div className={VAK}>
            <div className={`${KOP} flex items-center gap-1.5`}>
              Uurtarief
              {zonderUurtarief > 0 && (
                <span
                  className="flex items-center gap-1 rounded px-1 text-[10.5px] font-semibold normal-case tracking-normal whitespace-nowrap"
                  style={{ background: 'rgba(255,184,102,0.18)', color: '#ffb866' }}
                  title="Deze arbeidsregels hebben wel uren maar geen tarief en tellen voor € 0 mee."
                >
                  <TriangleAlert style={{ width: 11, height: 11 }} />
                  {zonderUurtarief} zonder tarief
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-white/50 text-xs">€</span>
              <input
                id="calc-uurtarief"
                type="number" step="0.50" min="0"
                value={tariefEdit}
                placeholder={globaalTarief > 0 ? formatGetal(globaalTarief, 2) : '—'}
                disabled={readOnly}
                onFocus={() => setTariefFocus(true)}
                onBlur={commitTarief}
                // preventDefault: anders klikt dezelfde Enter meteen "Annuleren" in de
                // bevestiging die het verlaten van het veld opent.
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
                title={globaalTarief > 0
                  ? `Uurtarief van deze calculatie; geldt voor alle arbeidsregels zonder eigen tarief. Leeg = het standaardtarief uit Stamgegevens → Uursoorten & uurtarieven (€ ${formatGetal(globaalTarief, 2)}/u).`
                  : 'Uurtarief van deze calculatie; geldt voor alle arbeidsregels zonder eigen tarief. Er is nog geen tarief ingesteld bij Stamgegevens → Uren → Uurtarieven.'}
                onChange={e => setTariefEdit(e.target.value)}
                className="w-16 h-6 bg-paper/10 hover:bg-paper/20 focus:bg-paper/30 rounded px-1.5 text-[13px] text-right text-white focus:outline-none focus:ring-1 focus:ring-white/40 border-0 placeholder-white/30 disabled:opacity-60"
              />
              <span className="text-white/50 text-xs">/u</span>
            </div>
          </div>

          <div className={VAK}>
            <div className={KOP}>Opslag</div>
            <div className="flex items-center gap-1">
              <input
                type="number" step="0.5" min="0" max="100"
                value={opslagEdit}
                placeholder="0"
                disabled={readOnly}
                onFocus={() => setOpslagFocus(true)}
                onBlur={commitOpslag}
                // Dit is het laatste veld van de pagina: een gewone Tab stuurt de focus de
                // pagina uit (Safari zet hem op de adresbalk). Tab vangen we dus zelf af en
                // behandelen we als Enter; de bevestiging houdt dan de focus.
                onKeyDown={e => {
                  if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                    e.preventDefault()
                    e.currentTarget.blur()
                  }
                }}
                title="Standaard-opslag van deze calculatie; wordt op alle regels toegepast"
                onChange={e => setOpslagEdit(e.target.value)}
                className="w-16 h-6 bg-paper/10 hover:bg-paper/20 focus:bg-paper/30 rounded px-1.5 text-[13px] text-right text-white focus:outline-none focus:ring-1 focus:ring-white/40 border-0 placeholder-white/30 disabled:opacity-60"
              />
              <span className="text-white/50 text-xs">%</span>
            </div>
          </div>
        </div>

        {/* Uitkomst als rekensom: kostprijs + opslag = verkoop + btw = totaal. */}
        <div className={VAK}>
          <div className={KOP}>Kostprijs</div>
          <div className="font-semibold text-sm tabular-nums">{formatEuro(kostprijs_live)}</div>
        </div>
        <Teken>+</Teken>
        <div className={VAK}>
          <div className={KOP} title={afwijkendeOpslag ? 'Regels met een eigen opslag% trekken het gemiddelde weg van de standaard' : undefined}>
            Opslag {formatGetal(opslag_pct, Math.abs(opslag_pct - Math.round(opslag_pct)) < 0.005 ? 0 : 2)}%
          </div>
          <div className="text-sm text-white/80 tabular-nums">{formatEuro(opslag_euro)}</div>
        </div>
        <Teken>=</Teken>
        <div className={VAK}>
          <div className={KOP}>Verkoop excl. btw</div>
          <div className="font-bold text-base text-everts-light tabular-nums">{formatEuro(verkoopprijs_live)}</div>
        </div>

        {/* BTW: per tarief (altijd read-only; instellen via rekenregels) */}
        {btw_groepen.map(g => (
          <div key={g.tarief_id ?? `pct:${g.pct}`} className="flex items-stretch flex-shrink-0">
            <Teken>+</Teken>
            <div className={VAK}>
              <div className={KOP} title={g.label}>
                {g.verlegd ? `Btw ${g.nominaal_pct ?? g.pct}% verlegd` : `Btw ${g.pct}%`}
              </div>
              <div className="text-sm text-white/80 tabular-nums">{formatEuro(g.btw)}</div>
            </div>
          </div>
        ))}
        <Teken>=</Teken>
        <div className={VAK}>
          <div className={KOP}>Totaal incl. btw</div>
          <div className="font-bold text-base text-white tabular-nums">{formatEuro(totaal_incl)}</div>
        </div>

        {/* Marge — rechts, met kleur én tekst: kleur alleen zegt niet genoeg. */}
        <div className="ml-auto px-4 xl:px-5 py-2 min-w-[120px] flex-shrink-0 border-l border-white/10">
          <div className={KOP}>Marge</div>
          <div className="flex items-baseline gap-2">
            <span className="font-bold text-base tabular-nums" style={{ color: margeKleur }}>{formatPct(marge_pct)}</span>
            {verkoopprijs_live > 0 && marge_pct < 12 && (
              <span className="text-[11px] font-medium whitespace-nowrap" style={{ color: margeKleur }}>onder 12%</span>
            )}
          </div>
          <div className="mt-1 h-1 bg-paper/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${margeWidth}%`, background: margeKleur }}
            />
          </div>
        </div>

      </div>

      <ConfirmDialog
        open={tariefTeBevestigen !== null}
        onOpenChange={open => { if (!open) setTariefTeBevestigen(null) }}
        title={`Uurtarief op € ${formatGetal(tariefTeBevestigen ?? 0, 2)} per uur zetten?`}
        description={
          `${gaatMee} arbeidsregel${gaatMee === 1 ? '' : 's'} met het calculatietarief ${gaatMee === 1 ? 'gaat' : 'gaan'} mee, nieuwe regels krijgen dit tarief ook.`
          + (eigenTarief > 0
            ? ` ${eigenTarief} regel${eigenTarief === 1 ? '' : 's'} met een eigen tarief ${eigenTarief === 1 ? 'blijft' : 'blijven'} staan; Controle laat ze nakijken.`
            : '')
        }
        confirmLabel="Toepassen"
        onConfirm={() => {
          if (tariefTeBevestigen !== null) onUurtariefToepassen(tariefTeBevestigen)
          setTariefTeBevestigen(null)
        }}
      />

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
