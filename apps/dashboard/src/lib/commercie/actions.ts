'use server'

/**
 * Server-actions voor de offertebewaking.
 *
 * Twee dingen zijn hier bewust anders dan je zou verwachten:
 *
 * 1. **De fase wordt niet hier opgeslagen.** Elke fasewijziging loopt via
 *    `updateDossierSubstatus`, want daar zit de write-through naar het Bouw7-maatwerkveld
 *    "Offerte Sub-status" mét conflictafhandeling tegen de tweede Bouw7-app. Rechtstreeks
 *    `dossiers.offerte_substatus` schrijven zou die beveiliging omzeilen.
 *
 * 2. **De verliesreden wordt náderhand op de historie gezet.** De DB-trigger
 *    `tg_dossier_status_change` schrijft bij élke statuswijziging zelf een rij in
 *    `dossier_status_historie`, maar kan de reden niet weten — die komt uit de dialoog. We
 *    vullen daarom de zojuist geschreven rij aan in plaats van een tweede rij te maken, want
 *    dan zou de doorlooptijd-per-fase dubbel tellen.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, type CurrentMedewerker } from '@/lib/auth/rechten'
import { maakNotificatie } from '@/lib/notificaties/maak'
import { updateDossierSubstatus } from '@/lib/dossiers/actions'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
// Pure, afhankelijkheidsvrije helper ("vandaag als YYYY-MM-DD in Nederlandse tijd").
// Op Vercel draait de server in UTC: zonder deze normalisatie zou een actie die om 00:30
// Nederlandse tijd wordt afgerond op de vorige kalenderdag worden gezet.
import { vandaagNL } from '@/lib/wagenpark/periode'
import {
  bewakingsStatus, stapOmschrijving, werkdagenVooruit, UITKOMSTEN, UITKOMST_LABELS,
  type BewakingKaart, type BewakingStatus, type UitkomstSleutel,
  type StapSoort, type WachtOp,
} from './types'

/** De service-role-client; los getypeerd zodat de helpers hieronder hem kunnen aannemen. */
type AdminClient = ReturnType<typeof createAdminClient>

export type ActieResultaat =
  | { ok: true }
  | { ok: false; error: string; conflict?: { bouw7Label: string } }

// Eén literal, geen `.join()`: supabase-js leidt het rijtype af uit de letterlijke
// select-string. Een samengestelde string maakt daar `string` van en dan valt de hele
// typering terug op `GenericStringError`. Geen spaties — de select gaat als query-parameter mee.
const KAART_VELDEN =
  'id,dossier_id,soort,titel,eigenaar_id,actiehouder_id,stap_soort,stap_tekst,stap_datum,wacht_op,kans_pct,verwachte_opdracht,getrieerd_op,stap_bron,taak_id' as const

/** Rijvorm zoals PostgREST hem teruggeeft: de check-constraints zijn daar gewoon `text`. */
type KaartRij = {
  id: string
  dossier_id: string | null
  soort: string
  titel: string | null
  eigenaar_id: string | null
  actiehouder_id: string | null
  stap_soort: string | null
  stap_tekst: string | null
  stap_datum: string | null
  wacht_op: string | null
  kans_pct: number | null
  verwachte_opdracht: string | null
  getrieerd_op: string | null
  stap_bron: string | null
  taak_id: string | null
}

/**
 * Vertaalt de ruwe rij naar het domeintype. De database bewaakt de toegestane waarden met
 * check-constraints, maar geeft ze als `text` terug; deze mapper is de enige plek waar die
 * versmalling gebeurt, zodat de rest van de module met echte unions werkt.
 */
function naarKaart(rij: KaartRij | null): BewakingKaart | null {
  if (!rij) return null
  return {
    ...rij,
    soort: rij.soort === 'signaal' ? 'signaal' : 'offerte',
    stap_bron: rij.stap_bron === 'actie' ? 'actie' : 'handmatig',
    stap_soort: rij.stap_soort === 'actie' || rij.stap_soort === 'wachten' ? rij.stap_soort : null,
    wacht_op:
      rij.wacht_op === 'klant' || rij.wacht_op === 'intern' || rij.wacht_op === 'extern'
        ? rij.wacht_op
        : null,
  }
}

