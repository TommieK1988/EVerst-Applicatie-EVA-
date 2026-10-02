'use client'

import React, { createContext, useContext } from 'react'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import type { FormField } from '../types'

/**
 * Vertalen van de formulierinhoud (titels, vragen, uitleg, keuzeopties) in EVA Mobiel.
 *
 * De inhoud komt van kantoor (formulier-builder) en wordt alleen voor de weergave vertaald.
 * Wat er wordt opgeslagen — antwoorden en gekozen optiewaarden — blijft altijd het origineel:
 * vertaal hier nooit `option.value`, alleen `option.label`.
 *
 * FormFiller zet één "Automatisch vertaald · Toon origineel"-label bovenaan het formulier en
 * geeft de keuze via deze context door aan elk veld. Op kantoor (taal `nl`) doet dit niets.
 */

const FormulierVertalingContext = createContext<{ origineel: boolean }>({ origineel: false })

export function FormulierVertaling({ origineel, children }: { origineel: boolean; children: React.ReactNode }) {
  return <FormulierVertalingContext.Provider value={{ origineel }}>{children}</FormulierVertalingContext.Provider>
}

/** Toon-teksten (vertaald of origineel, volgens de keuze bovenaan het formulier). */
export function useFormTeksten(teksten: (string | null | undefined)[]): string[] {
  const { origineel } = useContext(FormulierVertalingContext)
  return useVertalingen(teksten).map((v) => (origineel ? v.origineel : v.tekst))
}

/** Alle teksten van kantoor in een formulier, zodat ze in één verzoek vertaald worden. */
export function formulierTeksten(fields: FormField[]): string[] {
  const uit: string[] = []
  const loop = (lijst: FormField[]) => {
    for (const f of lijst) {
      if (f.label) uit.push(f.label)
      if (f.helpText) uit.push(f.helpText)
      if (f.placeholder) uit.push(f.placeholder)
      if (f.aandachtspunt?.toevoegLabel) uit.push(f.aandachtspunt.toevoegLabel)
      for (const o of f.options ?? []) if (o.label) uit.push(o.label)
      if (f.children?.length) loop(f.children)
    }
  }
  loop(fields)
  return uit
}
