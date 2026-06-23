'use server'

import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang, isBeheerder } from '@/lib/auth/rechten-shared'
import { syncDebiteuren } from '@/lib/bouw7/sync'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type Stoplicht = 'groen' | 'oranje' | 'rood'
export type DebiteurOpvolgstatus = 'nieuw' | 'loopt' | 'wacht_op_klant' | 'opgelost' | 'geescaleerd'

export type DebiteurRij = {
  id: string
  factuurnummer: string | null
  klant_naam: string | null
  project_titel: string | null
  dossier_id: string | null
  bouw7_project_id: string | null
  projectleider_id: string | null
  projectleider_naam: string | null
  bedrag: number | null
  factuurdatum: string | null
  vervaldatum: string | null
  /** Dagen sinds factuurdatum (kan negatief in theorie; meestal positief). */
  dagen_na_factuurdatum: number | null
  /** Dagen ná vervaldatum (>0 = te laat). Bron voor het verkeerslicht. */
  dagen_na_vervaldatum: number | null
  stoplicht: Stoplicht
  status: string
  reden_code_id: string | null
  reden_label: string | null
  actie: string | null
  actiehouder_id: string | null
  actiehouder_naam: string | null
  verwachte_betaaldatum: string | null
  opvolgdatum: string | null
  opvolgstatus: DebiteurOpvolgstatus
  task_id: string | null
  /** Heeft minstens één logboekregel. */
  heeft_logboek: boolean
  /** >60 dagen te laat én verplichte opvolgvelden/logboek nog niet compleet. */
  verplicht_incompleet: boolean
}

export type Redencode = { id: string; code: string; label: string; volgorde: number; actief: boolean }

/** Aantal hele dagen tussen een ISO-datum (YYYY-MM-DD) en vandaag (UTC, tijdzone-veilig). */
function dagenSinds(datum: string | null, vandaagMs: number): number | null {
  if (!datum) return null
  const ms = Date.parse(`${datum.slice(0, 10)}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  return Math.floor((vandaagMs - ms) / 86_400_000)
}

/** Verkeerslicht op basis van dagen ná vervaldatum: groen = niet vervallen, oranje <30, rood 30+. */
function bepaalStoplicht(dagenNaVerval: number | null): Stoplicht {
  if (dagenNaVerval == null || dagenNaVerval <= 0) return 'groen'
  if (dagenNaVerval < 30) return 'oranje'
  return 'rood'
}

function volledigeNaam(m?: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null): string | null {
  if (!m) return null
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ') || null
}

const VERPLICHTE_VELDEN_DREMPEL_DAGEN = 60

/**
 * Haal de debiteuren op (default: alle openstaande). De rolweergave (projectleider ziet eigen)
 * gebeurt als zachte filter ín de client (toggle "Mijn / Alle"); de server levert dus alle rijen
 * zodat omschakelen geen extra fetch vergt.
 */
export async function getDebiteuren(opts?: { includeBetaald?: boolean }): Promise<DebiteurRij[]> {
  const supabase = db()
  let q = supabase
    .from('debiteuren')
    .select('id, factuurnummer, klant_naam, project_titel, dossier_id, bouw7_project_id, projectleider_id, bedrag, factuurdatum, vervaldatum, status, reden_code_id, actie, actiehouder_id, verwachte_betaaldatum, opvolgdatum, opvolgstatus, task_id')
  if (!opts?.includeBetaald) q = q.eq('status', 'open')
  const { data: rows } = await q
  const debiteuren: Record<string, unknown>[] = rows ?? []
  if (debiteuren.length === 0) return []

  // Lookups: redencode-label, medewerker-naam (projectleider + actiehouder), logboek-aanwezigheid.
  const medewerkerIds = new Set<string>()
  const redencodeIds = new Set<string>()
  for (const d of debiteuren) {
    if (d.projectleider_id) medewerkerIds.add(d.projectleider_id as string)
    if (d.actiehouder_id) medewerkerIds.add(d.actiehouder_id as string)
    if (d.reden_code_id) redencodeIds.add(d.reden_code_id as string)
  }

  const [mwRes, redRes, logRes] = await Promise.all([
    medewerkerIds.size
      ? supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam').in('id', [...medewerkerIds])
      : Promise.resolve({ data: [] }),
    redencodeIds.size
      ? supabase.from('debiteur_redencodes').select('id, label').in('id', [...redencodeIds])
      : Promise.resolve({ data: [] }),
    supabase.from('debiteur_logboek').select('debiteur_id').in('debiteur_id', debiteuren.map(d => d.id as string)),
  ])

  const mwMap = new Map<string, { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }>(
    (mwRes.data ?? []).map((m: { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }) =>
      [m.id, m]))
  const redMap = new Map<string, string>((redRes.data ?? []).map((r: { id: string; label: string }) => [r.id, r.label]))
  const logSet = new Set<string>((logRes.data ?? []).map((l: { debiteur_id: string }) => l.debiteur_id))

  const vandaagMs = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`)

  return debiteuren.map((d): DebiteurRij => {
    const dagenNaFactuur = dagenSinds(d.factuurdatum as string | null, vandaagMs)
    const dagenNaVerval = dagenSinds(d.vervaldatum as string | null, vandaagMs)
    const heeftLogboek = logSet.has(d.id as string)
    const verplichtPeriode = (dagenNaVerval ?? 0) > VERPLICHTE_VELDEN_DREMPEL_DAGEN
    const veldenCompleet = !!d.reden_code_id && !!(d.actie as string | null)?.trim() && !!d.actiehouder_id
      && !!d.opvolgdatum && heeftLogboek
    return {
      id: d.id as string,
      factuurnummer: (d.factuurnummer as string | null) ?? null,
      klant_naam: (d.klant_naam as string | null) ?? null,
      project_titel: (d.project_titel as string | null) ?? null,
      dossier_id: (d.dossier_id as string | null) ?? null,
      bouw7_project_id: (d.bouw7_project_id as string | null) ?? null,
      projectleider_id: (d.projectleider_id as string | null) ?? null,
      projectleider_naam: volledigeNaam(mwMap.get(d.projectleider_id as string)),
      bedrag: d.bedrag != null ? Number(d.bedrag) : null,
      factuurdatum: (d.factuurdatum as string | null) ?? null,
      vervaldatum: (d.vervaldatum as string | null) ?? null,
      dagen_na_factuurdatum: dagenNaFactuur,
      dagen_na_vervaldatum: dagenNaVerval,
      stoplicht: bepaalStoplicht(dagenNaVerval),
      status: d.status as string,
      reden_code_id: (d.reden_code_id as string | null) ?? null,
      reden_label: d.reden_code_id ? (redMap.get(d.reden_code_id as string) ?? null) : null,
      actie: (d.actie as string | null) ?? null,
      actiehouder_id: (d.actiehouder_id as string | null) ?? null,
      actiehouder_naam: volledigeNaam(mwMap.get(d.actiehouder_id as string)),
      verwachte_betaaldatum: (d.verwachte_betaaldatum as string | null) ?? null,
      opvolgdatum: (d.opvolgdatum as string | null) ?? null,
      opvolgstatus: (d.opvolgstatus as DebiteurOpvolgstatus) ?? 'nieuw',
      task_id: (d.task_id as string | null) ?? null,
      heeft_logboek: heeftLogboek,
      verplicht_incompleet: verplichtPeriode && !veldenCompleet,
    }
  })
}

