'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Hoofdstatus, AanvraagSubstatus, OfferteSubstatus, OpdrachtSubstatus, ServicedeskSubstatus, RelatieFactuuradres } from '@everts/database'
import type { DossierRij, DossierSubstatus } from '@/components/dossiers/types'
import { verwerkDossierTriggers } from '@/app/(platform)/taken/actions/sjablonen'
import { schrijfBouw7Projectstatus, type Bouw7WriteResult } from './bouw7-status'
import {
  Bouw7Client,
  type Bouw7ProjectFinancial,
  type Bouw7ControlResponse,
  type Bouw7ControlEntry,
  type Bouw7CostTypeId,
  type Bouw7PurchaseInvoice,
  type Bouw7ContractOrderLine,
  type Bouw7SubcontractorContract,
  type Bouw7EmployeeHourLogResponse,
  type Bouw7ProjectInvoiceTerm,
  type Bouw7SalesInvoice,
  type Bouw7ListResponse,
} from '@/lib/bouw7/client'

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
  controller:medewerkers!controller_id ( voornaam, tussenvoegsel, achternaam ),
  contactpersoon:contactpersonen!contactpersoon_id ( voornaam, tussenvoegsel, achternaam, email, telefoon )
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
    contactpersoon_naam:     medNaam(row.contactpersoon),
    contactpersoon_email:    row.contactpersoon?.email    ?? null,
    contactpersoon_telefoon: row.contactpersoon?.telefoon ?? null,
  }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
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

  return { ok: true, data: (data ?? []).map(mapRij) }
}

/** Update de servicedesk substatus van een dossier (voor kanban drag & drop). */
export async function updateServicedeskSubstatus(
  id: string,
  nieuweSubstatus: ServicedeskSubstatus | string,
): Promise<{ ok: boolean; error?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { error } = await supabase
    .from('dossiers')
    .update({ servicedesk_substatus: nieuweSubstatus })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  await verwerkDossierTriggers(id).catch(() => {})

  revalidatePath('/servicedesk')
  return { ok: true }
}

/** Haal unieke Bouw7-categorieën op uit de dossiers-tabel (voor de categorie-dropdown in InformatieTab). */
export async function getUniekeBouw7Categorieen(): Promise<string[]> {
  const supabase = createAdminClient() as any

  const { data } = await supabase
    .from('dossiers')
    .select('bouw7_categorie_naam')
    .not('bouw7_categorie_naam', 'is', null)

  if (!data) return []
  const uniek = [...new Set((data as any[]).map(d => d.bouw7_categorie_naam as string))]
  return uniek.sort()
}

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
 * `opts.schrijfBouw7`: schrijf de nieuwe opdracht-substatus óók terug naar Bouw7
 * (alleen voor opdracht-dossiers met een `bouw7_id`). De EVA-update gaat altijd door;
 * een mislukte Bouw7-write wordt teruggegeven in `bouw7` zodat de UI een toast kan tonen
 * (geen rollback — de 2×/dag lees-sync corrigeert eventuele drift).
 */
export async function updateDossierSubstatus(
  id: string,
  nieuweSubstatus: DossierSubstatus,
  opts?: { schrijfBouw7?: boolean }
): Promise<{ ok: true; bouw7?: Bouw7WriteResult } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { data: huidig, error: fetchError } = await supabase
    .from('dossiers')
    .select('hoofdstatus, bouw7_id')
    .eq('id', id)
    .single()

  if (fetchError) return { ok: false, error: fetchError.message }

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

  // Two-way: opdracht-substatus terugschrijven naar Bouw7 (alleen opdracht-dossiers met koppeling).
  let bouw7: Bouw7WriteResult | undefined
  if (opts?.schrijfBouw7 && huidig.hoofdstatus === 'opdracht' && huidig.bouw7_id != null) {
    bouw7 = await schrijfBouw7Projectstatus(huidig.bouw7_id, nieuweSubstatus, 'opdracht')
  }

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  return { ok: true, bouw7 }
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
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any

  // Zet lege strings om naar null (select kan "" retourneren bij geen keuze)
  const payload: Record<string, string | null> = {}
  for (const [k, v] of Object.entries(rollen)) {
    payload[k] = v === '' ? null : (v ?? null)
  }

  const { error } = await supabase
    .from('dossiers')
    .update(payload)
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  // Rol-velden zijn gevolgde triggervelden (rol_toegewezen); evalueer direct.
  await verwerkDossierTriggers(id).catch(() => {})

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  return { ok: true }
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
  arbeidskosten: number
  onderaanneming: number
  materiaal: number
  inkoopMaterieelAfval: number
  verwachteKosten: number
  geboekteKosten: number
}

