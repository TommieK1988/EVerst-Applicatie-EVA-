import 'server-only'

/**
 * Gekoppelde dossiers van een relatie of contactpersoon.
 *
 * Twee kanten, bewust apart gehouden:
 *
 *  - **Als opdrachtgever** — `dossiers.klant_id`. Eén bron, één query. Het bedrag is de
 *    gefactureerde omzet.
 *  - **Als inkooppartij** — de dossiers waar deze onderaannemer of leverancier bij betrokken
 *    is. Dat is geen kolom maar een optelsom van vier bronnen (zie `getBetrokkenDossiers`),
 *    en het bedrag is juist ingekochte kósten.
 *
 * Die twee in één tabel gooien zou de bedragkolom betekenisloos maken: omzet en kosten zijn
 * tegengestelde grootheden. Een relatie die beide is (komt voor) krijgt dus twee tabellen.
 *
 * WAT HIER BEWUST NIET IN ZIT: de Bouw7-inkooporders en onderaannemerscontracten uit de
 * Inkoop-tab van het dossier. Dat is de rijkste bron, maar hij staat in per-dossier snapshots
 * (`leesDossierBronnen`, JSONB per dossier) en is dus niet op leverancier te bevragen — zoeken
 * zou betekenen: alle snapshots van alle dossiers uitpakken. Het blok toont daarom de
 * betrokkenheid die in EVA zelf is vastgelegd, en zegt dat er ook bij.
 *
 * Alles hier draait op de admin-client (service-role, bypast RLS) en gaat door een eigen
 * sessiegate; de aanroepende pagina's hebben er zelf geen.
 */

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker, getEffectieveRechten, heeftModuleToegang } from '@/lib/auth/rechten'
import { bepaalFase, jaarVan, FASE_KOLOMMEN } from '@/lib/dossiers/fase'
import type { FaseVelden } from '@/lib/dossiers/fase'
import { dossierSegment } from '@/lib/dossiers/href'
import { LEEG_DOSSIER_TOTAAL, LEGE_RELATIE_DOSSIERS } from './dossiers-types'
import type {
  BetrokkenRol, RelatieDossier, RelatieDossierTotalen, RelatieDossiersData,
} from './dossiers-types'

/**
 * Bovengrens per tabel. De grootste opdrachtgever heeft er vandaag 106 van de 690 in totaal,
 * dus dit knelt nergens — het staat er zodat een groeiende klant straks een zichtbare grens
 * raakt in plaats van de stille PostgREST-afkapping op 1000.
 */
const MAX_RIJEN = 500

const rond = (n: number): number => Math.round(n * 100) / 100

/**
 * Velden die elke dossierrij nodig heeft — één select-string voor alle drie de leesfuncties.
 *
 * Bewust één `as const`-template en geen aan elkaar geplakte stukken: supabase-js leidt het
 * rijtype af uit de select-string, en een samengestelde string is voor de typechecker gewoon
 * `string`. Dan komt er `GenericStringError[]` uit en heb je weer een any-cast op de client nodig.
 */
const DOSSIER_KOLOMMEN =
  `id, dossiernummer, titel, ${FASE_KOLOMMEN}, aanvraag_substatus, bouw7_aanmaakdatum, aanvraagdatum, verzonden_op, object_id, created_at, updated_at, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad` as const

type RuweDossierRij = FaseVelden & {
  id: string
  dossiernummer: string | null
  titel: string
  aanvraag_substatus: string | null
  bouw7_aanmaakdatum: string | null
  aanvraagdatum: string | null
  verzonden_op: string | null
  object_id: string | null
  created_at: string
  updated_at: string
  werkadres_straat: string | null
  werkadres_huisnummer: string | null
  werkadres_postcode: string | null
  werkadres_stad: string | null
}

function adresRegel(d: RuweDossierRij): string | null {
  const straat = [d.werkadres_straat, d.werkadres_huisnummer].filter(Boolean).join(' ').trim()
  const plaats = [d.werkadres_postcode, d.werkadres_stad].filter(Boolean).join(' ').trim()
  const regel = [straat, plaats].filter(Boolean).join(', ')
  return regel || null
}

function naarRij(d: RuweDossierRij, bedrag: number | null, rollen: BetrokkenRol[] = []): RelatieDossier {
  const segment = dossierSegment(d.hoofdstatus, d.servicedesk_substatus)
  return {
    id: d.id,
    dossiernummer: d.dossiernummer,
    titel: d.titel,
    fase: bepaalFase(d),
    href: segment ? `/${segment}/${d.id}` : null,
    adres: adresRegel(d),
    jaar: jaarVan(d),
    updated_at: d.updated_at,
    bedrag,
    rollen,
    verzonden_op: d.verzonden_op,
    object_id: d.object_id,
    bouw7_aanmaakdatum: d.bouw7_aanmaakdatum,
    aanvraagdatum: d.aanvraagdatum,
    created_at: d.created_at,
    hoofdstatus: d.hoofdstatus,
    aanvraag_substatus: d.aanvraag_substatus,
    offerte_substatus: d.offerte_substatus,
    opdracht_substatus: d.opdracht_substatus,
    servicedesk_substatus: d.servicedesk_substatus,
  }
}