/** Mag de huidige gebruiker debiteuren-opvolging bewerken/corrigeren? (administratie/beheer). */
export async function magDebiteurenBewerken(): Promise<boolean> {
  const rechten = await getEffectieveRechten()
  return isBeheerder(rechten) || heeftModuleToegang(rechten, 'financieel', 'schrijven')
}

/** Actieve redencodes (gesorteerd) voor de opvolg-dropdown. */
export async function getRedencodes(opts?: { inclusiefInactief?: boolean }): Promise<Redencode[]> {
  const supabase = db()
  let q = supabase.from('debiteur_redencodes').select('id, code, label, volgorde, actief').order('volgorde', { ascending: true })
  if (!opts?.inclusiefInactief) q = q.eq('actief', true)
  const { data } = await q
  return (data ?? []) as Redencode[]
}

export type VerversResultaat = { ok: true; nieuw: number; bijgewerkt: number } | { ok: false; error: string }

/** Handmatig de debiteuren verversen vanuit Bouw7 ("Ververs"-knop). */
export async function ververDebiteuren(): Promise<VerversResultaat> {
  if (!(await magDebiteurenBewerken())) return { ok: false, error: 'Geen rechten om te verversen.' }
  const res = await syncDebiteuren({ mode: 'full' })
  revalidatePath('/facturen')
  if (res.fouten > 0) return { ok: false, error: res.foutMelding ?? 'Sync mislukt' }
  return { ok: true, nieuw: res.nieuw, bijgewerkt: res.bijgewerkt }
}

export type MedewerkerOptie = { id: string; naam: string }

/**
 * Actieve binnendienst-medewerkers voor de actiehouder-dropdown.
 * "Kantoor" = de binnendienst-afdelingen (medewerkers hebben geen letterlijke afdeling 'Kantoor';
 * buitendienst Schilder/Timmerman valt er bewust buiten).
 */
const KANTOOR_AFDELINGEN = ['Administratie', 'Projectbureau', 'Directie', 'Teamleiders']

export async function getMedewerkerOpties(): Promise<MedewerkerOptie[]> {
  const supabase = db()
  const { data } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .eq('actief', true)
    .in('afdeling', KANTOOR_AFDELINGEN)
    .order('voornaam', { ascending: true })
  return (data ?? [])
    .map((m: { id: string; voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null }) =>
      ({ id: m.id, naam: volledigeNaam(m) ?? '—' }))
}

export type LogboekRegel = { id: string; tekst: string; aangemaakt_op: string; auteur: string | null }

