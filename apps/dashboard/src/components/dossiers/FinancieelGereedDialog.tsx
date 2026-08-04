'use client'
import React from 'react'
import toast from 'react-hot-toast'
import { Check, AlertTriangle, HelpCircle, RotateCw, ChevronRight } from 'lucide-react'
import { cn } from '@everts/ui'
import {
  Button, Spinner, Textarea,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter,
} from '@/components/ui'
import { getGereedControleSnel, getGereedControleBouw7 } from '@/lib/dossiers/gereed-controle'
import {
  CONTROLE_VOLGORDE, CONTROLE_TITELS, vatControleSamen,
  type ControleUitkomst, type FinancieelGereedControle,
} from '@/lib/dossiers/gereed-controle-types'
import { plaatsDossierNotitie } from '@/lib/dossiers/notities-actions'

/**
 * Bevestiging voor "Financieel gereed melden", met de vier compleetheidscontroles.
 *
 * De controles blokkeren niet: wie doorzet met openstaande punten moet een opmerking achterlaten,
 * en die wordt samen met de stand van zaken als dossiernotitie vastgelegd. Zo is achteraf te zien
 * waarom een dossier is afgesloten terwijl er nog iets openstond.
 *
 * De statusmutatie zelf gebeurt bewust niet hier maar in `onBevestigd`, zodat de optimistische
 * substatus-state en de Bouw7-conflictafhandeling in InformatieTab op één plek blijven.
 */

/** Minimale lengte van een verplichte opmerking; een kaal "ok" is geen verantwoording. */
const MIN_OPMERKING = 10

/** Na deze tijd meldt de dialoog dat Bouw7 langer doet dan gebruikelijk. */
const TRAAG_NA_MS = 6000

const euro = (n: number): string =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(n)

type Props = {
  dossierId: string
  /** Basispad van het dossier, bv. "/opdrachten/<id>" — voor de deeplinks per controle. */
  dossierHref: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Uitvoeren van de statuswijziging; de dialoog heeft de notitie dan al geplaatst. */
  onBevestigd: () => Promise<void> | void
}

