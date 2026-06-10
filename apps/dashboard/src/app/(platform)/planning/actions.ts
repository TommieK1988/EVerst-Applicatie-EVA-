'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type {
  PlanningActiviteitStatus,
  PlanningActiviteit, PlanningItem, PlanningItemVerrijkt,
  PlanningWerkbegrotingRegelMetUursoort,
  PlanningFase, PlanningAfhankelijkheid, AfhankelijkheidsType,
} from '@everts/database/platform-types'

const db = () => createAdminClient() as any

// ─── Budget helpers ───────────────────────────────────────────────────────────

async function checkBudget(
  dossier_id: string,
  uursoort_id: string | null,
  extra_uren: number,
  exclude_item_id?: string,
): Promise<{ ok: true } | { ok: false; error: string; overschrijding: true; beschikbare_uren: number }> {
  if (!uursoort_id) return { ok: true }

  const supabase = db()

  const [budgetRes, geplandeRes] = await Promise.all([
    supabase
      .from('planning_werkbegroting_regels')
      .select('begrote_uren')
      .eq('dossier_id', dossier_id)
      .eq('uursoort_id', uursoort_id)
      .maybeSingle(),

    supabase
      .from('planning_items')
      .select('uren, activiteit_id, planning_activiteiten!activiteit_id(uursoort_id)')
      .then(async ({ data }: { data: any[] }) => {
        if (!data) return { data: [], error: null }
        const relevante = data.filter((e: any) => {
          if (exclude_item_id && e.id === exclude_item_id) return false
          return e.planning_activiteiten?.uursoort_id === uursoort_id
        })
        return { data: relevante, error: null }
      }),
  ])

  if (!budgetRes.data) return { ok: true } // geen begroting = geen check

  const begroteUren: number = budgetRes.data.begrote_uren
  const gepland = (geplandeRes.data ?? []).reduce((sum: number, e: any) => sum + (e.uren ?? 0), 0)
  const beschikbaar = begroteUren - gepland

  if (gepland + extra_uren > begroteUren) {
    return {
      ok: false,
      error: `Budget overschreden: nog ${beschikbaar.toFixed(1)}u beschikbaar, ${extra_uren}u gevraagd`,
      overschrijding: true,
      beschikbare_uren: Math.max(0, beschikbaar),
    }
  }
  return { ok: true }
}

// ─── Planning Activiteiten ────────────────────────────────────────────────────

const activiteitSchema = z.object({
  dossier_id:        z.string().uuid(),
  uursoort_id:       z.string().uuid().nullable().optional(),
  onderaannemer_id:  z.string().uuid().nullable().optional(),
  fase_id:           z.string().uuid().nullable().optional(),
  titel:             z.string().min(1).max(200),
  omschrijving:      z.string().nullable().optional(),
  geschatte_uren:    z.number().min(0).optional(),
  benodigde_skills:  z.array(z.string()).optional(),
  gewenste_start:    z.string().nullable().optional(),
  deadline:          z.string().nullable().optional(),
  locatie_adres:     z.string().nullable().optional(),
  status:            z.enum(['backlog','gepland','in_uitvoering','opgeleverd','on_hold']).optional(),
  volgorde:          z.number().int().optional(),
})

export async function maakPlanningActiviteit(
  input: z.infer<typeof activiteitSchema>,
): Promise<{ ok: true; data: PlanningActiviteit } | { ok: false; error: string }> {
  const parsed = activiteitSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  const { data, error } = await db()
    .from('planning_activiteiten')
    .insert({ ...parsed.data, status: parsed.data.status ?? 'backlog' })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath(`/aanvragen/${input.dossier_id}/planning`)
  revalidatePath(`/opdrachten/${input.dossier_id}/planning`)
  return { ok: true, data: data as PlanningActiviteit }
}

