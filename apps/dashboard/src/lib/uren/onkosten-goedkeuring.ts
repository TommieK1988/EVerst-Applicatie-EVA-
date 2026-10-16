import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { getUrenInstellingen, getIndirecteDossierIds } from './instellingen'
import { signBonnen } from './bonnen'
import { routeerKosten, wachtOpBeoordeling, type KostenRol, type KostenStatus } from './onkosten-route'
import type { OnkostenSoort, Vervoermiddel } from './onkosten'

/**
 * De leeslaag van de kostengoedkeuring: kostenposten ophalen en per post bepalen wie hem
 * beoordeelt.
 *
 * Geen 'use server': deze functies lezen met de service-role en eisen zelf geen sessie. Wie ze
 * aanroept is verantwoordelijk voor de afscherming -- de acties in `./onkosten-goedkeuring-acties`
 * en de pagina's snijden het resultaat op de ingelogde medewerker. Zelfde opzet als
 * `./openstaande-uren` bij de uren.
 *
 * De routering zelf staat in `./onkosten-route` (puur, getest). Hier komen alleen de feiten
 * vandaan: het dossier met zijn projectleider, de eigen goedkeurder van de medewerker en de
 * standaardgoedkeurder uit de instellingen.
 */

type Persoon = { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }

/** De rij zoals `KOSTEN_SELECT` hem oplevert; los benoemd zodat er geen any aan te pas komt. */
type KostenRij = {
  id: string
  week_id: string
  medewerker_id: string
  datum: string
  soort: string
  vervoermiddel: string | null
  km: number | string | null
  bedrag: number | string
  omschrijving: string | null
  bon_pad: string | null
  dossier_id: string | null
  goedkeuring_status: string
  beoordeeld_op: string | null
  beoordeeld_door: string | null
  afkeur_reden: string | null
  medewerker: (Persoon & { uren_goedkeurder_id: string | null }) | null
  dossiers: { dossiernummer: string | null; titel: string | null; project_manager_id: string | null } | null
  uren_weken: { status: string; week_start: string } | null
}

// De beoordelaar heeft geen foreign key (zie de migratie 20261016f); zijn naam komt uit dezelfde
// opzoeking als die van de goedkeurders. De naam van de FK hier houdt de embed eenduidig.
const KOSTEN_SELECT = [
  'id, week_id, medewerker_id, datum, soort, vervoermiddel, km, bedrag, omschrijving, bon_pad',
  'dossier_id, goedkeuring_status, beoordeeld_op, beoordeeld_door, afkeur_reden',
  'medewerker:medewerkers!uren_onkosten_medewerker_id_fkey(voornaam, tussenvoegsel, achternaam, uren_goedkeurder_id)',
  'dossiers(dossiernummer, titel, project_manager_id)',
].join(', ')

/** Eén kostenpost met alles wat een scherm nodig heeft om hem te tonen en te beoordelen. */
export type KostenPost = {
  id: string
  datum: string
  /** Maandag van de week waarin de post staat; de link naar de weekstaat. */
  weekStart: string | null
  medewerkerId: string
  medewerkerNaam: string
  soort: OnkostenSoort
  vervoermiddel: Vervoermiddel | null
  km: number | null
  bedrag: number
  omschrijving: string | null
  /** Verse signed URL; de bonnen-bucket is privé. */
  bonUrl: string | null
  dossierId: string | null
  /** "nummer · titel", of null zonder project. */
  project: string | null
  status: KostenStatus
  /** Open én de week is ingediend: hij ligt bij de beoordelaar. Zie `wachtOpBeoordeling`. */
  teBeoordelen: boolean
  goedkeurderId: string | null
  goedkeurderNaam: string | null
  rol: KostenRol | null
  beoordeeldOp: string | null
  beoordeeldDoorNaam: string | null
  afkeurReden: string | null
}

const naamVan = (p: Persoon | null | undefined) =>
  [p?.voornaam, p?.tussenvoegsel, p?.achternaam].filter(Boolean).join(' ')

const alsStatus = (s: string): KostenStatus =>
  s === 'goedgekeurd' || s === 'afgekeurd' ? s : 'open'

const db = () => createAdminClient()

