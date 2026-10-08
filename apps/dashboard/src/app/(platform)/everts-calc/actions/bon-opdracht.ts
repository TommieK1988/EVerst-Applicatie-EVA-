'use server'

/**
 * Opdrachten van een servicedeskbon die accordering nodig hebben.
 *
 * Een bon heeft geen Werkbegroting-tab (zie `servicedesk-tabs.ts`), maar boven de inkoopdrempel
 * moet een opdracht wél geaccordeerd zijn (`lib/goedkeuring/inkoop.ts`). Het bestelvenster
 * stuurde de regels eerst naar Bouw7 en liep pas dáárna op die poort vast. Op 20267.00636 leverde
 * dat drie keer dezelfde opdracht van € 7.990 op in Bouw7 en geen enkel contract: de knop om
 * accordering aan te vragen stond op een scherm dat de bon niet laat zien.
 *
 * Nu legt het venster de opdracht vast en vraagt het accordering aan vóórdat er iets naar Bouw7
 * gaat. De opdracht blijft als concept op de bon staan (`getOpenBonOpdrachten`), en na het akkoord
 * maak je hem daar af (`maakBonOpdrachtVanConcept`) — met precies de gegevens die je al had
 * ingevuld. Onder water lopen alle stappen door de bestaande acties, zodat de poortwachters op
 * één plek blijven: `maakBestellingInBouw7` controleert de accordering zelf nog een keer.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisSessie } from '@/lib/auth/rechten'
import { inkoopAccorderingVereist } from '@/lib/goedkeuring/inkoop'
import { berekenWerkbegrotingStatus } from '@/lib/goedkeuring/werkbegroting-status'
import { bepaalBeoordelingsRoute, haalBeoordelaar } from '@/lib/goedkeuring/beoordelaars'
import { vraagGoedkeuringAan } from '@/lib/goedkeuring/actions'
import type { BeoordelaarRef } from '@/lib/goedkeuring/types'
import { bestellingBedrag } from '@/lib/everts-calc/calculations'
import type { WerkbegrotingBestelling, WerkbegrotingComponent } from '@/lib/everts-calc/types'
import {
  syncWerkbegrotingNaarSupabase, syncBestellingenNaarSupabase, laadWerkbegrotingSnapshot,
  stuurWerkbegrotingBestelregelsBouw7, type WerkbegrotingPayload,
} from './werkbegroting'
import { maakBestellingInBouw7, verwijderBestellingUitEva, type MaakBestellingResultaat } from './bestellingen'

/** Zie `NIETS_GEZIEN` in BestelVenster: de sync zet dan niets op verwijderd wat niet meekomt. */
const NIETS_GEZIEN = '1970-01-01T00:00:00.000Z'

const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export type BonAccordering =
  /** Geen accordering nodig, of al geaccordeerd: door naar Bouw7. */
  | { ok: true; status: 'vrij' }
  | { ok: true; status: 'aangevraagd'; beoordelaarNaam: string | null; drempel: number | null; bedrag: number; waarschuwing: string | null }
  /** Het dossier heeft geen controller: de aanvrager kiest wie beoordeelt. */
  | { ok: true; status: 'kies'; directie: BeoordelaarRef[]; drempel: number | null; bedrag: number }
  | { ok: false; error: string }

/** Moet deze opdracht geaccordeerd worden, en is dat al gebeurd? */
async function accorderingNodig(
  werkbegrotingId: string,
  componenten: WerkbegrotingComponent[],
): Promise<{ nodig: boolean; drempel: number | null; bedrag: number }> {
  const bedrag = bestellingBedrag(componenten)
  const acc = await inkoopAccorderingVereist(werkbegrotingId, bedrag)
  if (!acc.vereist) return { nodig: false, drempel: acc.drempel, bedrag }
  const status = await berekenWerkbegrotingStatus(werkbegrotingId)
  const goedgekeurd = new Map(status.regels.map(r => [r.regel_id, r.goedgekeurd]))
  const regelIds = [...new Set(componenten.map(c => c.werkbegroting_regel_id))]
  return { nodig: regelIds.some(id => goedgekeurd.get(id) !== true), drempel: acc.drempel, bedrag }
}

