'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, FileText } from 'lucide-react'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/dialog'
import ControleLijst from '@/components/everts-calc/calculatie/ControleLijst'
import CalculatieInstellingenKaarten from '@/components/everts-calc/calculatie/CalculatieInstellingenKaarten'
import { telControle, type ControlePunt, type ControleSoort } from '@/lib/everts-calc/controle'
import { formatEuro } from '@/lib/everts-calc/calculations'
import { getScenarios } from '@/lib/everts-calc/local-store'
import { useOfferteAanmaken, type OfferteAanmaakOpties } from './useOfferteAanmaken'

type Stap = 'controle' | 'voorwaarden' | 'layout'

interface Props extends Omit<OfferteAanmaakOpties, 'open'> {
  open: boolean
  onClose: () => void
  /** Controlepunten van de calculatie, zonder het punt "voorwaarden" (dat is stap 2). */
  controle: {
    punten: ControlePunt[]
    acties?: Partial<Record<ControleSoort, { label: string; onClick: () => void }>>
    onKlopt: (sleutel: string) => void
    /** Sluit het venster en springt naar de regel in de calculatie. */
    onNaarRegel: (regelId: string) => void
  }
  /** Verkoopprijs excl. btw, voor de samenvatting. */
  totaalExcl: number
}

/**
 * Offerte of interne begroting maken, in één venster:
 * Controle › Voorwaarden, tekst & bijlages › Lay-out & aanmaken.
 *
 * Stap 2 staat er altijd, ook als alles al gekozen is: juist dan zie je anders niet
 * dat de inleiding nog van een vorige klus is. Een interne begroting gaat niet naar de
 * klant en slaat stap 2 over. Stap 1 slaat het venster over als er niets openstaat.
 */
