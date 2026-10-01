'use client'

/**
 * Het oordeel per veld: wat is ingevuld, waar moet je naar kijken, wat mist er.
 *
 * De regels staan in `veld-eisen.ts` en `veld-status.ts`, niet hier. Dat is het punt:
 * de voorwaarde voor de knop en de uitleg eronder komen uit dezelfde bron. Eerder
 * stond de voorwaarde in een losse `compleet`-expressie en de uitleg in een met de
 * hand getypte zin, en die konden uit elkaar lopen.
 */

import { useMemo } from 'react'

import { eisenVoor, type VeldSleutel } from '@/lib/mailintake/veld-eisen'
import { beoordeelAlleVelden } from '@/lib/mailintake/veld-status'
import type { IntakeRoute, MailSoort } from '@/lib/mailintake/types'
import { waarnemingenUit, type SchermToestand } from './velden-uit-scherm'

export function useOordelen(
  route: IntakeRoute,
  soort: MailSoort | null,
  toestand: SchermToestand,
) {
  // De toestand is elke render een nieuw object; de inhoud bepaalt of er iets
  // verandert. JSON is hier goed genoeg: het gaat om platte waarden.
  const sleutel = JSON.stringify([route, soort, toestand, [...toestand.aangeraakt]])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => beoordeelAlleVelden(waarnemingenUit(toestand), eisenVoor(route, soort)), [sleutel])
}

export type { VeldSleutel }
