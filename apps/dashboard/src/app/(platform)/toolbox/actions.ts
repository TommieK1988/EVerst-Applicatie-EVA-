'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisRecht, vereisModuleToegang } from '@/lib/auth/rechten'
import type { ToolboxSchema, ToolboxStatus } from '@/components/toolbox/types'
import { leegSchema } from '@/components/toolbox/types'
import { valideerSchema } from '@/lib/toolbox/schema'
import { zetToolboxKlaar } from '@/lib/toolbox/klaarzetten'

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return createAdminClient()
}

// ── Overzicht ──────────────────────────────────────────────────────────
export type ToolboxOverzichtRij = {
  id: string
  titel: string
  omschrijving: string | null
  status: ToolboxStatus
  huidige_versie: number
  bijgewerkt_op: string
  aantal_toegewezen: number
  aantal_afgerond: number
}

export async function getToolboxen(): Promise<ToolboxOverzichtRij[]> {
  await vereisModuleToegang('toolbox', 'lezen')
  const supabase = db()

  const { data: toolboxen } = await supabase
    .from('toolboxen')
    .select('id, titel, omschrijving, status, huidige_versie, bijgewerkt_op')
    .neq('status', 'gearchiveerd')
    .order('bijgewerkt_op', { ascending: false })

  const rijen = (toolboxen ?? []) as Omit<ToolboxOverzichtRij, 'aantal_toegewezen' | 'aantal_afgerond'>[]
  if (rijen.length === 0) return []

  const ids = rijen.map((r) => r.id)
  const { data: toew } = await supabase
    .from('toolbox_toewijzingen')
    .select('toolbox_id, status')
    .in('toolbox_id', ids)

  const telling = new Map<string, { toegewezen: number; afgerond: number }>()
  for (const t of (toew ?? []) as { toolbox_id: string; status: string }[]) {
    const rec = telling.get(t.toolbox_id) ?? { toegewezen: 0, afgerond: 0 }
    rec.toegewezen++
    if (t.status === 'afgerond') rec.afgerond++
    telling.set(t.toolbox_id, rec)
  }

  return rijen.map((r) => ({
    ...r,
    aantal_toegewezen: telling.get(r.id)?.toegewezen ?? 0,
    aantal_afgerond: telling.get(r.id)?.afgerond ?? 0,
  }))
}

export async function getToolbox(id: string): Promise<ActionResult<{
  id: string
  titel: string
  omschrijving: string | null
  status: ToolboxStatus
  huidige_versie: number
  concept_schema: ToolboxSchema
}>> {
  await vereisModuleToegang('toolbox', 'lezen')
  const { data, error } = await db()
    .from('toolboxen')
    .select('id, titel, omschrijving, status, huidige_versie, concept_schema')
    .eq('id', id)
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Toolbox niet gevonden.' }
  return { ok: true, data }
}

