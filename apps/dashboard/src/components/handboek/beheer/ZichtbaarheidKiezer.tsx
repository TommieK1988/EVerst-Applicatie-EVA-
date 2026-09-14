'use client'

import React from 'react'
import { Badge } from '@/components/ui'
import { HANDBOEK_KENMERKEN, telZichtbaarVoor, type Zichtbaarheid } from '@/lib/handboek/kenmerken'

type Kenmerk = { key: string; label: string; uitleg?: string }

/**
 * Kiezer voor "wie ziet dit". Twee rijen, want de regel heeft twee kanten:
 * zichtbaar voor (een OF) en verborgen voor (die wint altijd).
 *
 * Waarom die tweede rij er is, en niet een `intern-met-voertuig`-kenmerk: een
 * EN maak je door de andere groep uit te sluiten. "Auto of bus" staat op
 * zichtbaar {voertuig, kantoor} + verborgen {extern}. Zou je voor elke
 * combinatie een eigen kenmerk verzinnen, dan groeit de lijst met elke
 * uitzondering mee en weet niemand meer wat wat betekent.
 *
 * Het telletje eronder is geen versiering. Een zichtbaarheidsfout is per
 * definitie onzichtbaar voor degene die hem maakt; "0 van de 46" laat meteen
 * zien dat er twee kenmerken zijn aangevinkt die elkaar uitsluiten.
 */
export default function ZichtbaarheidKiezer({
  waarde, werkmaatschappijen, populatie, totaal, onWijzig, compact,
}: {
  waarde: Zichtbaarheid
  werkmaatschappijen: Kenmerk[]
  populatie: { kenmerken: string[]; aantal: number }[]
  totaal: number
  onWijzig: (nieuw: Zichtbaarheid) => void
  compact?: boolean
}) {
  const alle: Kenmerk[] = [...HANDBOEK_KENMERKEN, ...werkmaatschappijen]
  const aantal = telZichtbaarVoor(waarde, populatie)

  function wissel(lijst: 'zichtbaar_voor' | 'verborgen_voor', key: string) {
    const huidig = waarde[lijst]
    const nieuw = huidig.includes(key) ? huidig.filter((k) => k !== key) : [...huidig, key]
    onWijzig({ ...waarde, [lijst]: nieuw })
  }

  return (
    <div className={compact ? 'text-[12px]' : 'text-[13px]'}>
      <Rij
        label="Zichtbaar voor"
        hint={waarde.zichtbaar_voor.length ? undefined : 'niets aangevinkt = iedereen'}
        kenmerken={alle}
        gekozen={waarde.zichtbaar_voor}
        tone="brand"
        onWissel={(k) => wissel('zichtbaar_voor', k)}
      />
      <Rij
        label="Behalve"
        kenmerken={alle}
        gekozen={waarde.verborgen_voor}
        tone="error"
        onWissel={(k) => wissel('verborgen_voor', k)}
      />
      <div className="mt-1.5 text-[12px]">
        {aantal === 0 ? (
          <span className="text-error-700 font-semibold">
            Niemand ziet dit — er zijn kenmerken gekozen die elkaar uitsluiten.
          </span>
        ) : (
          <span className="text-neutral-500">
            Zichtbaar voor {aantal} van de {totaal} actieve medewerkers.
          </span>
        )}
      </div>
    </div>
  )
}

function Rij({
  label, hint, kenmerken, gekozen, tone, onWissel,
}: {
  label: string
  hint?: string
  kenmerken: Kenmerk[]
  gekozen: string[]
  tone: 'brand' | 'error'
  onWissel: (key: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      <span className="w-[92px] shrink-0 text-neutral-500">{label}</span>
      {kenmerken.map((k) => {
        const aan = gekozen.includes(k.key)
        return (
          <button
            key={k.key}
            type="button"
            title={k.uitleg}
            onClick={() => onWissel(k.key)}
            className="cursor-pointer border-0 bg-transparent p-0"
          >
            <Badge tone={aan ? tone : 'neutral'} variant={aan ? 'solid' : 'outline'} size="sm">
              {k.label}
            </Badge>
          </button>
        )
      })}
      {hint && <span className="text-[11px] text-neutral-400">{hint}</span>}
    </div>
  )
}