/** De velden die een scherm op de kaart mag bijwerken. */
type KaartUpdate = {
  eigenaar_id?: string | null
  actiehouder_id?: string | null
  stap_soort?: StapSoort | null
  stap_tekst?: string | null
  stap_datum?: string | null
  wacht_op?: WachtOp | null
  kans_pct?: number | null
  verwachte_opdracht?: string | null
  getrieerd_op?: string | null
  getrieerd_door?: string | null
  stap_bron?: 'handmatig' | 'actie'
  taak_id?: string | null
}

/** Fases waarin commerciële opvolging niet meer nodig is. */
const AFGEROND_SUBSTATUS = ['verloren', 'vervallen']

// ── Lezen ────────────────────────────────────────────────────────────────────

export type BewakingWeergave = {
  kaart: BewakingKaart | null
  status: BewakingStatus
  eigenaarNaam: string | null
  actiehouderNaam: string | null
  /** Vandaag in NL-tijd; meegegeven zodat de client dezelfde peildatum gebruikt als de server. */
  vandaag: string
  afgerond: boolean
  /** Huidige fase van het dossier (`offerte_substatus`), null zodra het een opdracht is. */
  fase: string | null
}

/**
 * Is dit dossier commercieel klaar?
 *
 * Let op de valkuil: de DB-trigger promoveert `offerte_substatus = 'gewonnen'` meteen naar
 * `hoofdstatus = 'opdracht'` en zet de substatus op null. Testen op 'gewonnen' levert dus
 * vrijwel altijd false op — een gewonnen dossier herken je aan de hoofdstatus.
 */
function isAfgerond(hoofdstatus: string | null, offerteSubstatus: string | null): boolean {
  if (hoofdstatus === 'opdracht') return true
  return offerteSubstatus != null && AFGEROND_SUBSTATUS.includes(offerteSubstatus)
}

type MedewerkerNaam = {
  id: string
  voornaam?: string | null
  tussenvoegsel?: string | null
  achternaam?: string | null
}

function naamVan(m: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null } | null): string | null {
  if (!m) return null
  const naam = [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
  return naam || null
}

export async function getBewaking(dossierId: string): Promise<BewakingWeergave> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = createAdminClient()

  const [{ data: dossier }, { data: rij }] = await Promise.all([
    supabase.from('dossiers')
      .select('hoofdstatus, offerte_substatus')
      .eq('id', dossierId).maybeSingle(),
    supabase.from('commercie_bewaking')
      .select(KAART_VELDEN)
      .eq('dossier_id', dossierId).maybeSingle(),
  ])
  const kaart = naarKaart(rij)

  const afgerond = isAfgerond(dossier?.hoofdstatus ?? null, dossier?.offerte_substatus ?? null)
  const vandaag = vandaagNL()

  let eigenaarNaam: string | null = null
  let actiehouderNaam: string | null = null
  const ids = [kaart?.eigenaar_id, kaart?.actiehouder_id].filter(Boolean) as string[]
  if (ids.length > 0) {
    const { data: mensen } = await supabase.from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .in('id', ids)
    const perId = new Map<string, string | null>(
      (mensen ?? []).map((m: MedewerkerNaam) => [m.id, naamVan(m)]),
    )
    eigenaarNaam = kaart?.eigenaar_id ? perId.get(kaart.eigenaar_id) ?? null : null
    actiehouderNaam = kaart?.actiehouder_id ? perId.get(kaart.actiehouder_id) ?? null : null
  }

  return {
    kaart,
    status: bewakingsStatus(
      kaart ?? { stap_soort: null, stap_datum: null, wacht_op: null },
      { vandaag, afgerond },
    ),
    eigenaarNaam,
    actiehouderNaam,
    vandaag,
    afgerond,
    fase: dossier?.offerte_substatus ?? null,
  }
}

export type TijdlijnRegel = {
  id: string
  op: string
  soort: 'contact' | 'stap' | 'overdracht' | 'notitie' | 'fase'
  /** Kopregel, bv. 'Gebeld — geen gehoor' of 'Fase: Nabellen → In behandeling'. */
  kop: string
  tekst: string | null
  door: string | null
}

/**
 * De tijdlijn is een samenvoeging van drie bestaande bronnen, niet één nieuwe tabel:
 * de eigen gebeurtenissen, de fasewissels die de DB-trigger al bijhoudt, en de
 * dossiernotities (waaronder de uit Bouw7 geïmporteerde offerte-herinneringen). Zo hoeft
 * niemand drie schermen af te lopen om te zien wat er speelde.
 */
