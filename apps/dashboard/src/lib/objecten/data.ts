'use server'

/**
 * Leeslaag voor objectenbeheer.
 *
 * Alles hier gebruikt de admin-client (service-role) en is dus alleen aanroepbaar
 * achter een `vereisRecht`-gate in de aanroepende page/action.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import type { VastgoedObject, VastgoedObjectRol, Hoofdstatus } from '@everts/database'
import { VASTGOED_OBJECT_ROLLEN } from '@everts/database'
import { adresWijktAf, objectAdresRegel } from './adres'
import type { RelatieObject } from './types'

const rond = (n: number): number => Math.round(n * 100) / 100

/**
 * Fase zoals de gebruiker hem kent. `hoofdstatus` kent alleen aanvraag/offerte/opdracht;
 * "servicedesk" en "afgesloten" zijn overlays daarbovenop — zelfde redenering als
 * `isActiefDossier` in `lib/dossiers/actief.ts`, waar dit de bron van waarheid is.
 */
export type ObjectFase = 'aanvraag' | 'offerte' | 'opdracht' | 'servicedesk' | 'afgesloten'

type FaseVelden = {
  hoofdstatus: Hoofdstatus
  offerte_substatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  gearchiveerd: boolean | null
}

/** Offertestatussen waarna er niets meer loopt — gelijk aan `isActiefDossier`. */
const OFFERTE_EIND = new Set(['gewonnen', 'verloren', 'vervallen'])

function bepaalFase(d: FaseVelden): ObjectFase {
  if (d.gearchiveerd === true) return 'afgesloten'
  if (d.hoofdstatus === 'opdracht' && d.opdracht_substatus === 'financieel_afgesloten') return 'afgesloten'
  if (d.servicedesk_substatus) {
    return d.servicedesk_substatus === 'financieel_gereed' ? 'afgesloten' : 'servicedesk'
  }
  // Een gewonnen offerte is inmiddels een opdracht, een verloren of vervallen offerte is
  // afgehandeld — in beide gevallen loopt er niets meer op dit dossier.
  if (d.hoofdstatus === 'offerte' && OFFERTE_EIND.has(d.offerte_substatus ?? '')) return 'afgesloten'
  return d.hoofdstatus
}

/** Kolommen die `bepaalFase` nodig heeft — één plek, zodat de selects niet uit elkaar lopen. */
const FASE_KOLOMMEN = 'hoofdstatus, offerte_substatus, opdracht_substatus, servicedesk_substatus, gearchiveerd'

/**
 * Jaar waarin het dossier is ontstaan.
 *
 * `created_at` is uitdrukkelijk de laatste keus: dat is de dag waarop de bulk-sync het dossier
 * in EVA zette. Van de 174 gekoppelde dossiers vallen die datums op slechts 14 dagen, dus
 * daarop groeperen zou een verzonnen jaarverdeling geven. `bouw7_aanmaakdatum` is de echte
 * aanmaakdatum van het project en is overal gevuld.
 */
function jaarVan(d: { bouw7_aanmaakdatum: string | null; aanvraagdatum: string | null; created_at: string }): number | null {
  const bron = d.bouw7_aanmaakdatum ?? d.aanvraagdatum ?? d.created_at
  const jaar = Number(String(bron ?? '').slice(0, 4))
  return Number.isFinite(jaar) && jaar > 1990 ? jaar : null
}

/** Objectrij zoals het overzicht hem toont: het object plus een paar afgeleide tellingen. */
export type ObjectRij = VastgoedObject & {
  opdrachtgever_naam: string | null
  aantal_dossiers: number
}

export type ObjectDossier = {
  id: string
  dossiernummer: string | null
  titel: string
  hoofdstatus: Hoofdstatus
  fase: ObjectFase
  bedrag_excl_btw: number | null
  kostprijs_excl_btw: number | null
  werkadres_straat: string | null
  werkadres_huisnummer: string | null
  werkadres_postcode: string | null
  werkadres_stad: string | null
  klant_naam: string | null
  updated_at: string
  /** Werkadres wijkt aantoonbaar af van het object — meestal een wijziging in Bouw7. */
  adres_wijkt_af: boolean
}

