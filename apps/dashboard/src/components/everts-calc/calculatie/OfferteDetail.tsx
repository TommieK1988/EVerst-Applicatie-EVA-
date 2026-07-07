'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Copy } from 'lucide-react'
import BedrijfLoader from '@/app/(platform)/everts-calc/quotes/[id]/preview/BedrijfLoader'
import PdfDownloadButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/PdfDownloadButton'
import DocxDownloadButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/DocxDownloadButton'
import PrintButton from '@/app/(platform)/everts-calc/quotes/[id]/preview/PrintButton'
import GoedkeuringKnop from '@/app/(platform)/everts-calc/quotes/[id]/preview/GoedkeuringKnop'
import VerzendOfferteKnop from '@/app/(platform)/everts-calc/quotes/[id]/preview/VerzendOfferteKnop'
import QuoteStatusBadge from '@/components/everts-calc/quotes/QuoteStatusBadge'
import { updateQuoteHeader, dupliceerQuoteAlsNieuweVersie } from '@/app/(platform)/everts-calc/actions/quotes'
import { laadOfferteDetailStatus, type OfferteDetailStatus } from '@/app/(platform)/everts-calc/actions/offerte-verzenden'
import type { QuoteStatus } from '@/lib/everts-calc/types-quotes'

const STATUS_OPTIES: QuoteStatus[] = ['concept', 'verzonden', 'geaccepteerd', 'afgewezen', 'verlopen']
const STATUS_LABELS: Record<QuoteStatus, string> = {
  concept: 'Concept', verzonden: 'Verzonden', geaccepteerd: 'Geaccepteerd',
  afgewezen: 'Afgewezen', verlopen: 'Verlopen',
}

interface Props {
  quoteId: string
  /** Dossier waarbinnen we zitten (voor goedkeuring). */
  dossierId: string | null
  /** Terug naar de offertelijst. */
  onTerug: () => void
  /** Open een andere offerte inline (bv. de zojuist gemaakte kopie). */
  onOpenOfferte: (id: string) => void
}

/**
 * Inline offerte-detail binnen het dossier: PDF-preview + toolbar (status,
 * goedkeuren, verzenden, downloaden, printen, nieuwe versie). Geen route-sprong
 * naar /everts-calc; alle acties gebeuren in de dossier-tab.
 */
export default function OfferteDetail({ quoteId, dossierId, onTerug, onOpenOfferte }: Props) {
  const router = useRouter()
  const [info, setInfo] = useState<OfferteDetailStatus | null>(null)
  const [statusReset, setStatusReset] = useState(0)
  const [pending, start] = useTransition()
  const [kopieerPending, startKopieer] = useTransition()

  async function ververs() {
    try {
      setInfo(await laadOfferteDetailStatus(quoteId))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon offerte niet laden')
    }
    router.refresh() // lijst-statussen bijwerken
  }

  useEffect(() => { laadOfferteDetailStatus(quoteId).then(setInfo).catch(() => setInfo(null)) }, [quoteId])

  function wijzigStatus(status: QuoteStatus) {
    start(async () => {
      const res = await updateQuoteHeader(quoteId, { status })
      if (res && !res.ok) {
        toast.error(res.error)
        setStatusReset(r => r + 1)
      }
      await ververs()
    })
  }

  function nieuweVersie() {
    startKopieer(async () => {
      try {
        const { id } = await dupliceerQuoteAlsNieuweVersie(quoteId)
        toast.success('Nieuwe versie aangemaakt')
        router.refresh()
        onOpenOfferte(id)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Kopiëren mislukt')
      }
    })
  }

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

        {/* Status-dropdown */}
        {info && (
          <select
            key={statusReset}
            defaultValue={info.status}
            disabled={pending}
            onChange={(e) => wijzigStatus(e.target.value as QuoteStatus)}
            className="text-xs px-2 py-1 border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-everts/30"
          >
            {STATUS_OPTIES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        )}

        {!isIntern && info && (
          <GoedkeuringKnop quoteId={quoteId} dossierId={dossierId} totaalBedrag={info.totaalBedrag} onDone={ververs} />
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={nieuweVersie}
            disabled={kopieerPending}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Kopiëren naar een nieuwe versie (concept)"
          >
            <Copy className="w-3.5 h-3.5" />
            {kopieerPending ? 'Bezig…' : 'Nieuwe versie'}
          </button>
          <PrintButton />
          <DocxDownloadButton quoteId={quoteId} quoteNummer={info?.quoteNummer ?? ''} />
          <PdfDownloadButton quoteId={quoteId} quoteNummer={info?.quoteNummer ?? ''} />
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