export async function getTijdlijn(dossierId: string): Promise<TijdlijnRegel[]> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = createAdminClient()

  const { data: kaart } = await supabase.from('commercie_bewaking')
    .select('id').eq('dossier_id', dossierId).maybeSingle()

  // Alle queries zijn gefilterd op één dossier en blijven dus ruim onder de PostgREST-grens
  // van 1000 rijen; pagineren is hier niet nodig.
  const [gebeurtenissen, fases, notities] = await Promise.all([
    kaart?.id
      ? supabase.from('commercie_gebeurtenissen')
          .select('id, soort, uitkomst, tekst, op, door, naar_actiehouder_id')
          .eq('bewaking_id', kaart.id).order('op', { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
    supabase.from('dossier_status_historie')
      .select('id, van_offerte_substatus, naar_offerte_substatus, naar_hoofdstatus, reden, op')
      .eq('dossier_id', dossierId).order('op', { ascending: false }).limit(200),
    supabase.from('dossier_notities')
      .select('id, inhoud, created_at, medewerker_id')
      .eq('dossier_id', dossierId).order('created_at', { ascending: false }).limit(200),
  ])

  const medewerkerIds = new Set<string>()
  for (const g of gebeurtenissen.data ?? []) {
    if (g.door) medewerkerIds.add(g.door)
    if (g.naar_actiehouder_id) medewerkerIds.add(g.naar_actiehouder_id)
  }
  for (const n of notities.data ?? []) if (n.medewerker_id) medewerkerIds.add(n.medewerker_id)

  const namen = new Map<string, string | null>()
  if (medewerkerIds.size > 0) {
    const { data: mensen } = await supabase.from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam')
      .in('id', [...medewerkerIds])
    for (const m of mensen ?? []) namen.set(m.id, naamVan(m))
  }

  const regels: TijdlijnRegel[] = []

  for (const g of gebeurtenissen.data ?? []) {
    const uitkomstLabel = g.uitkomst ? UITKOMST_LABELS[g.uitkomst as UitkomstSleutel] : null
    const naar = g.naar_actiehouder_id ? namen.get(g.naar_actiehouder_id) ?? null : null
    regels.push({
      id: `g-${g.id}`,
      op: g.op,
      soort: g.soort as TijdlijnRegel['soort'],
      kop: g.soort === 'overdracht'
        ? `Overgedragen aan ${naar ?? 'collega'}`
        : uitkomstLabel ?? (g.soort === 'contact' ? 'Klantcontact' : 'Volgende stap gewijzigd'),
      tekst: g.tekst ?? null,
      door: g.door ? namen.get(g.door) ?? null : null,
    })
  }

  for (const f of fases.data ?? []) {
    // Alleen offertefases; opdracht- en aanvraagwissels vertroebelen de commerciële tijdlijn.
    if (!f.naar_offerte_substatus && f.naar_hoofdstatus !== 'opdracht') continue
    const naar = f.naar_hoofdstatus === 'opdracht' && !f.naar_offerte_substatus
      ? 'Gewonnen — opdracht'
      : faseLabel(f.naar_offerte_substatus)
    const van = f.van_offerte_substatus ? `${faseLabel(f.van_offerte_substatus)} → ` : ''
    regels.push({
      id: `f-${f.id}`,
      op: f.op,
      soort: 'fase',
      kop: `Fase: ${van}${naar}`,
      tekst: f.reden ?? null,
      door: null,
    })
  }

  for (const n of notities.data ?? []) {
    regels.push({
      id: `n-${n.id}`,
      op: n.created_at,
      soort: 'notitie',
      kop: 'Notitie',
      tekst: n.inhoud ?? null,
      door: n.medewerker_id ? namen.get(n.medewerker_id) ?? null : null,
    })
  }

  return regels.sort((a, b) => (a.op < b.op ? 1 : a.op > b.op ? -1 : 0))
}

const FASE_LABELS: Record<string, string> = {
  concept: 'Concept',
  verzonden: 'Verzonden',
  nabellen: 'Nabellen',
  in_behandeling: 'In behandeling',
  mondelinge_toezegging: 'Mondelinge toezegging',
  gewonnen: 'Gewonnen',
  verloren: 'Verloren',
  vervallen: 'Vervallen',
}

function faseLabel(sleutel: string | null): string {
  if (!sleutel) return 'onbekend'
  return FASE_LABELS[sleutel] ?? sleutel
}

// ── Schrijven ────────────────────────────────────────────────────────────────

export type StapInvoer = {
  eigenaarId?: string | null
  actiehouderId?: string | null
  stapSoort?: StapSoort | null
  stapTekst?: string | null
  stapDatum?: string | null
  wachtOp?: WachtOp | null
  kansPct?: number | null
  verwachteOpdracht?: string | null
}

/** Haalt de kaart op of maakt hem aan. Eén kaart per dossier — het unieke index bewaakt dat. */
async function kaartVoorDossier(
  supabase: AdminClient,
  dossierId: string,
): Promise<BewakingKaart | null> {
  const { data } = await supabase.from('commercie_bewaking')
    .select(KAART_VELDEN).eq('dossier_id', dossierId).maybeSingle()
  if (data) return data as BewakingKaart

  const { data: nieuw, error } = await supabase.from('commercie_bewaking')
    .insert({ dossier_id: dossierId, soort: 'offerte' })
    .select(KAART_VELDEN).single()
  if (error) {
    // Race met een gelijktijdige aanmaak: de unieke index won, lees de bestaande rij.
    const { data: bestaand } = await supabase.from('commercie_bewaking')
      .select(KAART_VELDEN).eq('dossier_id', dossierId).maybeSingle()
    return (bestaand as BewakingKaart | null) ?? null
  }
  return nieuw as BewakingKaart
}

/** Meldt de nieuwe actiehouder dat de bal bij hem ligt. Stil bij fouten — zie maak.ts. */
async function meldActiehouder(
  supabase: AdminClient,
  opts: { dossierId: string; actiehouderId: string; door: CurrentMedewerker; stapTekst: string | null; stapDatum: string | null },
): Promise<void> {
  if (opts.actiehouderId === opts.door.id) return // jezelf toewijzen hoeft geen melding

  const [{ data: mw }, { data: dossier }] = await Promise.all([
    supabase.from('medewerkers').select('auth_user_id').eq('id', opts.actiehouderId).maybeSingle(),
    supabase.from('dossiers').select('titel').eq('id', opts.dossierId).maybeSingle(),
  ])
  if (!mw?.auth_user_id) return

  const wanneer = opts.stapDatum ? ` · uiterlijk ${opts.stapDatum}` : ''
  await maakNotificatie({
    user_id: mw.auth_user_id,
    type: 'offertebewaking',
    titel: 'Offertebewaking: jij bent aan zet',
    body: `${opts.stapTekst ?? 'Volgende stap'}${wanneer}`,
    url: `/offertes/${opts.dossierId}/bewaking`,
    dossier_id: opts.dossierId,
    dossier_naam: dossier?.titel ?? null,
  })
}

/**
 * Zet of wijzigt de volgende stap (ook gebruikt voor de eerste triage).
 *
 * De schemabeperkingen dwingen af dat een stap compleet is: tekst, datum én actiehouder, en
 * bij wachten ook waarop gewacht wordt. Een onvolledige stap kan dus niet in de database
 * belanden, ook niet als een toekomstig scherm dat zou proberen.
 */
export async function slaStapOp(dossierId: string, invoer: StapInvoer): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  const supabase = createAdminClient()

  const kaart = await kaartVoorDossier(supabase, dossierId)
  if (!kaart) return { ok: false, error: 'Kon de bewakingskaart niet aanmaken.' }

  const vorigeActiehouder = kaart.actiehouder_id
  const update: KaartUpdate = {}
  if (invoer.eigenaarId !== undefined) update.eigenaar_id = invoer.eigenaarId
  if (invoer.actiehouderId !== undefined) update.actiehouder_id = invoer.actiehouderId
  if (invoer.stapSoort !== undefined) update.stap_soort = invoer.stapSoort
  if (invoer.stapTekst !== undefined) update.stap_tekst = invoer.stapTekst
  if (invoer.stapDatum !== undefined) update.stap_datum = invoer.stapDatum
  if (invoer.wachtOp !== undefined) update.wacht_op = invoer.wachtOp
  if (invoer.kansPct !== undefined) update.kans_pct = invoer.kansPct
  if (invoer.verwachteOpdracht !== undefined) update.verwachte_opdracht = invoer.verwachteOpdracht

  // Raakt iemand de stap zelf aan, dan is hij vanaf nu handmatig: de synchronisatie met de
  // actielijst laat hem met rust. `taak_id` blijft wél staan — de actie waar deze stap uit
  // voortkwam blijft dezelfde afspraak, en die moet mee af zodra de uitkomst wordt vastgelegd.
  if (invoer.stapSoort !== undefined || invoer.stapTekst !== undefined || invoer.stapDatum !== undefined) {
    update.stap_bron = 'handmatig'
  }

  // Eerste keer dat er een eigenaar én een stap staat: de triage is gedaan. Vanaf dat moment
  // toont de kaart niet langer "nog niet beoordeeld".
  const krijgtEigenaar = (update.eigenaar_id ?? kaart.eigenaar_id) != null
  const krijgtStap = (update.stap_soort ?? kaart.stap_soort) != null
  if (!kaart.getrieerd_op && krijgtEigenaar && krijgtStap) {
    update.getrieerd_op = new Date().toISOString()
    update.getrieerd_door = medewerker.id
  }

  const { error } = await supabase.from('commercie_bewaking').update(update).eq('id', kaart.id)
  if (error) return { ok: false, error: vertaalDbFout(error.message) }

  const nieuweActiehouder = (update.actiehouder_id ?? kaart.actiehouder_id) as string | null
  const gewisseld = nieuweActiehouder != null && nieuweActiehouder !== vorigeActiehouder

  await supabase.from('commercie_gebeurtenissen').insert({
    bewaking_id: kaart.id,
    soort: gewisseld ? 'overdracht' : 'stap',
    tekst: (update.stap_tekst ?? kaart.stap_tekst) as string | null,
    naar_actiehouder_id: gewisseld ? nieuweActiehouder : null,
    door: medewerker.id,
  })

  if (gewisseld && nieuweActiehouder) {
    await meldActiehouder(supabase, {
      dossierId, actiehouderId: nieuweActiehouder, door: medewerker,
      stapTekst: (update.stap_tekst ?? kaart.stap_tekst) as string | null,
      stapDatum: (update.stap_datum ?? kaart.stap_datum) as string | null,
    })
  }

  revalidatePath(`/offertes/${dossierId}/bewaking`)
  revalidatePath('/offertes')
  return { ok: true }
}

