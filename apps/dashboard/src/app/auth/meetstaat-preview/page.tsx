'use client'

/**
 * Voorbeeldpagina van de meetstaat, met verzonnen gegevens.
 *
 * WAAROM DIT BESTAAT
 * De echte meetstaat zit achter een login én een calculatie met meetregels. Daardoor
 * werd de opmaak niet nagekeken, terwijl juist daar fouten zitten die geen type-check
 * vangt: een kolom die buiten beeld valt, een label dat afkapt, een rij die niet op
 * het raster ligt.
 *
 * WAAROM HET ÉCHTE SCHERM
 * Deze pagina rendert `MeetstaaatHoofdscherm` zelf; het werkgeheugen wordt gevuld met
 * een verzonnen calculatie. Een nagebouwde kopie zou meteen gaan afwijken.
 *
 * Opslaan en verwerken doen niets zinnigs: daarvoor is een sessie nodig. Dit is om
 * naar te kíjken. Bereikbaar zonder in te loggen omdat `middleware.ts` alles onder
 * `/auth/` overslaat.
 */

import React from 'react'

import { DialoogProvider } from '@/components/ui/dialogen'
import MeetstaaatHoofdscherm from '@/components/everts-calc/meetstaat/MeetstaaatHoofdscherm'
import {
  hydrateCalculatie, getMeetregelAggregaten, slaMeetregelAggregaatOp, slaCalculatieregelOp,
} from '@/lib/everts-calc/local-store'
import { herbouwAggregaten, sleutelVanAggregaat } from '@/lib/everts-calc/meetstaat-utils'
import type { Meetregel, Groep, Calculatieregel } from '@/lib/everts-calc/types'

const PROJECT = 'voorbeeld-project'
const SCENARIO = 'voorbeeld-scenario'
const MEETSTAAT = 'voorbeeld-meetstaat'
const NU = '2026-10-14T09:00:00.000Z'

const SCHILDER = {
  onderdelen: [
    { id: 'o-kozijn', naam: 'Houten kozijn', code: '001' },
    { id: 'o-raam', naam: 'Houten raam', code: '002' },
    { id: 'o-deur', naam: 'Houten deur', code: '008' },
    { id: 'o-boei', naam: 'Boeidelen', code: '014' },
    { id: 'o-gevel', naam: 'Gevelbetimmering', code: '020' },
  ],
  types: [
    { id: 't-kozijn', onderdeel_id: 'o-kozijn', naam: '10-20 cm', eenheid: 'm¹', formule: null, code: 'khB' },
    { id: 't-raam', onderdeel_id: 'o-raam', naam: 'draaiend', eenheid: 'm²', formule: null, code: 'rdr' },
    { id: 't-deur', onderdeel_id: 'o-deur', naam: 'paneeldeur', eenheid: 'm²', formule: null, code: 'dpa' },
    { id: 't-boei', onderdeel_id: 'o-boei', naam: '20-30 cm', eenheid: 'm¹', formule: null, code: 'bo2' },
    { id: 't-gevel', onderdeel_id: 'o-gevel', naam: 'rabat', eenheid: 'm²', formule: null, code: 'gra' },
  ],
  behandelingen: [],
  combinaties: [],
}

const GROEPEN: Groep[] = [
  { id: 'g-voor', scenario_id: SCENARIO, parent_id: null, naam: 'Voorgevel', niveau: 1, volgorde: 1 },
  { id: 'g-achter', scenario_id: SCENARIO, parent_id: null, naam: 'Achtergevel', niveau: 1, volgorde: 2 },
  { id: 'g-kop', scenario_id: SCENARIO, parent_id: null, naam: 'Kopgevel rechts', niveau: 1, volgorde: 3 },
]

let n = 0
const regel = (groep_id: string, x: Partial<Meetregel>): Meetregel => ({
  id: `mr-${++n}`, meetstaat_id: MEETSTAAT, groep_id, volgorde: n * 10, aantal: 1, eenheid: 'm²',
  is_leeg: false, aangepast_op: NU, ...x,
})
const kozijn = { onderdeel: 'Houten kozijn', onderdeel_id: 'o-kozijn', type: '10-20 cm', type_id: 't-kozijn', eenheid: 'm¹', bestekcode: 'S-01' }
const raam = { onderdeel: 'Houten raam', onderdeel_id: 'o-raam', type: 'draaiend', type_id: 't-raam', eenheid: 'm²', bestekcode: 'S-02' }

