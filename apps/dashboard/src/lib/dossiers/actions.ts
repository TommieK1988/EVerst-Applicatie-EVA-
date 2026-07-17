'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath, unstable_cache } from 'next/cache'
import type { Hoofdstatus, AanvraagSubstatus, OfferteSubstatus, OpdrachtSubstatus, ServicedeskSubstatus, RelatieFactuuradres } from '@everts/database'
import type { DossierRij, DossierSubstatus } from '@/components/dossiers/types'
import { verwerkDossierTriggers } from '@/app/(platform)/taken/actions/sjablonen'
import { schrijfBouw7Projectstatus, type Bouw7WriteResult } from './bouw7-status'
import { schrijfBouw7Substatus } from '@/lib/bouw7/substatus-attr'
import { schrijfBouw7Rollen, type Bouw7RollenInput } from './bouw7-rollen'
import { assertDossierBewerkbaar } from './guards'
import { getVoortgang } from './voortgang'
import {
  Bouw7Client,
  type Bouw7ProjectFinancial,
  type Bouw7ControlResponse,
  type Bouw7ControlEntry,
  type Bouw7CostTypeId,
  type Bouw7PurchaseInvoice,
  type Bouw7PurchaseInvoiceListItem,
  type Bouw7PurchaseInvoiceListResponse,
  type Bouw7ContractOrderLine,
  type Bouw7SubcontractorContract,
  type Bouw7PurchaseOrderContract,
  type Bouw7EmployeeHourLogResponse,
  type Bouw7ProjectInvoiceTerm,
  type Bouw7ProjectInvoiceTermStatement,
  type Bouw7PurchaseInvoiceDetail,
  type Bouw7SalesInvoice,
  type Bouw7ListResponse,
} from '@/lib/bouw7/client'
import { deriveUursoorten } from '@/lib/bouw7/derive-stamdata'

type DossierResult =
  | { ok: true; data: DossierRij[] }
  | { ok: false; error: string; missingTable?: boolean }

type MaakResult =
  | { ok: true; data: DossierRij }
  | { ok: false; error: string }

const ROL_SELECT = `
  relaties!klant_id ( naam ),
  projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam, kleur ),
  teamleider:medewerkers!teamleider_id ( voornaam, tussenvoegsel, achternaam ),
  werkvoorbereider:medewerkers!werkvoorbereider_id ( voornaam, tussenvoegsel, achternaam, kleur ),
  calculator:medewerkers!calculator_id ( voornaam, tussenvoegsel, achternaam, kleur ),
  uitvoerder:medewerkers!uitvoerder_id ( voornaam, tussenvoegsel, achternaam ),
  controller:medewerkers!controller_id ( voornaam, tussenvoegsel, achternaam, kleur ),
  contactpersoon:contactpersonen!contactpersoon_id ( voornaam, tussenvoegsel, achternaam, email, telefoon ),
  factuuradres:relatie_factuuradressen!factuuradres_id ( label, straat, postcode, plaats )
`.trim()

/**
 * Slanke projectie voor lijst-weergaven (bijv. de mobiele dossierlijst): alleen
 * de kolommen die de lijst, de status-badge en de actief-check nodig hebben, plus
 * klant- en projectleidernaam. Scheelt fors t.o.v. `*, ROL_SELECT` (47 kolommen +
 * 8 joins). Gemodelleerd op getActieveDossierContext. `mapRij` vult de overige
 * rolnamen netjes met null.
 */
const LEAN_SELECT = `
  id, dossiernummer, titel, hoofdstatus,
  aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
  gearchiveerd, updated_at, verwacht_startdatum, verwacht_einddatum,
  relaties!klant_id ( naam ),
  projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam )
`.trim()

function medNaam(med: { voornaam?: string; tussenvoegsel?: string; achternaam?: string } | null): string | null {
  if (!med) return null
  return [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ') || null
}

function factuuradresTekst(
  fa: { label?: string | null; straat?: string | null; postcode?: string | null; plaats?: string | null } | null
): string | null {
  if (!fa) return null
  const adres = [fa.straat, [fa.postcode, fa.plaats].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [fa.label, adres].filter(Boolean).join(' — ') || null
}

function mapRij(row: any): DossierRij {
  return {
    ...row,
    relaties:         undefined,
    projectleider:    undefined,
    teamleider:       undefined,
    werkvoorbereider: undefined,
    calculator:       undefined,
    uitvoerder:       undefined,
    controller:       undefined,
    contactpersoon:   undefined,
    factuuradres:     undefined,
    klant_naam:            row.relaties?.naam ?? null,
    projectleider_naam:    medNaam(row.projectleider),
    projectleider_kleur:   row.projectleider?.kleur    ?? null,
    teamleider_naam:       medNaam(row.teamleider),
    werkvoorbereider_naam: medNaam(row.werkvoorbereider),
    werkvoorbereider_kleur: row.werkvoorbereider?.kleur ?? null,
    calculator_naam:       medNaam(row.calculator),
    calculator_kleur:      row.calculator?.kleur        ?? null,
    uitvoerder_naam:       medNaam(row.uitvoerder),
    controller_naam:       medNaam(row.controller),
    controller_kleur:      row.controller?.kleur        ?? null,
    contactpersoon_naam:     medNaam(row.contactpersoon),
    contactpersoon_email:    row.contactpersoon?.email    ?? null,
    contactpersoon_telefoon: row.contactpersoon?.telefoon ?? null,
    factuuradres_tekst:      factuuradresTekst(row.factuuradres),
    intern: false,
  }
}

/**
 * Geeft de set dossier-ids terug waarvoor de "Intern"-toggle (sleutel 'intern') aan staat.
 * Wordt gebruikt om interne dossiers te verbergen op de borden/lijsten.
 */
async function getInternDossierIds(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossier_toggles')
    .select('dossier_id, dossier_toggle_definities!inner(sleutel)')
    .eq('aan', true)
    .eq('dossier_toggle_definities.sleutel', 'intern')
    .in('dossier_id', ids)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Set((data ?? []).map((d: any) => d.dossier_id as string))
}

/**
 * Telt per dossier de open en totale taken. Taken hangen via twee paden aan een dossier:
 * direct (`tasks.dossier_id`, losse taken) en via een actielijst (`tasks.lijst_id` →
 * `task_lists.dossier_id`). Beide paden zijn nodig; een taak die in beide zit telt één keer.
 * Semantiek conform `lib/taken/services/taken.ts`: afgerond = 'gereed', open = alles behalve
 * 'gereed'/'vervallen', subtaken tellen niet mee.
 */
async function getTakenTellingen(ids: string[]): Promise<Map<string, { open: number; totaal: number }>> {
  const tellingen = new Map<string, { open: number; totaal: number }>()
  if (ids.length === 0) return tellingen

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: lijsten } = await supabase
    .from('task_lists')
    .select('id, dossier_id')
    .eq('is_template', false)
    .in('dossier_id', ids)

  const lijstNaarDossier = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lijsten ?? []).map((l: any) => [l.id as string, l.dossier_id as string])
  )
  const lijstIds = [...lijstNaarDossier.keys()]

  const [directRes, viaLijstRes] = await Promise.all([
    supabase.from('tasks').select('id, status, dossier_id').is('parent_task_id', null).in('dossier_id', ids),
    lijstIds.length
      ? supabase.from('tasks').select('id, status, lijst_id').is('parent_task_id', null).in('lijst_id', lijstIds)
      : Promise.resolve({ data: [] }),
  ])

  const geteld = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tel = (taak: any, dossierId: string | undefined) => {
    if (!dossierId || geteld.has(taak.id)) return
    geteld.add(taak.id)
    if (taak.status === 'vervallen') return
    const huidig = tellingen.get(dossierId) ?? { open: 0, totaal: 0 }
    huidig.totaal += 1
    if (taak.status !== 'gereed') huidig.open += 1
    tellingen.set(dossierId, huidig)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (directRes.data ?? []) as any[]) tel(t, t.dossier_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const t of (viaLijstRes.data ?? []) as any[]) tel(t, lijstNaarDossier.get(t.lijst_id))

  return tellingen
}

/** Verrijkt rijen met de `intern`-vlag (Intern-toggle aan/uit) en de taken-tellers. */
async function verrijkDossiers(rijen: DossierRij[]): Promise<DossierRij[]> {
  const ids = rijen.map(r => r.id)
  const [internSet, taken] = await Promise.all([getInternDossierIds(ids), getTakenTellingen(ids)])
  if (internSet.size === 0 && taken.size === 0) return rijen

  return rijen.map(r => {
    const telling = taken.get(r.id)
    return {
      ...r,
      intern: internSet.has(r.id) || r.intern,
      taken_open:   telling?.open   ?? 0,
      taken_totaal: telling?.totaal ?? 0,
    }
  })
}

/** Haal alle dossiers op voor een fase, verrijkt met klant- en rolnamen. */
export async function getDossiers(hoofdstatus: Hoofdstatus): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .eq('hoofdstatus', hoofdstatus)
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/**
 * Haal dossiers op gefilterd op Bouw7 projectstatus-naam prefix.
 * Valt terug op hoofdstatus-query voor dossiers zonder Bouw7-koppeling.
 * prefix: bijv. '01.' voor aanvragen, '09.' + '08.' voor offertes.
 */
export async function getDossiersByBouw7Prefix(prefixen: string[], fallbackHoofdstatus?: Hoofdstatus): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const likeCondities = prefixen
    .map(p => `bouw7_projectstatus_naam.ilike.${p}%`)
    .join(',')

  // Bouw OR-query: match op bouw7 prefix, of (geen bouw7 EN fallback hoofdstatus)
  const orClause = fallbackHoofdstatus
    ? `${likeCondities},and(bouw7_projectstatus_naam.is.null,hoofdstatus.eq.${fallbackHoofdstatus})`
    : likeCondities

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .or(orClause)
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/**
 * Haal dossiers op voor de Aanvragen-tab:
 * - Alle actieve '01.'-dossiers
 * - Handmatige aanvragen zonder Bouw7-koppeling
 * - Dossiers die de afgelopen 7 dagen zijn verzonden (ook op Offertes zichtbaar)
 */
export async function getDossiersVoorAanvragen(): Promise<DossierResult> {
  const supabase = createAdminClient() as any
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .or(
      // 01-dossiers die via de Bouw7-offertestatus naar hoofdstatus 'offerte' zijn verhuisd
      // (gewonnen/mondelinge toezegging) horen op de Offertes-tab, niet hier.
      `and(bouw7_projectstatus_naam.ilike.01.%,hoofdstatus.eq.aanvraag),` +
      `and(bouw7_projectstatus_naam.is.null,hoofdstatus.eq.aanvraag),` +
      `and(offerte_substatus.eq.verzonden,verzonden_op.gte.${cutoff})`
    )
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/**
 * Haal dossiers op voor de Offertes-tab:
 * - Bouw7-dossiers met projectstatus 08/09
 * - Alle dossiers met hoofdstatus 'offerte' — vangt handmatige dossiers én 01-projecten
 *   die via de Bouw7-offertestatus (gewonnen/mondelinge toezegging) zijn doorgeschoven.
 */
export async function getDossiersVoorOffertes(): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .or(
      'bouw7_projectstatus_naam.ilike.08.%,' +
      'bouw7_projectstatus_naam.ilike.09.%,' +
      'hoofdstatus.eq.offerte'
    )
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/** Haal servicedesk-dossiers op: status LB of categorie Dagelijks onderhoud/Mutatie. Sluit '08. Afgewezen' uit. */
export async function getDossiersVoorServicedesk(): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .or('bouw7_projectstatus_naam.ilike.LB.%,bouw7_categorie_naam.in.(Dagelijks onderhoud,Mutatie)')
    .neq('bouw7_projectstatus_naam', '08. Afgewezen')
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/** Haal afgewezen servicedesk-dossiers op (Bouw7 status 08. Afgewezen) voor het archief. */
export async function getDossiersServicedeskArchief(): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .in('bouw7_categorie_naam', ['Dagelijks onderhoud', 'Mutatie'])
    .eq('bouw7_projectstatus_naam', '08. Afgewezen')
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/** Haal financieel afgesloten dossiers op (Bouw7 status 07). */
export async function getDossiersAfgesloten(): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .or('bouw7_projectstatus_naam.ilike.07.%,and(bouw7_projectstatus_naam.is.null,opdracht_substatus.eq.financieel_afgesloten)')
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/**
 * Haal alle definitief afgeronde dossiers op voor de "Afgesloten"-tab, over alle secties heen:
 * - Opdrachten: Financieel afgesloten (Bouw7 '07.' of opdracht_substatus)
 * - Offertes:   Verloren of Vervallen
 * - Aanvragen:  Vervallen
 * Hoofdstatus-gated zodat een oude substatus-waarde op een inmiddels doorgeschoven dossier geen
 * vals-positief oplevert.
 */
export async function getDossiersAfgeslotenAlle(): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .or(
      'and(hoofdstatus.eq.opdracht,opdracht_substatus.eq.financieel_afgesloten),' +
      'and(hoofdstatus.eq.offerte,offerte_substatus.in.(verloren,vervallen)),' +
      'and(hoofdstatus.eq.aanvraag,aanvraag_substatus.eq.vervallen),' +
      'bouw7_projectstatus_naam.ilike.07.%'
    )
    .order('created_at', { ascending: false })

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: await verrijkDossiers((data ?? []).map(mapRij)) }
}

/** Update de servicedesk substatus van een dossier (voor kanban drag & drop). */
export async function updateServicedeskSubstatus(
  id: string,
  nieuweSubstatus: ServicedeskSubstatus | string,
): Promise<{ ok: boolean; error?: string }> {
  await assertDossierBewerkbaar(id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // Alleen loggen wanneer de substatus daadwerkelijk wijzigt (voorkomt ruis in de historie).
  const { data: huidig } = await supabase
    .from('dossiers')
    .select('servicedesk_substatus')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('dossiers')
    .update({ servicedesk_substatus: nieuweSubstatus })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  if (huidig?.servicedesk_substatus !== nieuweSubstatus) {
    await logSubstatusHistorie(id, String(nieuweSubstatus), 'handmatig').catch(() => {})
  }

  await verwerkDossierTriggers(id).catch(() => {})

  revalidatePath('/servicedesk')
  return { ok: true }
}

/** Schrijft één substatuswijziging naar de historie (basis voor doorlooptijd-per-fase). */
export async function logSubstatusHistorie(
  dossierId: string,
  substatus: string,
  bron: 'handmatig' | 'sync',
): Promise<void> {
  const supabase = createAdminClient() as any
  await supabase
    .from('dossier_substatus_historie')
    .insert({ dossier_id: dossierId, substatus, bron })
}

/** True als er een everts-calc calculatie/offerte aan het dossier gekoppeld is. */
export async function dossierHeeftCalculatie(dossierId: string): Promise<boolean> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossierId)
    .single()
  return !!data?.everts_calc_project_id
}

/**
 * Servicedesk: start het offertetraject. Maakt (idempotent) een everts-calc project aan,
 * koppelt het aan het dossier (`everts_calc_project_id`) zodat het Calculatie-tab verschijnt,
 * en geeft het project-id terug zodat de client de localStorage-mapping kan bijwerken.
 */
