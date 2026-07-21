'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type {
  MedewerkerRooster,
  MedewerkerSkill,
  MedewerkerBedrijfsmiddel,
  MedewerkerAttribuutDefinitie,
  MedewerkerAttribuutWaarde,
  MedewerkerBestand,
  MedewerkerRoosterPauze,
  GebruikerType,
  RechtenSet,
  RechtenModule,
  ModuleRechten,
} from '@everts/database/platform-types'
import { RECHTEN_MODULES } from '@everts/database/platform-types'
import { pgQuery } from '@/lib/wagenpark/db'
import { vereisRecht, vereisBeheerder, GeenToegangError } from '@/lib/auth/rechten'
import { verwerkMedewerkerTriggers } from '@/app/(platform)/taken/actions/sjablonen'
import { herberekenMedewerkerDeadlines } from '@/app/(platform)/taken/actions/deadlines'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type ActionResult = { ok: true } | { ok: false; error: string }

/**
 * Autorisatie-guards voor de medewerker-administratie. Dit bestand muteert met
 * de service-role client (bypast RLS); zonder deze checks kan elke ingelogde
 * gebruiker via een kale RPC salaris/BSN lezen of zichzelf rechten toekennen.
 * Retourneert een fout-result i.p.v. te gooien, passend bij de ActionResult-stijl.
 */
async function eisMedewerkers(min: ModuleRechten): Promise<{ ok: false; error: string } | null> {
  try { await vereisRecht('medewerkers', min); return null }
  catch (e) { if (e instanceof GeenToegangError) return { ok: false, error: e.message }; throw e }
}
async function eisBeheer(): Promise<{ ok: false; error: string } | null> {
  try { await vereisBeheerder(); return null }
  catch (e) { if (e instanceof GeenToegangError) return { ok: false, error: e.message }; throw e }
}

// ── Roosters ──────────────────────────────────────────────────────────

const pauzeSchema = z.object({
  pauze_start: z.string().regex(/^\d{2}:\d{2}$/),
  pauze_eind:  z.string().regex(/^\d{2}:\d{2}$/),
})

const roosterSchema = z.object({
  geldig_vanaf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum verplicht (JJJJ-MM-DD)'),
  geldig_tot:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  werkdagen:    z.array(z.number().int().min(1).max(7)).min(1, 'Minimaal 1 werkdag'),
  dagstart:     z.string().regex(/^\d{2}:\d{2}$/, 'Tijd verplicht (HH:MM)'),
  dageind:      z.string().regex(/^\d{2}:\d{2}$/, 'Tijd verplicht (HH:MM)'),
  contracturen_per_week: z.coerce.number().min(0).max(80),
  pauzes: z.array(pauzeSchema).default([]),
})

export async function laadRoosters(
  medewerker_id: string
): Promise<{ ok: true; data: (MedewerkerRooster & { pauzes: MedewerkerRoosterPauze[] })[] } | { ok: false; error: string }> {
  const nope = await eisMedewerkers('lezen'); if (nope) return nope
  const { data, error } = await db()
    .from('medewerker_roosters')
    .select('*, medewerker_rooster_pauzes(*)')
    .eq('medewerker_id', medewerker_id)
    .order('geldig_vanaf', { ascending: false })

  if (error) return { ok: false, error: error.message }
  const normalized = (data ?? []).map((r: MedewerkerRooster & { medewerker_rooster_pauzes: MedewerkerRoosterPauze[] }) => ({
    ...r,
    pauzes: r.medewerker_rooster_pauzes ?? [],
  }))
  return { ok: true, data: normalized }
}

