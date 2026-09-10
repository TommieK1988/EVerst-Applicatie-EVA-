'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { GeenToegangError, type CurrentMedewerker } from '@/lib/auth/rechten'
import { vereisMaterieelMutatie } from '@/lib/materieel/auth'
import { materieelObjectSchema, nieuwMaterieelSchema } from '@/lib/materieel/validations'
import type { MaterieelStatus, ToewijzingNiveau, KeuringUitkomst } from '@/lib/materieel/types'
import type { ModuleRechten } from '@everts/database/platform-types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActieResultaat<T = unknown> = { ok: true; data: T } | { ok: false; error: string }

/**
 * Gate → geeft de ingelogde medewerker terug, of een { ok:false }-resultaat.
 * Standaard 'schrijven' (dagelijks gebruik: scannen, controleren, toewijzen).
 * Geef 'beheren' mee voor onomkeerbare acties — archiveren en verwijderen.
 */
async function gate(
  min: ModuleRechten = 'schrijven',
): Promise<{ ok: true; medewerker: CurrentMedewerker } | { ok: false; error: string }> {
  try {
    const medewerker = await vereisMaterieelMutatie(min)
    return { ok: true, medewerker }
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: e.message }
    throw e
  }
}

function herlaad(id?: string) {
  revalidatePath('/materieelbeheer')
  revalidatePath('/materieelbeheer/dashboard')
  if (id) revalidatePath(`/materieelbeheer/${id}`)
}

/**
 * Postgres-fouten die een gebruiker kan veroorzaken, in gewone taal.
 *
 * Alleen 23505 (unieke sleutel) komt in de praktijk voor: twee objecten met
 * hetzelfde inventarisnummer of dezelfde stickercode. Zonder deze vertaling
 * krijgt een monteur op de steiger de kale Postgres-melding te zien.
 */
function leesbaarDbFout(error: { code?: string; message: string }): string {
  if (error.code !== '23505') return error.message
  if (error.message.includes('qr_code')) return 'Deze sticker hangt al op een ander stuk materieel'
  if (error.message.includes('inventarisnummer')) return 'Dit inventarisnummer bestaat al'
  return 'Deze waarde bestaat al'
}

/* ── Object CRUD ──────────────────────────────────────────────────── */

export async function maakMaterieelObject(raw: unknown): Promise<ActieResultaat<{ id: string }>> {
  const g = await gate(); if (!g.ok) return g
  const parsed = nieuwMaterieelSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldige invoer' }

  // De toewijzing is geen kolom-waarde maar een gebeurtenis: apart afhandelen.
  const {
    toegewezen_medewerker_id: medewerkerId,
    toegewezen_team_id: teamId,
    ...velden
  } = parsed.data
  const client = db()

  // Niets gekozen → algemeen gebruik. Een team telt hier net zo goed als een
  // persoon: gereedschap dat op de werkplaats of in een bus ligt, staat daarop.
  const niveau = medewerkerId ? 'persoonlijk' : teamId ? 'team' : 'algemeen'

  const { data, error } = await client
    .from('materieel_objecten')
    .insert({
      ...velden,
      created_by: g.medewerker.id,
      toewijzing_niveau: niveau,
      toegewezen_medewerker_id: medewerkerId ?? null,
      toegewezen_team_id: teamId ?? null,
      status: niveau === 'algemeen' ? velden.status : 'in_gebruik',
    })
    .select('id').single()

  if (error) return { ok: false, error: leesbaarDbFout(error) }
  const id = data.id as string

  // Historie vastleggen zodat de uitgifte later herleidbaar is.
  if (niveau !== 'algemeen') {
    await client.from('materieel_toewijzingen').insert({
      object_id: id, niveau,
      medewerker_id: medewerkerId ?? null,
      team_id: teamId ?? null,
      door: g.medewerker.id, opmerking: 'Toegewezen bij registratie',
    })
  }

  herlaad()
  return { ok: true, data: { id } }
}

export async function updateMaterieelObject(id: string, raw: unknown): Promise<ActieResultaat<{ id: string }>> {
  const g = await gate(); if (!g.ok) return g
  const parsed = materieelObjectSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldige invoer' }

  const { error } = await db().from('materieel_objecten').update(parsed.data).eq('id', id)
  if (error) return { ok: false, error: leesbaarDbFout(error) }
  herlaad(id)
  return { ok: true, data: { id } }
}