export type DossierBewakingData = {
  beschikbaar: boolean
  hoofdstukken: { id: number | null; naam: string; regels: BewakingRegel[] }[]
  totalen: BewakingTotalen
  /** Geboekte uren op projectniveau (= som van de arbeid-besteed-uren). */
  geboekteUrenProject: number | null
}

const toGetal = (v: unknown): number => {
  if (v == null) return 0
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isNaN(n) ? 0 : n
}

const legeRegel = (): BewakingRegel => ({
  code: null, naam: null, hoofdstukId: null, hoofdstuk: null,
  begroot: 0, meerwerk: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0,
  arbeidskosten: 0, onderaanneming: 0, materiaal: 0, inkoopMaterieelAfval: 0,
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
    beschikbaar: false, hoofdstukken: [],
    totalen: {
      begroot: 0, meerwerk: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0, arbeidskosten: 0,
      onderaanneming: 0, materiaal: 0, inkoopMaterieelAfval: 0, verwachteKosten: 0, geboekteKosten: 0,
    },
    geboekteUrenProject: null,
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
    const maxBudgetVoorProgress = new Map<string, number>()

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
        maxBudgetVoorProgress.set(key, -1)
      }

      const budget = toGetal(e.budgetAmount)
      const kosten = toGetal(e.costAmount)
      r.begroot += budget
      r.meerwerk += toGetal(e.additionalWorkAmount)
      r.prognose += toGetal(e.prognosisAmount)
      r.prognoseUren += toGetal(e.hourInfo?.prognosisHours)
      r.geboekteUren += toGetal(e.hourInfo?.costHours)

      if (ct === 1) r.arbeidskosten += kosten
      else if (ct === 3) r.onderaanneming += kosten
      else if (ct === 5) r.materiaal += kosten
      else r.inkoopMaterieelAfval += kosten // 2=Inkoop, 4=Materieel, 6=Afval

      // % gereed: neem de waarde van de kostensoort met de grootste begroting voor deze code.
      if (e.progress != null && budget >= (maxBudgetVoorProgress.get(key) ?? -1)) {
        maxBudgetVoorProgress.set(key, budget)
        r.progress = toGetal(e.progress)
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
      arbeidskosten: som((r) => r.arbeidskosten),
      onderaanneming: som((r) => r.onderaanneming),
      materiaal: som((r) => r.materiaal),
      inkoopMaterieelAfval: som((r) => r.inkoopMaterieelAfval),
      verwachteKosten: orderLines.total || som((r) => r.verwachteKosten),
      geboekteKosten: som((r) => r.geboekteKosten),
    }

    return {
      beschikbaar: alleRegels.length > 0,
      hoofdstukken,
      totalen,
      geboekteUrenProject: totalen.geboekteUren,
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
async function bouw7VoorDossier(dossierId: string): Promise<{ client: Bouw7Client; bouw7Id: string } | null> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase.from('dossiers').select('bouw7_id').eq('id', dossierId).single()
  if (!dossier?.bouw7_id) return null
  const { data: integratie } = await supabase.from('integraties').select('config').eq('naam', 'bouw7').maybeSingle()
  const config = integratie?.config as Record<string, string> | undefined
  if (!config?.api_key || !config?.app_name) return null
  return { client: new Bouw7Client(config.api_key, config.app_name), bouw7Id: String(dossier.bouw7_id) }
}

/* — Inkoop — */

export type InkoopOrderRegel = {
  code: string | null
  omschrijving: string | null
  relatie: string | null
  aantal: number | null
  eenheid: string | null
  prijs: number | null
  totaal: number
  type: 'inkoop' | 'onderaanneming'
}
export type OnderaannemerContract = {
  code: string | null
  onderaannemer: string | null
  omschrijving: string | null
  contractbedrag: number
  openstaand: number
  status: string | null
}
export type GeboekteKostenRegel = { code: string | null; naam: string | null; bedrag: number }
export type DossierInkoopData = {
  beschikbaar: boolean
  inkooporders: InkoopOrderRegel[]
  onderaannemers: OnderaannemerContract[]
  geboekteKosten: GeboekteKostenRegel[]
  totalen: { besteld: number; onderaanneming: number; geboekt: number }
}

/**
 * Inkoop-overzicht van een dossier: inkooporders (contract-order-lines), onderaannemerscontracten
 * en geboekte kosten (inkoopfacturen, deduped op deliveryTicket). Live uit Bouw7.
 */
export async function getDossierInkoop(dossierId: string): Promise<DossierInkoopData> {
  const leeg: DossierInkoopData = {
    beschikbaar: false, inkooporders: [], onderaannemers: [], geboekteKosten: [],
    totalen: { besteld: 0, onderaanneming: 0, geboekt: 0 },
  }
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return leeg
  const { client, bouw7Id } = ctx

  try {
    const [orderResp, subResp, invoices] = await Promise.all([
      client.get<{ items?: Bouw7ContractOrderLine[]; total?: number | string }>('/list/contract-order-lines', {
        q: `project.id = ${bouw7Id} SORT(description, ASC) LIMIT 1000`,
      }).catch(() => ({ items: [] as Bouw7ContractOrderLine[], total: 0 })),
      client.get<Bouw7ListResponse<Bouw7SubcontractorContract>>('/list/subcontractor-contracts', {
        q: `project.id = ${bouw7Id} LIMIT 500`,
      }).catch(() => ({ items: [] as Bouw7SubcontractorContract[] } as Bouw7ListResponse<Bouw7SubcontractorContract>)),
      client.getApolloAll<Bouw7PurchaseInvoice>('/search/purchase-invoices', `project.id = ${bouw7Id}`).catch(() => []),
    ])

    const inkooporders: InkoopOrderRegel[] = (orderResp.items ?? []).map((l) => {
      const aantal = toGetal(l.quantity) * (l.quantityFactor != null ? toGetal(l.quantityFactor) : 1)
      const isOa = l.contact?.type === 'subcontractor'
      return {
        code: l.projectSecurityLink?.code ?? null,
        omschrijving: l.description ?? null,
        relatie: l.contact?.name ?? null,
        aantal: aantal || null,
        eenheid: l.unit ?? null,
        prijs: l.unitPrice != null ? toGetal(l.unitPrice) : null,
        totaal: toGetal(l.totalPrice),
        type: isOa ? 'onderaanneming' : 'inkoop',
      }
    })

    const onderaannemers: OnderaannemerContract[] = (subResp.items ?? []).map((c) => ({
      code: c.projectSecurityLink?.code ?? null,
      onderaannemer: c.subcontractor?.name ?? null,
      omschrijving: c.name ?? c.description ?? null,
      contractbedrag: toGetal(c.price),
      openstaand: toGetal(c.outstandingCosts),
      status: c.statusName ?? null,
    }))

    // Geboekte kosten: inkoopfacturen deduped op deliveryTicket.id (termijnen → zelfde bon).
    const bonnen = new Map<number, GeboekteKostenRegel>()
    for (const inv of invoices) {
      const dt = inv.deliveryTicket
      if (!dt?.id || bonnen.has(dt.id)) continue
      const c = dt.securityLink?.code
      bonnen.set(dt.id, { code: c?.code ?? null, naam: c?.name ?? null, bedrag: toGetal(dt.cost) })
    }
    const geboekteKosten = [...bonnen.values()]

    const besteld = toGetal(orderResp.total) || inkooporders.reduce((s, r) => s + r.totaal, 0)
    const onderaanneming = onderaannemers.reduce((s, c) => s + c.contractbedrag, 0)
    const geboekt = geboekteKosten.reduce((s, r) => s + r.bedrag, 0)

    return {
      beschikbaar: inkooporders.length > 0 || onderaannemers.length > 0 || geboekteKosten.length > 0,
      inkooporders, onderaannemers, geboekteKosten,
      totalen: { besteld, onderaanneming, geboekt },
    }
  } catch {
    return leeg
  }
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
        }
      })
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