function totalenVan(rijen: RelatieDossier[], zonderFacturatiegegevens = 0): RelatieDossierTotalen {
  return {
    aantal: rijen.length,
    lopend: rijen.filter((r) => r.fase !== 'afgesloten').length,
    bedrag: rond(rijen.reduce((s, r) => s + (r.bedrag ?? 0), 0)),
    zonderFacturatiegegevens,
  }
}

/**
 * Gefactureerd per dossier uit `management_projecten` — dezelfde bron als de objectpagina en
 * het Management-dashboard, zodat de drie schermen niet uit elkaar kunnen lopen. Die tabel
 * bevat alleen opdrachten en servicedeskdossiers; een aanvraag of offerte hoort er niet in.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gefactureerdPerDossier(supabase: any, ids: string[]): Promise<Map<string, number>> {
  const per = new Map<string, number>()
  if (ids.length === 0) return per
  const { data } = await supabase
    .from('management_projecten')
    .select('dossier_id, gefactureerd')
    .in('dossier_id', ids)
  for (const r of (data ?? []) as { dossier_id: string; gefactureerd: number | null }[]) {
    per.set(r.dossier_id, Number(r.gefactureerd) || 0)
  }
  return per
}

/** Dossiers waarvan deze relatie de opdrachtgever is. */
async function leesKlantDossiers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  relatieId: string,
): Promise<{ rijen: RelatieDossier[]; totalen: RelatieDossierTotalen }> {
  const { data } = await supabase
    .from('dossiers')
    .select(DOSSIER_KOLOMMEN)
    .eq('klant_id', relatieId)
    .order('updated_at', { ascending: false })
    .limit(MAX_RIJEN)

  const ruw = (data ?? []) as RuweDossierRij[]
  const gefactureerd = await gefactureerdPerDossier(supabase, ruw.map((d) => d.id))
  const rijen = ruw.map((d) => naarRij(d, gefactureerd.has(d.id) ? gefactureerd.get(d.id)! : null))

  // Alleen uitgevoerd werk hóórt een facturatieregel te hebben; een aanvraag of offerte niet.
  const zonder = ruw.filter(
    (d) => (d.hoofdstatus === 'opdracht' || d.servicedesk_substatus) && !gefactureerd.has(d.id),
  ).length

  return { rijen, totalen: totalenVan(rijen, zonder) }
}

/**
 * Dossiers waar deze relatie als onderaannemer of leverancier bij betrokken is.
 *
 * Vier gerichte queries op de EVA-tabellen die de betrokkenheid vastleggen. Inkoopfacturen
 * dragen dit vandaag (378 regels over 101 dossiers); bestellingen, uitvragen en opleverpunten
 * zijn nog nauwelijks gevuld maar groeien mee zonder dat hier iets aan hoeft te veranderen.
 */