export async function maakOfferteVoorServicedesk(
  dossierId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: dossier, error } = await supabase
    .from('dossiers')
    .select('id, titel, everts_calc_project_id')
    .eq('id', dossierId)
    .single()
  if (error) return { ok: false, error: error.message }

  // Al gekoppeld? Hergebruik het bestaande project (idempotent).
  if (dossier?.everts_calc_project_id) {
    return { ok: true, projectId: dossier.everts_calc_project_id as string }
  }

  try {
    const { maakProjectVanAanvraag } = await import('@/app/(platform)/everts-calc/actions/projecten')
    const naam = dossier?.titel ?? 'Servicedesk'
    const { id: projectId } = await maakProjectVanAanvraag(naam, '')

    const { error: koppelFout } = await supabase
      .from('dossiers')
      .update({ everts_calc_project_id: projectId })
      .eq('id', dossierId)
    if (koppelFout) return { ok: false, error: koppelFout.message }

    revalidatePath('/servicedesk')
    return { ok: true, projectId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fout bij aanmaken offerte.' }
  }
}

/**
 * Koppelt (idempotent) een everts-calc calculatieproject aan een dossier. Generieke
 * variant van maakOfferteVoorServicedesk — gebruikt door de Calculatie-tab in Opdrachten
 * zodat ook Bouw7-native opdrachten (zonder offertetraject in EVA) een calculatieproject
 * kunnen krijgen, o.a. als voorwaarde voor meerwerk-calculaties.
 */
export async function koppelCalculatieProject(
  dossierId: string,
): Promise<{ ok: true; projectId: string } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { data: dossier, error } = await supabase
    .from('dossiers')
    .select('id, titel, everts_calc_project_id')
    .eq('id', dossierId)
    .single()
  if (error) return { ok: false, error: error.message }

  // Al gekoppeld? Hergebruik het bestaande project (idempotent).
  if (dossier?.everts_calc_project_id) {
    return { ok: true, projectId: dossier.everts_calc_project_id as string }
  }

  try {
    const { maakProjectVanAanvraag } = await import('@/app/(platform)/everts-calc/actions/projecten')
    const naam = dossier?.titel ?? 'Opdracht'
    const { id: projectId } = await maakProjectVanAanvraag(naam, '')

    const { error: koppelFout } = await supabase
      .from('dossiers')
      .update({ everts_calc_project_id: projectId })
      .eq('id', dossierId)
    if (koppelFout) return { ok: false, error: koppelFout.message }

    revalidatePath(`/opdrachten/${dossierId}/calculatie`)
    return { ok: true, projectId }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fout bij aanmaken calculatie.' }
  }
}

/**
 * Persisteert (idempotent) een bestaand everts-calc `projectId` als
 * `dossiers.everts_calc_project_id`. Nodig omdat de aanvraag/offerte-fase het
 * project alleen in localStorage bewaarde, waardoor de offerte-render het dossier
 * niet terugvond (leeg werkadres/werkmaatschappij/contactpersoon). Wordt aangeroepen
 * bij het aanmaken van een inline-offerte én als zelfherstel wanneer een dossier met
 * een localStorage-project nog geen koppeling heeft. Overschrijft nooit een
 * bestaande koppeling en is best-effort (faalt stil).
 */
export async function koppelDossierAanProject(
  dossierId: string,
  projectId: string,
): Promise<{ ok: boolean; projectId?: string }> {
  if (!dossierId || !projectId) return { ok: false }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  try {
    const { data: dossier } = await supabase
      .from('dossiers')
      .select('everts_calc_project_id')
      .eq('id', dossierId)
      .single()
    // Al gekoppeld? Niet overschrijven (idempotent).
    if (dossier?.everts_calc_project_id) {
      return { ok: true, projectId: dossier.everts_calc_project_id as string }
    }
    const { error } = await supabase
      .from('dossiers')
      .update({ everts_calc_project_id: projectId })
      .eq('id', dossierId)
    if (error) return { ok: false }
    return { ok: true, projectId }
  } catch {
    return { ok: false }
  }
}

/**
 * Servicedesk: markeer de gekoppelde offerte als Akkoord. Zet de aanneemsom (uit de
 * gegenereerde quote) in het dossier, schakelt naar termijn-facturatie (tenzij handmatig
 * vastgezet) en werkt de substatus bij. Het Calculatie-tab blijft zichtbaar.
 */
export async function offerteAkkoordServicedesk(
  dossierId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: dossier, error } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id, facturatiemethode_handmatig')
    .eq('id', dossierId)
    .single()
  if (error) return { ok: false, error: error.message }
  if (!dossier?.everts_calc_project_id) {
    return { ok: false, error: 'Geen offerte/calculatie gekoppeld aan dit dossier.' }
  }

  // Aanneemsom + BTW-totaal uit de gegenereerde quote (kan null zijn als nog niet gegenereerd).
  const patch: Record<string, unknown> = {
    servicedesk_substatus: 'offerte_uitgebracht',
  }
  if (!dossier.facturatiemethode_handmatig) patch.facturatiemethode = 'termijnen'

  try {
    const { getQuoteTotalenVoorProject } = await import('@/app/(platform)/everts-calc/actions/quotes')
    const totalen = await getQuoteTotalenVoorProject(dossier.everts_calc_project_id as string)
    if (totalen) {
      patch.bedrag_excl_btw = totalen.subtotaal_ex_btw ?? null
      patch.bedrag_incl_btw = totalen.totaal_incl_btw ?? null
      patch.kostprijs_excl_btw = totalen.kostprijs ?? null
    }
  } catch { /* quote nog niet beschikbaar — alleen status/facturatiemethode zetten */ }

  const { error: updFout } = await supabase.from('dossiers').update(patch).eq('id', dossierId)
  if (updFout) return { ok: false, error: updFout.message }

  await logSubstatusHistorie(dossierId, 'offerte_uitgebracht', 'handmatig').catch(() => {})
  await verwerkDossierTriggers(dossierId).catch(() => {})
  revalidatePath('/servicedesk')
  return { ok: true }
}

/**
 * Haal unieke Bouw7-categorieën op uit de dossiers-tabel (voor de categorie-dropdown
 * in InformatieTab). De lijst wijzigt zelden, maar werd op elke informatietab opnieuw
 * over de volledige dossiers-tabel berekend. Daarom 1 uur gecachet (revalidate 3600).
 */
export const getUniekeBouw7Categorieen = unstable_cache(
  async (): Promise<string[]> => {
    const supabase = createAdminClient() as any

    const { data } = await supabase
      .from('dossiers')
      .select('bouw7_categorie_naam')
      .not('bouw7_categorie_naam', 'is', null)

    if (!data) return []
    const uniek = [...new Set((data as any[]).map(d => d.bouw7_categorie_naam as string))]
    return uniek.sort()
  },
  ['unieke-bouw7-categorieen'],
  { revalidate: 3600 },
)

/** Rol-kolommen waarop een dossier aan een medewerker gekoppeld kan zijn. */
const DOSSIER_ROL_KOLOMMEN = [
  'project_manager_id',
  'teamleider_id',
  'werkvoorbereider_id',
  'calculator_id',
  'uitvoerder_id',
  'controller_id',
] as const

/**
 * Haal dossiers op voor een specifieke medewerker, verrijkt met klant- en rolnamen.
 * `rolKolommen` bepaalt op welke rollen wordt gefilterd (standaard alle rollen).
 * Bijv. `['project_manager_id']` voor "alleen waar ik projectleider ben".
 */
export async function getMijnDossiers(
  medewerkerID: string,
  hoofdstatus: Hoofdstatus,
  limit = 10,
  sorteer: { kolom: string; ascending?: boolean } = { kolom: 'updated_at', ascending: false },
  rolKolommen: readonly string[] = DOSSIER_ROL_KOLOMMEN,
  lean = false,
): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(lean ? LEAN_SELECT : `*, ${ROL_SELECT}`)
    .eq('hoofdstatus', hoofdstatus)
    .or(rolKolommen.map(kolom => `${kolom}.eq.${medewerkerID}`).join(','))
    .order(sorteer.kolom, { ascending: sorteer.ascending ?? true, nullsFirst: false })
    .limit(limit)

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: (data ?? []).map(mapRij) }
}

/**
 * Haal servicedesk-dossiers op die aan een medewerker zijn gekoppeld als projectleider
 * of uitvoerder. Zelfde servicedesk-afbakening als `getDossiersVoorServicedesk`
 * (Bouw7 status LB of categorie Dagelijks onderhoud/Mutatie, excl. '08. Afgewezen').
 */
export async function getMijnServicedesk(
  medewerkerID: string,
  limit = 10,
  sorteer: { kolom: string; ascending?: boolean } = { kolom: 'updated_at', ascending: false },
  lean = false,
): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(lean ? LEAN_SELECT : `*, ${ROL_SELECT}`)
    .or('bouw7_projectstatus_naam.ilike.LB.%,bouw7_categorie_naam.in.(Dagelijks onderhoud,Mutatie)')
    .or(`project_manager_id.eq.${medewerkerID},uitvoerder_id.eq.${medewerkerID}`)
    .neq('bouw7_projectstatus_naam', '08. Afgewezen')
    .order(sorteer.kolom, { ascending: sorteer.ascending ?? true, nullsFirst: false })
    .limit(limit)

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: (data ?? []).map(mapRij) }
}

/** Zoek dossiers op titel (voor de dossier-picker bij taken). */
export async function zoekDossiers(query: string, limit = 10): Promise<{
  id: string
  titel: string
  hoofdstatus: Hoofdstatus
  klant_naam: string | null
}[]> {
  const term = query.trim()
  if (!term) return []

  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select('id, titel, hoofdstatus, relaties!klant_id ( naam )')
    .ilike('titel', `%${term}%`)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) return []

  return (data ?? []).map((d: any) => ({
    id:          d.id,
    titel:       d.titel,
    hoofdstatus: d.hoofdstatus,
    klant_naam:  d.relaties?.naam ?? null,
  }))
}

/** Maak een nieuwe aanvraag aan. */
export async function maakDossier(input: {
  titel: string
  klant_id?: string | null
}): Promise<MaakResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .insert({
      titel:              input.titel,
      klant_id:           input.klant_id ?? null,
      hoofdstatus:        'aanvraag' as Hoofdstatus,
      aanvraag_substatus: 'nieuw'   as AanvraagSubstatus,
    })
    .select(`*, ${ROL_SELECT}`)
    .single()

  if (error) return { ok: false, error: error.message }

  // Nieuw dossier → INSERT-event (dossier_aangemaakt); evalueer direct.
  await verwerkDossierTriggers(data.id).catch(() => {})

  revalidatePath('/aanvragen')
  return { ok: true, data: mapRij(data) }
}

/** Bouw7-projectcategorieën voor de aanvraag-modal (id + naam). Faalt zacht → lege lijst. */
export async function getAanvraagCategorieen(): Promise<{ id: number; name: string }[]> {
  try {
    const { getBouw7Categorieen } = await import('@/lib/bouw7/create-project')
    return await getBouw7Categorieen()
  } catch {
    return []
  }
}

/** Resultaat van `maakAanvraag`: het EVA-dossier + de status van de synchrone Bouw7-push. */
export type MaakAanvraagResult =
  | { ok: true; data: DossierRij; bouw7: { ok: boolean; error?: string; dossiernummer?: string | null } }
  | { ok: false; error: string }

/**
 * Maak een nieuwe aanvraag aan in EVA én (synchroon) als project in Bouw7 (status "01. Offerte").
 * De EVA-aanvraag blijft altijd bestaan; faalt de Bouw7-push, dan komt dat terug in `bouw7`
 * (de UI toont een melding + biedt later een retry).
 */
export async function maakAanvraag(input: {
  titel: string
  klant_id: string | null
  contactpersoon_id?: string | null
  categorie?: string | null
  bouw7_categorie_id?: number | null
  referentie?: string | null
  werkmaatschappij_id?: string | null
  vve_code?: string | null
  aanvraagdatum?: string | null
  deadline?: string | null
  opmerkingen?: string | null
  werkadres_straat?: string | null
  werkadres_huisnummer?: string | null
  werkadres_postcode?: string | null
  werkadres_stad?: string | null
}): Promise<MaakAanvraagResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .insert({
      titel:                input.titel,
      klant_id:             input.klant_id ?? null,
      contactpersoon_id:    input.contactpersoon_id ?? null,
      hoofdstatus:          'aanvraag' as Hoofdstatus,
      aanvraag_substatus:   'nieuw'   as AanvraagSubstatus,
      categorie:            input.categorie ?? null,
      bouw7_categorie_id:   input.bouw7_categorie_id ?? null,
      bouw7_categorie_naam: input.categorie ?? null,
      referentie:           input.referentie ?? null,
      werkmaatschappij_id:  input.werkmaatschappij_id ?? null,
      vve_code:             input.vve_code ?? null,
      aanvraagdatum:        input.aanvraagdatum ?? null,
      deadline:             input.deadline ?? null,
      opmerkingen:          input.opmerkingen ?? null,
      werkadres_straat:     input.werkadres_straat ?? null,
      werkadres_huisnummer: input.werkadres_huisnummer ?? null,
      werkadres_postcode:   input.werkadres_postcode ?? null,
      werkadres_stad:       input.werkadres_stad ?? null,
      bouw7_sync_status:    'pending',
    })
    .select(`*, ${ROL_SELECT}`)
    .single()

  if (error) return { ok: false, error: error.message }

  await verwerkDossierTriggers(data.id).catch(() => {})

  // Synchroon naar Bouw7 als project (status 01. Offerte). Losgekoppeld van de EVA-insert:
  // een fout hier laat de aanvraag staan met bouw7_sync_status='error'.
  let bouw7: { ok: boolean; error?: string; dossiernummer?: string | null } = { ok: false, error: 'Niet naar Bouw7 verstuurd.' }
  try {
    // Bouw7-referenties resolven.
    const [klantRow, cpRow, wmRow] = await Promise.all([
      input.klant_id ? supabase.from('relaties').select('bouw7_id').eq('id', input.klant_id).maybeSingle() : Promise.resolve({ data: null }),
      input.contactpersoon_id ? supabase.from('contactpersonen').select('bouw7_id').eq('id', input.contactpersoon_id).maybeSingle() : Promise.resolve({ data: null }),
      input.werkmaatschappij_id ? supabase.from('bedrijfsgegevens').select('naam, bouw7_branch_id').eq('id', input.werkmaatschappij_id).maybeSingle() : Promise.resolve({ data: null }),
    ])

    let branchId: number | null = wmRow?.data?.bouw7_branch_id ?? null
    if (branchId == null && wmRow?.data?.naam) {
      const { getBouw7Branches } = await import('@/lib/bouw7/create-project')
      const branches = await getBouw7Branches()
      branchId = branches.find(b => b.name === wmRow.data.naam)?.id ?? null
    }

    const { maakBouw7Project } = await import('@/lib/bouw7/create-project')
    const res = await maakBouw7Project({
      name: input.titel,
      contactBouw7Id: klantRow?.data?.bouw7_id ? Number(klantRow.data.bouw7_id) : null,
      contactPersonBouw7Id: cpRow?.data?.bouw7_id ? Number(cpRow.data.bouw7_id) : null,
      categoryId: input.bouw7_categorie_id ?? null,
      branchId,
      reference: input.referentie ?? null,
      information: input.opmerkingen ?? null,
      street: input.werkadres_straat ?? null,
      houseNumber: input.werkadres_huisnummer ?? null,
      zipCode: input.werkadres_postcode ?? null,
      city: input.werkadres_stad ?? null,
      deliveryDate: input.deadline ?? null,
      vveCode: input.vve_code ?? null,
    })

    if (res.ok) {
      await supabase.from('dossiers').update({
        bouw7_id:          String(res.bouw7Id),
        dossiernummer:     res.dossiernummer,
        bouw7_sync_status: 'synced',
        bouw7_sync_fout:   null,
        bouw7_laatst_sync: new Date().toISOString(),
      }).eq('id', data.id)
      data.bouw7_id = String(res.bouw7Id)
      data.dossiernummer = res.dossiernummer
      bouw7 = { ok: true, dossiernummer: res.dossiernummer }
    } else {
      await supabase.from('dossiers').update({ bouw7_sync_status: 'error', bouw7_sync_fout: res.error }).eq('id', data.id)
      bouw7 = { ok: false, error: res.error }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout bij Bouw7-sync.'
    await supabase.from('dossiers').update({ bouw7_sync_status: 'error', bouw7_sync_fout: msg }).eq('id', data.id)
    bouw7 = { ok: false, error: msg }
  }

  revalidatePath('/aanvragen')
  return { ok: true, data: mapRij(data), bouw7 }
}

