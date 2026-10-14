'use client'

import { useState } from 'react'
import { Check, CircleCheck, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SOORT_LABEL, type ControlePunt, type ControleSoort } from '@/lib/everts-calc/controle'

interface Props {
  punten: ControlePunt[]
  readOnly?: boolean
  onNaarRegel?: (regelId: string) => void
  onKlopt?: (sleutel: string) => void
  /** Eén knop boven een soort, bijv. "€ 58 toepassen" bij uren zonder tarief. */
  acties?: Partial<Record<ControleSoort, { label: string; onClick: () => void }>>
}

const ZICHTBAAR = 5

/**
 * De controlepunten, per soort gegroepeerd: eerst wat de offerte tegenhoudt (rood),
 * dan wat je even nakijkt (oranje). Gedeeld door het controlepaneel en stap 1 van
 * het offertevenster, zodat beide hetzelfde laten zien.
 */
export default function ControleLijst({ punten, readOnly, onNaarRegel, onKlopt, acties }: Props) {
  if (punten.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-[10px] bg-success-50 px-4 py-3 text-sm text-success-700">
        <CircleCheck className="w-4 h-4 flex-shrink-0" />
        Alles in orde. Niets dat de offerte tegenhoudt of nagekeken moet worden.
      </div>
    )
  }

  // Volgorde: blokkerend eerst, binnen een niveau in volgorde van eerste voorkomen.
  const soorten: ControleSoort[] = []
  for (const niveau of ['blokkeert', 'nakijken'] as const) {
    for (const p of punten) if (p.niveau === niveau && !soorten.includes(p.soort)) soorten.push(p.soort)
  }

  return (
    <div className="flex flex-col gap-4">
      {soorten.map(soort => (
        <Groep
          key={soort} soort={soort} punten={punten.filter(p => p.soort === soort)}
          readOnly={readOnly} onNaarRegel={onNaarRegel} onKlopt={onKlopt} actie={acties?.[soort]}
        />
      ))}
    </div>
  )
}

function Groep({ soort, punten, readOnly, onNaarRegel, onKlopt, actie }: {
  soort: ControleSoort
  punten: ControlePunt[]
  readOnly?: boolean
  onNaarRegel?: (regelId: string) => void
  onKlopt?: (sleutel: string) => void
  actie?: { label: string; onClick: () => void }
}) {
  const [alles, setAlles] = useState(false)
  const blokkeert = punten[0].niveau === 'blokkeert'
  const open = punten.filter(p => !p.bevestigd).length
  const zichtbaar = alles ? punten : punten.slice(0, ZICHTBAAR)
  // Per-regelpunten tonen hun regel; een los punt (marge, voorwaarden) alleen de tekst.
  const perRegel = punten.some(p => p.regelId)

  return (
    <section>
      <div className="flex items-center gap-2 mb-1.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${blokkeert ? 'bg-error-500' : 'bg-warning-500'}`} />
        <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-600">
          {SOORT_LABEL[soort]}
        </h4>
        {perRegel && (
          <span className={`text-[11px] font-semibold ${blokkeert ? 'text-error-700' : 'text-warning-700'}`}>
            {open > 0 ? open : <Check className="w-3 h-3 inline" />}
          </span>
        )}
        <span className={`ml-auto whitespace-nowrap text-[10.5px] font-medium ${blokkeert ? 'text-error-700' : 'text-neutral-400'}`}>
          {blokkeert ? 'Blokkeert offerte' : 'Nakijken'}
        </span>
      </div>

      {actie && !readOnly && (
        <Button variant="outline" size="sm" className="mb-1.5" onClick={actie.onClick}>{actie.label}</Button>
      )}

      <ul className="flex flex-col rounded-[10px] border border-neutral-200 divide-y divide-neutral-100 bg-white">
        {zichtbaar.map(p => (
          <li key={p.sleutel} className={`flex items-center gap-2 px-3 py-2 ${p.bevestigd ? 'opacity-55' : ''}`}>
            <div className="min-w-0 flex-1">
              <div className={`text-xs text-neutral-800 ${p.regelId ? 'truncate' : ''} ${p.bevestigd ? 'line-through' : ''}`} title={p.titel}>{p.titel}</div>
              {p.detail && <div className={`text-[11px] text-neutral-500 ${p.regelId ? 'truncate' : ''}`}>{p.detail}</div>}
            </div>
            {p.regelId && onNaarRegel && (
              <button
                type="button" onClick={() => onNaarRegel(p.regelId!)}
                className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-brand-700 hover:underline"
              >
                Naar regel <ArrowRight className="w-3 h-3" />
              </button>
            )}
            {p.bevestigbaar && onKlopt && !readOnly && (
              <Button
                variant={p.bevestigd ? 'ghost' : 'outline'} size="sm" className="h-6 px-2 text-[11px] flex-shrink-0"
                onClick={() => onKlopt(p.sleutel)}
                title={p.bevestigd ? 'Bevestiging intrekken' : 'Nagekeken: klopt zo'}
              >
                {p.bevestigd ? <><Check className="w-3 h-3" /> Klopt</> : 'Klopt'}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {punten.length > ZICHTBAAR && (
        <button type="button" onClick={() => setAlles(a => !a)} className="mt-1 text-[11px] font-medium text-brand-700 hover:underline">
          {alles ? 'Minder tonen' : `Alle ${punten.length} tonen`}
        </button>
      )}
    </section>
  )
}
