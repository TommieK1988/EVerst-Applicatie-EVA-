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
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { herberekenDeadlines } from '../taken/actions/deadlines'

const db = () => createAdminClient() as any

/**
 * Rond een planningswijziging af. De DB-trigger tg_planning_items_deadline_queue heeft het
 * dossier al op de wachtrij gezet; die trekken we hier meteen leeg, zodat taken waarvan de
 * deadline aan de detailplanning hangt direct kloppen in plaats van pas na de nachtsync.
 * Mislukt dat, dan blijft de planningswijziging staan: de rij blijft 'pending' en een
 * volgende wijziging of de sync pakt hem alsnog op.
 */
async function naPlanningWijziging(): Promise<void> {
  try {
    await herberekenDeadlines()
  } catch (e) {
    console.error('[planning] herberekenen taak-deadlines mislukt:', e)
  }
  revalidatePath('/planning')
}

/**
 * Spiegel een EVA-planitem naar Bouw7 (`POST /plan-item`, zie WRITE-ENDPOINTS.md §5b).
 * Dynamisch geïmporteerd zoals de andere Bouw7-aanroepen hier, zodat de planning-acties
 * de Bouw7-module niet in elke bundel meeslepen.
 *
 * Bewust fail-soft en niet-blokkerend voor de aanroeper: de write logt zelf en gooit niet.
 * De planning staat op dat moment al in EVA — dat is de leidende administratie — en een
 * hapering bij Bouw7 mag een planner niet tegenhouden.
 */
async function spiegelNaarBouw7(itemId: string): Promise<void> {
  try {
    const { schrijfPlanItemNaarBouw7 } = await import('@/lib/bouw7/plan-item-write')
    await schrijfPlanItemNaarBouw7(itemId)
  } catch (e) {
    console.error('[planning] spiegelen naar Bouw7 mislukt:', e)
  }
}

// ─── Budget helpers ───────────────────────────────────────────────────────────

async function checkBudget(
  dossier_id: string,
  uursoort_id: string | null,
  extra_uren: number,
  exclude_item_id?: string,
): Promise<{ ok: true } | { ok: false; error: string; overschrijding: true; beschikbare_uren: number }> {
  if (!uursoort_id) return { ok: true }

  const supabase = db()

  // De geplande uren worden server-side afgebakend op dít dossier én deze uursoort.
  //
  // Hiervoor haalde deze query ALLE planitems op en filterde daarna in JavaScript. Dat ging op twee
  // manieren mis. Ten eerste kapte PostgREST de respons stil af op 1000 rijen, waardoor de telling
  // te laag uitviel en de waarschuwing uitbleef. Ten tweede — en dat is de zwaardere fout — werd er
  // alleen op uursoort gefilterd en niet op dossier: een begroting van één dossier werd vergeleken
  // met de geplande uren van álle dossiers samen, dus juist te hóóg. Beide fouten verdwijnen door
  // het filter naar de database te verplaatsen; per dossier blijft het resultaat ruim onder 1000.
  const [budgetRes, geplandeRes] = await Promise.all([
    supabase
      .from('planning_werkbegroting_regels')
      .select('begrote_uren')
      .eq('dossier_id', dossier_id)
      .eq('uursoort_id', uursoort_id)
      .maybeSingle(),

    // `id` staat bewust in de select: zonder dat veld was `e.id` altijd undefined en werkte
    // exclude_item_id niet, waardoor een verplaatst item bij de controle dubbel meetelde.
    supabase
      .from('planning_items')
      .select('id, uren, planning_activiteiten!inner(uursoort_id, dossier_id)')
      .eq('planning_activiteiten.dossier_id', dossier_id)
      .eq('planning_activiteiten.uursoort_id', uursoort_id),
  ])

  if (!budgetRes.data) return { ok: true } // geen begroting = geen check

  const begroteUren: number = budgetRes.data.begrote_uren
  const gepland = ((geplandeRes.data ?? []) as { id: string; uren: number | null }[])
    .filter(e => !exclude_item_id || e.id !== exclude_item_id)
    .reduce((sum, e) => sum + (e.uren ?? 0), 0)
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
  await assertDossierBewerkbaar(input.dossier_id)

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

  await naPlanningWijziging()
  return { ok: true, cascade: itemsVerschoven > 0 ? { items_verschoven: itemsVerschoven } : undefined }
}

