'use client'

import { useSyncExternalStore } from 'react'
import {
  getInstellingen,
  getInstellingenServerSnapshot,
  subscribeInstellingen,
} from './local-store'
import type { Instellingen } from './types'

/**
 * Leest de EvertsCalc-instellingen (eenheden, categorieën, btw-tarieven, kolomnamen)
 * en rendert opnieuw zodra ze uit Supabase gehydrateerd of gewijzigd zijn.
 *
 * Gebruik dit overal waar de instellingen in beeld komen. Een kale `getInstellingen()`
 * in een `useMemo([])` of `useState(() => …)` legt de waarde vast bij de eerste render
 * en blijft daarna op de standaardlijst hangen als de hydratie nog onderweg was.
 */
export function useInstellingen(): Instellingen {
  return useSyncExternalStore(
    subscribeInstellingen,
    getInstellingen,
    getInstellingenServerSnapshot,
  )
}