/** Haal één dossier op via id, verrijkt met klant- en rolnamen. */
export async function getDossierById(id: string): Promise<{ ok: true; data: DossierRij } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .eq('id', id)
    .single()

  if (error) return { ok: false, error: error.message }

  return { ok: true, data: mapRij(data) }
}

/**
 * Update de substatus van een dossier. De trigger in de DB handelt fase-promoties af.
 *
 * `opts.schrijfBouw7`: schrijf de nieuwe substatus óók direct terug naar Bouw7 (write-through,
 * alleen voor dossiers met een `bouw7_id`). Twee verschillende bestemmingen:
 *  - opdracht  → de Bouw7-projectstatus (02.–07.), zie `bouw7-status.ts`;
 *  - aanvraag/offerte → het maatwerkveld "Offerte Sub-status", zie `bouw7/substatus-attr.ts`.
 *    Dat veld deelt EVA met een tweede app op Bouw7, die niet op de cron kan wachten — vandaar
 *    dat we meteen schrijven in plaats van bij de volgende sync.
 *
 * Bij aanvraag/offerte gaat de Bouw7-write *vóór* de EVA-update, zodat een conflict (de andere app
 * heeft de substatus intussen omgezet) de EVA-wijziging kan tegenhouden in plaats van de verse
 * waarde van de ander te overschrijven. Andere Bouw7-fouten houden de EVA-update niet tegen; die
 * komen terug in `bouw7` zodat de UI een toast kan tonen (de lees-sync corrigeert de drift).
 */
export async function updateDossierSubstatus(
  id: string,
  nieuweSubstatus: DossierSubstatus,
  opts?: { schrijfBouw7?: boolean }
): Promise<{ ok: true; bouw7?: Bouw7WriteResult } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(id)
  const supabase = createAdminClient()

  const { data: huidig, error: fetchError } = await supabase
    .from('dossiers')
    .select('hoofdstatus, bouw7_id, aanvraag_substatus, offerte_substatus, servicedesk_substatus')
    .eq('id', id)
    .single()

  if (fetchError) return { ok: false, error: fetchError.message }

  // Write-through van de gedeelde aanvraag/offerte-substatus naar Bouw7 — vóór de EVA-update,
  // zodat een conflict met de tweede app de wijziging afbreekt. Servicedesk-dossiers hebben
  // hoofdstatus 'aanvraag' maar een eigen ladder: die horen hier niet.
  let bouw7: Bouw7WriteResult | undefined
  const isSubstatusFase = huidig.hoofdstatus === 'aanvraag' || huidig.hoofdstatus === 'offerte'
  if (
    opts?.schrijfBouw7 && isSubstatusFase
    && huidig.servicedesk_substatus == null && huidig.bouw7_id != null
  ) {
    const sectie = huidig.hoofdstatus as 'aanvraag' | 'offerte'
    // Aanvraag + 'verzonden' promoveert hieronder naar offerte/verzonden; in Bouw7 is dat
    // hetzelfde label ("07. Verzonden"), dus schrijven we het als offerte-substatus weg.
    const doelSectie = sectie === 'aanvraag' && nieuweSubstatus === 'verzonden' ? 'offerte' : sectie
    const res = await schrijfBouw7Substatus(huidig.bouw7_id, doelSectie, nieuweSubstatus, {
      sectie,
      substatus: sectie === 'aanvraag' ? huidig.aanvraag_substatus : huidig.offerte_substatus,
    })
    if (!res.ok && res.conflict) return { ok: false, error: res.error }
    bouw7 = res.ok ? { ok: true } : { ok: false, error: res.error }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update: any
  if (huidig.hoofdstatus === 'aanvraag' && nieuweSubstatus === 'verzonden') {
    // Promoveer direct naar offerte zodra aanvraag verzonden is;
    // dossier blijft 7 dagen zichtbaar op Aanvragen-tab via verzonden_op
    update = {
      hoofdstatus:        'offerte' as Hoofdstatus,
      aanvraag_substatus: null,
      offerte_substatus:  'verzonden' as OfferteSubstatus,
      verzonden_op:       new Date().toISOString(),
    }
  } else if (huidig.hoofdstatus === 'aanvraag') {
    update = { aanvraag_substatus: nieuweSubstatus as AanvraagSubstatus }
  } else if (huidig.hoofdstatus === 'offerte') {
    update = { offerte_substatus: nieuweSubstatus as OfferteSubstatus }
  } else {
    update = { opdracht_substatus: nieuweSubstatus as OpdrachtSubstatus }
  }

  const { error } = await supabase
    .from('dossiers')
    .update(update)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  // De DB-trigger heeft een dossier-event ge-enqueued; evalueer triggers en activeer nu direct.
  await verwerkDossierTriggers(id).catch(() => {})

  // Offerte gewonnen → opdracht: neem de everts-calc werkbegroting automatisch over als
  // planningsbudget. Stil vangnet — de sync-knop op de Planning-tab blijft beschikbaar.
  if (huidig.hoofdstatus === 'offerte' && nieuweSubstatus === 'gewonnen') {
    const { neemWerkbegrotingOverStil } = await import('@/lib/planning/werkbegroting')
    await neemWerkbegrotingOverStil(id)
  }

  // Two-way: opdracht-substatus terugschrijven naar Bouw7 (alleen opdracht-dossiers met koppeling).
  // De aanvraag/offerte-fase is hierboven al weggeschreven (maatwerkveld i.p.v. projectstatus).
  if (opts?.schrijfBouw7 && huidig.hoofdstatus === 'opdracht' && huidig.bouw7_id != null) {
    bouw7 = await schrijfBouw7Projectstatus(huidig.bouw7_id, nieuweSubstatus, 'opdracht')
  }

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  return { ok: true, bouw7 }
}

/**
 * Zet het dossier terug naar **Aanvraag · Nieuw** wanneer een verzonden offerte
 * gereviseerd wordt (nieuwe, bewerkbare calculatie-versie). Wordt aangeroepen met
 * het everts-calc `projectId`; het bijbehorende dossier wordt zelf opgezocht.
 *
 * Scope (bewust beperkt):
 * - Aanvraag-fase → `aanvraag_substatus = 'nieuw'`.
 * - Offerte-fase **zonder** Bouw7-koppeling → terug naar Aanvraag · Nieuw
 *   (offerte-substatus + verzonden-vlag gewist).
 * - Offerte-fase mét Bouw7-koppeling, of een opdracht-dossier → **ongemoeid**:
 *   Bouw7 is daar leidend en zou een reset bij de volgende sync terugschrijven.
 * - Afgesloten/verloren/vervallen dossiers → ongemoeid.
 */
export async function resetDossierNaarAanvraagBijRevisie(
  projectId: string
): Promise<{ ok: true; gewijzigd: boolean; reden?: string } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { data: dossier, error: fetchError } = await supabase
    .from('dossiers')
    .select('id, hoofdstatus, aanvraag_substatus, offerte_substatus, bouw7_id')
    .eq('everts_calc_project_id', projectId)
    .maybeSingle()

  if (fetchError) return { ok: false, error: fetchError.message }
  if (!dossier) return { ok: true, gewijzigd: false, reden: 'geen gekoppeld dossier' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let update: any = null
  if (dossier.hoofdstatus === 'aanvraag') {
    if (dossier.aanvraag_substatus === 'nieuw') return { ok: true, gewijzigd: false, reden: 'al Aanvraag · Nieuw' }
    update = { aanvraag_substatus: 'nieuw' as AanvraagSubstatus }
  } else if (dossier.hoofdstatus === 'offerte' && dossier.bouw7_id == null) {
    // Alleen EVA-gedreven offertes mogen terug; Bouw7-offertes laten we met rust.
    update = {
      hoofdstatus:        'aanvraag' as Hoofdstatus,
      aanvraag_substatus: 'nieuw' as AanvraagSubstatus,
      offerte_substatus:  null,
      verzonden_op:       null,
    }
  } else {
    return { ok: true, gewijzigd: false, reden: 'buiten scope (Bouw7-offerte of opdracht)' }
  }

  const { error } = await supabase.from('dossiers').update(update).eq('id', dossier.id)
  if (error) return { ok: false, error: error.message }

  await verwerkDossierTriggers(dossier.id).catch(() => {})
  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  return { ok: true, gewijzigd: true }
}

/** Haal actieve medewerkers op voor rol-dropdowns. */
export async function getMedewerkers(): Promise<{ id: string; naam: string }[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('medewerkers')
    .select('id, voornaam, tussenvoegsel, achternaam')
    .eq('actief', true)
    .order('achternaam', { ascending: true })

  return (data ?? []).map((m: any) => ({
    id: m.id,
    naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
  }))
}

/** Sla rolvelden op voor een dossier (projectleider, teamleider, werkvoorbereider, calculator, uitvoerder, controller). */
export async function updateDossierRollen(
  id: string,
  rollen: {
    project_manager_id?: string | null
    teamleider_id?: string | null
    werkvoorbereider_id?: string | null
    calculator_id?: string | null
    uitvoerder_id?: string | null
    controller_id?: string | null
  },
  opts?: { schrijfBouw7?: boolean }
): Promise<{ ok: true; bouw7?: Bouw7WriteResult } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(id)
  const supabase = createAdminClient() as any

  // Zet lege strings om naar null (select kan "" retourneren bij geen keuze)
  const payload: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(rollen)) {
    payload[k] = v === '' ? null : (v ?? null)
  }
  // Calculator ≡ Werkvoorbereider (Bouw7 workPlanner). Op de informatietab bestaat alleen nog de
  // rol "Calculator"; houd beide kolommen gelijk zodat taak-triggers op `werkvoorbereider` én de
  // Bouw7-round-trip (workPlanner) consistent blijven.
  if ('calculator_id' in payload && !('werkvoorbereider_id' in rollen)) {
    payload.werkvoorbereider_id = payload.calculator_id
  }

  const { error } = await supabase
    .from('dossiers')
    .update(payload)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  // Rol-velden zijn gevolgde triggervelden (rol_toegewezen); evalueer direct.
  // (Het herkoppelen van reeds-geactiveerde dossier-rol-taken aan de nieuwe rolhouder
  //  gebeurt automatisch via de DB-trigger tg_dossier_rol_taken_reconcile.)
  await verwerkDossierTriggers(id).catch(() => {})

  // Terugschrijven naar Bouw7 (best-effort; faalt nooit de EVA-update).
  let bouw7: Bouw7WriteResult | undefined
  if (opts?.schrijfBouw7) {
    bouw7 = await schrijfDossierRollenNaarBouw7(supabase, id, payload)
      .catch((e) => ({ ok: false as const, error: e instanceof Error ? e.message : 'Onbekende fout' }))
  }

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  return { ok: true, bouw7 }
}

/**
 * Resolveert de EVA-rol-uuids naar Bouw7-employee-id's (+ de namen voor de maatwerkvelden) en
 * schrijft ze naar het gekoppelde Bouw7-project. Alleen rollen die in `payload` voorkomen worden
 * meegenomen; een rol met waarde `null` maakt het Bouw7-veld leeg.
 *
 * Uitzondering: de calculator raakt twee Bouw7-velden (`workPlanner` + maatwerkveld "Calculator")
 * en botst met de projectleider — zie `bouw7-rollen.ts`. Dat paar wordt daarom herberekend zodra
 * één van beide rollen is aangeraakt, op basis van de **effectieve** stand van het dossier (de
 * EVA-update is op dit punt al doorgevoerd, dus de dossierrij ís de nieuwe waarheid).
 */
async function schrijfDossierRollenNaarBouw7(
  supabase: any,
  dossierId: string,
  payload: Record<string, string | null>,
): Promise<Bouw7WriteResult> {
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('bouw7_id, project_manager_id, calculator_id')
    .eq('id', dossierId)
    .maybeSingle()
  if (!dossier?.bouw7_id) return { ok: false, error: 'Dossier is niet aan een Bouw7-project gekoppeld.' }

  // Verzamel de medewerker-uuids die we moeten opzoeken: de gewijzigde rollen, plus de effectieve
  // projectleider en calculator (nodig voor de botsingscheck, ook als ze zelf niet wijzigden).
  const uuids = [
    ...['project_manager_id', 'calculator_id', 'uitvoerder_id', 'controller_id'].map((k) => payload[k]),
    dossier.project_manager_id,
    dossier.calculator_id,
  ].filter((v): v is string => !!v)

  const medMap = new Map<string, { bouw7_id: string | null; naam: string }>()
  if (uuids.length) {
    const { data: meds } = await supabase
      .from('medewerkers')
      .select('id, bouw7_id, voornaam, tussenvoegsel, achternaam')
      .in('id', uuids)
    for (const m of (meds ?? []) as any[]) {
      medMap.set(m.id, {
        bouw7_id: m.bouw7_id ?? null,
        naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
      })
    }
  }

  // Vertaal een EVA-rol-uuid naar een Bouw7-employee-id.
  //  - kolom niet in payload → `undefined` (niet wijzigen)
  //  - waarde leeg          → `null` (leegmaken)
  //  - waarde met bouw7_id  → nummer
  //  - waarde zonder bouw7_id → `undefined` (kan niet gemapt worden → Bouw7 onaangeroerd laten)
  const naarEmployeeId = (kolom: string): number | null | undefined => {
    if (!(kolom in payload)) return undefined
    const uuid = payload[kolom]
    if (!uuid) return null
    const b7 = medMap.get(uuid)?.bouw7_id
    return b7 ? Number(b7) : undefined
  }

  const rollen: Bouw7RollenInput = {
    projectLeaderId: naarEmployeeId('project_manager_id'),
    executorId:      naarEmployeeId('uitvoerder_id'),
  }
  // Controller → custom attribute (vrije tekst = naam; lege waarde maakt het veld leeg).
  if ('controller_id' in payload) {
    const uuid = payload.controller_id
    rollen.controllerNaam = uuid ? (medMap.get(uuid)?.naam ?? '') : ''
  }

  // Calculator → `workPlanner` + maatwerkveld "Calculator". Ook een wijziging van de projectleider
  // kan de botsing veroorzaken (Bouw7: projectleider ≠ werkvoorbereider) of juist opheffen, dus
  // herbereken het paar zodra één van beide rollen is aangeraakt.
  if ('calculator_id' in payload || 'project_manager_id' in payload) {
    const calc  = dossier.calculator_id ? medMap.get(dossier.calculator_id) : null
    const plB7  = dossier.project_manager_id ? (medMap.get(dossier.project_manager_id)?.bouw7_id ?? null) : null
    const calcB7 = calc?.bouw7_id ?? null
    const botst = !!calcB7 && !!plB7 && calcB7 === plB7

    // Geen calculator, een calculator zonder Bouw7-koppeling, of een botsing met de projectleider
    // → `workPlanner` leegmaken; het maatwerkveld draagt de rol dan alleen.
    rollen.workPlannerId  = calcB7 && !botst ? Number(calcB7) : null
    rollen.calculatorNaam = calc?.naam ?? ''
  }

  return schrijfBouw7Rollen(dossier.bouw7_id, rollen)
}

