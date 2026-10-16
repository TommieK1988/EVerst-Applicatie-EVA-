'use client'

/**
 * Een collega kiezen met een zoekveld.
 *
 * Een gewone <select> met alle actieve medewerkers werd een lange, onoverzichtelijke lijst:
 * wie "Sanne" zocht moest scrollen tot de S. Hier typ je een paar letters. Bouwt op de
 * Combobox (Formulierpatronen.html #04), dus dezelfde opmaak als de andere zoekvelden.
 *
 * Staat bijna altijd in een dialoog of drawer; het keuzepaneel krijgt daarom standaard een
 * z-index boven de modal (zie de opmerking bij `contentClassName` in combobox.tsx).
 */

import * as React from 'react'
import { Combobox, type ComboboxOption } from './combobox'

export type MedewerkerKeuzeOptie = { id: string; naam: string }

type Props = {
  medewerkers: MedewerkerKeuzeOptie[]
  /** Id van de gekozen collega, of '' voor niemand. */
  value: string
  onChange: (id: string) => void
  placeholder?: string
  /** Toon bovenaan een keuze "niemand" (bv. "Nog niet bepaald"); leeg = geen lege keuze. */
  leegLabel?: string
  /** Wordt in de lijst als "(jij)" gemarkeerd en bovenaan gezet. */
  mijnId?: string | null
  disabled?: boolean
  className?: string
  contentClassName?: string
}

const LEEG = '__niemand__'

export function MedewerkerKiezer(props: Props) {
  const opties = React.useMemo<ComboboxOption[]>(() => {
    const lijst = [...props.medewerkers].sort((a, b) =>
      (a.id === props.mijnId ? -1 : b.id === props.mijnId ? 1 : 0) || a.naam.localeCompare(b.naam, 'nl'))
    return [
      ...(props.leegLabel ? [{ value: LEEG, label: props.leegLabel }] : []),
      ...lijst.map(m => ({ value: m.id, label: m.id === props.mijnId ? `${m.naam} (jij)` : m.naam })),
    ]
  }, [props.medewerkers, props.mijnId, props.leegLabel])

  return (
    <Combobox
      options={opties}
      value={props.value || (props.leegLabel ? LEEG : '')}
      onChange={v => props.onChange(v === LEEG ? '' : v)}
      placeholder={props.placeholder ?? 'Kies een collega…'}
      searchPlaceholder="Typ een naam…"
      emptyText="Geen collega gevonden."
      disabled={props.disabled}
      className={props.className}
      contentClassName={props.contentClassName ?? 'z-[300]'}
    />
  )
}