/** Eén staaf in het jaaroverzicht. */
export type ObjectJaar = { jaar: number; aantal: number }

export type ObjectTotalen = {
  aantalDossiers: number
  aantalPerFase: Record<ObjectFase, number>
  /**
   * Gefactureerd excl. btw, opgeteld over de gekoppelde dossiers.
   *
   * Bron: `management_projecten.gefactureerd` (Athena `revenue.realised`) — dezelfde waarde
   * die het Management-dashboard gebruikt, zodat de twee schermen niet uit elkaar lopen.
   * Die tabel bevat alléén opdrachten en servicedeskdossiers; een aanvraag of offerte is
   * nog niet gefactureerd, dus dat klopt.
   */
  gefactureerdExcl: number
  /**
   * Dossiers dié gefactureerd horen te zijn maar nog geen regel in `management_projecten`
   * hebben — die tabel wordt door een eigen sync gevuld en kan achterlopen. Zonder dit
   * getal zou een te laag totaal als volledig lezen.
   */
  zonderFacturatiegegevens: number
  /**
   * Aantal gekoppelde dossiers per jaar, oplopend.
   *
   * Op `bouw7_aanmaakdatum`, NIET op `created_at`: dat laatste is de dag waarop de
   * bulk-sync het dossier in EVA zette (174 dossiers verdeeld over 14 importdagen),
   * wat een volstrekt verzonnen jaarverdeling zou opleveren.
   */
  perJaar: ObjectJaar[]
  laatsteActiviteit: string | null
}

export type ObjectRelatieRij = {
  id: string
  relatie_id: string
  rol: VastgoedObjectRol
  primair: boolean
  opmerking: string | null
  naam: string
}

/**
 * Verkocht werk = alles wat opdracht is geworden. Dat omvat de afgesloten opdrachten en de
 * servicedesk-opdrachten, want die hebben allemaal `hoofdstatus = 'opdracht'`.
 */
const isVerkocht = (hoofdstatus: Hoofdstatus) => hoofdstatus === 'opdracht'

export async function getObjecten(): Promise<ObjectRij[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [objectenRes, tellingRes] = await Promise.all([
    supabase
      .from('vastgoed_objecten')
      .select('*, standaard_opdrachtgever:relaties!vastgoed_objecten_standaard_opdrachtgever_id_fkey(naam)')
      .order('naam', { ascending: true }),
    supabase.from('dossiers').select('object_id').not('object_id', 'is', null),
  ])

  const aantallen = new Map<string, number>()
  for (const d of (tellingRes.data ?? []) as { object_id: string }[]) {
    aantallen.set(d.object_id, (aantallen.get(d.object_id) ?? 0) + 1)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((objectenRes.data ?? []) as any[]).map((o) => ({
    ...o,
    opdrachtgever_naam: o.standaard_opdrachtgever?.naam ?? null,
    aantal_dossiers: aantallen.get(o.id) ?? 0,
  }))
}

export async function getObject(id: string): Promise<VastgoedObject | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase.from('vastgoed_objecten').select('*').eq('id', id).maybeSingle()
  return (data as VastgoedObject) ?? null
}

/** Dossiers van een object, nieuwste eerst, met de driftvlag per rij. */
export async function getObjectDossiers(objectId: string): Promise<ObjectDossier[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [objectRes, dossiersRes] = await Promise.all([
    supabase.from('vastgoed_objecten')
      .select('adres_straat, adres_huisnummer, adres_postcode, adres_plaats')
      .eq('id', objectId).maybeSingle(),
    supabase.from('dossiers')
      .select(`id, dossiernummer, titel, ${FASE_KOLOMMEN}, bedrag_excl_btw, kostprijs_excl_btw, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad, updated_at, klant:relaties!dossiers_klant_id_fkey(naam)`)
      .eq('object_id', objectId)
      .order('updated_at', { ascending: false }),
  ])

  const object = objectRes.data ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((dossiersRes.data ?? []) as any[]).map((d) => ({
    id: d.id,
    dossiernummer: d.dossiernummer,
    titel: d.titel,
    hoofdstatus: d.hoofdstatus,
    fase: bepaalFase(d),
    bedrag_excl_btw: d.bedrag_excl_btw,
    kostprijs_excl_btw: d.kostprijs_excl_btw,
    werkadres_straat: d.werkadres_straat,
    werkadres_huisnummer: d.werkadres_huisnummer,
    werkadres_postcode: d.werkadres_postcode,
    werkadres_stad: d.werkadres_stad,
    klant_naam: d.klant?.naam ?? null,
    updated_at: d.updated_at,
    adres_wijkt_af: adresWijktAf(d, object),
  }))
}

