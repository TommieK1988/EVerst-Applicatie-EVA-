'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ListChecks } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import SchilderbehandelingZoekveld from '@/components/everts-calc/calculatie/SchilderbehandelingZoekveld'
import { laadBehandelingen, haalCombinaties, haalSchilderDropdownData } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { SchilderBehandeling, SchilderCombinatie } from '@/lib/everts-calc/services/schilderwerk'
import {
  getCalculatieregelsVoorScenario, getMeetregelAggregaten, getComponentregels, slaCalculatieregelOp,
} from '@/lib/everts-calc/local-store'
import {
  groepeerPerBestekcode, planKoppeling, benodigdeTypeIds, heeftBibliotheekNormen, ZONDER_CODE, type CodeGroep, type KoppelStap,
} from '@/lib/everts-calc/behandeling-koppelen'
import { vervangNormenUitCombinatie } from '@/lib/everts-calc/normen-uit-combinatie'

interface Props {
  scenarioId: string
  readOnly?: boolean
  /** Herstelpunt zetten vóór het koppelen, zodat Ctrl+Z het terugdraait. */
  onVoorWijziging: () => void
  /** Grid herladen en opslaan na het koppelen. */
  onNaWijziging: () => void
}

/** Knop in de werkbalk van de calculatie, met het venster erachter. */
export default function BehandelingPerCodeKnop(props: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline" size="sm" disabled={props.readOnly} onClick={() => setOpen(true)}
        title="Per bestekscode in één keer een behandeling koppelen"
      >
        <ListChecks className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Behandeling per code</span>
      </Button>
      {open && <BehandelingPerCodeDialog {...props} onSluit={() => setOpen(false)} />}
    </>
  )
}

