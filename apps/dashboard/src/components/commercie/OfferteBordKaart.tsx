'use client'

/**
 * Een kaart op het offertebord. Eigen kaart en niet DossierKaart, omdat het offertebord andere
 * vragen beantwoordt dan de andere borden: wat is de stand, wie is eigenaar, wie is aan zet.
 *
 * Kleur zit alleen in het statuslabel (stip mét woord). De kolommen zijn neutraal, en de
 * avatar is de eigenaar, niet de calculator: één persoon per rol.
 * Een klik opent de offertekaart van Te doen als lade; daar leg je ook de uitkomst vast.
 */

import * as React from 'react'
import { cn } from '@everts/ui'
import type { DossierRij } from '@/components/dossiers/types'
import { crewInitialen, crewKleur } from '@/lib/utils/crew'
import { STATUS_PRESENTATIE } from '@/lib/commercie/types'
import type { Bedragklassegrenzen } from '@/lib/commercie/bedragklassen'
import { eur, kortDatum, maakTeDoenRij } from './te-doen'

const AFGESLOTEN: Record<string, { label: string; badge: string }> = {
  gewonnen:  { label: 'Gewonnen',  badge: 'bg-success-50 text-success-700' },
  verloren:  { label: 'Verloren',  badge: 'bg-neutral-100 text-neutral-700' },
  vervallen: { label: 'Vervallen', badge: 'bg-neutral-100 text-neutral-700' },
}

export const OfferteBordKaart = React.memo(function OfferteBordKaart(props: {
  dossier: DossierRij
  vandaag: string
  grenzen?: Bedragklassegrenzen
  /** Krijgt het dossier-id; stabiel houden (useCallback), anders werkt de memo niet. */
  onOpen: (id: string) => void
}) {
  const d = props.dossier
  const r = React.useMemo(() => maakTeDoenRij(d, props.vandaag, props.grenzen), [d, props.vandaag, props.grenzen])
  const afsluiting = d.hoofdstatus === 'opdracht' ? 'gewonnen' : d.offerte_substatus ?? ''
  const afgesloten = AFGESLOTEN[afsluiting]
  const pres = STATUS_PRESENTATIE[r._status]
  const eigenaar = d.bewaking_eigenaar ?? null

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => props.onOpen(d.id)}
      onKeyDown={e => { if (e.key === 'Enter') props.onOpen(d.id) }}
      className="flex cursor-pointer flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 hover:border-neutral-300 hover:bg-neutral-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] tabular-nums text-neutral-500">{d.dossiernummer ?? 'Nieuw'}</span>
        {r._bedrag != null && r._bedrag !== 0 && (
          <span className="text-xs font-bold tabular-nums text-neutral-900">{eur(r._bedrag)}</span>
        )}
      </div>

      <div className="min-w-0">
        <div className="text-[13px] font-semibold leading-snug text-neutral-900">{d.titel}</div>
        {d.klant_naam && <div className="truncate text-xs text-neutral-500">{d.klant_naam}</div>}
      </div>

      <div className="flex flex-wrap gap-1">
        {afgesloten ? (
          <span className={cn('inline-flex items-center rounded-full px-2 py-px text-[11px] font-semibold', afgesloten.badge)}>
            {afgesloten.label}
          </span>
        ) : (
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-px text-[11px] font-semibold', pres.badge)} title={pres.uitleg}>
            <span className={cn('h-2 w-2 rounded-full', pres.stip)} aria-hidden />
            {pres.label}{d.bewaking_stap_datum ? ` · ${kortDatum(d.bewaking_stap_datum, props.vandaag)}` : ''}
          </span>
        )}
        {r._klasse === 'mega' && !afgesloten && (
          <span className="inline-flex items-center rounded-full bg-warning-50 px-2 py-px text-[11px] font-semibold text-warning-700">Mega</span>
        )}
      </div>

      {!afgesloten && d.bewaking_stap_tekst && (
        <div className={cn('text-xs', r._status === 'verlopen' ? 'font-semibold text-error-700' : 'text-neutral-700')}>
          {d.bewaking_stap_tekst}
          {d.bewaking_actiehouder && <span className="font-normal text-neutral-500"> · {d.bewaking_actiehouder}</span>}
        </div>
      )}

      {!afgesloten && (
        <div className="flex items-center gap-2 text-[11px] text-neutral-500">
          {eigenaar ? (
            <>
              <span
                className="inline-grid h-5 w-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                style={{ background: crewKleur(crewInitialen(eigenaar)) }}
                title={`Eigenaar: ${eigenaar}`}
              >
                {crewInitialen(eigenaar)}
              </span>
              <span className="truncate">{eigenaar}</span>
            </>
          ) : (
            <span className="text-neutral-400">Geen eigenaar</span>
          )}
          <button
            type="button"
            onClick={e => { e.stopPropagation(); props.onOpen(d.id) }}
            className="ml-auto rounded-md border border-neutral-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            {r._status === 'ongetrieerd' ? 'Openen' : 'Uitkomst'}
          </button>
        </div>
      )}
    </div>
  )
})
