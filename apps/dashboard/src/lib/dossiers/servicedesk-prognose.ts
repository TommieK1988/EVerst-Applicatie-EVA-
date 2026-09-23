/**
 * dossiers/servicedesk-prognose.ts
 *
 * De prognose van een servicedeskbon: wat verwachten we dat dit gaat kosten?
 *
 * WAAROM DIT BESTAAT
 * Op een opdracht komt de prognose uit de werkbegroting: die schrijft per bewakingscode een
 * "niet/anders begroot"-bedrag naar Bouw7, en daar rekent het Management Dashboard zijn
 * `totale_prognose` en de marge mee uit. Een servicedeskbon hééft geen werkbegroting — een bon
 * van een paar honderd euro eerst laten begroten kost meer tijd dan het werk zelf — en stond
 * daardoor altijd op een prognose van nul. Elke bon zag er in het dashboard uit alsof hij geen
 * kosten zou maken, en zodra de eerste factuur binnenkwam alsof hij volledig uit de hand liep.
 *
 * WAT DIT DOET
 * Is er een calculatie aan de bon gekoppeld, dan is de gecalculeerde kostprijs de beste
 * voorspelling die er is; die gaat als prognose naar de bewakingscode van de bon. Is er geen
 * calculatie, dan blijft de prognose leeg — een verzonnen getal is erger dan geen getal.
 *
 * WAAR HIJ VANDAAN WORDT AANGEROEPEN
 * Bij "Offerte akkoord" op een bon: dat is het moment waarop de calculatie van een voorstel een
 * afspraak wordt. Herstel je daarna de calculatie, dan zet dezelfde knop de prognose opnieuw.
 */

import { createAdminClient } from '@everts/database/server'
import { logFout, foutNaarInvoer } from '@/lib/fouten/log'
import { isServicedeskDossier } from '@/components/dossiers/types'
import { zorgVoorRegieBewakingscode } from './regie-bewakingscode'

export type PrognoseOvernameResultaat =
  /** De prognose staat in Bouw7. `bedrag` is wat erheen ging. */
  | { ok: true; gezet: true; bedrag: number; code: string }
  /** Niets gedaan, en waarom niet. Geen fout: de meeste bonnen horen hier te eindigen. */
  | { ok: true; gezet: false; reden: string }
  | { ok: false; error: string }

const DOSSIER_VELDEN =
  'id, bouw7_id, facturatiemethode, bouw7_categorie_naam, categorie, servicedesk_substatus, ' +
  'everts_calc_project_id, regie_bewakingscode'

type Rij = {
  id: string
  bouw7_id: string | null
  facturatiemethode: string | null
  bouw7_categorie_naam: string | null
  categorie: string | null
  servicedesk_substatus: string | null
  everts_calc_project_id: string | null
  regie_bewakingscode: string | null
}

/**
 * Neemt de gecalculeerde kostprijs over als prognose op de bewakingscode van de bon.
 *
 * Idempotent: de prognose-write is een absolute waarde, geen optelling, dus twee keer draaien
 * levert hetzelfde bedrag op. Verandert de calculatie, dan overschrijft een volgende ronde het
 * oude getal.
 *
 * **Alleen bonnen die op regie afrekenen.** Die hebben één opvangcode (`RW01`) waar alles op
 * binnenkomt, en dat is precies de plek voor één prognosebedrag. Een bon die aangenomen afrekent
 * heeft zonder werkbegroting helemaal geen bewakingscode; daar is geen plek om het bedrag neer te
 * zetten zonder eerst een codestructuur te verzinnen. Zo'n bon krijgt hier een reden terug in
 * plaats van een prognose.
 */
