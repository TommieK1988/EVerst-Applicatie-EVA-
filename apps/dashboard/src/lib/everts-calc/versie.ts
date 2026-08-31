/**
 * versie.ts — Versiebeheer van de calculatie-keten (client-side).
 *
 * Een versie = één calculatie (scenario) met ten hoogste één offerte die eruit
 * gemaakt is. De calculatie is leidend: het familie-anker (`versie_root_id`) en
 * het versienummer leven op de scenario-kant; de offerte erft nummer + versie bij
 * aanmaak. Reviseren geldt alléén voor een verzonden (definitieve) versie en
 * kopieert **alleen de calculatie** naar een nieuwe, bewerkbare concept-versie —
 * zonder offerte. De offerte wordt later opnieuw gemaakt zodra de gereviseerde
 * begroting klaar is (zonder calculatie geen offerte).
 *
 * Meerwerk-calculaties reviseren op dezelfde manier: de kopie houdt zijn
 * `meerwerk_regel_id`, zodat de nieuwe versie bij dezelfde meerwerkregel blijft
 * horen en niet als contractversie gaat meetellen.
 */

import { getScenario, getScenarios, kopieerScenario, slaScenarioOp, getInstellingen } from '@/lib/everts-calc/local-store'
import { verzamelCalculatieSnapshot } from '@/lib/everts-calc/sync-utils'
import { bewaarCalculatieSnapshot } from '@/app/(platform)/everts-calc/actions/sync'
import { nieuweId } from '@/lib/everts-calc/utils'
import { scenarioDefaultOpslag } from '@/lib/everts-calc/calculations'
import type { Scenario } from '@/lib/everts-calc/types'

/** Familie-anker van een scenario (root = v1 in de keten). */
export function versieRootVan(scenario: Scenario): string {
  return scenario.versie_root_id ?? scenario.id
}

/** Alle versies (scenario's) van dezelfde familie, oplopend op versie. */
export function versiesVanFamilie(projectId: string, rootId: string): Scenario[] {
  return getScenarios(projectId)
    .filter(s => versieRootVan(s) === rootId)
    .sort((a, b) => (a.versie ?? 1) - (b.versie ?? 1))
}

/** Strip een bestaande `-vN`-suffix van een offertenummer. */
function basisNummer(nummer: string | null | undefined): string {
  return String(nummer ?? '').replace(/-v\d+$/, '')
}

/**
 * Reviseert een (verzonden) calculatie: maakt een verse, bewerkbare kopie als
 * volgende versie in de familie. De kopie heeft nog géén offerte. Retourneert
 * het nieuwe scenario (of null als de bron niet bestaat).
 */
export async function reviseerCalculatie(
  projectId: string,
  scenarioId: string
): Promise<Scenario | null> {
  const bron = getScenario(scenarioId)
  if (!bron) return null

  const rootId = versieRootVan(bron)
  const familie = versiesVanFamilie(projectId, rootId)
  const nieuweVersie = Math.max(1, ...familie.map(s => s.versie ?? 1)) + 1
  const basis = basisNummer(bron.nummer)
  const nieuwNummer = basis ? `${basis}-v${nieuweVersie}` : null

  const kopie = kopieerScenario(scenarioId, bron.naam)
  if (!kopie) return null

  const nieuw: Scenario = {
    ...kopie,
    nummer: nieuwNummer,
    versie: nieuweVersie,
    versie_root_id: rootId,
    bevroren_op: null,
  }
  slaScenarioOp(nieuw)

  // Deel de nieuwe versie meteen met de server (gedeelde blob).
  await bewaarCalculatieSnapshot(projectId, verzamelCalculatieSnapshot(projectId))

  return nieuw
}

// ─── Meerwerk-calculaties (scenario in het dossier-project, apart gemarkeerd) ──

/**
 * De actuele meerwerk-calculatie van een meerwerkregel binnen een project. Ook een
 * meerwerk-calculatie kan gereviseerd worden; er staan dan meerdere scenario's voor
 * dezelfde regel in het project. De hoogste versie is de actuele.
 */
export function vindMeerwerkScenario(projectId: string, meerwerkRegelId: string): Scenario | undefined {
  return getScenarios(projectId)
    .filter(s => s.meerwerk_regel_id === meerwerkRegelId)
    .sort((a, b) => (b.versie ?? 1) - (a.versie ?? 1))[0]
}

/**
 * Maakt een verse meerwerk-calculatie (scenario) in het dossier-project, gemarkeerd met
 * `meerwerk_regel_id` zodat hij niet als contractversie meetelt maar in een eigen blok
 * verschijnt. Geen `is_standaard`. Persisteert meteen naar de gedeelde snapshot (net als
 * reviseren) zodat de calculatie op elk apparaat zichtbaar is. Idempotent: bestaat er al
 * een meerwerk-scenario voor deze regel, dan wordt dat teruggegeven.
 */
export async function maakMeerwerkScenario(
  projectId: string,
  meerwerkRegelId: string,
  naam: string,
): Promise<Scenario> {
  const bestaand = vindMeerwerkScenario(projectId, meerwerkRegelId)
  if (bestaand) return bestaand

  const inst = getInstellingen()
  const favorietTarief = inst.uurtarieven?.find(t => t.is_favoriet)?.tarief
  // Meerwerk volgt de opslag van de hoofdcalculatie; anders zou meerwerk stilzwijgend
  // een ander percentage krijgen dan het werk waar het bij hoort.
  const scenarios = getScenarios(projectId)
  const hoofd = scenarios.find(s => s.is_standaard) ?? scenarios[0]
  const nieuw: Scenario = {
    id: nieuweId(),
    project_id: projectId,
    naam,
    is_standaard: false,
    meerwerk_regel_id: meerwerkRegelId,
    opslag_pct: scenarioDefaultOpslag(hoofd),
    btw_pct_default: 21,
    standaard_uurtarief: favorietTarief,
  }
  slaScenarioOp(nieuw)
  await bewaarCalculatieSnapshot(projectId, verzamelCalculatieSnapshot(projectId))
  return nieuw
}
