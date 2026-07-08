import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getQuote } from '@/lib/everts-calc/services/quotes'
import QuotePreview from '@/components/everts-calc/quotes/QuotePreview'
import PdfDownloadButton from './PdfDownloadButton'
import DocxDownloadButton from './DocxDownloadButton'
import PrintButton from './PrintButton'
import BedrijfLoader from './BedrijfLoader'
import GoedkeuringKnop from './GoedkeuringKnop'
import VerzendOfferteKnop from './VerzendOfferteKnop'
import { assertOfferteVerzendbaar } from '@/lib/goedkeuring/offerte'

export const metadata: Metadata = { title: 'Offerte voorvertoning' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function QuotePreviewPage({ params }: Props) {
  const { id } = await params
  const quote = await getQuote(id)
  if (!quote) notFound()

  const isIntern = quote.type === 'interne_calculatie'
  const verzendbaar = !isIntern && (await assertOfferteVerzendbaar(id)).ok

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100">
      {/* Toolbar - verbergen bij printen */}
      <div className="flex-shrink-0 px-6 py-3 border-b border-slate-200 bg-white flex items-center gap-3 print:hidden">
        <Link
          href="/everts-calc/quotes"
          className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Terug naar calculatie
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {!isIntern && (
            <GoedkeuringKnop
              quoteId={quote.id}
              dossierId={quote.dossier_id ?? null}
              totaalBedrag={quote.subtotaal_ex_btw}
            />
          )}
          <PrintButton />
          <DocxDownloadButton quoteId={quote.id} quoteNummer={quote.quote_nummer} isConcept={!verzendbaar} />
          <PdfDownloadButton quoteId={quote.id} quoteNummer={quote.quote_nummer} isConcept={!verzendbaar} />
          {!isIntern && <VerzendOfferteKnop quoteId={quote.id} verzendbaar={verzendbaar} />}
        </div>
      </div>

      {/* Preview */}
      <div className="flex-1 overflow-hidden print:overflow-visible">
        <BedrijfLoader quoteId={quote.id} />
      </div>
    </div>
  )
}