async function vraagAan(opts: {
  dossierId: string
  werkbegrotingId: string
  omschrijving: string
  bedrag: number
  drempel: number | null
  beoordelaarId: string | null
}): Promise<BonAccordering> {
  const res = await vraagGoedkeuringAan({
    objectType: 'werkbegroting',
    objectId: opts.werkbegrotingId,
    dossierId: opts.dossierId,
    toelichting: `Opdracht "${opts.omschrijving}" van ${euro(opts.bedrag)} op deze servicedeskbon.`,
    beoordelaarId: opts.beoordelaarId,
  })
  if (!res.ok) {
    if (res.keuzeNodig) {
      const route = await bepaalBeoordelingsRoute(opts.dossierId)
      return { ok: true, status: 'kies', directie: route.directie, drempel: opts.drempel, bedrag: opts.bedrag }
    }
    return { ok: false, error: res.error }
  }
  return {
    ok: true, status: 'aangevraagd', beoordelaarNaam: res.beoordelaarNaam,
    drempel: opts.drempel, bedrag: opts.bedrag, waarschuwing: res.waarschuwing,
  }
}

/**
 * Vanuit het bestelvenster, vóór de stap naar Bouw7: de opdracht vastleggen en, als dat moet,
 * accordering aanvragen. Bij `vrij` gaat het venster gewoon door zoals altijd.
 *
 * Vastleggen gebeurt ook als er niets aan te vragen valt — dat doet `maakBestellingInBouw7`
 * straks toch, en zo staat de opdracht op de bon als de stap naar Bouw7 halverwege misgaat.
 */
export async function accorderingVoorBonOpdracht(
  dossierId: string,
  payload: WerkbegrotingPayload,
  bestelling: WerkbegrotingBestelling,
  beoordelaarId: string | null = null,
): Promise<BonAccordering> {
  await vereisSessie()

  const sync = await syncWerkbegrotingNaarSupabase(payload)
  if (!sync.gelukt) return { ok: false, error: `Opslaan mislukt: ${sync.fout}` }
  const bSync = await syncBestellingenNaarSupabase([bestelling])
  if (!bSync.gelukt) return { ok: false, error: `Opdracht opslaan mislukt: ${bSync.fout}` }

  // Deze twee schrijft de gewone sync bewust niet (zie syncBestellingenNaarSupabase); zonder
  // ze zou een opdracht die op akkoord wacht zijn mandaat en opmaak kwijtraken.
  // `maakBestellingInBouw7` valideert het sjabloon alsnog bij het aanmaken.
  // `mandaat_bedrag` ontbreekt nog in de gegenereerde types; de kolom bestaat wel.
  const extra: { sjabloon_id: string | null } = {
    sjabloon_id: bestelling.sjabloon_id ?? null,
    ...{ mandaat_bedrag: bestelling.mandaat_bedrag ?? null },
  }
  await createAdminClient().from('werkbegroting_bestellingen').update(extra).eq('id', bestelling.id)

  const ids = new Set(bestelling.component_ids)
  const componenten = payload.componenten.filter(c => ids.has(c.id) && !c.is_verwijderd)
  const acc = await accorderingNodig(payload.wb.id, componenten)
  if (!acc.nodig) return { ok: true, status: 'vrij' }

  return vraagAan({
    dossierId, werkbegrotingId: payload.wb.id, omschrijving: bestelling.omschrijving,
    bedrag: acc.bedrag, drempel: acc.drempel, beoordelaarId,
  })
}

