'use client'

/**
 * "Deze opdracht moet eerst geaccordeerd worden" — wat je ziet als een opdracht op een bon boven
 * de inkoopdrempel komt. Twee standen: de aanvraag is de deur uit (met bij wie hij ligt), of het
 * dossier heeft geen controller en je kiest zelf wie beoordeelt.
 *
 * Alleen weergave; het aanvragen zelf doet de ouder (`accorderingVoorBonOpdracht` vanuit het
 * bestelvenster, `vraagAccorderingVoorBonConcept` vanaf de bon).
 */

import React, { useState } from 'react'
import { Button, FormField } from '@/components/ui'
import { formatEuro } from '@/lib/everts-calc/calculations'
import type { BonAccordering } from '@/app/(platform)/everts-calc/actions/bon-opdracht'

export type AccorderingStand = Extract<BonAccordering, { status: 'aangevraagd' | 'kies' }>

const veld = 'w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm ' +
  'dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100'

export default function AccorderingVenster({ stand, bezig, onKies, onSluit }: {
  stand: AccorderingStand
  bezig: boolean
  onKies: (beoordelaarId: string) => void
  onSluit: () => void
}) {
  const [gekozen, setGekozen] = useState('')
  const waarom = stand.drempel != null
    ? `De opdracht is ${formatEuro(stand.bedrag)}. Op de servicedesk moet inkoop vanaf ${formatEuro(stand.drempel)} eerst geaccordeerd worden.`
    : `De opdracht is ${formatEuro(stand.bedrag)} en moet eerst geaccordeerd worden.`

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40 p-4" onClick={bezig ? undefined : onSluit}>
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-lg
                   dark:border-neutral-700 dark:bg-neutral-900"
      >
        <h2 className="mb-2 text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {stand.status === 'kies' ? 'Wie accordeert de opdracht?' : 'Accordering aangevraagd'}
        </h2>
        <p className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">{waarom}</p>

        {stand.status === 'kies' ? (
          <>
            <p className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">
              Dit dossier heeft geen controller. Kies wie de opdracht beoordeelt.
            </p>
            <FormField label="Beoordelaar" upper>
              <select value={gekozen} onChange={e => setGekozen(e.target.value)} className={veld}>
                <option value="">Kies…</option>
                {stand.directie.map(d => <option key={d.id} value={d.id}>{d.naam}</option>)}
              </select>
            </FormField>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={onSluit} disabled={bezig}>Later</Button>
              <Button variant="primary" onClick={() => onKies(gekozen)} loading={bezig} disabled={bezig || !gekozen}>
                Accordering aanvragen
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="mb-3 text-sm text-neutral-700 dark:text-neutral-300">
              {stand.beoordelaarNaam
                ? `De aanvraag ligt bij ${stand.beoordelaarNaam}, die er een melding van krijgt.`
                : 'De aanvraag is vastgelegd.'}
              {' '}De opdracht staat op de bon onder <span className="font-semibold">Opdrachten in de wacht</span>.
              Is hij geaccordeerd, dan maak je hem daar af.
            </p>
            {stand.waarschuwing && (
              <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                {stand.waarschuwing}
              </p>
            )}
            <div className="flex justify-end">
              <Button variant="primary" onClick={onSluit}>Sluiten</Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
