'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

const BIJLAGEN_KEY = 'evc_offerte_bijlagen'
const BRIEFPAPIER_KEY = 'evc_offerte_briefpapier'
interface Bijlage { naam: string; data: string }

interface Props {
  quoteId: string
  quoteNummer: string
}

/**
 * Downloads de offerte als PDF via de server-side Puppeteer API.
 *
 * Verbeteringen t.o.v. de oude html2canvas aanpak:
 * - Vectorkwaliteit (geen PNG-rasterisering)
 * - Consistente output op alle browsers
 * - A4/A3 en portrait/landscape via layout-instellingen
 * - Correcte paginabreaks en voetteksten met paginanummering
 *
 * Bijlagen worden (indien aanwezig) samengevoegd via pdf-lib (client-side).
 */
export default function PdfDownloadButton({ quoteId, quoteNummer }: Props) {
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

      const quoteBlob = await response.blob()

      // Briefpapier + bijlagen verwerken
      let bijlagen: Bijlage[] = []
      try { bijlagen = JSON.parse(localStorage.getItem(BIJLAGEN_KEY) ?? '[]') } catch { /* geen */ }
      const briefpapierRaw = typeof window !== 'undefined'
        ? (localStorage.getItem(BRIEFPAPIER_KEY) ?? '')
        : ''

      let finalBlob = quoteBlob

      if (briefpapierRaw || bijlagen.length > 0) {
        try {
          const { PDFDocument } = await import('pdf-lib')
          const quoteBytes = await quoteBlob.arrayBuffer()
          let workingDoc = await PDFDocument.load(quoteBytes)

          // Briefpapier als achtergrond op elke pagina
          if (briefpapierRaw) {
            try {
              const base64 = briefpapierRaw.split(',')[1]
              const binStr = atob(base64)
              const bpBytes = new Uint8Array(binStr.length)
              for (let i = 0; i < binStr.length; i++) bpBytes[i] = binStr.charCodeAt(i)

              const briefpapierDoc = await PDFDocument.load(bpBytes)
              const outputDoc = await PDFDocument.create()

              for (let i = 0; i < workingDoc.getPageCount(); i++) {
                // Briefpapier pagina als basis (gebruik laatste pagina als er meer content is)
                const bpIdx = Math.min(i, briefpapierDoc.getPageCount() - 1)
                const [bpPage] = await outputDoc.copyPages(briefpapierDoc, [bpIdx])
                outputDoc.addPage(bpPage)
                const page = outputDoc.getPage(i)

                // Content pagina als overlay
                const embeddedContent = await outputDoc.embedPage(workingDoc.getPage(i))
                page.drawPage(embeddedContent, {
                  x: 0,
                  y: 0,
                  width: page.getWidth(),
                  height: page.getHeight(),
                })
              }

              workingDoc = outputDoc
            } catch (e) {
              console.warn('Briefpapier overlay mislukt, PDF zonder briefpapier:', e)
            }
          }

          // Bijlagen achteraan toevoegen
          for (const bijlage of bijlagen) {
            try {
              const base64 = bijlage.data.split(',')[1]
              const binStr = atob(base64)
              const bytes = new Uint8Array(binStr.length)
              for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
              const bijlagePdf = await PDFDocument.load(bytes)
              const paginas = await workingDoc.copyPages(bijlagePdf, bijlagePdf.getPageIndices())
              paginas.forEach(p => workingDoc.addPage(p))
            } catch (e) { console.warn(`Bijlage "${bijlage.naam}" overgeslagen:`, e) }
          }

          const mergedBytes = await workingDoc.save()
          finalBlob = new Blob([mergedBytes.buffer as ArrayBuffer], { type: 'application/pdf' })
        } catch (e) {
          console.warn('PDF nabewerking mislukt, originele PDF gebruikt:', e)
        }
      }

      const objectUrl = URL.createObjectURL(finalBlob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = `${quoteNummer}.pdf`
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
