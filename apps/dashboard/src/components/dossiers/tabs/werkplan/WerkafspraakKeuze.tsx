'use client'

/**
 * Eén werkafspraak (reisuren, parkeren, …): een rijtje standaardzinnen waarvan je er één kiest.
 * Waar de zin een `…` heeft, staat bij de gekozen optie een invoerveld op die plek — zo leest het
 * formulier als het papieren werkplan waar het vandaan komt.
 */

import * as React from 'react'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio'

export type WerkafspraakOptie<K extends string> = {
  waarde: K
  tekst: string
  /** Het invoerveld op de plek van `…`; alleen getoond als deze optie gekozen is. */
  invul?: React.ReactNode
}

export default function WerkafspraakKeuze<K extends string>({
  titel, opties, waarde, onChange, disabled, fout,
}: {
  titel: string
  opties: WerkafspraakOptie<K>[]
  waarde: K
  onChange: (k: K) => void
  disabled?: boolean
  fout?: string | null
}) {
  const id = React.useId()
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-neutral-500">{titel}</legend>
      <RadioGroup value={waarde} onValueChange={v => onChange(v as K)} disabled={disabled} className="gap-3">
        {opties.map(o => {
          const gekozen = o.waarde === waarde
          const [voor, na] = o.tekst.split('…')
          const heeftInvul = o.invul !== undefined && na !== undefined
          return (
            <div key={o.waarde} className="flex items-start gap-2">
              <RadioGroupItem value={o.waarde} id={`${id}-${o.waarde}`} className="mt-0.5" />
              <label htmlFor={`${id}-${o.waarde}`} className="text-[13px] leading-relaxed text-neutral-800">
                {heeftInvul && gekozen ? (
                  <>
                    {voor}
                    <span className="inline-block align-middle" onClick={e => e.preventDefault()}>{o.invul}</span>
                    {na}
                  </>
                ) : o.tekst}
              </label>
            </div>
          )
        })}
      </RadioGroup>
      {fout && <p className="text-[11.5px] text-error-700">{fout}</p>}
    </fieldset>
  )
}
