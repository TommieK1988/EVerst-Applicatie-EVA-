'use client'

import toast from 'react-hot-toast'
import { updateDossierSubstatus } from '@/lib/dossiers/actions'
import { ververseSubstatussenActie } from '@/app/(platform)/instellingen/integraties/actions'
import type { DossierSubstatus } from './types'

/**
 * Substatus wijzigen mét afhandeling van het Bouw7-conflict — gedeeld door de statuskiezer op de
 * Informatie-tab en de kanban, zodat beide dezelfde uitweg bieden.
 *
 * De aanvraag-/offerte-substatus staat in een maatwerkveld dat EVA deelt met een tweede app op
 * Bouw7. Wijkt de waarde daar af van wat EVA vóór deze wijziging had, dan schrijft EVA niet en
 * gaat ook de EVA-wijziging niet door (zie `lib/bouw7/substatus-attr.ts`). Dat is terecht wanneer
 * de ander zojuist iets wijzigde, maar het was tot nu toe een doodlopende weg: de melding kon
 * óók betekenen dat EVA ooit vooruitliep zonder write-through, en dan bleef elke volgende poging
 * hangen op dezelfde botsing. Vandaar de expliciete keuze:
 *
 *  - **Bouw7 volgen** — de stand daar overnemen in EVA (één lichte read) en niets overschrijven;
 *  - **Toch overschrijven** — opnieuw schrijven met `forceerBouw7`, wat de check uitzet.
 */
export async function wijzigSubstatusMetConflict(opties: {
  dossierId: string
  substatus: DossierSubstatus
  /** Fase van het dossier — bepaalt welke lijst we verversen als de gebruiker Bouw7 volgt. */
  sectie: 'aanvraag' | 'offerte' | 'opdracht' | 'servicedesk'
  bevestig: (o: {
    titel: string
    omschrijving?: string
    bevestigLabel?: string
    annuleerLabel?: string
    destructief?: boolean
  }) => Promise<boolean>
}): Promise<{ ok: boolean }> {
  const { dossierId, substatus, sectie, bevestig } = opties

  const res = await updateDossierSubstatus(dossierId, substatus, { schrijfBouw7: true })

  if (res.ok) {
    if (res.bouw7 && !res.bouw7.ok) {
      toast.error(`Bijgewerkt in EVA, maar terugschrijven naar Bouw7 mislukt: ${res.bouw7.error}`)
    }
    return { ok: true }
  }

  if (!res.conflict) {
    toast.error(res.error)
    return { ok: false }
  }

  const overschrijven = await bevestig({
    titel: 'In Bouw7 staat een andere substatus',
    omschrijving:
      `Bouw7 heeft nu "${res.conflict.bouw7Label}". Dat kan betekenen dat iemand daar zojuist iets `
      + 'wijzigde, of dat EVA eerder is vooruitgelopen zonder dat het is teruggeschreven.\n\n'
      + 'Volg Bouw7 om die stand over te nemen, of overschrijf hem met jouw keuze.',
    bevestigLabel: 'Toch overschrijven',
    annuleerLabel: 'Bouw7 volgen',
  })

  if (!overschrijven) {
    // Bouw7 volgen: de lichte verse read haalt het maatwerkveld op en zet EVA gelijk.
    if (sectie === 'aanvraag' || sectie === 'offerte') {
      const ververs = await ververseSubstatussenActie(sectie)
      toast[ververs.ok ? 'success' : 'error'](
        ververs.ok ? 'Stand uit Bouw7 overgenomen.' : `Ophalen uit Bouw7 mislukt: ${ververs.error}`,
      )
    }
    return { ok: false }
  }

  const forceer = await updateDossierSubstatus(dossierId, substatus, {
    schrijfBouw7: true,
    forceerBouw7: true,
  })
  if (!forceer.ok) {
    toast.error(forceer.error)
    return { ok: false }
  }
  if (forceer.bouw7 && !forceer.bouw7.ok) {
    toast.error(`Bijgewerkt in EVA, maar terugschrijven naar Bouw7 mislukt: ${forceer.bouw7.error}`)
    return { ok: true }
  }
  toast.success('Substatus overschreven in EVA en Bouw7.')
  return { ok: true }
}