export type OpenBonOpdracht = {
  id: string
  omschrijving: string
  relatieNaam: string | null
  soort: 'oa_contract' | 'inkooporder' | null
  bedrag: number
  /**
   * `klaar`: kan naar Bouw7. `wacht`: ligt bij de beoordelaar. `aanvragen`: accordering nodig
   * maar niet (meer) aangevraagd — nooit gedaan, of teruggestuurd.
   */
  staat: 'klaar' | 'wacht' | 'aanvragen'
  beoordelaarNaam: string | null
  /** Opmerking van de beoordelaar bij terugsturen. */
  teruggestuurd: string | null
}

/**
 * Opdrachten op deze bon die nog niet in Bouw7 staan. Bewust kale queries in plaats van
 * `laadWerkbegrotingSnapshot`: dit draait bij elke keer dat de bon opent, en die functie haalt
 * eerst nog meerwerk naar de werkbegroting.
 */
export async function getOpenBonOpdrachten(dossierId: string): Promise<OpenBonOpdracht[]> {
  await vereisSessie()
  const db = createAdminClient()

  const { data: wb } = await db.from('werkbegrotingen').select('id')
    .eq('dossier_id', dossierId).order('bijgewerkt_op', { ascending: false }).limit(1).maybeSingle()
  if (!wb) return []

  const { data: bestellingen } = await db.from('werkbegroting_bestellingen')
    .select('id, omschrijving, relatie_id, soort')
    .eq('werkbegroting_id', wb.id)
    .is('bouw7_contract_id', null)
    .is('verstuurd_op', null)
    .order('aangemaakt_op')
  if (!bestellingen || bestellingen.length === 0) return []

  const { data: koppels } = await db.from('werkbegroting_bestelling_regels')
    .select('bestelling_id, component_id').in('bestelling_id', bestellingen.map(b => b.id))
  const compIds = [...new Set((koppels ?? []).map(k => k.component_id))]
  const { data: compRijen } = compIds.length > 0
    ? await db.from('werkbegroting_componenten')
        .select('id, werkbegroting_regel_id, norm_hoeveelheid, tarief, is_verwijderd').in('id', compIds)
    : { data: [] }
  const compById = new Map((compRijen ?? []).map(c => [c.id, c]))

  const relatieIds = [...new Set(bestellingen.map(b => b.relatie_id).filter((x): x is string => !!x))]
  const { data: relaties } = relatieIds.length > 0
    ? await db.from('relaties').select('id, naam').in('id', relatieIds)
    : { data: [] }
  const relatieNaam = new Map((relaties ?? []).map(r => [r.id, r.naam as string | null]))

  const { data: rondes } = await db.from('goedkeuringen')
    .select('id, status, beoordelaar_id, ronde')
    .eq('object_type', 'werkbegroting').eq('object_id', wb.id)
    .order('ronde', { ascending: false }).limit(1)
  const laatste = rondes?.[0] ?? null
  const beoordelaar = laatste?.status === 'aangevraagd' && laatste.beoordelaar_id
    ? await haalBeoordelaar(laatste.beoordelaar_id) : null
  let teruggestuurd: string | null = null
  if (laatste?.status === 'afgekeurd') {
    const { data: opm } = await db.from('goedkeuring_opmerkingen').select('tekst')
      .eq('goedkeuring_id', laatste.id).order('created_at', { ascending: false }).limit(1).maybeSingle()
    teruggestuurd = opm?.tekst ?? 'Teruggestuurd door de beoordelaar.'
  }

  const status = await berekenWerkbegrotingStatus(wb.id)
  const goedgekeurd = new Map(status.regels.map(r => [r.regel_id, r.goedgekeurd]))

  const uit: OpenBonOpdracht[] = []
  for (const b of bestellingen) {
    const comps = (koppels ?? [])
      .filter(k => k.bestelling_id === b.id)
      .map(k => compById.get(k.component_id))
      .filter((c): c is NonNullable<typeof c> => !!c && !c.is_verwijderd)
    // Een bestelling waarvan alles is weggehaald, is geen opdracht meer.
    if (comps.length === 0) continue
    const bedrag = comps.reduce((s, c) => s + Number(c.norm_hoeveelheid ?? 0) * Number(c.tarief ?? 0), 0)
    const acc = await inkoopAccorderingVereist(wb.id, bedrag)
    const alles = comps.every(c => goedgekeurd.get(c.werkbegroting_regel_id) === true)
    const staat: OpenBonOpdracht['staat'] = !acc.vereist || alles
      ? 'klaar'
      : laatste?.status === 'aangevraagd' ? 'wacht' : 'aanvragen'
    uit.push({
      id: b.id,
      omschrijving: b.omschrijving ?? '',
      relatieNaam: b.relatie_id ? relatieNaam.get(b.relatie_id) ?? null : null,
      soort: (b.soort as OpenBonOpdracht['soort']) ?? null,
      bedrag,
      staat,
      beoordelaarNaam: staat === 'wacht' ? beoordelaar?.naam ?? null : null,
      teruggestuurd: staat === 'aanvragen' ? teruggestuurd : null,
    })
  }
  return uit
}

