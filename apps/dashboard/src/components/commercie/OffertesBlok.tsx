/**
 * De Bouw7-offertes onder dit project. Leesbron is `bouw7_offertes` (gevuld door de sync):
 * Bouw7-gegevens, geen EVA-administratie. Zonder offertes één zin, geen lege rij met € 0.
 */

import { formatDatumNL } from '@/lib/dossiers/datum-regels'
import type { OfferteRegel } from '@/lib/commercie/bouw7-offertes'

const eur = (n: number | null) =>
  n == null ? '—' : new Intl.NumberFormat('nl-NL', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
  }).format(n)

const LABEL = 'text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500'

export function OffertesBlok({ offertes }: { offertes: OfferteRegel[] }) {
  return (
    <section className="rounded-[10px] border border-neutral-200 bg-white" aria-label="Offertes in Bouw7">
      <div className="flex items-baseline gap-2 border-b border-neutral-200 px-4 py-3">
        <span className={LABEL}>Offertes in Bouw7</span>
        {offertes.length > 0 && <span className="text-xs tabular-nums text-neutral-500">{offertes.length}</span>}
      </div>
      {offertes.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Geen offertes in Bouw7 onder dit project. Is de offerte in EVA gemaakt, dan staat hij op de kaart hiernaast.
        </p>
      ) : (
        <ul className="flex flex-col">
          {offertes.map(o => (
            <li key={o.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-neutral-100 px-4 py-2 last:border-b-0">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-neutral-900" title={o.onderwerp ?? ''}>
                  {o.nummer ?? '—'}{o.onderwerp ? ` · ${o.onderwerp}` : ''}
                </span>
                <span className="block truncate text-xs text-neutral-500">
                  {[o.datum ? formatDatumNL(o.datum) : null, o.status, o.calculator].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums text-neutral-900">{eur(o.bedrag)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