// ── Mutaties ───────────────────────────────────────────────────────────
export async function maakToolbox(input: {
  titel: string
  omschrijving?: string
}): Promise<ActionResult<{ id: string }>> {
  await vereisRecht('toolbox', 'schrijven')
  const titel = input.titel.trim()
  if (!titel) return { ok: false, error: 'Geef de toolbox een titel.' }

  const { data, error } = await db()
    .from('toolboxen')
    .insert({
      titel,
      omschrijving: input.omschrijving?.trim() || null,
      concept_schema: leegSchema(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }

  revalidatePath('/toolbox')
  return { ok: true, data: { id: data.id } }
}

export async function updateConceptSchema(
  id: string,
  schema: ToolboxSchema,
  meta?: { titel?: string; omschrijving?: string },
): Promise<ActionResult> {
  await vereisRecht('toolbox', 'schrijven')

  const patch: Record<string, unknown> = { concept_schema: schema }
  if (meta?.titel !== undefined) patch.titel = meta.titel.trim()
  if (meta?.omschrijving !== undefined) patch.omschrijving = meta.omschrijving.trim() || null

  const { error } = await db().from('toolboxen').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/toolbox')
  revalidatePath(`/toolbox/${id}`)
  return { ok: true, data: undefined }
}

export async function publiceerToolbox(id: string): Promise<ActionResult<{ versienummer: number }>> {
  await vereisRecht('toolbox', 'schrijven')
  const supabase = db()

  const { data: tb } = await supabase
    .from('toolboxen')
    .select('concept_schema, huidige_versie')
    .eq('id', id)
    .maybeSingle()
  if (!tb) return { ok: false, error: 'Toolbox niet gevonden.' }

  const fouten = valideerSchema(tb.concept_schema as ToolboxSchema)
  if (fouten.length > 0) {
    return { ok: false, error: fouten.map((f) => `• ${f.boodschap}`).join('\n') }
  }

  const nieuwVersienummer = (tb.huidige_versie ?? 0) + 1
  const { error: vErr } = await supabase.from('toolbox_versies').insert({
    toolbox_id: id,
    versienummer: nieuwVersienummer,
    schema: tb.concept_schema,
  })
  if (vErr) return { ok: false, error: vErr.message }

  const { error: uErr } = await supabase
    .from('toolboxen')
    .update({ status: 'gepubliceerd', huidige_versie: nieuwVersienummer })
    .eq('id', id)
  if (uErr) return { ok: false, error: uErr.message }

  revalidatePath('/toolbox')
  revalidatePath(`/toolbox/${id}`)
  return { ok: true, data: { versienummer: nieuwVersienummer } }
}

export async function archiveerToolbox(id: string): Promise<ActionResult> {
  await vereisRecht('toolbox', 'beheren')
  const { error } = await db().from('toolboxen').update({ status: 'gearchiveerd' }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/toolbox')
  return { ok: true, data: undefined }
}

// ── Toewijzen (los, zonder agenda) ─────────────────────────────────────
export type MedewerkerKeuze = { id: string; naam: string; functie: string | null }

export async function getToewijsbareMedewerkers(): Promise<MedewerkerKeuze[]> {
  await vereisModuleToegang('toolbox', 'lezen')
  const { data } = await db()
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam, functie, gebruiker_type, auth_user_id')
    .eq('actief', true)
    .neq('gebruiker_type', 'geen')
    .not('auth_user_id', 'is', null)
    .order('achternaam', { ascending: true })

  return ((data ?? []) as {
    id: string; voornaam: string | null; tussenvoegsel: string | null
    achternaam: string | null; functie: string | null
  }[]).map((m) => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') || '—',
    functie: m.functie,
  }))
}

export async function wijsToe(input: {
  toolboxId: string
  medewerkerIds: string[] | 'allen'
}): Promise<ActionResult<{ aangemaakt: number; overgeslagen: number }>> {
  await vereisRecht('toolbox', 'schrijven')
  const supabase = db()

  const { data: tb } = await supabase
    .from('toolboxen')
    .select('titel, status, huidige_versie')
    .eq('id', input.toolboxId)
    .maybeSingle()
  if (!tb) return { ok: false, error: 'Toolbox niet gevonden.' }
  if (tb.status !== 'gepubliceerd') {
    return { ok: false, error: 'Publiceer de toolbox eerst voordat je hem toewijst.' }
  }

  const { data: versie } = await supabase
    .from('toolbox_versies')
    .select('id')
    .eq('toolbox_id', input.toolboxId)
    .eq('versienummer', tb.huidige_versie)
    .maybeSingle()
  if (!versie) return { ok: false, error: 'Geen gepubliceerde versie gevonden.' }

  let medewerkerIds: string[]
  if (input.medewerkerIds === 'allen') {
    medewerkerIds = (await getToewijsbareMedewerkers()).map((m) => m.id)
  } else {
    medewerkerIds = input.medewerkerIds
  }

  const res = await zetToolboxKlaar({
    toolboxId: input.toolboxId,
    versieId: versie.id,
    titel: tb.titel,
    medewerkerIds,
    toegewezenDoor: null,
  })

  revalidatePath(`/toolbox/${input.toolboxId}`)
  return { ok: true, data: res }
}

export async function verwijderToewijzing(id: string): Promise<ActionResult> {
  await vereisRecht('toolbox', 'schrijven')
  const supabase = db()

  const { data: toew } = await supabase
    .from('toolbox_toewijzingen')
    .select('id, status, task_id, toolbox_id')
    .eq('id', id)
    .maybeSingle()
  if (!toew) return { ok: false, error: 'Toewijzing niet gevonden.' }
  if (toew.status === 'afgerond') {
    return { ok: false, error: 'Een afgeronde toewijzing kan niet worden verwijderd (audittrail).' }
  }

  await supabase.from('toolbox_toewijzingen').delete().eq('id', id)
  if (toew.task_id) await supabase.from('tasks').delete().eq('id', toew.task_id)

  revalidatePath(`/toolbox/${toew.toolbox_id}`)
  return { ok: true, data: undefined }
}

// ── Rapportage ─────────────────────────────────────────────────────────
export type DeelnemerRij = {
  id: string
  medewerker_naam: string
  functie: string | null
  status: string
  afgerond_op: string | null
  pogingen: number
  in_een_keer_goed: number | null // percentage 0-100 of null
  handtekening_url: string | null
}

// ── Presenteren (klassikale weergave) ──────────────────────────────────
export async function getGepubliceerdSchema(toolboxId: string): Promise<{ titel: string; versienummer: number; schema: ToolboxSchema } | null> {
  await vereisModuleToegang('toolbox', 'lezen')
  const supabase = db()

  const { data: tb } = await supabase
    .from('toolboxen')
    .select('titel, huidige_versie')
    .eq('id', toolboxId)
    .maybeSingle()
  if (!tb || !tb.huidige_versie) return null

  const { data: versie } = await supabase
    .from('toolbox_versies')
    .select('schema, versienummer')
    .eq('toolbox_id', toolboxId)
    .eq('versienummer', tb.huidige_versie)
    .maybeSingle()
  if (!versie) return null

  return { titel: tb.titel, versienummer: versie.versienummer, schema: versie.schema as ToolboxSchema }
}

// ── Agenda-koppeling (toolbox_momenten) ────────────────────────────────
export type ToolboxKeuze = { id: string; titel: string }

export async function getGepubliceerdeToolboxen(): Promise<ToolboxKeuze[]> {
  await vereisModuleToegang('toolbox', 'lezen')
  const { data } = await db()
    .from('toolboxen')
    .select('id, titel')
    .eq('status', 'gepubliceerd')
    .order('titel', { ascending: true })
  return (data ?? []) as ToolboxKeuze[]
}

export type MomentKoppeling = {
  moment_id: string
  toolbox_id: string
  toolbox_titel: string
  status: string
  aantal_toegewezen: number
  aantal_afgerond: number
}

export async function getMomentKoppeling(
  agendaItemId: string,
  datum: string,
): Promise<MomentKoppeling | null> {
  await vereisModuleToegang('toolbox', 'lezen')
  const supabase = db()

  const { data: moment } = await supabase
    .from('toolbox_momenten')
    .select('id, toolbox_id, status, toolboxen(titel)')
    .eq('agenda_item_id', agendaItemId)
    .eq('datum', datum)
    .maybeSingle()
  if (!moment) return null

  const { data: toew } = await supabase
    .from('toolbox_toewijzingen')
    .select('status')
    .eq('moment_id', moment.id)
  const rijen = (toew ?? []) as { status: string }[]

  return {
    moment_id: moment.id,
    toolbox_id: moment.toolbox_id,
    toolbox_titel: moment.toolboxen?.titel ?? 'Toolbox',
    status: moment.status,
    aantal_toegewezen: rijen.length,
    aantal_afgerond: rijen.filter((r) => r.status === 'afgerond').length,
  }
}

export async function koppelMoment(input: {
  agendaItemId: string
  datum: string
  toolboxId: string
}): Promise<ActionResult> {
  await vereisRecht('toolbox', 'schrijven')
  const { error } = await db()
    .from('toolbox_momenten')
    .upsert(
      {
        agenda_item_id: input.agendaItemId,
        datum: input.datum,
        toolbox_id: input.toolboxId,
        status: 'gepland',
      },
      { onConflict: 'agenda_item_id,datum' },
    )
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: undefined }
}