/** De opdracht met precies de componenten en regels die erbij horen, uit Supabase. */
async function laadConcept(dossierId: string, bestellingId: string): Promise<
  | { ok: true; bestelling: WerkbegrotingBestelling; payload: WerkbegrotingPayload }
  | { ok: false; error: string }
> {
  const snap = await laadWerkbegrotingSnapshot(dossierId)
  const b = snap?.bestellingen.find(x => x.id === bestellingId)
  if (!snap || !b) return { ok: false, error: 'Deze opdracht bestaat niet meer.' }
  if (b.bouw7_contract_id != null) return { ok: false, error: 'Deze opdracht staat al in Bouw7.' }

  // Het mandaat neemt de snapshot niet mee.
  // `select('*')` omdat `mandaat_bedrag` nog niet in de gegenereerde types staat.
  const { data: rij } = await createAdminClient().from('werkbegroting_bestellingen')
    .select('*').eq('id', bestellingId).maybeSingle()
  const mandaat = (rij as Record<string, unknown> | null)?.mandaat_bedrag
  const bestelling: WerkbegrotingBestelling = {
    ...b, mandaat_bedrag: mandaat != null ? Number(mandaat) : null,
  }

  const ids = new Set(b.component_ids)
  const componenten = snap.componenten.filter(c => ids.has(c.id))
  const regelIds = new Set(componenten.map(c => c.werkbegroting_regel_id))
  return {
    ok: true,
    bestelling,
    payload: {
      wb: snap.wb,
      regels: snap.regels.filter(r => regelIds.has(r.id)),
      componenten,
      wijzigingen: [],
      dossierId,
      geladenOp: NIETS_GEZIEN,
    },
  }
}

/** Accordering aanvragen voor een opdracht die al op de bon staat. */
export async function vraagAccorderingVoorBonConcept(
  dossierId: string,
  bestellingId: string,
  beoordelaarId: string | null = null,
): Promise<BonAccordering> {
  await vereisSessie()
  const c = await laadConcept(dossierId, bestellingId)
  if (!c.ok) return c
  const acc = await accorderingNodig(c.payload.wb.id, c.payload.componenten.filter(x => !x.is_verwijderd))
  if (!acc.nodig) return { ok: true, status: 'vrij' }
  return vraagAan({
    dossierId, werkbegrotingId: c.payload.wb.id, omschrijving: c.bestelling.omschrijving,
    bedrag: acc.bedrag, drempel: acc.drempel, beoordelaarId,
  })
}

export type BonOpdrachtAangemaakt =
  | (MaakBestellingResultaat & { ok: true; bestelling: WerkbegrotingBestelling })
  | Extract<MaakBestellingResultaat, { ok: false }>

/**
 * Een opdracht die op de bon wachtte alsnog als concept in Bouw7 zetten: eerst de bestelregels,
 * dan het contract — dezelfde twee stappen als het bestelvenster.
 */
