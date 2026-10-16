/**
 * Controle vóór de offerte: wat moet er nog gebeuren, en wat moet je even nakijken.
 *
 * Pure functie over de calculatie zoals hij in het werkgeheugen staat, zodat de
 * werkbalk (tellers), het controlepaneel en stap 1 van het offertevenster precies
 * hetzelfde zien. Twee niveaus:
 *
 *  - `blokkeert` — zonder oplossing geen offerte (arbeid zonder tarief, geen
 *    betalingsconditie of voorwaarden);
 *  - `nakijken`  — zichtbaar, blokkeert niet. Per regel weg te klikken met "Klopt";
 *    die bevestiging wordt per calculatieversie bewaard (`Scenario.controle_bevestigd`).
 */

import type { Calculatieregel, Componentregel, Groep } from './types'
import { isTekstregel } from './types'
import { heeftEigenTarief } from './calculatietarief'
import { formatEuro } from './calculations'

export type ControleNiveau = 'blokkeert' | 'nakijken'

export type ControleSoort =
  | 'arbeid_zonder_tarief'
  | 'geen_voorwaarden'
  | 'marge_laag'
  | 'stelpost'
  | 'meetstaat_zonder_behandeling'
  | 'regel_zonder_prijs'
  | 'gemarkeerd'
  | 'eigen_uurtarief'

export interface ControlePunt {
  /** Uniek per punt; ook de sleutel waaronder "Klopt" wordt bewaard. */
  sleutel: string
  soort: ControleSoort
  niveau: ControleNiveau
  titel: string
  /** Groep waar de regel in staat, of een korte toelichting. */
  detail?: string
  regelId?: string
  /** Kan met "Klopt" weggeklikt worden. */
  bevestigbaar: boolean
  bevestigd: boolean
}

/** Onder deze marge (in % van de verkoopprijs) vraagt de controle om na te kijken. */
export const MARGE_DREMPEL = 12

export const SOORT_LABEL: Record<ControleSoort, string> = {
  arbeid_zonder_tarief:         'Uren zonder uurtarief',
  geen_voorwaarden:             'Voorwaarden',
  marge_laag:                   'Marge',
  stelpost:                     'Stelposten',
  meetstaat_zonder_behandeling: 'Schilderwerk zonder behandeling',
  regel_zonder_prijs:           'Regels zonder prijs',
  gemarkeerd:                   'Gemarkeerde regels',
  eigen_uurtarief:              'Eigen uurtarief',
}

export interface ControleInvoer {
  groepen: Groep[]
  regels: Calculatieregel[]
  componenten: Componentregel[]
  kostprijs: number
  verkoopprijs: number
  /** Betalingsconditie én algemene voorwaarden gekozen (en niet gearchiveerd). */
  voorwaardenGekozen: boolean
  /** Interne begroting: gaat niet naar de klant, voorwaarden zijn dan niet nodig. */
  zonderVoorwaarden?: boolean
  bevestigd?: string[]
  /** Uurtarief van de calculatie; arbeidsnormen met een ander tarief komen ter controle. */
  calculatietarief?: number
}

