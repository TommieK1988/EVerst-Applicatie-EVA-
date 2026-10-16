'use client'

/**
 * "Waarom staat het stil": de open offertes met een vastgelegde stilstandreden, per reden
 * opgeteld. Beantwoordt de vraag die de lijst zelf niet stelt: hoeveel geld ligt er te wachten
 * op een ALV, op een begroting, op ons? Klik een reden om de lijst daarop te filteren, ook met
 * wat pas later speelt.
 */

import { cn } from '@everts/ui'
import { eurKort, kortDatum, stilstandPerReden, type TeDoenRij } from './te-doen'
import type { StilReden } from '@/lib/commercie/opvolging'

type Props = {
  rijen: TeDoenRij[]
  gekozen: StilReden | null
  onKies: (reden: StilReden | null) => void
  vandaag: string
}

export function StilstandOverzicht(props: Props) {
  const groepen = stilstandPerReden(props.rijen)
  const zonder = props.rijen.filter(r => !r._stil && r.bewaking_stap_soort === 'wachten').length

  return (
    <div className="rounded-[10px] border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-neutral-200 px-4 py-2">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">Waarom staat het stil</span>
        {props.gekozen && (
          <button type="button" onClick={() => props.onKies(null)} className="ml-auto text-xs font-semibold text-brand-700 underline underline-offset-2">
            Filter opheffen
          </button>
        )}
      </div>
      {groepen.length === 0 ? (
        <p className="px-4 py-3 text-[13px] text-neutral-500">
          Nog bij geen enkele offerte een reden vastgelegd. Dat gebeurt bij een uitkomst als
          &ldquo;Klant komt erop terug&rdquo; of &ldquo;Ligt bij ALV&rdquo;.
        </p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {groepen.map(g => {
            const aan = props.gekozen === g.reden
            return (
              <li key={g.reden}>
                <button
                  type="button"
                  aria-pressed={aan}
                  onClick={() => props.onKies(aan ? null : g.reden)}
                  className={cn(
                    'flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left',
                    aan ? 'bg-brand-50 shadow-[inset_3px_0_0_var(--brand-500)]' : 'hover:bg-neutral-50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-neutral-900">{g.label}</span>
                    <span className="block text-xs text-neutral-500">
                      {g.eersteBesluit ? `eerste besluit ${kortDatum(g.eersteBesluit, props.vandaag)}` : 'geen besluitdatum'}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-neutral-500">
                    <span className="block text-[13px] font-semibold text-neutral-900">{g.aantal}</span>
                    {eurKort(g.bedrag)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {zonder > 0 && (
        <p className="border-t border-neutral-100 px-4 py-2 text-xs text-neutral-500">
          {zonder} {zonder === 1 ? 'offerte wacht' : 'offertes wachten'} op iemand zonder vastgelegde reden.
        </p>
      )}
    </div>
  )
}
