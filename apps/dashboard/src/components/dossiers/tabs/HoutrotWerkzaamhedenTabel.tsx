'use client'

import { Badge, Button } from '@/components/ui'
import { formatCurrency } from '@/lib/houtrotherstel/utils'
import { fotoPubliekeUrl } from '@/lib/houtrotherstel/fotos'
import { isHandmatig, telRegels } from '@/lib/houtrotherstel/handmatige-regel'
import type { RegistratieRegelForm } from '@/lib/houtrotherstel/types'

const getalNL = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

/**
 * De werkzaamheden van één registratie: bibliotheek- en handmatige regels in één
 * lijst, met de totalen eronder (arbeid en materiaal gesplitst). Handmatige regels
 * zijn als zodanig gemarkeerd en, zolang er niet gefactureerd is, te bewerken.
 */
export default function HoutrotWerkzaamhedenTabel({
  regels, vast, onBewerk, onVerwijder,
}: {
  regels: RegistratieRegelForm[]
  /** Gefactureerd: niets meer te bewerken of te verwijderen. */
  vast: boolean
  onBewerk: (index: number) => void
  onVerwijder: (index: number) => void
}) {
  if (regels.length === 0) return null
  const tot = telRegels(regels)

  return (
    <div className="mb-3 overflow-x-auto rounded-lg border border-neutral-200">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-neutral-200 text-[10.5px] uppercase tracking-[0.08em] text-neutral-500">
            <th className="px-3 py-2 text-left font-semibold">Werkzaamheid</th>
            <th className="px-3 py-2 text-right font-semibold">Aantal</th>
            <th className="px-3 py-2 text-right font-semibold">Uren</th>
            <th className="px-3 py-2 text-right font-semibold">Verkoop</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {regels.map((r, i) => {
            const handmatig = isHandmatig(r)
            const a = Number(r.aantal) || 0
            return (
              <tr key={i}>
                <td className="px-3 py-2 text-neutral-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span>{r.repair_name_snapshot ?? 'Werkzaamheid'}</span>
                    {handmatig && (
                      <Badge size="sm" tone="info">
                        Handmatig · {r.regel_type === 'arbeid' ? 'arbeid' : 'materiaal'}
                      </Badge>
                    )}
                    {r.categorie === 'meerwerk' && <Badge size="sm" tone="warning">Meerwerk</Badge>}
                  </div>
                  {(r.functie || r.notitie || r.foto_pad) && (
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11.5px] text-neutral-500">
                      {r.functie && <span>{r.functie}</span>}
                      {r.notitie && <span>{r.notitie}</span>}
                      {r.foto_pad && (
                        <a href={fotoPubliekeUrl(r.foto_pad)} target="_blank" rel="noopener noreferrer"
                          className="text-brand-700 underline">foto</a>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {getalNL(a)}{handmatig && r.unit_snapshot ? ` ${r.unit_snapshot}` : ''}
                </td>
                <td className="px-3 py-2 text-right text-neutral-500">{(a * (r.labor_hours_snapshot ?? 0)).toFixed(2)}</td>
                <td className="px-3 py-2 text-right text-neutral-800">{formatCurrency(a * (r.sale_price_snapshot ?? 0))}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {!vast && (
                    <div className="flex justify-end gap-1">
                      {handmatig && (
                        <Button type="button" size="sm" variant="ghost" onClick={() => onBewerk(i)}>Bewerken</Button>
                      )}
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Verwijderen"
                        className="text-error-700" onClick={() => onVerwijder(i)}>×</Button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-neutral-200 text-[12px] font-semibold text-neutral-700">
            <td className="px-3 py-2">Totaal</td>
            <td />
            <td className="px-3 py-2 text-right">{tot.uren.toFixed(2)}</td>
            <td className="px-3 py-2 text-right">{formatCurrency(tot.verkoop)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-200 px-3 py-2 text-[12px] text-neutral-500">
        <span>Arbeidskosten <strong className="text-neutral-800">{formatCurrency(tot.arbeid)}</strong></span>
        <span>Materiaalkosten <strong className="text-neutral-800">{formatCurrency(tot.materiaal)}</strong></span>
        {tot.verkoopHandmatig > 0 && (
          <span>Waarvan handmatig <strong className="text-neutral-800">{formatCurrency(tot.verkoopHandmatig)}</strong></span>
        )}
        {tot.verkoopMeerwerk > 0 && (
          <span>Waarvan meerwerk <strong className="text-neutral-800">{formatCurrency(tot.verkoopMeerwerk)}</strong></span>
        )}
      </div>
    </div>
  )
}
