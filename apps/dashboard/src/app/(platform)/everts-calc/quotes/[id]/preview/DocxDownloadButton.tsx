'use client'

import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

interface Props {
  quoteId: string
  quoteNummer: string
  /** Concept-offerte: bestandsnaam begint met "Concept". */
  isConcept?: boolean
}

export default function DocxDownloadButton({ quoteId, quoteNummer, isConcept = false }: Props) {
  const [loading, setLoading] = useState(false)

  async function download() {
    setLoading(true)
    const toastId = toast.loading('Word document genereren...')
    try {
      // Bedrijfsgegevens komen server-side uit de bedrijfsinstellingen.
      const url = `/everts-calc/api/quotes/${quoteId}/docx`
      const response = await fetch(url)

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        if (response.status === 404 && err.error?.includes('template')) {
          throw new Error('Geen Word template geconfigureerd. Stel een template in via Instellingen → Layouts → Word tab.')
        }
        throw new Error(err.error ?? err.detail ?? `HTTP ${response.status}`)
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${isConcept ? 'Concept ' : ''}${quoteNummer}.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)

      toast.success('Word document gedownload', { id: toastId })
    } catch (err) {
      console.error('Docx download fout:', err)
      toast.error(String(err).replace('Error: ', ''), { id: toastId })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={download}
      disabled={loading}
      title="Download als Word document (.docx)"
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-blue-600" />}
      {loading ? 'Genereren…' : 'Word'}
    </button>
  )
}