/** Routering, namen en bonnen bij een stapel rijen. */
async function verrijk(rijen: KostenRij[], metBonnen = true): Promise<KostenPost[]> {
  if (!rijen.length) return []
  const [inst, indirect, bonLinks] = await Promise.all([
    getUrenInstellingen(),
    getIndirecteDossierIds(),
    metBonnen ? signBonnen(rijen.map(r => r.bon_pad)) : Promise.resolve(new Map<string, string>()),
  ])

  const routes = rijen.map(r => routeerKosten({
    medewerkerId: r.medewerker_id,
    dossierId: r.dossier_id,
    projectleiderId: r.dossiers?.project_manager_id ?? null,
    indirect: r.dossier_id != null && indirect.has(r.dossier_id),
    eigenGoedkeurderId: r.medewerker?.uren_goedkeurder_id ?? null,
    standaardGoedkeurderId: inst.niet_gewerkt_goedkeurder_id,
  }))

  // De namen van wie er aan zet is en wie er besliste. Begrensd door de `.in()`: zoveel rijen
  // als er verschillende goedkeurders zijn, een handvol.
  const persoonIds = [...new Set(
    [...routes.map(r => r.goedkeurderId), ...rijen.map(r => r.beoordeeld_door)]
      .filter((id): id is string => !!id),
  )]
  const namen = new Map<string, string>()
  if (persoonIds.length) {
    const { data } = await db()
      .from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', persoonIds)
    for (const m of data ?? []) namen.set(m.id, naamVan(m))
  }

  return rijen.map((r, i) => {
    const route = routes[i]
    const status = alsStatus(r.goedkeuring_status)
    return {
      id: r.id,
      datum: r.datum,
      weekStart: r.uren_weken?.week_start ?? null,
      medewerkerId: r.medewerker_id,
      medewerkerNaam: naamVan(r.medewerker) || '—',
      soort: r.soort as OnkostenSoort,
      vervoermiddel: (r.vervoermiddel as Vervoermiddel | null) ?? null,
      km: r.km == null ? null : Number(r.km),
      bedrag: Number(r.bedrag),
      omschrijving: r.omschrijving,
      bonUrl: bonLinks.get(r.bon_pad ?? '') ?? null,
      dossierId: r.dossier_id,
      project: r.dossiers ? [r.dossiers.dossiernummer, r.dossiers.titel].filter(Boolean).join(' · ') : null,
      status,
      teBeoordelen: wachtOpBeoordeling(status, r.uren_weken?.status ?? null),
      goedkeurderId: route.goedkeurderId,
      goedkeurderNaam: route.goedkeurderId ? (namen.get(route.goedkeurderId) ?? null) : null,
      rol: route.rol,
      beoordeeldOp: r.beoordeeld_op,
      beoordeeldDoorNaam: r.beoordeeld_door ? (namen.get(r.beoordeeld_door) ?? null) : null,
      afkeurReden: r.afkeur_reden,
    }
  })
}

type Pagina = { data: KostenRij[] | null; error: { message: string } | null }

/**
 * Alles wat nu op het oordeel van deze medewerker wacht, hoe oud ook.
 *
 * Haalt alle open kostenposten in ingediende weken op en houdt die over die bij hem uitkomen.
 * Dat is de hele open stapel van het bedrijf, maar die blijft klein: hij loopt leeg zodra er
 * beoordeeld wordt. Toch gepagineerd -- zie `haalAlleRijen` voor waarom dat geen keuze is.
 */
export async function haalKostenTeKeuren(ikId: string, opties: { metBonnen?: boolean } = {}): Promise<KostenPost[]> {
  const rijen = await haalAlleRijen<KostenRij>((van, tot) =>
    db()
      .from('uren_onkosten')
      .select(`${KOSTEN_SELECT}, uren_weken!inner(status, week_start)`)
      .eq('goedkeuring_status', 'open')
      .not('uren_weken.status', 'in', '(concept,afgekeurd)')
      .order('datum')
      .order('id')
      .range(van, tot)
      .overrideTypes<KostenRij[], { merge: false }>() as PromiseLike<Pagina>)

  const posten = await verrijk(rijen, opties.metBonnen ?? true)
  return posten.filter(p => p.teBeoordelen && p.goedkeurderId === ikId)
}

/** Alle kostenposten in een periode, voor het bedrijfsbrede urenoverzicht. */
export async function haalKostenInPeriode(van: string, tot: string): Promise<KostenPost[]> {
  // Een jaarperiode kan over de 1000 rijen gaan en PostgREST kapt dan stil af.
  const rijen = await haalAlleRijen<KostenRij>((vanaf, totEn) =>
    db()
      .from('uren_onkosten')
      .select(`${KOSTEN_SELECT}, uren_weken(status, week_start)`)
      .gte('datum', van)
      .lte('datum', tot)
      .order('datum')
      .order('id')
      .range(vanaf, totEn)
      .overrideTypes<KostenRij[], { merge: false }>() as PromiseLike<Pagina>)
  return verrijk(rijen)
}

/**
 * De kostenposten van deze medewerkers in een periode. Voor het fiatteerscherm: wie de uren van
 * een week beoordeelt, ziet ook wat er die week aan kosten is ingediend.
 *
 * Begrensd door de medewerkerslijst (wie ik beoordeel) en het datumbereik; toch gepagineerd,
 * want het bereik van het fiatteerscherm loopt over maanden.
 */
export async function haalKostenVanMedewerkers(medewerkerIds: string[], van: string, tot: string): Promise<KostenPost[]> {
  if (!medewerkerIds.length) return []
  const rijen = await haalAlleRijen<KostenRij>((vanaf, totEn) =>
    db()
      .from('uren_onkosten')
      .select(`${KOSTEN_SELECT}, uren_weken(status, week_start)`)
      .in('medewerker_id', medewerkerIds)
      .gte('datum', van)
      .lte('datum', tot)
      .order('datum')
      .order('id')
      .range(vanaf, totEn)
      .overrideTypes<KostenRij[], { merge: false }>() as PromiseLike<Pagina>)
  return verrijk(rijen)
}

/** Deze kostenposten, voor de acties. De aanroeper begrenst de lijst. */
export async function haalKostenOpId(ids: string[]): Promise<KostenPost[]> {
  if (!ids.length) return []
  const { data } = await db()
    .from('uren_onkosten')
    .select(`${KOSTEN_SELECT}, uren_weken(status, week_start)`)
    .in('id', ids)
    .overrideTypes<KostenRij[], { merge: false }>()
  return verrijk(data ?? [], false)
}
