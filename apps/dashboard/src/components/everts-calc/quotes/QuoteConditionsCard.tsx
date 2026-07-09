'use client'

import { useTransition } from 'react'
import { CreditCard, FileText } from 'lucide-react'
import { updateQuoteHeader } from '@/app/(platform)/everts-calc/actions/quotes'
import type { Betalingsconditie } from '@/app/(platform)/everts-calc/actions/betalingscondities'
import type { AlgemeneVoorwaarden } from '@/app/(platform)/everts-calc/actions/algemene-voorwaarden'
import { Card, CardHeader, CardBody } from '@/components/ui/card'

interface Props {
  quoteId: string
  betalingsconditieId: string | null | undefined
  voorwaardenId: string | null | undefined
  betalingscondities: Betalingsconditie[]
  algVoorwaarden: AlgemeneVoorwaarden[]
}

export default function QuoteConditionsCard({
  quoteId,
  betalingsconditieId,
  voorwaardenId,
  betalingscondities,
  algVoorwaarden,
}: Props) {
  const [, startTransition] = useTransition()

  function wijzigBetalingsconditie(id: string) {
    startTransition(() => {
      updateQuoteHeader(quoteId, { betalingsconditie_id: id || null })
    })
  }

  function wijzigVoorwaarden(id: string) {
    startTransition(() => {
      updateQuoteHeader(quoteId, { voorwaarden_id: id || null })
    })
  }

  if (betalingscondities.length === 0 && algVoorwaarden.length === 0) return null

  return (
    <Card>
      <CardHeader>Condities &amp; voorwaarden</CardHeader>
      <CardBody className="space-y-4">

        {/* Betalingscondities */}
        {betalingscondities.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5" /> Betalingscondities
            </label>
            <select
              defaultValue={betalingsconditieId ?? ''}
              onChange={(e) => wijzigBetalingsconditie(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts bg-white"
            >
              <option value="">— Geen betalingsconditie —</option>
              {betalingscondities.map(b => (
                <option key={b.id} value={b.id}>
                  {b.naam}
                </option>
              ))}
            </select>
            {betalingsconditieId && (
              <p className="mt-1.5 text-xs text-slate-500 bg-slate-50 rounded-lg p-2 leading-relaxed">
                {betalingscondities.find(b => b.id === betalingsconditieId)?.tekst}
              </p>
            )}
          </div>
        )}

        {/* Algemene voorwaarden */}
        {algVoorwaarden.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" /> Algemene voorwaarden (bijlage)
            </label>
            <select
              defaultValue={voorwaardenId ?? ''}
              onChange={(e) => wijzigVoorwaarden(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-everts/30 focus:border-everts bg-white"
            >
              <option value="">— Geen bijlage —</option>
              {algVoorwaarden.map(av => (
                <option key={av.id} value={av.id}>
                  {av.naam}{av.versie ? ` (${av.versie})` : ''}{av.is_standaard ? ' ★' : ''}
                </option>
              ))}
            </select>
            {voorwaardenId && (
              <p className="mt-1 text-xs text-slate-400">
                ✓ PDF wordt automatisch als bijlage toegevoegd bij het downloaden.
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  )
}
