'use client'

/**
 * PDF-bijlages bij een calculatie: productbladen, kwaliteitsverklaringen,
 * detailtekeningen. Ze komen in de offerte-PDF ná de offerte en vóór de algemene
 * voorwaarden.
 *
 * Deze kaart praat rechtstreeks met de server-actions en niet — zoals de
 * tekstvelden ernaast — via de scenario-snapshot. Die snapshot wordt als één blob
 * door de client teruggeschreven; een upload uit een ander tabblad zou daar
 * onderuit gaan.
 */

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Paperclip, Trash2, ArrowUp, ArrowDown, ExternalLink, Loader2 } from 'lucide-react'
import {
  getCalculatieBijlagen,
  uploadCalculatieBijlage,
  verwijderCalculatieBijlage,
  herordenCalculatieBijlagen,
  heeftOfferteVoorScenario,
  type CalculatieBijlage,
} from '@/app/(platform)/everts-calc/actions/offerte-bijlagen'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/alert'
import { FileUpload } from '@/components/ui/file-upload'
import { useDialogen } from '@/components/ui/dialogen'

/** Boven deze omvang past de offerte niet meer als mailbijlage door Graph heen. */
const WAARSCHUW_BYTES = 2.5 * 1024 * 1024

function toonBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} kB`
}

interface Props {
  projectId: string
  scenarioId: string
  /** Bevroren calculatie (offerte verzonden) — dan alleen tonen, niet wijzigen. */
  readOnly?: boolean
}

export default function OfferteBijlagenKaart({ projectId, scenarioId, readOnly = false }: Props) {
  const [bijlagen, setBijlagen] = useState<CalculatieBijlage[]>([])
  const [laden, setLaden]       = useState(true)
  const [bezig, setBezig]       = useState(false)
  const [offerte, setOfferte]   = useState<{ bestaat: boolean; alleenConcept: boolean }>({ bestaat: false, alleenConcept: true })
  const { bevestig } = useDialogen()

  const herlaad = useCallback(async () => {
    const lijst = await getCalculatieBijlagen(projectId, scenarioId)
    setBijlagen(lijst)
  }, [projectId, scenarioId])

  useEffect(() => {
    let actief = true
    setLaden(true)
    Promise.all([
      getCalculatieBijlagen(projectId, scenarioId),
      heeftOfferteVoorScenario(projectId, scenarioId),
    ])
      .then(([lijst, status]) => {
        if (!actief) return
        setBijlagen(lijst)
        setOfferte(status)
      })
      .finally(() => { if (actief) setLaden(false) })
    return () => { actief = false }
  }, [projectId, scenarioId])

  const voegToe = async (files: File[]) => {
    setBezig(true)
    try {
      for (const file of files) {
        const fd = new FormData()
        fd.append('bestand', file)
        const res = await uploadCalculatieBijlage(projectId, scenarioId, fd)
        if (!res.ok) toast.error(res.error)
      }
      await herlaad()
    } finally {
      setBezig(false)
    }
  }

  const verwijder = async (bijlage: CalculatieBijlage) => {
    if (!await bevestig({
      titel: `"${bijlage.bestandsnaam}" verwijderen?`,
      omschrijving: 'De bijlage gaat niet meer mee met nieuwe offertes van deze calculatie. Al aangemaakte offertes houden hun eigen kopie.',
      bevestigLabel: 'Verwijderen',
    })) return
    setBezig(true)
    try {
      const res = await verwijderCalculatieBijlage(bijlage.id)
      if (!res.ok) { toast.error(res.error); return }
      await herlaad()
    } finally {
      setBezig(false)
    }
  }

  const verplaats = async (index: number, richting: -1 | 1) => {
    const doel = index + richting
    if (doel < 0 || doel >= bijlagen.length) return
    const nieuw = bijlagen.slice()
    ;[nieuw[index], nieuw[doel]] = [nieuw[doel], nieuw[index]]
    setBijlagen(nieuw)                       // meteen zichtbaar; server volgt
    const res = await herordenCalculatieBijlagen(nieuw.map(b => b.id))
    if (!res.ok) { toast.error(res.error); await herlaad() }
  }

  const totaal = bijlagen.reduce((n, b) => n + b.bytes, 0)

  return (
    <Card>
      <CardHeader>
        <span className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-slate-400" />
          Bijlages bij de offerte
        </span>
        {bijlagen.length > 0 && (
          <span className="text-xs text-slate-400">
            {bijlagen.length} {bijlagen.length === 1 ? 'bijlage' : 'bijlages'} · {toonBytes(totaal)}
          </span>
        )}
      </CardHeader>
      <CardBody>
        {laden ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Bijlages laden…
          </div>
        ) : (
          <div className="space-y-3">

            {bijlagen.length > 0 && (
              <ul className="space-y-2">
                {bijlagen.map((b, i) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                  >
                    <span className="w-5 shrink-0 text-xs font-medium text-slate-400">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{b.bestandsnaam}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {b.paginas != null && `${b.paginas} ${b.paginas === 1 ? 'pagina' : "pagina's"} · `}
                      {toonBytes(b.bytes)}
                    </span>
                    {b.url && (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Openen"
                        className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    {!readOnly && (
                      <>
                        <button
                          type="button"
                          title="Omhoog"
                          disabled={i === 0 || bezig}
                          onClick={() => verplaats(i, -1)}
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Omlaag"
                          disabled={i === bijlagen.length - 1 || bezig}
                          onClick={() => verplaats(i, 1)}
                          className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Verwijderen"
                          disabled={bezig}
                          onClick={() => verwijder(b)}
                        >
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {!readOnly && (
              <FileUpload
                accept=".pdf,application/pdf"
                multiple
                onFiles={voegToe}
                title={bezig ? 'Bezig met toevoegen…' : <>Sleep PDF&apos;s hierheen of <span className="text-brand-700 underline">blader</span></>}
                sub="Alleen PDF, maximaal 25 MB per bestand"
              />
            )}

            {readOnly && bijlagen.length === 0 && (
              <p className="text-sm text-slate-400">Geen bijlages bij deze calculatie.</p>
            )}

            <p className="text-xs text-slate-400">
              Deze PDF&apos;s komen in de offerte-PDF ná de offerte en vóór de algemene voorwaarden,
              in de volgorde hierboven. Ze worden vastgelegd op het moment dat je de offerte aanmaakt.
            </p>

            {/* De bijlages worden bevroren bij het aanmaken. Wie er daarna eentje bij hangt,
                verwacht die in de bestaande offerte terug te zien — vandaar deze waarschuwing. */}
            {offerte.bestaat && !readOnly && (
              <Alert tone="warning" title="Er is al een offerte van deze calculatie">
                {offerte.alleenConcept
                  ? 'Wijzigingen hier komen pas in de offerte als je hem opnieuw aanmaakt.'
                  : 'De verzonden offerte houdt de bijlages die er destijds in zaten. Wil je deze wijziging naar de klant, maak dan een nieuwe versie.'}
              </Alert>
            )}

            {totaal > WAARSCHUW_BYTES && (
              <Alert tone="warning" title="De offerte wordt groot om te mailen">
                Samen met de offerte zelf komt dit boven de 3 MB die Outlook vanuit EVA nog verstuurt.
                Verklein de bijlages, of stuur ze apart.
              </Alert>
            )}

          </div>
        )}
      </CardBody>
    </Card>
  )
}
