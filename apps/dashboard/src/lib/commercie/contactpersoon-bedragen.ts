import 'server-only'

/**
 * Bedragen bij de dossiers van één contactpersoon, met dezelfde rekenregels als de rest van
 * EVA — zodat het getal op de telefoon niet afwijkt van het bord of het Informatie-tab:
 *
 * - **Aanvraag, offerte, opdracht** — `berekenKaartBedrag`, de regel van de kanbankaarten
 *   (aanneemsom + goedgekeurd meerwerk + stelposten + opties; in de offertefase de
 *   EVA-calculatie, in de opdrachtfase het contractbedrag).
 * - **Lopende servicedeskbon** — het contracttotaal van de Verkoop-tab. Op een regiebon zit de
 *   waarde in de geboekte regie, en die kent alleen die berekening.
 * - **Afgeronde servicedeskbon** — het gefactureerde bedrag. Het contracttotaal kost zo'n
 *   twintig lezingen per bon en een contactpersoon heeft er tot vijftig; wat gefactureerd is,
 *   is bij een afgeronde bon bovendien het getal dat ertoe doet.
 */

import { createAdminClient } from '@everts/database/server'
import { laadKaartBedragen } from '@/lib/dossiers/kaart-bedragen'
import { berekenContracttotalen } from '@/lib/dossiers/contracttotaal-bereken'
import { gefactureerdPerDossier } from '@/lib/relaties/dossiers'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import type { DossierRij } from '@/components/dossiers/types'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import { isAfgerond, type ContactDossier } from './contactpersoon-groepen'

/**
 * Hoeveel lopende bonnen we hooguit doorrekenen. Gemeten okt 2026: de drukste contactpersoon
 * heeft er 13 lopend; de bovengrens houdt een uitschieter van de laadtijd af.
 */
const MAX_LOPENDE_BONNEN = 25
const GELIJKTIJDIG = 4

/** Kolommen die `berekenKaartBedrag` en `opRegie` lezen. */
const BEDRAG_KOLOMMEN = `id, hoofdstatus, servicedesk_substatus, bedrag_excl_btw, kostprijs_excl_btw,
  offerte_verstuurd_aantal, offerte_verstuurd_som_excl_btw, mandaat_bedrag, facturatiemethode,
  facturatiemethode_handmatig, bouw7_categorie_naam, everts_calc_project_id`

export async function metBedragen(dossiers: RelatieDossier[]): Promise<ContactDossier[]> {
  if (dossiers.length === 0) return []
  const supabase = createAdminClient()
  const ids = dossiers.map(d => d.id)

  const sdLopend = dossiers
    .filter(d => d.servicedesk_substatus && !isAfgerond(d))
    .map(d => d.id)
    .slice(0, MAX_LOPENDE_BONNEN)
  const sdAfgerond = dossiers
    .filter(d => d.servicedesk_substatus && isAfgerond(d))
    .map(d => d.id)

  // Begrensd door de ids: de drukste contactpersoon heeft er ruim vijftig.
  const { data } = await supabase.from('dossiers').select(BEDRAG_KOLOMMEN).in('id', ids)
  type Ruw = { id: string; everts_calc_project_id: string | null } & Record<string, unknown>
  const ruw = (data ?? []) as unknown as Ruw[]

  const [kaartVelden, contracttotalen, gefactureerd] = await Promise.all([
    laadKaartBedragen(ruw.map(r => ({ id: r.id, everts_calc_project_id: r.everts_calc_project_id }))),
    berekenContracttotalen(sdLopend, GELIJKTIJDIG),
    gefactureerdPerDossier(supabase, sdAfgerond),
  ])

  const bedragPer = new Map<string, number | null>()
  for (const r of ruw) {
    if (r.servicedesk_substatus) {
      if (gefactureerd.has(r.id)) { bedragPer.set(r.id, gefactureerd.get(r.id) || null); continue }
      // Zonder contracttotaal (afgerond, of boven de bovengrens) geeft de servicedeskregel null —
      // liever geen bedrag dan een benadering die van de Verkoop-tab afwijkt.
      const ct = contracttotalen[r.id]
      // `berekenKaartBedrag` leest maar een handvol velden; een volledige `DossierRij` bouwen
      // zou dertig kolommen kosten zonder dat er iets mee gebeurt.
      // De EVA-offerte gaat mee: een bon zonder opdracht valt terug op het offertebedrag.
      const rij = { ...r, ...(kaartVelden.get(r.id) ?? {}), contracttotaal: ct } as unknown as DossierRij
      bedragPer.set(r.id, ct === undefined ? null : berekenKaartBedrag(rij, 'servicedesk').totaalExclBtw)
      continue
    }
    const rij = { ...r, ...(kaartVelden.get(r.id) ?? {}) } as unknown as DossierRij
    const sectie = r.hoofdstatus === 'opdracht' ? 'opdracht' : r.hoofdstatus === 'offerte' ? 'offerte' : 'aanvraag'
    bedragPer.set(r.id, berekenKaartBedrag(rij, sectie).totaalExclBtw)
  }

  return dossiers.map(d => ({ ...d, bedragExclBtw: bedragPer.get(d.id) ?? null }))
}