export async function neemPrognoseOverUitCalculatie(
  dossierId: string,
): Promise<PrognoseOvernameResultaat> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('dossiers').select(DOSSIER_VELDEN).eq('id', dossierId).maybeSingle()
  if (error) return { ok: false, error: error.message }
  const d = data as Rij | null
  if (!d) return { ok: false, error: 'Bon niet gevonden.' }

  if (!isServicedeskDossier(d)) return { ok: true, gezet: false, reden: 'Geen servicedeskbon.' }
  if (!d.bouw7_id) return { ok: true, gezet: false, reden: 'Niet aan een Bouw7-project gekoppeld.' }
  if (d.facturatiemethode !== 'regie') {
    return { ok: true, gezet: false, reden: 'Deze bon rekent aangenomen af en heeft geen opvangcode.' }
  }
  if (!d.everts_calc_project_id) {
    return { ok: true, gezet: false, reden: 'Er hangt geen calculatie aan deze bon.' }
  }

  const kostprijs = await gecalculeerdeKostprijs(d.everts_calc_project_id)
  if (kostprijs == null) {
    return { ok: true, gezet: false, reden: 'De calculatie heeft nog geen offerte met regels.' }
  }
  if (kostprijs <= 0) {
    // Nul is geen voorspelling maar een lege calculatie. De bestaande prognose laten staan is dan
    // beter dan hem met nul overschrijven.
    return { ok: true, gezet: false, reden: 'De calculatie komt op een kostprijs van nul uit.' }
  }

  // De code moet bestaan vóór er een prognose op kan. Staat hij er al, dan doet dit niets.
  const codeRes = await zorgVoorRegieBewakingscode(dossierId)
  if (!codeRes.ok) return { ok: false, error: codeRes.error }
  // `== null` en niet `!code`: een lege string zou TypeScript niet naar de "geen code"-variant
  // laten narrowen, en dan is `reden` er niet.
  if (codeRes.code == null) return { ok: true, gezet: false, reden: codeRes.reden }

  const { maakRegieBewakingscodeBouw7 } = await import('@/app/(platform)/everts-calc/actions/werkbegroting')
  const { REGIE_BEWAKINGSCODE_NAAM } = await import('@/components/dossiers/types')

  const res = await maakRegieBewakingscodeBouw7(dossierId, {
    code: codeRes.code,
    naam: REGIE_BEWAKINGSCODE_NAAM,
    bedrag: kostprijs,
  })
  if (!res.ok) return { ok: false, error: res.error }
  if (!res.prognoseGezet) {
    return { ok: true, gezet: false, reden: res.waarschuwing ?? 'Bouw7 nam de prognose niet aan.' }
  }
  return { ok: true, gezet: true, bedrag: kostprijs, code: codeRes.code }
}

/**
 * Hetzelfde, maar het mag mislukken zonder dat de aanroeper eraan onderdoorgaat.
 *
 * Bedoeld voor de knop "Offerte akkoord": die heeft op het moment dat dit draait al vastgelegd dat
 * de klant akkoord is. Struikelt Bouw7 over de prognose, dan hoort dat akkoord niet alsnog als
 * fout te eindigen — de prognose is bij te werken, het akkoord niet opnieuw te geven.
 */
export async function neemPrognoseOverStil(dossierId: string): Promise<void> {
  try {
    const res = await neemPrognoseOverUitCalculatie(dossierId)
    if (!res.ok) {
      await logFout(foutNaarInvoer(new Error(res.error), {
        omgeving: 'server', bron: 'servicedesk/prognose-overnemen',
      }))
    }
  } catch (e) {
    await logFout(foutNaarInvoer(e, { omgeving: 'server', bron: 'servicedesk/prognose-overnemen' }))
  }
}

/** De kostprijs uit de hoofdofferte van de calculatie, of `null` als die er nog niet is. */
async function gecalculeerdeKostprijs(projectId: string): Promise<number | null> {
  try {
    const { getQuoteTotalenVoorProject } = await import('@/app/(platform)/everts-calc/actions/quotes')
    const totalen = await getQuoteTotalenVoorProject(projectId)
    return totalen?.kostprijs ?? null
  } catch {
    return null
  }
}