/**
 * Totalen over de gekoppelde dossiers: gefactureerd excl. btw en de aantallen per jaar.
 *
 * Bewust géén aanneemsom, meerwerk of marge. Servicedeskwerk — het leeuwendeel op een VvE —
 * loopt op regie en heeft helemaal geen aanneemsom, en `kostprijs_excl_btw` is alleen gevuld
 * als de offerte via de calculatiemodule is opgebouwd. Beide zouden dus een deel van het werk
 * als nul presenteren. Gefactureerd dekt alles wat er daadwerkelijk is uitgegaan.
 */
export async function getObjectTotalen(objectId: string): Promise<ObjectTotalen> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select(`id, ${FASE_KOLOMMEN}, bouw7_aanmaakdatum, aanvraagdatum, created_at, updated_at`)
    .eq('object_id', objectId)

  const dossiers = (data ?? []) as (FaseVelden & {
    id: string
    bouw7_aanmaakdatum: string | null
    aanvraagdatum: string | null
    created_at: string
    updated_at: string
  })[]

  const aantalPerFase: Record<ObjectFase, number> =
    { aanvraag: 0, offerte: 0, opdracht: 0, servicedesk: 0, afgesloten: 0 }
  const perJaarMap = new Map<number, number>()
  let laatsteActiviteit: string | null = null

  for (const d of dossiers) {
    aantalPerFase[bepaalFase(d)]++
    const jaar = jaarVan(d)
    if (jaar != null) perJaarMap.set(jaar, (perJaarMap.get(jaar) ?? 0) + 1)
    if (!laatsteActiviteit || d.updated_at > laatsteActiviteit) laatsteActiviteit = d.updated_at
  }

  // Gefactureerd komt uit management_projecten (Athena revenue.realised), dezelfde bron als
  // het Management-dashboard. Die tabel dekt alleen opdrachten en servicedeskdossiers.
  const ids = dossiers.map((d) => d.id)
  let gefactureerdExcl = 0
  const metRegel = new Set<string>()
  if (ids.length) {
    const { data: mgmt } = await supabase
      .from('management_projecten')
      .select('dossier_id, gefactureerd')
      .in('dossier_id', ids)
    for (const r of (mgmt ?? []) as { dossier_id: string; gefactureerd: number | null }[]) {
      metRegel.add(r.dossier_id)
      gefactureerdExcl += Number(r.gefactureerd) || 0
    }
  }

  // Alleen uitgevoerd werk hóórt een facturatieregel te hebben; een aanvraag of offerte niet.
  const zonderFacturatiegegevens = dossiers.filter(
    (d) => (isVerkocht(d.hoofdstatus) || d.servicedesk_substatus) && !metRegel.has(d.id),
  ).length

  return {
    aantalDossiers: dossiers.length,
    aantalPerFase,
    gefactureerdExcl: rond(gefactureerdExcl),
    zonderFacturatiegegevens,
    perJaar: [...perJaarMap.entries()]
      .map(([jaar, aantal]) => ({ jaar, aantal }))
      .sort((a, b) => a.jaar - b.jaar),
    laatsteActiviteit,
  }
}

export async function getObjectRelaties(objectId: string): Promise<ObjectRelatieRij[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('vastgoed_object_relaties')
    .select('id, relatie_id, rol, primair, opmerking, relatie:relaties(naam)')
    .eq('object_id', objectId)
    .order('primair', { ascending: false })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id, relatie_id: r.relatie_id, rol: r.rol,
    primair: r.primair, opmerking: r.opmerking,
    naam: r.relatie?.naam ?? '(onbekend)',
  }))
}

