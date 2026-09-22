'use client'

/**
 * Welke fase stelt EVA voor, en wat staat een keuze in de weg?
 *
 * Los van het scherm omdat het één regel uitdrukt die verder nergens staat: **de categorie beslist over de servicedesk, niet de mailsoort en
 * niet de behandelaar.** Servicedesk is in heel EVA een afleiding uit "Dagelijks
 * onderhoud" en "Mutatie" (zie `isServicedeskDossier` en `getDossiersVoorServicedesk`),
 * en `mapBouw7NaarEvaStatus` dwingt die twee categorieën bij elke sync-ronde terug
 * naar de servicedeskladder.
 *
 * Daarom is een fase die daarmee botst geen voorkeur maar een fout: hij houdt het
 * hooguit tot de eerstvolgende sync, en dan verschuift het dossier zonder melding.
 * `proefAanmaak` maakt er een blokkade van; dit bestand zet dezelfde regel
 * vóór de klik in beeld, want een blokkade die pas na het drukken verschijnt zegt
 * niet wáár je het moet oplossen.
 */

import React from 'react'

import {
  faseVoorstelVoor, isServicedeskCategorie, SERVICEDESK_CATEGORIEEN, type DossierFase,
} from '@/components/dossiers/fase-plaatsing'

export { faseVoorstelVoor }

/** Wat er aan elke keuze in de weg staat, in gewone taal. Leeg als er niets speelt. */
export function faseBezwarenVoor(categorieNaam: string | null): Partial<Record<DossierFase, string>> {
  if (!isServicedeskCategorie(categorieNaam)) {
    return {
      servicedesk:
        `Kies eerst categorie ${SERVICEDESK_CATEGORIEEN.join(' of ')}; ` +
        'daar herkent EVA een servicedeskbon aan.',
    }
  }
  const uitleg =
    `Categorie "${categorieNaam}" hoort bij de servicedesk; ` +
    'de Bouw7-sync zet het dossier daar alsnog neer.'
  return { aanvraag: uitleg, opdracht: uitleg }
}

/**
 * De fasekeuze als toestand: het voorstel, wat eraan in de weg staat, en het
 * moment waarop de behandelaar het overneemt.
 *
 * `aangeraakt` is het hele punt. Zonder die vlag zou het voorstel elke keer dat de
 * categorie wijzigt de handmatige keuze overschrijven, en dan kun je niet meer van
 * de afleiding afwijken.
 */
export function useFase(categorieNaam: string | null, mailSoort: string | null) {
  const [fase, setFaseRuw] = React.useState<DossierFase>('aanvraag')
  const [aangeraakt, setAangeraakt] = React.useState(false)

  const voorstel = faseVoorstelVoor(categorieNaam, mailSoort)
  const bezwaar = faseBezwarenVoor(categorieNaam)

  React.useEffect(() => {
    if (aangeraakt) return
    setFaseRuw(voorstel)
  }, [voorstel, aangeraakt])

  const setFase = React.useCallback((v: DossierFase) => {
    setFaseRuw(v)
    setAangeraakt(true)
  }, [])

  return { fase, setFase, bezwaar }
}
