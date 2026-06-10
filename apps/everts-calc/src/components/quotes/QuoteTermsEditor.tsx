'use client'

import { useState, useTransition } from 'react'
import { upsertTerm } from '@/app/actions/quotes'
import type { QuoteTerm, QuoteTemplate, TermType } from '@/lib/types-quotes'

const PANELS: { key: TermType; label: string; placeholder: string }[] = [
  { key: 'voorwaarden',   label: 'Voorwaarden',  placeholder: 'Algemene voorwaarden...' },
  { key: 'uitsluitingen', label: 'Uitsluitingen', placeholder: 'Wat is niet inbegrepen...' },
  { key: 'opmerkingen',   label: 'Opmerkingen',  placeholder: 'Aanvullende opmerkingen...' },
]

interface Props {
  quoteId: string
  terms: QuoteTerm[]
  templates?: QuoteTemplate[]
}

export default function QuoteTermsEditor({ quoteId, terms, templates = [] }: Props) {
  const [, startTransition] = useTransition()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates.find(t => t.is_standaard)?.id ?? templates[0]?.id ?? ''
  )

  const termByType: Record<TermType, string> = {
    voorwaarden:   terms.find(t => t.type === 'voorwaarden')?.inhoud ?? '',
    uitsluitingen: terms.find(t => t.type === 'uitsluitingen')?.inhoud ?? '',
    opmerkingen:   terms.find(t => t.type === 'opmerkingen')?.inhoud ?? '',
  }

  const [waarden, setWaarden] = useState(termByType)

  function save(type: TermType, inhoud: string) {
    startTransition(() => {
      upsertTerm(quoteId, type, inhoud)
    })
  }

  function laadUitTemplate() {
    const tmpl = templates.find(t => t.id === selectedTemplateId)
    if (!tmpl) return
    if (!confirm('Huidige tekst overschrijven met sjabloon?')) return
    const nieuw: Record<TermType, string> = {
      voorwaarden:   tmpl.standaard_voorwaarden ?? '',
      uitsluitingen: tmpl.standaard_uitsluitingen ?? '',
      opmerkingen:   tmpl.standaard_opmerkingen ?? '',
    }
    setWaarden(nieuw)
    startTransition(async () => {
      if (nieuw.voorwaarden)   await upsertTerm(quoteId, 'voorwaarden',   nieuw.voorwaarden)
      if (nieuw.uitsluitingen) await upsertTerm(quoteId, 'uitsluitingen', nieuw.uitsluitingen)
      if (nieuw.opmerkingen)   await upsertTerm(quoteId, 'opmerkingen',   nieuw.opmerkingen)
    })
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      {/* Header met sjabloon-picker */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">Voorwaarden &amp; opmerkingen</h3>
        {templates.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Sjabloon:</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="px-2 py-1 border border-slate-200 rounded-lg text-xs bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-everts/30"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.naam}{t.is_standaard ? ' ★' : ''}</option>
              ))}
            </select>
            <button
              onClick={laadUitTemplate}
              className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-everts hover:text-white rounded-lg transition-colors whitespace-nowrap"
            >
              Laden
            </button>
          </div>
        )}
      </div>

      {/* Drie panelen naast elkaar */}
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {PANELS.map((panel) => (
          <div key={panel.key} className="p-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              {panel.label}
            </label>
            <textarea
              value={waarden[panel.key]}
              onChange={(e) => setWaarden(w => ({ ...w, [panel.key]: e.target.value }))}
              onBlur={(e) => save(panel.key, e.target.value)}
              rows={10}
              placeholder={panel.placeholder}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts resize-y leading-relaxed"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