/**
 * De Bouw7 plan-item-ids achter de planitems van een activiteit, ontdubbeld.
 *
 * Twee vormen, afhankelijk van waar het planitem vandaan komt:
 *   - bron 'eva'   → `bouw7_id` is het kale plan-item-id dat EVA zelf terugkreeg.
 *   - bron 'bouw7' → `bouw7_id` is `"<planItemId>:<employeeId>"` (zie sync-planning): één
 *     Bouw7 plan-item levert per toegewezen medewerker een EVA-planitem op.
 *
 * Ontdubbelen is dus geen optimalisatie maar noodzaak: drie collega's op hetzelfde Bouw7
 * plan-item geven drie EVA-rijen, en één DELETE haalt ze in Bouw7 alle drie tegelijk weg.
 *
 * `planning_activiteiten.bouw7_id` is hier onbruikbaar: dat is een synthetische
 * groepssleutel (`group:<fase>:<titel>`), geen Bouw7-id.
 */
function bouw7PlanItemIds(items: { bron?: string | null; bouw7_id?: string | null }[]): string[] {
  const ids = new Set<string>()
  for (const it of items) {
    if (!it.bouw7_id) continue
    const kaal = it.bron === 'eva' ? it.bouw7_id : it.bouw7_id.split(':')[0]
    if (kaal) ids.add(kaal)
  }
  return [...ids]
}

/** Planitems (met hun Bouw7-ids) van een set activiteiten. Begrensd door de `in`-filter. */
async function haalPlanItems(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  activiteitIds: string[],
): Promise<{ id: string; bron?: string | null; bouw7_id?: string | null }[]> {
  if (activiteitIds.length === 0) return []
  const { data } = await supabase
    .from('planning_items')
    .select('id, bron, bouw7_id')
    .in('activiteit_id', activiteitIds)
  return (data ?? []) as { id: string; bron?: string | null; bouw7_id?: string | null }[]
}

/**
 * Verwijderfouten van Postgres naar iets wat een planner begrijpt.
 *
 * `werkbonnen.planning_item_id` (NOT NULL) en `uren_regels.planning_item_id` verwijzen naar
 * planning_items zónder cascade. Zodra er uren op een activiteit geschreven zijn, laat de
 * cascade-delete van haar planitems de hele verwijdering stuklopen met SQLSTATE 23503.
 */
function leesbareVerwijderFout(error: { code?: string; message: string }, wat: string): string {
  if (error.code === '23503') {
    return `Op deze ${wat} zijn al uren of werkbonnen geregistreerd; verwijderen kan daarom niet.`
  }
  return error.message
}

/**
 * Verwijder een activiteit met al haar planitems, ook in Bouw7.
 *
 * Volgorde is bewust: eerst de Bouw7-ids lezen (na de delete zijn ze door de cascade weg),
 * dan EVA verwijderen, en pas bij succes Bouw7 opruimen. Andersom zou een mislukte
 * EVA-delete — bijvoorbeeld op een activiteit met geschreven uren — de planning in Bouw7
 * al gewist hebben terwijl in EVA alles blijft staan.
 */
