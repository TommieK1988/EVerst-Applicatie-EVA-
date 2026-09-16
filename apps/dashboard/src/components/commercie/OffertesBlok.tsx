/**
 * De Bouw7-offertes onder dit project.
 *
 * Staat op de bewakingstab omdat de vraag "welke offerte bewaak ik eigenlijk?" pas ontstaat als
 * er meer dan één is. Bij precies één offerte voegt dit blok weinig toe, maar het weglaten zou
 * betekenen dat je nooit ziet dát er maar één is — en dan blijf je twijfelen.
 */

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { formatDatumNL } from '@/lib/dossiers/datum-regels'
import type { OfferteRegel } from '@/lib/commercie/actions'

const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

export function OffertesBlok({ offertes }: { offertes: OfferteRegel[] }) {
  if (offertes.length === 0) return null

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold">
          Offertes in Bouw7
          <span className="ml-2 font-normal opacity-70">{offertes.length}</span>
        </h2>
      </CardHeader>
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2 font-semibold">Nummer</th>
              <th className="px-4 py-2 font-semibold">Onderwerp</th>
              <th className="px-4 py-2 font-semibold">Datum</th>
              <th className="px-4 py-2 font-semibold">Status</th>
              <th className="px-4 py-2 text-right font-semibold">Bedrag excl. btw</th>
              <th className="px-4 py-2 font-semibold">Calculator</th>
            </tr>
          </thead>
          <tbody>
            {offertes.map(o => (
              <tr key={o.id} className="border-b border-neutral-100 last:border-0">
                <td className="whitespace-nowrap px-4 py-2 font-medium">{o.nummer ?? '—'}</td>
                <td className="max-w-[320px] truncate px-4 py-2" title={o.onderwerp ?? ''}>
                  {o.onderwerp ?? '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  {o.datum ? formatDatumNL(o.datum) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-2">{o.status ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums">{eur(o.bedrag)}</td>
                <td className="whitespace-nowrap px-4 py-2">{o.calculator ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}
