import 'server-only'
import { notFound } from 'next/navigation'
import { vereisRecht, vereisSessie, type CurrentMedewerker } from '@/lib/auth/rechten'
import { GeenToegangError } from '@/lib/auth/rechten'
import { FEATURES } from '@/lib/features'
import type { ModuleRechten } from '@everts/database/platform-types'

/**
 * Autorisatie voor het personeelshandboek. Let op de asymmetrie — die is de
 * kern van deze module en niet per ongeluk zo:
 *
 *  • LEZEN op /m hangt NIET aan het recht `medewerkershandboek`. Iedereen met
 *    een account moet zijn eigen handboek kunnen lezen; dat is nu juist het
 *    punt. Wát je ziet bepaalt de RLS-policy aan de hand van je kenmerken, niet
 *    een modulerecht. Kopieer hier dus niet klakkeloos `vereisMaterieelToegang`
 *    — met `vereisRecht('medewerkershandboek','lezen')` sluit je in één klap
 *    elke monteur buiten, en dat merk je pas als iemand belt.
 *
 *  • BEHEREN (de schermen onder (platform)/handboek en alle muterende actions)
 *    hangt er wél aan, want die draaien met de service-role en bepalen wat een
 *    ander te zien krijgt.
 *
 * Niveaus:
 *  - lezen     → beheerschermen inzien, "Bekijk als" gebruiken
 *  - schrijven → teksten en zichtbaarheid bewerken
 *  - beheren   → publiceren, bijlagen verwijderen, hoofdstukken archiveren
 */

/**
 * Gate voor de mobiele leesschermen. Alleen: bestaat de module hier, en is er
 * een sessie? De rest doet RLS.
 */
export async function vereisHandboekLezer(): Promise<CurrentMedewerker> {
  // Flag uit (productie vóór go-live) → de module bestaat hier simpelweg niet.
  if (!FEATURES.handboek) notFound()
  return vereisSessie()
}

/** Route-guard voor de beheerschermen op desktop. */
export async function vereisHandboekBeheerPagina(
  min: ModuleRechten = 'lezen',
): Promise<CurrentMedewerker> {
  if (!FEATURES.handboek) notFound()
  const { medewerker } = await vereisRecht('medewerkershandboek', min)
  return medewerker
}

/**
 * Gate voor muterende server-actions. Gooit i.p.v. te redirecten: actions
 * worden ook als kale RPC aangeroepen en moeten dan hard falen.
 */
export async function vereisHandboekMutatie(
  min: ModuleRechten = 'schrijven',
): Promise<CurrentMedewerker> {
  if (!FEATURES.handboek) throw new GeenToegangError('Het handboek is niet actief')
  const { medewerker } = await vereisRecht('medewerkershandboek', min)
  return medewerker
}
