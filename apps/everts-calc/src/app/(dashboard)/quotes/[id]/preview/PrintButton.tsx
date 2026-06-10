'use client'

import { Printer } from 'lucide-react'

export default function PrintButton() {
  function handlePrint() {
    const iframe = document.querySelector('iframe[title="Offerte voorvertoning"]') as HTMLIFrameElement | null
    if (iframe?.contentWindow) {
      iframe.contentWindow.print()
    } else {
      window.print()
    }
  }

  return (
    <button
      onClick={handlePrint}
      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors"
    >
      <Printer className="w-3.5 h-3.5" />
      Afdrukken
    </button>
  )
}
