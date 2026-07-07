'use client'

import { useState, useTransition } from 'react'
import { Send, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { getOfferteMailConcept, verstuurOfferte } from '@/app/(platform)/everts-calc/actions/offerte-verzenden'

interface Props {
  quoteId: string
  /** True als de offerte is goedgekeurd en dus verzonden mag worden. */
  verzendbaar: boolean
  /** Aangeroepen na een geslaagde verzending (om afhankelijke status te herladen). */
  onDone?: () => void
}

/** Knop + venster om een goedgekeurde offerte per Outlook naar de opdrachtgever te mailen. */
export default function VerzendOfferteKnop({ quoteId, verzendbaar, onDone }: Props) {
  const [open, setOpen] = useState(false)
  const [laden, setLaden] = useState(false)
  const [pending, startVerzend] = useTransition()
  const [to, setTo] = useState('')
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('') // platte tekst; \n → <br> bij verzenden

  async function openen() {
    setOpen(true)
    setLaden(true)
    try {
      const concept = await getOfferteMailConcept(quoteId)
      setTo(concept.to)
      setSubject(concept.subject)
      setBody(concept.bodyHtml.replace(/<br\s*\/?>/gi, '\n'))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kon mailconcept niet laden')
    } finally {
      setLaden(false)
    }
  }

  function verzenden() {
    startVerzend(async () => {
      const res = await verstuurOfferte(quoteId, {
        to, cc, subject, bodyHtml: body.replace(/\n/g, '<br>'),
      })
      if (res.ok) {
        toast.success(`Offerte verzonden · SharePoint: ${res.sharepoint}`)
        setOpen(false)
        onDone?.()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <button
        onClick={openen}
        disabled={!verzendbaar}
        title={verzendbaar ? 'Offerte mailen naar de opdrachtgever' : 'Eerst goedkeuren door de controller'}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold bg-everts text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Send className="w-3.5 h-3.5" />
        Verzenden
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !pending) setOpen(false) }}
        >
          <div className="w-full max-w-xl overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-everts" />
                <h2 className="text-sm font-bold text-slate-900">Offerte verzenden</h2>
              </div>
              <button onClick={() => !pending && setOpen(false)} className="text-slate-400 hover:text-slate-600 rounded-md p-1 hover:bg-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {laden ? (
                <p className="text-sm text-slate-500 py-6 text-center">Mailconcept laden…</p>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Aan</span>
                    <input value={to} onChange={e => setTo(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-everts/30" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">CC (optioneel)</span>
                    <input value={cc} onChange={e => setCc(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-everts/30" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Onderwerp</span>
                    <input value={subject} onChange={e => setSubject(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-everts/30" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-500">Bericht</span>
                    <textarea value={body} onChange={e => setBody(e.target.value)} rows={9}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-everts/30" />
                  </label>
                  <p className="text-xs text-slate-400">
                    Bijlagen: de offerte-PDF en de algemene voorwaarden. Na verzenden wordt de status
                    <strong> Verzonden</strong> en worden de PDF + mail in SharePoint bewaard.
                  </p>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
              <button onClick={() => setOpen(false)} disabled={pending}
                className="px-3 py-1.5 rounded-lg text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                Annuleren
              </button>
              <button onClick={verzenden} disabled={pending || laden || !to.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold bg-everts text-white hover:opacity-90 disabled:opacity-40">
                <Send className="w-3.5 h-3.5" />
                {pending ? 'Verzenden…' : 'Verzenden'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