export async function upsertRooster(
  medewerker_id: string,
  raw: unknown,
  existing_id?: string
): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const parsed = roosterSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const { geldig_vanaf, geldig_tot, dagstart, dageind, pauzes, ...rest } = parsed.data
  if (dagstart >= dageind) return { ok: false, error: 'Eindtijd moet na starttijd liggen.' }

  for (const p of pauzes) {
    if (p.pauze_start >= p.pauze_eind) return { ok: false, error: 'Pauze-eindtijd moet na starttijd liggen.' }
    if (p.pauze_start < dagstart || p.pauze_eind > dageind) return { ok: false, error: 'Pauze moet binnen werktijden vallen.' }
  }

  // Check for overlapping roosters (excluding current)
  const { data: existing } = await db()
    .from('medewerker_roosters')
    .select('id, geldig_vanaf, geldig_tot')
    .eq('medewerker_id', medewerker_id)
    .neq('id', existing_id ?? '00000000-0000-0000-0000-000000000000')

  if (existing) {
    for (const r of existing as MedewerkerRooster[]) {
      const rEind = r.geldig_tot ?? '9999-12-31'
      const newEind = geldig_tot ?? '9999-12-31'
      if (geldig_vanaf <= rEind && newEind >= r.geldig_vanaf) {
        return { ok: false, error: 'Dit rooster overlapt met een bestaand rooster.' }
      }
    }
  }

  const payload = { ...rest, geldig_vanaf, geldig_tot, dagstart, dageind, medewerker_id }

  let rooster_id = existing_id
  if (existing_id) {
    const { error } = await db().from('medewerker_roosters').update(payload).eq('id', existing_id)
    if (error) return { ok: false, error: error.message }
  } else {
    const { data: inserted, error } = await db().from('medewerker_roosters').insert(payload).select('id').single()
    if (error) return { ok: false, error: error.message }
    rooster_id = inserted.id
  }

  // Sync pauzes: delete existing, re-insert
  await db().from('medewerker_rooster_pauzes').delete().eq('rooster_id', rooster_id)
  if (pauzes.length > 0) {
    const { error: pErr } = await db().from('medewerker_rooster_pauzes').insert(
      pauzes.map(p => ({ rooster_id, ...p }))
    )
    if (pErr) return { ok: false, error: pErr.message }
  }

  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

export async function verwijderRooster(id: string, medewerker_id: string): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const { error } = await db().from('medewerker_roosters').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// ── Skills ────────────────────────────────────────────────────────────

export async function laadSkills(
  medewerker_id: string
): Promise<{ ok: true; data: MedewerkerSkill[] } | { ok: false; error: string }> {
  const nope = await eisMedewerkers('lezen'); if (nope) return nope
  const { data, error } = await db()
    .from('medewerker_skills')
    .select('*')
    .eq('medewerker_id', medewerker_id)
    .order('skill_naam', { ascending: true })

  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as MedewerkerSkill[] }
}

export async function upsertSkills(
  medewerker_id: string,
  skills: string[]
): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const cleaned = [...new Set(skills.map(s => s.trim()).filter(Boolean))]

  const { error: delErr } = await db()
    .from('medewerker_skills')
    .delete()
    .eq('medewerker_id', medewerker_id)

  if (delErr) return { ok: false, error: delErr.message }

  if (cleaned.length > 0) {
    const { error: insErr } = await db()
      .from('medewerker_skills')
      .insert(cleaned.map(skill_naam => ({ medewerker_id, skill_naam })))

    if (insErr) return { ok: false, error: insErr.message }
  }

  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// ── Medewerker gegevens ───────────────────────────────────────────────

const gegevensSchema = z.object({
  voornaam:           z.string().min(1),
  tussenvoegsel:      z.string().nullable(),
  achternaam:         z.string().min(1),
  email:              z.string().email().nullable().or(z.literal('')).transform(v => v || null),
  telefoon:           z.string().nullable(),
  mobiel:             z.string().nullable(),
  functie:            z.string().nullable(),
  afdeling:           z.string().nullable(),
  in_dienst_vanaf:    z.string().nullable(),
  uit_dienst_per:     z.string().nullable(),
  extern:             z.boolean(),
  actief:             z.boolean(),
  uurtarief_verkoop:  z.coerce.number().nullable(),
  uurtarief_kostprijs: z.coerce.number().nullable(),
  cao_schaal:         z.string().nullable(),
  cao_document_id:    z.string().uuid().nullable().or(z.literal('')).transform(v => v || null),
  cao_trede:          z.string().nullable(),
  adres_straat:       z.string().nullable(),
  adres_postcode:     z.string().nullable(),
  adres_plaats:       z.string().nullable(),
  geboortedatum:      z.string().nullable(),
  bsn:                z.string().nullable(),
  werkmaatschappij_id: z.string().uuid().nullable().or(z.literal('')).transform(v => v || null),
  relatie_id:         z.string().uuid().nullable().or(z.literal('')).transform(v => v || null),
  kleur:              z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().or(z.literal('')).transform(v => v || null),
  ploeg_id:           z.string().uuid().nullable().or(z.literal('')).transform(v => v || null),
  standaard_uursoort_id: z.string().uuid().nullable().or(z.literal('')).transform(v => v || null),
})

