/**
 * De commerciële tijdlijn: klantcontacten, fasewissels, overdrachten en notities door elkaar
 * heen, nieuwste bovenaan.
 *
 * Bewust één stroom uit drie bronnen in plaats van drie blokken onder elkaar. De vraag die een
 * collega stelt is "wat is hier gebeurd?", niet "wat staat er in de notitietabel?".
 */

import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { cn } from '@everts/ui'
import type { TijdlijnRegel } from '@/lib/commercie/actions'

const SOORT_STIP: Record<TijdlijnRegel['soort'], string> = {
  contact:    'bg-brand-500',
  stap:       'bg-info-500',
  overdracht: 'bg-crew-1',
  fase:       'bg-neutral-800',
  notitie:    'bg-neutral-300',
}

function momentNL(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Amsterdam',
  })
}

export function Tijdlijn({ regels }: { regels: TijdlijnRegel[] }) {
  return (
    <Card>
      {/* Geen eigen tekstkleur: CardHeader kleurt zijn band en tekst zelf (zie BewakingPaneel). */}
      <CardHeader>
        <h2 className="text-sm font-semibold">Tijdlijn</h2>
      </CardHeader>
      <CardBody>
        <ol className="space-y-3">
            {/* Nog niets gebeurd: dezelfde regelvorm, leeg — stip, kop en tijdstip. */}
            {regels.length === 0 && (
              <li className="flex gap-3 text-neutral-400">
                <div className="flex flex-col items-center pt-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full bg-neutral-200" aria-hidden />
                  <span className="mt-1 w-px flex-1 bg-neutral-200" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium">—</span>
                    <span className="text-xs">—</span>
                  </div>
                </div>
              </li>
            )}
            {regels.map(r => (
              <li key={r.id} className="flex gap-3">
                <div className="flex flex-col items-center pt-1.5">
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', SOORT_STIP[r.soort])} aria-hidden />
                  <span className="mt-1 w-px flex-1 bg-neutral-200" aria-hidden />
                </div>
                <div className="min-w-0 flex-1 pb-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium text-neutral-900">{r.kop}</span>
                    <span className="text-xs text-neutral-500">
                      {momentNL(r.op)}{r.door ? ` · ${r.door}` : ''}
                    </span>
                  </div>
                  {r.tekst && (
                    <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-neutral-700">{r.tekst}</p>
                  )}
                </div>
              </li>
            ))}
        </ol>
        {regels.length === 0 && (
          <p className="mt-2 text-[12px] text-neutral-500">
            Nog niets gebeurd. Zodra je een uitkomst vastlegt of de fase wijzigt, verschijnt dat hier.
          </p>
        )}
      </CardBody>
    </Card>
  )
}