export default function OfferteAanmakenModal({ open, onClose, controle, totaalExcl, ...opties }: Props) {
  const a = useOfferteAanmaken({ ...opties, open })
  const stappen: Stap[] = a.isIntern ? ['controle', 'layout'] : ['controle', 'voorwaarden', 'layout']
  const { rood, oranje } = telControle(controle.punten)

  // Het venster wordt per keer opnieuw opgebouwd. Niets open in de controle → meteen
  // door naar de volgende stap; daarna stuurt de gebruiker.
  const [stap, setStap] = useState<Stap>(() => (rood === 0 && oranje === 0 ? stappen[1] : 'controle'))
  const { verversBijlagen } = a
  useEffect(() => { if (stap === 'layout') void verversBijlagen() }, [stap, verversBijlagen])

  // Stap 2: het blok meldt of beide keuzes gemaakt zijn; de knop staat in de onderbalk.
  const [voorwaardenKlaar, setVoorwaardenKlaar] = useState(false)
  const [bezigMetBewaren, setBezigMetBewaren] = useState(false)
  const bewaarVoorwaarden = useRef<(() => Promise<void>) | null>(null)
  const onStatus = useCallback((klaar: boolean, bewaarNu: () => Promise<void>) => {
    setVoorwaardenKlaar(klaar)
    bewaarVoorwaarden.current = bewaarNu
  }, [])

  const index = stappen.indexOf(stap)
  const volgende = () => setStap(stappen[Math.min(index + 1, stappen.length - 1)])
  const terug = () => setStap(stappen[Math.max(index - 1, 0)])
  const titel = a.isIntern ? 'Interne begroting aanmaken' : 'Offerte aanmaken'

  return (
    <Dialog open={open} onOpenChange={o => { if (!o && !a.loading) onClose() }}>
      <DialogContent size="lg" className={stap === 'voorwaarden' ? 'max-w-5xl' : undefined}>
        <DialogHeader>
          <DialogTitle>{titel}{opties.projectNaam ? ` · ${opties.projectNaam}` : ''}</DialogTitle>
        </DialogHeader>
        <Stappenbalk stappen={stappen} actief={stap} rood={rood} />

        <DialogBody className="space-y-4">
          {stap === 'controle' && (
            <>
              <ControleLijst
                punten={controle.punten} acties={controle.acties}
                onKlopt={controle.onKlopt} onNaarRegel={controle.onNaarRegel}
              />
              {rood > 0 && (
                <p className="text-xs text-error-700">
                  Los eerst de rode punten op. Oranje punten houden de offerte niet tegen.
                </p>
              )}
            </>
          )}

          {stap === 'voorwaarden' && (
            <CalculatieInstellingenKaarten
              projectId={opties.projectId}
              dossierId={opties.dossierId ?? undefined}
              scenarioId={opties.scenarioId}
              vereist
              onStatus={onStatus}
            />
          )}

          {stap === 'layout' && <LayoutStap a={a} totaalExcl={totaalExcl} scenarioId={opties.scenarioId}
            projectId={opties.projectId} onWijzig={a.isIntern ? undefined : () => setStap('voorwaarden')} />}
        </DialogBody>

        <DialogFooter>
          {index > 0
            ? <Button variant="secondary" size="md" onClick={terug} disabled={a.loading}>← Terug</Button>
            : <Button variant="secondary" size="md" onClick={onClose}>Annuleren</Button>}
          {stap === 'controle' && (
            <Button variant="primary" size="md" onClick={volgende} disabled={rood > 0}>
              {a.isIntern ? 'Volgende: lay-out' : 'Volgende: voorwaarden'}
            </Button>
          )}
          {stap === 'voorwaarden' && (
            <Button
              variant="primary" size="md" disabled={!voorwaardenKlaar || bezigMetBewaren} loading={bezigMetBewaren}
              // Eerst wegschrijven: de offerte neemt de keuzes over van de opgeslagen calculatie.
              onClick={async () => {
                setBezigMetBewaren(true)
                try { await bewaarVoorwaarden.current?.() } finally { setBezigMetBewaren(false) }
                volgende()
              }}
            >
              Volgende: lay-out
            </Button>
          )}
          {stap === 'layout' && (
            <Button variant="primary" size="md" onClick={a.handleAanmaken} disabled={a.loading || a.fetchingData} loading={a.loading}>
              {a.loading ? 'Aanmaken…' : titel}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const STAP_LABEL: Record<Stap, string> = {
  controle: 'Controle',
  voorwaarden: 'Voorwaarden, tekst & bijlages',
  layout: 'Lay-out & aanmaken',
}

function Stappenbalk({ stappen, actief, rood }: { stappen: Stap[]; actief: Stap; rood: number }) {
  const actiefIndex = stappen.indexOf(actief)
  return (
    <ol className="flex flex-wrap items-center gap-2 px-6 pt-3 pb-3 border-b border-neutral-100">
      {stappen.map((s, i) => {
        const klaar = i < actiefIndex
        const nu = i === actiefIndex
        const fout = s === 'controle' && rood > 0
        return (
          <li key={s} className="flex items-center gap-2">
            {i > 0 && <span className="w-6 h-px bg-neutral-200" />}
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10.5px] font-bold border ${
              nu ? 'bg-brand-500 border-brand-500 text-white'
                : klaar ? 'bg-brand-50 border-brand-500 text-brand-600'
                : 'border-neutral-300 text-neutral-400'}`}>
              {klaar && !fout ? <Check className="w-3 h-3" /> : i + 1}
            </span>
            <span className={`text-xs ${nu ? 'font-semibold text-neutral-900' : klaar ? 'text-brand-700' : 'text-neutral-400'}`}>
              {STAP_LABEL[s]}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function platteTekst(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

function LayoutStap({ a, totaalExcl, projectId, scenarioId, onWijzig }: {
  a: ReturnType<typeof useOfferteAanmaken>
  totaalExcl: number
  projectId: string
  scenarioId?: string
  onWijzig?: () => void
}) {
  // Vers uit het werkgeheugen: stap 2 heeft het scenario daar net bijgewerkt.
  const scenario = useMemo(() => {
    const scs = getScenarios(projectId)
    return (scenarioId ? scs.find(s => s.id === scenarioId) : undefined) ?? scs.find(s => s.is_standaard) ?? scs[0]
  }, [projectId, scenarioId])
  const conditie = a.condities.find(c => c.id === scenario?.betalingsconditie_id)?.naam
  const voorwaarden = a.voorwaarden.find(v => v.id === scenario?.algemene_voorwaarden_id)?.naam
  const inleiding = platteTekst(scenario?.inleiding_tekst)

  const regels: [string, string, boolean][] = [
    ['Totaal excl. btw', formatEuro(totaalExcl), false],
    ...(a.isIntern ? [] : [
      ['Betalingscondities', conditie ?? 'Niet gekozen', true],
      ['Algemene voorwaarden', voorwaarden ?? 'Niet gekozen', true],
      ['Inleidende tekst', inleiding ? `„${inleiding.slice(0, 70)}${inleiding.length > 70 ? '…' : ''}”` : 'Geen (standaardtekst)', true],
      ['Bijlages', a.aantalBijlagen === 0 ? 'Geen' : `${a.aantalBijlagen} PDF${a.aantalBijlagen === 1 ? '' : "'s"}`, true],
    ] as [string, string, boolean][]),
    ['Regels', a.aantalRegels === null ? '…' : `${a.aantalRegels} calculatieregel${a.aantalRegels === 1 ? '' : 's'} gaan mee`, false],
  ]

  return (
    <>
      {!a.isIntern && !a.heeftBetalingscondities && !a.fetchingData && (
        <Alert tone="warning" title="Er zijn nog geen betalingscondities.">
          Leg ze vast onder Instellingen › Offertes.
        </Alert>
      )}

      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 mb-2">Lay-out</div>
        {a.fetchingData ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400 py-2"><Spinner size="sm" /><span>Laden…</span></div>
        ) : a.layouts.length === 0 ? (
          <p className="text-sm text-neutral-400 py-2">
            {a.isIntern
              ? 'Nog geen lay-out voor de interne begroting. Maak er één aan onder Instellingen › Offertes.'
              : 'Geen lay-outs beschikbaar. Je kunt later een lay-out kiezen.'}
          </p>
        ) : (
          <div className="space-y-2">
            {a.layouts.map(layout => {
              const gekozen = a.gekozenLayoutId === layout.id
              return (
                <button
                  key={layout.id} type="button" onClick={() => a.setGekozenLayoutId(layout.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-[10px] border text-left transition-colors ${
                    gekozen ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${gekozen ? 'bg-brand-500' : 'bg-neutral-100'}`}>
                    {gekozen ? <Check className="w-3.5 h-3.5 text-white" /> : <FileText className="w-3.5 h-3.5 text-neutral-400" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-neutral-800 truncate">{layout.naam}</span>
                    {layout.beschrijving && <span className="block text-xs text-neutral-500 truncate">{layout.beschrijving}</span>}
                  </span>
                  {layout.is_standaard && (
                    <span className="ml-auto text-xs bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full flex-shrink-0">standaard</span>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500 mb-2">Samenvatting</div>
        <dl className="rounded-[10px] bg-neutral-50 px-4 py-3 grid grid-cols-[160px_1fr_auto] gap-x-3 gap-y-2 text-[13px]">
          {regels.map(([k, v, wijzig]) => (
            <div key={k} className="contents">
              <dt className="text-neutral-500">{k}</dt>
              <dd className={`min-w-0 truncate ${k === 'Totaal excl. btw' ? 'font-semibold' : ''} ${v === 'Niet gekozen' ? 'text-error-700' : 'text-neutral-800'}`}>{v}</dd>
              <dd>
                {wijzig && onWijzig && (
                  <button type="button" onClick={onWijzig} className="text-xs font-medium text-brand-700 hover:underline">Wijzig</button>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  )
}