export type UitkomstInvoer = {
  uitkomst: UitkomstSleutel
  /** Het feit: wat is er gezegd of gebeurd. Kort. */
  tekst?: string | null
  /** Overschrijft de voorgestelde staptekst. */
  stapTekst?: string | null
  /** Verplicht bij uitkomsten die om een datum vragen (ALV, uitstel). */
  stapDatum?: string | null
  /** Verplicht bij uitkomsten die de kaart overdragen. */
  actiehouderId?: string | null
  /** Verplicht bij 'verloren'. */
  reden?: string | null
  redenToelichting?: string | null
  /** Tweede poging na een Bouw7-conflict: tóch overschrijven. */
  forceerBouw7?: boolean
}

/**
 * Het hart van de module: één uitkomst na een klantcontact bepaalt in één keer de fase, de
 * volgende stap, de actiehouder en de datum. Dat is wat de keten gesloten houdt — er bestaat
 * geen pad waarbij een gesprek wordt vastgelegd zonder dat duidelijk is wat er daarna gebeurt.
 */
export async function legUitkomstVast(
  dossierId: string,
  invoer: UitkomstInvoer,
): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  const def = UITKOMSTEN.find(u => u.sleutel === invoer.uitkomst)
  if (!def) return { ok: false, error: 'Onbekende uitkomst.' }

  if (def.vraagtDatum && !invoer.stapDatum) {
    return { ok: false, error: 'Vul een datum in — zonder datum raakt de offerte uit beeld.' }
  }
  if (def.vraagtReden && !invoer.reden) {
    return { ok: false, error: 'Kies een reden. Die komt terug in de verkooprapportage.' }
  }
  if (def.vraagtActiehouder && !invoer.actiehouderId) {
    return { ok: false, error: 'Kies wie deze stap oppakt.' }
  }

  const supabase = createAdminClient()
  const kaart = await kaartVoorDossier(supabase, dossierId)
  if (!kaart) return { ok: false, error: 'Kon de bewakingskaart niet aanmaken.' }

  // 1. Fase. Via updateDossierSubstatus, zodat Bouw7 meebeweegt en een conflict met de
  //    tweede Bouw7-app de wijziging netjes afbreekt in plaats van stil te overschrijven.
  if (def.fase) {
    const res = await updateDossierSubstatus(dossierId, def.fase as never, {
      schrijfBouw7: true,
      forceerBouw7: invoer.forceerBouw7 === true,
    })
    if (!res.ok) return { ok: false, error: res.error, conflict: res.conflict }

    if (def.vraagtReden && invoer.reden) {
      await legVerliesRedenVast(supabase, dossierId, invoer.reden, invoer.redenToelichting)
    }
  }

  // 2. De volgende stap. Bij 'verloren' is er geen vervolg: de stap wordt leeggemaakt zodat de
  //    kaart niet met een openstaande actie blijft staan.
  const vorigeActiehouder = kaart.actiehouder_id
  const stapDatum = def.stapSoort
    ? invoer.stapDatum ?? (def.werkdagen != null ? werkdagenVooruit(vandaagNL(), def.werkdagen) : null)
    : null
  const actiehouder = invoer.actiehouderId ?? kaart.actiehouder_id ?? medewerker.id

  const update: KaartUpdate = {
    stap_soort: def.stapSoort,
    stap_tekst: def.stapSoort ? invoer.stapTekst || def.stapTekst : null,
    stap_datum: stapDatum,
    wacht_op: def.wachtOp,
    actiehouder_id: def.stapSoort ? actiehouder : kaart.actiehouder_id,
    // Wie nog geen eigenaar had krijgt hem nu: wie een uitkomst vastlegt, is er duidelijk mee bezig.
    eigenaar_id: kaart.eigenaar_id ?? medewerker.id,
    // Vanaf hier is dit een commerciële beslissing, geen afgeleide uit de actielijst.
    stap_bron: 'handmatig',
  }
  if (def.kans != null) update.kans_pct = def.kans
  if (!kaart.getrieerd_op) {
    update.getrieerd_op = new Date().toISOString()
    update.getrieerd_door = medewerker.id
  }

  const { error } = await supabase.from('commercie_bewaking').update(update).eq('id', kaart.id)
  if (error) return { ok: false, error: vertaalDbFout(error.message) }

  // 2b. De gekoppelde actie mee afronden. Kwam de stap uit de actielijst ("Offerte nabellen"),
  //     dan is die afspraak nu uitgevoerd — het gesprek is immers net vastgelegd. Zou hij open
  //     blijven staan, dan zie je dezelfde offerte twee keer: één keer op de kaart met de nieuwe
  //     stap en één keer in de actielijst met de oude deadline. Pas ná een geslaagde afronding
  //     laten we de koppeling los; mislukt het (een doorloopcontrole in updateTaakStatus), dan
  //     blijft de koppeling staan en probeert de volgende uitkomst het opnieuw.
  if (kaart.taak_id) {
    const afgerond = await updateTaakStatus(kaart.taak_id, 'gereed').then(() => true, () => false)
    if (afgerond) await supabase.from('commercie_bewaking').update({ taak_id: null }).eq('id', kaart.id)
  }

  // 3. De tijdlijn.
  await supabase.from('commercie_gebeurtenissen').insert({
    bewaking_id: kaart.id,
    soort: 'contact',
    uitkomst: def.sleutel,
    tekst: [invoer.tekst, invoer.reden && `Reden: ${invoer.reden}`, invoer.redenToelichting]
      .filter(Boolean).join(' · ') || null,
    naar_actiehouder_id:
      def.stapSoort && actiehouder !== vorigeActiehouder ? actiehouder : null,
    door: medewerker.id,
  })

  // 4. De melding, alleen bij een echte overdracht.
  if (def.stapSoort && actiehouder !== vorigeActiehouder) {
    await meldActiehouder(supabase, {
      dossierId, actiehouderId: actiehouder, door: medewerker,
      stapTekst: (update.stap_tekst as string | null) ?? null,
      stapDatum,
    })
  }

  revalidatePath(`/offertes/${dossierId}/bewaking`)
  revalidatePath('/offertes')
  return { ok: true }
}