export async function verwijderPlanningActiviteit(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()

  const { data: act } = await supabase
    .from('planning_activiteiten')
    .select('id, dossier_id, bouw7_id, planning_items!activiteit_id ( bron, bouw7_id )')
    .eq('id', id)
    .maybeSingle()

  if (!act) return { ok: false, error: 'Activiteit niet gevonden.' }
  await assertDossierBewerkbaar(act.dossier_id)

  const planItemIds = bouw7PlanItemIds(act.planning_items ?? [])

  // Plan-items van de ándere activiteiten van dit dossier: die mag de Bouw7-snoei nooit raken.
  const { data: andere } = await supabase
    .from('planning_activiteiten')
    .select('id')
    .eq('dossier_id', act.dossier_id)
    .neq('id', id)
  const andereIds = ((andere ?? []) as { id: string }[]).map(a => a.id)
  const beschermdeIds = andereIds.length > 0
    ? bouw7PlanItemIds(await haalPlanItems(supabase, andereIds))
    : []

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('bouw7_id')
    .eq('id', act.dossier_id)
    .maybeSingle()

  const { error } = await supabase
    .from('planning_activiteiten')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: leesbareVerwijderFout(error, 'activiteit') }

  if (planItemIds.length > 0 || (dossier?.bouw7_id && act.bouw7_id)) {
    try {
      const { verwijderPlanningInBouw7 } = await import('@/lib/bouw7/plan-item-write')
      const resultaat = await verwijderPlanningInBouw7({
        projectBouw7Id: dossier?.bouw7_id ?? null,
        activiteitKey:  act.bouw7_id ?? null,
        planItemIds,
        beschermdeIds,
      })
      if (resultaat.mislukt > 0) {
        console.error(`[planning] ${resultaat.mislukt} plan-item(s) van activiteit ${id} niet verwijderd in Bouw7`)
      }
    } catch (e) {
      console.error('[planning] verwijderen activiteit in Bouw7 mislukt:', e)
    }
  }

  await naPlanningWijziging()
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
  await assertDossierBewerkbaar(input.dossier_id)

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

  await spiegelNaarBouw7(data.id)
  await naPlanningWijziging()
  return { ok: true, data: data as PlanningItem }
}

const snelItemSchema = z.object({
  dossier_id:         z.string().uuid(),
  medewerker_id:      z.string().uuid(),
  bewakingscode:      z.string().min(1),
  bewakingscode_naam: z.string().nullable().optional(),
  bouw7_security_code_id: z.number().nullable().optional(),
  titel:              z.string().max(200).optional(),
  uursoort_id:        z.string().uuid().nullable().optional(),
  start_dt:           z.string(),
  eind_dt:            z.string(),
  uren:               z.number().min(0),
  overrule:           z.boolean().optional(),
})

/**
 * Snel inplannen vanuit de Medewerkerplanning: maakt (of hergebruikt) een EVA-activiteit
 * op de gekozen bewakingscode en hangt daar een planitem aan. Een planitem staat altijd
 * op een bewakingscode — vandaar dat die hier verplicht is.
 */
export async function maakSnelPlanningItem(
  input: z.infer<typeof snelItemSchema>,
): Promise<
  | { ok: true; data: PlanningItem }
  | { ok: false; error: string; overschrijding?: true; beschikbare_uren?: number }
