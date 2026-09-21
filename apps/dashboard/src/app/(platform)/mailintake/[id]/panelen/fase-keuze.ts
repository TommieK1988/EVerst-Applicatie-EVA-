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
  isServicedeskCategorie, SERVICEDESK_CATEGORIEEN, type IntakeFase,
} from '@/lib/mailintake/types'

/**
 * De fase die bij dit bericht past.
 *
 * Volgorde is de rangorde: de categorie wint van de mailsoort. Daarna telt de soort
 * mee -- een bon zonder offerte vooraf hoort meteen in de opdrachtfase, en niet als
 * aanvraag die nog geprijsd moet worden.
 */
export function faseVoorstelVoor(
  categorieNaam: string | null,
  mailSoort: string | null,
): IntakeFase {
  if (isServicedeskCategorie(categorieNaam)) return 'servicedesk'
  if (mailSoort === 'servicedeskbon') return 'servicedesk'
  if (mailSoort === 'opdrachtbon') return 'opdracht'
  return 'aanvraag'
}

/** Wat er aan elke keuze in de weg staat, in gewone taal. Leeg als er niets speelt. */
export function faseBezwarenVoor(categorieNaam: string | null): Partial<Record<IntakeFase, string>> {
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
  const [fase, setFaseRuw] = React.useState<IntakeFase>('aanvraag')
  const [aangeraakt, setAangeraakt] = React.useState(false)

  const voorstel = faseVoorstelVoor(categorieNaam, mailSoort)
  const bezwaar = faseBezwarenVoor(categorieNaam)

  React.useEffect(() => {
    if (aangeraakt) return
    setFaseRuw(voorstel)
  }, [voorstel, aangeraakt])

  const setFase = React.useCallback((v: IntakeFase) => {
    setFaseRuw(v)
    setAangeraakt(true)
  }, [])

  return { fase, setFase, bezwaar }
}
