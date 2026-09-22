'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type {
  PlanningActiviteitStatus,
  PlanningActiviteit, PlanningItem, PlanningItemVerrijkt,
  PlanningWerkbegrotingRegelMetUursoort,
  PlanningFase, PlanningAfhankelijkheid, AfhankelijkheidsType,
} from '@everts/database/platform-types'
import type { PlanningBewakingscode } from '@/lib/planning/bewakingscodes'
import { vereisRecht, vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { meldWerkToegewezen } from '@/lib/dossiers/servicedesk-acties'
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
  bewakingscode:     z.string().nullable().optional(),
  bouw7_security_code_id: z.number().int().nullable().optional(),
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

/** De fase van een activiteit, met haar standaard-bewakingscode. */
async function faseCode(
  fase_id: string | null | undefined,
): Promise<{ bewakingscode: string | null; bouw7_security_code_id: number | null } | null> {
  if (!fase_id) return null
  const { data } = await db()
    .from('planning_fasen')
    .select('bewakingscode, bouw7_security_code_id')
    .eq('id', fase_id)
    .maybeSingle()
  if (!data?.bewakingscode) return null
  return { bewakingscode: data.bewakingscode, bouw7_security_code_id: data.bouw7_security_code_id ?? null }
}

/**
 * Kent dit dossier bewakingscodes om uit te kiezen? Zo ja, dan is een code verplicht: elk
 * planitem hangt via zijn activiteit aan een code en zonder code vallen de geplande uren
 * buiten de bewaking. Kent het dossier er geen (niet aan Bouw7 gekoppeld, of de snapshot is
 * nog nooit opgehaald), dan valt er niets te kiezen en houden we niemand tegen.
 */
async function bewakingscodeVerplicht(dossier_id: string): Promise<boolean> {
  const { getPlanningBewakingscodes } = await import('@/lib/planning/bewakingscodes')
  const codes = await getPlanningBewakingscodes(dossier_id)
  // Alleen codes die de kiezer ook tóónt. Codes zonder herkomst zijn restanten van het
  // projectsjabloon: die staan verborgen, en dan valt er niets af te dwingen.
  return codes.some(c => c.in_gebruik)
}

/**
 * De bewakingscodes waaruit een planner bij dit dossier kan kiezen — voor client-schermen
 * (Medewerkerplanning). Draagt óók de Bouw7 `securityCode.id`, zodat een planitem dat hier
 * ontstaat in Bouw7 aan de code gekoppeld kan worden en niet ongecodeerd blijft hangen.
 *
 * `vereisSessie` staat er omdat dit een client-action is die de admin-client gebruikt: die
 * bypast RLS, dus zonder gate leest een kale RPC de bewakingscodes van elk willekeurig
 * dossier uit. Lezen mag iedere ingelogde medewerker — de codes staan ook gewoon op het
 * planningsscherm — vandaar de sessiecontrole en geen zwaarder recht.
 */
export async function haalPlanningBewakingscodes(
  dossier_id: string,
): Promise<{ ok: true; codes: PlanningBewakingscode[] } | { ok: false; error: string }> {
  try {
    await vereisSessie()
    const { getPlanningBewakingscodes } = await import('@/lib/planning/bewakingscodes')
    return { ok: true, codes: await getPlanningBewakingscodes(dossier_id) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ophalen bewakingscodes mislukt.' }
  }
}

const GEEN_CODE =
  'Kies een bewakingscode. Geplande uren worden via de activiteit op een bewakingscode geboekt; '
  + 'zonder code vallen ze buiten de bewaking. Tip: zet de code op de fase, dan erven de activiteiten eronder hem.'

export async function maakPlanningActiviteit(
  input: z.infer<typeof activiteitSchema>,
): Promise<{ ok: true; data: PlanningActiviteit } | { ok: false; error: string }> {
  const parsed = activiteitSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  await assertDossierBewerkbaar(input.dossier_id)

  // Bewakingscode: eigen keuze wint, anders die van de fase. Blijft hij leeg terwijl het
  // dossier codes kent, dan gaat de activiteit niet door — dat is precies het gat dat we dichten.
  const eigenCode = parsed.data.bewakingscode?.trim() || null
  const erfCode = eigenCode ? null : await faseCode(parsed.data.fase_id)
  const bewakingscode = eigenCode ?? erfCode?.bewakingscode ?? null
  const securityCodeId = eigenCode
    ? (parsed.data.bouw7_security_code_id ?? null)
    : (erfCode?.bouw7_security_code_id ?? null)
  if (!bewakingscode && await bewakingscodeVerplicht(input.dossier_id)) {
    return { ok: false, error: GEEN_CODE }
  }

  const { data, error } = await db()
    .from('planning_activiteiten')
    .insert({
      ...parsed.data,
      bewakingscode,
      bouw7_security_code_id: securityCodeId,
      status: parsed.data.status ?? 'backlog',
    })
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
    .select('*')
    .eq('id', id)
    .single()
  if (!huidig) return { ok: false, error: 'Activiteit niet gevonden.' }

  // Een uit Bouw7 geïmporteerde activiteit is een afgeleide van de plan-items eronder: titel,
  // bewakingscode, uren, omschrijving en fase komen bij elke sync opnieuw uit Bouw7, dus die
  // in EVA wijzigen zou de volgende ochtend stil verdwijnen. Verplaatsen (datums → de items,
  // die wél worden teruggeschreven) en de EVA-eigen velden status/volgorde mogen wel.
  if (huidig.bron === 'bouw7') {
    const toegestaan = new Set(['status', 'volgorde', 'gewenste_start', 'deadline'])
    const patch = input as Record<string, unknown>
    const geblokkeerd = Object.keys(patch).filter(k =>
      !toegestaan.has(k) && patch[k] !== undefined
      && JSON.stringify(patch[k] ?? null) !== JSON.stringify((huidig as Record<string, unknown>)[k] ?? null))
    if (geblokkeerd.length > 0) {
      return {
        ok: false,
        error: 'Deze taak komt uit Bouw7: titel, bewakingscode, uren, omschrijving en fase volgen de planning daar. '
          + 'Verplaats de balken zelf om de planning te wijzigen.',
      }
    }
  }

  const huidigeStart    = huidig?.gewenste_start ?? null
  const huidigeDeadline = huidig?.deadline ?? null
  const isBouw7 = huidig.bron === 'bouw7'

  // Bewakingscode mag niet leeggemaakt worden — dan zouden de geplande uren van deze
  // activiteit alsnog buiten de bewaking vallen.
  const patch: Record<string, unknown> = { ...input }
  if ('bewakingscode' in patch) {
    const nieuweCode = typeof patch.bewakingscode === 'string' ? patch.bewakingscode.trim() : null
    if (!nieuweCode && await bewakingscodeVerplicht(huidig.dossier_id)) {
      return { ok: false, error: GEEN_CODE }
    }
    patch.bewakingscode = nieuweCode
  }

  // Verplaatst naar een fase met een eigen code en zelf nog geen code? Dan erft de activiteit
  // die van de fase — zo hoeft slepen tussen fasen niet gevolgd te worden door een handmatige keuze.
  const faseGewijzigd = input.fase_id !== undefined && input.fase_id !== (huidig.fase_id ?? null)
  const codeNaPatch = 'bewakingscode' in patch ? (patch.bewakingscode as string | null) : (huidig.bewakingscode ?? null)
  if (faseGewijzigd && !codeNaPatch && huidig.bron === 'eva') {
    const erf = await faseCode(input.fase_id)
    if (erf) {
      patch.bewakingscode = erf.bewakingscode
      patch.bouw7_security_code_id = erf.bouw7_security_code_id
    }
  }

  const { error } = await supabase
    .from('planning_activiteiten')
    .update(patch)
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
        await spiegelNaarBouw7(item.id)
        itemsVerschoven++
      }
    }
  } else if (startGewijzigd && !deadlineGewijzigd && huidigeStart) {
    // Left-resize: alleen start gewijzigd — crop items die vóór nieuwe start beginnen
    const newStartMs = new Date(nieuweStart!).getTime()
    if (new Date(nieuweStart!).getTime() > new Date(huidigeStart).getTime()) {
      // Inkorten: start later → crop of verwijder items. Bouw7-items die er helemaal buiten
      // vallen blijven staan (de rebuild zou ze anders terugzetten); de taakdatums volgen
      // bij de volgende sync de items.
      for (const item of items) {
        const itemStartMs = new Date(item.start_dt).getTime()
        const itemEindMs  = new Date(item.eind_dt).getTime()
        if (itemEindMs <= newStartMs) {
          if (isBouw7) continue
          await supabase.from('planning_items').delete().eq('id', item.id)
        } else if (itemStartMs < newStartMs) {
          await supabase.from('planning_items').update({ start_dt: new Date(newStartMs).toISOString() }).eq('id', item.id)
          await spiegelNaarBouw7(item.id)
          itemsVerschoven++
        }
      }
    }
  } else if (deadlineGewijzigd && !startGewijzigd && huidigeDeadline) {
    // Right-resize: alleen deadline gewijzigd — crop items die na nieuwe deadline eindigen
    if (nieuweDeadline && nieuweDeadline < huidigeDeadline) {
      // Inkorten: deadline eerder → crop of verwijder items (zie hierboven voor Bouw7-items).
      const newDeadlineEodMs = new Date(nieuweDeadline + 'T23:59:59').getTime()
      for (const item of items) {
        const itemStartMs = new Date(item.start_dt).getTime()
        const itemEindMs  = new Date(item.eind_dt).getTime()
        if (itemStartMs > newDeadlineEodMs) {
          if (isBouw7) continue
          await supabase.from('planning_items').delete().eq('id', item.id)
        } else if (itemEindMs > newDeadlineEodMs) {
          await supabase.from('planning_items').update({ eind_dt: new Date(newDeadlineEodMs).toISOString() }).eq('id', item.id)
          await spiegelNaarBouw7(item.id)
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
  // Eigen mensen op een servicedeskbon: die staat daarmee op Ingepland. Aan het aanmaken
  // van het planitem en niet aan een knop, zodat de kolom volgt op wat er echt staat.
  await meldWerkToegewezen(input.dossier_id, 'ingepland')
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
  // Eigen mensen op een servicedeskbon: die staat daarmee op Ingepland. Aan het aanmaken
  // van het planitem en niet aan een knop, zodat de kolom volgt op wat er echt staat.
  await meldWerkToegewezen(inp.dossier_id, 'ingepland')
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

/**
 * Verlof, ziekte, ATV en feestdagen zijn geen werkzaamheden: die komen uit de
 * verlofadministratie (medewerker_afwezigheid / Bouw7 day-offs) en horen daar ook
 * gewijzigd te worden, niet met een knop op een planbalk. Geeft de naam van de
 * afwezigheidssoort terug als dit planitem er een is, anders `null`.
 */
function afwezigheidssoort(
  uursoort?: { naam?: string | null; uren_categorie?: string | null } | null,
): string | null {
  if (!uursoort) return null
  if (!['afwezig', 'feestdag', 'tijd_voor_tijd'].includes(uursoort.uren_categorie ?? '')) return null
  return uursoort.naam ?? 'Verlof'
}

const splitsSchema = z.object({
  deel1: z.object({ start_dt: z.string(), eind_dt: z.string(), uren: z.number().min(0) }),
  deel2: z.object({ start_dt: z.string(), eind_dt: z.string(), uren: z.number().min(0) }),
})

/**
 * Knip een planitem in tweeën — bedoeld om een dubbel gepland stuk eruit te halen zonder
 * de hele klus te verschuiven. Het bestaande item houdt deel 1 (en daarmee zijn werkbonnen,
 * geschreven uren en Bouw7-koppeling); deel 2 wordt een nieuw EVA-planitem op dezelfde
 * activiteit en medewerker. Het gat ertussen — de dubbele planning — vervalt.
 *
 * Bewust géén budgetcontrole: de aanroeper verdeelt de uren van het origineel over de twee
 * delen en laat de dubbele uren vervallen, dus het dossiertotaal kan alleen dalen.
 */
export async function splitsPlanningItem(
  id: string,
  input: z.infer<typeof splitsSchema>,
): Promise<{ ok: true; nieuwId: string } | { ok: false; error: string }> {
  await vereisRecht('planning', 'schrijven')
  const parsed = splitsSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.message }
  const { deel1, deel2 } = parsed.data

  const supabase = db()
  const { data: bron, error: bronErr } = await supabase
    .from('planning_items')
    .select('activiteit_id, medewerker_id, start_dt, eind_dt, uren, planning_activiteiten!activiteit_id ( dossier_id, planning_uursoorten!uursoort_id ( naam, uren_categorie ) )')
    .eq('id', id)
    .maybeSingle()
  if (bronErr || !bron) return { ok: false, error: bronErr?.message ?? 'Planitem niet gevonden' }
  await assertDossierBewerkbaar(bron.planning_activiteiten?.dossier_id ?? null)

  const afwezig = afwezigheidssoort(bron.planning_activiteiten?.planning_uursoorten)
  if (afwezig) {
    return { ok: false, error: `“${afwezig}” is geen werkzaamheid en kan niet gesplitst worden.` }
  }

  // Eerst het origineel inkorten, dan pas het tweede deel erbij: staat de insert even in de
  // weg (bijv. een controle verderop), dan heeft het dossier nooit méér uren gepland staan
  // dan voor de splitsing.
  const { error: updErr } = await supabase
    .from('planning_items')
    .update({ start_dt: deel1.start_dt, eind_dt: deel1.eind_dt, uren: deel1.uren })
    .eq('id', id)
  if (updErr) return { ok: false, error: updErr.message }

  const { data: nieuw, error: insErr } = await supabase
    .from('planning_items')
    .insert({
      activiteit_id: bron.activiteit_id,
      medewerker_id: bron.medewerker_id,
      start_dt:      deel2.start_dt,
      eind_dt:       deel2.eind_dt,
      uren:          deel2.uren,
      bron:          'eva',
    })
    .select('id')
    .single()

  if (insErr || !nieuw) {
    // Het tweede deel is niet weggeschreven; zet het origineel terug zoals het stond,
    // anders zijn de uren van dat deel stilletjes uit de planning verdwenen.
    await supabase
      .from('planning_items')
      .update({ start_dt: bron.start_dt, eind_dt: bron.eind_dt, uren: bron.uren })
      .eq('id', id)
    return { ok: false, error: insErr?.message ?? 'Het tweede deel kon niet aangemaakt worden.' }
  }

  await spiegelNaarBouw7(id)
  await spiegelNaarBouw7(nieuw.id)
  await naPlanningWijziging()
  return { ok: true, nieuwId: nieuw.id }
}

export async function verwijderPlanningItem(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // bouw7_id mee ophalen: na de delete is hij niet meer te achterhalen en zou het
  // gespiegelde plan-item als wees in Bouw7 achterblijven.
  const { data: bron } = await db()
    .from('planning_items')
    .select('bouw7_id, bron, medewerkers!medewerker_id ( bouw7_id ), planning_activiteiten!activiteit_id ( dossier_id, planning_uursoorten!uursoort_id ( naam, uren_categorie ) )')
    .eq('id', id)
    .maybeSingle()
  if (bron?.planning_activiteiten?.dossier_id) await assertDossierBewerkbaar(bron.planning_activiteiten.dossier_id)

  // Alleen werkzaamheden zijn vanuit de planning te verwijderen — zie afwezigheidssoort().
  const afwezig = afwezigheidssoort(bron?.planning_activiteiten?.planning_uursoorten)
  if (afwezig) {
    return { ok: false, error: `“${afwezig}” is geen werkzaamheid en kan niet uit de planning verwijderd worden.` }
  }

  // Uit Bouw7 geïmporteerd: eerst dáár de medewerker van het plan-item halen (of het item weg
  // als dit de laatste was), en pas daarna in EVA. Lukt Bouw7 niet, dan weigeren we: anders
  // zet de rebuild de rij de volgende ochtend gewoon terug en is er niets gebeurd. Geschreven
  // uren blokkeren de verwijdering sowieso — dat controleren we vóór we Bouw7 aanraken.
  if (bron?.bron === 'bouw7' && bron.bouw7_id) {
    const [{ data: werkbonnen }, { data: urenRegels }] = await Promise.all([
      db().from('werkbonnen').select('id').eq('planning_item_id', id).limit(1),
      db().from('uren_regels').select('id').eq('planning_item_id', id).limit(1),
    ])
    if ((werkbonnen ?? []).length > 0 || (urenRegels ?? []).length > 0) {
      return { ok: false, error: 'Op dit planitem zijn al uren of werkbonnen geregistreerd; verwijderen kan daarom niet.' }
    }
    const planItemId = Number(String(bron.bouw7_id).split(':')[0])
    const employeeId = Number(bron.medewerkers?.bouw7_id)
    if (planItemId && employeeId) {
      try {
        const { verwijderMedewerkerVanBouw7PlanItem } = await import('@/lib/bouw7/plan-item-write')
        await verwijderMedewerkerVanBouw7PlanItem(planItemId, employeeId)
      } catch (e) {
        console.error('[planning] verwijderen Bouw7-planitem mislukt:', e)
        return { ok: false, error: 'Verwijderen in Bouw7 is niet gelukt; de planning is niet gewijzigd. Probeer het straks opnieuw.' }
      }
    }
  }

  const { error } = await db()
    .from('planning_items')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: leesbareVerwijderFout(error, 'planning') }

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
  opties?: { volgorde?: number; bewakingscode?: string | null; bouw7_security_code_id?: number | null },
): Promise<{ ok: true; data: PlanningFase } | { ok: false; error: string }> {
  const volgorde = opties?.volgorde
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
    .insert({
      dossier_id,
      naam: naam.trim(),
      volgorde: vol,
      bewakingscode: opties?.bewakingscode?.trim() || null,
      bouw7_security_code_id: opties?.bouw7_security_code_id ?? null,
    })
    .select('*')
    .single()

  if (error) return { ok: false, error: error.message }
  await naPlanningWijziging()
  return { ok: true, data: data as PlanningFase }
}

/**
 * Werkt een fase bij. Krijgt de fase een bewakingscode, dan zakt die door naar de activiteiten
 * eronder: dat is wat "de code van de fase geldt voor alles daaronder" in de praktijk betekent —
 * de code blijft op de activiteit staan, want dat is wat de urenbewaking en de Bouw7-write lezen.
 *
 * Activiteiten zonder code krijgen hem altijd. Activiteiten met een àndere code zijn een bewuste
 * afwijking en blijven staan, tenzij `overschrijf_afwijkend` meekomt (de kiezer vraagt dat na).
 * Bouw7-activiteiten blijven buiten schot: hun code komt uit Bouw7 en zou bij de volgende sync
 * toch weer overschreven worden.
 */
export async function updatePlanningFase(
  id: string,
  input: {
    naam?: string
    volgorde?: number
    bewakingscode?: string | null
    bouw7_security_code_id?: number | null
    overschrijf_afwijkend?: boolean
  },
): Promise<{ ok: true; activiteiten_bijgewerkt?: number } | { ok: false; error: string }> {
  const supabase = db()
  const { overschrijf_afwijkend, ...velden } = input
  const patch: Record<string, unknown> = { ...velden }
  if ('bewakingscode' in patch) patch.bewakingscode = (patch.bewakingscode as string | null)?.trim() || null

  const { error } = await supabase.from('planning_fasen').update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }

  let bijgewerkt = 0
  const code = patch.bewakingscode as string | null | undefined
  if (code) {
    const doorzetten = supabase
      .from('planning_activiteiten')
      .update({ bewakingscode: code, bouw7_security_code_id: input.bouw7_security_code_id ?? null })
      .eq('fase_id', id)
      .eq('bron', 'eva')
    const { data: geraakt, error: aErr } = overschrijf_afwijkend
      ? await doorzetten.neq('bewakingscode', code).select('id')
      : await doorzetten.is('bewakingscode', null).select('id')
    if (aErr) return { ok: false, error: aErr.message }
    bijgewerkt = (geraakt ?? []).length

    // `.neq()` laat rijen met NULL buiten beschouwing (NULL <> waarde is onbekend), dus die
    // krijgen bij overschrijven een eigen ronde.
    if (overschrijf_afwijkend) {
      const { data: leeg } = await supabase
        .from('planning_activiteiten')
        .update({ bewakingscode: code, bouw7_security_code_id: input.bouw7_security_code_id ?? null })
        .eq('fase_id', id)
        .eq('bron', 'eva')
        .is('bewakingscode', null)
        .select('id')
      bijgewerkt += (leeg ?? []).length
    }
  }

  await naPlanningWijziging()
  return { ok: true, activiteiten_bijgewerkt: bijgewerkt }
}

/** Minuten-offset van Europe/Amsterdam op dit moment (60 in de winter, 120 in de zomer). */
function nlOffsetMinuten(d: Date): number {
  const naam = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Amsterdam', timeZoneName: 'longOffset' })
    .formatToParts(d)
    .find(p => p.type === 'timeZoneName')?.value ?? 'GMT+01:00'
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(naam)
  if (!m) return 60
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]))
}

