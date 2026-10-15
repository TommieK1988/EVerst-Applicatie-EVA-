'use client'

import { useMemo, useState } from 'react'
import { Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import { getGroepen, getCalculatieregelsVoorScenario, getComponentregelsVoorScenario, slaGroepOp } from '@/lib/everts-calc/local-store'
import { berekeningNummers, formatEuro, formatGetal, parseGetal } from '@/lib/everts-calc/calculations'
import { begrensToeslag, toeslagVoorUren, TOESLAG_MAX, TOESLAG_MIN, UREN_PER_DAG } from '@/lib/everts-calc/tijdtoeslag'
import { afrondSuggestie, bouwUrenRijen, dagenTekst, totaalVan, type UrenRij } from '@/lib/everts-calc/uren-per-groep'
import { cn } from '@/lib/everts-calc/utils'

interface Props {
  scenarioId: string
  readOnly?: boolean
  /** Herstelpunt zetten vóór het toepassen, zodat Ctrl+Z het terugdraait. */
  onVoorWijziging: () => void
  /** Grid herladen en opslaan na het toepassen. */
  onNaWijziging: () => void
}

/** Knop "Uren" in de werkbalk, met het venster erachter. */
export default function UrenPerGroepKnop(props: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} title="Uren per groep en tijdtoeslag">
        <Clock className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Uren</span>
      </Button>
      {open && <UrenDialog {...props} onSluit={() => setOpen(false)} />}
    </>
  )
}