/** Logboekregels van één debiteur (oudste eerst), met auteur-naam waar bekend. */
export async function getDebiteurLogboek(debiteurId: string): Promise<LogboekRegel[]> {
  const supabase = db()
  const { data: regels } = await supabase
    .from('debiteur_logboek')
    .select('id, tekst, aangemaakt_op, user_id')
    .eq('debiteur_id', debiteurId)
    .order('aangemaakt_op', { ascending: true })
  const rows: { id: string; tekst: string; aangemaakt_op: string; user_id: string | null }[] = regels ?? []
  const userIds = [...new Set(rows.map(r => r.user_id).filter((u): u is string => !!u))]
  const naamMap = new Map<string, string | null>()
  if (userIds.length) {
    const { data: mws } = await supabase
      .from('medewerkers')
      .select('auth_user_id, voornaam, tussenvoegsel, achternaam')
      .in('auth_user_id', userIds)
    for (const m of mws ?? []) naamMap.set(m.auth_user_id as string, volledigeNaam(m))
  }
  return rows.map(r => ({
    id: r.id, tekst: r.tekst, aangemaakt_op: r.aangemaakt_op,
    auteur: r.user_id ? (naamMap.get(r.user_id) ?? null) : null,
  }))
}

/** Mag de huidige gebruiker redencodes beheren? (beheerder/financieel-beheren). */
async function magRedencodesBeheren(): Promise<boolean> {
  const rechten = await getEffectieveRechten()
  return isBeheerder(rechten) || heeftModuleToegang(rechten, 'financieel', 'beheren')
}

type RedencodeResult = { ok: true } | { ok: false; error: string }

function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'reden'
}

export async function maakRedencode(label: string): Promise<RedencodeResult> {
  if (!(await magRedencodesBeheren())) return { ok: false, error: 'Geen rechten.' }
  if (!label.trim()) return { ok: false, error: 'Label is verplicht.' }
  const supabase = db()
  const { data: maxRow } = await supabase.from('debiteur_redencodes').select('volgorde').order('volgorde', { ascending: false }).limit(1).maybeSingle()
  const volgorde = (maxRow?.volgorde ?? 0) + 1
  const { error } = await supabase.from('debiteur_redencodes').insert({ code: `${slugify(label)}_${volgorde}`, label: label.trim(), volgorde })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/debiteur-redencodes')
  revalidatePath('/facturen')
  return { ok: true }
}

export async function updateRedencode(id: string, data: { label?: string; actief?: boolean; volgorde?: number }): Promise<RedencodeResult> {
  if (!(await magRedencodesBeheren())) return { ok: false, error: 'Geen rechten.' }
  const supabase = db()
  const payload: Record<string, unknown> = {}
  if (data.label !== undefined) payload.label = data.label.trim()
  if (data.actief !== undefined) payload.actief = data.actief
  if (data.volgorde !== undefined) payload.volgorde = data.volgorde
  const { error } = await supabase.from('debiteur_redencodes').update(payload).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/debiteur-redencodes')
  revalidatePath('/facturen')
  return { ok: true }
}

/** Soft-delete: op inactief zetten (FK vanuit debiteuren → nooit hard verwijderen). */
export async function verwijderRedencode(id: string): Promise<RedencodeResult> {
  return updateRedencode(id, { actief: false })
}

export type EnrichmentInput = {
  reden_code_id?: string | null
  actie?: string | null
  actiehouder_id?: string | null
  verwachte_betaaldatum?: string | null
  opvolgdatum?: string | null
  opvolgstatus?: DebiteurOpvolgstatus
}

type ActionResult = { ok: true } | { ok: false; error: string }

/** Werk de opvolg-velden van één debiteur bij (alleen administratie/beheer). */
export async function updateDebiteurEnrichment(id: string, data: EnrichmentInput): Promise<ActionResult> {
  if (!(await magDebiteurenBewerken())) return { ok: false, error: 'Geen rechten om te bewerken.' }
  const supabase = db()
  // Alleen opvolg-kolommen — Bouw7-bronkolommen blijven ongemoeid.
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of ['reden_code_id', 'actie', 'actiehouder_id', 'verwachte_betaaldatum', 'opvolgdatum', 'opvolgstatus'] as const) {
    if (key in data) payload[key] = (data as Record<string, unknown>)[key]
  }
  const { error } = await supabase.from('debiteuren').update(payload).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/facturen')
  return { ok: true }
}

/** Voeg een logboekregel toe aan een debiteur (op naam van de ingelogde gebruiker). */
export async function addDebiteurLogboek(debiteurId: string, tekst: string): Promise<ActionResult> {
  if (!tekst.trim()) return { ok: false, error: 'Lege opmerking.' }
  let userId: string | null = null
  try {
    const session = await createServerClient()
    const { data: { user } } = await session.auth.getUser()
    userId = user?.id ?? null
  } catch { /* geen sessie */ }
  const supabase = db()
  const { error } = await supabase.from('debiteur_logboek').insert({ debiteur_id: debiteurId, user_id: userId, tekst: tekst.trim() })
  if (error) return { ok: false, error: error.message }
  revalidatePath('/facturen')
  return { ok: true }
}