/** Kale datum (yyyy-mm-dd) een aantal dagen opschuiven. */
function schuifDatum(datum: string | null, dagen: number): string | null {
  if (!datum) return null
  return new Date(new Date(datum).getTime() + dagen * 86_400_000).toISOString().slice(0, 10)
}

/**
 * Tijdstip een heel aantal dagen opschuiven, mét behoud van de Nederlandse kloktijd.
 *
 * Kaal dagen-in-milliseconden optellen verschuift over een zomertijdgrens de kloktijd een uur:
 * een blok dat om 08:00 begon landde dan op 07:00 (of 09:00). De server draait in UTC, dus dat
 * uur moet expliciet worden teruggerekend uit het offsetverschil tussen bron en doel.
 */
function schuifTijdstip(ts: string, dagen: number): string {
  const bron = new Date(ts)
  const ruw  = new Date(bron.getTime() + dagen * 86_400_000)
  const correctieMs = (nlOffsetMinuten(bron) - nlOffsetMinuten(ruw)) * 60_000
  return new Date(ruw.getTime() + correctieMs).toISOString()
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

  let aShift = 0, iShift = 0

  for (const a of activiteiten ?? []) {
    const patch: { gewenste_start?: string; deadline?: string } = {}
    if (a.gewenste_start) patch.gewenste_start = schuifDatum(a.gewenste_start, delta_dagen)!
    if (a.deadline)       patch.deadline       = schuifDatum(a.deadline,       delta_dagen)!
    if (Object.keys(patch).length === 0) continue
    const { error: uErr } = await supabase.from('planning_activiteiten').update(patch).eq('id', a.id)
    if (uErr) return { ok: false, error: uErr.message }
    aShift++

    const { data: items } = await supabase
      .from('planning_items')
      .select('id, start_dt, eind_dt')
      .eq('activiteit_id', a.id)

    for (const item of items ?? []) {
      await supabase.from('planning_items').update({
        start_dt: schuifTijdstip(item.start_dt, delta_dagen),
        eind_dt:  schuifTijdstip(item.eind_dt,  delta_dagen),
      }).eq('id', item.id)
      iShift++
    }
  }

  await naPlanningWijziging()
  return { ok: true, activiteiten_verschoven: aShift, items_verschoven: iShift }
}