export async function maakBonOpdrachtVanConcept(
  dossierId: string,
  bestellingId: string,
): Promise<BonOpdrachtAangemaakt> {
  await vereisSessie()
  const c = await laadConcept(dossierId, bestellingId)
  if (!c.ok) return { ok: false, reden: 'fout', error: c.error }
  const { bestelling, payload } = c

  // Wacht hij nog op akkoord, dan hier stoppen — vóór er bestelregels naar Bouw7 gaan.
  const acc = await accorderingNodig(payload.wb.id, payload.componenten.filter(x => !x.is_verwijderd))
  if (acc.nodig) {
    return { ok: false, reden: 'niet_goedgekeurd', error: 'Deze opdracht is nog niet geaccordeerd.' }
  }

  const push = await stuurWerkbegrotingBestelregelsBouw7(dossierId, payload)
  for (const comp of payload.componenten) {
    const lineId = push.lineIdPerComponent[comp.id]
    if (lineId != null) comp.bouw7_line_id = lineId
    if (push.gewisteComponenten.includes(comp.id)) delete comp.bouw7_line_id
  }
  if (!push.ok) return { ok: false, reden: 'fout', error: `Bestelregels naar Bouw7 sturen mislukt: ${push.error}` }

  const res = await maakBestellingInBouw7(dossierId, bestelling, payload)
  if (!res.ok) return res
  return { ...res, bestelling: { ...bestelling, bouw7_contract_id: res.contractId, bouw7_nummer: res.nummer } }
}

/**
 * Een opdracht die niet doorgaat van de bon halen. De regels gaan in de werkbegroting op
 * verwijderd, en stonden ze al als bestelregel in Bouw7, dan zet de push ze daar op nul — anders
 * blijven ze als verwachte kosten op de kostengroep staan.
 */
export async function gooiBonConceptWeg(
  dossierId: string,
  bestellingId: string,
): Promise<{ ok: true; waarschuwing: string | null } | { ok: false; error: string }> {
  await vereisSessie()
  const snap = await laadWerkbegrotingSnapshot(dossierId)
  const b = snap?.bestellingen.find(x => x.id === bestellingId)
  if (!snap || !b) return { ok: true, waarschuwing: null }
  if (b.bouw7_contract_id != null) return { ok: false, error: 'Deze opdracht staat al in Bouw7. Trek hem daar eerst in.' }

  const ids = new Set(b.component_ids)
  const componenten = snap.componenten.filter(c => ids.has(c.id)).map(c => ({ ...c, is_verwijderd: true }))
  // Een regel gaat alleen weg als al zijn componenten bij deze opdracht horen; anders blijft hij
  // staan voor de rest.
  const regelIds = new Set(componenten.map(c => c.werkbegroting_regel_id))
  const regels = snap.regels
    .filter(r => regelIds.has(r.id))
    .map(r => {
      const eigen = snap.componenten.filter(c => c.werkbegroting_regel_id === r.id && !c.is_verwijderd)
      return eigen.every(c => ids.has(c.id)) ? { ...r, is_verwijderd: true } : r
    })
  const payload: WerkbegrotingPayload = {
    wb: snap.wb, regels, componenten, wijzigingen: [], dossierId, geladenOp: NIETS_GEZIEN,
  }

  let waarschuwing: string | null = null
  if (componenten.some(c => c.bouw7_line_id != null)) {
    const push = await stuurWerkbegrotingBestelregelsBouw7(dossierId, payload)
    if (!push.ok) waarschuwing = `De bestelregels in Bouw7 zijn niet op nul gezet: ${push.error}`
  } else {
    const sync = await syncWerkbegrotingNaarSupabase(payload)
    if (!sync.gelukt) return { ok: false, error: `Opslaan mislukt: ${sync.fout}` }
  }

  const weg = await verwijderBestellingUitEva(dossierId, bestellingId)
  if (!weg.ok) return { ok: false, error: weg.error }
  return { ok: true, waarschuwing }
}
