'use server'

import { randomUUID } from 'crypto'
import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { OpleverPuntStatus } from '@everts/database'
import type { FormField } from '@/components/formulieren/types'
import { materialiseerAandachtspunten, valideerToken } from '@/lib/dossiers/oplevering'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/* ───────────────────── Onderaannemer-portaal (afmelden) ───────────────────── */

export type PortaalPunt = {
  id: string
  volgnummer: number
  omschrijving: string
  ruimte: string | null
  status: OpleverPuntStatus
  deadline: string | null
  fotos: { id: string; url: string }[]
  reacties: { auteur_naam: string | null; auteur_type: string; opmerking: string | null; foto_urls: string[]; created_at: string }[]
}

export type OnderaannemerPortaalData = {
  ok: boolean
  error?: string
  bedrijf?: string | null
  dossier?: { titel: string | null; nummer: string | null }
  relatieNaam?: string | null
  punten?: PortaalPunt[]
}

/** Publieke lezing: alle opleverpunten van dit dossier die aan de onderaannemer van het token toegewezen zijn. */
export async function getOnderaannemerPortaal(rawToken: string): Promise<OnderaannemerPortaalData> {
  const token = await valideerToken(rawToken, 'onderaannemer')
  if (!token || !token.relatie_id) return { ok: false, error: 'Ongeldige of verlopen link.' }
  const supabase = db()

  const [{ data: dossier }, { data: relatie }, { data: punten }] = await Promise.all([
    supabase.from('dossiers').select('titel, dossiernummer').eq('id', token.dossier_id).maybeSingle(),
    supabase.from('relaties').select('naam').eq('id', token.relatie_id).maybeSingle(),
    supabase
      .from('oplever_punten')
      .select('id, volgnummer, omschrijving, ruimte, status, deadline')
      .eq('dossier_id', token.dossier_id)
      .eq('toegewezen_relatie_id', token.relatie_id)
      .order('volgnummer', { ascending: true }),
  ])

  const puntIds = (punten ?? []).map((p: any) => p.id)
  const [{ data: fotos }, { data: reacties }] = await Promise.all([
    puntIds.length ? supabase.from('oplever_fotos').select('id, punt_id, url').in('punt_id', puntIds) : Promise.resolve({ data: [] }),
    puntIds.length ? supabase.from('oplever_punt_reacties').select('punt_id, auteur_naam, auteur_type, opmerking, foto_urls, created_at').in('punt_id', puntIds).order('created_at') : Promise.resolve({ data: [] }),
  ])

  const punView: PortaalPunt[] = (punten ?? []).map((p: any) => ({
    id: p.id,
    volgnummer: p.volgnummer,
    omschrijving: p.omschrijving,
    ruimte: p.ruimte,
    status: p.status,
    deadline: p.deadline,
    fotos: (fotos ?? []).filter((f: any) => f.punt_id === p.id).map((f: any) => ({ id: f.id, url: f.url })),
    reacties: (reacties ?? []).filter((r: any) => r.punt_id === p.id).map((r: any) => ({
      auteur_naam: r.auteur_naam, auteur_type: r.auteur_type, opmerking: r.opmerking, foto_urls: r.foto_urls ?? [], created_at: r.created_at,
    })),
  }))

  return {
    ok: true,
    dossier: { titel: dossier?.titel ?? null, nummer: dossier?.dossiernummer ?? null },
    relatieNaam: relatie?.naam ?? null,
    punten: punView,
  }
}

