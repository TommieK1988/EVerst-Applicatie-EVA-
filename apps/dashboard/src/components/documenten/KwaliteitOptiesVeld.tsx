'use client'

/**
 * Picker voor het invoerveld van type `kwaliteit_opties`: over welke inspectie het rapport gaat en
 * welke hoofdstukken mee moeten.
 *
 * De waarde is één JSON-tekst (zie `lib/documenten/kwaliteit-opties.ts`), zodat er geen kolommen
 * bij hoeven en "Opnieuw opstellen" de keuzes vanzelf herstelt. Zelfde opzet als
 * `HoutrotOptiesVeld`.
 *
 * Alleen **definitieve** inspecties zijn te kiezen: een concept is nog niet af en hoort niet bij de
 * opdrachtgever terecht te komen.
 */

import { useEffect, useMemo, useState } from 'react'
import { getInspecties, type InspectieRij } from '@/lib/kwaliteit/inspecties'
import {
  parseKwaliteitOpties, serialiseerKwaliteitOpties, MAX_PER_PAGINA,
  type KwaliteitRapportOpties,
} from '@/lib/documenten/kwaliteit-opties'

const invoerCls =
  'w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export default function KwaliteitOptiesVeld({ dossierId, waarde, onChange }: {
  dossierId: string
  waarde: string
  onChange: (v: string) => void
}) {
  const opties = useMemo(() => parseKwaliteitOpties(waarde), [waarde])
  const zet = (wijziging: Partial<KwaliteitRapportOpties>) =>
    onChange(serialiseerKwaliteitOpties({ ...opties, ...wijziging }))

  const [inspecties, setInspecties] = useState<InspectieRij[] | null>(null)

  useEffect(() => {
    getInspecties({ dossierId, status: 'definitief' })
      .then(setInspecties)
      .catch(() => setInspecties([]))
  }, [dossierId])

  const gekozen = inspecties?.find(i => i.id === opties.inspectie_id) ?? inspecties?.[0] ?? null

  return (
    <div className="space-y-2.5">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-neutral-500">Inspectie</label>
        <select
          value={opties.inspectie_id ?? ''}
          onChange={e => zet({ inspectie_id: e.target.value || null })}
          className={invoerCls}
        >
          <option value="">Meest recente definitieve inspectie</option>
          {(inspecties ?? []).map(i => (
            <option key={i.id} value={i.id}>
              {i.inspectienummer} — {new Date(i.datum).toLocaleDateString('nl-NL')}
              {i.inspecteur ? ` · ${i.inspecteur}` : ''}
            </option>
          ))}
        </select>
        {inspecties !== null && inspecties.length === 0 && (
          <p className="mt-1 text-[11.5px] text-amber-700">
            Er is nog geen definitieve inspectie op dit dossier. Rond eerst een kwaliteitsronde af.
          </p>
        )}
        {gekozen && (
          <p className="mt-1 text-[11.5px] text-neutral-500">
            {gekozen.aantal_beoordeeld} punten beoordeeld · {gekozen.aantal_afwijkingen} afwijkingen
            {gekozen.aantal_kritiek > 0 && (
              <span className="font-semibold text-red-600"> · {gekozen.aantal_kritiek} kritiek</span>
            )}
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input
          type="checkbox"
          checked={opties.toon_waarnemingen}
          onChange={e => zet({ toon_waarnemingen: e.target.checked })}
        />
        Positieve kwaliteitswaarnemingen opnemen
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input
          type="checkbox"
          checked={opties.toon_opvolging}
          onChange={e => zet({ toon_opvolging: e.target.checked })}
        />
        Opvolging van eerdere inspecties opnemen
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input
          type="checkbox"
          checked={opties.toon_niet_beoordeeld}
          onChange={e => zet({ toon_niet_beoordeeld: e.target.checked })}
        />
        Niet beoordeelde punten in de puntenlijst tonen
      </label>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-neutral-500">
          Afwijkingen per pagina
        </label>
        <input
          type="number"
          min={1}
          max={MAX_PER_PAGINA}
          value={opties.per_pagina}
          onChange={e => zet({ per_pagina: Math.max(1, Math.min(MAX_PER_PAGINA, Number(e.target.value) || 1)) })}
          className={invoerCls}
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          Hoort bij de indeling van het Word-sjabloon; wijzig dit alleen als het sjabloon erop is
          ingericht.
        </p>
      </div>
    </div>
  )
}