function BehandelingPerCodeDialog({ scenarioId, onVoorWijziging, onNaWijziging, onSluit }: Props & { onSluit: () => void }) {
  // Eenmalig inlezen bij openen: het venster is modaal, het grid verandert intussen niet.
  const [regels] = useState(() => getCalculatieregelsVoorScenario(scenarioId))
  const [aggregaten] = useState(() => getMeetregelAggregaten())
  const groepen = useMemo(() => groepeerPerBestekcode(regels, aggregaten), [regels, aggregaten])

  const [bibliotheek, setBibliotheek] = useState<SchilderBehandeling[]>([])
  // Welke behandeling heeft normen op welk type: voor het zoekveld en de kolom Normen.
  const [lijst, setLijst] = useState<{ type_id: string; behandeling_id: string }[] | null>(null)
  useEffect(() => {
    laadBehandelingen().then(setBibliotheek).catch(() => setBibliotheek([]))
    haalSchilderDropdownData().then(d => setLijst(d.combinaties)).catch(() => setLijst(null))
  }, [])
  const [normenOvernemen, setNormenOvernemen] = useState(true)

  const [keuzes, setKeuzes] = useState<Map<string, SchilderBehandeling>>(new Map())
  const kies = (sleutel: string, b: SchilderBehandeling | null) => setKeuzes(prev => {
    const volgend = new Map(prev)
    if (b) volgend.set(sleutel, b); else volgend.delete(sleutel)
    return volgend
  })

  // Combinaties per type ophalen voor de regels waarvoor een keuze is gemaakt.
  const [combinaties, setCombinaties] = useState<Map<string, SchilderCombinatie[]>>(new Map())
  const [laden, setLaden] = useState(false)
  const gekozenRegels = useMemo(
    () => groepen.filter(g => keuzes.has(g.sleutel)).flatMap(g => g.regels),
    [groepen, keuzes],
  )
  useEffect(() => {
    const ontbrekend = benodigdeTypeIds(gekozenRegels, aggregaten).filter(id => !combinaties.has(id))
    if (ontbrekend.length === 0) { setLaden(false); return }
    let actief = true
    setLaden(true)
    Promise.all(ontbrekend.map(async (id): Promise<[string, SchilderCombinatie[]]> =>
      [id, await haalCombinaties(id).catch(() => [])]))
      .then(paren => {
        if (!actief) return
        setCombinaties(prev => new Map([...prev, ...paren]))
        setLaden(false)
      })
    return () => { actief = false }
  }, [gekozenRegels, aggregaten, combinaties])

  // Regels die de gekozen behandeling al hebben, blijven ongemoeid.
  const stappenPerGroep = useMemo(() => new Map(groepen.map(g => {
    const b = keuzes.get(g.sleutel)
    const teWijzigen = b ? g.regels.filter(r => r.schilderbehandeling_id !== b.id) : []
    return [g.sleutel, b ? planKoppeling(teWijzigen, aggregaten, combinaties, { id: b.id, naam: b.naam }) : []]
  })), [groepen, keuzes, aggregaten, combinaties])
  const stappen: KoppelStap[] = useMemo(() => [...stappenPerGroep.values()].flat(), [stappenPerGroep])

  const zonderNormen = stappen.filter(s => !s.combinatie).length
  const normenVervangen = normenOvernemen
    ? stappen.filter(s => s.combinatie && getComponentregels(s.regel.id).length > 0).length
    : 0

  const koppel = useCallback(() => {
    if (stappen.length === 0) return
    onVoorWijziging()
    for (const s of stappen) {
      slaCalculatieregelOp(s.nieuw)
      if (normenOvernemen && s.combinatie) vervangNormenUitCombinatie(s.regel.id, s.combinatie)
    }
    onNaWijziging()
    toast.success(`Behandeling gekoppeld aan ${stappen.length} regel${stappen.length === 1 ? '' : 's'}`)
    onSluit()
  }, [stappen, normenOvernemen, onVoorWijziging, onNaWijziging, onSluit])

  // Wat er na het koppelen nog zonder behandeling staat, per eenheid.
  const zonderBehandeling = useMemo(() => telPerEenheid(groepen.flatMap(g =>
    keuzes.has(g.sleutel) ? [] : g.regels.filter(r => !r.schilderbehandeling_id && !r.schilderbehandeling))), [groepen, keuzes])
  const totaal = useMemo(() => telPerEenheid(groepen.flatMap(g => g.regels)), [groepen])

  const naamVan = (id: string) => bibliotheek.find(b => b.id === id)

  return (
    <Dialog open onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent size="xl" className="max-w-[1080px]">
        <DialogHeader>
          <div>
            <DialogTitle>Behandeling per bestekscode</DialogTitle>
            <DialogDescription>
              Per onderdeel en type, en daarbinnen per bestekscode, kies je één behandeling. Alle regels uit de meetstaat op die post krijgen hem in één keer, over alle groepen heen, met de normen uit de schilderwerkbibliotheek.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody>
          {groepen.length === 0 ? (
            <p className="text-neutral-500">
              Er staan nog geen regels uit de meetstaat in deze calculatie. Synchroniseer eerst de meetstaat.
            </p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 text-left text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  <th className="py-2 pr-2 whitespace-nowrap">Onderdeel · type</th>
                  <th className="w-24 py-2 pr-2">Code</th>
                  <th className="w-16 py-2 pr-2">Regels</th>
                  <th className="w-28 py-2 pr-4 text-right">Hoeveelheid</th>
                  <th className="w-32 py-2 pr-2">Huidig</th>
                  <th className="py-2 pr-3">Behandeling</th>
                  <th className="min-w-[200px] py-2">Normen</th>
                </tr>
              </thead>
              <tbody>
                {groepen.map(g => (
                  <CodeRij
                    key={g.sleutel}
                    groep={g}
                    keuze={keuzes.get(g.sleutel)}
                    bibliotheek={bibliotheek}
                    naamVan={naamVan}
                    onKies={b => kies(g.sleutel, b)}
                    stappen={stappenPerGroep.get(g.sleutel) ?? []}
                    normenOvernemen={normenOvernemen}
                    heeftNormen={b => heeftBibliotheekNormen(g.typeId, b.id, lijst)}
                  />
                ))}
                <tr className="bg-neutral-50 align-top">
                  <td className="py-3 pr-2 text-[13px] font-semibold text-neutral-800" colSpan={2}>Totaal</td>
                  <td className="py-3 pr-2 font-mono text-[13px] font-semibold tabular-nums">{groepen.reduce((n, g) => n + g.regels.length, 0)}</td>
                  <td className="py-3 pr-4 text-right font-mono text-[13px] font-semibold tabular-nums whitespace-nowrap">
                    {totaal.map(t => <div key={t.eenheid}>{fmt(t.hoeveelheid)} {t.eenheid}</div>)}
                  </td>
                  <td colSpan={3} className="py-3 text-xs text-neutral-600">
                    {zonderBehandeling.length === 0
                      ? 'Alles heeft straks een behandeling.'
                      : <>Waarvan zonder behandeling: <strong className="text-neutral-800">{zonderBehandeling.map(t => `${fmt(t.hoeveelheid)} ${t.eenheid}`).join(' · ')}</strong></>}
                  </td>
                </tr>
              </tbody>
            </table>
          )}

        </DialogBody>

        <DialogFooter split className="border-t border-neutral-200 bg-neutral-50">
          <div className="space-y-1.5 text-xs text-neutral-600">
            <label className="flex cursor-pointer items-center gap-2 font-semibold text-neutral-800">
              <input type="checkbox" checked={normenOvernemen} onChange={e => setNormenOvernemen(e.target.checked)} className="h-3.5 w-3.5 accent-brand-500" />
              Normen overnemen uit de bibliotheek
            </label>
            <p>
              {stappen.length > 0 && <><strong className="text-neutral-800">{stappen.length} regel{stappen.length === 1 ? '' : 's'}</strong> krijg{stappen.length === 1 ? 't' : 'en'} een nieuwe behandeling. </>}
              {normenVervangen > 0 && <>Normen op <strong className="text-neutral-800">{normenVervangen} regel{normenVervangen === 1 ? '' : 's'}</strong> worden vervangen door de bibliotheeknormen. </>}
              {zonderNormen > 0 && <><strong className="text-warning-700">{zonderNormen} regel{zonderNormen === 1 ? '' : 's'}</strong> {zonderNormen === 1 ? 'heeft' : 'hebben'} geen bibliotheeknormen. </>}
              Uren rekenen met het uurtarief van deze calculatie. Ctrl+Z draait alles terug.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={onSluit}>Annuleren</Button>
            <Button variant="primary" size="sm" disabled={stappen.length === 0 || laden} onClick={koppel}>
              {laden ? 'Normen ophalen…' : `Koppelen · ${stappen.length} regel${stappen.length === 1 ? '' : 's'}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CodeRij({ groep, keuze, bibliotheek, naamVan, onKies, stappen, normenOvernemen, heeftNormen }: {
  groep: CodeGroep
  keuze?: SchilderBehandeling
  bibliotheek: SchilderBehandeling[]
  naamVan: (id: string) => SchilderBehandeling | undefined
  onKies: (b: SchilderBehandeling | null) => void
  stappen: KoppelStap[]
  normenOvernemen: boolean
  heeftNormen: (b: SchilderBehandeling) => boolean | null
}) {
  const [enige] = groep.behandelingIds

  return (
    <tr className={`border-b border-neutral-200 align-top ${keuze ? 'bg-brand-50' : ''}`}>
      <td className="py-3 pr-2 text-[13px] text-neutral-800">
        {groep.onderdeel}
        {groep.type && <span className="text-neutral-500"> · {groep.type}</span>}
      </td>
      <td className="py-3 pr-2">
        {groep.code === ZONDER_CODE
          ? <span className="text-xs text-neutral-500">zonder code</span>
          : <span className="font-mono text-[13px] font-semibold text-info-700">{groep.code}</span>}
      </td>
      <td className="py-3 pr-2 font-mono text-[13px] tabular-nums">{groep.regels.length}</td>
      <td className="py-3 pr-4 text-right font-mono text-[13px] tabular-nums whitespace-nowrap">
        {groep.totalen.map(t => <div key={t.eenheid}>{fmt(t.hoeveelheid)} {t.eenheid}</div>)}
      </td>
      <td className="py-3 pr-2">
        {groep.behandelingIds.length > 1
          ? <Badge tone="warning" size="md">Gemengd ({groep.behandelingIds.length})</Badge>
          : enige
            ? <Badge tone="brand" size="md">{naamVan(enige)?.code || naamVan(enige)?.naam || 'Gekoppeld'}</Badge>
            : <Badge tone="neutral" size="md">Geen</Badge>}
      </td>
      <td className="w-[320px] max-w-[320px] py-2 pr-3">
        <SchilderbehandelingZoekveld
          behandelingId={keuze?.id}
          bibliotheek={bibliotheek}
          normenVoor={groep.typeId ? heeftNormen : undefined}
          onderdeel={groep.onderdeel}
          onSelecteer={b => onKies(b)}
          onWis={() => onKies(null)}
        />
      </td>
      <td className="min-w-[200px] py-3 text-xs">
        <NormenGevolg keuze={keuze} stappen={stappen} normenOvernemen={normenOvernemen}
          bekend={keuze ? heeftNormen(keuze) : null} />
      </td>
    </tr>
  )
}

/** Wat het koppelen met de normen van deze post doet, vóór je op Koppelen drukt. */
function NormenGevolg({ keuze, stappen, normenOvernemen, bekend }: {
  keuze?: SchilderBehandeling
  stappen: KoppelStap[]
  normenOvernemen: boolean
  /** Uit de lichte lijst; de volledige combinaties komen pas na het kiezen binnen. */
  bekend: boolean | null
}) {
  if (!keuze) return <span className="text-neutral-400">—</span>
  if (stappen.length === 0) return <span className="text-neutral-500"><span className="text-success-700">✓</span> al gekoppeld, geen wijziging</span>
  const metNormen = stappen.filter(s => s.combinatie).length
  if (metNormen === 0 && bekend !== true) {
    return (
      <div>
        <div className="font-semibold text-warning-700">geen normen in de bibliotheek</div>
        <div className="text-neutral-500">krijgt de behandeling, normen zelf invullen</div>
      </div>
    )
  }
  if (!normenOvernemen) return <span className="text-neutral-500">behandeling wijzigt, normen blijven staan</span>
  const n = stappen.length
  const eigen = stappen.filter(s => s.combinatie).reduce((t, s) => t + getComponentregels(s.regel.id).length, 0)
  return (
    <div>
      <div className="font-semibold text-success-700">✓ normen voor {n === 1 ? 'deze regel' : n === 2 ? 'beide regels' : `${n} regels`}</div>
      {eigen > 0 && <div className="text-neutral-500">vervangt {eigen} eigen norm{eigen === 1 ? '' : 'en'}</div>}
      {metNormen < n && <div className="text-warning-700">{n - metNormen} zonder bibliotheeknormen</div>}
    </div>
  )
}

function telPerEenheid(regels: { eenheid: string; hoeveelheid: number }[]): { eenheid: string; hoeveelheid: number }[] {
  const uit: { eenheid: string; hoeveelheid: number }[] = []
  for (const r of regels) {
    const t = uit.find(x => x.eenheid === r.eenheid)
    if (t) t.hoeveelheid = +(t.hoeveelheid + r.hoeveelheid).toFixed(4)
    else uit.push({ eenheid: r.eenheid, hoeveelheid: r.hoeveelheid })
  }
  return uit
}

const fmt = (n: number) => n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