export async function updateMedewerkerGegevens(
  id: string,
  raw: unknown
): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const parsed = gegevensSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const supabase = db()
  const { error } = await supabase.from('medewerkers').update(parsed.data).eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Als een functie is ingesteld, controleer of er al een actief rooster bestaat.
  // Zo niet, maak er automatisch een aan vanuit het standaard rooster van de functie.
  if (parsed.data.functie) {
    const { data: bestaandRooster } = await supabase
      .from('medewerker_roosters')
      .select('id')
      .eq('medewerker_id', id)
      .or('geldig_tot.is.null,geldig_tot.gte.' + new Date().toISOString().split('T')[0])
      .maybeSingle()

    if (!bestaandRooster) {
      const { data: functieDef } = await supabase
        .from('medewerker_functies')
        .select('standaard_rooster')
        .eq('naam', parsed.data.functie)
        .eq('actief', true)
        .maybeSingle()

      const r = functieDef?.standaard_rooster
      if (r?.werkdagen?.length && r.dagstart && r.dageind) {
        const vandaag = new Date().toISOString().split('T')[0]
        const { data: newRooster } = await supabase
          .from('medewerker_roosters')
          .insert({
            medewerker_id:         id,
            geldig_vanaf:          vandaag,
            geldig_tot:            null,
            werkdagen:             r.werkdagen,
            dagstart:              r.dagstart,
            dageind:               r.dageind,
            contracturen_per_week: r.contracturen_per_week ?? 0,
          })
          .select('id')
          .single()

        if (newRooster && r.pauzes?.length > 0) {
          await supabase.from('medewerker_rooster_pauzes').insert(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            r.pauzes.map((p: any) => ({
              rooster_id:  newRooster.id,
              pauze_start: p.pauze_start,
              pauze_eind:  p.pauze_eind,
            }))
          )
        }
      }
    }
  }

  // De DB-triggers hebben de wijziging al geregistreerd; hier draaien we de
  // evaluator meteen zodat een actielijst direct zichtbaar is na het opslaan.
  // Fail-soft: een mislukte drain mag het opslaan van de medewerker niet blokkeren.
  await verwerkMedewerkerTriggers(id).catch(() => {})
  await herberekenMedewerkerDeadlines(id).catch(() => {})

  revalidatePath(`/medewerkers/${id}`)
  return { ok: true }
}

// ── Bedrijfsmiddelen ──────────────────────────────────────────────────

const bedrijfsmiddelSchema = z.object({
  type:          z.enum(['sleutel', 'telefoon', 'tankpas', 'overig']),
  omschrijving:  z.string().nullable(),
  kenmerken:     z.record(z.unknown()).default({}),
  uitgegeven_op: z.string().nullable(),
  retour_op:     z.string().nullable(),
  actief:        z.boolean().default(true),
})

export async function laadBedrijfsmiddelen(
  medewerker_id: string
): Promise<{ ok: true; data: MedewerkerBedrijfsmiddel[] } | { ok: false; error: string }> {
  const nope = await eisMedewerkers('lezen'); if (nope) return nope
  const { data, error } = await db()
    .from('medewerker_bedrijfsmiddelen')
    .select('*')
    .eq('medewerker_id', medewerker_id)
    .order('type')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as MedewerkerBedrijfsmiddel[] }
}

export async function upsertBedrijfsmiddel(
  medewerker_id: string,
  raw: unknown,
  existing_id?: string
): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const parsed = bedrijfsmiddelSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const payload = { ...parsed.data, medewerker_id }
  const { error } = existing_id
    ? await db().from('medewerker_bedrijfsmiddelen').update(parsed.data).eq('id', existing_id)
    : await db().from('medewerker_bedrijfsmiddelen').insert(payload)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