export function controleerCalculatie(invoer: ControleInvoer): ControlePunt[] {
  const { groepen, regels, componenten, kostprijs, verkoopprijs } = invoer
  const bevestigd = new Set(invoer.bevestigd ?? [])
  const groepNaam = new Map(groepen.map(g => [g.id, g.naam]))
  const compsPerRegel = new Map<string, Componentregel[]>()
  for (const c of componenten) {
    const lijst = compsPerRegel.get(c.calculatieregel_id)
    if (lijst) lijst.push(c)
    else compsPerRegel.set(c.calculatieregel_id, [c])
  }

  const punten: ControlePunt[] = []
  const nakijken = (soort: ControleSoort, regel: Calculatieregel, bevestigbaar = true, toelichting?: string) => {
    const sleutel = `${soort}:${regel.id}`
    const groep = groepNaam.get(regel.groep_id)
    punten.push({
      sleutel, soort, niveau: 'nakijken', bevestigbaar,
      titel: regel.omschrijving || '(zonder omschrijving)',
      detail: toelichting ? [groep, toelichting].filter(Boolean).join(' · ') : groep,
      regelId: regel.id,
      bevestigd: bevestigbaar && bevestigd.has(sleutel),
    })
  }

  const posten = [...regels]
    .filter(r => !isTekstregel(r))
    .sort((a, b) => a.volgorde - b.volgorde)

  for (const regel of posten) {
    const comps = compsPerRegel.get(regel.id) ?? []

    // Uren zonder tarief tellen stil voor € 0 mee.
    const urenZonderTarief = comps.some(c => c.type === 'arbeid' && c.norm_hoeveelheid !== 0 && !c.tarief)
    if (urenZonderTarief) {
      punten.push({
        sleutel: `arbeid_zonder_tarief:${regel.id}`, soort: 'arbeid_zonder_tarief', niveau: 'blokkeert',
        titel: regel.omschrijving || '(zonder omschrijving)', detail: groepNaam.get(regel.groep_id),
        regelId: regel.id, bevestigbaar: false, bevestigd: false,
      })
    }

    if (regel.is_stelpost) nakijken('stelpost', regel)

    // Een eigen tarief is vaak bewust (een uitvoerder met een ander uurloon), maar moet
    // wél gezien worden: de calculator klikt het weg met Klopt.
    const calcTarief = invoer.calculatietarief ?? 0
    const eigen = comps.filter(c => heeftEigenTarief(c, calcTarief))
    if (eigen.length > 0) {
      const tarieven = [...new Set(eigen.map(c => formatEuro(c.tarief)))].join(', ')
      nakijken('eigen_uurtarief', regel, true, `${tarieven}/u, calculatie ${formatEuro(calcTarief)}/u`)
    }

    // Een markering (⚑) betekent "hier moet nog iemand naar kijken". Niet weg te klikken
    // met Klopt: de oplossing is de markering opheffen, anders blijft de regel oranje.
    if (regel.gemarkeerd) nakijken('gemarkeerd', regel, false, regel.opmerking?.split('\n')[0].trim() || undefined)

    const uitMeetstaat = !!regel.meetstaat_aggregaat_id || !!regel.bestekcode
    if (uitMeetstaat && !regel.schilderbehandeling_id && !regel.schilderbehandeling) {
      nakijken('meetstaat_zonder_behandeling', regel)
    }

    // Wel een hoeveelheid, maar geen enkele prijs: de post staat voor € 0 in de offerte.
    const heeftPrijs = comps.some(c => c.norm_hoeveelheid !== 0 && !!c.tarief)
    if (regel.hoeveelheid !== 0 && !heeftPrijs && !regel.is_stelpost && !urenZonderTarief) {
      nakijken('regel_zonder_prijs', regel)
    }
  }

  if (!invoer.zonderVoorwaarden && !invoer.voorwaardenGekozen) {
    punten.push({
      sleutel: 'geen_voorwaarden', soort: 'geen_voorwaarden', niveau: 'blokkeert',
      titel: 'Nog geen betalingscondities en algemene voorwaarden gekozen',
      bevestigbaar: false, bevestigd: false,
    })
  }

  if (verkoopprijs > 0) {
    const marge = ((verkoopprijs - kostprijs) / verkoopprijs) * 100
    if (marge < MARGE_DREMPEL) {
      punten.push({
        sleutel: 'marge_laag', soort: 'marge_laag', niveau: 'nakijken',
        titel: `Marge ${marge.toFixed(1).replace('.', ',')}%, onder ${MARGE_DREMPEL}%`,
        detail: 'Zichtbaar ter controle; houdt de offerte niet tegen.',
        bevestigbaar: false, bevestigd: false,
      })
    }
  }

  return punten
}

/** Rood = blokkeert; oranje = nakijken en nog niet met "Klopt" bevestigd. */
export function telControle(punten: ControlePunt[]): { rood: number; oranje: number } {
  let rood = 0, oranje = 0
  for (const p of punten) {
    if (p.niveau === 'blokkeert') rood++
    else if (!p.bevestigd) oranje++
  }
  return { rood, oranje }
}

/** Zet of haalt een "Klopt"-bevestiging weg; geeft de nieuwe lijst terug. */
export function wisselBevestiging(bevestigd: string[] | undefined, sleutel: string): string[] {
  const lijst = bevestigd ?? []
  return lijst.includes(sleutel) ? lijst.filter(s => s !== sleutel) : [...lijst, sleutel]
}
