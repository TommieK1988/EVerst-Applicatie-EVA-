'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Hoofdstatus, AanvraagSubstatus, OfferteSubstatus, OpdrachtSubstatus, ServicedeskSubstatus, RelatieFactuuradres } from '@everts/database'
import type { DossierRij, DossierSubstatus } from '@/components/dossiers/types'
import { verwerkDossierTriggers } from '@/app/(platform)/taken/actions/sjablonen'
import { Bouw7Client, type Bouw7ProjectFinancial } from '@/lib/bouw7/client'

type DossierResult =
  | { ok: true; data: DossierRij[] }
  | { ok: false; error: string; missingTable?: boolean }

type MaakResult =
  | { ok: true; data: DossierRij }
  | { ok: false; error: string }

const ROL_SELECT = `
  relaties!klant_id ( naam ),
  projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam ),
  teamleider:medewerkers!teamleider_id ( voornaam, tussenvoegsel, achternaam ),
  werkvoorbereider:medewerkers!werkvoorbereider_id ( voornaam, tussenvoegsel, achternaam ),
  calculator:medewerkers!calculator_id ( voornaam, tussenvoegsel, achternaam ),
  uitvoerder:medewerkers!uitvoerder_id ( voornaam, tussenvoegsel, achternaam ),
  controller:medewerkers!controller_id ( voornaam, tussenvoegsel, achternaam ),
  contactpersoon:contactpersonen!contactpersoon_id ( voornaam, tussenvoegsel, achternaam, email, telefoon )
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
    teamleider_naam:       medNaam(row.teamleider),
    werkvoorbereider_naam: medNaam(row.werkvoorbereider),
    calculator_naam:       medNaam(row.calculator),
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

/** Haal dossiers op voor een specifieke medewerker (alle rol-kolommen), verrijkt met klant- en rolnamen. */
export async function getMijnDossiers(
  medewerkerID: string,
  hoofdstatus: Hoofdstatus,
  limit = 10,
): Promise<DossierResult> {
  const supabase = createAdminClient() as any

  const { data, error } = await supabase
    .from('dossiers')
    .select(`*, ${ROL_SELECT}`)
    .eq('hoofdstatus', hoofdstatus)
    .or(
      `project_manager_id.eq.${medewerkerID},` +
      `teamleider_id.eq.${medewerkerID},` +
      `werkvoorbereider_id.eq.${medewerkerID},` +
      `calculator_id.eq.${medewerkerID},` +
      `uitvoerder_id.eq.${medewerkerID},` +
      `controller_id.eq.${medewerkerID}`,
    )
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    const missingTable = error.message.includes('does not exist') || error.code === '42P01'
    return { ok: false, error: error.message, missingTable }
  }

  return { ok: true, data: (data ?? []).map(mapRij) }
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

/** Update de substatus van een dossier. De trigger in de DB handelt fase-promoties af. */
export async function updateDossierSubstatus(
  id: string,
  nieuweSubstatus: DossierSubstatus
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { data: huidig, error: fetchError } = await supabase
    .from('dossiers')
    .select('hoofdstatus')
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

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  return { ok: true }
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

/** Zoek relaties op naam (voor de aanvraag-combobox). */
export async function zoekRelaties(query: string): Promise<{ id: string; naam: string; type: string }[]> {
  if (!query.trim()) return []
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('relaties')
    .select('id, naam, type')
    .ilike('naam', `%${query.trim()}%`)
    .eq('actief', true)
    .order('naam', { ascending: true })
    .limit(8)
  return (data ?? []) as { id: string; naam: string; type: string }[]
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
