'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { bepaalBeoordeelContext } from './autorisatie'
import { bepaalBeoordelingsRoute, haalBeoordelaar, magBeoordelaarZijn } from './beoordelaars'
import { maakBeoordeelTaak, sluitBeoordeelTaken, type BeoordeelTaakResultaat } from './taken'
import { berekenWerkbegrotingStatus } from './werkbegroting-status'
import { maakNotificatie } from '@/lib/notificaties/maak'
import {
  AFKEUR_TAAK_TITEL, BEOORDEEL_TAAK_TITEL, naarRegelSnapshot,
  type BeoordelaarRef, type BeoordelingsRoute,
  type Goedkeuring, type GoedkeuringGebeurtenis, type GoedkeuringMetDetails,
  type GoedkeuringObjectType, type GoedkeuringOpmerking, type GoedkeuringRegelSnapshot, type GoedkeuringRol,
} from './types'

// ─── Interne helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any
}

async function medewerkerNamen(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniek = [...new Set(ids.filter((v): v is string => !!v))]
  if (uniek.length === 0) return new Map()
  const { data } = await admin()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .in('id', uniek)
  return new Map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).map((m: any) => [m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')]),
  )
}

async function logGebeurtenis(
  goedkeuringId: string,
  actie: GoedkeuringGebeurtenis['actie'],
  medewerkerId: string | null,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await admin().from('goedkeuring_gebeurtenissen').insert({
    goedkeuring_id: goedkeuringId,
    actie,
    medewerker_id: medewerkerId,
    detail,
  })
}

async function getGoedkeuringRij(goedkeuringId: string): Promise<Goedkeuring | null> {
  const { data } = await admin().from('goedkeuringen').select('*').eq('id', goedkeuringId).maybeSingle()
  return (data as Goedkeuring | null) ?? null
}

// ─── Ophalen ──────────────────────────────────────────────────────────────────

export type GoedkeuringOverzicht = {
  /** Openstaande of laatste ronde (null = nog nooit aangevraagd). */
  actueel: GoedkeuringMetDetails | null
  /** Alle rondes, nieuwste eerst. */
  historie: GoedkeuringMetDetails[]
  /** Regel-snapshot van de laatste goedgekeurde ronde (alleen werkbegroting). */
  regelSnapshot: GoedkeuringRegelSnapshot[]
  /** Rol van de ingelogde gebruiker t.o.v. de actuele aanvraag. */
  rol: GoedkeuringRol
  magBeoordelen: boolean
}

