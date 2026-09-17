'use client'

/**
 * De drie velden van een verkoopkans, als één blok.
 *
 * Een verkoopkans is wat er overblijft als een offerte verloren gaat, vervalt of wordt
 * uitgesteld: het werk komt terug, alleen niet nu. Er zijn precies drie dingen die hem van een
 * losse aantekening onderscheiden, en die zijn daarom alle drie verplicht:
 *
 *   * **Uitleg** — waar gaat het over, zodat een collega over een jaar niet hoeft te raden;
 *   * **Actiehouder** — één naam, anders is het van niemand;
 *   * **Deadline** — zonder datum komt hij nooit vanzelf terug in beeld.
 *
 * Bewust gedeeld tussen de uitkomstdialoog, de afsluitdialoog op het bord en het
 * verkoopkansen-overzicht: drie plekken die dezelfde kans aanmaken horen dezelfde drie vragen
 * te stellen, in dezelfde woorden.
 */

import * as React from 'react'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { datumNaarISO } from '@/lib/dossiers/datum-regels'
import type { VerkoopkansInvoer } from '@/lib/commercie/types'

export type MedewerkerKeuze = { id: string; naam: string }

export function VerkoopkansVelden({
  waarde, onChange, medewerkers, uitgeschakeld,
}: {
  waarde: VerkoopkansInvoer
  onChange: (v: VerkoopkansInvoer) => void
  medewerkers: MedewerkerKeuze[]
  uitgeschakeld?: boolean
}) {
  const datum = waarde.deadline ? new Date(`${waarde.deadline}T12:00:00`) : undefined

  return (
    <div className="space-y-3">
      <Veld tekst="Waar gaat de kans over?">
        <Input
          value={waarde.uitleg}
          disabled={uitgeschakeld}
          onChange={e => onChange({ ...waarde, uitleg: e.target.value })}
          placeholder="Bv. 'Schilderwerk complex Zuid komt in 2027 opnieuw langs — nu geen budget'"
        />
      </Veld>

      <Veld tekst="Wie gaat erachteraan?">
        <select
          className="h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-[13px] disabled:bg-neutral-50"
          value={waarde.actiehouderId}
          disabled={uitgeschakeld}
          onChange={e => onChange({ ...waarde, actiehouderId: e.target.value })}
        >
          <option value="">Kies een collega…</option>
          {medewerkers.map(m => <option key={m.id} value={m.id}>{m.naam}</option>)}
        </select>
      </Veld>

      <Veld tekst="Wanneer pakken we het weer op?">
        <DatePicker
          value={datum}
          onChange={d => onChange({ ...waarde, deadline: d ? datumNaarISO(d) : '' })}
        />
      </Veld>
    </div>
  )
}

function Veld({ tekst, children }: { tekst: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-700">{tekst}</span>
      {children}
    </label>
  )
}