const MEETREGELS: Meetregel[] = [
  regel('g-voor', { element: 'K1 woonkamer', ...kozijn, breedte: 2.4, breedte_aantal: 2, hoogte: 1.6, hoogte_aantal: 2, aantal: 12 }),
  regel('g-voor', { element: 'K1 woonkamer', ...raam, breedte: 1.1, hoogte: 1.2, aantal: 12 }),
  regel('g-voor', { element: 'K2 slaapkamer', ...kozijn, breedte: 1.2, breedte_aantal: 2, hoogte: 1.4, hoogte_aantal: 2, aantal: 12 }),
  regel('g-voor', { element: 'K2 slaapkamer', ...raam, breedte: 0.9, hoogte: 1.1, factor: 2, aantal: 12 }),
  regel('g-voor', { element: 'Voordeur', onderdeel: 'Houten deur', onderdeel_id: 'o-deur', type: 'paneeldeur', type_id: 't-deur', bestekcode: 'S-03', breedte: 0.93, hoogte: 2.15, factor: 2, aantal: 12, opmerking: 'Beide zijden' }),
  regel('g-voor', { element: 'Dakrand', onderdeel: 'Boeidelen', onderdeel_id: 'o-boei', type: '20-30 cm', type_id: 't-boei', eenheid: 'm¹', bestekcode: 'S-04', breedte: 42.5 }),
  regel('g-voor', { element: 'Topgevel', onderdeel: 'Gevelbetimmering', onderdeel_id: 'o-gevel', type: 'rabat', type_id: 't-gevel', bestekcode: 'S-05', breedte: 12.6 }),
  regel('g-achter', { element: 'K3 keuken', ...kozijn, breedte: 1.8, breedte_aantal: 2, hoogte: 1.2, hoogte_aantal: 2, aantal: 12 }),
]

/** Vult het werkgeheugen en zet een paar codes 'in de calculatie': gelijk, gewijzigd, vervallen. */
function vulWerkgeheugen() {
  hydrateCalculatie(PROJECT, {
    scenarios: [{ id: SCENARIO, project_id: PROJECT, naam: 'Calculatie', is_standaard: true, versie: 1 }],
    groepen: GROEPEN,
    regels: [],
    componenten: [],
    meetstaten: [{ id: MEETSTAAT, project_id: PROJECT, scenario_id: SCENARIO, naam: 'Opname gevels', code: 'MS-2026-001', status: 'gesynchroniseerd', aangemaakt_op: NU, aangepast_op: NU }],
    meetregels: MEETREGELS,
    meetregel_aggregaten: [],
  })
  herbouwAggregaten(MEETSTAAT)

  const inCalculatie = (sleutelDeel: string, hoeveelheid: number, groep_id: string, omschrijving: string) => {
    const agg = getMeetregelAggregaten(MEETSTAAT).find(a => a.groep_id === groep_id && sleutelVanAggregaat(a).includes(sleutelDeel))
    const id = `cr-${groep_id}-${sleutelDeel}`
    slaCalculatieregelOp({ id, groep_id, omschrijving, hoeveelheid, eenheid: 'm¹', volgorde: 0 } as Calculatieregel)
    if (agg) slaMeetregelAggregaatOp({ ...agg, calculatieregel_id: id, is_gesynchroniseerd: true })
  }
  inCalculatie('S-01', 158.4, 'g-voor', 'Houten kozijn - 10-20 cm')       // gelijk
  inCalculatie('S-04', 38, 'g-voor', 'Boeidelen - 20-30 cm')               // gewijzigd
  inCalculatie('S-01', 72, 'g-achter', 'Houten kozijn - 10-20 cm')         // gelijk

  // Een code waarvan alle meetregels verwijderd zijn, maar die nog in de calculatie staat.
  slaCalculatieregelOp({ id: 'cr-hwa', groep_id: 'g-voor', omschrijving: 'Hemelwaterafvoer - zink', hoeveelheid: 18, eenheid: 'm¹', volgorde: 0 } as Calculatieregel)
  slaMeetregelAggregaatOp({
    id: 'agg-hwa', meetstaat_id: MEETSTAAT, groep_id: 'g-voor', onderdeel: 'Hemelwaterafvoer', type: 'zink',
    behandeling: '', bestekcode: 'S-06', totaal_hoeveelheid: 0, eenheid: 'm¹', calculatieregel_id: 'cr-hwa',
    is_gesynchroniseerd: true, aangepast_op: NU,
  })
}

export default function MeetstaatVoorbeeld() {
  const [klaar, setKlaar] = React.useState(false)
  React.useEffect(() => { vulWerkgeheugen(); setKlaar(true) }, [])

  return (
    <DialoogProvider>
      <div className="eva" style={{ background: 'var(--bg)', height: '100vh' }}>
        {klaar && (
          <MeetstaaatHoofdscherm
            projectId={PROJECT}
            scenarioId={SCENARIO}
            schilderData={SCHILDER}
            printKop={{ nummer: '20261.00639', naam: 'VvE Laan van Meerdervoort 412–480 (voorbeeld)' }}
            ingebed
            terug="/auth/meetstaat-preview"
          />
        )}
      </div>
    </DialoogProvider>
  )
}