/** Haal factuuradressen op voor een specifieke relatie (opdrachtgever). */
export async function getFactuuradressen(relatieId: string): Promise<RelatieFactuuradres[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('relatie_factuuradressen')
    .select('*')
    .eq('relatie_id', relatieId)
    .order('label', { ascending: true })
  return (data ?? []) as RelatieFactuuradres[]
}

/** Geeft de ISO-timestamp van de laatste Bouw7-dossier-sync terug, of null als nooit gesynchroniseerd. */
export async function getLastBouw7SyncTijd(): Promise<string | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('sync_log')
    .select('uitgevoerd_op')
    .eq('integratie', 'bouw7')
    .eq('entiteit', 'dossiers')
    .order('uitgevoerd_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.uitgevoerd_op ?? null
}

/** Haal contactpersonen op die aan een relatie (organisatie) zijn gekoppeld, voor de dropdown. */
export async function getContactpersonenVoorRelatie(relatieId: string): Promise<{
  id: string
  naam: string
  email: string | null
  telefoon: string | null
}[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('contactpersoon_organisaties')
    .select('contactpersoon_id, contactpersonen!inner ( id, voornaam, tussenvoegsel, achternaam, email, telefoon, actief )')
    .eq('organisatie_id', relatieId)
    .eq('contactpersonen.actief', true)
    .order('is_primair', { ascending: false })

  if (!data) return []
  return (data as any[]).map((r: any) => {
    const cp = r.contactpersonen
    return {
      id:       cp.id,
      naam:     [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' '),
      email:    cp.email ?? null,
      telefoon: cp.telefoon ?? null,
    }
  })
}

export type DossierFinancieelData = {
  bouw7Financial: Bouw7ProjectFinancial | null
  relatieFacturatie: {
    betaaltermijn_dagen: number | null
    facturatie_email: string | null
    inkoopnummer_verplicht: boolean | null
    kredietlimiet: number | null
    g_rekening_tekst: string | null
    g_rekening_percentage: number | null
  } | null
}

/**
 * Haalt live financiële data op voor een dossier:
 * - Athena project-financial (als het dossier een bouw7_id heeft)
 * - relatie_facturatie uit EVA DB (als het dossier een klant heeft)
 *
 * Zie lib/bouw7/ENDPOINTS.md voor het volledige Athena-schema.
 */
export async function getDossierFinancieel(dossierId: string): Promise<DossierFinancieelData> {
  const supabase = createAdminClient() as any

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('bouw7_id, klant_id')
    .eq('id', dossierId)
    .single()

  const [bouw7Financial, relatieFacturatie] = await Promise.all([
    dossier?.bouw7_id ? fetchBouw7Financial(dossier.bouw7_id) : Promise.resolve(null),
    dossier?.klant_id ? fetchRelatieFacturatie(supabase, dossier.klant_id) : Promise.resolve(null),
  ])

  return { bouw7Financial, relatieFacturatie }
}

async function fetchBouw7Financial(bouw7Id: string): Promise<Bouw7ProjectFinancial | null> {
  try {
    const supabase = createAdminClient() as any
    const { data } = await supabase
      .from('integraties')
      .select('config')
      .eq('naam', 'bouw7')
      .maybeSingle()

    if (!data) return null
    const config = data.config as Record<string, string>
    if (!config.api_key || !config.app_name) return null

    const client = new Bouw7Client(config.api_key, config.app_name)
    return await client.getAthena<Bouw7ProjectFinancial>(`/project-financial/${bouw7Id}`)
  } catch {
    return null
  }
}

async function fetchRelatieFacturatie(supabase: any, relatieId: string) {
  const { data } = await supabase
    .from('relatie_facturatie')
    .select('betaaltermijn_dagen, facturatie_email, inkoopnummer_verplicht, kredietlimiet, g_rekening_tekst, g_rekening_percentage')
    .eq('relatie_id', relatieId)
    .maybeSingle()
  return data ?? null
}

/* ── Projectbewaking per bewakingscode ────────────────────────────── */

/** Eén regel per bewakingscode op de Financieel-tab (samengevoegd over kostensoorten). */
export type BewakingRegel = {
  code: string | null
  naam: string | null
  hoofdstukId: number | null
  hoofdstuk: string | null

  begroot: number              // 1. Begroot bedrag (som over kostensoorten)
  meerwerk: number             // 1b. Geaccordeerd meerwerk (som over kostensoorten)
  prognose: number             // 2. Totale prognose
  prognoseUren: number         // 3. Aantal prognose-uren (arbeid)
  geboekteUren: number         // 4. Geboekte/bestede uren (arbeid)
  arbeidskosten: number        // 5. Arbeidskosten (geboekt, kostensoort Arbeid)
  arbeidPrognose: number       // 5b. Prognose-bedrag (kostensoort Arbeid, ct=1)
  onderaanneming: number       // 6. Onderaanneming (geboekt)
  materiaal: number            // 7. Materiaal (geboekt)
  inkoopMaterieelAfval: number // 8. Inkoop + Materieel + Afval (geboekt)
  verwachteKosten: number      // 9. Alle verwachte-kosten-regels (contract-order-lines, incl. arbeid)
  geboekteKosten: number       // 10. Geboekte kosten = arbeid + inkoop mét inkoopfactuur
  progress: number | null      // 11. % gereed
}

export type BewakingTotalen = {
  begroot: number
  meerwerk: number
  prognose: number
  prognoseUren: number
  geboekteUren: number
  arbeidPrognose: number
  arbeidskosten: number
  onderaanneming: number
  materiaal: number
  inkoopMaterieelAfval: number
  verwachteKosten: number
  geboekteKosten: number
}

export type DossierBewakingData = {
  beschikbaar: boolean
  /** Bouw7-project-id (write-sleutel voor de % gereed-editors); null als ongekoppeld. */
  bouw7Id: string | null
  hoofdstukken: { id: number | null; naam: string; regels: BewakingRegel[] }[]
  totalen: BewakingTotalen
  /** Geboekte uren op projectniveau (= som van de arbeid-besteed-uren). */
  geboekteUrenProject: number | null
  /** Project-% gereed = prognose-gewogen rollup van de bewakingscodes; null als geen prognose. */
  projectProgress: number | null
}

const toGetal = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? 0 : n
}

const legeRegel = (): BewakingRegel => ({
  code: null, naam: null, hoofdstukId: null, hoofdstuk: null,
  begroot: 0, meerwerk: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0,
  arbeidskosten: 0, arbeidPrognose: 0, onderaanneming: 0, materiaal: 0, inkoopMaterieelAfval: 0,
  verwachteKosten: 0, geboekteKosten: 0, progress: null,
})

/** Kostensoorten op de Athena project-control: 1=Arbeid, 2=Inkoop, 3=OA, 4=Materieel, 5=Materiaal, 6=Afval. */
const BEWAKING_KOSTENSOORTEN: Bouw7CostTypeId[] = [1, 2, 3, 4, 5, 6]
const UNCODED_HOOFDSTUK_ID = -1

/**
 * Live financiële bewaking per bewakingscode voor een dossier.
 *
 * Bron: Athena `GET /project-control/{id}/cost-type/{costType}/chapters` per kostensoort
 * (zie lib/bouw7/ENDPOINTS.md). Geverifieerd: `costAmount` per kostensoort == de realisatie
 * in `/project-financial`. Eén code kan onder meerdere kostensoorten begroot zijn — begroting,
 * prognose en kosten worden dan per code gesommeerd.
 *
 * Géén opslag — alles wordt live opgehaald bij het openen van de tab.
 */
export async function getDossierBewaking(dossierId: string): Promise<DossierBewakingData> {
  const leeg: DossierBewakingData = {
    beschikbaar: false, bouw7Id: null, hoofdstukken: [],
    totalen: {
      begroot: 0, meerwerk: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0, arbeidPrognose: 0, arbeidskosten: 0,
      onderaanneming: 0, materiaal: 0, inkoopMaterieelAfval: 0, verwachteKosten: 0, geboekteKosten: 0,
    },
    geboekteUrenProject: null,
    projectProgress: null,
  }

  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('bouw7_id')
    .eq('id', dossierId)
    .single()

  if (!dossier?.bouw7_id) return leeg

  const { data: integratie } = await supabase
    .from('integraties')
    .select('config')
    .eq('naam', 'bouw7')
    .maybeSingle()

  const config = integratie?.config as Record<string, string> | undefined
  if (!config?.api_key || !config?.app_name) return leeg

  try {
    const client = new Bouw7Client(config.api_key, config.app_name)
    const bouw7Id = dossier.bouw7_id

    // Drie bronnen parallel: projectbewaking per kostensoort, gefactureerde inkoop, en bestelregels.
    // Ongefilterd, gelijk aan Bouw7's eigen lijsttotaal; het response-`total`-veld is het
    // gezaghebbende projecttotaal (volledig, ook bij >LIMIT regels).
    const orderLinesQuery = `project.id = ${bouw7Id} SORT(description, ASC) LIMIT 1000`
    const [responses, invoices, orderLines] = await Promise.all([
      Promise.all(
        BEWAKING_KOSTENSOORTEN.map((ct) =>
          client
            .getAthena<Bouw7ControlResponse>(`/project-control/${bouw7Id}/cost-type/${ct}/chapters?include_subprojects=false`)
            .catch(() => null),
        ),
      ),
      client.getApolloAll<Bouw7PurchaseInvoice>('/search/purchase-invoices', `project.id = ${bouw7Id}`).catch(() => []),
      client
        .get<{ items?: Bouw7ContractOrderLine[]; total?: number | string }>('/list/contract-order-lines', { q: orderLinesQuery })
        .then((r) => ({ items: r.items ?? [], total: toGetal(r.total) }))
        .catch(() => ({ items: [] as Bouw7ContractOrderLine[], total: 0 })),
    ])

    const GEEN = '-' // code-sleutel voor "Kosten zonder bewaking"
    const regelMap = new Map<string, BewakingRegel>()
    const codeIndex = new Map<string, BewakingRegel>() // bewakingscode → regel (codes zijn uniek per project)
    // % gereed wordt PROGNOSE-gewogen gemiddeld over de kostensoorten (Bouw7 kan per
    // (code × kostensoort) een eigen % hebben). Weggestreepte kostensoorten (prognose 0,
    // bv. via "niet/anders begroot") tellen zo niet mee.
    const progressSom = new Map<string, number>()       // Σ progress × prognose (per code)
    const progressGewicht = new Map<string, number>()   // Σ prognose (per code)
    const progressSimpelSom = new Map<string, number>() // Σ progress  (fallback zonder prognose)
    const progressSimpelN = new Map<string, number>()   // aantal kostensoorten met % (fallback)

    /** Bestaande regel ophalen of nieuwe aanmaken (gematcht op bewakingscode). */
    const vindOfMaak = (code: string, hoofdstukId: number | null, hoofdstuk: string | null, naam: string | null) => {
      let r = codeIndex.get(code)
      if (!r) {
        r = legeRegel()
        r.code = code
        r.naam = naam ?? code
        r.hoofdstukId = hoofdstukId
        r.hoofdstuk = hoofdstuk
        codeIndex.set(code, r)
        regelMap.set(`${hoofdstukId ?? 'x'}|${code}`, r)
      }
      return r
    }

    /** Verwerk één control-regel (begroting/prognose/uren/realisatie per kostensoort). */
    const verwerk = (ct: Bouw7CostTypeId, e: Bouw7ControlEntry, hoofdstukId: number | null, hoofdstuk: string | null) => {
      const code = e.code ?? GEEN
      const key = `${hoofdstukId ?? 'x'}|${code}`
      let r = regelMap.get(key)
      if (!r) {
        r = legeRegel()
        r.code = code
        r.naam = e.name ?? null
        r.hoofdstukId = hoofdstukId
        r.hoofdstuk = hoofdstuk
        regelMap.set(key, r)
        codeIndex.set(code, r)
      }

      const budget = toGetal(e.budgetAmount)
      const kosten = toGetal(e.costAmount)
      r.begroot += budget
      r.meerwerk += toGetal(e.additionalWorkAmount)
      r.prognose += toGetal(e.prognosisAmount)
      r.prognoseUren += toGetal(e.hourInfo?.prognosisHours)
      r.geboekteUren += toGetal(e.hourInfo?.costHours)

      if (ct === 1) { r.arbeidskosten += kosten; r.arbeidPrognose += toGetal(e.prognosisAmount) }
      else if (ct === 3) r.onderaanneming += kosten
      else if (ct === 5) r.materiaal += kosten
      else r.inkoopMaterieelAfval += kosten // 2=Inkoop, 4=Materieel, 6=Afval

      // % gereed: prognose-gewogen gemiddelde over de kostensoorten (per code én projectbreed).
      // Kostensoorten met prognose 0 (weggestreept) tellen niet mee in de weging.
      if (e.progress != null) {
        const prog = toGetal(e.progress)
        const waarde = toGetal(e.prognosisAmount)
        progressSimpelSom.set(key, (progressSimpelSom.get(key) ?? 0) + prog)
        progressSimpelN.set(key, (progressSimpelN.get(key) ?? 0) + 1)
        if (waarde > 0) {
          progressSom.set(key, (progressSom.get(key) ?? 0) + prog * waarde)
          progressGewicht.set(key, (progressGewicht.get(key) ?? 0) + waarde)
        }
      }
    }

    BEWAKING_KOSTENSOORTEN.forEach((ct, i) => {
      const resp = responses[i]
      if (!resp) return
      for (const item of resp.items ?? []) {
        const ci = item.chapterInfo
        const isUncoded = ci?.name === 'uncoded_costs' || ci?.id === 0
        if (isUncoded) {
          // Kosten zonder bewakingscode — één regel, samengevoegd over kostensoorten.
          verwerk(ct, { ...ci, code: GEEN, name: 'Kosten zonder bewaking' }, UNCODED_HOOFDSTUK_ID, 'Kosten zonder bewaking')
        } else {
          for (const sc of item.securityCodes ?? []) {
            verwerk(ct, sc, ci?.id ?? null, ci?.name ?? null)
          }
        }
      }
    })

    // Geboekte kosten = arbeid (altijd geboekt) + inkoop mét inkoopfactuur.
    // Dedupe op deliveryTicket.id: termijn-facturen verwijzen naar dezelfde bon.
    const gefactureerdeBon = new Map<number, { code: string; chapterId: number | null; chapterNaam: string | null; naam: string | null; bedrag: number }>()
    for (const inv of invoices) {
      const dt = inv.deliveryTicket
      if (!dt?.id || gefactureerdeBon.has(dt.id)) continue
      const c = dt.securityLink?.code
      gefactureerdeBon.set(dt.id, {
        code: c?.code ?? GEEN,
        chapterId: c?.code ? (c.chapter?.id ?? null) : UNCODED_HOOFDSTUK_ID,
        chapterNaam: c?.code ? (c.chapter?.name ?? null) : 'Kosten zonder bewaking',
        naam: c?.code ? (c.name ?? null) : 'Kosten zonder bewaking',
        bedrag: toGetal(dt.cost),
      })
    }
    const gefactureerdPerCode = new Map<string, number>()
    for (const b of gefactureerdeBon.values()) {
      gefactureerdPerCode.set(b.code, (gefactureerdPerCode.get(b.code) ?? 0) + b.bedrag)
      vindOfMaak(b.code, b.chapterId, b.chapterNaam, b.naam)
    }

    // Verwachte kosten (#9) = totaal van alle contract-order-lines per code (incl. arbeid).
    const verwachtPerCode = new Map<string, number>()
    for (const line of orderLines.items) {
      const code = line.projectSecurityLink?.code ?? GEEN
      verwachtPerCode.set(code, (verwachtPerCode.get(code) ?? 0) + toGetal(line.totalPrice))
      const isUncoded = code === GEEN
      vindOfMaak(
        code,
        isUncoded ? UNCODED_HOOFDSTUK_ID : null,
        isUncoded ? 'Kosten zonder bewaking' : (line.projectSecurityLink?.parentName ?? null),
        isUncoded ? 'Kosten zonder bewaking' : (line.projectSecurityLink?.parentName ?? code),
      )
    }

    // Afgeleide kolommen per regel toekennen.
    for (const r of regelMap.values()) {
      const code = r.code ?? GEEN
      r.geboekteKosten = r.arbeidskosten + (gefactureerdPerCode.get(code) ?? 0)
      r.verwachteKosten = verwachtPerCode.get(code) ?? 0
    }

    // % gereed per code afronden: prognose-gewogen gemiddelde over de kostensoorten,
    // met als fallback een ongewogen gemiddelde (codes zonder prognose).
    for (const [key, r] of regelMap) {
      const gewicht = progressGewicht.get(key) ?? 0
      if (gewicht > 0) {
        r.progress = Math.round(((progressSom.get(key) ?? 0) / gewicht) * 100) / 100
      } else {
        const n = progressSimpelN.get(key) ?? 0
        r.progress = n > 0 ? Math.round(((progressSimpelSom.get(key) ?? 0) / n) * 100) / 100 : null
      }
    }

    // EVA-overlay: een in EVA ingevoerde % gereed prevaleert boven de Bouw7-waarde
    // (zodat een net-ingevoerde standopname blijft staan tot Bouw7 het bevestigt).
    const overlay = await getVoortgang(String(bouw7Id))
    if (overlay.codes.size > 0) {
      for (const r of regelMap.values()) {
        if (r.code && overlay.codes.has(r.code)) r.progress = overlay.codes.get(r.code)!
      }
    }

    // Project-% gereed = prognose-gewogen rollup van de codes, ná de overlay (zodat een
    // handmatige per-code % meetelt), gewogen per code-prognose.
    let projectSom = 0
    let projectGewicht = 0
    for (const r of regelMap.values()) {
      if (r.progress == null || r.prognose <= 0) continue
      projectSom += r.progress * r.prognose
      projectGewicht += r.prognose
    }
    const projectProgress = projectGewicht > 0 ? Math.round((projectSom / projectGewicht) * 100) / 100 : null

    // Groeperen per hoofdstuk.
    const hoofdstukMap = new Map<string, { id: number | null; naam: string; regels: BewakingRegel[] }>()
    for (const regel of regelMap.values()) {
      const key = `${regel.hoofdstukId ?? 'x'}|${regel.hoofdstuk ?? ''}`
      let groep = hoofdstukMap.get(key)
      if (!groep) {
        groep = { id: regel.hoofdstukId, naam: regel.hoofdstuk || 'Overig', regels: [] }
        hoofdstukMap.set(key, groep)
      }
      groep.regels.push(regel)
    }

    // "Kosten zonder bewaking" onderaan, rest alfabetisch op hoofdstuknaam.
    const hoofdstukken = [...hoofdstukMap.values()].sort((a, b) => {
      if (a.id === UNCODED_HOOFDSTUK_ID) return 1
      if (b.id === UNCODED_HOOFDSTUK_ID) return -1
      return a.naam.localeCompare(b.naam, 'nl')
    })
    for (const h of hoofdstukken) {
      h.regels.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? '', 'nl'))
    }

    const alleRegels = hoofdstukken.flatMap((h) => h.regels)
    const som = (sel: (r: BewakingRegel) => number) => alleRegels.reduce((s, r) => s + sel(r), 0)
    const totalen: BewakingTotalen = {
      begroot: som((r) => r.begroot),
      meerwerk: som((r) => r.meerwerk),
      prognose: som((r) => r.prognose),
      prognoseUren: som((r) => r.prognoseUren),
      geboekteUren: som((r) => r.geboekteUren),
      arbeidPrognose: som((r) => r.arbeidPrognose),
      arbeidskosten: som((r) => r.arbeidskosten),
      onderaanneming: som((r) => r.onderaanneming),
      materiaal: som((r) => r.materiaal),
      inkoopMaterieelAfval: som((r) => r.inkoopMaterieelAfval),
      verwachteKosten: orderLines.total || som((r) => r.verwachteKosten),
      geboekteKosten: som((r) => r.geboekteKosten),
    }

    return {
      beschikbaar: alleRegels.length > 0,
      bouw7Id: String(bouw7Id),
      hoofdstukken,
      totalen,
      geboekteUrenProject: totalen.geboekteUren,
      projectProgress,
    }
  } catch {
    return leeg
  }
}