/**
 * Legt de verliesreden vast nádat de fase al op 'verloren' is gezet — het pad dat het
 * offertebord gebruikt, waar het slepen naar de kolom de statuswijziging al heeft gedaan.
 *
 * Roep dit dus altijd ná de statuswijziging aan: de DB-trigger moet de historierij hebben
 * geschreven voordat er iets aan te vullen valt.
 */
export async function legVerliesRedenVastActie(
  dossierId: string,
  reden: string,
  toelichting?: string | null,
): Promise<ActieResultaat> {
  await vereisRecht('dossiers', 'schrijven')
  const supabase = createAdminClient()
  await legVerliesRedenVast(supabase, dossierId, reden, toelichting)
  revalidatePath('/offertes')
  return { ok: true }
}

/**
 * Vult de reden aan op de historierij die de DB-trigger zojuist schreef.
 *
 * Waarom aanvullen en niet zelf een rij maken: `dossier_status_historie` is de bron voor
 * doorlooptijd per fase. Een extra rij zou daar als een tweede fasewissel tellen en de
 * cijfers vervuilen.
 */
async function legVerliesRedenVast(
  supabase: AdminClient,
  dossierId: string,
  reden: string,
  toelichting?: string | null,
): Promise<void> {
  const { data } = await supabase.from('dossier_status_historie')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('naar_offerte_substatus', 'verloren')
    .is('reden', null)
    .order('op', { ascending: false })
    .limit(1)

  const rij = (data ?? [])[0]
  if (!rij) return
  const volledig = toelichting ? `${reden} — ${toelichting}` : reden
  await supabase.from('dossier_status_historie').update({ reden: volledig }).eq('id', rij.id)
}

