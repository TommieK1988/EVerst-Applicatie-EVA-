'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  quoteId: string
  quoteNummer: string
  /** Concept-offerte: bestandsnaam begint met "Concept". */
  isConcept?: boolean
}

/**
 * Downloadt de offerte als PDF via de server-route (/api/quotes/[id]/pdf).
 *
 * Briefpapier (per layout) en algemene voorwaarden worden server-side
 * samengevoegd — de Word-template wordt via Microsoft Graph naar PDF gerenderd.
 */
export default function PdfDownloadButton({ quoteId, quoteNummer, isConcept = false }: Props) {
  const [loading, setLoading] = useState(false)

  async function download() {
    setLoading(true)
    const toastId = toast.loading('PDF genereren...')
    try {
      // Bedrijfsgegevens meesturen vanuit localStorage
      const bedrijfRaw = typeof window !== 'undefined'
        ? (localStorage.getItem('evc_offerte_bedrijf') ?? '{}')
        : '{}'

      const url = `/everts-calc/api/quotes/${quoteId}/pdf?bedrijf=${encodeURIComponent(bedrijfRaw)}`
      const response = await fetch(url)

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(err.error ?? err.detail ?? `HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${isConcept ? 'Concept ' : ''}${quoteNummer}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)

      toast.success('PDF gedownload', { id: toastId })
    } catch (err) {
      console.error('PDF download fout:', err)
      toast.error('PDF mislukt: ' + String(err), { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={download}
      disabled={loading}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-everts text-white rounded-lg text-sm font-medium hover:bg-everts/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {loading ? 'Genereren…' : 'Download PDF'}
    </button>
  )
}