/**
 * Objecten die bij een relatie horen — voor het blok op de relatiepagina.
 * Zowel via een rol in `vastgoed_object_relaties` als via `standaard_opdrachtgever_id`,
 * want dat laatste wordt uit Bouw7's `invoiceRecipient` gevuld zonder rolregistratie.
 */
export async function getObjectenVoorRelatie(
  relatieId: string,
): Promise<(ObjectRij & { rollen: VastgoedObjectRol[] })[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: koppels } = await supabase
    .from('vastgoed_object_relaties').select('object_id, rol').eq('relatie_id', relatieId)

  const rollenPerObject = new Map<string, VastgoedObjectRol[]>()
  for (const k of (koppels ?? []) as { object_id: string; rol: VastgoedObjectRol }[]) {
    if (!rollenPerObject.has(k.object_id)) rollenPerObject.set(k.object_id, [])
    rollenPerObject.get(k.object_id)!.push(k.rol)
  }

  const alle = await getObjecten()
  return alle
    .filter((o) => rollenPerObject.has(o.id) || o.standaard_opdrachtgever_id === relatieId)
    .map((o) => ({
      ...o,
      rollen: rollenPerObject.get(o.id)
        ?? (o.standaard_opdrachtgever_id === relatieId ? (['opdrachtgever'] as VastgoedObjectRol[]) : []),
    }))
}

/**
 * Zoek objecten voor de kiezer in het aanvraagformulier en op het dossier.
 * Zoekt op naam, objectnummer, VvE-code, straat, postcode en plaats.
 */
export async function zoekObjecten(term: string, limiet = 20): Promise<VastgoedObject[]> {
  // Eigen gate: deze functie wordt rechtstreeks vanuit client-componenten aangeroepen en is
  // daarmee een kale RPC. De overige functies hierboven draaien alleen vanaf een page die
  // zelf al `vereisRecht` doet.
  await vereisRecht('objectenbeheer', 'lezen')
  const zoek = term.trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  let query = supabase.from('vastgoed_objecten').select('*').eq('actief', true)
  if (zoek) {
    const p = `%${zoek.replace(/[%_]/g, (m: string) => `\\${m}`)}%`
    query = query.or(
      `naam.ilike.${p},objectnummer.ilike.${p},vve_code.ilike.${p},` +
      `adres_straat.ilike.${p},adres_postcode.ilike.${p},adres_plaats.ilike.${p}`,
    )
  }
  const { data } = await query.order('naam', { ascending: true }).limit(limiet)
  return (data ?? []) as VastgoedObject[]
}

/**
 * Objecten van een relatie in de vorm die het blok op de relatiepagina toont.
 *
 * Geeft een lege lijst terug als objectenbeheer uit staat of de gebruiker er geen
 * leesrecht op heeft — het blok verdwijnt dan gewoon, in plaats van de hele
 * relatiepagina te laten struikelen over een recht dat met relaties niets te maken heeft.
 */
export async function getRelatieObjecten(relatieId: string): Promise<RelatieObject[]> {
  try {
    await vereisRecht('objectenbeheer', 'lezen')
  } catch {
    return []
  }

  const objecten = await getObjectenVoorRelatie(relatieId)
  return objecten.map((o) => ({
    id: o.id,
    naam: o.naam,
    objectnummer: o.objectnummer,
    adres: objectAdresRegel(o),
    rollen: o.rollen.map((r) => VASTGOED_OBJECT_ROLLEN.find((x) => x.key === r)?.label ?? r),
    aantalDossiers: o.aantal_dossiers,
  }))
}

/**
 * Naam van de standaard-opdrachtgever van een object. Het aanvraagformulier toont in het
 * klantveld een naam terwijl het object alleen een id draagt; dit vult dat gat zonder de
 * hele relatie mee te sturen.
 */
export async function getObjectOpdrachtgeverNaam(objectId: string): Promise<string | null> {
  await vereisRecht('objectenbeheer', 'lezen')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('vastgoed_objecten')
    .select('relaties:standaard_opdrachtgever_id(naam)')
    .eq('id', objectId).maybeSingle()
  return data?.relaties?.naam ?? null
}
