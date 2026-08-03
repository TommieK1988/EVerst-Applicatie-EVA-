'use server'

/**
 * Leeslaag voor objectenbeheer.
 *
 * Alles hier gebruikt de admin-client (service-role) en is dus alleen aanroepbaar
 * achter een `vereisRecht`-gate in de aanroepende page/action.
 */

import { createAdminClient } from '@everts/database/server'
import type { VastgoedObject, VastgoedObjectRol, Hoofdstatus } from '@everts/database'
import { getGoedgekeurdMeerwerkExclBatch } from '@/lib/dossiers/meerwerk'
import { adresWijktAf } from './adres'

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

const OFFERTE_EIND = new Set(['gewonnen', 'verloren', 'vervallen'])

function bepaalFase(d: FaseVelden): ObjectFase {
  if (d.gearchiveerd === true) return 'afgesloten'
  if (d.hoofdstatus === 'opdracht' && d.opdracht_substatus === 'financieel_afgesloten') return 'afgesloten'
  if (d.servicedesk_substatus) {
    return d.servicedesk_substatus === 'financieel_gereed' ? 'afgesloten' : 'servicedesk'
  }
  return d.hoofdstatus
}

/** Kolommen die `bepaalFase` nodig heeft — één plek, zodat de selects niet uit elkaar lopen. */
const FASE_KOLOMMEN = 'hoofdstatus, offerte_substatus, opdracht_substatus, servicedesk_substatus, gearchiveerd'

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

export type ObjectTotalen = {
  aantalPerFase: Record<ObjectFase, number>
  aantalDossiers: number
  /** Σ bedrag_excl_btw over alle opdrachten (ook de afgesloten en de servicedesk-opdrachten). */
  aanneemsom: number
  goedgekeurdMeerwerk: number
  /** aanneemsom + goedgekeurd meerwerk — zelfde definitie als het Financieel-tab. */
  contractTotaal: number
  kostprijs: number
  /**
   * Marge en percentage zijn `null` zodra er géén kostprijs bekend is. `kostprijs_excl_btw`
   * wordt alleen gevuld als de offerte via de Bouw7-calculatiemodule is opgebouwd; zonder
   * die controle zou een object met een onbekende kostprijs "100% marge" tonen, en dat is
   * een getal waar iemand beslissingen op neemt.
   */
  marge: number | null
  margePct: number | null
  /** Aantal opdrachten waarvan de kostprijs ontbreekt — maakt een onvolledige marge zichtbaar. */
  zonderKostprijs: number
  /** Σ bedrag_excl_btw van nog lopende offertes; telt níét mee in contractTotaal. */
  openOffertes: number
  laatsteActiviteit: string | null
  /**
   * true = het meerwerk kon niet volledig worden uitgerekend (te veel regie-dossiers of
   * Bouw7 onbereikbaar). De UI hoort het totaal dan als benadering te tonen.
   */
  meerwerkBenadering: boolean
  /**
   * Servicedeskdossiers (dagelijks onderhoud, mutaties). Die houden `hoofdstatus = 'aanvraag'`
   * en worden op regie afgerekend, dus ze hebben géén aanneemsom. Zonder dit getal lijkt een
   * object met 43 afgehandelde servicedeskklussen "€ 0 omzet" te hebben — de UI moet dat
   * kunnen uitleggen in plaats van een misleidend nul te tonen.
   */
  servicedeskDossiers: number
  /** Uitgevoerd werk zonder vastgelegd bedrag. Maakt zichtbaar dat het totaal niet alles dekt. */
  zonderBedrag: number
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
 * Totalen over de gekoppelde dossiers.
 *
 * Contracttotaal = aanneemsom + goedgekeurd meerwerk, dezelfde definitie als op het
 * Financieel-tab van een dossier — anders tellen twee schermen hetzelfde werk verschillend.
 * Offertes tellen bewust niet mee: dat is nog geen verkocht werk.
 */
export async function getObjectTotalen(objectId: string): Promise<ObjectTotalen> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select(`id, ${FASE_KOLOMMEN}, bedrag_excl_btw, kostprijs_excl_btw, updated_at`)
    .eq('object_id', objectId)

  const dossiers = (data ?? []) as (FaseVelden & {
    id: string
    bedrag_excl_btw: number | null; kostprijs_excl_btw: number | null; updated_at: string
  })[]

  const aantalPerFase: Record<ObjectFase, number> =
    { aanvraag: 0, offerte: 0, opdracht: 0, servicedesk: 0, afgesloten: 0 }
  let aanneemsom = 0
  let kostprijs = 0
  let openOffertes = 0
  let laatsteActiviteit: string | null = null
  let servicedeskDossiers = 0
  let zonderBedrag = 0
  let zonderKostprijs = 0

  for (const d of dossiers) {
    const fase = bepaalFase(d)
    aantalPerFase[fase]++
    if (d.servicedesk_substatus) servicedeskDossiers++
    // Uitgevoerd werk zonder bedrag: bijna altijd regie (servicedesk rekent op nacalculatie af).
    if ((d.servicedesk_substatus || isVerkocht(d.hoofdstatus)) && !Number(d.bedrag_excl_btw)) {
      zonderBedrag++
    }
    if (isVerkocht(d.hoofdstatus)) {
      aanneemsom += Number(d.bedrag_excl_btw) || 0
      kostprijs  += Number(d.kostprijs_excl_btw) || 0
      if (!Number(d.kostprijs_excl_btw)) zonderKostprijs++
    }
    // Alleen offertes die nog lopen; gewonnen/verloren/vervallen zijn geen openstaande kans meer.
    if (d.hoofdstatus === 'offerte' && !OFFERTE_EIND.has(d.offerte_substatus ?? '')) {
      openOffertes += Number(d.bedrag_excl_btw) || 0
    }
    if (!laatsteActiviteit || d.updated_at > laatsteActiviteit) laatsteActiviteit = d.updated_at
  }

  // Meerwerk telt alleen mee voor dossiers die ook in de aanneemsom zitten.
  const contractIds = dossiers.filter((d) => isVerkocht(d.hoofdstatus)).map((d) => d.id)
  const { perDossier, regieOvergeslagen } = await getGoedgekeurdMeerwerkExclBatch(contractIds)
  const goedgekeurdMeerwerk = [...perDossier.values()].reduce((t, n) => t + n, 0)

  const contractTotaal = rond(aanneemsom + goedgekeurdMeerwerk)
  // Geen kostprijs bekend = geen marge te melden. Anders zou 0 kostprijs als 100% marge lezen.
  const marge = kostprijs > 0 ? rond(contractTotaal - kostprijs) : null

  return {
    aantalPerFase,
    aantalDossiers: dossiers.length,
    aanneemsom: rond(aanneemsom),
    goedgekeurdMeerwerk: rond(goedgekeurdMeerwerk),
    contractTotaal,
    kostprijs: rond(kostprijs),
    marge,
    margePct: marge != null && contractTotaal > 0 ? rond((marge / contractTotaal) * 100) : null,
    zonderKostprijs,
    openOffertes: rond(openOffertes),
    laatsteActiviteit,
    meerwerkBenadering: regieOvergeslagen.length > 0,
    servicedeskDossiers,
    zonderBedrag,
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