export async function verwijderBedrijfsmiddel(id: string, medewerker_id: string): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const { error } = await db().from('medewerker_bedrijfsmiddelen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// ── Custom attributen ─────────────────────────────────────────────────

export async function laadAttribuutDefinities(): Promise<{ ok: true; data: MedewerkerAttribuutDefinitie[] } | { ok: false; error: string }> {
  const nope = await eisMedewerkers('lezen'); if (nope) return nope
  const { data, error } = await db()
    .from('medewerker_attribuut_definities')
    .select('*')
    .eq('actief', true)
    .order('volgorde')
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as MedewerkerAttribuutDefinitie[] }
}

export async function laadAttribuutWaarden(
  medewerker_id: string
): Promise<{ ok: true; data: MedewerkerAttribuutWaarde[] } | { ok: false; error: string }> {
  const nope = await eisMedewerkers('lezen'); if (nope) return nope
  const { data, error } = await db()
    .from('medewerker_attribuut_waarden')
    .select('*')
    .eq('medewerker_id', medewerker_id)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as MedewerkerAttribuutWaarde[] }
}

export async function upsertAttribuutWaarden(
  medewerker_id: string,
  waarden: { definitie_id: string; waarde: string | null }[]
): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  for (const w of waarden) {
    const { error } = await db()
      .from('medewerker_attribuut_waarden')
      .upsert({ medewerker_id, definitie_id: w.definitie_id, waarde: w.waarde }, { onConflict: 'medewerker_id,definitie_id' })
    if (error) return { ok: false, error: error.message }
  }
  await verwerkMedewerkerTriggers(medewerker_id).catch(() => {})
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// Admin: definities beheren
const definitieSchema = z.object({
  naam:      z.string().min(1),
  veldtype:  z.enum(['tekst', 'datum', 'getal', 'boolean']),
  verplicht: z.boolean().default(false),
  volgorde:  z.coerce.number().default(0),
  actief:    z.boolean().default(true),
})

export async function upsertAttribuutDefinitie(raw: unknown, existing_id?: string): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const parsed = definitieSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error.errors[0]?.message ?? 'Ongeldig' }

  const { error } = existing_id
    ? await db().from('medewerker_attribuut_definities').update(parsed.data).eq('id', existing_id)
    : await db().from('medewerker_attribuut_definities').insert(parsed.data)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerker-attributen')
  return { ok: true }
}

export async function verwijderAttribuutDefinitie(id: string): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const { error } = await db()
    .from('medewerker_attribuut_definities')
    .update({ actief: false })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/medewerker-attributen')
  return { ok: true }
}

// ── Bestanden ─────────────────────────────────────────────────────────

export async function laadBestanden(
  medewerker_id: string
): Promise<{ ok: true; data: MedewerkerBestand[] } | { ok: false; error: string }> {
  const nope = await eisMedewerkers('lezen'); if (nope) return nope
  const { data, error } = await db()
    .from('medewerker_bestanden')
    .select('*')
    .eq('medewerker_id', medewerker_id)
    .order('created_at', { ascending: false })
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as MedewerkerBestand[] }
}

export async function registreerBestand(
  medewerker_id: string,
  bestand: { naam: string; url: string; categorie: string; bestandstype?: string; grootte?: number }
): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const { error } = await db().from('medewerker_bestanden').insert({
    medewerker_id,
    naam:         bestand.naam,
    url:          bestand.url,
    categorie:    bestand.categorie,
    bestandstype: bestand.bestandstype ?? null,
    grootte:      bestand.grootte ?? null,
  })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

export async function verwijderBestand(id: string, medewerker_id: string): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const { error } = await db().from('medewerker_bestanden').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// ── Handtekening ──────────────────────────────────────────────────────