/**
 * Databasefouten die een gebruiker kan veroorzaken, in gewone taal. De check-constraints zijn
 * het vangnet onder de formuliervalidatie; als er één afgaat, moet de gebruiker weten wat
 * eraan ontbreekt in plaats van een Postgres-melding te zien.
 */
function vertaalDbFout(bericht: string): string {
  if (bericht.includes('commercie_bewaking_stap_compleet')) {
    return 'Een volgende stap heeft altijd een omschrijving, een datum en iemand die hem oppakt.'
  }
  if (bericht.includes('commercie_bewaking_wacht_op')) {
    return 'Geef aan bij wie de bal ligt: de klant, een collega of een derde partij.'
  }
  return bericht
}

// ── Home-widget ──────────────────────────────────────────────────────────────

export type BewakingWidgetRegel = {
  dossier_id: string
  titel: string
  dossiernummer: string | null
  status: BewakingStatus
  stap: string | null
  datum: string | null
}

export type BewakingWidgetData = {
  /** De urgentste regels, verlopen eerst. Kort gehouden — dit is een startpagina, geen lijst. */
  regels: BewakingWidgetRegel[]
  verlopen: number
  vandaag: number
  wachtend: number
  /** Alle lopende kansen waar deze medewerker eigenaar of actiehouder van is. */
  totaal: number
}

