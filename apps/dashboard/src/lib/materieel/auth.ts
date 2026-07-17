import 'server-only'
import { notFound, redirect } from 'next/navigation'
import { vereisRecht, GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { FEATURES } from '@/lib/features'
import type { ModuleRechten } from '@everts/database/platform-types'

/**
 * Autorisatie voor materieelbeheer — twee lagen:
 *
 *  1. De env-flag bepaalt of de module in deze omgeving überhaupt bestaat.
 *  2. Het recht `materieelbeheer` bepaalt wie er wat mag.
 *
 * Niveaus (zie de seed-migratie 20260716d):
 *  - lezen     → paspoorten en overzichten bekijken
 *  - schrijven → dagelijks gebruik: scannen, controle invullen, toewijzen,
 *                storing melden, materieel toevoegen, bestanden uploaden
 *  - beheren   → onomkeerbaar/administratief: archiveren, documenten en
 *                keuringen verwijderen, teams en instellingen beheren
 *
 * De splitsing schrijven/beheren is bewust: monteurs moeten kunnen scannen en
 * controleren, maar horen geen facturen of keuringsdocumenten te kunnen wissen.
 */

/** Route-guard voor pagina's. Onvoldoende recht → terug naar de startpagina. */
export async function vereisMaterieelToegang(min: ModuleRechten = 'lezen'): Promise<CurrentMedewerker> {
  // Flag uit (productie vóór go-live) → de module bestaat hier simpelweg niet.
  if (!FEATURES.materieelbeheer) notFound()
  try {
    const { medewerker } = await vereisRecht('materieelbeheer', min)
    return medewerker
  } catch (e) {
    // redirect() gooit zelf een Next-signaal; dat mag hier gewoon doorlopen.
    if (e instanceof GeenToegangError) redirect('/')
    throw e
  }
}

/**
 * Gate voor muterende server-actions. Gooit i.p.v. te redirecten: actions worden
 * ook als kale RPC aangeroepen en moeten dan hard falen — zonder deze check kan
 * elke ingelogde gebruiker ze rechtstreeks aanroepen (de admin-client bypast RLS).
 */
export async function vereisMaterieelMutatie(min: ModuleRechten = 'schrijven'): Promise<CurrentMedewerker> {
  if (!FEATURES.materieelbeheer) throw new GeenToegangError('Materieelbeheer is niet actief')
  const { medewerker } = await vereisRecht('materieelbeheer', min)
  return medewerker
}

/** Kortere schrijfwijze voor onomkeerbare of administratieve acties. */
export async function vereisMaterieelBeheer(): Promise<CurrentMedewerker> {
  return vereisMaterieelMutatie('beheren')
}