export async function updateHandtekening(medewerker_id: string, url: string | null): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  const { error } = await db().from('medewerkers').update({ handtekening_url: url }).eq('id', medewerker_id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// ── Gebruikerstoegang ─────────────────────────────────────────────────

const gebruikerTypeSchema = z.enum(['geen', 'app_gebruiker', 'platform_gebruiker'])

export async function updateGebruikerType(
  medewerker_id: string,
  type: GebruikerType
): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const parsed = gebruikerTypeSchema.safeParse(type)
  if (!parsed.success) return { ok: false, error: 'Ongeldig gebruiker type' }

  const { error } = await db().from('medewerkers').update({ gebruiker_type: parsed.data }).eq('id', medewerker_id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

export async function verstuurUitnodiging(
  medewerker_id: string
): Promise<{ ok: true; auth_user_id: string | null } | { ok: false; error: string }> {
  const nope = await eisBeheer(); if (nope) return nope
  const { data: med, error: fetchErr } = await db()
    .from('medewerkers')
    .select('email, voornaam, achternaam')
    .eq('id', medewerker_id)
    .maybeSingle()

  if (fetchErr || !med) return { ok: false, error: 'Medewerker niet gevonden' }
  if (!med.email) return { ok: false, error: 'Medewerker heeft geen e-mailadres' }

  const supabase = createAdminClient()

  // Bepaal redirect-URL voor de uitnodigingslink in de e-mail
  const { headers } = await import('next/headers')
  const headersList = await headers()
  const host = headersList.get('host') ?? 'localhost:3000'
  const protocol = host.startsWith('localhost') ? 'http' : 'https'
  const redirectTo = `${protocol}://${host}/auth/callback`

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inviteData, error: inviteErr } = await (supabase as any).auth.admin.inviteUserByEmail(med.email, {
    data: { full_name: [med.voornaam, med.achternaam].filter(Boolean).join(' ') },
    redirectTo,
  })

  if (inviteErr) return { ok: false, error: inviteErr.message }

  const auth_user_id = inviteData?.user?.id ?? null
  if (auth_user_id) {
    await db().from('medewerkers').update({ auth_user_id }).eq('id', medewerker_id)
  }

  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true, auth_user_id }
}

const MODULE_KEYS = RECHTEN_MODULES.map(m => m.key) as [RechtenModule, ...RechtenModule[]]

const rechtenSetSchema = z.record(
  z.enum(MODULE_KEYS),
  z.enum(['lezen', 'schrijven', 'beheren']).nullable()
)

export async function updateRechtenOverride(
  medewerker_id: string,
  rechten: RechtenSet
): Promise<ActionResult> {
  const nope = await eisBeheer(); if (nope) return nope
  const parsed = rechtenSetSchema.safeParse(rechten)
  if (!parsed.success) return { ok: false, error: 'Ongeldige rechten' }

  const { error } = await db().from('medewerkers').update({ rechten_override: parsed.data }).eq('id', medewerker_id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}

// ── Wagenpark-bestuurder (ulu_users) ──────────────────────────────────
// ulu_users wordt via de directe Postgres-pooler benaderd (DATABASE_URL),
// net als de rest van de wagenpark-module — niet via de Supabase JS client.

export async function koppelBestuurder(medewerker_id: string, ulu_user_id: string): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  try {
    // Eén bestuurder per medewerker: maak een eventuele bestaande koppeling eerst los.
    await pgQuery('UPDATE public.ulu_users SET medewerker_id = NULL, updated_at = now() WHERE medewerker_id = $1', [medewerker_id])
    await pgQuery('UPDATE public.ulu_users SET medewerker_id = $2, updated_at = now() WHERE id = $1', [ulu_user_id, medewerker_id])
    revalidatePath(`/medewerkers/${medewerker_id}`)
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

export async function ontkoppelBestuurder(medewerker_id: string, ulu_user_id: string): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  try {
    await pgQuery('UPDATE public.ulu_users SET medewerker_id = NULL, updated_at = now() WHERE id = $1', [ulu_user_id])
    revalidatePath(`/medewerkers/${medewerker_id}`)
    return { ok: true }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}

export async function ontkoppelOffice365(medewerker_id: string): Promise<ActionResult> {
  const nope = await eisMedewerkers('schrijven'); if (nope) return nope
  await db().from('medewerker_o365_tokens').delete().eq('medewerker_id', medewerker_id)

  const { error } = await db()
    .from('medewerkers')
    .update({ o365_user_id: null, o365_email: null, o365_tenant_id: null })
    .eq('id', medewerker_id)

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/medewerkers/${medewerker_id}`)
  return { ok: true }
}