export type VerkoopTermijn = {
  nummer: number
  omschrijving: string | null
  percentage: number | null
  bedrag: number
  gefactureerd: boolean
  invoiceableAt: string | null
}
export type VerkoopFactuur = {
  factuurnummer: string | null
  datum: string | null
  vervaldatum: string | null
  bedrag: number
  betaald: boolean
  isCredit: boolean
}
export type DossierVerkoopData = {
  beschikbaar: boolean
  termijnenBeschikbaar: boolean
  termijnen: VerkoopTermijn[]
  facturen: VerkoopFactuur[]
  betaalgegevens: DossierFinancieelData['relatieFacturatie']
  totalen: { aanneemsom: number; gefactureerd: number; openstaand: number }
}

/**
 * Verkoop-overzicht van een dossier: termijnen (project-invoice-terms), verkoopfacturen (invoices)
 * en betaalgegevens van de klant (relatie_facturatie). Live uit Bouw7 + EVA. Defensief: ontbrekend
 * termijnen-endpoint → termijnenBeschikbaar=false zonder de tab te breken.
 */
export async function getDossierVerkoop(dossierId: string): Promise<DossierVerkoopData> {
  const leeg: DossierVerkoopData = {
    beschikbaar: false, termijnenBeschikbaar: false, termijnen: [], facturen: [], betaalgegevens: null,
    totalen: { aanneemsom: 0, gefactureerd: 0, openstaand: 0 },
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

  try {
    const termResp = await client.get<Bouw7ListResponse<Bouw7ProjectInvoiceTerm>>('/list/project-invoice-terms', {
      q: `statement.project.id = ${bouw7Id} LIMIT 500`,
    })
    termijnenBeschikbaar = true
    termijnen = (termResp.items ?? []).map((t, i) => ({
      nummer: i + 1,
      omschrijving: t.description ?? null,
      percentage: t.percentage != null ? toGetal(t.percentage) : null,
      bedrag: toGetal(t.subtotal),
      gefactureerd: t.invoiceLine != null,
      invoiceableAt: t.invoiceableAt ? t.invoiceableAt.slice(0, 10) : null,
    }))
  } catch {
    termijnenBeschikbaar = false
  }

  try {
    const invResp = await client.get<Bouw7ListResponse<Bouw7SalesInvoice>>('/list/invoices', {
      q: `project.id = ${bouw7Id} SORT(date, DESC) LIMIT 500`,
    })
    facturen = (invResp.items ?? []).map((inv) => ({
      factuurnummer: inv.invoiceNumber ?? null,
      datum: inv.date ? inv.date.slice(0, 10) : null,
      vervaldatum: inv.dueDate ? inv.dueDate.slice(0, 10) : null,
      bedrag: toGetal(inv.total),
      betaald: inv.datePaid != null,
      isCredit: !!inv.isCredit,
    }))
  } catch {
    facturen = []
  }

  const aanneemsom = toGetal(bouw7Financial?.fixedPrice) || toGetal(bouw7Financial?.revenue?.budgeted)
  const gefactureerd = facturen.length
    ? facturen.reduce((s, f) => s + (f.isCredit ? -f.bedrag : f.bedrag), 0)
    : toGetal(bouw7Financial?.revenue?.realised)
  const openstaand = Math.max(0, aanneemsom - gefactureerd)

  return {
    beschikbaar: termijnen.length > 0 || facturen.length > 0 || aanneemsom > 0,
    termijnenBeschikbaar,
    termijnen,
    facturen,
    betaalgegevens: relatieFacturatie,
    totalen: { aanneemsom, gefactureerd, openstaand },
  }
}

/** Zoek relaties op naam (voor de aanvraag-combobox). Optioneel filteren op relatie-type. */
export async function zoekRelaties(
  query: string,
  opts?: { type?: string },
): Promise<{ id: string; naam: string; types: string[] }[]> {
  if (!query.trim()) return []
  const supabase = createAdminClient() as any
  let q = supabase
    .from('relaties')
    .select('id, naam, types')
    .ilike('naam', `%${query.trim()}%`)
    .eq('actief', true)
  if (opts?.type) q = q.contains('types', [opts.type])
  const { data } = await q.order('naam', { ascending: true }).limit(8)
  return (data ?? []) as { id: string; naam: string; types: string[] }[]
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
    interne_opmerkingen?: string | null
    opdracht_referentie?: string | null
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
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