/**
 * Kopieert een hele fase: de fase zelf, haar activiteiten, optioneel de planning van de
 * medewerkers eronder, en de afhankelijkheden tussen die activiteiten onderling — alles een
 * gekozen aantal dagen opgeschoven.
 *
 * Waarom dit één actie is en geen reeks losse kopieën vanuit de client: de kopie moet als
 * geheel kloppen. De activiteiten wijzen naar de nieuwe fase, de afhankelijkheden naar de
 * nieuwe activiteiten, en de budgetcontrole gaat over het totaal in plaats van per planitem.
 * Per item zou de eerste overschrijding halverwege afbreken en een halve fase achterlaten.
 *
 * De kopie is altijd `bron='eva'`, ook als het origineel uit Bouw7 kwam: hij bestaat daar nog
 * niet en is dus geen afgeleide van een Bouw7-rij. De planitems worden wél naar Bouw7
 * gespiegeld, net als elk ander in EVA gemaakt planitem.
 *
 * Afhankelijkheden naar activiteiten buiten deze fase gaan bewust niet mee: die zouden de
 * kopie aan de buren van het origineel vastklinken.
 */
export async function kopieerPlanningFase(
  fase_id: string,
  opties: {
    naam?: string
    verschuif_dagen?: number
    /** Neemt de planitems (welke medewerker wanneer) mee. Standaard aan. */
    met_planning?: boolean
    /** Kopieer ook als het budget van een uursoort daarmee wordt overschreden. */
    overrule?: boolean
  } = {},
): Promise<
  | { ok: true; fase: PlanningFase; activiteiten: number; items: number }
  | { ok: false; error: string; overschrijding?: true }
