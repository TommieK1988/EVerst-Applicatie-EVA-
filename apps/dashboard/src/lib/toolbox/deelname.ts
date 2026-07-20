'use server'

import { createAdminClient } from '@everts/database/server'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import type { ToolboxSchema } from '@/components/toolbox/types'
import {
  stripSchemaVoorDeelnemer,
  schudVoorDeelnemer,
  juisteOptieId,
  alleVraagIds,
  type PubliekSchema,
} from './schema'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient()
}

type ToewijzingContext = {
  id: string
  toolbox_id: string
  versie_id: string
  medewerker_id: string
  status: string
  laatste_slide: number
  task_id: string | null
  shuffle_seed: number
  afgerond_op: string | null
  handtekening_naam: string | null
}

/** Haal de toewijzing op en verifieer dat hij van de ingelogde medewerker is. */
async function eigenToewijzing(toewijzingId: string): Promise<ToewijzingContext | null> {
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) return null

  const { data } = await db()
    .from('toolbox_toewijzingen')
    .select('id, toolbox_id, versie_id, medewerker_id, status, laatste_slide, task_id, shuffle_seed, afgerond_op, handtekening_naam')
    .eq('id', toewijzingId)
    .maybeSingle()

  if (!data || data.medewerker_id !== medewerker.id) return null
  return data as ToewijzingContext
}

async function versieSchema(versieId: string): Promise<ToolboxSchema | null> {
  const { data } = await db().from('toolbox_versies').select('schema').eq('id', versieId).maybeSingle()
  return (data?.schema as ToolboxSchema) ?? null
}

// ── Data-loader voor de mobiele doorloop ──────────────────────────────
export type DeelnameData = {
  toewijzingId: string
  titel: string
  status: string
  laatsteSlide: number
  handtekeningNaam: string | null
  /** Gestript (geen juiste antwoorden/uitleg) én geschud volgens de seed. */
  schema: PubliekSchema
}

export async function getDeelname(toewijzingId: string): Promise<DeelnameData | null> {
  const toew = await eigenToewijzing(toewijzingId)
  if (!toew) return null

  const [schema, toolbox] = await Promise.all([
    versieSchema(toew.versie_id),
    db().from('toolboxen').select('titel').eq('id', toew.toolbox_id).maybeSingle(),
  ])
  if (!schema) return null

  const publiek = schudVoorDeelnemer(stripSchemaVoorDeelnemer(schema), toew.shuffle_seed)

  return {
    toewijzingId: toew.id,
    titel: toolbox.data?.titel ?? 'Toolbox',
    status: toew.status,
    laatsteSlide: toew.laatste_slide,
    handtekeningNaam: toew.handtekening_naam,
    schema: publiek,
  }
}

// ── Voortgang ──────────────────────────────────────────────────────────
export async function startOfHervat(toewijzingId: string): Promise<void> {
  const toew = await eigenToewijzing(toewijzingId)
  if (!toew || toew.status === 'afgerond') return
  if (toew.status === 'open') {
    await db().from('toolbox_toewijzingen')
      .update({ status: 'bezig', gestart_op: new Date().toISOString() })
      .eq('id', toewijzingId)
  }
}

export async function bewaarVoortgang(toewijzingId: string, slideIndex: number): Promise<void> {
  const toew = await eigenToewijzing(toewijzingId)
  if (!toew || toew.status === 'afgerond') return
  await db().from('toolbox_toewijzingen').update({ laatste_slide: slideIndex }).eq('id', toewijzingId)
}

// ── Kennischeck ────────────────────────────────────────────────────────
export type AntwoordResultaat = { correct: boolean; uitleg?: string }

export async function beantwoordVraag(
  toewijzingId: string,
  vraagId: string,
  optieId: string,
): Promise<AntwoordResultaat> {
  const toew = await eigenToewijzing(toewijzingId)
  if (!toew) throw new Error('Geen toegang tot deze toolbox.')
  if (toew.status === 'afgerond') return { correct: true }

  const schema = await versieSchema(toew.versie_id)
  if (!schema) throw new Error('Toolbox-inhoud niet gevonden.')

  const juisteId = juisteOptieId(schema, vraagId)
  const correct = juisteId != null && optieId === juisteId

  // Pogingnummer voor deze vraag ophogen.
  const { count } = await db()
    .from('toolbox_antwoorden')
    .select('id', { count: 'exact', head: true })
    .eq('toewijzing_id', toewijzingId)
    .eq('vraag_id', vraagId)

  await db().from('toolbox_antwoorden').insert({
    toewijzing_id: toewijzingId,
    vraag_id: vraagId,
    gekozen_optie: optieId,
    correct,
    poging_nummer: (count ?? 0) + 1,
  })

  if (correct) return { correct: true }

  // Uitleg alleen bij een fout antwoord.
  const vraag = schema.slides.find((s) => s.type === 'vraag' && s.id === vraagId)
  const uitleg = vraag && vraag.type === 'vraag' ? vraag.uitleg : undefined
  return { correct: false, uitleg }
}

// ── Afronden ───────────────────────────────────────────────────────────
export type AfrondResultaat = { ok: true } | { ok: false; error: string }

export async function rondAf(
  toewijzingId: string,
  input: { naam: string; handtekeningB64: string },
): Promise<AfrondResultaat> {
  const toew = await eigenToewijzing(toewijzingId)
  if (!toew) return { ok: false, error: 'Geen toegang tot deze toolbox.' }
  if (toew.status === 'afgerond') return { ok: true }

  const naam = input.naam.trim()
  if (!naam) return { ok: false, error: 'Vul je naam in.' }
  if (!input.handtekeningB64) return { ok: false, error: 'Zet eerst je handtekening.' }

  const schema = await versieSchema(toew.versie_id)
  if (!schema) return { ok: false, error: 'Toolbox-inhoud niet gevonden.' }

  // Elke vraag moet minstens één correcte poging hebben (voorkomt overslaan).
  const vraagIds = alleVraagIds(schema)
  if (vraagIds.length > 0) {
    const { data: goede } = await db()
      .from('toolbox_antwoorden')
      .select('vraag_id')
      .eq('toewijzing_id', toewijzingId)
      .eq('correct', true)
    const goedGemaakt = new Set((goede ?? []).map((r: { vraag_id: string }) => r.vraag_id))
    const onbeantwoord = vraagIds.filter((id) => !goedGemaakt.has(id))
    if (onbeantwoord.length > 0) {
      return { ok: false, error: 'Beantwoord eerst alle vragen goed voordat je aftekent.' }
    }
  }

  // Handtekening als PNG uploaden naar de privé bucket; we bewaren het pad.
  const supabase = db()
  const base64 = input.handtekeningB64.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64, 'base64')
  const pad = `${toewijzingId}.png`
  const { error: upErr } = await supabase.storage
    .from('toolbox-handtekeningen')
    .upload(pad, buffer, { contentType: 'image/png', upsert: true })
  if (upErr) return { ok: false, error: `Handtekening opslaan mislukt: ${upErr.message}` }

  const { error: uErr } = await supabase
    .from('toolbox_toewijzingen')
    .update({
      status: 'afgerond',
      afgerond_op: new Date().toISOString(),
      handtekening_pad: pad,
      handtekening_naam: naam,
    })
    .eq('id', toewijzingId)
  if (uErr) return { ok: false, error: uErr.message }

  // Gekoppelde taak automatisch afronden.
  if (toew.task_id) {
    await supabase.from('tasks').update({ status: 'gereed', updated_at: new Date().toISOString() }).eq('id', toew.task_id)
  }

  return { ok: true }
}
