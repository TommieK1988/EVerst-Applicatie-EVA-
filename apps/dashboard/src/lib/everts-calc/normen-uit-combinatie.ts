/**
 * normen-uit-combinatie.ts — De componentregels (arbeid, materiaal, onderaanneming)
 * van een calculatieregel opbouwen uit een combinatie in de Schilderwerkbibliotheek.
 *
 * Gedeeld door de meetstaat-sync en het koppelen van een behandeling (op één regel of
 * per bestekscode), zodat alle drie precies dezelfde normen neerzetten. Arbeid rekent
 * met het uurtarief van de calculatie, niet met dat uit de bibliotheek.
 */

import type { Calculatieregel, Componentregel } from './types'
import type { SchilderCombinatie } from './services/schilderwerk'
import { getComponentregels, slaComponentregelOp, verwijderComponentregel } from './local-store'
import { nieuweId } from './utils'

/** De componentregels die bij deze combinatie horen. Normen zonder kosten vallen weg. */
export function componentregelsUitCombinatie(
  calculatieregelId: string,
  combinatie: Pick<SchilderCombinatie, 'arbeid_normen' | 'materiaal_normen'>,
): Componentregel[] {
  const regels: Componentregel[] = []

  for (const n of combinatie.arbeid_normen) {
    if (n.cost_per_unit <= 0) continue
    regels.push({
      id: nieuweId(),
      calculatieregel_id: calculatieregelId,
      type: 'arbeid',
      norm_hoeveelheid: n.minutes_per_unit / 60,
      // Bewust 0: bij opslaan vult de store het uurtarief van déze calculatie in
      // (standaardUurtarief). Het tarief uit de bibliotheek is van toen de norm werd
      // gemaakt; per regel mag je daarna afwijken.
      tarief: 0,
      omschrijving: n.omschrijving ?? undefined,
    })
  }

  for (const n of combinatie.materiaal_normen) {
    if (n.cost_per_unit <= 0 || n.norm_type === 'onderaanneming') continue
    regels.push({
      id: nieuweId(),
      calculatieregel_id: calculatieregelId,
      type: 'materieel',
      norm_hoeveelheid: n.quantity_per_unit,
      tarief: n.unit_price,
      eenheid: (n.eenheid ?? undefined) as Calculatieregel['eenheid'] | undefined,
      omschrijving: n.naam ?? undefined,
    })
  }

  for (const n of combinatie.materiaal_normen) {
    if (n.cost_per_unit <= 0 || n.norm_type !== 'onderaanneming') continue
    regels.push({
      id: nieuweId(),
      calculatieregel_id: calculatieregelId,
      type: 'onderaanneming',
      norm_hoeveelheid: 1,
      tarief: n.unit_price,
      omschrijving: n.naam ?? undefined,
    })
  }

  return regels
}

/** Vervangt de componentregels van een calculatieregel door die uit de combinatie. */
export function vervangNormenUitCombinatie(
  calculatieregelId: string,
  combinatie: Pick<SchilderCombinatie, 'arbeid_normen' | 'materiaal_normen'>,
): void {
  getComponentregels(calculatieregelId).forEach(c => verwijderComponentregel(c.id))
  componentregelsUitCombinatie(calculatieregelId, combinatie).forEach(slaComponentregelOp)
}