> {
  const parsed = snelItemSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  const inp = parsed.data
  await assertDossierBewerkbaar(inp.dossier_id)
  const supabase = db()

  const titel = inp.titel?.trim() || inp.bewakingscode_naam?.trim() || inp.bewakingscode

  if (!inp.overrule) {
    const budget = await checkBudget(inp.dossier_id, inp.uursoort_id ?? null, inp.uren)
    if (!budget.ok) return budget
  }

  // Hergebruik een bestaande EVA-activiteit op dezelfde bewakingscode + titel,
  // zodat herhaald inplannen niet telkens een nieuwe activiteit aanmaakt.
  const { data: bestaande } = await supabase
    .from('planning_activiteiten')
    .select('id')
    .eq('dossier_id', inp.dossier_id)
    .eq('bron', 'eva')
    .eq('bewakingscode', inp.bewakingscode)
    .eq('titel', titel)
    .limit(1)
    .maybeSingle()

  let activiteitId: string = bestaande?.id
  if (!activiteitId) {
    const { data: act, error: actErr } = await supabase
      .from('planning_activiteiten')
      .insert({
        dossier_id:             inp.dossier_id,
        titel,
        uursoort_id:            inp.uursoort_id ?? null,
        bewakingscode:          inp.bewakingscode,
        bouw7_security_code_id: inp.bouw7_security_code_id ?? null,
        status:                 'gepland',
        bron:                   'eva',
      })
      .select('id')
      .single()
    if (actErr || !act) return { ok: false, error: actErr?.message ?? 'Activiteit aanmaken mislukt' }
    activiteitId = act.id
  }

  const { data, error } = await supabase
    .from('planning_items')
    .insert({
      activiteit_id: activiteitId,
      medewerker_id: inp.medewerker_id,
      start_dt:      inp.start_dt,
      eind_dt:       inp.eind_dt,
      uren:          inp.uren,
      overrule:      inp.overrule ?? false,
      bron:          'eva',
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  await spiegelNaarBouw7(data.id)
  await naPlanningWijziging()
  return { ok: true, data: data as PlanningItem }
}

/**
 * Kopieert een bestaand planitem naar een (andere) medewerker + moment. De client rekent
 * start/eind uit (tijdstip + duur blijven gelijk, tijdzone van de gebruiker); de kopie hangt
 * aan dezelfde activiteit (zelfde dossier + bewakingscode) en is altijd bron='eva'.
 */
export async function kopieerPlanningItem(
  id: string,
  doel: { medewerker_id: string; start_dt: string; eind_dt: string },
): Promise<
  | { ok: true; data: PlanningItem }
  | { ok: false; error: string; overschrijding?: true; beschikbare_uren?: number }
> {
  const supabase = db()

  const { data: bron, error: bronErr } = await supabase
    .from('planning_items')
    .select('*, planning_activiteiten!activiteit_id ( dossier_id, uursoort_id )')
    .eq('id', id)
    .single()
  if (bronErr || !bron) return { ok: false, error: bronErr?.message ?? 'Planitem niet gevonden' }
  await assertDossierBewerkbaar(bron.planning_activiteiten?.dossier_id ?? null)

  const budget = await checkBudget(
    bron.planning_activiteiten?.dossier_id ?? '',
    bron.planning_activiteiten?.uursoort_id ?? null,
    bron.uren,
  )
  if (!budget.ok) return budget

  const { data, error } = await supabase
    .from('planning_items')
    .insert({
      activiteit_id: bron.activiteit_id,
      medewerker_id: doel.medewerker_id,
      start_dt:      doel.start_dt,
      eind_dt:       doel.eind_dt,
      uren:          bron.uren,
      bron:          'eva',
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  await spiegelNaarBouw7(data.id)
  await naPlanningWijziging()
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
  await assertDossierBewerkbaar(input.dossier_id)
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

  await spiegelNaarBouw7(id)
  await naPlanningWijziging()
  return { ok: true }
}

export async function verwijderPlanningItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // bouw7_id mee ophalen: na de delete is hij niet meer te achterhalen en zou het
  // gespiegelde plan-item als wees in Bouw7 achterblijven.
  const { data: bron } = await db()
    .from('planning_items')
    .select('bouw7_id, bron, planning_activiteiten!activiteit_id ( dossier_id )')
    .eq('id', id)
    .maybeSingle()
  if (bron?.planning_activiteiten?.dossier_id) await assertDossierBewerkbaar(bron.planning_activiteiten.dossier_id)

  const { error } = await db()
    .from('planning_items')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  if (bron?.bron === 'eva' && bron?.bouw7_id) {
    try {
      const { verwijderPlanItemInBouw7 } = await import('@/lib/bouw7/plan-item-write')
      await verwijderPlanItemInBouw7(bron.bouw7_id)
    } catch (e) {
      console.error('[planning] verwijderen in Bouw7 mislukt:', e)
    }
  }

  await naPlanningWijziging()
  return { ok: true }
}

// ─── Werkbegroting ────────────────────────────────────────────────────────────

export async function upsertWerkbegrotingRegel(
  dossier_id: string,
  uursoort_id: string,
  begrote_uren: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossier_id)
  const { error } = await db()
    .from('planning_werkbegroting_regels')
    .upsert(
      { dossier_id, uursoort_id, begrote_uren },
      { onConflict: 'dossier_id,uursoort_id' },
    )

  if (error) return { ok: false, error: error.message }
  await naPlanningWijziging()
  return { ok: true }
}

/**
 * Handmatige overname van de everts-calc werkbegroting (sync-knop op de Planning-tab).
 * De overname zelf gebeurt ook automatisch bij offerte → opdracht — deze knop is het
 * vangnet voor o.a. een later gewijzigde calculatie. Logica leeft in lib/planning/werkbegroting.
 */
export async function syncWerkbegrotingVanEvertsCalc(
  dossier_id: string,
): Promise<{ ok: true; gematch: number; ongematch: string[] } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossier_id)
  const { neemWerkbegrotingOver } = await import('@/lib/planning/werkbegroting')
  const result = await neemWerkbegrotingOver(dossier_id)
  if (!result.ok) return result

  revalidatePath(`/aanvragen/${dossier_id}/planning`)
  revalidatePath(`/opdrachten/${dossier_id}/planning`)

  return result
}

