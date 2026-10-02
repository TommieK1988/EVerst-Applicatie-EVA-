import 'server-only'

/**
 * Bedragen bij een lijst dossiers — de contactpersoonkaart en het klantbeeld — met dezelfde
 * rekenregels als de rest van EVA, zodat het getal op de telefoon niet afwijkt van het bord of
 * het Informatie-tab:
 *
 * - **Aanvraag, offerte, opdracht** — `berekenKaartBedrag`, de regel van de kanbankaarten
 *   (aanneemsom + goedgekeurd meerwerk + stelposten + opties; in de offertefase de
 *   EVA-calculatie, in de opdrachtfase het contractbedrag).
 * - **Afgeronde servicedeskbon** — het gefactureerde bedrag.
 * - **Lopende servicedeskbon** — het contracttotaal van de Verkoop-tab; op een regiebon zit de
 *   waarde in de geboekte regie, en die kent alleen die berekening. Dat kost zo'n twintig
 *   lezingen per bon: bij de drukste opdrachtgever (36 lopende bonnen) liep de pagina daarmee
 *   acht seconden vast. Daarom zit hij níet in `metBedragen` maar in
 *   `berekenServicedeskBedragen`, die het scherm na de eerste weergave ophaalt — zoals het
 *   servicedeskbord ook doet.
 */

import { createAdminClient } from '@everts/database/server'
import { laadKaartBedragen, ID_BLOK, type KaartBedragVelden } from '@/lib/dossiers/kaart-bedragen'
import { berekenContracttotalen } from '@/lib/dossiers/contracttotaal-bereken'
import { bepaalFase, FASE_KOLOMMEN, type FaseVelden } from '@/lib/dossiers/fase'
import { gefactureerdPerDossier } from '@/lib/relaties/dossiers'
import { berekenKaartBedrag } from '@/components/dossiers/kaart-bedrag'
import type { DossierRij } from '@/components/dossiers/types'
import type { RelatieDossier } from '@/lib/relaties/dossiers-types'
import { isAfgerond } from './contactpersoon-groepen'
import type { DossierMetBedrag } from './klantbeeld-types'

/**
 * Hoeveel lopende bonnen één aanroep hooguit doorrekent. Gemeten okt 2026: de drukste
 * contactpersoon heeft er 13 lopend, de drukste opdrachtgever 36. Ook een grens tegen misbruik:
 * de action is als kale RPC aan te roepen.
 */
export const MAX_LOPENDE_BONNEN = 40
const GELIJKTIJDIG = 6

/** Kolommen die `berekenKaartBedrag`, `opRegie` en `bepaalFase` lezen. */
const BEDRAG_KOLOMMEN = `id, ${FASE_KOLOMMEN}, bedrag_excl_btw, kostprijs_excl_btw,
  offerte_verstuurd_aantal, offerte_verstuurd_som_excl_btw, mandaat_bedrag, facturatiemethode,
  facturatiemethode_handmatig, bouw7_categorie_naam, everts_calc_project_id`

type Ruw = FaseVelden & { id: string; everts_calc_project_id: string | null } & Record<string, unknown>

/** De bedragkolommen plus de EVA-eigen bedragen, voor een begrensde lijst ids. */
async function leesBedragRijen(
  ids: string[],
): Promise<{ ruw: Ruw[]; kaartVelden: Map<string, KaartBedragVelden> }> {
  const supabase = createAdminClient()
  // In blokken: een `.in()` over honderden uuid's wordt een URL die PostgREST weigert, en het
  // klantbeeld van een grote beheerder komt daar in de buurt.
  const blokken: string[][] = []
  for (let i = 0; i < ids.length; i += ID_BLOK) blokken.push(ids.slice(i, i + ID_BLOK))
  const ruw = (await Promise.all(blokken.map(async blok => {
    const { data } = await supabase.from('dossiers').select(BEDRAG_KOLOMMEN).in('id', blok)
    return (data ?? []) as unknown as Ruw[]
  }))).flat()
  const kaartVelden = await laadKaartBedragen(
    ruw.map(r => ({ id: r.id, everts_calc_project_id: r.everts_calc_project_id })),
  )
  return { ruw, kaartVelden }
}

/**
 * `berekenKaartBedrag` leest maar een handvol velden; een volledige `DossierRij` bouwen zou
 * dertig kolommen kosten zonder dat er iets mee gebeurt.
 */
const alsRij = (r: Ruw, velden: KaartBedragVelden | undefined, extra: object = {}): DossierRij =>
  ({ ...r, ...(velden ?? {}), ...extra }) as unknown as DossierRij

/**
 * Bedrag per dossier. Lopende servicedeskbonnen krijgen hier `null` — die vult het scherm
 * daarna aan via `berekenServicedeskBedragen`.
 */
export async function metBedragen(dossiers: RelatieDossier[]): Promise<DossierMetBedrag[]> {
  if (dossiers.length === 0) return []

  const sdAfgerond = dossiers.filter(d => d.servicedesk_substatus && isAfgerond(d)).map(d => d.id)
  const [{ ruw, kaartVelden }, gefactureerd] = await Promise.all([
    leesBedragRijen(dossiers.map(d => d.id)),
    gefactureerdPerDossier(createAdminClient(), sdAfgerond),
  ])

  const bedragPer = new Map<string, number | null>()
  for (const r of ruw) {
    if (r.servicedesk_substatus) {
      bedragPer.set(r.id, gefactureerd.get(r.id) || null)
      continue
    }
    const sectie = r.hoofdstatus === 'opdracht' ? 'opdracht' : r.hoofdstatus === 'offerte' ? 'offerte' : 'aanvraag'
    bedragPer.set(r.id, berekenKaartBedrag(alsRij(r, kaartVelden.get(r.id)), sectie).totaalExclBtw)
  }

  return dossiers.map(d => ({ ...d, bedragExclBtw: bedragPer.get(d.id) ?? null }))
}

/**
 * Contracttotaal van de lopende servicedeskbonnen onder `ids`. Andere dossiers worden
 * overgeslagen — de rij bepaalt zelf of het een lopende bon is, niet de aanroeper. Een bon
 * zonder contracttotaal valt terug op zijn offertebedrag (zelfde regel als het bord), en
 * anders `null`: liever geen bedrag dan een benadering die van de Verkoop-tab afwijkt.
 */
export async function berekenServicedeskBedragen(ids: string[]): Promise<Record<string, number | null>> {
  const uniek = [...new Set(ids)].slice(0, MAX_LOPENDE_BONNEN)
  if (uniek.length === 0) return {}

  const { ruw, kaartVelden } = await leesBedragRijen(uniek)
  const lopend = ruw.filter(r => r.servicedesk_substatus && bepaalFase(r) === 'servicedesk')
  const contracttotalen = await berekenContracttotalen(lopend.map(r => r.id), GELIJKTIJDIG)

  const uit: Record<string, number | null> = {}
  for (const r of lopend) {
    const rij = alsRij(r, kaartVelden.get(r.id), { contracttotaal: contracttotalen[r.id] ?? null })
    uit[r.id] = berekenKaartBedrag(rij, 'servicedesk').totaalExclBtw
  }
  return uit
}
