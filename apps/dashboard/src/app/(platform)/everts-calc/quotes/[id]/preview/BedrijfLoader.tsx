'use client'

import { useEffect, useRef, useState } from 'react'
import type { Quote } from '@/lib/everts-calc/types-quotes'

const BEDRIJF_KEY = 'evc_offerte_bedrijf'

export default function BedrijfLoader({ quote }: { quote: Quote }) {
  const [src, setSrc] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    let url = `/everts-calc/everts-calc/api/quotes/${quote.id}/preview-html`
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

  return (
    <iframe
      ref={iframeRef}
      src={src}
      className="w-full border-0 bg-white"
      style={{ minHeight: '1123px', height: 'calc(100vh - 120px)' }}
      title="Offerte voorvertoning"
    />
  )
}
