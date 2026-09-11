'use client'

/**
 * Picker voor het invoerveld van type `bezoek_opties`: over wélk bezoek het rapport gaat en
 * wat er in mag.
 *
 * Eén lijst met alle bezoeken van het dossier door elkaar — kwaliteitsrondes,
 * opleveringen, veiligheidsrondes en ingediende formulieren, nieuwste eerst. De opsteller
 * kiest een *bezoek*; welke module dat heeft vastgelegd is voor hem niet interessant. Het
 * soort-etiket staat er alleen bij zodat hij ziet wat voor rapport eruit komt.
 *
 * De waarde is één JSON-tekst (zie `lib/documenten/bezoek-opties.ts`), zodat er geen kolommen
 * bij hoeven en "Opnieuw opstellen" de keuzes vanzelf herstelt. Zelfde opzet als
 * `KwaliteitOptiesVeld`.
 */

import { useEffect, useMemo, useState } from 'react'
import { getBezoeken } from '@/app/(platform)/documenten/actions'
import type { BezoekKeuze } from '@/lib/documenten/bezoek'
import { BEZOEK_SOORT_LABELS } from '@/lib/documenten/bezoek/contract'
import {
  parseBezoekOpties, serialiseerBezoekOpties, MAX_PER_PAGINA, type BezoekOpties,
} from '@/lib/documenten/bezoek-opties'

const invoerCls =
  'w-full rounded border border-neutral-300 px-2.5 py-1.5 text-[12.5px] focus:outline-none focus:ring-2 focus:ring-brand-500/30'

/** Sleutel die soort en id combineert; een losse UUID zegt niet uit welke tabel hij komt. */
const sleutelVan = (b: { soort: string; id: string }) => `${b.soort}:${b.id}`

export default function BezoekOptiesVeld({ dossierId, waarde, onChange }: {
  dossierId: string
  waarde: string
  onChange: (v: string) => void
}) {
  const opties = useMemo(() => parseBezoekOpties(waarde), [waarde])
  const zet = (wijziging: Partial<BezoekOpties>) =>
    onChange(serialiseerBezoekOpties({ ...opties, ...wijziging }))

  const [bezoeken, setBezoeken] = useState<BezoekKeuze[] | null>(null)

  useEffect(() => {
    getBezoeken(dossierId).then(setBezoeken).catch(() => setBezoeken([]))
  }, [dossierId])

  const huidig = opties.bron_soort && opties.bron_id
    ? `${opties.bron_soort}:${opties.bron_id}`
    : ''
  const gekozen = bezoeken?.find(b => sleutelVan(b) === huidig) ?? bezoeken?.[0] ?? null

  const kies = (v: string) => {
    if (!v) return zet({ bron_soort: null, bron_id: null })
    const [soort, ...rest] = v.split(':')
    zet({ bron_soort: soort as BezoekOpties['bron_soort'], bron_id: rest.join(':') })
  }

  return (
    <div className="space-y-2.5">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-neutral-500">Bezoek</label>
        <select value={huidig} onChange={e => kies(e.target.value)} className={invoerCls}>
          <option value="">Meest recente bezoek</option>
          {(bezoeken ?? []).map(b => (
            <option key={sleutelVan(b)} value={sleutelVan(b)}>
              {BEZOEK_SOORT_LABELS[b.soort]} — {b.label}
              {b.datum ? ` · ${new Date(b.datum).toLocaleDateString('nl-NL')}` : ''}
            </option>
          ))}
        </select>
        {bezoeken !== null && bezoeken.length === 0 && (
          <p className="mt-1 text-[11.5px] text-amber-700">
            Er is op dit dossier nog geen afgerond bezoek. Rond eerst een kwaliteitsronde,
            oplevering of formulier af.
          </p>
        )}
        {gekozen && (
          <p className="mt-1 text-[11.5px] text-neutral-500">
            Er komt een rapport uit met de kop &ldquo;{BEZOEK_SOORT_LABELS[gekozen.soort]}&rdquo;.
            Hoofdstukken die dit bezoek niet kent, blijven weg.
          </p>
        )}
      </div>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input type="checkbox" checked={opties.toon_fotos}
          onChange={e => zet({ toon_fotos: e.target.checked })} />
        Foto&apos;s opnemen
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input type="checkbox" checked={opties.toon_voor_na} disabled={!opties.toon_fotos}
          onChange={e => zet({ toon_voor_na: e.target.checked })} />
        Ook de foto na herstel tonen
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input type="checkbox" checked={opties.toon_waarnemingen}
          onChange={e => zet({ toon_waarnemingen: e.target.checked })} />
        Opnemen wat er goed ging
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input type="checkbox" checked={opties.toon_handtekeningen}
          onChange={e => zet({ toon_handtekeningen: e.target.checked })} />
        Ondertekening opnemen
      </label>

      <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
        <input type="checkbox" checked={opties.toon_niet_beoordeeld}
          onChange={e => zet({ toon_niet_beoordeeld: e.target.checked })} />
        Ook tonen wat niet is beoordeeld
      </label>

      <div>
        <label className="flex items-center gap-2 text-[12.5px] text-neutral-600">
          <input type="checkbox" checked={opties.toon_reacties}
            onChange={e => zet({ toon_reacties: e.target.checked })} />
          Reacties bij een bevinding opnemen
        </label>
        <p className="mt-1 text-[11px] text-neutral-500">
          Staat standaard uit: in reacties staat vaak interne afstemming die niet voor de
          opdrachtgever bedoeld is.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-neutral-500">
          Bevindingen per pagina
        </label>
        <input
          type="number" min={1} max={MAX_PER_PAGINA} value={opties.per_pagina}
          onChange={e => zet({ per_pagina: Math.max(1, Math.min(MAX_PER_PAGINA, Number(e.target.value) || 1)) })}
          className={invoerCls}
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          Hoort bij de indeling van het Word-sjabloon; wijzig dit alleen als het sjabloon erop
          is ingericht.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-[11px] font-medium text-neutral-500">
          Inleiding (optioneel)
        </label>
        <textarea
          rows={3} value={opties.inleiding}
          onChange={e => zet({ inleiding: e.target.value })}
          placeholder="Leeg laten voor de standaardtekst bij dit soort bezoek"
          className={invoerCls}
        />
      </div>
    </div>
  )
}
