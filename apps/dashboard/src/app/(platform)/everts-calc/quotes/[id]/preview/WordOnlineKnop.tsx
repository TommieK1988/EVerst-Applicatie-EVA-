'use client'

/**
 * "Bewerken in Word" — stelt de offerte op als .docx in de SharePoint-dossiermap
 * en opent hem in Word Online.
 *
 * Zolang die koppeling bestaat is het Word-bestand de bron voor de offerte-PDF,
 * dus de knop verandert daarna in "Openen in Word" met een menu om terug te
 * schakelen naar het sjabloon of het document opnieuw op te stellen.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Loader2, ChevronDown, RotateCcw, Undo2, AlertTriangle } from 'lucide-react'
import toast from 'react-hot-toast'
import {
  getOfferteWordStatus,
  ontkoppelWord,
  type OfferteWordStatus,
} from '@/app/(platform)/everts-calc/actions/offerte-word'

interface Props {
  quoteId: string
  /** Aangeroepen als de koppeling wijzigt (voorvertoning + statusknoppen herladen). */
  onDone?: () => void
}

export default function WordOnlineKnop({ quoteId, onDone }: Props) {
  const [status, setStatus] = useState<OfferteWordStatus | null>(null)
  const [bezig, setBezig] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [bevestigOpnieuw, setBevestigOpnieuw] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const herlaad = useCallback(async () => {
    try {
      setStatus(await getOfferteWordStatus(quoteId))
    } catch {
      /* stil — knop valt terug op de neutrale variant */
    }
  }, [quoteId])

  useEffect(() => { herlaad() }, [herlaad])

  useEffect(() => {
    if (!menuOpen) return
    function buiten(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', buiten)
    return () => document.removeEventListener('mousedown', buiten)
  }, [menuOpen])

  /**
   * Het tabblad wordt SYNCHROON bij de klik geopend en pas daarna gevuld:
   * een window.open() ná een await wordt door popup-blockers geweigerd.
   */
  async function openInWord(opnieuw = false) {
    const tab = window.open('', '_blank')
    setBezig(true)
    setMenuOpen(false)
    try {
      const res = await fetch(`/everts-calc/api/quotes/${quoteId}/word-online`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opnieuw }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.webUrl) throw new Error(json.error ?? `HTTP ${res.status}`)

      if (tab) tab.location.href = json.webUrl
      else window.open(json.webUrl, '_blank')   // popup geblokkeerd → alsnog proberen

      toast.success(
        json.hergebruikt
          ? 'Het Word-document opent — je bewerkingen blijven aan het dossier gekoppeld'
          : 'Offerte staat als Word-document in de dossiermap en opent in Word',
      )
      await herlaad()
      onDone?.()
    } catch (err) {
      tab?.close()
      toast.error(String(err instanceof Error ? err.message : err))
    } finally {
      setBezig(false)
      setBevestigOpnieuw(false)
    }
  }

  async function terugNaarSjabloon() {
    setMenuOpen(false)
    setBezig(true)
    try {
      const r = await ontkoppelWord(quoteId)
      if (!r.ok) throw new Error(r.error)
      toast.success('De offerte wordt weer uit het sjabloon opgemaakt')
      await herlaad()
      onDone?.()
    } catch (err) {
      toast.error(String(err instanceof Error ? err.message : err))
    } finally {
      setBezig(false)
    }
  }

  const gekoppeld = status?.gekoppeld === true

  if (!gekoppeld) {
    return (
      <button
        onClick={() => openInWord(false)}
        disabled={bezig}
        title="Zet de offerte als Word-document in de dossiermap en open hem in Word Online"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-50 hover:border-slate-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {bezig ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pencil className="w-3.5 h-3.5 text-blue-600" />}
        {bezig ? 'Klaarzetten…' : 'Bewerken in Word'}
      </button>
    )
  }

  return (
    <div className="relative flex items-center" ref={menuRef}>
      <button
        onClick={() => openInWord(false)}
        disabled={bezig}
        title={
          status?.verouderd
            ? 'Let op: de calculatie is gewijzigd nadat dit Word-document is opgesteld'
            : 'Open het gekoppelde Word-document in Word Online'
        }
        className={`flex items-center gap-1.5 rounded-l-lg border py-1.5 pl-3 pr-2.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          status?.verouderd
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
      >
        {bezig ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : status?.verouderd ? (
          <AlertTriangle className="w-3.5 h-3.5" />
        ) : (
          <Pencil className="w-3.5 h-3.5" />
        )}
        {status?.verouderd ? 'Word (verouderd)' : 'Openen in Word'}
      </button>
      <button
        onClick={() => setMenuOpen(o => !o)}
        disabled={bezig}
        title="Meer opties voor het Word-document"
        className={`flex items-center rounded-r-lg border border-l-0 px-1.5 py-1.5 transition-colors disabled:opacity-60 ${
          status?.verouderd
            ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
            : 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
        }`}
      >
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {menuOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-[290px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 px-3 py-2.5 text-[11.5px] leading-relaxed text-slate-500">
            De offerte wordt opgemaakt uit dit Word-document — niet meer uit het sjabloon.
            {status?.verouderd && (
              <span className="mt-1.5 block font-medium text-amber-700">
                De calculatie is sindsdien gewijzigd. Het document toont nog de oude gegevens.
              </span>
            )}
          </div>

          {bevestigOpnieuw ? (
            <div className="px-3 py-2.5">
              <p className="text-[12px] leading-relaxed text-slate-700">
                Opnieuw opstellen uit het sjabloon overschrijft het Word-document.
                <strong className="font-semibold"> Je handmatige aanpassingen gaan verloren.</strong>
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  onClick={() => openInWord(true)}
                  className="rounded bg-red-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-red-700"
                >
                  Overschrijven
                </button>
                <button
                  onClick={() => setBevestigOpnieuw(false)}
                  className="rounded border border-slate-300 px-2.5 py-1 text-[12px] text-slate-600 hover:bg-slate-50"
                >
                  Annuleren
                </button>
              </div>
            </div>
          ) : (
            <>
              <button
                onClick={() => setBevestigOpnieuw(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                Opnieuw opstellen uit sjabloon
              </button>
              <button
                onClick={terugNaarSjabloon}
                className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-[12.5px] text-slate-700 hover:bg-slate-50"
              >
                <Undo2 className="h-3.5 w-3.5 text-slate-400" />
                Koppeling verbreken
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