export async function updatePlanningActiviteit(
  id: string,
  input: Partial<z.infer<typeof activiteitSchema>>,
): Promise<{ ok: true; cascade?: { items_verschoven: number } } | { ok: false; error: string }> {
  const supabase = db()

  // Lees huidige waarden om cascade-type te bepalen
  const { data: huidig } = await supabase
    .from('planning_activiteiten')
    .select('gewenste_start, deadline')
    .eq('id', id)
    .single()

  const huidigeStart    = huidig?.gewenste_start ?? null
  const huidigeDeadline = huidig?.deadline ?? null

  const { error } = await supabase
    .from('planning_activiteiten')
    .update(input)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  const { data: planItems } = await supabase
    .from('planning_items')
    .select('id, start_dt, eind_dt')
    .eq('activiteit_id', id)

  const items = planItems ?? []
  let itemsVerschoven = 0

  const nieuweStart    = input.gewenste_start
  const nieuweDeadline = input.deadline

  const startGewijzigd    = nieuweStart    !== undefined && nieuweStart    !== huidigeStart
  const deadlineGewijzigd = nieuweDeadline !== undefined && nieuweDeadline !== huidigeDeadline

  if (startGewijzigd && deadlineGewijzigd && huidigeStart && huidigeDeadline) {
    // Move: beide datums gewijzigd — schuif items met dezelfde delta
    const deltaMs = new Date(nieuweStart!).getTime() - new Date(huidigeStart).getTime()
    if (deltaMs !== 0) {
      for (const item of items) {
        const ns = new Date(new Date(item.start_dt).getTime() + deltaMs).toISOString()
        const ne = new Date(new Date(item.eind_dt).getTime()  + deltaMs).toISOString()
        await supabase.from('planning_items').update({ start_dt: ns, eind_dt: ne }).eq('id', item.id)
        itemsVerschoven++
      }
    }
  } else if (startGewijzigd && !deadlineGewijzigd && huidigeStart) {
    // Left-resize: alleen start gewijzigd — crop items die vóór nieuwe start beginnen
    const newStartMs = new Date(nieuweStart!).getTime()
    if (new Date(nieuweStart!).getTime() > new Date(huidigeStart).getTime()) {
      // Inkorten: start later → crop of verwijder items
      for (const item of items) {
        const itemStartMs = new Date(item.start_dt).getTime()
        const itemEindMs  = new Date(item.eind_dt).getTime()
        if (itemEindMs <= newStartMs) {
          await supabase.from('planning_items').delete().eq('id', item.id)
        } else if (itemStartMs < newStartMs) {
          await supabase.from('planning_items').update({ start_dt: new Date(newStartMs).toISOString() }).eq('id', item.id)
          itemsVerschoven++
        }
      }
    }
  } else if (deadlineGewijzigd && !startGewijzigd && huidigeDeadline) {
    // Right-resize: alleen deadline gewijzigd — crop items die na nieuwe deadline eindigen
    if (nieuweDeadline && nieuweDeadline < huidigeDeadline) {
      // Inkorten: deadline eerder → crop of verwijder items
      const newDeadlineEodMs = new Date(nieuweDeadline + 'T23:59:59').getTime()
      for (const item of items) {
        const itemStartMs = new Date(item.start_dt).getTime()
        const itemEindMs  = new Date(item.eind_dt).getTime()
        if (itemStartMs > newDeadlineEodMs) {
          await supabase.from('planning_items').delete().eq('id', item.id)
        } else if (itemEindMs > newDeadlineEodMs) {
          await supabase.from('planning_items').update({ eind_dt: new Date(newDeadlineEodMs).toISOString() }).eq('id', item.id)
          itemsVerschoven++
        }
      }
    }
  }

  revalidatePath('/planning')
  return { ok: true, cascade: itemsVerschoven > 0 ? { items_verschoven: itemsVerschoven } : undefined }
}

export async function verwijderPlanningActiviteit(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('planning_activiteiten')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true }
}

// ─── Planning Items ───────────────────────────────────────────────────────────

const itemSchema = z.object({
  activiteit_id:  z.string().uuid(),
  medewerker_id:  z.string().uuid(),
  start_dt:       z.string(), // ISO timestamp
  eind_dt:        z.string(), // ISO timestamp
  uren:           z.number().min(0),
  overrule:       z.boolean().optional(),
  overrule_reden: z.string().optional(),
})

export async function maakPlanningItem(
  input: z.infer<typeof itemSchema> & { dossier_id: string; uursoort_id?: string | null },
): Promise<
  | { ok: true; data: PlanningItem }
  | { ok: false; error: string; overschrijding?: true; beschikbare_uren?: number }