export async function ontkoppelMoment(input: {
  agendaItemId: string
  datum: string
}): Promise<ActionResult> {
  await vereisRecht('toolbox', 'schrijven')
  const supabase = db()

  const { data: moment } = await supabase
    .from('toolbox_momenten')
    .select('id, status')
    .eq('agenda_item_id', input.agendaItemId)
    .eq('datum', input.datum)
    .maybeSingle()
  if (!moment) return { ok: true, data: undefined }
  if (moment.status === 'klaargezet') {
    return { ok: false, error: 'Deze toolbox is al klaargezet bij de deelnemers en kan niet meer worden losgekoppeld.' }
  }
  await supabase.from('toolbox_momenten').delete().eq('id', moment.id)
  return { ok: true, data: undefined }
}

export async function getRapportage(toolboxId: string): Promise<DeelnemerRij[]> {
  await vereisModuleToegang('toolbox', 'lezen')
  const supabase = db()

  const { data: toew } = await supabase
    .from('toolbox_toewijzingen')
    .select('id, medewerker_id, status, afgerond_op, handtekening_pad, medewerkers(voornaam, tussenvoegsel, achternaam, functie)')
    .eq('toolbox_id', toolboxId)
    .order('afgerond_op', { ascending: false, nullsFirst: false })

  const rijen = (toew ?? []) as any[]
  if (rijen.length === 0) return []

  // Antwoord-statistiek per toewijzing.
  const ids = rijen.map((r) => r.id)
  const { data: antw } = await supabase
    .from('toolbox_antwoorden')
    .select('toewijzing_id, vraag_id, correct, poging_nummer')
    .in('toewijzing_id', ids)

  const stats = new Map<string, { pogingen: number; vragenGoedEersteKeer: Set<string>; vragen: Set<string> }>()
  for (const a of (antw ?? []) as { toewijzing_id: string; vraag_id: string; correct: boolean; poging_nummer: number }[]) {
    const rec = stats.get(a.toewijzing_id) ?? { pogingen: 0, vragenGoedEersteKeer: new Set(), vragen: new Set() }
    rec.pogingen++
    rec.vragen.add(a.vraag_id)
    if (a.correct && a.poging_nummer === 1) rec.vragenGoedEersteKeer.add(a.vraag_id)
    stats.set(a.toewijzing_id, rec)
  }

  // Signed URLs voor handtekeningen (privé bucket).
  const paden = rijen.map((r) => r.handtekening_pad).filter(Boolean) as string[]
  const signedMap = new Map<string, string>()
  if (paden.length > 0) {
    const { data: signed } = await supabase.storage
      .from('toolbox-handtekeningen')
      .createSignedUrls(paden, 3600)
    for (const s of (signed ?? []) as { path: string; signedUrl: string }[]) {
      if (s.signedUrl) signedMap.set(s.path, s.signedUrl)
    }
  }

  return rijen.map((r) => {
    const mw = r.medewerkers ?? {}
    const st = stats.get(r.id)
    const pct = st && st.vragen.size > 0
      ? Math.round((st.vragenGoedEersteKeer.size / st.vragen.size) * 100)
      : null
    return {
      id: r.id,
      medewerker_naam: [mw.voornaam, mw.tussenvoegsel, mw.achternaam].filter(Boolean).join(' ') || '—',
      functie: mw.functie ?? null,
      status: r.status,
      afgerond_op: r.afgerond_op,
      pogingen: st?.pogingen ?? 0,
      in_een_keer_goed: pct,
      handtekening_url: r.handtekening_pad ? signedMap.get(r.handtekening_pad) ?? null : null,
    }
  })
}