/** Onomkeerbaar voor de gebruiker → alleen beheerders. */
export async function archiveerMaterieelObject(id: string): Promise<ActieResultaat> {
  const g = await gate('beheren'); if (!g.ok) return g
  const { error } = await db().from('materieel_objecten').update({ actief: false }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  herlaad(id)
  return { ok: true, data: null }
}

/** Categorie-specifieke velden (jsonb `details`) bijwerken. */
export async function updateDetails(id: string, details: Record<string, unknown>): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const { error } = await db().from('materieel_objecten').update({ details }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  herlaad(id)
  return { ok: true, data: null }
}

/* ── Status (incl. vermissing) ────────────────────────────────────── */

export async function zetStatus(id: string, status: MaterieelStatus): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const client = db()

  // Oude status eerst lezen: zonder log wordt de kolom simpelweg overschreven
  // en is de wijziging achteraf niet meer terug te zien in de historie.
  const { data: huidig } = await client.from('materieel_objecten').select('status').eq('id', id).maybeSingle()
  const oud = (huidig as { status: MaterieelStatus } | null)?.status ?? null
  if (oud === status) return { ok: true, data: null }

  const { error } = await client.from('materieel_objecten').update({ status }).eq('id', id)
  if (error) return { ok: false, error: error.message }

  await client.from('materieel_gebeurtenissen').insert({
    object_id: id, soort: 'status', van: oud, naar: status, door: g.medewerker.id,
  })

  herlaad(id)
  return { ok: true, data: null }
}

/* ── Toewijzing / uitgifte ────────────────────────────────────────── */

/**
 * Materieel toewijzen.
 *
 * RECHTEN — twee niveaus, bewust:
 *  - **jezelf** iets aanpakken mag met 'schrijven'. Dat is het dagelijkse gebaar
 *    van de buitendienst: je scant een machine en zet hem op je eigen naam.
 *  - **een ander** (of een team) iets op naam zetten vraagt 'beheren'. Anders
 *    kan iedereen materieel op de naam van een collega schuiven en klopt de
 *    lijst "wie heeft wat" niet meer. Uitgeven is kantoorwerk: projectbureau en
 *    directie hebben 'beheren', de buitendienst 'schrijven'.
 *
 * De toets staat hier en niet in het scherm, zodat hij ook geldt voor de
 * desktop en voor een rechtstreekse aanroep van deze action.
 */
export async function wijsToe(
  id: string,
  input: { niveau: ToewijzingNiveau; medewerker_id?: string | null; team_id?: string | null; opmerking?: string | null },
): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g

  if (input.niveau === 'persoonlijk' && !input.medewerker_id) return { ok: false, error: 'Kies een medewerker' }
  if (input.niveau === 'team' && !input.team_id) return { ok: false, error: 'Kies een team' }

  const naarZichzelf = input.niveau === 'persoonlijk' && input.medewerker_id === g.medewerker.id
  if (!naarZichzelf) {
    const beheer = await gate('beheren')
    if (!beheer.ok) {
      return { ok: false, error: 'Alleen het projectbureau kan materieel op naam van iemand anders zetten. Je kunt het wel op je eigen naam zetten, inleveren of een storing melden.' }
    }
  }

  const client = db()
  // Lopende toewijzing afsluiten.
  await client.from('materieel_toewijzingen').update({ tot: new Date().toISOString() })
    .eq('object_id', id).is('tot', null)

  const medewerker_id = input.niveau === 'persoonlijk' ? input.medewerker_id ?? null : null
  const team_id = input.niveau === 'team' ? input.team_id ?? null : null

  const { error: insErr } = await client.from('materieel_toewijzingen').insert({
    object_id: id, niveau: input.niveau, medewerker_id, team_id,
    door: g.medewerker.id, opmerking: input.opmerking ?? null,
  })
  if (insErr) return { ok: false, error: insErr.message }

  const { error: updErr } = await client.from('materieel_objecten').update({
    toewijzing_niveau: input.niveau,
    toegewezen_medewerker_id: medewerker_id,
    toegewezen_team_id: team_id,
    status: 'in_gebruik',
  }).eq('id', id)
  if (updErr) return { ok: false, error: updErr.message }

  herlaad(id)
  return { ok: true, data: null }
}