// ─── Fasen ────────────────────────────────────────────────────────────────────

export async function maakPlanningFase(
  dossier_id: string,
  naam: string,
  volgorde?: number,
): Promise<{ ok: true; data: PlanningFase } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossier_id)
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
  await naPlanningWijziging()
  return { ok: true, data: data as PlanningFase }
}

export async function updatePlanningFase(
  id: string,
  input: { naam?: string; volgorde?: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().from('planning_fasen').update(input).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await naPlanningWijziging()
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

  await naPlanningWijziging()
  return { ok: true, activiteiten_verschoven: aShift, items_verschoven: iShift }
}

/**
 * Verwijder een fase, de activiteiten erin en hun planning — in EVA én in Bouw7.
 *
 * Waarom de activiteiten meegaan: een fase spiegelt een bewakingscode-hoofdstuk, en de
 * lees-sync leidt de fasen af uit de hoofdstukken van de plan-items in het project. Zou je
 * alleen de EVA-rij weggooien, dan bouwt de eerstvolgende sync de fase gewoon terug zolang er
 * plan-items onder dat hoofdstuk staan. "Fase weg" betekent dus: de planning eronder weg.
 *
 * Wat blijft staan: de bewakingscode en het hoofdstuk zelf, en de koppeling van die code aan
 * het project. Hoofdstukken zijn globale Bouw7-stamdata over alle projecten heen — daar raakt
 * dit niets aan. Alleen de geplande items verdwijnen.
 *
 * Vooraf wordt gecontroleerd op geschreven uren. Zonder die check zou een fase met tien
 * activiteiten halverwege kunnen stranden op een foreign key, met een deels verwijderde fase
 * en een al leeggehaalde Bouw7-planning tot gevolg.
 */
export async function verwijderPlanningFase(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = db()

  const { data: fase } = await supabase
    .from('planning_fasen')
    .select('id, dossier_id, naam, bouw7_id')
    .eq('id', id)
    .maybeSingle()

  if (!fase) return { ok: false, error: 'Fase niet gevonden.' }
  await assertDossierBewerkbaar(fase.dossier_id)

  // Activiteiten van dít dossier, gesplitst in "in deze fase" en "erbuiten". De tweede groep
  // levert de beschermde Bouw7-ids: een in EVA gemaakte activiteit kan in een andere fase staan
  // terwijl haar plan-item de bewakingscode van déze fase draagt.
  const { data: activiteiten } = await supabase
    .from('planning_activiteiten')
    .select('id, fase_id')
    .eq('dossier_id', fase.dossier_id)

  const inFase    = (activiteiten ?? []).filter((a: { fase_id: string | null }) => a.fase_id === id).map((a: { id: string }) => a.id)
  const buitenFase = (activiteiten ?? []).filter((a: { fase_id: string | null }) => a.fase_id !== id).map((a: { id: string }) => a.id)

  const eigenItems     = await haalPlanItems(supabase, inFase)
  const beschermdItems = await haalPlanItems(supabase, buitenFase)

  // Geschreven uren blokkeren de verwijdering; liever vooraf weigeren dan halverwege stranden.
  if (eigenItems.length > 0) {
    const itemIds = eigenItems.map(i => i.id)
    const [{ data: werkbonnen }, { data: urenRegels }] = await Promise.all([
      supabase.from('werkbonnen').select('id').in('planning_item_id', itemIds).limit(1),
      supabase.from('uren_regels').select('id').in('planning_item_id', itemIds).limit(1),
    ])
    if ((werkbonnen ?? []).length > 0 || (urenRegels ?? []).length > 0) {
      return {
        ok: false,
        error: `Op de activiteiten in "${fase.naam}" zijn al uren of werkbonnen geregistreerd; de fase kan daarom niet worden verwijderd.`,
      }
    }
  }

  if (inFase.length > 0) {
    // Planitems cascaden mee op de activiteiten.
    const { error: actErr } = await supabase.from('planning_activiteiten').delete().in('id', inFase)
    if (actErr) return { ok: false, error: leesbareVerwijderFout(actErr, 'fase') }
  }

  const { error } = await supabase.from('planning_fasen').delete().eq('id', id)
  if (error) return { ok: false, error: leesbareVerwijderFout(error, 'fase') }

  // Pas ná een geslaagde EVA-verwijdering naar Bouw7 — anders zou een geweigerde delete de
  // planning daar al hebben opgeruimd.
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('bouw7_id')
    .eq('id', fase.dossier_id)
    .maybeSingle()

  if (dossier?.bouw7_id || eigenItems.length > 0) {
    try {
      const { verwijderPlanningInBouw7 } = await import('@/lib/bouw7/plan-item-write')
      const resultaat = await verwijderPlanningInBouw7({
        projectBouw7Id: dossier?.bouw7_id ?? null,
        faseKey:        fase.bouw7_id ?? null,
        planItemIds:    bouw7PlanItemIds(eigenItems),
        beschermdeIds:  bouw7PlanItemIds(beschermdItems),
      })
      if (resultaat.mislukt > 0) {
        console.error(`[planning] ${resultaat.mislukt} plan-item(s) van fase ${id} niet verwijderd in Bouw7`)
      }
    } catch (e) {
      console.error('[planning] fase-planning opruimen in Bouw7 mislukt:', e)
    }
  }

  await naPlanningWijziging()
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
  await naPlanningWijziging()
  return { ok: true, data: data as PlanningAfhankelijkheid }
}

export async function verwijderAfhankelijkheid(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db().from('planning_activiteit_afhankelijkheden').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  await naPlanningWijziging()
  return { ok: true }
}

// ─── Bouw7-planning sync (per dossier) ──────────────────────────────────────────

/** Haal de planning (fasen/activiteiten/planitems) van dit dossier op uit Bouw7. */
export async function syncPlanningVoorDossier(
  dossier_id: string,
): Promise<{ ok: true; nieuw: number; fouten: number } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossier_id)
  const { syncDossierPlanning } = await import('@/lib/bouw7/sync-planning')
  // Handmatige ververs = altijd volledig herbouwen (mode 'full'). Anders slaat de
  // planning-hash de rebuild over als de Bouw7 plan-items zelf niet wijzigden, en
  // zie je bijv. de activiteit-samenvoeging niet. De cron/bulk blijft incrementeel.
  const result = await syncDossierPlanning(dossier_id, { mode: 'full' })
  if (result.foutMelding) return { ok: false, error: result.foutMelding }
  await naPlanningWijziging()
  return { ok: true, nieuw: result.nieuw, fouten: result.fouten }
}