/** Publieke foto-upload voor een opleverpunt via tokenlink; verifieert dat het punt bij de token-relatie hoort. */
export async function portaalUploadFoto(
  rawToken: string,
  puntId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = await valideerToken(rawToken, 'onderaannemer')
  if (!token || !token.relatie_id) return { ok: false, error: 'Ongeldige link.' }
  const supabase = db()

  const { data: punt } = await supabase
    .from('oplever_punten')
    .select('dossier_id, toegewezen_relatie_id')
    .eq('id', puntId)
    .maybeSingle()
  if (!punt || punt.dossier_id !== token.dossier_id || punt.toegewezen_relatie_id !== token.relatie_id) {
    return { ok: false, error: 'Dit punt hoort niet bij deze link.' }
  }

  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand.' }
  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${puntId}/portaal-${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from('oplever-fotos')
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { ok: false, error: upErr.message }
  const { data: urlData } = supabase.storage.from('oplever-fotos').getPublicUrl(path)
  return { ok: true, url: urlData.publicUrl }
}

/**
 * Onderaannemer meldt een punt af: legt een reactie (met foto's) vast en zet de status op 'opgelost'.
 * De interne uitvoerder beoordeelt daarna → geaccepteerd/geweigerd.
 */
export async function portaalAfmeldenPunt(
  rawToken: string,
  puntId: string,
  opmerking: string,
  fotoUrls: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await valideerToken(rawToken, 'onderaannemer')
  if (!token || !token.relatie_id) return { ok: false, error: 'Ongeldige link.' }
  const supabase = db()

  const { data: punt } = await supabase
    .from('oplever_punten')
    .select('id, dossier_id, toegewezen_relatie_id, status')
    .eq('id', puntId)
    .maybeSingle()
  if (!punt || punt.dossier_id !== token.dossier_id || punt.toegewezen_relatie_id !== token.relatie_id) {
    return { ok: false, error: 'Dit punt hoort niet bij deze link.' }
  }
  if (punt.status === 'geaccepteerd') return { ok: false, error: 'Dit punt is al geaccepteerd.' }

  const { data: relatie } = await supabase.from('relaties').select('naam').eq('id', token.relatie_id).maybeSingle()

  // `fotoUrls` komt van een publieke, ongeauthenticeerde route en wordt straks als <img src>
  // gerenderd én in het opleverrapport ingebed. Alleen URL's uit onze eigen bucket toelaten —
  // zonder deze filter kan een geprepareerde payload een willekeurig domein in het rapport zetten.
  // Zelfde controle als in `materialiseerAandachtspunten`.
  const basisUrl = supabase.storage.from('oplever-fotos').getPublicUrl('').data.publicUrl
  const veiligeUrls = (fotoUrls ?? []).filter(u => typeof u === 'string' && u.startsWith(basisUrl))

  await supabase.from('oplever_punt_reacties').insert({
    punt_id: puntId,
    auteur_type: 'onderaannemer',
    auteur_naam: relatie?.naam ?? 'Onderaannemer',
    soort: 'afmelding',
    opmerking: opmerking || null,
    foto_urls: veiligeUrls,
  })

  // De afmeldfoto is precies het bewijs dat het punt verholpen is, dus hij hoort óók in
  // `oplever_fotos` als 'na' — daar leest het rapport de voor/na-kolommen uit. Hij blijft
  // daarnaast bij de reactie staan, zodat de context van de afmelding zichtbaar blijft.
  if (veiligeUrls.length > 0) {
    await supabase.from('oplever_fotos').insert(
      veiligeUrls.map(url => ({ punt_id: puntId, url, soort: 'na' })),
    )
  }

  const now = new Date().toISOString()
  const { error } = await supabase
    .from('oplever_punten')
    .update({ status: 'opgelost', afgemeld_op: now, updated_at: now })
    .eq('id', puntId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/opdrachten/${token.dossier_id}/oplevering`)
  return { ok: true }
}

/* ─────────────────────── Opdrachtgever-akkoord (op afstand) ───────────────── */

export type AkkoordPortaalData = {
  ok: boolean
  error?: string
  dossier?: { titel: string | null; nummer: string | null }
  moment?: { titel: string; status: string }
  punten?: { volgnummer: number; omschrijving: string; ruimte: string | null; status: OpleverPuntStatus }[]
  alGetekend?: boolean
}

/** Publieke samenvatting voor de opdrachtgever om akkoord te geven op een oplevermoment. */
export async function getAkkoordPortaal(rawToken: string): Promise<AkkoordPortaalData> {
  const token = await valideerToken(rawToken, 'ondertekening')
  if (!token || !token.moment_id) return { ok: false, error: 'Ongeldige of verlopen link.' }
  const supabase = db()

  const [{ data: dossier }, { data: moment }, { data: punten }, { data: handtekeningen }] = await Promise.all([
    supabase.from('dossiers').select('titel, dossiernummer').eq('id', token.dossier_id).maybeSingle(),
    supabase.from('oplever_momenten').select('titel, status').eq('id', token.moment_id).maybeSingle(),
    supabase.from('oplever_punten').select('volgnummer, omschrijving, ruimte, status').eq('moment_id', token.moment_id).order('volgnummer'),
    supabase.from('oplever_handtekeningen').select('rol').eq('moment_id', token.moment_id).eq('rol', 'opdrachtgever'),
  ])
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden.' }

  return {
    ok: true,
    dossier: { titel: dossier?.titel ?? null, nummer: dossier?.dossiernummer ?? null },
    moment: { titel: moment.titel, status: moment.status },
    punten: (punten ?? []) as any,
    alGetekend: (handtekeningen ?? []).length > 0,
  }
}

/** Opdrachtgever geeft op afstand akkoord: legt een 'akkoord_knop'-handtekening vast en zet het moment op ondertekend. */
export async function portaalAkkoord(
  rawToken: string,
  naam: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await valideerToken(rawToken, 'ondertekening')
  if (!token || !token.moment_id) return { ok: false, error: 'Ongeldige link.' }
  if (!naam.trim()) return { ok: false, error: 'Vul uw naam in.' }
  const supabase = db()

  await supabase.from('oplever_handtekeningen').insert({
    moment_id: token.moment_id,
    rol: 'opdrachtgever',
    naam: naam.trim(),
    methode: 'akkoord_knop',
  })
  const now = new Date().toISOString()
  await supabase.from('oplever_momenten').update({ status: 'ondertekend', updated_at: now }).eq('id', token.moment_id)
  await supabase.from('oplever_toegang_tokens').update({ gebruikt_op: now }).eq('id', token.id)

  revalidatePath(`/opdrachten/${token.dossier_id}/oplevering`)
  return { ok: true }
}

/* ─────────────────────────── Feedback-ronde (bewoners) ────────────────────── */

export type FeedbackPortaalData = {
  ok: boolean
  error?: string
  titel?: string | null
  omschrijving?: string | null
  fields?: FormField[]
  versieId?: string
}

/** Publieke lezing van een feedbacksjabloon (huidige versie) achter een 'feedback'-token. */
export async function getFeedbackPortaal(rawToken: string): Promise<FeedbackPortaalData> {
  const token = await valideerToken(rawToken, 'feedback')
  if (!token || !token.form_template_id) return { ok: false, error: 'Ongeldige of verlopen link.' }
  const supabase = db()

  const { data: template } = await supabase
    .from('form_templates')
    .select('naam, omschrijving, huidige_versie')
    .eq('id', token.form_template_id)
    .maybeSingle()
  if (!template) return { ok: false, error: 'Vragenlijst niet gevonden.' }

  const { data: versie } = await supabase
    .from('form_versies')
    .select('id, schema')
    .eq('template_id', token.form_template_id)
    .eq('versienummer', template.huidige_versie)
    .maybeSingle()
  if (!versie) return { ok: false, error: 'Vragenlijst is nog niet gepubliceerd.' }

  return {
    ok: true,
    titel: template.naam,
    omschrijving: template.omschrijving,
    fields: (versie.schema?.fields ?? []) as FormField[],
    versieId: versie.id,
  }
}

/**
 * Publieke foto-upload voor een aandachtspunt via een feedbacklink. Foto's gaan bij het kiezen al
 * naar de opslag in plaats van als base64 in de inzending: die zou anders door de body-limiet van
 * server-actions heen knallen zodra een bewoner twee telefoonfoto's meestuurt.
 *
 * `portaalUploadFoto` is hier niet bruikbaar — die hoort bij de onderaannemer-scope en eist een
 * bestaand opleverpunt, terwijl een aandachtspunt pas na het indienen ontstaat.
 */
const MAX_FOTO_BYTES = 8 * 1024 * 1024
const TOEGESTANE_FOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']

export async function portaalUploadAandachtspuntFoto(
  rawToken: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const token = await valideerToken(rawToken, 'feedback')
  if (!token) return { ok: false, error: 'Ongeldige link.' }

  const file = formData.get('foto')
  if (!(file instanceof File)) return { ok: false, error: 'Geen bestand.' }
  if (file.size > MAX_FOTO_BYTES) return { ok: false, error: 'Deze foto is te groot (max. 8 MB).' }
  if (!TOEGESTANE_FOTO_TYPES.includes(file.type)) return { ok: false, error: 'Alleen foto\'s zijn toegestaan.' }

  const supabase = db()
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
  const path = `aandachtspunten/${token.dossier_id}/feedback/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: upErr } = await supabase.storage
    .from('oplever-fotos')
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return { ok: false, error: upErr.message }
  const { data: urlData } = supabase.storage.from('oplever-fotos').getPublicUrl(path)
  return { ok: true, url: urlData.publicUrl }
}

/** Bovengrens op de antwoorden van een publieke, niet-geauthenticeerde inzending. */
const MAX_WAARDEN_BYTES = 256_000

/**
 * Publieke inzending van een feedbackformulier. Meerdere bewoners kunnen dezelfde link gebruiken
 * (token blijft geldig), dus elke inzending is een nieuwe rij. `aangemaakt_door` blijft leeg (extern).
 */
export async function portaalFeedbackSubmit(
  rawToken: string,
  waarden: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = await valideerToken(rawToken, 'feedback')
  if (!token || !token.form_template_id) return { ok: false, error: 'Ongeldige link.' }

  if (JSON.stringify(waarden ?? {}).length > MAX_WAARDEN_BYTES) {
    return { ok: false, error: 'De antwoorden zijn te groot om te versturen. Verwijder een paar foto\'s en probeer het opnieuw.' }
  }

  const supabase = db()

  const { data: template } = await supabase
    .from('form_templates')
    .select('huidige_versie')
    .eq('id', token.form_template_id)
    .maybeSingle()
  if (!template) return { ok: false, error: 'Vragenlijst niet gevonden.' }

  const { data: versie } = await supabase
    .from('form_versies')
    .select('id')
    .eq('template_id', token.form_template_id)
    .eq('versienummer', template.huidige_versie)
    .maybeSingle()
  if (!versie) return { ok: false, error: 'Vragenlijst niet beschikbaar.' }

  const now = new Date().toISOString()
  const { data: ins, error } = await supabase.from('form_inzendingen').insert({
    template_id: token.form_template_id,
    versie_id: versie.id,
    status: 'ingediend',
    waarden,
    dossier_id: token.dossier_id,
    project_ref: 'oplever-feedback',
    ingediend_op: now,
  }).select('id').single()
  if (error) return { ok: false, error: error.message }

  // Gemelde aandachtspunten als opleverpunten op het dossier zetten. Niet-blokkerend: de feedback
  // van de bewoner is binnen, ook als dit misgaat.
  try { await materialiseerAandachtspunten(ins.id) } catch { /* niet-blokkerend */ }

  revalidatePath(`/opdrachten/${token.dossier_id}/oplevering`)
  return { ok: true }
}