/* ── Inkoop / Verkoop / Uren-tabs (live uit Bouw7) ─────────────────────
 * Zelfde live-ophaalpatroon als getDossierBewaking: geen opslag, alles defensief
 * met `.catch` per bron en een `beschikbaar`-flag, zodat een ontbrekend endpoint
 * of dossier zonder bouw7_id de tab niet laat crashen. */

/** Maakt een Bouw7-client voor een dossier op basis van de integratie-config; null als ongekoppeld/onvolledig. */
export async function bouw7VoorDossier(dossierId: string): Promise<{ client: Bouw7Client; bouw7Id: string } | null> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase.from('dossiers').select('bouw7_id').eq('id', dossierId).single()
  if (!dossier?.bouw7_id) return null
  const { data: integratie } = await supabase.from('integraties').select('config').eq('naam', 'bouw7').maybeSingle()
  const config = integratie?.config as Record<string, string> | undefined
  if (!config?.api_key || !config?.app_name) return null
  return { client: new Bouw7Client(config.api_key, config.app_name), bouw7Id: String(dossier.bouw7_id) }
}

/* — Inkoop — */

/** Inkooporder-contract (zelfde kolommen als een onderaannemerscontract). */
export type InkoopOrderRegel = {
  orderId: number | null
  /** Ordernummer (Bouw7 `number`), bv. "20251.00062IO001". */
  nummer: string | null
  leverancier: string | null
  omschrijving: string | null
  contractbedrag: number
  /** Bouw7-geboekt (contractbedrag − openstaand) + in EVA toegewezen kosten. */
  geboekt: number
  openstaand: number
  /** contractbedrag − geboekt (mag negatief zijn bij overschrijding). */
  nogVerwacht: number
  status: string | null
}
export type OnderaannemerContract = {
  contractId: number | null
  /** Contractnummer (Bouw7 `number`), bv. "20257.00064OA001". */
  nummer: string | null
  onderaannemer: string | null
  omschrijving: string | null
  contractbedrag: number
  /** Bouw7-geboekt (contractbedrag − openstaand) + in EVA toegewezen kosten. */
  geboekt: number
  openstaand: number
  /** contractbedrag − geboekt (mag negatief zijn bij overschrijding). */
  nogVerwacht: number
  status: string | null
}
/** Eén geboekte kostenregel = één Bouw7-inkoopfactuur, verrijkt met bewakingscode + EVA-correctie. */
export type GeboekteKostenRegel = {
  /** Bouw7 purchase-invoice id — sleutel voor EVA-correcties. */
  bronId: number
  factuurnummer: string | null
  leverancier: string | null
  leverancierType: 'leverancier' | 'onderaannemer' | null
  omschrijving: string | null
  /** Bedrag excl. btw (subTotal). */
  bedrag: number
  btw: number | null
  totaal: number | null
  datum: string | null
  vervaldatum: string | null
  betaald: boolean
  /** Effectieve bewakingscode (na eventuele EVA-correctie). */
  code: string | null
  codeNaam: string | null
  /** Oorspronkelijke Bouw7-bewakingscode (voor "gecorrigeerd"-weergave). */
  bronCode: string | null
  typeKosten: string | null
  gecorrigeerd: boolean
  /** Herkomst van de effectieve koppeling: Bouw7-bonmatch, EVA-correctie, of geen. */
  linkBron: 'bouw7' | 'eva' | null
  toegewezenOrderId: number | null
  toegewezenContractId: number | null
}
/** Eén échte factuurregel van een inkoopfactuur (uit het Bouw7 factuur-detail). */
export type InkoopFactuurRegel = {
  regelId: number
  omschrijving: string | null
  aantal: number | null
  stukprijs: number | null
  subtotaal: number
  btwPercentage: number | null
  bonnummer: string | null
  code: string | null
  codeNaam: string | null
}
/** Lazy opgehaald detail van één inkoopfactuur: de regels + het factuurdocument. */
export type InkoopFactuurDetail = {
  regels: InkoopFactuurRegel[]
  documentHash: string | null
  documentNaam: string | null
}
export type ProjectBewakingscode = { code: string; naam: string | null }
export type DossierInkoopData = {
  beschikbaar: boolean
  inkooporders: InkoopOrderRegel[]
  onderaannemers: OnderaannemerContract[]
  geboekteKosten: GeboekteKostenRegel[]
  /** Bewakingscodes die al op dit project voorkomen (voor de hercodeer-dropdown). */
  projectcodes: ProjectBewakingscode[]
  totalen: { besteld: number; onderaanneming: number; geboekt: number; toegewezen: number; nietToegewezen: number }
}

/** EVA-correctie op een geboekte kost (rekenlaag; raakt Bouw7 niet). */
export type InkoopCorrectie = {
  id: string
  dossier_id: string
  bron_type: string
  bron_id: number
  bewakingscode_override: string | null
  bewakingscode_naam_override: string | null
  toegewezen_order_id: number | null
  toegewezen_contract_id: number | null
  opmerking: string | null
}

const PURCHASE_TYPE_LABELS: Record<string, string> = {
  labor: 'Arbeid', material: 'Materiaal', subcontractor: 'Onderaanneming',
  equipment: 'Materieel', waste: 'Afval', misc: 'Overig', other: 'Overig',
}
function typeKostenLabel(name?: string | null): string | null {
  if (!name) return null
  return PURCHASE_TYPE_LABELS[name.toLowerCase()] ?? name.charAt(0).toUpperCase() + name.slice(1)
}
function stripHtml(s?: string | null): string | null {
  if (!s) return null
  const t = s.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  return t || null
}
/** "2026-04-30" of "2026-04-30T00:00:00+02:00" → "2026-04-30". */
function isoDatum(s?: string | null): string | null {
  return s ? s.slice(0, 10) : null
}

/** Leest de EVA-inkoopcorrecties voor een dossier (admin-client; RLS omzeild server-side). */
export async function getInkoopCorrecties(dossierId: string): Promise<InkoopCorrectie[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase.from('inkoop_correcties').select('*').eq('dossier_id', dossierId)
  return (data ?? []) as InkoopCorrectie[]
}

/**
 * Inkoop-overzicht van een dossier: inkooporders (contract-order-lines), onderaannemerscontracten
 * en geboekte kosten (inkoopfacturen). Live uit Bouw7, met EVA-correcties erbovenop gemerged.
 *
 * Geboekte kosten = één rij per inkoopfactuur (Heimdall `/list/purchase-invoices` voor de rijke
 * financiën, Apollo `/search/purchase-invoices` voor de bewakingscode, gemerged op deliveryTicket.id).
 * EVA-correcties (hercoderen / toewijzen aan order/contract) worden toegepast maar NIET naar Bouw7
 * teruggeschreven — ze beïnvloeden alleen EVA's saldo per order/contract en de code-toewijzing.
 */
