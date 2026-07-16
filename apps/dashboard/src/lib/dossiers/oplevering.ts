'use server'

import { createHash, randomBytes } from 'crypto'
import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  OpleverMoment,
  OpleverMomentStatus,
  OpleverMomentType,
  OpleverPunt,
  OpleverPuntStatus,
  OpleverPuntReactie,
  OpleverFoto,
  OpleverHandtekening,
  OpleverHandtekeningRol,
  OpleverToewijzingType,
  OpleverTokenScope,
} from '@everts/database'
import { assertDossierBewerkbaar } from './guards'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { maakMeerwerkRegel } from './meerwerk'
import { formatVeldwaardeTekst } from '@/components/formulieren/format'
import { isInvoerVeld } from '@/components/formulieren/types'
import type { FormField } from '@/components/formulieren/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

async function huidigeMedewerkerId(): Promise<string | null> {
  const mw = await getCurrentMedewerker()
  return mw?.id ?? null
}

function revalidate(dossierId: string) {
  revalidatePath(`/opdrachten/${dossierId}/oplevering`)
}

/* ─────────────────────────── Statusmachines ──────────────────────────────── */

/** Toegestane opleverpunt-transities (domein: Open → In behandeling → Opgelost → Geaccepteerd | Geweigerd). */
const PUNT_TRANSITIES: Record<OpleverPuntStatus, OpleverPuntStatus[]> = {
  open:           ['in_behandeling', 'opgelost', 'geaccepteerd'],
  in_behandeling: ['open', 'opgelost', 'geaccepteerd'],
  opgelost:       ['geaccepteerd', 'geweigerd', 'in_behandeling'],
  geaccepteerd:   ['in_behandeling'],
  geweigerd:      ['open', 'in_behandeling', 'opgelost'],
}

/* ─────────────────────────────── Views ───────────────────────────────────── */

export type OpleverPuntView = OpleverPunt & {
  fotos: OpleverFoto[]
  reacties: OpleverPuntReactie[]
  toegewezenNaam: string | null
  meerwerkVolgnummer: number | null
}

export type OpleverMomentView = OpleverMoment & {
  punten: OpleverPuntView[]
  handtekeningen: OpleverHandtekening[]
  aantalTotaal: number
  aantalOpen: number
  aantalGeaccepteerd: number
}

export type DossierOpleveringData = {
  momenten: OpleverMomentView[]
}

/**
 * Volledige opleverstructuur van een dossier: momenten → punten (met foto's, reacties, toegewezen-naam
 * en meerwerkkoppeling) → handtekeningen. Namen van toegewezen medewerkers/relaties worden in één
 * batch opgelost.
 */