export async function getGoedkeuring(
  objectType: GoedkeuringObjectType,
  objectId: string,
): Promise<GoedkeuringOverzicht> {
  const db = admin()

  const { data: rondes } = await db
    .from('goedkeuringen')
    .select('*')
    .eq('object_type', objectType)
    .eq('object_id', objectId)
    .order('ronde', { ascending: false })

  const lijst = (rondes ?? []) as Goedkeuring[]
  const ids = lijst.map(g => g.id)

  let opmerkingen: (GoedkeuringOpmerking & { medewerker_naam: string | null })[] = []
  let gebeurtenissen: GoedkeuringGebeurtenis[] = []
  if (ids.length > 0) {
    const [{ data: opm }, { data: geb }] = await Promise.all([
      db.from('goedkeuring_opmerkingen').select('*').in('goedkeuring_id', ids).order('created_at', { ascending: true }),
      db.from('goedkeuring_gebeurtenissen').select('*').in('goedkeuring_id', ids).order('created_at', { ascending: true }),
    ])
    opmerkingen = (opm ?? []) as typeof opmerkingen
    gebeurtenissen = (geb ?? []) as GoedkeuringGebeurtenis[]
  }

  const namen = await medewerkerNamen([
    ...lijst.flatMap(g => [g.aangevraagd_door, g.beoordelaar_id, g.beoordeeld_door, g.gedelegeerd_aan, ...(g.meekijkers ?? [])]),
    ...opmerkingen.map(o => o.medewerker_id),
    ...gebeurtenissen.map(g => g.medewerker_id),
  ])
  const naam = (id: string | null | undefined) => (id ? namen.get(id) ?? null : null)

  const historie: GoedkeuringMetDetails[] = lijst.map(g => ({
    ...g,
    meekijkers: g.meekijkers ?? [],
    aangevraagd_door_naam: naam(g.aangevraagd_door),
    beoordelaar_naam: naam(g.beoordelaar_id),
    beoordeeld_door_naam: naam(g.beoordeeld_door),
    gedelegeerd_aan_naam: naam(g.gedelegeerd_aan),
    meekijker_namen: (g.meekijkers ?? []).map(id => namen.get(id) ?? '?'),
    opmerkingen: opmerkingen.filter(o => o.goedkeuring_id === g.id).map(o => ({ ...o, medewerker_naam: naam(o.medewerker_id) })),
    gebeurtenissen: gebeurtenissen.filter(e => e.goedkeuring_id === g.id).map(e => ({ ...e, medewerker_naam: naam(e.medewerker_id) })),
  }))

  const actueel = historie.find(g => g.status === 'aangevraagd') ?? historie[0] ?? null

  // Regel-snapshot van de laatste goedgekeurde ronde (voor de badges).
  let regelSnapshot: GoedkeuringRegelSnapshot[] = []
  if (objectType === 'werkbegroting') {
    const goedgekeurd = historie.find(g => g.status === 'goedgekeurd')
    if (goedgekeurd) {
      const { data: rows } = await db
        .from('werkbegroting_goedkeuring_regels')
        .select('regel_id, regel_hash, kosten_centen')
        .eq('goedkeuring_id', goedgekeurd.id)
      regelSnapshot = (rows ?? []).map(naarRegelSnapshot)
    }
  }

  const ctx = await bepaalBeoordeelContext(actueel?.dossier_id ?? null, actueel)
  return { actueel, historie, regelSnapshot, rol: ctx.rol, magBeoordelen: ctx.magBeoordelen }
}

// ─── Aanvragen ────────────────────────────────────────────────────────────────

/** Wie kan deze aanvraag beoordelen? Voedt de beoordelaar-keuze in het paneel. */
export async function getBeoordelingsRoute(dossierId: string | null): Promise<BeoordelingsRoute> {
  return bepaalBeoordelingsRoute(dossierId)
}

export type VraagGoedkeuringResultaat =
  | {
      ok: true
      goedkeuringId: string
      bestond: boolean
      taak: BeoordeelTaakResultaat | null
      /** Naam van de beoordelaar bij wie de aanvraag nu ligt. */
      beoordelaarNaam: string | null
      /** Gezet als de aanvraag wél is vastgelegd maar niet iedereen bereikt is. */
      waarschuwing: string | null
    }
  | { ok: false; error: string; keuzeNodig?: boolean }

