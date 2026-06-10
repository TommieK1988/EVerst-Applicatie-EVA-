'use client'

/**
 * DocxViewer
 *
 * Rendert een gerenderd .docx bestand (na docxtemplater) in de browser
 * met volledige opmaakfideliteit via de `docx-preview` library.
 *
 * De `src`-prop moet verwijzen naar een API-route die een
 * application/vnd.openxmlformats-officedocument... buffer teruggeeft.
 * Als de route een text/html foutpagina teruggeeft, wordt die fout getoond.
 */

import { useEffect, useRef, useState } from 'react'

interface Props {
  src: string
  className?: string
}

export default function DocxViewer({ src, className }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    if (!src || !containerRef.current) return

    setStatus('loading')
    setErrMsg('')

    // Leeg de vorige render
    if (containerRef.current) {
      containerRef.current.innerHTML = ''
    }

    let cancelled = false

    fetch(src)
      .then(async r => {
        const ct = r.headers.get('content-type') ?? ''
        // Route geeft text/html terug bij foutmeldingen
        if (ct.includes('text/html')) {
          const html = await r.text()
          // Strip HTML-tags voor leesbare foutmelding
          const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          throw new Error(text || `HTTP ${r.status}`)
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.arrayBuffer()
      })
      .then(async buffer => {
        if (cancelled || !containerRef.current) return
        const { renderAsync } = await import('docx-preview')
        await renderAsync(buffer as ArrayBuffer, containerRef.current, undefined, {
          className: 'docx-wrapper',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          experimental: false,
          trimXmlDeclaration: true,
        })
        if (!cancelled) setStatus('ok')
      })
      .catch(err => {
        if (cancelled) return
        setErrMsg(String(err).replace(/^Error:\s*/, ''))
        setStatus('error')
      })

    return () => {
      cancelled = true
    }
  }, [src])

  return (
    <div className={`relative flex-1 overflow-auto bg-slate-100 ${className ?? ''}`}>
      {/* Laadstatus */}
      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            Document laden…
          </div>
        </div>
      )}

      {/* Foutmelding */}
      {status === 'error' && (
        <div className="p-8 max-w-xl mx-auto mt-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 font-medium text-sm mb-1">Template render fout</p>
            <p className="text-red-600 text-xs whitespace-pre-wrap break-words">{errMsg}</p>
            <p className="text-slate-400 text-xs mt-3">
              Controleer de tag-syntax in het .docx template. Veelvoorkomende oorzaak: Word heeft een tag
              opgesplitst in meerdere tekst­fragmenten. Verwijder de tag en typ hem in één keer opnieuw,
              of gebruik de kopieer­knop in het variabelen­paneel.
            </p>
          </div>
        </div>
      )}

      {/* docx-preview schrijft de gerenderde HTML hier in */}
      <div
        ref={containerRef}
        className={status === 'loading' ? 'invisible' : ''}
      />
    </div>
  )
}