async function leesBetrokkenDossiers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  relatieId: string,
  magBedragenZien: boolean,
): Promise<{ rijen: RelatieDossier[]; totalen: RelatieDossierTotalen }> {
  const [facturen, bestellingen, uitvragen, opleverpunten] = await Promise.all([
    supabase.from('inkoopfacturen')
      .select('dossier_id, bedrag_excl')
      .eq('leverancier_relatie_id', relatieId)
      .not('dossier_id', 'is', null),
    // Een bestelling draagt zelf geen dossier; dat hangt aan de werkbegroting erboven.
    // Bewust in twee stappen in plaats van een embedded join: een verkeerd geraden
    // relatienaam geeft bij PostgREST een lege `data` zonder dat hier iets opvalt.
    supabase.from('werkbegroting_bestellingen')
      .select('werkbegroting_id')
      .eq('relatie_id', relatieId),
    supabase.from('dossier_uitvragen')
      .select('dossier_id')
      .eq('relatie_id', relatieId),
    supabase.from('oplever_punten')
      .select('dossier_id')
      .eq('toegewezen_relatie_id', relatieId),
  ])

  const rollenPer = new Map<string, Set<BetrokkenRol>>()
  const noteer = (dossierId: string | null | undefined, rol: BetrokkenRol) => {
    if (!dossierId) return
    if (!rollenPer.has(dossierId)) rollenPer.set(dossierId, new Set())
    rollenPer.get(dossierId)!.add(rol)
  }

  const ingekochtPer = new Map<string, number>()
  for (const f of (facturen.data ?? []) as { dossier_id: string; bedrag_excl: number | null }[]) {
    noteer(f.dossier_id, 'inkoopfactuur')
    ingekochtPer.set(f.dossier_id, (ingekochtPer.get(f.dossier_id) ?? 0) + (Number(f.bedrag_excl) || 0))
  }
  const wbIds = [...new Set(
    ((bestellingen.data ?? []) as { werkbegroting_id: string | null }[])
      .map((b) => b.werkbegroting_id).filter((id): id is string => !!id),
  )]
  if (wbIds.length > 0) {
    const { data: wbs } = await supabase
      .from('werkbegrotingen').select('id, dossier_id').in('id', wbIds)
    for (const w of (wbs ?? []) as { dossier_id: string | null }[]) noteer(w.dossier_id, 'bestelling')
  }
  for (const u of (uitvragen.data ?? []) as { dossier_id: string }[]) noteer(u.dossier_id, 'uitvraag')
  for (const p of (opleverpunten.data ?? []) as { dossier_id: string }[]) noteer(p.dossier_id, 'opleverpunt')

  const ids = [...rollenPer.keys()]
  if (ids.length === 0) return { rijen: [], totalen: LEEG_DOSSIER_TOTAAL }

  const { data } = await supabase
    .from('dossiers')
    .select(DOSSIER_KOLOMMEN)
    .in('id', ids.slice(0, MAX_RIJEN))
    .order('updated_at', { ascending: false })

  const rijen = ((data ?? []) as RuweDossierRij[]).map((d) => naarRij(
    d,
    magBedragenZien ? rond(ingekochtPer.get(d.id) ?? 0) : null,
    [...(rollenPer.get(d.id) ?? [])],
  ))

  return { rijen, totalen: totalenVan(rijen) }
}

/**
 * Alle gekoppelde dossiers van een organisatie, beide kanten.
 *
 * Gate is `getCurrentMedewerker` en niet `vereisRecht('dossiers')`: die module staat nog niet
 * in `AFGEDWONGEN_MODULES`, en de afdeling Ondersteunend heeft het recht niet gezet. Daarop
 * gaan gaten zou dit blok voor hen laten verdwijnen terwijl ze de openstaande opdrachten
 * vandaag gewoon op deze pagina zien. De inkoopbedragen zitten wél achter `inkoopfacturen`,
 * want dát recht wordt wel afgedwongen.
 */
export async function getRelatieDossiers(relatieId: string): Promise<RelatieDossiersData> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return LEGE_RELATIE_DOSSIERS

  const rechten = await getEffectieveRechten(medewerker)
  const magBedragenZien = heeftModuleToegang(rechten, 'inkoopfacturen', 'lezen')

  const supabase = createAdminClient()
  const [klant, betrokken] = await Promise.all([
    leesKlantDossiers(supabase, relatieId),
    leesBetrokkenDossiers(supabase, relatieId, magBedragenZien),
  ])

  return {
    klant: klant.rijen,
    klantTotalen: klant.totalen,
    betrokken: betrokken.rijen,
    betrokkenTotalen: betrokken.totalen,
    toontInkoopbedragen: magBedragenZien,
  }
}

/**
 * Alleen de opdrachtgeverkant, voor het mobiele klantbeeld.
 *
 * `getRelatieDossiers` doet daarnaast vier queries voor de inkoopkant plus een vijfde op de
 * werkbegrotingen. Dat is op de relatiepagina terecht — daar staan beide tabellen — maar het
 * klantbeeld toont alleen wat we vóór deze klant doen. Op een telefoon over 4G scheelt dat
 * merkbaar, en de inkoopbedragen zouden er sowieso niet in passen.
 *
 * Zelfde gate als hierboven: `getCurrentMedewerker`. Het recht `relaties` wordt door de
 * aanroepende pagina gecontroleerd (`vereisCommercieelToegang`).
 */
export async function getKlantDossiers(
  relatieId: string,
): Promise<{ rijen: RelatieDossier[]; totalen: RelatieDossierTotalen }> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return { rijen: [], totalen: LEEG_DOSSIER_TOTAAL }
  return leesKlantDossiers(createAdminClient(), relatieId)
}

/**
 * Dossiers waarop deze contactpersoon de contactpersoon is. Geen bedragen en geen totalen:
 * het blok op de contactpersoonpagina is een lijstje, geen financieel overzicht.
 */
export async function getContactpersoonDossiers(contactpersoonId: string): Promise<RelatieDossier[]> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return []

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('dossiers')
    .select(DOSSIER_KOLOMMEN)
    .eq('contactpersoon_id', contactpersoonId)
    .order('updated_at', { ascending: false })
    .limit(MAX_RIJEN)

  return ((data ?? []) as RuweDossierRij[]).map((d) => naarRij(d, null))
}
