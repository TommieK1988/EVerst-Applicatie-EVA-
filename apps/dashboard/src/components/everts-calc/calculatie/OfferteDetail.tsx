'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react'
import BedrijfLoader from '@/app/(platform)/everts-calc/quotes/[id]/preview/BedrijfLoader'
import PdfDownloadButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/PdfDownloadButton'
import DocxDownloadButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/DocxDownloadButton'
import WordOnlineKnop from '@/app/(platform)/everts-calc/quotes/[id]/preview/WordOnlineKnop'
import PrintButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/PrintButton'
import GoedkeuringKnop from '@/app/(platform)/everts-calc/quotes/[id]/preview/GoedkeuringKnop'
import VerzendOfferteKnop from '@/app/(platform)/everts-calc/quotes/[id]/preview/VerzendOfferteKnop'
import QuoteStatusBadge from '@/components/everts-calc/quotes/QuoteStatusBadge'
import { laadOfferteDetailStatus, type OfferteDetailStatus } from '@/app/(platform)/everts-calc/actions/offerte-verzenden'
import type { QuoteStatus } from '@/lib/everts-calc/types-quotes'

interface Props {
  quoteId: string
  /** Dossier waarbinnen we zitten (voor goedkeuring). */
  dossierId: string | null
  /** Terug naar de offertelijst. */
  onTerug: () => void
}

/**
 * Hoogte van de kaart binnen een dossiertab: het volledige venster minus de
 * topbalk (60px + 1px rand) en de verticale ruimte rond de kaart (2×12px).
 * De preview vult daarmee alles wat er in beeld past, in plaats van een vaste
 * fractie van het venster.
 */
const KAART_HOOGTE = 'calc(100dvh - 85px)'

/**
 * Inline offerte-detail binnen het dossier: PDF-preview + toolbar (status,
 * goedkeuren, verzenden, downloaden, printen). Geen route-sprong naar
 * /everts-calc; alle acties gebeuren in de dossier-tab. Een nieuwe versie maak je
 * niet hier maar via "Reviseren" op de definitieve versie in de versie-kiezer —
 * dat kopieert de calculatie; de offerte wordt daarna opnieuw gemaakt.
 */
export default function OfferteDetail({ quoteId, dossierId, onTerug }: Props) {
  const router = useRouter()
  const [info, setInfo] = useState<OfferteDetailStatus | null>(null)
  // Verhoogt bij elke actie die de voorvertoning verandert (bv. het Word-document
  // koppelen of ontkoppelen): remount van de preview haalt de nieuwe PDF op.
  const [previewKey, setPreviewKey] = useState(0)
  // Volledig scherm: de kaart legt zich over het venster heen, zodat er niets
  // van de offerte buiten beeld valt. Escape sluit hem weer.
  const [volledigScherm, setVolledigScherm] = useState(false)

  async function ververs() {
    try {
      setInfo(await laadOfferteDetailStatus(quoteId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon offerte niet laden')
    }
    setPreviewKey(k => k + 1)
    router.refresh() // lijst-statussen bijwerken
  }

  useEffect(() => { laadOfferteDetailStatus(quoteId).then(setInfo).catch(() => setInfo(null)) }, [quoteId])

  useEffect(() => {
    if (!volledigScherm) return
    function opToets(e: KeyboardEvent) { if (e.key === 'Escape') setVolledigScherm(false) }
    window.addEventListener('keydown', opToets)
    return () => window.removeEventListener('keydown', opToets)
  }, [volledigScherm])

  const isIntern = info?.isIntern ?? false

  return (
    <div
      className={
        volledigScherm
          ? 'fixed inset-0 z-50 flex flex-col bg-white overflow-hidden'
          : 'flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden'
      }
      style={volledigScherm ? undefined : { height: KAART_HOOGTE }}
    >
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap px-4 py-2 border-b border-slate-200 bg-white">
        <button
          onClick={onTerug}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Overzicht
        </button>

        <span className="text-sm font-semibold text-slate-700">{info?.quoteNummer ?? '…'}</span>
        {info && <QuoteStatusBadge status={info.status as QuoteStatus} />}

        {!isIntern && info && (
          <GoedkeuringKnop quoteId={quoteId} dossierId={dossierId} totaalBedrag={info.totaalBedrag} onDone={ververs} />
        )}

        <div className="ml-auto flex items-center gap-2">
          <PrintButton />
          <WordOnlineKnop quoteId={quoteId} onDone={ververs} />
          <DocxDownloadButton quoteId={quoteId} quoteNummer={info?.quoteNummer ?? ''} isConcept={info ? !info.verzendbaar : false} />
          <PdfDownloadButton quoteId={quoteId} quoteNummer={info?.quoteNummer ?? ''} isConcept={info ? !info.verzendbaar : false} />
          {!isIntern && info && (
            <VerzendOfferteKnop quoteId={quoteId} verzendbaar={info.verzendbaar} onDone={ververs} />
          )}
          <button
            onClick={() => setVolledigScherm(v => !v)}
            title={volledigScherm ? 'Verlaat volledig scherm (Esc)' : 'Volledig scherm'}
            aria-label={volledigScherm ? 'Verlaat volledig scherm' : 'Volledig scherm'}
            className="flex items-center justify-center p-1.5 border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {volledigScherm ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* PDF-preview — vult alle resterende hoogte van de kaart. */}
      <div className="flex-1 min-h-0 bg-slate-100">
        <BedrijfLoader key={previewKey} quoteId={quoteId} />
      </div>
    </div>
  )
}