function UrenDialog({ scenarioId, readOnly, onVoorWijziging, onNaWijziging, onSluit }: Props & { onSluit: () => void }) {
  // Eenmalig inlezen bij openen: het venster is modaal, het grid verandert intussen niet.
  const [groepen] = useState(() => getGroepen(scenarioId))
  const rijen = useMemo(
    () => bouwUrenRijen(groepen, getCalculatieregelsVoorScenario(scenarioId), getComponentregelsVoorScenario(scenarioId)),
    [groepen, scenarioId],
  )
  const nummers = useMemo(() => berekeningNummers(groepen), [groepen])
  const [pct, setPct] = useState(() => new Map(groepen.map(g => [g.id, g.tijdtoeslag_pct ?? 0])))
  const zet = (id: string, waarde: number) => setPct(prev => new Map(prev).set(id, begrensToeslag(waarde)))

  const wijzigingen = groepen.filter(g => (pct.get(g.id) ?? 0) !== (g.tijdtoeslag_pct ?? 0))
  const hoofd = rijen.filter(r => r.diepte === 0)
  const totaal = hoofd.reduce((s, r) => {
    const t = totaalVan(r.groep.id, rijen, pct)
    return { normUren: s.normUren + t.normUren, calcUren: s.calcUren + t.calcUren, kostVerschil: s.kostVerschil + t.kostVerschil, metToeslag: s.metToeslag + t.metToeslag }
  }, { normUren: 0, calcUren: 0, kostVerschil: 0, metToeslag: 0 })

  const pasToe = () => {
    if (wijzigingen.length === 0) { onSluit(); return }
    onVoorWijziging()
    for (const g of wijzigingen) {
      const p = pct.get(g.id) ?? 0
      slaGroepOp({ ...g, tijdtoeslag_pct: p || undefined })
    }
    onNaWijziging()
    toast.success(`Tijdtoeslag aangepast in ${wijzigingen.length} groep${wijzigingen.length === 1 ? '' : 'en'}`)
    onSluit()
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent size="xl" className="max-w-[1120px]">
        <DialogHeader>
          <div>
            <DialogTitle>Uren per groep</DialogTitle>
            <DialogDescription>
              De toeslag zet je per groep met regels. Schuif, of typ de uren die je wilt; het andere veld rekent mee. De normen zelf blijven staan.
            </DialogDescription>
          </div>
        </DialogHeader>
        <DialogBody>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                <th className="py-2 pr-2">Groep</th>
                <th className="w-24 py-2 pr-4 text-right">Uren normen</th>
                <th className="w-64 py-2 pr-2">Tijdtoeslag</th>
                <th className="w-40 py-2 pr-4 text-right">Uren calculatie</th>
                <th className="w-28 py-2 pr-4 text-right">Dagen à {formatGetal(UREN_PER_DAG, 1)} u</th>
                <th className="w-28 py-2 text-right">Kostprijs</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map(r => (
                <GroepRij
                  key={r.groep.id} rij={r} rijen={rijen} pct={pct} nummer={nummers.get(r.groep.id)}
                  readOnly={readOnly} onZet={v => zet(r.groep.id, v)}
                />
              ))}
              <tr className="bg-neutral-50">
                <td className="py-3 pr-2 text-[13px] font-semibold text-neutral-800">Totaal</td>
                <td className="py-3 pr-4 text-right font-mono text-[13px] font-semibold tabular-nums">{formatGetal(totaal.normUren)}</td>
                <td className="py-3 pr-2 text-xs text-neutral-500">
                  {totaal.metToeslag === 0 ? 'geen toeslag' : `${totaal.metToeslag} groep${totaal.metToeslag === 1 ? '' : 'en'} met toeslag`}
                </td>
                <td className="py-3 pr-4 text-right font-mono text-[13px] font-semibold tabular-nums">{formatGetal(totaal.calcUren)}</td>
                <td className="py-3 pr-4 text-right font-mono text-[13px] tabular-nums">{dagenTekst(totaal.calcUren)}</td>
                <td className="py-3 text-right"><KostVerschil bedrag={totaal.kostVerschil} /></td>
              </tr>
            </tbody>
          </table>
        </DialogBody>
        <DialogFooter split className="border-t border-neutral-200 bg-neutral-50">
          <span className="text-xs text-neutral-500">
            De toeslag telt op alle arbeidsnormen in de groep. Minder tijd kleurt oranje. Werkbegroting, Bouw7 en planning krijgen de uren inclusief toeslag. Ctrl+Z draait het terug.
          </span>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onSluit}>{readOnly ? 'Sluiten' : 'Annuleren'}</Button>
            {!readOnly && (
              <Button variant="primary" size="sm" disabled={wijzigingen.length === 0} onClick={pasToe}>
                Toepassen{wijzigingen.length > 0 ? ` · ${wijzigingen.length} groep${wijzigingen.length === 1 ? '' : 'en'}` : ''}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function GroepRij({ rij, rijen, pct, nummer, readOnly, onZet }: {
  rij: UrenRij
  rijen: UrenRij[]
  pct: Map<string, number>
  nummer?: string
  readOnly?: boolean
  onZet: (pct: number) => void
}) {
  const t = totaalVan(rij.groep.id, rijen, pct)
  const p = pct.get(rij.groep.id) ?? 0
  const bewerkbaar = rij.eigenUren > 0
  const hoofd = rij.diepte === 0
  const naam = (
    <td className="py-2.5 pr-2" style={{ paddingLeft: rij.diepte * 20 }}>
      <div className={cn('text-[13px] text-neutral-800', hoofd && 'font-semibold')}>
        {nummer && <span className="mr-1.5 text-neutral-500">{nummer}</span>}{rij.groep.naam}
      </div>
      {bewerkbaar && rij.subgroepen.length > 0 && (
        <div className="text-[11px] text-neutral-500">toeslag op de eigen regels ({formatGetal(rij.eigenUren)} u)</div>
      )}
    </td>
  )

  if (t.normUren === 0) {
    return (
      <tr className={cn('border-b border-neutral-100', hoofd && 'bg-neutral-50/70')}>
        {naam}
        <td colSpan={5} className="py-2.5 text-xs text-neutral-400">geen eigen uren (onderaanneming of materiaal)</td>
      </tr>
    )
  }

  const suggestie = bewerkbaar && !readOnly ? afrondSuggestie(rij.eigenUren, rij.eigenUren * (1 + p / 100)) : null
  return (
    <tr className={cn(
      'border-b border-neutral-100 align-top',
      hoofd && !bewerkbaar && 'bg-neutral-50/70',
      bewerkbaar && p > 0 && 'bg-info-50/50',
      bewerkbaar && p < 0 && 'bg-warning-50/60',
    )}>
      {naam}
      <td className="py-2.5 pr-4 text-right font-mono text-[13px] tabular-nums">{formatGetal(t.normUren)}</td>
      <td className="py-2 pr-2">
        {bewerkbaar ? (
          <div className="flex items-center gap-2">
            <input
              type="range" min={TOESLAG_MIN} max={TOESLAG_MAX} step={0.5} value={p} disabled={readOnly}
              onChange={e => onZet(Number(e.target.value))}
              className={cn('w-40', p < 0 ? 'accent-warning-500' : 'accent-info-500')}
              aria-label={`Tijdtoeslag ${rij.groep.naam}`}
            />
            <span className={cn('w-14 text-right text-[12px] font-semibold tabular-nums',
              p > 0 ? 'text-info-700' : p < 0 ? 'text-warning-700' : 'text-neutral-500')}>
              {p > 0 ? '+' : p < 0 ? '−' : ''}{formatGetal(Math.abs(p), 1)}%
            </span>
          </div>
        ) : (
          <span className="text-xs text-info-700">
            {t.metToeslag === 0 ? <span className="text-neutral-500">geen toeslag</span> : `toeslag in ${t.metToeslag} subgroep${t.metToeslag === 1 ? '' : 'en'}`}
          </span>
        )}
      </td>
      <td className="py-2 pr-4 text-right">
        {bewerkbaar && rij.subgroepen.length === 0 ? (
          <div className="flex flex-col items-end gap-1">
            <UrenInvoer
              uren={rij.eigenUren * (1 + p / 100)} readOnly={readOnly} toon={p}
              onZet={u => onZet(toeslagVoorUren(rij.eigenUren, u))}
            />
            {suggestie !== null && (
              <button
                type="button" onClick={() => onZet(toeslagVoorUren(rij.eigenUren, suggestie))}
                className="rounded-full border border-dashed border-success-300 px-2 py-px text-[10.5px] font-semibold text-success-700 hover:border-success-500"
                title="Afronden op hele dagen of weken"
              >
                → {formatGetal(suggestie, 1)} u ({Math.round(suggestie / UREN_PER_DAG)} dag{suggestie === UREN_PER_DAG ? '' : 'en'})
              </button>
            )}
          </div>
        ) : (
          <span className={cn('font-mono text-[13px] tabular-nums', hoofd && 'font-semibold')}>{formatGetal(t.calcUren)}</span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-right font-mono text-[13px] tabular-nums">{dagenTekst(t.calcUren)}</td>
      <td className="py-2.5 text-right"><KostVerschil bedrag={t.kostVerschil} /></td>
    </tr>
  )
}

/** Uren typen: bij Enter of verlaten rekent hij de toeslag terug. */
function UrenInvoer({ uren, toon, readOnly, onZet }: {
  uren: number
  toon: number
  readOnly?: boolean
  onZet: (uren: number) => void
}) {
  const [tekst, setTekst] = useState<string | null>(null)
  const bevestig = () => {
    if (tekst !== null) onZet(parseGetal(tekst))
    setTekst(null)
  }
  return (
    <input
      inputMode="decimal" disabled={readOnly}
      value={tekst ?? formatGetal(uren)}
      onFocus={e => { setTekst(formatGetal(uren)); e.target.select() }}
      onChange={e => setTekst(e.target.value)}
      onBlur={bevestig}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); bevestig() } if (e.key === 'Escape') setTekst(null) }}
      className={cn(
        'w-24 rounded-md border bg-white px-2 py-1 text-right font-mono text-[13px] tabular-nums focus:outline-none',
        toon > 0 ? 'border-info-500' : toon < 0 ? 'border-warning-500' : 'border-neutral-300 focus:border-brand-500',
      )}
    />
  )
}

function KostVerschil({ bedrag }: { bedrag: number }) {
  if (Math.abs(bedrag) < 0.005) return <span className="text-neutral-300">—</span>
  return (
    <span className={cn('font-mono text-[13px] font-semibold tabular-nums', bedrag > 0 ? 'text-info-700' : 'text-warning-700')}>
      {bedrag > 0 ? '+ ' : '− '}{formatEuro(Math.abs(bedrag))}
    </span>
  )
}