export async function getDossierOplevering(dossierId: string): Promise<DossierOpleveringData> {
  const supabase = db()

  const { data: momentenRaw } = await supabase
    .from('oplever_momenten')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: true })
  const momenten = (momentenRaw ?? []) as OpleverMoment[]
  if (momenten.length === 0) return { momenten: [] }

  const momentIds = momenten.map(m => m.id)

  const [{ data: puntenRaw }, { data: handtekeningenRaw }] = await Promise.all([
    supabase.from('oplever_punten').select('*').in('moment_id', momentIds).order('volgnummer', { ascending: true }),
    supabase.from('oplever_handtekeningen').select('*').in('moment_id', momentIds).order('created_at', { ascending: true }),
  ])
  const punten = (puntenRaw ?? []) as OpleverPunt[]
  const handtekeningen = (handtekeningenRaw ?? []) as OpleverHandtekening[]
  const puntIds = punten.map(p => p.id)

  // Foto's, reacties, toegewezen-namen en meerwerk-volgnummers in batch ophalen.
  const [{ data: fotosRaw }, { data: reactiesRaw }] = await Promise.all([
    puntIds.length
      ? supabase.from('oplever_fotos').select('*').in('punt_id', puntIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
    puntIds.length
      ? supabase.from('oplever_punt_reacties').select('*').in('punt_id', puntIds).order('created_at', { ascending: true })
      : Promise.resolve({ data: [] }),
  ])
  const fotos = (fotosRaw ?? []) as OpleverFoto[]
  const reacties = (reactiesRaw ?? []) as OpleverPuntReactie[]

  // Namen van toegewezenen + meerwerk-volgnummers oplossen.
  const medewerkerIds = [...new Set(punten.map(p => p.toegewezen_medewerker_id).filter(Boolean))] as string[]
  const relatieIds = [...new Set(punten.map(p => p.toegewezen_relatie_id).filter(Boolean))] as string[]
  const meerwerkIds = [...new Set(punten.map(p => p.meerwerk_regel_id).filter(Boolean))] as string[]

  const [medewerkers, relaties, meerwerk] = await Promise.all([
    medewerkerIds.length
      ? supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', medewerkerIds)
      : Promise.resolve({ data: [] }),
    relatieIds.length
      ? supabase.from('relaties').select('id, naam').in('id', relatieIds)
      : Promise.resolve({ data: [] }),
    meerwerkIds.length
      ? supabase.from('meerwerk_regels').select('id, volgnummer').in('id', meerwerkIds)
      : Promise.resolve({ data: [] }),
  ])
  const medewerkerNaam = new Map<string, string>()
  for (const m of (medewerkers.data ?? [])) {
    medewerkerNaam.set(m.id, [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '))
  }
  const relatieNaam = new Map<string, string>((relaties.data ?? []).map((r: any) => [r.id, r.naam]))
  const meerwerkVolg = new Map<string, number>((meerwerk.data ?? []).map((r: any) => [r.id, r.volgnummer]))

  const puntenPerMoment = new Map<string, OpleverPuntView[]>()
  for (const p of punten) {
    const toegewezenNaam =
      p.toegewezen_type === 'medewerker'
        ? medewerkerNaam.get(p.toegewezen_medewerker_id ?? '') ?? null
        : p.toegewezen_type === 'relatie'
          ? relatieNaam.get(p.toegewezen_relatie_id ?? '') ?? null
          : null
    const view: OpleverPuntView = {
      ...p,
      fotos: fotos.filter(f => f.punt_id === p.id),
      reacties: reacties.filter(r => r.punt_id === p.id),
      toegewezenNaam,
      meerwerkVolgnummer: p.meerwerk_regel_id ? meerwerkVolg.get(p.meerwerk_regel_id) ?? null : null,
    }
    const list = puntenPerMoment.get(p.moment_id) ?? []
    list.push(view)
    puntenPerMoment.set(p.moment_id, list)
  }

  const momentViews: OpleverMomentView[] = momenten.map(m => {
    const mp = puntenPerMoment.get(m.id) ?? []
    return {
      ...m,
      punten: mp,
      handtekeningen: handtekeningen.filter(h => h.moment_id === m.id),
      aantalTotaal: mp.length,
      aantalOpen: mp.filter(p => p.status !== 'geaccepteerd').length,
      aantalGeaccepteerd: mp.filter(p => p.status === 'geaccepteerd').length,
    }
  })

  return { momenten: momentViews }
}

/* ────────────────────────────── Rapportage ───────────────────────────────── */

export type OpleverRapport = {
  dossier: { titel: string | null; nummer: string | null; werkadres: string | null; klant: string | null }
  moment: OpleverMoment
  punten: OpleverPuntView[]
  handtekeningen: OpleverHandtekening[]
}

/** Alle gegevens voor de opleverrapportage van één moment (dossier + klant + punten + handtekeningen). */
export async function getOplevermomentRapport(momentId: string): Promise<OpleverRapport | null> {
  const supabase = db()
  const { data: moment } = await supabase.from('oplever_momenten').select('*').eq('id', momentId).maybeSingle()
  if (!moment) return null

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('titel, dossiernummer, klant_id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', moment.dossier_id)
    .maybeSingle()
  let klant: string | null = null
  if (dossier?.klant_id) {
    const { data: r } = await supabase.from('relaties').select('naam').eq('id', dossier.klant_id).maybeSingle()
    klant = r?.naam ?? null
  }
  const werkadres = dossier
    ? [[dossier.werkadres_straat, dossier.werkadres_huisnummer].filter(Boolean).join(' '),
       [dossier.werkadres_postcode, dossier.werkadres_stad].filter(Boolean).join('  ')]
        .filter(Boolean).join(', ') || null
    : null

  const { data: punten } = await supabase.from('oplever_punten').select('*').eq('moment_id', momentId).order('volgnummer')
  const puntIds = (punten ?? []).map((p: any) => p.id)
  const [{ data: fotos }, { data: reacties }, { data: handtekeningen }] = await Promise.all([
    puntIds.length ? supabase.from('oplever_fotos').select('*').in('punt_id', puntIds) : Promise.resolve({ data: [] }),
    puntIds.length ? supabase.from('oplever_punt_reacties').select('*').in('punt_id', puntIds).order('created_at') : Promise.resolve({ data: [] }),
    supabase.from('oplever_handtekeningen').select('*').eq('moment_id', momentId).order('created_at'),
  ])

  const puntViews: OpleverPuntView[] = (punten ?? []).map((p: any) => ({
    ...p,
    fotos: (fotos ?? []).filter((f: any) => f.punt_id === p.id),
    reacties: (reacties ?? []).filter((r: any) => r.punt_id === p.id),
    toegewezenNaam: null,
    meerwerkVolgnummer: null,
  }))

  return {
    dossier: { titel: dossier?.titel ?? null, nummer: dossier?.dossiernummer ?? null, werkadres, klant },
    moment: moment as OpleverMoment,
    punten: puntViews,
    handtekeningen: (handtekeningen ?? []) as OpleverHandtekening[],
  }
}

/* ────────────────────────────── Momenten ─────────────────────────────────── */

export async function maakOplevermoment(
  dossierId: string,
  data: { titel: string; type?: OpleverMomentType; opgeleverd_op?: string | null; opmerking?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = db()
  const { data: ins, error } = await supabase
    .from('oplever_momenten')
    .insert({
      dossier_id: dossierId,
      titel: data.titel,
      type: data.type ?? 'eindoplevering',
      opgeleverd_op: data.opgeleverd_op ?? null,
      opmerking: data.opmerking ?? null,
      created_by: await huidigeMedewerkerId(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(dossierId)
  return { ok: true, id: ins.id }
}

export async function updateOplevermoment(
  id: string,
  patch: { titel?: string; type?: OpleverMomentType; opgeleverd_op?: string | null; opmerking?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['titel', 'type', 'opgeleverd_op', 'opmerking'] as const) if (k in patch) velden[k] = patch[k]
  const { error } = await supabase.from('oplever_momenten').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

export async function setMomentStatus(
  id: string,
  status: OpleverMomentStatus,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase
    .from('oplever_momenten')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

export async function verwijderOplevermoment(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase.from('oplever_momenten').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/* ─────────────────────────────── Punten ──────────────────────────────────── */

export type NieuwOpleverpunt = {
  omschrijving: string
  ruimte?: string | null
  toegewezen_type?: OpleverToewijzingType | null
  toegewezen_medewerker_id?: string | null
  toegewezen_relatie_id?: string | null
  deadline?: string | null
}

export async function maakOpleverpunt(
  momentId: string,
  data: NieuwOpleverpunt,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: moment } = await supabase
    .from('oplever_momenten')
    .select('dossier_id')
    .eq('id', momentId)
    .single()
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden' }
  await assertDossierBewerkbaar(moment.dossier_id)

  const { data: maxRow } = await supabase
    .from('oplever_punten')
    .select('volgnummer')
    .eq('moment_id', momentId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  const { data: ins, error } = await supabase
    .from('oplever_punten')
    .insert({
      moment_id: momentId,
      dossier_id: moment.dossier_id,
      volgnummer,
      omschrijving: data.omschrijving,
      ruimte: data.ruimte ?? null,
      toegewezen_type: data.toegewezen_type ?? null,
      toegewezen_medewerker_id: data.toegewezen_type === 'medewerker' ? data.toegewezen_medewerker_id ?? null : null,
      toegewezen_relatie_id: data.toegewezen_type === 'relatie' ? data.toegewezen_relatie_id ?? null : null,
      deadline: data.deadline ?? null,
      created_by: await huidigeMedewerkerId(),
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(moment.dossier_id)
  return { ok: true, id: ins.id }
}

export async function updateOpleverpunt(
  id: string,
  patch: Partial<NieuwOpleverpunt>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['omschrijving', 'ruimte', 'toegewezen_type', 'deadline'] as const) if (k in patch) velden[k] = patch[k]
  // Toewijzing consistent houden: het niet-actieve id wordt op null gezet.
  if ('toegewezen_type' in patch || 'toegewezen_medewerker_id' in patch || 'toegewezen_relatie_id' in patch) {
    const type = patch.toegewezen_type ?? null
    velden.toegewezen_type = type
    velden.toegewezen_medewerker_id = type === 'medewerker' ? patch.toegewezen_medewerker_id ?? null : null
    velden.toegewezen_relatie_id = type === 'relatie' ? patch.toegewezen_relatie_id ?? null : null
  }
  const { error } = await supabase.from('oplever_punten').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/**
 * Statusovergang met transitie-guard. Zet automatisch afgemeld_op (bij 'opgelost'),
 * geaccepteerd_op (bij 'geaccepteerd') en de weigerreden (bij 'geweigerd').
 */
export async function setPuntStatus(
  id: string,
  status: OpleverPuntStatus,
  opts?: { reden?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id, status').eq('id', id).single()
  if (!row) return { ok: false, error: 'Opleverpunt niet gevonden' }
  await assertDossierBewerkbaar(row.dossier_id)

  const huidige = row.status as OpleverPuntStatus
  if (huidige !== status && !PUNT_TRANSITIES[huidige].includes(status)) {
    return { ok: false, error: `Ongeldige statusovergang: ${huidige} → ${status}` }
  }

  const now = new Date().toISOString()
  const velden: Record<string, unknown> = { status, updated_at: now }
  if (status === 'opgelost') velden.afgemeld_op = now
  if (status === 'geaccepteerd') velden.geaccepteerd_op = now
  if (status === 'geweigerd') velden.geweigerd_reden = opts?.reden ?? null

  const { data: bijgewerkt, error } = await supabase
    .from('oplever_punten').update(velden).eq('id', id).select('moment_id').single()
  if (error) return { ok: false, error: error.message }

  // Auto-status: zodra alle punten van het moment geaccepteerd zijn → moment "gereed voor
  // ondertekening" (alleen vanuit een lopende status; ondertekend/afgerond blijven ongemoeid).
  if (status === 'geaccepteerd' && bijgewerkt?.moment_id) {
    await bumpMomentBijVolledigGeaccepteerd(supabase, bijgewerkt.moment_id)
  }

  revalidate(row.dossier_id)
  return { ok: true }
}

/** Zet een moment op 'gereed_voor_ondertekening' zodra er punten zijn en geen enkel punt meer open is. */
async function bumpMomentBijVolledigGeaccepteerd(supabase: any, momentId: string): Promise<void> {
  const { data: punten } = await supabase.from('oplever_punten').select('status').eq('moment_id', momentId)
  const rows = (punten ?? []) as { status: OpleverPuntStatus }[]
  if (rows.length === 0 || rows.some(p => p.status !== 'geaccepteerd')) return
  const { data: moment } = await supabase.from('oplever_momenten').select('status').eq('id', momentId).single()
  if (moment && (moment.status === 'concept' || moment.status === 'in_uitvoering')) {
    await supabase.from('oplever_momenten')
      .update({ status: 'gereed_voor_ondertekening', updated_at: new Date().toISOString() })
      .eq('id', momentId)
  }
}

export async function verwijderOpleverpunt(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase.from('oplever_punten').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/* ────────────────────────── Extra werk → meerwerk ────────────────────────── */

/**
 * Markeert een opleverpunt als "extra werk": maakt een meerwerkregel aan (regie, aangevraagd) met de
 * omschrijving van het punt en koppelt de nieuwe regel terug op het punt. Idempotent — een punt dat al
 * gekoppeld is, wordt niet nogmaals aangemaakt.
 */
export async function markeerAlsExtraWerk(
  puntId: string,
): Promise<{ ok: true; meerwerkRegelId: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: punt } = await supabase
    .from('oplever_punten')
    .select('dossier_id, omschrijving, ruimte, meerwerk_regel_id, is_extra_werk')
    .eq('id', puntId)
    .single()
  if (!punt) return { ok: false, error: 'Opleverpunt niet gevonden' }
  await assertDossierBewerkbaar(punt.dossier_id)
  if (punt.meerwerk_regel_id) return { ok: true, meerwerkRegelId: punt.meerwerk_regel_id }

  const omschrijving = punt.ruimte ? `${punt.omschrijving} (${punt.ruimte})` : punt.omschrijving
  const res = await maakMeerwerkRegel(punt.dossier_id, { omschrijving, afrekenwijze: 'regie' })
  if (!res.ok) return res

  const { error } = await supabase
    .from('oplever_punten')
    .update({ is_extra_werk: true, meerwerk_regel_id: res.id, updated_at: new Date().toISOString() })
    .eq('id', puntId)
  if (error) return { ok: false, error: error.message }
  revalidate(punt.dossier_id)
  return { ok: true, meerwerkRegelId: res.id }
}

/** Ontkoppelt "extra werk" van een punt (laat de meerwerkregel zelf staan). */
export async function ontkoppelExtraWerk(puntId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', puntId).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
  const { error } = await supabase
    .from('oplever_punten')
    .update({ is_extra_werk: false, meerwerk_regel_id: null, updated_at: new Date().toISOString() })
    .eq('id', puntId)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidate(row.dossier_id)
  return { ok: true }
}

/* ─────────────────────────────── Reacties ────────────────────────────────── */

export async function voegPuntReactieToe(
  puntId: string,
  data: {
    opmerking?: string | null
    foto_urls?: string[]
    soort?: 'afmelding' | 'review' | 'opmerking'
    auteur_type?: 'intern' | 'onderaannemer'
    auteur_naam?: string | null
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', puntId).single()
  if (!row) return { ok: false, error: 'Opleverpunt niet gevonden' }

  const auteurType = data.auteur_type ?? 'intern'
  let auteurMedewerkerId: string | null = null
  let auteurNaam = data.auteur_naam ?? null
  if (auteurType === 'intern') {
    const mw = await getCurrentMedewerker()
    auteurMedewerkerId = mw?.id ?? null
    if (!auteurNaam && mw) auteurNaam = [mw.voornaam, mw.tussenvoegsel, mw.achternaam].filter(Boolean).join(' ')
  }

  const { data: ins, error } = await supabase
    .from('oplever_punt_reacties')
    .insert({
      punt_id: puntId,
      auteur_type: auteurType,
      auteur_naam: auteurNaam,
      auteur_medewerker_id: auteurMedewerkerId,
      soort: data.soort ?? 'opmerking',
      opmerking: data.opmerking ?? null,
      foto_urls: data.foto_urls ?? [],
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  if (row.dossier_id) revalidate(row.dossier_id)
  return { ok: true, id: ins.id }
}

/* ───────────────────────────────── Foto's ────────────────────────────────── */

/** Uploadt een opleverfoto naar de publieke bucket `oplever-fotos` en registreert de rij. */
export async function uploadOpleverFoto(
  puntId: string,
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: row } = await supabase.from('oplever_punten').select('dossier_id').eq('id', puntId).single()
  if (!row) return { ok: false, error: 'Opleverpunt niet gevonden' }

  const file = formData.get('foto') as File | null
  if (!file) return { ok: false, error: 'Geen bestand meegegeven' }
  const soort = (formData.get('soort') as string | null) ?? 'algemeen'

  const ext = file.name.split('.').pop() ?? 'jpg'
  const path = `${puntId}/${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from('oplever-fotos')
    .upload(path, buffer, { contentType: file.type || 'image/jpeg', upsert: false })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: urlData } = supabase.storage.from('oplever-fotos').getPublicUrl(path)
  await supabase.from('oplever_fotos').insert({
    punt_id: puntId,
    url: urlData.publicUrl,
    soort: ['voor', 'na', 'algemeen'].includes(soort) ? soort : 'algemeen',
    created_by: await huidigeMedewerkerId(),
  })
  revalidate(row.dossier_id)
  return { ok: true, url: urlData.publicUrl }
}

export async function verwijderOpleverFoto(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { data: foto } = await supabase
    .from('oplever_fotos')
    .select('url, oplever_punten!inner(dossier_id)')
    .eq('id', id)
    .single()
  const dossierId = (foto as any)?.oplever_punten?.dossier_id as string | undefined
  const { error } = await supabase.from('oplever_fotos').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (dossierId) revalidate(dossierId)
  return { ok: true }
}

/* ─────────────────────────── Handtekening / akkoord ──────────────────────── */

/** Legt een handtekening (ter plekke, PNG-dataURL) of akkoord vast bij een oplevermoment. */
export async function voegHandtekeningToe(
  momentId: string,
  data: {
    rol: OpleverHandtekeningRol
    naam?: string | null
    handtekening_b64?: string | null
    methode?: 'pad' | 'akkoord_knop'
    ip?: string | null
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = db()
  const { data: moment } = await supabase.from('oplever_momenten').select('dossier_id').eq('id', momentId).single()
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden' }

  const methode = data.methode ?? (data.handtekening_b64 ? 'pad' : 'akkoord_knop')
  let handtekeningUrl: string | null = null
  if (methode === 'pad' && data.handtekening_b64) {
    const base64 = data.handtekening_b64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64, 'base64')
    const path = `handtekeningen/${momentId}/${data.rol}-${Date.now()}.png`
    const { error: upErr } = await supabase.storage
      .from('oplever-fotos')
      .upload(path, buffer, { contentType: 'image/png', upsert: true })
    if (!upErr) handtekeningUrl = supabase.storage.from('oplever-fotos').getPublicUrl(path).data.publicUrl
  }

  const { data: ins, error } = await supabase
    .from('oplever_handtekeningen')
    .insert({
      moment_id: momentId,
      rol: data.rol,
      naam: data.naam ?? null,
      methode,
      handtekening_url: handtekeningUrl,
      ip: data.ip ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidate(moment.dossier_id)
  return { ok: true, id: ins.id }
}

/* ─────────────────────────── Toewijsbare partijen ────────────────────────── */

export type OpleverToewijsbaar = {
  medewerkers: { id: string; naam: string }[]
  relaties: { id: string; naam: string; email: string | null; onderaannemer: boolean }[]
}

/** Lijsten voor de toewijzing-picker: actieve medewerkers + onderaannemer/leverancier-relaties. */
export async function getOpleverToewijsbaar(): Promise<OpleverToewijsbaar> {
  const supabase = db()
  const [{ data: mw }, { data: rel }] = await Promise.all([
    supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').eq('actief', true).order('achternaam'),
    supabase
      .from('relaties')
      .select('id, naam, email, types')
      .eq('actief', true)
      .overlaps('types', ['onderaannemer', 'leverancier'])
      .order('naam'),
  ])
  return {
    medewerkers: (mw ?? []).map((m: any) => ({
      id: m.id,
      naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
    })),
    relaties: (rel ?? []).map((r: any) => ({
      id: r.id,
      naam: r.naam,
      email: r.email ?? null,
      onderaannemer: Array.isArray(r.types) && r.types.includes('onderaannemer'),
    })),
  }
}

/* ─────────────────────── Betaalsignaal (alleen signaleren) ────────────────── */

export type OpleverBetaalsignaal = {
  relatieId: string
  naam: string | null
  open: number
  totaal: number
}

/**
 * Per betrokken relatie het aantal nog niet-geaccepteerde opleverpunten. Puur informatief: de
 * Inkoop-tab toont hiermee "betaling nog niet vrijgeven" zolang `open > 0`. Blokkeert niets.
 */
export async function getOpleverBetaalsignaal(dossierId: string): Promise<OpleverBetaalsignaal[]> {
  const supabase = db()
  const { data: punten } = await supabase
    .from('oplever_punten')
    .select('toegewezen_relatie_id, status')
    .eq('dossier_id', dossierId)
    .eq('toegewezen_type', 'relatie')
    .not('toegewezen_relatie_id', 'is', null)
  const rows = (punten ?? []) as { toegewezen_relatie_id: string; status: OpleverPuntStatus }[]
  if (rows.length === 0) return []

  const perRelatie = new Map<string, { open: number; totaal: number }>()
  for (const r of rows) {
    const agg = perRelatie.get(r.toegewezen_relatie_id) ?? { open: 0, totaal: 0 }
    agg.totaal += 1
    if (r.status !== 'geaccepteerd') agg.open += 1
    perRelatie.set(r.toegewezen_relatie_id, agg)
  }

  const ids = [...perRelatie.keys()]
  const { data: relaties } = await supabase.from('relaties').select('id, naam').in('id', ids)
  const naam = new Map<string, string>((relaties ?? []).map((r: any) => [r.id, r.naam]))
  return ids.map(id => ({
    relatieId: id,
    naam: naam.get(id) ?? null,
    open: perRelatie.get(id)!.open,
    totaal: perRelatie.get(id)!.totaal,
  }))
}

/* ──────────────────────────── Toegang-tokens ──────────────────────────────── */

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') ||
    'http://localhost:3000'
  )
}

const TOKEN_PAD: Record<OpleverTokenScope, string> = {
  onderaannemer: 'oplevering',
  ondertekening: 'akkoord',
  feedback: 'feedback',
}

/** Bouwt de publieke link voor een ruwe token. */
function tokenUrl(scope: OpleverTokenScope, raw: string): string {
  return `${appBaseUrl()}/p/${TOKEN_PAD[scope]}/${raw}`
}

/**
 * Maakt een publiek toegang-token aan en geeft de volledige tokenlink terug.
 * `token_hash` blijft de lookup-sleutel; `token_raw` wordt bewaard zodat de link later
 * opnieuw te tonen en te kopiëren is in de Oplevering-tab.
 */
export async function maakToegangToken(
  scope: OpleverTokenScope,
  opts: {
    dossierId: string
    relatieId?: string | null
    momentId?: string | null
    formTemplateId?: string | null
    omschrijving?: string | null
    geldigDagen?: number
  },
): Promise<{ ok: true; url: string; token: string } | { ok: false; error: string }> {
  const supabase = db()
  const raw = randomBytes(24).toString('base64url')
  const verlooptOp = opts.geldigDagen
    ? new Date(Date.now() + opts.geldigDagen * 86400_000).toISOString()
    : null
  const { error } = await supabase.from('oplever_toegang_tokens').insert({
    token_hash: hashToken(raw),
    token_raw: raw,
    dossier_id: opts.dossierId,
    scope,
    relatie_id: opts.relatieId ?? null,
    moment_id: opts.momentId ?? null,
    form_template_id: opts.formTemplateId ?? null,
    omschrijving: opts.omschrijving ?? null,
    verloopt_op: verlooptOp,
    created_by: await huidigeMedewerkerId(),
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true, url: tokenUrl(scope, raw), token: raw }
}

export type OpleverTokenLink = {
  id: string
  url: string
  scope: OpleverTokenScope
  omschrijving: string | null
  formTemplateId: string | null
  templateNaam: string | null
  verlooptOp: string | null
  verlopen: boolean
  createdAt: string
}

/**
 * Eerder aangemaakte tokenlinks van een dossier, zodat ze in de Oplevering-tab getoond en
 * opnieuw gekopieerd kunnen worden. Links van vóór de `token_raw`-migratie hebben geen ruwe
 * token meer en worden overgeslagen — die zijn onherstelbaar.
 */
export async function getOpleverTokenLinks(
  dossierId: string,
  scope?: OpleverTokenScope,
): Promise<OpleverTokenLink[]> {
  const supabase = db()
  let query = supabase
    .from('oplever_toegang_tokens')
    .select('id, token_raw, scope, omschrijving, form_template_id, verloopt_op, created_at')
    .eq('dossier_id', dossierId)
    .not('token_raw', 'is', null)
    .order('created_at', { ascending: false })
  if (scope) query = query.eq('scope', scope)
  const { data } = await query
  const rijen = (data ?? []) as any[]
  if (rijen.length === 0) return []

  const templateIds = [...new Set(rijen.map(r => r.form_template_id).filter(Boolean))]
  const namen = new Map<string, string>()
  if (templateIds.length > 0) {
    const { data: templates } = await supabase.from('form_templates').select('id, naam').in('id', templateIds)
    for (const t of (templates ?? []) as any[]) namen.set(t.id, t.naam)
  }

  const nu = Date.now()
  return rijen.map(r => ({
    id: r.id,
    url: tokenUrl(r.scope as OpleverTokenScope, r.token_raw as string),
    scope: r.scope as OpleverTokenScope,
    omschrijving: r.omschrijving ?? null,
    formTemplateId: r.form_template_id ?? null,
    templateNaam: r.form_template_id ? namen.get(r.form_template_id) ?? null : null,
    verlooptOp: r.verloopt_op ?? null,
    verlopen: !!r.verloopt_op && new Date(r.verloopt_op).getTime() < nu,
    createdAt: r.created_at,
  }))
}

/** Trekt een tokenlink in: de link werkt daarna niet meer. */
export async function verwijderToegangToken(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()
  const { error } = await supabase.from('oplever_toegang_tokens').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/* ──────────────────────── Feedback-ronde (Formulieren) ────────────────────── */

/** Gepubliceerde feedbacksjablonen (categorie 'oplevering') voor de feedback-link-picker. */
export async function getOpleverFeedbackTemplates(): Promise<{ id: string; naam: string }[]> {
  const supabase = db()
  const { data } = await supabase
    .from('form_templates')
    .select('id, naam')
    .eq('categorie', 'oplevering')
    .eq('status', 'gepubliceerd')
    .order('naam')
  return (data ?? []).map((t: any) => ({ id: t.id, naam: t.naam }))
}

export type FeedbackCijfer = { label: string; gemiddelde: number; aantal: number }
export type OpleverFeedbackSamenvatting = {
  aantal: number
  cijfers: FeedbackCijfer[]
}

/**
 * Aggregatie van bewonersfeedback op een dossier: aantal inzendingen + gemiddeld cijfer per
 * rating-/number-veld (klanttevredenheid). Leest de schema's van de betrokken versies om de
 * cijfervelden en hun labels te vinden.
 */
export async function getOpleverFeedbackSamenvatting(dossierId: string): Promise<OpleverFeedbackSamenvatting> {
  const supabase = db()
  const { data: inzendingen } = await supabase
    .from('form_inzendingen')
    .select('waarden, versie_id')
    .eq('dossier_id', dossierId)
    .eq('project_ref', 'oplever-feedback')
    .eq('status', 'ingediend')
  const rijen = (inzendingen ?? []) as { waarden: Record<string, unknown>; versie_id: string }[]
  if (rijen.length === 0) return { aantal: 0, cijfers: [] }

  const versieIds = [...new Set(rijen.map(r => r.versie_id).filter(Boolean))]
  const { data: versies } = await supabase.from('form_versies').select('id, schema').in('id', versieIds)

  // fieldId → label voor cijfer-achtige velden (rating/number), incl. velden in herhalende secties.
  const cijferVeld = new Map<string, string>()
  const scanFields = (fields: any[]) => {
    for (const f of fields ?? []) {
      if (f.type === 'rating' || f.type === 'number') cijferVeld.set(f.id, f.label)
      if (Array.isArray(f.children)) scanFields(f.children)
    }
  }
  for (const v of (versies ?? []) as any[]) scanFields(v.schema?.fields ?? [])

  const som = new Map<string, { total: number; n: number }>()
  for (const r of rijen) {
    for (const [fid, label] of cijferVeld) {
      const raw = r.waarden?.[fid]
      const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN
      if (!Number.isFinite(n)) continue
      const agg = som.get(label) ?? { total: 0, n: 0 }
      agg.total += n; agg.n += 1
      som.set(label, agg)
    }
  }

  const cijfers: FeedbackCijfer[] = [...som.entries()].map(([label, a]) => ({
    label, gemiddelde: Math.round((a.total / a.n) * 10) / 10, aantal: a.n,
  }))
  return { aantal: rijen.length, cijfers }
}

/** Eén ingevuld veld van een feedbackinzending, klaar om te tonen. */
export type FeedbackAntwoord = {
  label: string
  waarde: string
  /** Afbeeldings-URL's bij photo-/signature-velden. */
  fotos: string[]
}
export type FeedbackInzending = {
  id: string
  templateId: string
  templateNaam: string
  ingediendOp: string | null
  aangemaaktOp: string
  antwoorden: FeedbackAntwoord[]
}

function isLegeWaarde(v: unknown): boolean {
  return v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)
}

/** Zet één veld + waarde om naar toonbare antwoorden (herhalende secties worden uitgevouwen). */
function veldNaarAntwoorden(field: FormField, waarde: unknown, prefix = ''): FeedbackAntwoord[] {
  // Koppen, tekstblokken, afbeeldingen e.d. zijn opmaak en hebben geen antwoord.
  if (!isInvoerVeld(field)) return []
  // Dossier-velden worden bij het invullen automatisch gevuld en niet opgeslagen; een leeg
  // dossier-veld is dus geen onbeantwoorde vraag maar ruis.
  if (field.type === 'dossier' && isLegeWaarde(waarde)) return []
  const label = prefix ? `${prefix} · ${field.label}` : field.label

  if (field.type === 'repeatable') {
    const rijen = Array.isArray(waarde) ? (waarde as Record<string, unknown>[]) : []
    return rijen.flatMap((rij, i) =>
      (field.children ?? []).flatMap(child =>
        veldNaarAntwoorden(child, rij?.[child.id], `${label} ${i + 1}`),
      ),
    )
  }

  const fotos =
    field.type === 'photo' && Array.isArray(waarde)
      ? (waarde as string[]).filter(u => typeof u === 'string')
      : field.type === 'signature' && typeof waarde === 'string' && waarde !== ''
        ? [waarde]
        : []

  return [{
    label,
    waarde: isLegeWaarde(waarde) ? 'Niet ingevuld' : formatVeldwaardeTekst(field, waarde),
    fotos,
  }]
}

/**
 * Alle ingezonden bewonersfeedback van een dossier, mét álle ingevulde velden — niet alleen de
 * cijfers uit `getOpleverFeedbackSamenvatting`. Leest het schema van de gebruikte versie zodat
 * labels en opmaak overeenkomen met het formulier zoals het is ingevuld.
 */
export async function getOpleverFeedbackInzendingen(dossierId: string): Promise<FeedbackInzending[]> {
  const supabase = db()
  const { data: inzendingen } = await supabase
    .from('form_inzendingen')
    .select('id, template_id, versie_id, waarden, ingediend_op, aangemaakt_op')
    .eq('dossier_id', dossierId)
    .eq('project_ref', 'oplever-feedback')
    .eq('status', 'ingediend')
    .order('ingediend_op', { ascending: false, nullsFirst: false })
  const rijen = (inzendingen ?? []) as any[]
  if (rijen.length === 0) return []

  const versieIds = [...new Set(rijen.map(r => r.versie_id).filter(Boolean))]
  const templateIds = [...new Set(rijen.map(r => r.template_id).filter(Boolean))]
  const [{ data: versies }, { data: templates }] = await Promise.all([
    supabase.from('form_versies').select('id, schema').in('id', versieIds),
    supabase.from('form_templates').select('id, naam').in('id', templateIds),
  ])
  const schemaVanVersie = new Map<string, FormField[]>()
  for (const v of (versies ?? []) as any[]) schemaVanVersie.set(v.id, v.schema?.fields ?? [])
  const naamVanTemplate = new Map<string, string>()
  for (const t of (templates ?? []) as any[]) naamVanTemplate.set(t.id, t.naam)

  return rijen.map(r => {
    const fields = schemaVanVersie.get(r.versie_id) ?? []
    const waarden = (r.waarden ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      templateId: r.template_id,
      templateNaam: naamVanTemplate.get(r.template_id) ?? 'Formulier',
      ingediendOp: r.ingediend_op ?? null,
      aangemaaktOp: r.aangemaakt_op,
      antwoorden: fields.flatMap(f => veldNaarAntwoorden(f, waarden[f.id])),
    }
  })
}

export type ToegangTokenContext = {
  id: string
  dossier_id: string
  scope: OpleverTokenScope
  relatie_id: string | null
  moment_id: string | null
  form_template_id: string | null
}

/**
 * Valideert een ruwe token voor een verwachte scope. Gebruikt door de publieke /p/-routes met de
 * admin-client (geen login). Retourneert de contextvelden, of null bij ongeldig/verlopen.
 */
export async function valideerToken(
  rawToken: string,
  verwachteScope: OpleverTokenScope,
): Promise<ToegangTokenContext | null> {
  const supabase = db()
  const { data } = await supabase
    .from('oplever_toegang_tokens')
    .select('id, dossier_id, scope, relatie_id, moment_id, form_template_id, verloopt_op')
    .eq('token_hash', hashToken(rawToken))
    .eq('scope', verwachteScope)
    .maybeSingle()
  if (!data) return null
  if (data.verloopt_op && new Date(data.verloopt_op).getTime() < Date.now()) return null
  return {
    id: data.id,
    dossier_id: data.dossier_id,
    scope: data.scope,
    relatie_id: data.relatie_id,
    moment_id: data.moment_id,
    form_template_id: data.form_template_id,
  }
}