> {
  // Een kopie legt in een klap een fase, activiteiten en planning aan. Dat is planningswerk,
  // dus het hangt aan het recht dat daarover gaat; de admin-client hieronder bypast RLS, dus
  // zonder deze controle zou elke ingelogde gebruiker dit kunnen aanroepen.
  try {
    await vereisRecht('planning', 'schrijven')
  } catch {
    return { ok: false, error: 'Je hebt geen rechten om de planning te wijzigen.' }
  }

  const supabase = db()
  const dagen = Math.trunc(opties.verschuif_dagen ?? 0)
  const metPlanning = opties.met_planning ?? true

  const { data: fase } = await supabase
    .from('planning_fasen')
    .select('*')
    .eq('id', fase_id)
    .maybeSingle()
  if (!fase) return { ok: false, error: 'Fase niet gevonden.' }
  await assertDossierBewerkbaar(fase.dossier_id)

  // Begrensd door fase_id; een fase houdt hooguit enkele tientallen activiteiten.
  const { data: bronActiviteiten, error: aErr } = await supabase
    .from('planning_activiteiten')
    .select('*')
    .eq('fase_id', fase_id)
    .order('volgorde')
  if (aErr) return { ok: false, error: aErr.message }

  const activiteiten = (bronActiviteiten ?? []) as PlanningActiviteit[]
  const bronIds = activiteiten.map(a => a.id)

  let bronItems: PlanningItem[] = []
  if (metPlanning && bronIds.length > 0) {
    const { data, error } = await supabase
      .from('planning_items')
      .select('*')
      .in('activiteit_id', bronIds)
    if (error) return { ok: false, error: error.message }
    bronItems = (data ?? []) as PlanningItem[]
  }

  // Budget: één controle per uursoort over álle te kopiëren uren samen.
  if (bronItems.length > 0 && !opties.overrule) {
    const uursoortVan = new Map(activiteiten.map(a => [a.id, a.uursoort_id]))
    const urenPerUursoort = new Map<string, number>()
    for (const item of bronItems) {
      const uursoort = uursoortVan.get(item.activiteit_id) ?? null
      if (!uursoort) continue
      urenPerUursoort.set(uursoort, (urenPerUursoort.get(uursoort) ?? 0) + (item.uren ?? 0))
    }
    for (const [uursoort_id, uren] of urenPerUursoort) {
      const budget = await checkBudget(fase.dossier_id, uursoort_id, uren)
      if (!budget.ok) return { ok: false, error: budget.error, overschrijding: true }
    }
  }

  // De kopie komt direct onder het origineel; alles daaronder schuift één plek op. De
  // volgorde is 1..n en aaneengesloten (zie het herordenen in de Gantt), dus dat gat moet
  // eerst gemaakt worden.
  const { data: laterFasen } = await supabase
    .from('planning_fasen')
    .select('id, volgorde')
    .eq('dossier_id', fase.dossier_id)
    .gt('volgorde', fase.volgorde)
    .order('volgorde', { ascending: false })
  for (const f of (laterFasen ?? []) as { id: string; volgorde: number }[]) {
    await supabase.from('planning_fasen').update({ volgorde: f.volgorde + 1 }).eq('id', f.id)
  }

  const { data: nieuweFase, error: fErr } = await supabase
    .from('planning_fasen')
    .insert({
      dossier_id:             fase.dossier_id,
      naam:                   (opties.naam?.trim() || `${fase.naam} (kopie)`).slice(0, 200),
      volgorde:               fase.volgorde + 1,
      bewakingscode:          fase.bewakingscode,
      bouw7_security_code_id: fase.bouw7_security_code_id,
      bron:                   'eva',
    })
    .select('*')
    .single()
  if (fErr || !nieuweFase) return { ok: false, error: fErr?.message ?? 'Fase kopiëren mislukt.' }

  // Ids vooraf zelf uitdelen: de afhankelijkheden en planitems moeten straks naar de júiste
  // kopie wijzen, en dan is meegaan op de volgorde waarin de insert zijn rijen teruggeeft te
  // wankel om op te bouwen.
  const nieuweIdVan = new Map<string, string>(activiteiten.map(a => [a.id, randomUUID()]))

  /**
   * Haalt een half aangelegde kopie weer weg. De activiteiten gaan eerst: `fase_id` is geen
   * cascade, dus alleen de fase verwijderen laat ze als losse activiteiten op het dossier
   * achter — precies de rommel die deze kopie niet mag opleveren.
   */
  async function draaiKopieTerug(): Promise<void> {
    const ids = [...nieuweIdVan.values()]
    if (ids.length > 0) await supabase.from('planning_activiteiten').delete().in('id', ids)
    await supabase.from('planning_fasen').delete().eq('id', nieuweFase.id)
  }

  if (activiteiten.length > 0) {
    const { error } = await supabase.from('planning_activiteiten').insert(
      activiteiten.map(a => ({
        id:               nieuweIdVan.get(a.id),
        dossier_id:       a.dossier_id,
        uursoort_id:      a.uursoort_id,
        onderaannemer_id: a.onderaannemer_id,
        fase_id:          nieuweFase.id,
        titel:            a.titel,
        omschrijving:     a.omschrijving,
        geschatte_uren:   a.geschatte_uren,
        benodigde_skills: a.benodigde_skills ?? [],
        gewenste_start:   schuifDatum(a.gewenste_start, dagen),
        deadline:         schuifDatum(a.deadline, dagen),
        locatie_adres:    a.locatie_adres,
        // De kopie begint opnieuw: je kopieert een afgeronde fase juist om het werk nog een
        // keer te doen, dus 'opgeleverd' of 'in uitvoering' gaat niet mee.
        volgorde:         a.volgorde,
        status:           'backlog',
        // Geen eigen code? Dan die van de fase, net als bij een nieuwe activiteit.
        bewakingscode:          a.bewakingscode ?? fase.bewakingscode,
        bouw7_security_code_id: a.bewakingscode ? a.bouw7_security_code_id : fase.bouw7_security_code_id,
        bron:                   'eva',
      })),
    )
    if (error) {
      await draaiKopieTerug()
      return { ok: false, error: error.message }
    }
  }

  let nieuweItemIds: string[] = []
  if (bronItems.length > 0) {
    const { data, error } = await supabase
      .from('planning_items')
      .insert(bronItems.map(item => ({
        activiteit_id:  nieuweIdVan.get(item.activiteit_id),
        medewerker_id:  item.medewerker_id,
        start_dt:       schuifTijdstip(item.start_dt, dagen),
        eind_dt:        schuifTijdstip(item.eind_dt, dagen),
        uren:           item.uren,
        overrule:       item.overrule || !!opties.overrule,
        overrule_reden: opties.overrule ? `Fase "${fase.naam}" gekopieerd boven budget` : item.overrule_reden,
        bron:           'eva',
      })))
      .select('id')
    if (error) {
      await draaiKopieTerug()
      return { ok: false, error: error.message }
    }
    nieuweItemIds = ((data ?? []) as { id: string }[]).map(r => r.id)
  }

  // Afhankelijkheden binnen de fase overnemen.
  if (bronIds.length > 0) {
    const { data: afhankelijkheden } = await supabase
      .from('planning_activiteit_afhankelijkheden')
      .select('van_activiteit_id, naar_activiteit_id, type, vertraging_dagen')
      .in('van_activiteit_id', bronIds)
    const intern = ((afhankelijkheden ?? []) as PlanningAfhankelijkheid[])
      .filter(d => nieuweIdVan.has(d.naar_activiteit_id))
    if (intern.length > 0) {
      // Niet-blokkerend: de kopie staat er al. Een ontbrekende pijl tekent de planner zo
      // opnieuw; hem hiervoor de hele fase laten weggooien is erger dan het gemis.
      const { error } = await supabase.from('planning_activiteit_afhankelijkheden').insert(
        intern.map(d => ({
          van_activiteit_id:  nieuweIdVan.get(d.van_activiteit_id),
          naar_activiteit_id: nieuweIdVan.get(d.naar_activiteit_id),
          type:               d.type,
          vertraging_dagen:   d.vertraging_dagen,
        })),
      )
      if (error) console.error('[planning] afhankelijkheden van fasekopie niet overgenomen:', error.message)
    }
  }

  // Eén voor één naar Bouw7; elke write doet daar meerdere aanroepen en is fail-soft.
  for (const id of nieuweItemIds) await spiegelNaarBouw7(id)

  await naPlanningWijziging()
  revalidatePath(`/aanvragen/${fase.dossier_id}/planning`)
  revalidatePath(`/opdrachten/${fase.dossier_id}/planning`)
  return {
    ok: true,
    fase: nieuweFase as PlanningFase,
    activiteiten: activiteiten.length,
    items: nieuweItemIds.length,
  }
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