export async function vraagGoedkeuringAan(opts: {
  objectType: GoedkeuringObjectType
  objectId: string
  dossierId: string | null
  toelichting?: string
  /** Expliciet gekozen beoordelaar — verplicht als het dossier geen controller heeft. */
  beoordelaarId?: string | null
}): Promise<VraagGoedkeuringResultaat> {
  const db = admin()
  const ctx = await bepaalBeoordeelContext(opts.dossierId)
  if (!ctx.medewerker) return { ok: false, error: 'Niet ingelogd of geen medewerker-profiel.' }

  // Bestaat er al een open aanvraag? Dan die teruggeven (geen dubbele).
  const { data: open } = await db
    .from('goedkeuringen')
    .select('id, beoordelaar_id')
    .eq('object_type', opts.objectType)
    .eq('object_id', opts.objectId)
    .eq('status', 'aangevraagd')
    .maybeSingle()
  if (open) {
    const bestaande = open.beoordelaar_id ? await haalBeoordelaar(open.beoordelaar_id) : null
    return {
      ok: true, goedkeuringId: open.id, bestond: true, taak: null,
      beoordelaarNaam: bestaande?.naam ?? null, waarschuwing: null,
    }
  }

  // Beoordelaar vóór het opslaan vaststellen: een aanvraag zonder duidelijke ontvanger
  // blijft liggen zonder dat iemand dat merkt. Heeft het dossier geen controller, dan
  // moet de aanvrager zelf een directielid aanwijzen.
  const route = await bepaalBeoordelingsRoute(opts.dossierId)
  let beoordelaar: BeoordelaarRef | null = null
  if (opts.beoordelaarId) {
    if (!(await magBeoordelaarZijn(opts.dossierId, opts.beoordelaarId))) {
      return { ok: false, error: 'Deze medewerker kan de aanvraag niet beoordelen. Kies de controller of een directielid.' }
    }
    beoordelaar = await haalBeoordelaar(opts.beoordelaarId)
  } else if (route.controller) {
    beoordelaar = route.controller
  } else if (route.keuzeNodig) {
    return {
      ok: false,
      keuzeNodig: true,
      error: 'Dit dossier heeft geen controller. Kies wie de aanvraag beoordeelt.',
    }
  }

  const { data: vorige } = await db
    .from('goedkeuringen')
    .select('ronde')
    .eq('object_type', opts.objectType)
    .eq('object_id', opts.objectId)
    .order('ronde', { ascending: false })
    .limit(1)
    .maybeSingle()
  const ronde = (vorige?.ronde ?? 0) + 1

  const { data: nieuw, error } = await db
    .from('goedkeuringen')
    .insert({
      object_type: opts.objectType,
      object_id: opts.objectId,
      dossier_id: opts.dossierId,
      ronde,
      status: 'aangevraagd',
      toelichting: opts.toelichting?.trim() || null,
      aangevraagd_door: ctx.medewerker.id,
      beoordelaar_id: beoordelaar?.id ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: `Aanvraag opslaan mislukt: ${error.message}` }

  await logGebeurtenis(nieuw.id, 'aangevraagd', ctx.medewerker.id, { ronde, toelichting: opts.toelichting ?? null })
  if (opts.toelichting?.trim()) {
    await db.from('goedkeuring_opmerkingen').insert({
      goedkeuring_id: nieuw.id,
      medewerker_id: ctx.medewerker.id,
      tekst: opts.toelichting.trim(),
    })
  }

  // Beoordeeltaak voor de vastgestelde beoordelaar.
  let taak: BeoordeelTaakResultaat | null = null
  if (opts.dossierId) {
    try {
      taak = await maakBeoordeelTaak(opts.dossierId, BEOORDEEL_TAAK_TITEL[opts.objectType], beoordelaar?.id ?? null)
    } catch {
      // Taak is ondersteunend — aanvraag zelf is al vastgelegd.
    }
  }

  // Melding voor de beoordelaar: dit is het signaal dat er iets op hem wacht.
  // Best effort — de aanvraag zelf mag hier niet op stuklopen.
  try {
    await notificeerBeoordelaar({
      objectType: opts.objectType,
      objectId: opts.objectId,
      dossierId: opts.dossierId,
      beoordelaar,
      aanvragerId: ctx.medewerker.id,
      aanvragerNaam: [ctx.medewerker.voornaam, ctx.medewerker.tussenvoegsel, ctx.medewerker.achternaam]
        .filter(Boolean).join(' ') || null,
    })
  } catch { /* ondersteunend */ }

  // Offerte in aanvraag-fase → substatus 'controle_begroting'.
  if (opts.objectType === 'offerte' && opts.dossierId) {
    await zetAanvraagSubstatus(opts.dossierId, 'controle_begroting')
  }

  const waarschuwing = !beoordelaar
    ? 'Er is geen controller en geen directielid gevonden — niemand heeft een melding gekregen.'
    : !beoordelaar.authUserId
    ? `${beoordelaar.naam} heeft geen EVA-login, dus kon er geen melding worden verstuurd.`
    : !opts.dossierId
    ? 'Deze aanvraag hangt niet aan een dossier, dus er is geen taak aangemaakt — de melding is wel verstuurd.'
    : null

  return { ok: true, goedkeuringId: nieuw.id, bestond: false, taak, beoordelaarNaam: beoordelaar?.naam ?? null, waarschuwing }
}

/**
 * Zet een belletje-notificatie klaar voor de beoordelaar: er wacht een offerte of
 * werkbegroting op zijn akkoord. Slaat over als de beoordelaar zichzelf aanwijst of
 * geen gekoppeld auth-account heeft.
 */
async function notificeerBeoordelaar(opts: {
  objectType: GoedkeuringObjectType
  objectId: string
  dossierId: string | null
  beoordelaar: BeoordelaarRef | null
  aanvragerId: string | null
  aanvragerNaam: string | null
}): Promise<void> {
  const { beoordelaar } = opts
  if (!beoordelaar?.authUserId) return
  if (opts.aanvragerId && beoordelaar.id === opts.aanvragerId) return

  const db = admin()

  let dossierTitel: string | null = null
  if (opts.dossierId) {
    const { data: dossier } = await db.from('dossiers').select('titel, dossiernummer').eq('id', opts.dossierId).maybeSingle()
    dossierTitel = dossier ? [dossier.dossiernummer, dossier.titel].filter(Boolean).join(' — ') : null
  }

  const isWb = opts.objectType === 'werkbegroting'
  const onderwerp = isWb ? 'de werkbegroting' : 'de offerte'
  // De beoordelaar landt op het scherm waar de accordeerknop staat.
  const url = isWb
    ? (opts.dossierId ? `/opdrachten/${opts.dossierId}/werkbegroting` : null)
    : `/everts-calc/quotes/${opts.objectId}/preview`

  await maakNotificatie({
    user_id:      beoordelaar.authUserId,
    type:         'algemeen',
    titel:        isWb ? 'Werkbegroting ter goedkeuring' : 'Offerte ter goedkeuring',
    body:         `${opts.aanvragerNaam ?? 'Een collega'} vraagt je goedkeuring op ${onderwerp}${dossierTitel ? ` van ${dossierTitel}` : ''}.`,
    url,
    dossier_id:   opts.dossierId ?? null,
    dossier_naam: dossierTitel,
  })
}

/** Substatus-koppeling: alleen zetten als het dossier in de aanvraag-fase zit. */
async function zetAanvraagSubstatus(dossierId: string, substatus: 'controle_begroting' | 'offerte_gereed'): Promise<void> {
  const db = admin()
  const { data: dossier } = await db.from('dossiers').select('hoofdstatus').eq('id', dossierId).maybeSingle()
  if (dossier?.hoofdstatus !== 'aanvraag') return
  await db.from('dossiers').update({ aanvraag_substatus: substatus }).eq('id', dossierId)
  revalidatePath('/aanvragen')
}

// ─── Beoordelen ───────────────────────────────────────────────────────────────

export type BeoordeelResultaat = { ok: true } | { ok: false; error: string }

/**
 * Keur een aanvraag goed. Voor offertes wordt `objectHash` meegegeven (inhoud op
 * goedkeurmoment); voor werkbegrotingen schrijft `accordeerWerkbegroting` eerst de
 * regel-snapshots en roept daarna deze functie aan.
 */
export async function keurGoed(
  goedkeuringId: string,
  opts?: { opmerking?: string; objectHash?: string },
): Promise<BeoordeelResultaat> {
  const db = admin()
  const g = await getGoedkeuringRij(goedkeuringId)
  if (!g) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }
  if (g.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag staat niet meer open.' }

  const ctx = await bepaalBeoordeelContext(g.dossier_id, g)
  if (!ctx.magBeoordelen) return { ok: false, error: 'Je bent niet bevoegd om deze aanvraag te beoordelen.' }

  // Offerte: inhouds-hash op goedkeurmoment vastleggen — wijzigt de offerte daarna,
  // dan matcht de hash niet meer en is opnieuw goedkeuring nodig.
  let objectHash = opts?.objectHash ?? null
  if (!objectHash && g.object_type === 'offerte') {
    // Eerst de versie van een gekoppeld Word-document ophalen, zodat de
    // beoordelaar de actuele SharePoint-versie goedkeurt en niet een oudere.
    const { ververWordVersie } = await import('@/lib/everts-calc/offerte-word')
    await ververWordVersie(g.object_id).catch(() => null)
    const { berekenOfferteHash } = await import('./offerte')
    objectHash = await berekenOfferteHash(g.object_id)
  }

  const { error } = await db
    .from('goedkeuringen')
    .update({
      status: 'goedgekeurd',
      beoordeeld_door: ctx.medewerker!.id,
      beoordeeld_op: new Date().toISOString(),
      ...(objectHash ? { object_hash: objectHash } : {}),
    })
    .eq('id', goedkeuringId)
  if (error) return { ok: false, error: error.message }

  await logGebeurtenis(goedkeuringId, 'goedgekeurd', ctx.medewerker!.id, {})
  if (opts?.opmerking?.trim()) {
    await db.from('goedkeuring_opmerkingen').insert({
      goedkeuring_id: goedkeuringId,
      medewerker_id: ctx.medewerker!.id,
      tekst: opts.opmerking.trim(),
    })
  }

  if (g.dossier_id) {
    await sluitBeoordeelTaken(g.dossier_id, BEOORDEEL_TAAK_TITEL[g.object_type])
    if (g.object_type === 'offerte') await zetAanvraagSubstatus(g.dossier_id, 'offerte_gereed')
  }

  // Notificatie voor de aanvrager (PL): de goedkeuring is rond. Best effort — mag de
  // goedkeuring zelf niet laten falen.
  try {
    await notificeerAanvrager(g)
  } catch { /* ondersteunend */ }

  return { ok: true }
}

/**
 * Zet een belletje-notificatie klaar voor de aanvrager (PL) zodra zijn aanvraag is
 * goedgekeurd. Slaat over als de aanvrager de aanvraag zelf goedkeurde of geen
 * gekoppeld auth-account heeft.
 */
async function notificeerAanvrager(g: Goedkeuring): Promise<void> {
  if (!g.aangevraagd_door) return
  const db = admin()

  const { data: pl } = await db
    .from('medewerkers')
    .select('auth_user_id')
    .eq('id', g.aangevraagd_door)
    .maybeSingle()
  const authUserId: string | null = pl?.auth_user_id ?? null
  if (!authUserId) return

  let dossierTitel: string | null = null
  if (g.dossier_id) {
    const { data: dossier } = await db.from('dossiers').select('titel, dossiernummer').eq('id', g.dossier_id).maybeSingle()
    dossierTitel = dossier ? [dossier.dossiernummer, dossier.titel].filter(Boolean).join(' — ') : null
  }

  const isWb = g.object_type === 'werkbegroting'
  const url = g.dossier_id
    ? (isWb ? `/opdrachten/${g.dossier_id}/werkbegroting` : `/opdrachten/${g.dossier_id}`)
    : null

  await maakNotificatie({
    user_id:      authUserId,
    type:         'algemeen',
    titel:        isWb ? 'Werkbegroting goedgekeurd' : 'Offerte goedgekeurd',
    body:         dossierTitel
      ? `${isWb ? 'De werkbegroting' : 'De offerte'} van ${dossierTitel} is goedgekeurd.`
      : `${isWb ? 'De werkbegroting' : 'De offerte'} is goedgekeurd.`,
    url,
    dossier_id:   g.dossier_id ?? null,
    dossier_naam: dossierTitel,
  })
}

/** Terugsturen met verplichte opmerking; maakt een aanpas-taak voor de aanvrager. */
export async function keurAf(goedkeuringId: string, opmerking: string): Promise<BeoordeelResultaat> {
  const tekst = opmerking?.trim()
  if (!tekst) return { ok: false, error: 'Een opmerking is verplicht bij het terugsturen.' }

  const db = admin()
  const g = await getGoedkeuringRij(goedkeuringId)
  if (!g) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }
  if (g.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag staat niet meer open.' }

  const ctx = await bepaalBeoordeelContext(g.dossier_id, g)
  if (!ctx.magBeoordelen) return { ok: false, error: 'Je bent niet bevoegd om deze aanvraag te beoordelen.' }

  const { error } = await db
    .from('goedkeuringen')
    .update({
      status: 'afgekeurd',
      beoordeeld_door: ctx.medewerker!.id,
      beoordeeld_op: new Date().toISOString(),
    })
    .eq('id', goedkeuringId)
  if (error) return { ok: false, error: error.message }

  await logGebeurtenis(goedkeuringId, 'afgekeurd', ctx.medewerker!.id, { opmerking: tekst })
  await db.from('goedkeuring_opmerkingen').insert({
    goedkeuring_id: goedkeuringId,
    medewerker_id: ctx.medewerker!.id,
    tekst,
  })

  if (g.dossier_id) {
    await sluitBeoordeelTaken(g.dossier_id, BEOORDEEL_TAAK_TITEL[g.object_type])
    // Aanpas-taak voor de oorspronkelijke aanvrager.
    try {
      await maakBeoordeelTaak(g.dossier_id, AFKEUR_TAAK_TITEL[g.object_type], g.aangevraagd_door)
    } catch { /* ondersteunend */ }
  }

  return { ok: true }
}

/** Intrekken door de aanvrager (of een beoordelaar). */
export async function trekIn(goedkeuringId: string): Promise<BeoordeelResultaat> {
  const db = admin()
  const g = await getGoedkeuringRij(goedkeuringId)
  if (!g) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }
  if (g.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag staat niet meer open.' }

  const ctx = await bepaalBeoordeelContext(g.dossier_id, g)
  const isAanvrager = ctx.medewerker != null && g.aangevraagd_door === ctx.medewerker.id
  if (!isAanvrager && !ctx.magBeoordelen) return { ok: false, error: 'Alleen de aanvrager of een beoordelaar kan intrekken.' }

  const { error } = await db.from('goedkeuringen').update({ status: 'ingetrokken' }).eq('id', goedkeuringId)
  if (error) return { ok: false, error: error.message }

  await logGebeurtenis(goedkeuringId, 'ingetrokken', ctx.medewerker?.id ?? null, {})
  if (g.dossier_id) await sluitBeoordeelTaken(g.dossier_id, BEOORDEEL_TAAK_TITEL[g.object_type])
  return { ok: true }
}

// ─── Delegatie ────────────────────────────────────────────────────────────────

/** Overdragen: de aangewezen medewerker mag de aanvraag zelf goedkeuren of terugsturen. */
export async function draagOver(goedkeuringId: string, medewerkerId: string): Promise<BeoordeelResultaat> {
  const db = admin()
  const g = await getGoedkeuringRij(goedkeuringId)
  if (!g) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }
  if (g.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag staat niet meer open.' }

  const ctx = await bepaalBeoordeelContext(g.dossier_id, g)
  if (!ctx.magBeoordelen) return { ok: false, error: 'Alleen een beoordelaar kan de aanvraag overdragen.' }

  const { error } = await db.from('goedkeuringen').update({ gedelegeerd_aan: medewerkerId }).eq('id', goedkeuringId)
  if (error) return { ok: false, error: error.message }

  await logGebeurtenis(goedkeuringId, 'overgedragen', ctx.medewerker!.id, { aan: medewerkerId })

  // Beoordeeltaak voor de gedelegeerde.
  if (g.dossier_id) {
    try { await maakBeoordeelTaak(g.dossier_id, BEOORDEEL_TAAK_TITEL[g.object_type], medewerkerId) } catch { /* ondersteunend */ }
  }

  // Ook bij overdragen een melding — anders merkt de nieuwe beoordelaar het niet.
  try {
    await notificeerBeoordelaar({
      objectType: g.object_type,
      objectId: g.object_id,
      dossierId: g.dossier_id,
      beoordelaar: await haalBeoordelaar(medewerkerId),
      aanvragerId: ctx.medewerker!.id,
      aanvragerNaam: [ctx.medewerker!.voornaam, ctx.medewerker!.tussenvoegsel, ctx.medewerker!.achternaam]
        .filter(Boolean).join(' ') || null,
    })
  } catch { /* ondersteunend */ }

  return { ok: true }
}

/** Meekijken: de aangewezen medewerker kan inzien en opmerken, maar niet keuren. */
export async function voegMeekijkerToe(goedkeuringId: string, medewerkerId: string): Promise<BeoordeelResultaat> {
  const db = admin()
  const g = await getGoedkeuringRij(goedkeuringId)
  if (!g) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }
  if (g.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag staat niet meer open.' }

  const ctx = await bepaalBeoordeelContext(g.dossier_id, g)
  if (!ctx.magBeoordelen) return { ok: false, error: 'Alleen een beoordelaar kan een meekijker toevoegen.' }

  const meekijkers = [...new Set([...(g.meekijkers ?? []), medewerkerId])]
  const { error } = await db.from('goedkeuringen').update({ meekijkers }).eq('id', goedkeuringId)
  if (error) return { ok: false, error: error.message }

  await logGebeurtenis(goedkeuringId, 'meekijker_toegevoegd', ctx.medewerker!.id, { medewerker: medewerkerId })
  return { ok: true }
}

// ─── Opmerkingen ──────────────────────────────────────────────────────────────

export async function plaatsOpmerking(goedkeuringId: string, tekst: string): Promise<BeoordeelResultaat> {
  const inhoud = tekst?.trim()
  if (!inhoud) return { ok: false, error: 'Lege opmerking.' }

  const db = admin()
  const g = await getGoedkeuringRij(goedkeuringId)
  if (!g) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }

  const ctx = await bepaalBeoordeelContext(g.dossier_id, g)
  if (!ctx.medewerker) return { ok: false, error: 'Niet ingelogd.' }
  if (ctx.rol === 'geen') return { ok: false, error: 'Je bent niet betrokken bij deze aanvraag.' }

  const { error } = await db.from('goedkeuring_opmerkingen').insert({
    goedkeuring_id: goedkeuringId,
    medewerker_id: ctx.medewerker.id,
    tekst: inhoud,
  })
  if (error) return { ok: false, error: error.message }

  await logGebeurtenis(goedkeuringId, 'opmerking', ctx.medewerker.id, {})
  return { ok: true }
}