> {
  const parsed = itemSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }

  if (!input.overrule) {
    const budget = await checkBudget(input.dossier_id, input.uursoort_id ?? null, input.uren)
    if (!budget.ok) return budget
  }

  const { data, error } = await db()
    .from('planning_items')
    .insert({
      activiteit_id:  parsed.data.activiteit_id,
      medewerker_id:  parsed.data.medewerker_id,
      start_dt:       parsed.data.start_dt,
      eind_dt:        parsed.data.eind_dt,
      uren:           parsed.data.uren,
      overrule:       parsed.data.overrule ?? false,
      overrule_reden: parsed.data.overrule_reden ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/planning')
  return { ok: true, data: data as PlanningItem }
}

export async function verplaatsPlanningItem(
  id: string,
  input: {
    start_dt:       string
    eind_dt:        string
    medewerker_id?: string
    dossier_id:     string
    uursoort_id?:   string | null
    uren:           number
    overrule?:      boolean
    overrule_reden?: string
  },
): Promise<
  | { ok: true }
  | { ok: false; error: string; overschrijding?: true; beschikbare_uren?: number }
> {
  if (!input.overrule) {
    const budget = await checkBudget(input.dossier_id, input.uursoort_id ?? null, input.uren, id)
    if (!budget.ok) return budget
  }

  const update: Record<string, unknown> = {
    start_dt: input.start_dt,
    eind_dt:  input.eind_dt,
    uren:     input.uren,
  }
  if (input.medewerker_id) update.medewerker_id = input.medewerker_id
  if (input.overrule)       update.overrule       = true
  if (input.overrule_reden) update.overrule_reden = input.overrule_reden

  const { error } = await db()
    .from('planning_items')
    .update(update)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/planning')
  return { ok: true }
}

export async function verwijderPlanningItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('planning_items')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true }
}

// ─── Werkbegroting ────────────────────────────────────────────────────────────

export async function upsertWerkbegrotingRegel(
  dossier_id: string,
  uursoort_id: string,
  begrote_uren: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db()
    .from('planning_werkbegroting_regels')
    .upsert(
      { dossier_id, uursoort_id, begrote_uren },
      { onConflict: 'dossier_id,uursoort_id' },
    )

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true }
}

export async function syncWerkbegrotingVanEvertsCalc(
  dossier_id: string,
): Promise<{ ok: true; gematch: number; ongematch: string[] } | { ok: false; error: string }> {
  const supabase = db()

  const { data: dossier, error: dossierErr } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossier_id)
    .single()

  if (dossierErr) return { ok: false, error: dossierErr.message }
  if (!dossier?.everts_calc_project_id) return { ok: false, error: 'Geen everts-calc project gekoppeld aan dit dossier.' }

  const { data: componenten, error: compErr } = await supabase
    .from('werkbegroting_componenten')
    .select(`omschrijving, norm_hoeveelheid, type, werkbegroting_regels ( hoeveelheid )`)
    .eq('project_id', dossier.everts_calc_project_id)
    .eq('type', 'arbeid')

  if (compErr) return { ok: false, error: compErr.message }

  const urenPerOmschrijving: Record<string, number> = {}
  for (const comp of (componenten ?? [])) {
    const uren = (comp.werkbegroting_regels ?? []).reduce(
      (sum: number, r: any) => sum + (r.hoeveelheid * comp.norm_hoeveelheid),
      0,
    )
    urenPerOmschrijving[comp.omschrijving] = (urenPerOmschrijving[comp.omschrijving] ?? 0) + uren
  }

  const { data: uursoorten, error: uursoortErr } = await supabase
    .from('planning_uursoorten')
    .select('id, everts_calc_omschrijvingen')
    .eq('actief', true)

  if (uursoortErr) return { ok: false, error: uursoortErr.message }

  const urenPerUursoort: Record<string, number> = {}
  const ongematch: string[] = []

  for (const [omschrijving, uren] of Object.entries(urenPerOmschrijving)) {
    const match = (uursoorten ?? []).find(
      (u: any) => (u.everts_calc_omschrijvingen ?? []).includes(omschrijving),
    )
    if (match) {
      urenPerUursoort[match.id] = (urenPerUursoort[match.id] ?? 0) + uren
    } else {
      ongematch.push(omschrijving)
    }
  }

  for (const [uursoort_id, begrote_uren] of Object.entries(urenPerUursoort)) {
    const { error } = await supabase
      .from('planning_werkbegroting_regels')
      .upsert(
        { dossier_id, uursoort_id, begrote_uren },
        { onConflict: 'dossier_id,uursoort_id' },
      )
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(`/aanvragen/${dossier_id}/planning`)
  revalidatePath(`/opdrachten/${dossier_id}/planning`)

  return { ok: true, gematch: Object.keys(urenPerUursoort).length, ongematch }
}

