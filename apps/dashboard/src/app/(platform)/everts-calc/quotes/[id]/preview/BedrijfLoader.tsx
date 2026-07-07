'use client'

import { useEffect, useState } from 'react'
import nextDynamic from 'next/dynamic'

const DocxViewer = nextDynamic(() => import('@/components/everts-calc/DocxViewer'), { ssr: false })

const BEDRIJF_KEY = 'evc_offerte_bedrijf'

/**
 * Toont de offerte-voorvertoning. Standaard de échte PDF (mét briefpapier en —
 * zolang niet goedgekeurd — CONCEPT-watermerk) via de /pdf-preview-route in een
 * iframe. Met de schakelaar is de snellere Word-render ook te bekijken.
 */
export default function BedrijfLoader({ quoteId }: { quoteId: string }) {
  const [modus, setModus] = useState<'pdf' | 'word'>('pdf')
  const [bedrijfQuery, setBedrijfQuery] = useState('')

  useEffect(() => {
    const bedrijfRaw = localStorage.getItem(BEDRIJF_KEY)
    setBedrijfQuery(bedrijfRaw ? `?bedrijf=${encodeURIComponent(bedrijfRaw)}` : '')
  }, [quoteId])

  const pdfSrc = `/everts-calc/api/quotes/${quoteId}/pdf-preview${bedrijfQuery}`
  const docxSrc = `/everts-calc/api/quotes/${quoteId}/docx-preview${bedrijfQuery}`

  return (
    <div className="flex flex-col h-full">
      <div className="flex-shrink-0 flex items-center gap-1 px-4 py-2 border-b border-slate-200 bg-white print:hidden">
        <span className="text-xs text-slate-400 mr-1">Weergave:</span>
        <button
          onClick={() => setModus('pdf')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            modus === 'pdf' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          PDF
        </button>
        <button
          onClick={() => setModus('word')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            modus === 'word' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          Word (sneller)
        </button>
      </div>

      <div className="flex-1 overflow-hidden">
        {modus === 'pdf' ? (
          <iframe src={pdfSrc} className="w-full h-full border-0" title="Offerte PDF-voorvertoning" />
        ) : (
          <DocxViewer src={docxSrc} className="w-full h-full" />
        )}
      </div>
    </div>
  )
}