const LEEG: BewakingWidgetData = { regels: [], verlopen: 0, vandaag: 0, wachtend: 0, totaal: 0 }

/**
 * De offertes waar jíj aan zet bent, voor de startpagina.
 *
 * Bewust een eigen query en niet `getMijnDossiers`: die filtert op de dossierrollen
 * (projectleider, calculator), terwijl commerciële opvolging juist op de actiehouder draait —
 * wie nabelt is meestal niet de calculator. Eigenaar telt mee, zodat een grote kans ook
 * zichtbaar blijft voor wie er eindverantwoordelijk voor is.
 *
 * Geen bedragen hier: die zouden uit een andere bron komen dan de kaart en dan gaan twee
 * schermen een ander getal tonen. De widget is een lijstje werk, geen omzetoverzicht.
 */
export async function getMijnBewaking(limiet = 5): Promise<BewakingWidgetData> {
  // Gate op het dossier-recht, niet alleen op "is er een sessie": deze widget toont
  // dossiertitels. Wie dat recht niet heeft, hoort ze ook op de startpagina niet te zien —
  // de aanroeper vangt de fout af en toont een lege widget.
  const { medewerker } = await vereisRecht('dossiers', 'lezen')
  if (!medewerker) return LEEG

  const supabase = createAdminClient()
  // Begrensd door "kansen van één medewerker" — ruim onder de PostgREST-grens.
  const { data, error } = await supabase
    .from('commercie_bewaking')
    // Eén literal, geen samengestelde string: zie de toelichting bij KAART_VELDEN.
    .select('dossier_id,stap_soort,stap_tekst,stap_datum,wacht_op,dossiers!inner(titel,dossiernummer,hoofdstatus,offerte_substatus)')
    .or(`actiehouder_id.eq.${medewerker.id},eigenaar_id.eq.${medewerker.id}`)

  if (error || !data) return LEEG

  const vandaagStr = vandaagNL()
  const uit: BewakingWidgetRegel[] = []
  let verlopen = 0, vandaag = 0, wachtend = 0

  for (const rij of data) {
    // PostgREST levert de ingesloten relatie als object of als array, afhankelijk van de
    // kardinaliteit die hij afleidt; beide vormen afvangen in plaats van op één gokken.
    const d = (Array.isArray(rij.dossiers) ? rij.dossiers[0] : rij.dossiers) as {
      titel: string | null
      dossiernummer: string | null
      hoofdstatus: string | null
      offerte_substatus: string | null
    } | null
    if (!d || !rij.dossier_id) continue

    const afgerond = isAfgerond(d.hoofdstatus, d.offerte_substatus)
    const stapSoort = rij.stap_soort === 'actie' || rij.stap_soort === 'wachten' ? rij.stap_soort : null
    const wachtOp =
      rij.wacht_op === 'klant' || rij.wacht_op === 'intern' || rij.wacht_op === 'extern'
        ? rij.wacht_op
        : null

    const status = bewakingsStatus(
      { stap_soort: stapSoort, stap_datum: rij.stap_datum, wacht_op: wachtOp },
      { vandaag: vandaagStr, afgerond },
    )
    if (status === 'afgerond') continue

    if (status === 'verlopen') verlopen++
    else if (status === 'nu') vandaag++
    else if (status.startsWith('wacht')) wachtend++

    uit.push({
      dossier_id: rij.dossier_id,
      titel: d.titel ?? 'Zonder titel',
      dossiernummer: d.dossiernummer,
      status,
      stap: stapOmschrijving({
        stap_soort: stapSoort, stap_tekst: rij.stap_tekst,
        stap_datum: rij.stap_datum, wacht_op: wachtOp,
      }),
      datum: rij.stap_datum,
    })
  }

  // Urgentst eerst: verlopen, dan vandaag, dan de rest op datum.
  const rang: Record<string, number> = { verlopen: 0, nu: 1, ongetrieerd: 2, op_schema: 3 }
  uit.sort((a, b) => {
    const ra = rang[a.status] ?? 4
    const rb = rang[b.status] ?? 4
    if (ra !== rb) return ra - rb
    return (a.datum ?? '9999') < (b.datum ?? '9999') ? -1 : 1
  })

  return { regels: uit.slice(0, limiet), verlopen, vandaag, wachtend, totaal: uit.length }
}