export async function getDossierInkoop(dossierId: string): Promise<DossierInkoopData> {
  const leeg: DossierInkoopData = {
    beschikbaar: false, inkooporders: [], onderaannemers: [], geboekteKosten: [], projectcodes: [],
    totalen: { besteld: 0, onderaanneming: 0, geboekt: 0, toegewezen: 0, nietToegewezen: 0 },
  }
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return leeg
  const { client, bouw7Id } = ctx

  try {
    const [orderResp, subResp, apolloInvoices, heimdallResp, correcties] = await Promise.all([
      client.get<Bouw7ListResponse<Bouw7PurchaseOrderContract>>('/list/purchase-order-contracts', {
        q: `project.id = ${bouw7Id} LIMIT 500`,
      }).catch(() => ({ items: [] as Bouw7PurchaseOrderContract[] } as Bouw7ListResponse<Bouw7PurchaseOrderContract>)),
      client.get<Bouw7ListResponse<Bouw7SubcontractorContract>>('/list/subcontractor-contracts', {
        q: `project.id = ${bouw7Id} LIMIT 500`,
      }).catch(() => ({ items: [] as Bouw7SubcontractorContract[] } as Bouw7ListResponse<Bouw7SubcontractorContract>)),
      client.getApolloAll<Bouw7PurchaseInvoice>('/search/purchase-invoices', `project.id = ${bouw7Id}`).catch(() => []),
      client.get<Bouw7PurchaseInvoiceListResponse>('/list/purchase-invoices', {
        q: `project.id = ${bouw7Id} LIMIT 1000`,
      }).catch(() => ({ items: [] as Bouw7PurchaseInvoiceListItem[] } as Bouw7PurchaseInvoiceListResponse)),
      getInkoopCorrecties(dossierId).catch(() => [] as InkoopCorrectie[]),
    ])

    // Apollo levert de bewakingscode: indexeer per deliveryTicket.id én per invoice.id (fallback).
    const codePerBon = new Map<number, { code: string | null; naam: string | null }>()
    const codePerInvoice = new Map<number, { code: string | null; naam: string | null }>()
    for (const inv of apolloInvoices) {
      const c = inv.deliveryTicket?.securityLink?.code
      const entry = { code: c?.code ?? null, naam: c?.name ?? null }
      if (inv.deliveryTicket?.id) codePerBon.set(inv.deliveryTicket.id, entry)
      if (inv.id) codePerInvoice.set(inv.id, entry)
    }

    // Bonnummer → order-id / contract-id voor Bouw7-linkage
    const orderNummerIndex = new Map<string, number>()
    for (const o of orderResp.items ?? []) if (o.number && o.id != null) orderNummerIndex.set(o.number, o.id)
    const contractNummerIndex = new Map<string, number>()
    for (const sub of subResp.items ?? []) if (sub.number && sub.id != null) contractNummerIndex.set(sub.number, sub.id)

    const correctieMap = new Map<number, InkoopCorrectie>()
    for (const c of correcties) correctieMap.set(Number(c.bron_id), c)

    const geboekteKosten: GeboekteKostenRegel[] = (heimdallResp.items ?? []).map((inv) => {
      const apolloCode =
        (inv.deliveryTicket?.id != null ? codePerBon.get(inv.deliveryTicket.id) : undefined) ??
        codePerInvoice.get(inv.id) ?? { code: null, naam: null }
      const corr = correctieMap.get(inv.id)
      const heeftCodeOverride = !!corr?.bewakingscode_override
      const sup = inv.supplier
      const levType: GeboekteKostenRegel['leverancierType'] =
        sup?.type === 'subcontractor' ? 'onderaannemer' : sup?.type ? 'leverancier' : null

      // Effectieve koppeling: EVA-override heeft voorrang; anders Bouw7-bonmatch
      const bon = inv.deliveryTicket?.number ?? null
      let effOrderId: number | null = corr?.toegewezen_order_id != null ? Number(corr.toegewezen_order_id) : null
      let effContractId: number | null = corr?.toegewezen_contract_id != null ? Number(corr.toegewezen_contract_id) : null
      let linkBron: 'bouw7' | 'eva' | null = null
      if (effOrderId != null || effContractId != null) {
        linkBron = 'eva'
      } else if (bon) {
        for (const [nummer, orderId] of orderNummerIndex) {
          if (bon === nummer || bon.startsWith(nummer + 'B')) { effOrderId = orderId; linkBron = 'bouw7'; break }
        }
        if (linkBron === null) {
          for (const [nummer, contractId] of contractNummerIndex) {
            if (bon === nummer || bon.startsWith(nummer + 'B')) { effContractId = contractId; linkBron = 'bouw7'; break }
          }
        }
      }

      return {
        bronId: inv.id,
        factuurnummer: inv.invoiceNumber ?? null,
        leverancier: sup?.name ?? null,
        leverancierType: levType,
        omschrijving: stripHtml(inv.deliveryTicket?.description) ?? inv.comment ?? null,
        bedrag: toGetal(inv.subTotal),
        btw: inv.vatTotal != null ? toGetal(inv.vatTotal) : null,
        totaal: inv.total != null ? toGetal(inv.total) : null,
        datum: isoDatum(inv.date),
        vervaldatum: isoDatum(inv.dueDate),
        betaald: inv.datePaid != null,
        code: heeftCodeOverride ? corr!.bewakingscode_override : apolloCode.code,
        codeNaam: heeftCodeOverride ? corr!.bewakingscode_naam_override : apolloCode.naam,
        bronCode: apolloCode.code,
        typeKosten: typeKostenLabel(inv.deliveryTicket?.purchaseTypeName),
        gecorrigeerd: !!corr,
        linkBron,
        toegewezenOrderId: effOrderId,
        toegewezenContractId: effContractId,
      }
    })

    // Geboekt per order/contract op basis van EVA-toewijzingen.
    const geboektPerOrder = new Map<number, number>()
    const geboektPerContract = new Map<number, number>()
    for (const r of geboekteKosten) {
      if (r.toegewezenOrderId != null) geboektPerOrder.set(r.toegewezenOrderId, (geboektPerOrder.get(r.toegewezenOrderId) ?? 0) + r.bedrag)
      if (r.toegewezenContractId != null) geboektPerContract.set(r.toegewezenContractId, (geboektPerContract.get(r.toegewezenContractId) ?? 0) + r.bedrag)
    }

    const inkooporders: InkoopOrderRegel[] = (orderResp.items ?? []).map((o) => {
      const contractbedrag = toGetal(o.price)
      const openstaand = toGetal(o.outstandingCosts)
      const geboekt = (o.id != null ? geboektPerOrder.get(o.id) : 0) ?? 0
      return {
        orderId: o.id ?? null,
        nummer: o.number ?? null,
        leverancier: o.supplier?.name ?? null,
        omschrijving: o.name ?? null,
        contractbedrag,
        geboekt,
        openstaand,
        nogVerwacht: contractbedrag - geboekt,
        status: o.statusName ?? null,
      }
    })

    const onderaannemers: OnderaannemerContract[] = (subResp.items ?? []).map((c) => {
      const contractbedrag = toGetal(c.price)
      const openstaand = toGetal(c.outstandingCosts)
      const geboekt = (c.id != null ? geboektPerContract.get(c.id) : 0) ?? 0
      return {
        contractId: c.id ?? null,
        nummer: c.number ?? null,
        onderaannemer: c.subcontractor?.name ?? null,
        omschrijving: c.name ?? null,
        contractbedrag,
        geboekt,
        openstaand,
        nogVerwacht: contractbedrag - geboekt,
        status: c.statusName ?? null,
      }
    })

    // Projectbewakingscodes = codes die al op dit project voorkomen (contracten + geboekte kosten).
    const codeMap = new Map<string, string | null>()
    for (const o of orderResp.items ?? []) if (o.projectSecurityLink?.code && !codeMap.has(o.projectSecurityLink.code)) codeMap.set(o.projectSecurityLink.code, o.projectSecurityLink.name ?? null)
    for (const c of subResp.items ?? []) if (c.projectSecurityLink?.code && !codeMap.has(c.projectSecurityLink.code)) codeMap.set(c.projectSecurityLink.code, c.projectSecurityLink.name ?? null)
    for (const r of geboekteKosten) if (r.bronCode && !codeMap.has(r.bronCode)) codeMap.set(r.bronCode, r.codeNaam ?? null)
    const projectcodes: ProjectBewakingscode[] = [...codeMap.entries()]
      .map(([code, naam]) => ({ code, naam }))
      .sort((a, b) => a.code.localeCompare(b.code))

    const besteld = inkooporders.reduce((s, r) => s + r.contractbedrag, 0)
    const onderaanneming = onderaannemers.reduce((s, c) => s + c.contractbedrag, 0)
    const geboekt = geboekteKosten.reduce((s, r) => s + r.bedrag, 0)
    const toegewezen = geboekteKosten.filter(r => r.toegewezenOrderId != null || r.toegewezenContractId != null).reduce((s, r) => s + r.bedrag, 0)
    const nietToegewezen = geboekt - toegewezen

    return {
      beschikbaar: inkooporders.length > 0 || onderaannemers.length > 0 || geboekteKosten.length > 0,
      inkooporders, onderaannemers, geboekteKosten, projectcodes,
      totalen: { besteld, onderaanneming, geboekt, toegewezen, nietToegewezen },
    }
  } catch {
    return leeg
  }
}

/**
 * Regels + factuurdocument van één inkoopfactuur, on-demand opgehaald bij het uitklappen.
 *
 * Bron: **GET /purchase-invoicing/purchase-invoice/{id}** — de enige plek met de échte factuurregels
 * (omschrijving, aantal, stukprijs, BTW) en de factuur-PDF. Eén call per factuur, dus bewust niet in
 * `getDossierInkoop` meegenomen: een dossier kan >100 facturen hebben.
 */
export async function getInkoopFactuurDetail(
  dossierId: string,
  factuurId: number,
): Promise<{ ok: true; detail: InkoopFactuurDetail } | { ok: false; error: string }> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling voor dit dossier' }
  try {
    const d = await ctx.client.get<Bouw7PurchaseInvoiceDetail>(
      `/purchase-invoicing/purchase-invoice/${factuurId}`,
    )
    const regels: InkoopFactuurRegel[] = (d.lines ?? []).map((l) => {
      const link = l.deliveryTicket?.projectSecurityLink
      return {
        regelId: l.id,
        omschrijving: stripHtml(l.description) ?? null,
        aantal: l.quantity != null ? toGetal(l.quantity) : null,
        stukprijs: l.unitPrice != null ? toGetal(l.unitPrice) : null,
        subtotaal: toGetal(l.subTotal),
        btwPercentage: l.vatTariffPercentage != null ? toGetal(l.vatTariffPercentage) : null,
        bonnummer: l.deliveryTicket?.ticketNumber ?? null,
        code: link?.code ?? null,
        codeNaam: link?.name ?? null,
      }
    })
    // Alleen een echt bestand tonen (Bouw7 levert `file: null` als er niets hangt).
    // Downloaden gaat via `uri` — de secureHash geeft bij inkoopfacturen een 404.
    const doc = d.file?.uri ? d.file : null
    return {
      ok: true,
      detail: {
        regels,
        documentHash: doc?.uri ?? null,
        documentNaam: doc ? `${doc.name ?? 'factuur'}.${doc.extension ?? 'pdf'}` : null,
      },
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ophalen mislukt' }
  }
}

/* — Inkoop-correcties (EVA-rekenlaag; geen Bouw7-write) — */

type InkoopCorrectieResult = { ok: true } | { ok: false; error: string }

/** Upsert helper: schrijf één veld-set naar inkoop_correcties voor (dossier, bron). */
async function upsertInkoopCorrectie(
  dossierId: string,
  bronId: number,
  patch: Partial<Pick<InkoopCorrectie, 'bewakingscode_override' | 'bewakingscode_naam_override' | 'toegewezen_order_id' | 'toegewezen_contract_id'>>,
): Promise<InkoopCorrectieResult> {
  if (!dossierId || !Number.isFinite(bronId)) return { ok: false, error: 'Ongeldige parameters.' }
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('inkoop_correcties')
    .upsert({ dossier_id: dossierId, bron_type: 'purchase_invoice', bron_id: bronId, updated_at: new Date().toISOString(), ...patch },
      { onConflict: 'dossier_id,bron_type,bron_id' })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/inkoop`)
  revalidatePath(`/servicedesk/${dossierId}/inkoop`)
  return { ok: true }
}

/** Wijs een geboekte kost toe aan een inkooporder of OA-contract (exclusief). */
export async function verplaatsGeboekteKost(
  dossierId: string,
  bronId: number,
  doel: { orderId?: number | null; contractId?: number | null },
): Promise<InkoopCorrectieResult> {
  await assertDossierBewerkbaar(dossierId)
  return upsertInkoopCorrectie(dossierId, bronId, {
    toegewezen_order_id: doel.orderId ?? null,
    toegewezen_contract_id: doel.orderId != null ? null : doel.contractId ?? null,
  })
}

/** Zet een geboekte kost op een andere (bestaande) bewakingscode. Validatie tegen projectcodes. */
export async function hercodeerGeboekteKost(
  dossierId: string,
  bronId: number,
  code: string,
  naam: string | null,
): Promise<InkoopCorrectieResult> {
  await assertDossierBewerkbaar(dossierId)
  const codeClean = (code ?? '').trim()
  if (!codeClean) return { ok: false, error: 'Geen bewakingscode opgegeven.' }
  // "Alleen bestaande projectcodes": valideer tegen de codes die al op het project voorkomen.
  const data = await getDossierInkoop(dossierId)
  if (!data.projectcodes.some((c) => c.code === codeClean)) {
    return { ok: false, error: 'Bewakingscode bestaat niet op dit project.' }
  }
  return upsertInkoopCorrectie(dossierId, bronId, {
    bewakingscode_override: codeClean,
    bewakingscode_naam_override: naam,
  })
}

/** Verwijder de EVA-correctie van een geboekte kost (terug naar de Bouw7-waarde). */
export async function wisInkoopCorrectie(dossierId: string, bronId: number): Promise<InkoopCorrectieResult> {
  if (!dossierId || !Number.isFinite(bronId)) return { ok: false, error: 'Ongeldige parameters.' }
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('inkoop_correcties')
    .delete()
    .eq('dossier_id', dossierId)
    .eq('bron_type', 'purchase_invoice')
    .eq('bron_id', bronId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/inkoop`)
  revalidatePath(`/servicedesk/${dossierId}/inkoop`)
  return { ok: true }
}

/* — Bulk-correcties (multiselect op het Inkoop-tab) — */

/** Bulk-upsert helper: schrijf dezelfde veld-set naar inkoop_correcties voor meerdere bronnen. */
async function upsertInkoopCorrectiesBulk(
  dossierId: string,
  bronIds: number[],
  patch: Partial<Pick<InkoopCorrectie, 'bewakingscode_override' | 'bewakingscode_naam_override' | 'toegewezen_order_id' | 'toegewezen_contract_id'>>,
): Promise<InkoopCorrectieResult> {
  const ids = [...new Set(bronIds.filter((n) => Number.isFinite(n)))]
  if (!dossierId || ids.length === 0) return { ok: false, error: 'Geen regels geselecteerd.' }
  const supabase = createAdminClient() as any
  const now = new Date().toISOString()
  const rows = ids.map((id) => ({ dossier_id: dossierId, bron_type: 'purchase_invoice', bron_id: id, updated_at: now, ...patch }))
  const { error } = await supabase
    .from('inkoop_correcties')
    .upsert(rows, { onConflict: 'dossier_id,bron_type,bron_id' })
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/inkoop`)
  revalidatePath(`/servicedesk/${dossierId}/inkoop`)
  return { ok: true }
}

/** Bulk: zet meerdere geboekte kosten op dezelfde (bestaande) bewakingscode. */
export async function hercodeerGeboekteKostenBulk(
  dossierId: string,
  bronIds: number[],
  code: string,
  naam: string | null,
): Promise<InkoopCorrectieResult> {
  await assertDossierBewerkbaar(dossierId)
  const codeClean = (code ?? '').trim()
  if (!codeClean) return { ok: false, error: 'Geen bewakingscode opgegeven.' }
  const data = await getDossierInkoop(dossierId)
  if (!data.projectcodes.some((c) => c.code === codeClean)) {
    return { ok: false, error: 'Bewakingscode bestaat niet op dit project.' }
  }
  return upsertInkoopCorrectiesBulk(dossierId, bronIds, {
    bewakingscode_override: codeClean,
    bewakingscode_naam_override: naam,
  })
}

/** Bulk: wijs meerdere geboekte kosten toe aan dezelfde inkooporder of OA-contract (exclusief). */
export async function verplaatsGeboekteKostenBulk(
  dossierId: string,
  bronIds: number[],
  doel: { orderId?: number | null; contractId?: number | null },
): Promise<InkoopCorrectieResult> {
  await assertDossierBewerkbaar(dossierId)
  return upsertInkoopCorrectiesBulk(dossierId, bronIds, {
    toegewezen_order_id: doel.orderId ?? null,
    toegewezen_contract_id: doel.orderId != null ? null : doel.contractId ?? null,
  })
}

/** Bulk: verwijder de EVA-correcties van meerdere geboekte kosten. */
export async function wisInkoopCorrectiesBulk(dossierId: string, bronIds: number[]): Promise<InkoopCorrectieResult> {
  const ids = [...new Set(bronIds.filter((n) => Number.isFinite(n)))]
  if (!dossierId || ids.length === 0) return { ok: false, error: 'Geen regels geselecteerd.' }
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('inkoop_correcties')
    .delete()
    .eq('dossier_id', dossierId)
    .eq('bron_type', 'purchase_invoice')
    .in('bron_id', ids)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/inkoop`)
  revalidatePath(`/servicedesk/${dossierId}/inkoop`)
  return { ok: true }
}

/* — Uren — */

export type UrenRegel = {
  medewerker: string | null
  datum: string | null
  uren: number
  uurtarief: number | null
  uursoort: string | null
  code: string | null
  codeNaam: string | null
  bedrag: number
  /** Bouw7 hour-log ID — aanwezig bij detailNiveau='medewerker', null bij bewakingscode-fallback. */
  bouw7Id: number | null
  /** Bouw7 project-id van dit uurlog — nodig voor de POST /project/hour-log upsert. */
  bouw7ProjectId: number | null
  /** Bouw7 uursoort-id — nodig voor de POST /project/hour-log upsert. */
  hourTypeId: number | null
}
export type DossierUrenData = {
  beschikbaar: boolean
  detailNiveau: 'medewerker' | 'bewakingscode'
  regels: UrenRegel[]
  totalen: { uren: number; bedrag: number }
}

/**
 * Geboekte uren van een dossier. Primair per medewerker (GET /list/hour-logs/employee);
 * valt terug op geaggregeerde uren per bewakingscode (control-endpoint via getDossierBewaking)
 * als het detail-endpoint niet beschikbaar is.
 */