export default function FinancieelGereedDialog({
  dossierId, dossierHref, open, onOpenChange, onBevestigd,
}: Props) {
  const [snel, setSnel]   = React.useState<FinancieelGereedControle | null>(null)
  const [traag, setTraag] = React.useState<FinancieelGereedControle | null>(null)
  const [duurtLang, setDuurtLang] = React.useState(false)
  const [opmerking, setOpmerking] = React.useState('')
  const [bezig, setBezig] = React.useState(false)
  // Elke laadronde krijgt een eigen nummer; een trage respons van een vorige ronde wordt genegeerd.
  const rondeRef = React.useRef(0)

  const laadControles = React.useCallback(() => {
    const ronde = ++rondeRef.current
    setSnel(null); setTraag(null); setDuurtLang(false)

    getGereedControleSnel(dossierId, dossierHref)
      .then(r => { if (rondeRef.current === ronde) setSnel(r) })
      .catch(() => { /* de server geeft zelf 'onbekend' terug; hier niets te redden */ })

    getGereedControleBouw7(dossierId, dossierHref)
      .then(r => { if (rondeRef.current === ronde) setTraag(r) })
      .catch(() => { /* idem */ })

    const timer = setTimeout(() => {
      if (rondeRef.current === ronde) setDuurtLang(true)
    }, TRAAG_NA_MS)
    return () => clearTimeout(timer)
  }, [dossierId, dossierHref])

  // Start de controle zodra de dialoog opengaat; bij sluiten alles resetten zodat een volgende
  // keer niet met een verouderde uitkomst opent.
  React.useEffect(() => {
    if (!open) {
      rondeRef.current++
      setSnel(null); setTraag(null); setOpmerking(''); setBezig(false); setDuurtLang(false)
      return
    }
    return laadControles()
  }, [open, laadControles])

  const alleUitkomsten: ControleUitkomst[] = React.useMemo(
    () => [...(traag?.controles ?? []), ...(snel?.controles ?? [])],
    [traag, snel],
  )
  const klaarMetLaden = snel != null && traag != null
  const heeftBlokkades = alleUitkomsten.some(c => c.status === 'onvolledig')
  const heeftOnbekend  = alleUitkomsten.some(c => c.status === 'onbekend')
  const allesCompleet  = klaarMetLaden && alleUitkomsten.every(c => c.status === 'compleet')

  // Een storing maakt de opmerking bewust niet verplicht: dat is geen feit over het dossier, en het
  // zou mensen dwingen tot ruistekst als "Bouw7 was down".
  const opmerkingVerplicht = heeftBlokkades
  const opmerkingTekort = opmerkingVerplicht && opmerking.trim().length < MIN_OPMERKING
  const kanMelden = klaarMetLaden && !bezig && !opmerkingTekort

  async function bevestig() {
    const tekst = opmerking.trim()
    setBezig(true)

    // Notitie eerst: mislukt die, dan melden we nog niet gereed — anders zou de verantwoording
    // stil verdwijnen terwijl de status al om is.
    const samenvatting = (heeftBlokkades || heeftOnbekend) && klaarMetLaden
      ? vatControleSamen({
          dossierId, gemetenOp: new Date().toISOString(), controles: alleUitkomsten,
          allesCompleet, heeftBlokkades, heeftOnbekend,
        })
      : null

    if (tekst || samenvatting) {
      const kop = samenvatting ? 'GEREEDGEMELD MET OPENSTAANDE PUNTEN' : 'OPMERKING BIJ GEREEDMELDEN'
      const body = [samenvatting, tekst ? `Opmerking: ${tekst}` : null].filter(Boolean).join('\n')
      const res = await plaatsDossierNotitie(dossierId, `${kop}\n${body}`)
      if (!res.ok) { setBezig(false); toast.error(res.error); return }
    }

    await onBevestigd()
    setBezig(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!bezig) onOpenChange(o) }}>
      <DialogContent size="lg">
        <DialogHeader>
          <div>
            <DialogTitle>Financieel gereed melden</DialogTitle>
            <DialogDescription>
              Zijn alle kosten binnen en alle verkoopfacturen verstuurd? EVA controleert het hieronder.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-3">
          {allesCompleet && (
            <div className="flex items-center gap-2.5 rounded-lg border border-success-300 bg-success-50 px-3.5 py-2.5">
              <Check className="h-4 w-4 shrink-0 text-success-700" />
              <span className="text-[13px] font-semibold text-success-900">
                Alle vier de controles zijn afgerond. Dit dossier kan financieel gereed.
              </span>
            </div>
          )}

          {klaarMetLaden && heeftOnbekend && !heeftBlokkades && (
            <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5">
              <HelpCircle className="h-4 w-4 shrink-0 text-neutral-500" />
              <span className="flex-1 text-[13px] text-neutral-700">
                Niet alles kon gecontroleerd worden. Wat wél gecontroleerd is, staat hieronder.
              </span>
              <Button variant="ghost" onClick={laadControles}>
                <RotateCw className="h-3.5 w-3.5" />
                Opnieuw
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            {CONTROLE_VOLGORDE.map(sleutel => {
              const uitkomst = alleUitkomsten.find(c => c.sleutel === sleutel)
              return <ControleRij key={sleutel} sleutel={sleutel} uitkomst={uitkomst} />
            })}
          </div>

          {!klaarMetLaden && duurtLang && (
            <span className="text-[12px] text-neutral-500">
              Bouw7 raadplegen duurt langer dan normaal…
            </span>
          )}

          <div className="mt-1 flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-neutral-600">
              {opmerkingVerplicht ? 'Opmerking (verplicht)' : 'Opmerking (optioneel)'}
            </label>
            <Textarea
              value={opmerking}
              onChange={e => setOpmerking(e.target.value)}
              rows={3}
              placeholder={opmerkingVerplicht
                ? 'Waarom kan dit dossier toch financieel gereed?'
                : 'Bijv. laatste inkoopfactuur nog niet ontvangen…'}
              className="resize-none text-[13px]"
            />
            <span className="text-[11px] text-neutral-500">
              {opmerkingVerplicht
                ? `Er staat nog iets open — leg vast waarom er toch gereed gemeld wordt (minimaal ${MIN_OPMERKING} tekens).`
                : 'Wordt als notitie op het dossier geplaatst.'}
            </span>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={bezig}>
            Annuleren
          </Button>
          <Button variant="primary" onClick={bevestig} disabled={!kanMelden}>
            {bezig && <Spinner size="sm" className="text-white" />}
            {heeftBlokkades ? 'Toch gereed melden' : 'Financieel gereed melden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Eén controleregel ────────────────────────────────────────────── */

function ControleRij({
  sleutel, uitkomst,
}: {
  sleutel: (typeof CONTROLE_VOLGORDE)[number]
  uitkomst: ControleUitkomst | undefined
}) {
  // Lijsten tot drie punten staan meteen open; daarboven zou de dialoog dichtslibben.
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => {
    if (uitkomst) setOpen(uitkomst.items.length > 0 && uitkomst.items.length <= 3)
  }, [uitkomst])

  if (!uitkomst) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-neutral-200 px-3.5 py-2.5">
        <Spinner size="sm" />
        <span className="text-[13px] font-semibold text-neutral-700">{CONTROLE_TITELS[sleutel]}</span>
        <span className="text-[12.5px] text-neutral-400">controleren…</span>
      </div>
    )
  }

  const stijl = {
    compleet:   { rand: 'border-success-300 bg-success-50/50', icoon: <Check className="h-4 w-4 text-success-700" /> },
    onvolledig: { rand: 'border-warning-300 bg-warning-50/60', icoon: <AlertTriangle className="h-4 w-4 text-warning-700" /> },
    onbekend:   { rand: 'border-neutral-200 bg-neutral-50',    icoon: <HelpCircle className="h-4 w-4 text-neutral-400" /> },
  }[uitkomst.status]

  const uitklapbaar = uitkomst.items.length > 0

  return (
    <div className={cn('rounded-lg border', stijl.rand)}>
      <button
        type="button"
        onClick={() => uitklapbaar && setOpen(o => !o)}
        className={cn('flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left', !uitklapbaar && 'cursor-default')}
      >
        <span className="shrink-0">{stijl.icoon}</span>
        <span className="shrink-0 text-[13px] font-semibold text-neutral-800">{uitkomst.titel}</span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-neutral-600">{uitkomst.samenvatting}</span>
        {uitklapbaar && (
          <ChevronRight className={cn('h-4 w-4 shrink-0 text-neutral-400 transition-transform', open && 'rotate-90')} />
        )}
      </button>

      {open && uitklapbaar && (
        <ul className="flex flex-col gap-1 border-t border-neutral-200/70 px-3.5 py-2.5">
          {uitkomst.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span className={cn('font-medium', item.ernst === 'signaal' ? 'text-neutral-500' : 'text-neutral-800')}>
                  {item.label}
                </span>
                {item.detail && <span className="block text-[11.5px] text-neutral-500">{item.detail}</span>}
              </span>
              {item.bedrag != null && (
                <span className="shrink-0 tabular-nums font-medium text-neutral-700">{euro(item.bedrag)}</span>
              )}
            </li>
          ))}
          {uitkomst.items[0]?.href && (
            <li className="pt-1">
              <a
                href={uitkomst.items[0].href}
                className="text-[12px] font-semibold text-brand-600 hover:underline"
              >
                Openen →
              </a>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
