'use client'

import { useState, useTransition } from 'react'
import { updateQuoteHeader } from '@/app/(platform)/everts-calc/actions/quotes'
import type { Quote, QuoteTemplate } from '@/lib/everts-calc/types-quotes'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardBody } from '@/components/ui/card'

const AANHEF_OPTIES = [
  'Geachte heer/mevrouw,',
  'Geachte heer,',
  'Geachte mevrouw,',
  'Beste,',
]

interface Props {
  quote: Quote
  templates?: QuoteTemplate[]
}

export default function QuoteHeaderCard({ quote, templates = [] }: Props) {
  const [, startTransition] = useTransition()
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(
    templates.find(t => t.is_standaard)?.id ?? templates[0]?.id ?? ''
  )

  function save(veld: string, waarde: string | null) {
    startTransition(() => {
      updateQuoteHeader(quote.id, { [veld]: waarde })
    })
  }

  function laadVoorbladSjabloon(templateId: string) {
    const tmpl = templates.find(t => t.id === templateId)
    if (!tmpl) return
    if (!confirm('Aanhef, inleiding en slottekst overschrijven met sjabloon?')) return
    startTransition(() => {
      updateQuoteHeader(quote.id, {
        aanhef: tmpl.standaard_aanhef ?? quote.aanhef,
        inleiding: tmpl.standaard_inleiding ?? null,
        slottekst: tmpl.standaard_slottekst ?? null,
      })
    })
  }

  return (
    <Card>
      <CardHeader>
        Offerte gegevens
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Klantinfo */}
        {quote.client && (
          <div className="p-3 bg-slate-50 rounded-lg text-sm">
            <div className="font-medium text-slate-800">
              {quote.client.bedrijfsnaam ?? quote.client.naam}
            </div>
            {quote.client.bedrijfsnaam && (
              <div className="text-slate-500">{quote.client.naam}</div>
            )}
            {quote.client.adres && <div className="text-slate-500">{quote.client.adres}</div>}
            {(quote.client.postcode || quote.client.plaats) && (
              <div className="text-slate-500">
                {[quote.client.postcode, quote.client.plaats].filter(Boolean).join(' ')}
              </div>
            )}
            {quote.client.email && (
              <div className="text-slate-500 text-xs mt-1">{quote.client.email}</div>
            )}
          </div>
        )}

        {/* Voorblad sjabloon */}
        {templates.length > 0 && (
          <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
            <span className="text-xs text-slate-500 whitespace-nowrap">Voorblad sjabloon:</span>
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value)}
              className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs bg-white text-slate-600 focus:outline-none"
            >
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.naam}{t.is_standaard ? ' ★' : ''}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => laadVoorbladSjabloon(selectedTemplateId)}
            >
              Laden
            </Button>
          </div>
        )}

        {/* Titel */}
        <EditVeld
          label="Titel"
          waarde={quote.titel}
          onSave={(v) => save('titel', v)}
        />

        {/* Referentie */}
        <EditVeld
          label="Referentie / projectnummer"
          waarde={quote.referentie ?? ''}
          placeholder="Optioneel"
          onSave={(v) => save('referentie', v || null)}
        />

        {/* Contactpersoon */}
        <EditVeld
          label="Contactpersoon"
          waarde={quote.contactpersoon ?? ''}
          placeholder="Optioneel"
          onSave={(v) => save('contactpersoon', v || null)}
        />

        {/* Datum + geldig_tot */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Datum</label>
            <input
              type="date"
              defaultValue={quote.datum}
              onBlur={(e) => save('datum', e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Geldig tot</label>
            <input
              type="date"
              defaultValue={quote.geldig_tot ?? ''}
              onBlur={(e) => save('geldig_tot', e.target.value || null)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
            />
          </div>
        </div>

        {/* Aanhef */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Aanhef</label>
          <select
            defaultValue={quote.aanhef}
            onChange={(e) => save('aanhef', e.target.value)}
            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts bg-white"
          >
            {AANHEF_OPTIES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        {/* Inleiding */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Inleiding</label>
          <AutoTextarea
            defaultValue={quote.inleiding ?? ''}
            placeholder="Optionele inleidingstekst voor de offerte..."
            onSave={(v) => save('inleiding', v || null)}
          />
        </div>

        {/* Slottekst */}
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Slottekst</label>
          <AutoTextarea
            defaultValue={quote.slottekst ?? ''}
            placeholder="Optionele slottekst..."
            onSave={(v) => save('slottekst', v || null)}
          />
        </div>
      </CardBody>
    </Card>
  )
}

function EditVeld({
  label,
  waarde,
  placeholder,
  onSave,
}: {
  label: string
  waarde: string
  placeholder?: string
  onSave: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-500 mb-1">{label}</label>
      <input
        type="text"
        defaultValue={waarde}
        placeholder={placeholder}
        onBlur={(e) => onSave(e.target.value)}
        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts"
      />
    </div>
  )
}

function AutoTextarea({
  defaultValue,
  placeholder,
  onSave,
}: {
  defaultValue: string
  placeholder?: string
  onSave: (v: string) => void
}) {
  const [value, setValue] = useState(defaultValue)
  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={(e) => onSave(e.target.value)}
      placeholder={placeholder}
      rows={3}
      className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts resize-none"
    />
  )
}
