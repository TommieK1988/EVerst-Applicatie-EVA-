'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ListChecks } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from '@/components/ui/dialog'
import SchilderbehandelingZoekveld from '@/components/everts-calc/calculatie/SchilderbehandelingZoekveld'
import { laadBehandelingen, haalCombinaties } from '@/app/(platform)/everts-calc/actions/schilderwerk'
import type { SchilderBehandeling, SchilderCombinatie } from '@/lib/everts-calc/services/schilderwerk'
import {
  getCalculatieregelsVoorScenario, getMeetregelAggregaten, getComponentregels, slaCalculatieregelOp,
} from '@/lib/everts-calc/local-store'
import {
  groepeerPerBestekcode, planKoppeling, benodigdeTypeIds, ZONDER_CODE, type CodeGroep, type KoppelStap,
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
  useEffect(() => { laadBehandelingen().then(setBibliotheek).catch(() => setBibliotheek([])) }, [])

  const [keuzes, setKeuzes] = useState<Map<string, SchilderBehandeling>>(new Map())
  const kies = (code: string, b: SchilderBehandeling | null) => setKeuzes(prev => {
    const volgend = new Map(prev)
    if (b) volgend.set(code, b); else volgend.delete(code)
    return volgend
  })

  // Combinaties per type ophalen voor de regels waarvoor een keuze is gemaakt.
  const [combinaties, setCombinaties] = useState<Map<string, SchilderCombinatie[]>>(new Map())
  const [laden, setLaden] = useState(false)
  const gekozenRegels = useMemo(
    () => groepen.filter(g => keuzes.has(g.code)).flatMap(g => g.regels),
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

  const stappen: KoppelStap[] = useMemo(() => groepen.flatMap(g => {
    const b = keuzes.get(g.code)
    return b ? planKoppeling(g.regels, aggregaten, combinaties, { id: b.id, naam: b.naam }) : []
  }), [groepen, keuzes, aggregaten, combinaties])

  const zonderCombinatie = stappen.filter(s => !s.combinatie)
  const normenVervangen = stappen.filter(s => s.combinatie && getComponentregels(s.regel.id).length > 0).length

  const koppel = useCallback(() => {
    if (stappen.length === 0) return
    onVoorWijziging()
    for (const s of stappen) {
      slaCalculatieregelOp(s.nieuw)
      if (s.combinatie) vervangNormenUitCombinatie(s.regel.id, s.combinatie)
    }
    onNaWijziging()
    const zonder = stappen.filter(s => !s.combinatie).length
    toast.success(
      `Behandeling gekoppeld aan ${stappen.length} regel${stappen.length === 1 ? '' : 's'}`
      + (zonder > 0 ? ` · ${zonder} zonder normen, oranje gemarkeerd` : ''),
    )
    onSluit()
  }, [stappen, onVoorWijziging, onNaWijziging, onSluit])

  const naamVan = (id: string) => bibliotheek.find(b => b.id === id)

  return (
    <Dialog open onOpenChange={o => { if (!o) onSluit() }}>
      <DialogContent size="xl">
        <DialogHeader>
          <div>
            <DialogTitle>Behandeling per bestekscode</DialogTitle>
            <DialogDescription>
              Kies per code één behandeling uit de bibliotheek. Alle regels uit de meetstaat met die code krijgen hem in één keer.
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
                  <th className="w-24 py-2 pr-2">Code</th>
                  <th className="w-16 py-2 pr-2">Regels</th>
                  <th className="py-2 pr-2">Onderdelen</th>
                  <th className="w-40 py-2 pr-2">Huidige behandeling</th>
                  <th className="w-72 py-2">Nieuwe behandeling</th>
                </tr>
              </thead>
              <tbody>
                {groepen.map(g => (
                  <CodeRij
                    key={g.code || '—'}
                    groep={g}
                    keuze={keuzes.get(g.code)}
                    bibliotheek={bibliotheek}
                    naamVan={naamVan}
                    onKies={b => kies(g.code, b)}
                  />
                ))}
              </tbody>
            </table>
          )}

          {zonderCombinatie.length > 0 && (
            <Alert tone="warning" className="mt-4" title={`${zonderCombinatie.length} van de ${stappen.length} regels hebben geen combinatie in de bibliotheek`}>
              {Array.from(new Set(zonderCombinatie.map(s => s.label))).join(', ')}. Ze krijgen de behandeling wel,
              maar geen normen, en worden oranje gemarkeerd zodat je ze terugvindt.
            </Alert>
          )}
        </DialogBody>

        <DialogFooter split className="border-t border-neutral-200 bg-neutral-50">
          <span className="text-xs text-neutral-500">
            {stappen.length > 0 && normenVervangen > 0
              ? <>Normen op <strong className="text-neutral-800">{normenVervangen} regel{normenVervangen === 1 ? '' : 's'}</strong> worden vervangen door de bibliotheeknormen. Ongedaan maken met Ctrl+Z.</>
              : 'Ongedaan maken met Ctrl+Z.'}
          </span>
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

function CodeRij({ groep, keuze, bibliotheek, naamVan, onKies }: {
  groep: CodeGroep
  keuze?: SchilderBehandeling
  bibliotheek: SchilderBehandeling[]
  naamVan: (id: string) => SchilderBehandeling | undefined
  onKies: (b: SchilderBehandeling | null) => void
}) {
  const zichtbaar = groep.onderdelen.slice(0, 3)
  const meer = groep.onderdelen.length - zichtbaar.length
  const [enige] = groep.behandelingIds

  return (
    <tr className={`border-b border-neutral-200 align-top ${keuze ? 'bg-brand-50' : ''}`}>
      <td className="py-3 pr-2">
        {groep.code === ZONDER_CODE
          ? <span className="text-xs text-neutral-500">zonder code</span>
          : <span className="font-mono text-[13px] font-semibold text-info-700">{groep.code}</span>}
      </td>
      <td className="py-3 pr-2 font-mono text-[13px] tabular-nums">{groep.regels.length}</td>
      <td className="py-3 pr-2 text-xs text-neutral-700">
        {zichtbaar.join(' · ')}
        {meer > 0 && <span className="text-neutral-400"> +{meer}</span>}
      </td>
      <td className="py-3 pr-2">
        {groep.behandelingIds.length > 1
          ? <Badge tone="warning" size="md">Gemengd ({groep.behandelingIds.length})</Badge>
          : enige
            ? <Badge tone="brand" size="md">{naamVan(enige)?.code || naamVan(enige)?.naam || 'Gekoppeld'}</Badge>
            : <Badge tone="neutral" size="md">Geen</Badge>}
      </td>
      <td className="py-2">
        <SchilderbehandelingZoekveld
          behandelingId={keuze?.id}
          bibliotheek={bibliotheek}
          onSelecteer={b => onKies(b)}
          onWis={() => onKies(null)}
        />
      </td>
    </tr>
  )
}