/** Innemen: geen medewerker/team meer gekoppeld → automatisch algemeen gebruik. */
export async function neemTerug(id: string): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const client = db()
  await client.from('materieel_toewijzingen').update({ tot: new Date().toISOString() })
    .eq('object_id', id).is('tot', null)
  const { error } = await client.from('materieel_objecten').update({
    toewijzing_niveau: 'algemeen', toegewezen_medewerker_id: null, toegewezen_team_id: null, status: 'beschikbaar',
  }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  herlaad(id)
  return { ok: true, data: null }
}

/* ── Scan-log ─────────────────────────────────────────────────────── */

export async function registreerScan(
  id: string, input?: { locatie?: string | null; context?: string | null },
): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const client = db()
  const nu = new Date().toISOString()
  await client.from('materieel_scans').insert({
    object_id: id, gescand_door: g.medewerker.id, locatie: input?.locatie ?? null, context: input?.context ?? null,
  })
  await client.from('materieel_objecten').update({ laatst_gescand_at: nu, laatst_gescand_door: g.medewerker.id }).eq('id', id)
  herlaad(id)
  return { ok: true, data: null }
}

/* ── Periodieke controle ──────────────────────────────────────────── */

export async function slaControleOp(
  id: string,
  input: { aanwezig: boolean; werkt_goed: boolean; status: 'ok' | 'beschadigd' | 'vermist'; opmerking?: string | null; foto_url?: string | null },
): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const client = db()
  const { error } = await client.from('materieel_controles').insert({
    object_id: id, uitgevoerd_door: g.medewerker.id,
    aanwezig: input.aanwezig, werkt_goed: input.werkt_goed, status: input.status,
    opmerking: input.opmerking ?? null, foto_url: input.foto_url ?? null,
  })
  if (error) return { ok: false, error: error.message }

  // Controle-uitkomst doorvertalen naar objectstatus bij afwijking.
  if (input.status === 'vermist') {
    await client.from('materieel_objecten').update({ status: 'vermist' }).eq('id', id)
  } else if (input.status === 'beschadigd') {
    await client.from('materieel_objecten').update({ status: 'defect' }).eq('id', id)
  }
  herlaad(id)
  return { ok: true, data: null }
}

/* ── Keuringen ────────────────────────────────────────────────────── */

export async function voegKeuringToe(
  id: string,
  input: {
    soort: string; geldig_van?: string | null; geldig_tot?: string | null; opmerking?: string | null
    uitkomst?: KeuringUitkomst | null; bevindingen?: string | null; uitgevoerd_door?: string | null
  },
): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  if (!input.soort) return { ok: false, error: 'Kies een keuringsoort' }

  const client = db()
  const { error } = await client.from('materieel_keuringen').insert({
    object_id: id, soort: input.soort,
    geldig_van: input.geldig_van || null, geldig_tot: input.geldig_tot || null,
    opmerking: input.opmerking ?? null,
    uitkomst: input.uitkomst ?? null,
    bevindingen: input.bevindingen ?? null,
    uitgevoerd_door: input.uitgevoerd_door ?? null,
  })
  if (error) return { ok: false, error: error.message }

  // Een afkeuring is een veiligheidskwestie: het object hoort niet meer in
  // gebruik te zijn. Status volgt de uitkomst, met een gelogde wijziging.
  if (input.uitkomst === 'afgekeurd') {
    await zetStatus(id, 'defect')
  }

  herlaad(id)
  return { ok: true, data: null }
}

/** Een keuring is bewijsmateriaal (o.a. bij afkeuring) → alleen beheerders. */
export async function verwijderKeuring(keuringId: string, objectId: string): Promise<ActieResultaat> {
  const g = await gate('beheren'); if (!g.ok) return g
  const { error } = await db().from('materieel_keuringen').delete().eq('id', keuringId)
  if (error) return { ok: false, error: error.message }
  herlaad(objectId)
  return { ok: true, data: null }
}

/* ── Onderhoud / storingen ────────────────────────────────────────── */

export async function voegOnderhoudToe(
  id: string,
  input: { type: string; omschrijving?: string | null; datum?: string | null; kosten?: number | null; status?: string },
): Promise<ActieResultaat> {
  const g = await gate(); if (!g.ok) return g
  const { error } = await db().from('materieel_onderhoud').insert({
    object_id: id, type: input.type, omschrijving: input.omschrijving ?? null,
    datum: input.datum || new Date().toISOString().slice(0, 10),
    kosten: input.kosten ?? null, status: input.status ?? 'open', gemeld_door: g.medewerker.id,
  })
  if (error) return { ok: false, error: error.message }
  herlaad(id)
  return { ok: true, data: null }
}
