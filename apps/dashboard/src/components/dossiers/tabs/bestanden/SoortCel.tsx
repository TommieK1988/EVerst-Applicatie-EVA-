'use client'

/**
 * Cel "Soort" in de bestandenlijst. Een gewone select, zodat kiezen één klik is en
 * de cel niet breder wordt dan de langste soortnaam.
 *
 * Een automatisch herkende soort staat grijs: die is een gok van EVA op basis van de
 * trefwoorden in Instellingen. Een handmatig gekozen soort staat zwart. De bovenste
 * optie (wat EVA zelf zou kiezen) haalt een handmatige keuze weer weg; de rest staat
 * eronder onder "Zelf kiezen", zodat dezelfde naam niet twee keer naast elkaar staat.
 */

import React from 'react'
import type { BestandRij } from '@/lib/dossiers/bestand-rijen'
import type { BestandSoortDef } from '@/lib/dossiers/bestand-soort'

const AUTO = ''

export default function SoortCel({ rij, soorten, autoNaam, bewerkbaar, onKies }: {
  rij: BestandRij
  soorten: BestandSoortDef[]
  /** Wat EVA zelf zou kiezen; in de optie "Automatisch (…)" zodat je ziet wat je terugkrijgt. */
  autoNaam: string | null
  bewerkbaar: boolean
  onKies: (rij: BestandRij, soortId: string | null) => void
}) {
  const kleur = rij.soortHandmatig ? 'text-neutral-800' : 'text-neutral-400'

  if (!bewerkbaar) {
    return <span className={kleur}>{rij.soortNaam ?? '—'}</span>
  }

  // Een inactieve soort die hier nog handmatig op staat, moet wel als optie bestaan,
  // anders springt de select stil naar de eerste optie.
  const opties = soorten.filter(s => s.actief || s.id === rij.soortId)

  return (
    <select
      value={rij.soortHandmatig ? rij.soortId ?? AUTO : AUTO}
      onChange={e => onKies(rij, e.target.value || null)}
      onClick={e => e.stopPropagation()}
      aria-label={`Soort van ${rij.naam}`}
      title={rij.soortHandmatig ? 'Zelf gekozen' : 'Door EVA herkend aan de naam (grijs)'}
      className={`h-6 cursor-pointer rounded border border-transparent bg-transparent px-1 text-[12px] hover:border-neutral-200 focus:border-brand-400 focus:outline-none ${kleur}`}
    >
      <option value={AUTO}>{autoNaam ?? '—'}</option>
      <optgroup label="Zelf kiezen">
        {opties.map(s => (
          <option key={s.id} value={s.id}>{s.naam}</option>
        ))}
      </optgroup>
    </select>
  )
}