// ─── WB!-dossiervlag ──────────────────────────────────────────────────────────

/**
 * Werkt `dossiers.wb_ongeaccordeerde_wijzigingen` bij: true wanneer de werkbegroting
 * van het dossier ooit is geaccordeerd én er nu regels zijn die daar niet (meer)
 * onder vallen. Een werkbegroting die nog nooit is geaccordeerd geeft géén vlag —
 * daarvoor is de bestaande statuschip voldoende.
 */
export async function refreshDossierWbVlag(dossierId: string): Promise<void> {
  const db = admin()

  const { data: wb } = await db
    .from('werkbegrotingen')
    .select('id')
    .eq('dossier_id', dossierId)
    .order('bijgewerkt_op', { ascending: false })
    .limit(1)
    .maybeSingle()

  let vlag = false
  if (wb) {
    const status = await berekenWerkbegrotingStatus(wb.id)
    vlag = status.ooitGoedgekeurd && !status.volledigGoedgekeurd
  }

  const { data: dossier } = await db
    .from('dossiers')
    .select('wb_ongeaccordeerde_wijzigingen')
    .eq('id', dossierId)
    .maybeSingle()

  if (dossier && dossier.wb_ongeaccordeerde_wijzigingen !== vlag) {
    await db.from('dossiers').update({ wb_ongeaccordeerde_wijzigingen: vlag }).eq('id', dossierId)
    revalidatePath('/opdrachten')
  }
}
