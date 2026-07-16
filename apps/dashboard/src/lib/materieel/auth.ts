import 'server-only'
import { notFound } from 'next/navigation'
import { getCurrentMedewerker, GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { FEATURES } from '@/lib/features'

/**
 * Autorisatie-gate voor materieelbeheer.
 *
 * FLAG-FASE (nu): de module is verborgen achter NEXT_PUBLIC_FEATURE_MATERIEEL.
 * Waar de flag uit staat (productie) bestaat de module niet → notFound(). Waar de
 * flag aan staat (preview/lokaal) mag elke ingelogde medewerker de module testen.
 *
 * BIJ GO-LIVE (TODO): vervang de body door de strikte rechten-gate, seed het recht
 * en voeg 'materieelbeheer' toe aan AFGEDWONGEN_MODULES:
 *   const { medewerker } = await vereisRecht('materieelbeheer', min)
 *   return medewerker
 */
export async function vereisMaterieelToegang(): Promise<CurrentMedewerker> {
  if (!FEATURES.materieelbeheer) notFound()
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) notFound()
  return medewerker
}

/**
 * Zelfde gate voor muterende server-actions, maar gooit i.p.v. redirect/notFound —
 * server-actions worden ook als kale RPC aangeroepen en moeten hard falen.
 */
export async function vereisMaterieelMutatie(): Promise<CurrentMedewerker> {
  if (!FEATURES.materieelbeheer) throw new GeenToegangError('Materieelbeheer is niet actief')
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) throw new GeenToegangError('Niet ingelogd')
  return medewerker
}
