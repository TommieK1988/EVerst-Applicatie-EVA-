'use client'

import { useEffect, useState } from 'react'
import nextDynamic from 'next/dynamic'
import type { Quote } from '@/lib/everts-calc/types-quotes'

const DocxViewer = nextDynamic(() => import('@/components/everts-calc/DocxViewer'), { ssr: false })

const BEDRIJF_KEY = 'evc_offerte_bedrijf'

export default function BedrijfLoader({ quote }: { quote: Quote }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    let url = `/everts-calc/api/quotes/${quote.id}/docx-preview`
    const bedrijfRaw = localStorage.getItem(BEDRIJF_KEY)
    if (bedrijfRaw) {
      url += `?bedrijf=${encodeURIComponent(bedrijfRaw)}`
    }
    setSrc(url)
  }, [quote.id])

  if (!src) {
    return (
      <div className="flex items-center justify-center h-96 bg-white text-slate-400 text-sm">
        Laden…
      </div>
    )
  }

  return <DocxViewer src={src} className="w-full h-full" />
}
