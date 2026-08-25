/**
 * VCA-acties: formulier-taken waarvan het formulier de KAM/VGM-vlag draagt.
 *
 * Dun laagje bovenop lib/formulieren/formulier-taken.ts, dat de gedeelde query
 * en de valkuilen daaromheen bevat. Hier alleen de VCA-afbakening en de
 * volgorde waarin het KAM/VGM-dashboard en het VCA-tab ze willen tonen.
 */

import { getFormulierTaken, type FormulierTaak } from '@/lib/formulieren/formulier-taken'

export type VcaActie = FormulierTaak

/** De VCA-acties van de opgegeven dossiers, gegroepeerd per dossier. */
export async function getVcaActiesPerDossier(
  dossierIds: string[],
): Promise<Map<string, VcaActie[]>> {
  const acties = await getFormulierTaken({ dossierIds, alleenKamVgm: true })

  const perDossier = new Map<string, VcaActie[]>()
  for (const actie of acties) {
    const lijst = perDossier.get(actie.dossier_id)
    if (lijst) lijst.push(actie)
    else perDossier.set(actie.dossier_id, [actie])
  }

  // Openstaand bovenaan, daarbinnen op deadline (zonder deadline achteraan).
  for (const lijst of perDossier.values()) {
    lijst.sort((a, b) => {
      if ((a.status === 'gereed') !== (b.status === 'gereed')) return a.status === 'gereed' ? 1 : -1
      if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
      if (a.deadline) return -1
      if (b.deadline) return 1
      return a.titel.localeCompare(b.titel)
    })
  }

  return perDossier
}

/** Dezelfde acties voor één dossier. */
export async function getVcaActies(dossierId: string): Promise<VcaActie[]> {
  const perDossier = await getVcaActiesPerDossier([dossierId])
  return perDossier.get(dossierId) ?? []
}