// ── Verstuurde offertes bij een dossier ──────────────────────────────────────

export type OfferteRegel = {
  id: string
  nummer: string | null
  onderwerp: string | null
  datum: string | null
  status: string | null
  bedrag: number | null
  calculator: string | null
}

/**
 * De Bouw7-offertes onder dit project, nieuwste eerst.
 *
 * Onder één project kunnen er meerdere hangen; zonder deze lijst zie je op de kaart alleen een
 * totaalbedrag en niet wélke offerte openstaat. Leesbron is `bouw7_offertes`, gevuld door
 * `syncBouw7Offertes` — dit zijn dus Bouw7-gegevens, geen EVA-administratie.
 */
export async function getOffertesVoorDossier(dossierId: string): Promise<OfferteRegel[]> {
  await vereisRecht('dossiers', 'lezen')
  const supabase = createAdminClient()

  // Begrensd op één dossier; blijft ruim onder de PostgREST-grens.
  const { data } = await supabase
    .from('bouw7_offertes')
    .select('id,nummer,onderwerp,datum,status,subtotaal_excl_btw,calculator_naam')
    .eq('dossier_id', dossierId)
    .order('datum', { ascending: false, nullsFirst: false })

  return (data ?? []).map(r => ({
    id: r.id,
    nummer: r.nummer,
    onderwerp: r.onderwerp,
    datum: r.datum,
    status: r.status,
    bedrag: r.subtotaal_excl_btw,
    calculator: r.calculator_naam,
  }))
}