// ─── Fasen ────────────────────────────────────────────────────────────────────

export async function maakPlanningFase(
  dossier_id: string,
  naam: string,
  volgorde?: number,
): Promise<{ ok: true; data: PlanningFase } | { ok: false; error: string }> {
  const supabase = db()

  let vol = volgorde
  if (vol === undefined) {
    const { data: bestaande } = await supabase
      .from('planning_fasen')
      .select('volgorde')
      .eq('dossier_id', dossier_id)
      .order('volgorde', { ascending: false })
      .limit(1)
      .maybeSingle()
    vol = (bestaande?.volgorde ?? 0) + 1
  }

  const { data, error } = await supabase
    .from('planning_fasen')
    .insert({ dossier_id, naam: naam.trim(), volgorde: vol })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true, data: data as PlanningFase }
}

export async function updatePlanningFase(
  id: string,
  input: { naam?: string; volgorde?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().from('planning_fasen').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true }
}

export async function verschuifPlanningFase(
  fase_id: string,
  delta_dagen: number,
): Promise<{ ok: true; activiteiten_verschoven: number; items_verschoven: number } | { ok: false; error: string }> {
  if (delta_dagen === 0) return { ok: true, activiteiten_verschoven: 0, items_verschoven: 0 }
  const supabase = db()

  const { data: activiteiten, error: aErr } = await supabase
    .from('planning_activiteiten')
    .select('id, gewenste_start, deadline')
    .eq('fase_id', fase_id)

  if (aErr) return { ok: false, error: aErr.message }

  const deltaMs = delta_dagen * 24 * 60 * 60 * 1000
  let aShift = 0, iShift = 0

  for (const a of activiteiten ?? []) {
    const patch: { gewenste_start?: string; deadline?: string } = {}
    if (a.gewenste_start) {
      patch.gewenste_start = new Date(new Date(a.gewenste_start).getTime() + deltaMs).toISOString().slice(0, 10)
    }
    if (a.deadline) {
      patch.deadline = new Date(new Date(a.deadline).getTime() + deltaMs).toISOString().slice(0, 10)
    }
    if (Object.keys(patch).length === 0) continue
    const { error: uErr } = await supabase.from('planning_activiteiten').update(patch).eq('id', a.id)
    if (uErr) return { ok: false, error: uErr.message }
    aShift++

    const { data: items } = await supabase
      .from('planning_items')
      .select('id, start_dt, eind_dt')
      .eq('activiteit_id', a.id)

    for (const item of items ?? []) {
      const ns = new Date(new Date(item.start_dt).getTime() + deltaMs).toISOString()
      const ne = new Date(new Date(item.eind_dt).getTime()  + deltaMs).toISOString()
      await supabase.from('planning_items').update({ start_dt: ns, eind_dt: ne }).eq('id', item.id)
      iShift++
    }
  }

  revalidatePath('/planning')
  return { ok: true, activiteiten_verschoven: aShift, items_verschoven: iShift }
}

export async function verwijderPlanningFase(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().from('planning_fasen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true }
}

// ─── Afhankelijkheden ─────────────────────────────────────────────────────────

export async function maakAfhankelijkheid(
  van_activiteit_id: string,
  naar_activiteit_id: string,
  type: AfhankelijkheidsType = 'FS',
  vertraging_dagen = 0,
): Promise<{ ok: true; data: PlanningAfhankelijkheid } | { ok: false; error: string }> {
  if (van_activiteit_id === naar_activiteit_id)
    return { ok: false, error: 'Een activiteit kan niet van zichzelf afhangen.' }

  const { data, error } = await db()
    .from('planning_activiteit_afhankelijkheden')
    .insert({ van_activiteit_id, naar_activiteit_id, type, vertraging_dagen })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true, data: data as PlanningAfhankelijkheid }
}

export async function verwijderAfhankelijkheid(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().from('planning_activiteit_afhankelijkheden').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/planning')
  return { ok: true }
}
