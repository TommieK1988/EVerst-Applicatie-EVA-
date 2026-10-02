'use client'

import { useEffect } from 'react'
import { useTaal } from './client'

/**
 * Zet `<html lang>` op de taal van de app zolang je in `/m` bent. De root-layout zegt
 * `lang="nl"` (het kantoordeel is Nederlands); voor schermlezers, woordafbreking en de
 * vertaalsuggestie van de browser hoort in `/m` de echte taal te staan.
 */
export default function HtmlTaal() {
  const taal = useTaal()
  useEffect(() => {
    const html = document.documentElement
    const vorige = html.lang
    html.lang = taal
    return () => { html.lang = vorige }
  }, [taal])
  return null
}