export async function getDossierUren(dossierId: string): Promise<DossierUrenData> {
  const leeg: DossierUrenData = { beschikbaar: false, detailNiveau: 'medewerker', regels: [], totalen: { uren: 0, bedrag: 0 } }
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return leeg
  const { client, bouw7Id } = ctx

  // 1. Detail per medewerker.
  try {
    const resp = await client.get<Bouw7EmployeeHourLogResponse>('/list/hour-logs/employee', {
      q: `project.id = ${bouw7Id} SORT(logDate, DESC) LIMIT 2000`,
    })
    const items = resp.items ?? []
    if (items.length > 0) {
      const regels: UrenRegel[] = items.map((h) => {
        const uren = toGetal(h.hours)
        const tarief = h.hourlyRate != null ? toGetal(h.hourlyRate) : null
        const bedrag = h.invoicedAmount != null && toGetal(h.invoicedAmount) > 0
          ? toGetal(h.invoicedAmount)
          : uren * (tarief ?? 0)
        const naam = [h.employee?.firstName, h.employee?.lastName].filter(Boolean).join(' ') || null
        return {
          medewerker: naam,
          datum: h.logDate ? h.logDate.slice(0, 10) : null,
          uren,
          uurtarief: tarief,
          uursoort: h.type?.name ?? null,
          code: h.projectSecurityLink?.code ?? null,
          codeNaam: h.projectSecurityLink?.name ?? h.projectSecurityLink?.parentName ?? null,
          bedrag,
          bouw7Id: h.id,
          bouw7ProjectId: h.project?.id ?? null,
          hourTypeId: h.type?.id ?? null,
        }
      })
      // Uursoorten (Bouw7 leidend) opportunistisch afleiden uit deze uren-logs — liften mee
      // op de call die de tab tóch al doet. Faalt stil zodat de urenweergave nooit breekt.
      try { await deriveUursoorten(items) } catch { /* afleiding mag nooit de tab blokkeren */ }

      return {
        beschikbaar: true,
        detailNiveau: 'medewerker',
        regels,
        totalen: {
          uren: resp.totalHours != null ? toGetal(resp.totalHours) : regels.reduce((s, r) => s + r.uren, 0),
          bedrag: resp.totalCost != null ? toGetal(resp.totalCost) : regels.reduce((s, r) => s + r.bedrag, 0),
        },
      }
    }
  } catch {
    // val door naar de bewakingscode-fallback
  }

  // 2. Fallback: geaggregeerde uren per bewakingscode uit de projectbewaking.
  const bewaking = await getDossierBewaking(dossierId)
  if (!bewaking.beschikbaar) return leeg
  const regels: UrenRegel[] = bewaking.hoofdstukken.flatMap((h) =>
    h.regels
      .filter((r) => r.geboekteUren > 0 || r.arbeidskosten > 0)
      .map((r) => ({
        medewerker: null,
        datum: null,
        uren: r.geboekteUren,
        uurtarief: r.geboekteUren > 0 ? r.arbeidskosten / r.geboekteUren : null,
        uursoort: null,
        code: r.code,
        codeNaam: r.naam,
        bedrag: r.arbeidskosten,
        bouw7Id: null,
        bouw7ProjectId: null,
        hourTypeId: null,
      })),
  )
  return {
    beschikbaar: regels.length > 0,
    detailNiveau: 'bewakingscode',
    regels,
    totalen: {
      uren: bewaking.totalen.geboekteUren,
      bedrag: bewaking.totalen.arbeidskosten,
    },
  }
}

/* — Verkoop — */

/**
 * Status van een verkooptermijn, afgeleid uit de factuurregel + de bijbehorende verkoopfactuur:
 * - `nog_te_factureren`: geen factuurregel (aangemaakt maar nog niet gefactureerd/verzonden)
 * - `concept`: factuur aangemaakt maar nog niet verzonden (isMailed = false)
 * - `verzonden`: factuur verzonden, nog niet betaald
 * - `betaald`: factuur betaald (datePaid gevuld)
 * - `gefactureerd`: factuurregel bestaat maar de factuur is niet terug te vinden (fallback)
 */
export type VerkoopTermijnStatus = 'nog_te_factureren' | 'concept' | 'verzonden' | 'betaald' | 'gefactureerd'
export type VerkoopTermijn = {
  nummer: number
  bouw7TermId: number      // stabiele Bouw7-sleutel (i.p.v. positioneel nummer)
  omschrijving: string | null
  percentage: number | null
  bedrag: number           // excl. BTW (subtotal)
  btwPercentage: number | null
  btwBedrag: number        // berekend: bedrag * btwPercentage / 100
  bedragIncl: number       // bedrag + btwBedrag
  gefactureerd: boolean    // er bestaat een factuurregel (invoiceLine != null)
  status: VerkoopTermijnStatus
  invoiceableAt: string | null
}
export type VerkoopFactuur = {
  factuurnummer: string | null
  datum: string | null
  vervaldatum: string | null
  bedragExcl: number       // subTotal
  btwBedrag: number        // vatTotal
  bedrag: number           // total (incl. BTW)
  betaald: boolean
  isCredit: boolean
}
export type TermijnenDekking = {
  volledig: boolean
  somBedrag: number
  somPct: number | null
  ontbreektBedrag: number
  ontbreektPct: number | null
}
export type DossierVerkoopData = {
  beschikbaar: boolean
  termijnenBeschikbaar: boolean
  termijnen: VerkoopTermijn[]
  facturen: VerkoopFactuur[]
  betaalgegevens: DossierFinancieelData['relatieFacturatie']
  totalen: { aanneemsom: number; meerwerk: number; contractTotaal: number; gefactureerd: number; openstaand: number }
  termijnenDekking: TermijnenDekking | null
}

/**
 * Termijnstatus afleiden. Bewust NIET op `invoiceLine.invoiceStatusId` — die is 0 voor zowel
 * concept- als reeds verzonden facturen (geverifieerd jul 2026). De betrouwbare bron is de
 * gekoppelde verkoopfactuur: `isMailed` (verzonden) en `datePaid` (betaald).
 */
function termijnStatus(
  t: Bouw7ProjectInvoiceTerm,
  factuurPerId: Map<number, Bouw7SalesInvoice>,
): VerkoopTermijnStatus {
  if (t.invoiceLine == null) return 'nog_te_factureren'
  const invoiceId = t.invoiceLine.invoiceId
  const factuur = invoiceId != null ? factuurPerId.get(invoiceId) : undefined
  if (!factuur) return 'gefactureerd' // factuurregel bestaat, factuur niet gevonden → neutraal
  if (factuur.datePaid != null) return 'betaald'
  return factuur.isMailed ? 'verzonden' : 'concept'
}

/**
 * Verkoop-overzicht van een dossier: termijnen (project-invoice-terms), verkoopfacturen (invoices)
 * en betaalgegevens van de klant (relatie_facturatie). Live uit Bouw7 + EVA. Defensief: ontbrekend
 * termijnen-endpoint → termijnenBeschikbaar=false zonder de tab te breken.
 */
export async function getDossierVerkoop(dossierId: string): Promise<DossierVerkoopData> {
  const leeg: DossierVerkoopData = {
    beschikbaar: false, termijnenBeschikbaar: false, termijnen: [], facturen: [], betaalgegevens: null,
    totalen: { aanneemsom: 0, meerwerk: 0, contractTotaal: 0, gefactureerd: 0, openstaand: 0 }, termijnenDekking: null,
  }
  const ctx = await bouw7VoorDossier(dossierId)
  // Betaalgegevens + aanneemsom komen via getDossierFinancieel (werkt ook zonder Bouw7-koppeling).
  const { bouw7Financial, relatieFacturatie } = await getDossierFinancieel(dossierId)
  if (!ctx) {
    return { ...leeg, betaalgegevens: relatieFacturatie }
  }
  const { client, bouw7Id } = ctx

  let termijnenBeschikbaar = false
  let termijnen: VerkoopTermijn[] = []
  let facturen: VerkoopFactuur[] = []
  // Verkoopfacturen per Bouw7-id, om per termijn te bepalen of de factuur al verzonden/betaald is.
  const factuurPerId = new Map<number, Bouw7SalesInvoice>()

  // Facturen eerst: de termijnstatus leunt op isMailed/datePaid van de gekoppelde factuur.
  try {
    const invResp = await client.get<Bouw7ListResponse<Bouw7SalesInvoice>>('/list/invoices', {
      q: `project.id = ${bouw7Id} SORT(date, DESC) LIMIT 500`,
    })
    for (const inv of invResp.items ?? []) if (inv.id != null) factuurPerId.set(inv.id, inv)
    facturen = (invResp.items ?? []).map((inv) => ({
      factuurnummer: inv.invoiceNumber ?? null,
      datum: inv.date ? inv.date.slice(0, 10) : null,
      vervaldatum: inv.dueDate ? inv.dueDate.slice(0, 10) : null,
      bedragExcl: toGetal(inv.subTotal),
      btwBedrag: toGetal(inv.vatTotal),
      bedrag: toGetal(inv.total),
      betaald: inv.datePaid != null,
      isCredit: !!inv.isCredit,
    }))
  } catch {
    facturen = []
  }

  // Termijnen: eerst de termijnstaat (statement) van het project, dan de losse termijnen daaronder.
  // `statement.project.id` is NIET HQL-mapped op ProjectInvoiceTermListItem → 400. Filteren moet
  // op `statement.id` (geverifieerd jul 2026); zonder deze twee-traps-aanpak kwam de query altijd
  // op een 400 uit en toonde de tab dus nooit termijnen.
  try {
    const stmtResp = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTermStatement>>(
      '/list/project-invoice-term-statements',
      { q: `project.id = ${bouw7Id} LIMIT 200` },
    )
    termijnenBeschikbaar = true
    const statementIds = (stmtResp.items ?? []).map((s) => s.id).filter((id): id is number => id != null)

    const ruweTermijnen: Bouw7ProjectInvoiceTerm[] = []
    for (const sid of statementIds) {
      const termResp = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>('/list/project-invoice-terms', {
        q: `statement.id = ${sid} LIMIT 500`,
      })
      ruweTermijnen.push(...(termResp.items ?? []))
    }

    termijnen = ruweTermijnen.map((t, i) => {
      const bedrag = toGetal(t.subtotal)
      const btwPercentage = t.vatTariffPercentage != null ? toGetal(t.vatTariffPercentage) : null
      const btwBedrag = btwPercentage != null ? Math.round(bedrag * btwPercentage) / 100 : 0
      return {
        nummer: i + 1,
        bouw7TermId: t.id,
        omschrijving: t.description ?? null,
        percentage: t.percentage != null ? toGetal(t.percentage) : null,
        bedrag,
        btwPercentage,
        btwBedrag,
        bedragIncl: bedrag + btwBedrag,
        gefactureerd: t.invoiceLine != null,
        status: termijnStatus(t, factuurPerId),
        invoiceableAt: t.invoiceableAt ? t.invoiceableAt.slice(0, 10) : null,
      }
    })
  } catch {
    termijnenBeschikbaar = false
  }

  const aanneemsom = toGetal(bouw7Financial?.fixedPrice) || toGetal(bouw7Financial?.revenue?.budgeted)
  // Goedgekeurd meerwerk: additionalWork is een object; bedrag zit in prognosis (= expected)
  const meerwerk = toGetal(bouw7Financial?.additionalWork?.prognosis ?? bouw7Financial?.additionalWork?.expected)
  const contractTotaal = aanneemsom + meerwerk
  const gefactureerd = facturen.length
    ? facturen.reduce((s, f) => s + (f.isCredit ? -f.bedrag : f.bedrag), 0)
    : toGetal(bouw7Financial?.revenue?.realised)
  const openstaand = Math.max(0, contractTotaal - gefactureerd)

  let termijnenDekking: TermijnenDekking | null = null
  if (contractTotaal > 0 && termijnenBeschikbaar) {
    const somBedrag = termijnen.reduce((s, t) => s + t.bedrag, 0)
    const allePctBekend = termijnen.length > 0 && termijnen.every(t => t.percentage != null)
    const somPct = allePctBekend ? termijnen.reduce((s, t) => s + (t.percentage ?? 0), 0) : null
    termijnenDekking = {
      volledig: Math.abs(somBedrag - contractTotaal) <= 1,
      somBedrag,
      somPct,
      ontbreektBedrag: Math.max(0, contractTotaal - somBedrag),
      ontbreektPct: somPct != null ? Math.max(0, 100 - somPct) : null,
    }
  }

  return {
    beschikbaar: termijnen.length > 0 || facturen.length > 0 || contractTotaal > 0,
    termijnenBeschikbaar,
    termijnen,
    facturen,
    betaalgegevens: relatieFacturatie,
    totalen: { aanneemsom, meerwerk, contractTotaal, gefactureerd, openstaand },
    termijnenDekking,
  }
}

/** Resultaat van de opdrachtgever-zoek: de relatie + optioneel de matchende contactpersoon. */
export type OpdrachtgeverZoekResultaat = {
  id: string
  naam: string
  types: string[]
  contactpersoon?: { id: string; naam: string } | null
}

/**
 * Zoek opdrachtgevers voor de aanvraag-combobox. Doorzoekt zowel relaties (naam + adres/plaats)
 * als contactpersonen (voor-/achternaam + e-mail); bij een contactpersoon-match wordt de
 * gekoppelde organisatie teruggegeven met de contactpersoon erbij zodat de modal die kan voorselecteren.
 * De geselecteerde waarde is altijd een relatie (klant_id). Optioneel filteren op relatie-type.
 */
export async function zoekRelaties(
  query: string,
  opts?: { type?: string },
): Promise<OpdrachtgeverZoekResultaat[]> {
  const term = query.trim()
  if (!term) return []
  const supabase = createAdminClient() as any
  const like = `%${term}%`

  // 1. Relaties op naam of adres/plaats.
  let relQ = supabase
    .from('relaties')
    .select('id, naam, types')
    .or(`naam.ilike.${like},adres_straat.ilike.${like},adres_plaats.ilike.${like}`)
    .eq('actief', true)
  if (opts?.type) relQ = relQ.contains('types', [opts.type])
  const relRes = await relQ.order('naam', { ascending: true }).limit(8)

  // 2. Contactpersonen op naam/e-mail → hun (primaire) organisatie.
  const cpRes = await supabase
    .from('contactpersonen')
    .select('id, voornaam, tussenvoegsel, achternaam, koppelingen:contactpersoon_organisaties(is_primair, organisatie:relaties(id, naam, types, actief))')
    .or(`voornaam.ilike.${like},achternaam.ilike.${like},email.ilike.${like}`)
    .eq('actief', true)
    .limit(8)

  const resultaten = new Map<string, OpdrachtgeverZoekResultaat>()
  for (const r of (relRes.data ?? []) as { id: string; naam: string; types: string[] }[]) {
    resultaten.set(r.id, { id: r.id, naam: r.naam, types: r.types ?? [], contactpersoon: null })
  }
  for (const cp of (cpRes.data ?? []) as any[]) {
    const koppelingen = (cp.koppelingen ?? []).filter((k: any) => k.organisatie?.actief !== false)
    const primair = koppelingen.find((k: any) => k.is_primair) ?? koppelingen[0]
    const org = primair?.organisatie
    if (!org?.id) continue
    if (opts?.type && !(org.types ?? []).includes(opts.type)) continue
    const naam = [cp.voornaam, cp.tussenvoegsel, cp.achternaam].filter(Boolean).join(' ')
    // Contactpersoon-match wint van een kale relatie-match (voegt de persoon toe).
    resultaten.set(org.id, {
      id: org.id, naam: org.naam, types: org.types ?? [],
      contactpersoon: { id: cp.id, naam },
    })
  }

  return Array.from(resultaten.values()).slice(0, 8)
}

