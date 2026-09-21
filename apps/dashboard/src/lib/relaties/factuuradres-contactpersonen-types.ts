/**
 * Vormen rond "wie hoort er bij dit factuuradres".
 *
 * Staan los van de server actions: een `'use server'`-bestand mag alleen async functies
 * exporteren, dus types horen hier.
 */

import type { ContactpersoonFactuuradres } from '@everts/database'

/** Eén gekoppelde persoon, zoals het factuuradresblok hem toont. */
export type FactuuradresContact = ContactpersoonFactuuradres & {
  contactpersoon: {
    id: string
    voornaam: string | null
    tussenvoegsel: string | null
    achternaam: string | null
    email: string | null
    telefoon: string | null
    mobiel: string | null
  }
}

/** Andersom: de adressen waar één persoon bij hoort, met het adres en de relatie erbij. */
export type ContactpersoonAdreskoppeling = ContactpersoonFactuuradres & {
  factuuradres: {
    id: string
    label: string
    straat: string | null
    postcode: string | null
    plaats: string | null
    relatie_id: string
    relatie_naam: string | null
  }
}

export function volledigeNaam(cp: {
  voornaam: string | null
  tussenvoegsel: string | null
  achternaam: string | null
}): string {
  return [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ')
}
