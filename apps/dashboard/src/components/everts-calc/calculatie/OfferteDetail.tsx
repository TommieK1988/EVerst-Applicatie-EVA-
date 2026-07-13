'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft } from 'lucide-react'
import BedrijfLoader from '@/app/(platform)/everts-calc/quotes/[id]/preview/BedrijfLoader'
import PdfDownloadButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/PdfDownloadButton'
import DocxDownloadButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/DocxDownloadButton'
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
 * Inline offerte-detail binnen het dossier: PDF-preview + toolbar (status,
 * goedkeuren, verzenden, downloaden, printen). Geen route-sprong naar
 * /everts-calc; alle acties gebeuren in de dossier-tab. Een nieuwe versie maak je
 * niet hier maar via "Reviseren" op de definitieve versie in de versie-kiezer —
 * dat kopieert de calculatie; de offerte wordt daarna opnieuw gemaakt.
 */
export default function OfferteDetail({ quoteId, dossierId, onTerug }: Props) {
  const router = useRouter()
  const [info, setInfo] = useState<OfferteDetailStatus | null>(null)

  async function ververs() {
    try {
      setInfo(await laadOfferteDetailStatus(quoteId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon offerte niet laden')
    }
    router.refresh() // lijst-statussen bijwerken
  }

  useEffect(() => { laadOfferteDetailStatus(quoteId).then(setInfo).catch(() => setInfo(null)) }, [quoteId])

  const isIntern = info?.isIntern ?? false

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Toolbar */}
      <div className="flex-shrink-0 flex items-center gap-2 flex-wrap px-4 py-2.5 border-b border-slate-200 bg-white">
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
          <DocxDownloadButton quoteId={quoteId} quoteNummer={info?.quoteNummer ?? ''} isConcept={info ? !info.verzendbaar : false} />
          <PdfDownloadButton quoteId={quoteId} quoteNummer={info?.quoteNummer ?? ''} isConcept={info ? !info.verzendbaar : false} />
          {!isIntern && info && (
            <VerzendOfferteKnop quoteId={quoteId} verzendbaar={info.verzendbaar} onDone={ververs} />
          )}
        </div>
      </div>

      {/* PDF-preview */}
      <div className="h-[75vh] bg-slate-100">
        <BedrijfLoader quoteId={quoteId} />
      </div>
    </div>
  )
}