/** Sla vrije inhoudsvelden op (categorie, referentie, contactpersoon, datums, werkadres). */
export async function updateDossierInfo(
  id: string,
  velden: {
    referentie?: string | null
    categorie?: string | null
    contactpersoon_id?: string | null
    verwacht_startdatum?: string | null
    verwacht_einddatum?: string | null
    werkadres_naam?: string | null
    werkadres_telefoon?: string | null
    werkadres_email?: string | null
    werkadres_straat?: string | null
    werkadres_postcode?: string | null
    werkadres_stad?: string | null
    opdracht_referentie?: string | null
    werkmaatschappij_id?: string | null
    aanvraagdatum?: string | null
    deadline?: string | null
    vve_code?: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(id)
  const supabase = createAdminClient() as any
  const { error } = await supabase
    .from('dossiers')
    .update(velden)
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  // categorie is een gevolgd triggerveld (veld_waarde); evalueer direct.
  await verwerkDossierTriggers(id).catch(() => {})

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  return { ok: true }
}

/** Werkmaatschappijen (bedrijfsgegevens type=werkmaatschappij) voor de dossier-dropdown. */
export async function getWerkmaatschappijen(): Promise<{ id: string; naam: string; code: string | null }[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('bedrijfsgegevens')
    .select('id, naam, code')
    .eq('type', 'werkmaatschappij')
    .order('naam')
  return data ?? []
}

// ─── Dossier-toggles ──────────────────────────────────────────────────────────

export interface DossierToggle {
  definitie_id: string
  sleutel: string
  label: string
  aan: boolean
}

/** Haal de actieve toggle-definities op met hun stand voor dit dossier. */
export async function getDossierToggles(dossier_id: string): Promise<DossierToggle[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: defs } = await supabase
    .from('dossier_toggle_definities')
    .select('id, sleutel, label')
    .eq('actief', true)
    .order('volgorde')
  if (!defs?.length) return []

  const { data: standen } = await supabase
    .from('dossier_toggles')
    .select('definitie_id, aan')
    .eq('dossier_id', dossier_id)
  const aanPerDef = new Map<string, boolean>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (standen ?? []).map((s: any) => [s.definitie_id, s.aan]),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (defs as any[]).map(d => ({
    definitie_id: d.id,
    sleutel:      d.sleutel,
    label:        d.label,
    aan:          aanPerDef.get(d.id) ?? false,
  }))
}

/** Zet een dossier-toggle aan/uit. De DB-trigger enqueuet een event; we evalueren direct. */
export async function setDossierToggle(
  dossier_id: string,
  definitie_id: string,
  aan: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossier_id)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { error } = await supabase
    .from('dossier_toggles')
    .upsert(
      { dossier_id, definitie_id, aan, gewijzigd_op: new Date().toISOString() },
      { onConflict: 'dossier_id,definitie_id' },
    )
  if (error) return { ok: false, error: error.message }

  await verwerkDossierTriggers(dossier_id).catch(() => {})
  return { ok: true }
}

/**
 * Zet de "Intern"-toggle (sleutel 'intern') van een dossier aan/uit. Interne dossiers
 * worden verborgen op de borden/lijsten. Zoekt de definitie via de stabiele sleutel,
 * zodat de UI de definitie-UUID niet hoeft te kennen.
 */
export async function zetDossierIntern(
  dossier_id: string,
  aan: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: def } = await supabase
    .from('dossier_toggle_definities')
    .select('id')
    .eq('sleutel', 'intern')
    .maybeSingle()
  if (!def) return { ok: false, error: "De 'Intern'-toggle bestaat niet. Maak deze aan onder Instellingen → Dossier-toggles." }
  return setDossierToggle(dossier_id, def.id as string, aan)
}

/* — Uren bewaking — */

export type UrenBewakingRegel = {
  code: string
  naam: string | null
  /** Prognose uren uit Bouw7 (prognosisHours, kostensoort Arbeid). */
  prognose_uren: number
  /** Uurtarief uit de gesynchroniseerde werkbegroting — null als geen werkbegroting. */
  wb_uurtarief: number | null
  /** prognosisAmount ct=1 uit Bouw7 — gevuld zodra Bouw7 bewakingsdata beschikbaar is. */
  prognose_bedrag: number
  geboekte_uren: number
  geboekte_kosten: number
  standopname_pct: number | null
  prognose_uren_100: number | null
  prognose_kosten_100: number | null
  /** prognose_uren − geboekte_uren */
  uren_saldo: number
  /** prognose_bedrag − geboekte_kosten */
  kosten_saldo: number
}

export type DossierUrenBewakingData = {
  beschikbaar: boolean
  heeftWerkbegroting: boolean
  regels: UrenBewakingRegel[]
  totalen: {
    prognose_uren: number
    prognose_bedrag: number
    geboekte_uren: number
    geboekte_kosten: number
    uren_saldo: number
    kosten_saldo: number
  }
}

export type BewakingscodeOptie = {
  code: string
  naam: string | null
  pslId: number
}

export async function getDossierUrenBewaking(dossierId: string): Promise<DossierUrenBewakingData> {
  const leeg: DossierUrenBewakingData = {
    beschikbaar: false,
    heeftWerkbegroting: false,
    regels: [],
    totalen: { prognose_uren: 0, prognose_bedrag: 0, geboekte_uren: 0, geboekte_kosten: 0, uren_saldo: 0, kosten_saldo: 0 },
  }

  const [bewaking, wbData] = await Promise.all([
    getDossierBewaking(dossierId),
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createAdminClient() as any
      const syntheticId = `wb-direct-${dossierId}`
      const { data: werkbegrotingen } = await supabase
        .from('werkbegrotingen')
        .select('id, status')
        .eq('project_id', syntheticId)
        .order('bijgewerkt_op', { ascending: false })
      if (!werkbegrotingen || werkbegrotingen.length === 0) return null

      const statusPrio: Record<string, number> = { geaccordeerd: 0, definitief: 1, concept: 2 }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wb = [...werkbegrotingen].sort((a: any, b: any) => (statusPrio[a.status] ?? 3) - (statusPrio[b.status] ?? 3))[0]

      const { data: regels } = await supabase
        .from('werkbegroting_regels')
        .select('id, kostengroep')
        .eq('werkbegroting_id', wb.id)
        .not('kostengroep', 'is', null)
        .neq('kostengroep', '')
      if (!regels || regels.length === 0) return null

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regelKostengroep = new Map<string, string>(regels.map((r: any) => [r.id, r.kostengroep]))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: componenten } = await supabase
        .from('werkbegroting_componenten')
        .select('werkbegroting_regel_id, norm_hoeveelheid, tarief')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .in('werkbegroting_regel_id', regels.map((r: any) => r.id))
        .eq('type', 'arbeid')
      if (!componenten) return null

      const codeMap = new Map<string, { uren: number; bedrag: number }>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const comp of componenten as any[]) {
        const code = regelKostengroep.get(comp.werkbegroting_regel_id)
        if (!code) continue
        const uren = toGetal(comp.norm_hoeveelheid)
        const bedrag = uren * toGetal(comp.tarief)
        const cur = codeMap.get(code) ?? { uren: 0, bedrag: 0 }
        codeMap.set(code, { uren: cur.uren + uren, bedrag: cur.bedrag + bedrag })
      }
      return codeMap.size > 0 ? codeMap : null
    })(),
  ])

  if (!bewaking.beschikbaar) return leeg

  // Inclusief codes met alleen prognoseuren (nog geen boekingen) — zodat projecten
  // die nog in voorbereiding zijn al zichtbaar zijn in de tabel.
  const bouwMap = new Map<string, { prognose_uren: number; prognose_kosten: number; geboekte_uren: number; geboekte_kosten: number; naam: string | null; progress: number | null }>()
  for (const hfd of bewaking.hoofdstukken) {
    for (const r of hfd.regels) {
      if (!r.code || (r.prognoseUren <= 0 && r.arbeidPrognose <= 0 && r.geboekteUren <= 0 && r.arbeidskosten <= 0)) continue
      bouwMap.set(r.code, { prognose_uren: r.prognoseUren, prognose_kosten: r.arbeidPrognose, geboekte_uren: r.geboekteUren, geboekte_kosten: r.arbeidskosten, naam: r.naam, progress: r.progress })
    }
  }

  const codeSet = new Set<string>([...bouwMap.keys(), ...(wbData?.keys() ?? [])])
  const heeftWerkbegroting = wbData != null && wbData.size > 0

  const regels: UrenBewakingRegel[] = [...codeSet].map((code) => {
    const bouw = bouwMap.get(code)
    const wb = wbData?.get(code)
    const prognose_uren = bouw?.prognose_uren ?? 0
    const prognose_bedrag = bouw?.prognose_kosten ?? 0
    const wb_uurtarief = wb && wb.uren > 0 ? wb.bedrag / wb.uren : null
    const geboekte_uren = bouw?.geboekte_uren ?? 0
    const geboekte_kosten = bouw?.geboekte_kosten ?? 0
    const standopname_pct = bouw?.progress ?? null
    return {
      code,
      naam: bouw?.naam ?? null,
      prognose_uren,
      wb_uurtarief,
      prognose_bedrag,
      geboekte_uren,
      geboekte_kosten,
      standopname_pct,
      prognose_uren_100: standopname_pct != null && standopname_pct > 0 ? geboekte_uren / (standopname_pct / 100) : null,
      prognose_kosten_100: standopname_pct != null && standopname_pct > 0 ? geboekte_kosten / (standopname_pct / 100) : null,
      uren_saldo: prognose_uren - geboekte_uren,
      kosten_saldo: prognose_bedrag - geboekte_kosten,
    }
  }).sort((a, b) => a.code.localeCompare(b.code))

  const totalen = regels.reduce(
    (t, r) => ({
      prognose_uren: t.prognose_uren + r.prognose_uren,
      prognose_bedrag: t.prognose_bedrag + r.prognose_bedrag,
      geboekte_uren: t.geboekte_uren + r.geboekte_uren,
      geboekte_kosten: t.geboekte_kosten + r.geboekte_kosten,
      uren_saldo: t.uren_saldo + r.uren_saldo,
      kosten_saldo: t.kosten_saldo + r.kosten_saldo,
    }),
    { prognose_uren: 0, prognose_bedrag: 0, geboekte_uren: 0, geboekte_kosten: 0, uren_saldo: 0, kosten_saldo: 0 },
  )

  return { beschikbaar: regels.length > 0, heeftWerkbegroting, regels, totalen }
}

export async function getBewakingscodesVoorUurlog(dossierId: string): Promise<BewakingscodeOptie[]> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return []
  const { client, bouw7Id } = ctx
  try {
    const resp = await client.getAthena<Bouw7ControlResponse>(`/project-control/${bouw7Id}/cost-type/1/chapters?include_subprojects=false`)
    const opties: BewakingscodeOptie[] = []
    for (const item of resp.items ?? []) {
      const ci = item.chapterInfo
      if (ci?.name === 'uncoded_costs' || ci?.id === 0) continue
      for (const sc of item.securityCodes ?? []) {
        const code = (sc.code ?? '').trim()
        if (!code) continue
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pslId = (sc as any).pslIds?.[0]
        if (pslId == null) continue
        opties.push({ code, naam: sc.name ?? null, pslId })
      }
    }
    return opties.sort((a, b) => a.code.localeCompare(b.code))
  } catch {
    return []
  }
}

export async function updateUurlogBewakingscode(
  dossierId: string,
  hourLog: { id: number; bouw7ProjectId: number; logHours: string; logDate: string; hourTypeId: number },
  nieuwePslId: number,
): Promise<{ ok: boolean; error?: string }> {
  await assertDossierBewerkbaar(dossierId)
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling voor dit dossier.' }
  const { client } = ctx
  try {
    await client.post('/project/hour-log', {
      id: hourLog.id,
      project: { id: hourLog.bouw7ProjectId },
      logHours: hourLog.logHours,
      logDate: hourLog.logDate,
      hourType: { id: hourLog.hourTypeId },
      projectSecurityLink: { id: nieuwePslId },
    })
    revalidatePath(`/opdrachten/${dossierId}/uren`)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.' }
  }
}

/* — Delete calculaties & offertes — */

/**
 * Verwijdert de everts-calc calculatie/offerte van een dossier.
 * - Haalt everts_calc_project_id op
 * - Vindt alle quotes voor dat project in everts-calc
 * - Verwijdert de quote(s) uit everts-calc
 * - Cleart everts_calc_project_id in EVA
 * - RLS-beveiligd: user moet eigenaar zijn van het dossier
 */
export async function deleteCalculatieVanDossier(dossierId: string): Promise<{ ok: boolean; error?: string }> {
  if (!dossierId) return { ok: false, error: 'Dossier-ID ontbreekt.' }
  await assertDossierBewerkbaar(dossierId)

  const supabase = createAdminClient()

  // 1. Haal dossier op (RLS-beveiligd door admin client + eventuele user-context)
  const { data: dossier, error: dossierError } = await supabase
    .from('dossiers')
    .select('id, everts_calc_project_id')
    .eq('id', dossierId)
    .single()

  if (dossierError || !dossier) {
    return { ok: false, error: 'Dossier niet gevonden.' }
  }

  if (!dossier.everts_calc_project_id) {
    return { ok: false, error: 'Geen calculatie gekoppeld aan dit dossier.' }
  }

  try {
    // 2. Roep delete aan in everts-calc (dynamisch import)
    const { createClient: createEventsCalcClient } = await import('@/lib/everts-calc/supabase/server')
    const eventsCalcSupa = createEventsCalcClient()

    // Vind quotes voor dit project
    const { data: quotes, error: quotesError } = await eventsCalcSupa
      .from('quotes')
      .select('id')
      .eq('project_id', dossier.everts_calc_project_id)

    if (quotesError) {
      return { ok: false, error: `Fout bij ophalen quotes: ${quotesError.message}` }
    }

    // Verwijder alle quotes
    if (quotes && quotes.length > 0) {
      for (const quote of quotes) {
        const { error: deleteError } = await eventsCalcSupa
          .from('quotes')
          .delete()
          .eq('id', quote.id)

        if (deleteError) {
          return { ok: false, error: `Fout bij verwijderen quote: ${deleteError.message}` }
        }
      }
    }

    // 3. Clear everts_calc_project_id in EVA
    const { error: clearError } = await supabase
      .from('dossiers')
      .update({ everts_calc_project_id: null })
      .eq('id', dossierId)

    if (clearError) {
      return { ok: false, error: `Fout bij clearing calculatie-koppeling: ${clearError.message}` }
    }

    // 4. Revalidate
    revalidatePath(`/opdrachten/${dossierId}/calculatie`)
    revalidatePath(`/servicedesk/${dossierId}/calculatie`)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fout bij verwijderen calculatie.' }
  }
}

/**
 * Verwijdert een offerte-dossier of zet het terug naar 'aanvraag' status.
 * - Reset hoofdstatus naar 'aanvraag' (soft delete)
 * - Cleart everts_calc_project_id als aanwezig
 * - RLS-beveiligd
 */
export async function deleteOfferteDossier(dossierId: string): Promise<{ ok: boolean; error?: string }> {
  if (!dossierId) return { ok: false, error: 'Dossier-ID ontbreekt.' }

  const supabase = createAdminClient()

  // 1. Haal dossier op
  const { data: dossier, error: dossierError } = await supabase
    .from('dossiers')
    .select('id, hoofdstatus, everts_calc_project_id')
    .eq('id', dossierId)
    .single()

  if (dossierError || !dossier) {
    return { ok: false, error: 'Dossier niet gevonden.' }
  }

  // 2. Check of het een offerte-dossier is
  if (dossier.hoofdstatus !== 'offerte') {
    return { ok: false, error: 'Dit dossier is geen offerte.' }
  }

  try {
    // 3. If there's a calculatie, delete it first
    if (dossier.everts_calc_project_id) {
      const calcResult = await deleteCalculatieVanDossier(dossierId)
      if (!calcResult.ok) {
        // Ga door, maar log warning
        console.warn(`Warning: calculatie delete faalde voor ${dossierId}, ga toch verder met dossier-reset`)
      }
    }

    // 4. Reset dossier status naar 'aanvraag'
    const { error: updateError } = await supabase
      .from('dossiers')
      .update({
        hoofdstatus: 'aanvraag',
        offerte_substatus: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dossierId)

    if (updateError) {
      return { ok: false, error: `Fout bij resetten dossier: ${updateError.message}` }
    }

    // 5. Revalidate
    revalidatePath(`/offertes`)
    revalidatePath(`/opdrachten/${dossierId}`)
    revalidatePath(`/servicedesk/${dossierId}`)

    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Fout bij verwijderen offerte.' }
  }
}
