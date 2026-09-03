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
import { schrijfBouw7BonBewakingscode } from './bouw7-bewakingscode'
import { getVoortgang } from './voortgang'
import {
  type Bouw7Client,
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
import { getBouw7ClientOfNull } from '@/lib/bouw7/config'
import { deriveUursoorten } from '@/lib/bouw7/derive-stamdata'
import { laadKaartBedragen, ID_BLOK } from './kaart-bedragen'
import { haalAlleRijen } from '@/lib/supabase/paginate'

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
 * klant- en projectleidernaam. Scheelt nog fors t.o.v. `LIJST_SELECT` hieronder
 * (45 kolommen + 9 joins). Gemodelleerd op getActieveDossierContext. `mapRij` vult
 * de overige rolnamen netjes met null.
 */
const LEAN_SELECT = `
  id, dossiernummer, titel, hoofdstatus,
  aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
  gearchiveerd, updated_at, verwacht_startdatum, verwacht_einddatum,
  relaties!klant_id ( naam ),
  projectleider:medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam )
`.trim()

/**
 * Kolommen die de overzichten (kanban, lijst, kolombeheer) daadwerkelijk gebruiken.
 *
 * `select('*')` haalde alle 84 kolommen van `dossiers` op. Bij 400+ opdrachten is dat
 * ~1,3 MB JSON per paginabezoek, waarvan het leeuwendeel bestaat uit veldnamen die per rij
 * worden herhaald voor kolommen die geen enkel overzicht toont (sync-hashes, SharePoint-
 * verwijzingen, btw-splitsing, geocode-velden). Deze projectie halveert dat ruim zonder dat
 * er een kolom verdwijnt.
 *
 * Voeg een kolom hier toe zodra een kaart of een lijstkolom hem gaat tonen — anders blijft
 * hij leeg zonder foutmelding. De detailpagina gebruikt bewust `getDossierById`, die nog
 * wél alles ophaalt.
 *
 * `everts_calc_project_id` staat er niet voor de weergave in maar voor `laadKaartBedragen`:
 * die koppelt er de EVA-offerte aan.
 */
const LIJST_KOLOMMEN = `
  id, dossiernummer, titel, klant_id, hoofdstatus,
  aanvraag_substatus, offerte_substatus, opdracht_substatus, servicedesk_substatus,
  bedrag_excl_btw, bedrag_incl_btw, kostprijs_excl_btw, mandaat_bedrag,
  verwacht_startdatum, verwacht_einddatum, aanvraagdatum, deadline, verzonden_op,
  created_at, updated_at, gearchiveerd,
  categorie, referentie, opdracht_referentie, opmerkingen, vve_code, facturatiemethode,
  werkadres_naam, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad,
  bouw7_id, bouw7_laatst_sync, bouw7_sync_status, bouw7_aanmaakdatum,
  bouw7_categorie, bouw7_categorie_naam, bouw7_projectstatus_naam, bouw7_quotation_status,
  bouw7_bestelregels_afwijking, bouw7_uren_overschrijding, wb_ongeaccordeerde_wijzigingen,
  offerte_verstuurd_aantal, offerte_verstuurd_som_excl_btw,
  everts_calc_project_id
`.trim()

/** Volledige projectie voor de overzichten: de lijstkolommen plus de rol-joins. */
const LIJST_SELECT = `${LIJST_KOLOMMEN}, ${ROL_SELECT}`

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
 * Verrijkingsgegevens per dossier: taken-tellers, de nieuwste notitie en de Intern-vlag.
 *
 * Dit kwam uit vier losse queries die álle taken en álle notities van de getoonde dossiers
 * ophaalden om ze vervolgens in JavaScript te tellen. Bij 400+ opdrachten was dat honderden
 * kilobytes per paginabezoek. De view `dossier_lijst_verrijking` telt hetzelfde in de database
 * (migratie 20260831c) en geeft één compacte rij per dossier terug.
 *
 * Blokken van 150 omdat een `.in()` over 400 uuid's een URL van tienduizenden tekens wordt;
 * PostgREST kapt die af of weigert hem. De blokken gaan parallel — ze hebben niets van elkaar
 * nodig en achter elkaar wachten kost onnodig een paar honderd milliseconden.
 */
type LijstVerrijking = {
  taken_open: number
  taken_totaal: number
  notitie_aantal: number
  notitie_laatste_inhoud: string | null
  notitie_laatste_auteur: string | null
  notitie_laatste_op: string | null
  intern: boolean
}

async function getLijstVerrijking(ids: string[]): Promise<Map<string, LijstVerrijking>> {
  const uit = new Map<string, LijstVerrijking>()
  if (ids.length === 0) return uit

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const blokken: string[][] = []
  for (let i = 0; i < ids.length; i += ID_BLOK) blokken.push(ids.slice(i, i + ID_BLOK))

  const resultaten = await Promise.all(
    blokken.map(blok => supabase.from('dossier_lijst_verrijking').select('*').in('dossier_id', blok)),
  )

  for (const { data } of resultaten) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      uit.set(r.dossier_id as string, {
        taken_open:             r.taken_open   ?? 0,
        taken_totaal:           r.taken_totaal ?? 0,
        notitie_aantal:         r.notitie_aantal ?? 0,
        notitie_laatste_inhoud: r.notitie_laatste_inhoud ?? null,
        notitie_laatste_auteur: r.notitie_laatste_auteur ?? null,
        notitie_laatste_op:     r.notitie_laatste_op     ?? null,
        intern:                 r.intern === true,
      })
    }
  }

  return uit
}

/**
 * Verrijkt rijen met de `intern`-vlag (Intern-toggle aan/uit), de taken-tellers, de notitie-
 * samenvatting en de EVA-eigen bedragen (calculatie-offerte, goedgekeurd meerwerk, stelposten,
 * opties). Dat laatste is nodig omdat `bedrag_excl_btw` alleen door de Bouw7-sync wordt
 * geschreven; zie kaart-bedragen.ts.
 *
 * Twee bronnen, parallel: de view achter `getLijstVerrijking` en de bedragen uit
 * `laadKaartBedragen`.
 */
async function verrijkDossiers(rijen: DossierRij[]): Promise<DossierRij[]> {
  const ids = rijen.map(r => r.id)
  const [verrijking, bedragen] = await Promise.all([
    getLijstVerrijking(ids),
    // Best effort: zonder verrijking valt de kaart terug op het kale Bouw7-bedrag.
    laadKaartBedragen(rijen).catch(() => new Map()),
  ])
  if (verrijking.size === 0 && bedragen.size === 0) return rijen

  return rijen.map(r => {
    const v = verrijking.get(r.id)
    return {
      ...r,
      intern: v?.intern || r.intern,
      taken_open:   v?.taken_open   ?? 0,
      taken_totaal: v?.taken_totaal ?? 0,
      notitie_aantal:         v?.notitie_aantal ?? 0,
      notitie_laatste_inhoud: v?.notitie_laatste_inhoud ?? null,
      notitie_laatste_auteur: v?.notitie_laatste_auteur ?? null,
      notitie_laatste_op:     v?.notitie_laatste_op     ?? null,
      ...(bedragen.get(r.id) ?? {}),
    }
  })
}

/** Haal alle dossiers op voor een fase, verrijkt met klant- en rolnamen. */
/**
 * Eén dossierlijst ophalen: filter erop, gepagineerd uitlezen, verrijken.
 *
 * Gepagineerd omdat PostgREST elke respons stil afkapt op 1000 rijen — zonder error, gewoon een
 * halve lijst. Voor een dossieroverzicht betekent dat: dossiers die de gebruiker niet ziet en
 * niet mist. Zie lib/supabase/paginate.ts. De extra `.order('id')` maakt de sortering uniek,
 * anders kan de paginering rijen overslaan of dubbel teruggeven.
 */
async function haalDossierLijst(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filter: (q: any) => any,
): Promise<DossierResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rijen = await haalAlleRijen<any>((van, tot) =>
      filter(supabase.from('dossiers').select(LIJST_SELECT)).order('id').range(van, tot))
    return { ok: true, data: await verrijkDossiers(rijen.map(mapRij)) }
  } catch (e: unknown) {
    const bericht = e instanceof Error ? e.message : 'Ophalen dossiers mislukt'
    const missingTable = bericht.includes('does not exist') || bericht.includes('42P01')
    return { ok: false, error: bericht, missingTable }
  }
}

export async function getDossiers(hoofdstatus: Hoofdstatus): Promise<DossierResult> {
  return haalDossierLijst(q => q
    .eq('hoofdstatus', hoofdstatus)
    .order('created_at', { ascending: false }))
}

/**
 * Haal dossiers op gefilterd op Bouw7 projectstatus-naam prefix.
 * Valt terug op hoofdstatus-query voor dossiers zonder Bouw7-koppeling.
 * prefix: bijv. '01.' voor aanvragen, '09.' + '08.' voor offertes.
 */
export async function getDossiersByBouw7Prefix(prefixen: string[], fallbackHoofdstatus?: Hoofdstatus): Promise<DossierResult> {
  const likeCondities = prefixen
    .map(p => `bouw7_projectstatus_naam.ilike.${p}%`)
    .join(',')

  // Bouw OR-query: match op bouw7 prefix, of (geen bouw7 EN fallback hoofdstatus)
  const orClause = fallbackHoofdstatus
    ? `${likeCondities},and(bouw7_projectstatus_naam.is.null,hoofdstatus.eq.${fallbackHoofdstatus})`
    : likeCondities

  return haalDossierLijst(q => q
    .or(orClause)
    .order('created_at', { ascending: false }))
}

/**
 * Haal dossiers op voor de Aanvragen-tab:
 * - Alle actieve '01.'-dossiers
 * - Handmatige aanvragen zonder Bouw7-koppeling
 * - Dossiers die de afgelopen 7 dagen zijn verzonden (ook op Offertes zichtbaar)
 */
export async function getDossiersVoorAanvragen(): Promise<DossierResult> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  return haalDossierLijst(q => q
    .or(
      // 01-dossiers die via de Bouw7-offertestatus naar hoofdstatus 'offerte' zijn verhuisd
      // (gewonnen/mondelinge toezegging) horen op de Offertes-tab, niet hier.
      `and(bouw7_projectstatus_naam.ilike.01.%,hoofdstatus.eq.aanvraag),` +
      `and(bouw7_projectstatus_naam.is.null,hoofdstatus.eq.aanvraag),` +
      `and(offerte_substatus.eq.verzonden,verzonden_op.gte.${cutoff})`
    )
    .order('created_at', { ascending: false }))
}

/**
 * Haal dossiers op voor de Offertes-tab:
 * - Bouw7-dossiers met projectstatus 08/09
 * - Alle dossiers met hoofdstatus 'offerte' — vangt handmatige dossiers én 01-projecten
 *   die via de Bouw7-offertestatus (gewonnen/mondelinge toezegging) zijn doorgeschoven.
 */
export async function getDossiersVoorOffertes(): Promise<DossierResult> {
  return haalDossierLijst(q => q
    .or(
      'bouw7_projectstatus_naam.ilike.08.%,' +
      'bouw7_projectstatus_naam.ilike.09.%,' +
      'hoofdstatus.eq.offerte'
    )
    .order('created_at', { ascending: false }))
}

/** Haal servicedesk-dossiers op: status LB of categorie Dagelijks onderhoud/Mutatie. Sluit '08. Afgewezen' uit. */
export async function getDossiersVoorServicedesk(): Promise<DossierResult> {
  return haalDossierLijst(q => q
    .or('bouw7_projectstatus_naam.ilike.LB.%,bouw7_categorie_naam.in.(Dagelijks onderhoud,Mutatie)')
    .neq('bouw7_projectstatus_naam', '08. Afgewezen')
    .order('created_at', { ascending: false }))
}

/** Haal afgewezen servicedesk-dossiers op (Bouw7 status 08. Afgewezen) voor het archief. */
export async function getDossiersServicedeskArchief(): Promise<DossierResult> {
  return haalDossierLijst(q => q
    .in('bouw7_categorie_naam', ['Dagelijks onderhoud', 'Mutatie'])
    .eq('bouw7_projectstatus_naam', '08. Afgewezen')
    .order('created_at', { ascending: false }))
}

/** Haal financieel afgesloten dossiers op (Bouw7 status 07). */
export async function getDossiersAfgesloten(): Promise<DossierResult> {
  return haalDossierLijst(q => q
    .or('bouw7_projectstatus_naam.ilike.07.%,and(bouw7_projectstatus_naam.is.null,opdracht_substatus.eq.financieel_afgesloten)')
    .order('created_at', { ascending: false }))
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
  return haalDossierLijst(q => q
    .or(
      'and(hoofdstatus.eq.opdracht,opdracht_substatus.eq.financieel_afgesloten),' +
      'and(hoofdstatus.eq.offerte,offerte_substatus.in.(verloren,vervallen)),' +
      'and(hoofdstatus.eq.aanvraag,aanvraag_substatus.eq.vervallen),' +
      'bouw7_projectstatus_naam.ilike.07.%'
    )
    .order('created_at', { ascending: false }))
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

    // Gepagineerd: dit vult een filterlijst met unieke categorieën. Bij afkapping ontbreken
    // categorieën die alleen op 'late' dossiers voorkomen, en kan de gebruiker er niet op filteren.
    const data = await haalAlleRijen<{ bouw7_categorie_naam: string }>((van, tot) => supabase
      .from('dossiers')
      .select('bouw7_categorie_naam')
      .not('bouw7_categorie_naam', 'is', null)
      .order('bouw7_categorie_naam')
      .range(van, tot)).catch(() => [])

    const uniek = [...new Set(data.map(d => d.bouw7_categorie_naam))]
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
  /** Vastgoedobject (VvE/complex) waar deze aanvraag bij hoort; heeft de velden hierboven voorgevuld. */
  object_id?: string | null
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
      object_id:            input.object_id ?? null,
      object_gekoppeld_op:  input.object_id ? new Date().toISOString() : null,
      object_koppel_bron:   input.object_id ? 'aanmaak' : null,
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
 *
 * `opts.forceerBouw7`: schrijf óók bij een conflict. Voor wijzigingen die een feit zijn (de offerte
 * is gemaild) en voor de "toch overschrijven"-keuze die de UI aanbiedt na een conflictmelding.
 *
 * Een conflict komt terug mét `conflict.bouw7Label`, zodat de aanroeper kan tonen wát er in Bouw7
 * staat en de keuze kan voorleggen. Mislukte writes landen in `bouw7_sync_status`/`bouw7_sync_fout`,
 * zodat een stille drift achteraf terug te vinden is.
 */
export async function updateDossierSubstatus(
  id: string,
  nieuweSubstatus: DossierSubstatus,
  opts?: { schrijfBouw7?: boolean; forceerBouw7?: boolean }
): Promise<
  | { ok: true; bouw7?: Bouw7WriteResult }
  | { ok: false; error: string; conflict?: { bouw7Label: string } }
> {
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
    const res = await schrijfBouw7Substatus(
      huidig.bouw7_id,
      doelSectie,
      nieuweSubstatus,
      { sectie, substatus: sectie === 'aanvraag' ? huidig.aanvraag_substatus : huidig.offerte_substatus },
      { forceer: opts?.forceerBouw7 === true },
    )
    // Conflict → EVA-wijziging laten vervallen, mét het Bouw7-label zodat de UI kan vragen of de
    // gebruiker Bouw7 volgt of tóch overschrijft (die tweede weg komt terug met `forceerBouw7`).
    if (!res.ok && res.conflict) return { ok: false, error: res.error, conflict: res.conflict }
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

  // Uitkomst van de write-through vastleggen op het dossier: een mislukte Bouw7-write was tot nu toe
  // alleen een toast en dus achteraf onvindbaar. Meelift op dezelfde update — geen extra DB-call.
  // `bouw7_laatst_sync` blijft bewust ongemoeid: dat is het moment van de vólledige sync, en één
  // weggeschreven veld mag een dossier niet als "zojuist volledig gesynct" laten ogen in de lijst.
  if (bouw7) {
    update = bouw7.ok
      ? { ...update, bouw7_sync_status: 'synced', bouw7_sync_fout: null }
      : { ...update, bouw7_sync_status: 'error', bouw7_sync_fout: bouw7.error }
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
    await supabase.from('dossiers').update(
      bouw7.ok
        ? { bouw7_sync_status: 'synced', bouw7_sync_fout: null }
        : { bouw7_sync_status: 'error', bouw7_sync_fout: bouw7.error },
    ).eq('id', id)
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
): Promise<{ ok: true; bouw7?: Bouw7WriteResult; herkleurd?: number } | { ok: false; error: string }> {
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

  // De projectleider bepaalt de kleur van de planbalken in Bouw7 (zie `herkleurPlanningInBouw7`).
  // Onthoud de oude waarde vóór de update, zodat we straks weten óf hij echt wisselde — anders zou
  // elke keer Opslaan de complete planning van het project opnieuw wegschrijven.
  let oudeProjectleider: string | null | undefined
  if ('project_manager_id' in payload) {
    const { data: voor } = await supabase
      .from('dossiers')
      .select('project_manager_id')
      .eq('id', id)
      .maybeSingle()
    oudeProjectleider = voor?.project_manager_id ?? null
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

  // Wisselde de projectleider, dan verkleuren de planbalken van dit project in Bouw7 mee: daar is
  // de kleur de aanduiding van de projectleider, niet vrije opmaak. Best-effort en na de rol-write,
  // zodat een hapering in de planning de rolwissel zelf niet raakt.
  let herkleurd: number | undefined
  if (opts?.schrijfBouw7 && oudeProjectleider !== undefined && oudeProjectleider !== payload.project_manager_id) {
    try {
      const { herkleurPlanningInBouw7 } = await import('@/lib/bouw7/plan-item-write')
      const res = await herkleurPlanningInBouw7(id)
      herkleurd = res.bijgewerkt
    } catch (e) {
      console.error('[dossiers] herkleuren planning na rolwissel mislukt:', e)
    }
  }

  revalidatePath('/aanvragen')
  revalidatePath('/offertes')
  revalidatePath('/opdrachten')
  return { ok: true, bouw7, herkleurd }
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
    const client = await getBouw7ClientOfNull()
    if (!client) return null
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
  // Per component staan prognose (begroot/verwacht) én geboekt naast elkaar.
  // LET OP: de geboekt-velden tellen ALLEEN ontvangen inkoopfacturen mee (arbeid uitgezonderd,
  // die is altijd geboekt) — géén openstaande inkooporders of onderaannemerscontracten. Zo is
  // arbeid + onderaanneming + materiaal + inkoop/mat./afval per regel exact `geboekteKosten`.
  arbeidPrognose: number              // Arbeid — prognose (kostensoort 1, prognosisAmount)
  arbeidskosten: number               // Arbeid — geboekt (kostensoort 1, costAmount = urenregistratie)
  onderaannemingPrognose: number      // Onderaanneming — prognose (kostensoort 3)
  onderaanneming: number              // Onderaanneming — geboekt (inkoopfacturen purchaseType 3)
  materiaalPrognose: number           // Materiaal — prognose (kostensoort 5)
  materiaal: number                   // Materiaal — geboekt (inkoopfacturen purchaseType 5)
  inkoopMaterieelAfvalPrognose: number // Inkoop + Materieel + Afval — prognose (kostensoort 2/4/6)
  inkoopMaterieelAfval: number         // Inkoop + Materieel + Afval — geboekt (overige inkoopfacturen)
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
  onderaannemingPrognose: number
  onderaanneming: number
  materiaalPrognose: number
  materiaal: number
  inkoopMaterieelAfvalPrognose: number
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
  arbeidPrognose: 0, arbeidskosten: 0,
  onderaannemingPrognose: 0, onderaanneming: 0, materiaalPrognose: 0, materiaal: 0,
  inkoopMaterieelAfvalPrognose: 0, inkoopMaterieelAfval: 0,
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
 * **Geboekt ≠ costAmount.** De begroting/prognose komt uit de projectbewaking, maar de geboekte
 * kant van onderaanneming/materiaal/inkoop komt uit de ontvangen inkoopfacturen. `costAmount`
 * telt namelijk óók afgeroepen inkooporders en onderaannemerscontracten mee (verplichtingen
 * zonder factuur); die stonden dan wél in de componentkolommen maar niet in Geboekte kosten,
 * waardoor de tabel horizontaal noch verticaal optelde. Verplichtingen staan op het Inkoop-tab.
 *
 * Géén opslag — alles wordt live opgehaald bij het openen van de tab.
 */
export async function getDossierBewaking(dossierId: string): Promise<DossierBewakingData> {
  const leeg: DossierBewakingData = {
    beschikbaar: false, bouw7Id: null, hoofdstukken: [],
    totalen: {
      begroot: 0, meerwerk: 0, prognose: 0, prognoseUren: 0, geboekteUren: 0, arbeidPrognose: 0, arbeidskosten: 0,
      onderaannemingPrognose: 0, onderaanneming: 0, materiaalPrognose: 0, materiaal: 0,
      inkoopMaterieelAfvalPrognose: 0, inkoopMaterieelAfval: 0, verwachteKosten: 0, geboekteKosten: 0,
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

  const client = await getBouw7ClientOfNull()
  if (!client) return leeg

  try {
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

    /**
     * Bestaande regel ophalen of nieuwe aanmaken. Bewakingscodes zijn NIET uniek per project:
     * dezelfde codetekst (bv. ".A") kan in meerdere hoofdstukken voorkomen. Match daarom op
     * hoofdstuk + code zodra het hoofdstuk bekend is — alleen wanneer dat ontbreekt (bv. bij
     * bestelregels, die enkel een parentName dragen) vallen we terug op een code-match.
     */
    const vindOfMaak = (code: string, hoofdstukId: number | null, hoofdstuk: string | null, naam: string | null) => {
      if (hoofdstukId != null) {
        const key = `${hoofdstukId}|${code}`
        let r = regelMap.get(key)
        if (!r) {
          r = legeRegel()
          r.code = code
          r.naam = naam ?? code
          r.hoofdstukId = hoofdstukId
          r.hoofdstuk = hoofdstuk
          regelMap.set(key, r)
          if (!codeIndex.has(code)) codeIndex.set(code, r)
        }
        return r
      }
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
      const prognose = toGetal(e.prognosisAmount)
      r.begroot += budget
      r.meerwerk += toGetal(e.additionalWorkAmount)
      r.prognose += prognose
      r.prognoseUren += toGetal(e.hourInfo?.prognosisHours)
      r.geboekteUren += toGetal(e.hourInfo?.costHours)

      // Prognose per component uit de projectbewaking. De geboekt-kant komt NIET uit `costAmount`:
      // die telt ook afgeroepen inkooporders en onderaannemerscontracten mee (verplichtingen zonder
      // factuur), waardoor de componenten niet optelden tot de kolom Geboekte kosten. Alleen arbeid
      // komt hier vandaan — uren zijn altijd geboekt en kennen geen inkoopfactuur.
      if (ct === 1)      { r.arbeidPrognose += prognose;               r.arbeidskosten += toGetal(e.costAmount) }
      else if (ct === 3) { r.onderaannemingPrognose += prognose }
      else if (ct === 5) { r.materiaalPrognose += prognose }
      else               { r.inkoopMaterieelAfvalPrognose += prognose } // 2=Inkoop, 4=Materieel, 6=Afval

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

    // Geboekte kosten = arbeid (altijd geboekt) + inkoop mét ONTVANGEN inkoopfactuur.
    // Een afgeroepen bon (uit een contract) verschijnt in Bouw7 als concept-inkoopfactuur ZONDER
    // factuurnummer. Dat is een verplichting (telt wél in `costAmount`), geen geboekte kost — pas
    // als de leverancier écht factureert komt er een factuurnummer bij. Alleen facturen mét
    // factuurnummer meetellen (conventie in de codebase: concept = geen factuurnummer).
    // Dedupe op deliveryTicket.id: termijn-facturen verwijzen naar dezelfde bon.
    const gefactureerdeBon = new Map<number, { code: string; chapterId: number | null; chapterNaam: string | null; naam: string | null; bedrag: number; purchaseType: number | null }>()
    for (const inv of invoices) {
      const dt = inv.deliveryTicket
      if (!dt?.id) continue
      if (!inv.invoiceNumber || inv.invoiceNumber.trim() === '') continue
      if (gefactureerdeBon.has(dt.id)) continue
      const c = dt.securityLink?.code
      gefactureerdeBon.set(dt.id, {
        code: c?.code ?? GEEN,
        chapterId: c?.code ? (c.chapter?.id ?? null) : UNCODED_HOOFDSTUK_ID,
        chapterNaam: c?.code ? (c.chapter?.name ?? null) : 'Kosten zonder bewaking',
        naam: c?.code ? (c.name ?? null) : 'Kosten zonder bewaking',
        bedrag: toGetal(dt.cost),
        purchaseType: dt.purchaseType ?? null,
      })
    }
    // Toewijzen aan de juiste (hoofdstuk+code)-regel en optellen per regel-object. Voorheen
    // ging dit per code, waardoor dezelfde code in élk hoofdstuk het volledige gefactureerde
    // bedrag kreeg — een code in 3 hoofdstukken telde de inkoop dus 3× → te hoge geboekte kosten.
    //
    // De bon draagt ook zijn `purchaseType` (3 = onderaanneming, 5 = materiaal, rest = inkoop/
    // materieel/afval). Daarmee landt élke gefactureerde euro in precies één componentkolom, zodat
    // arbeid + onderaanneming + materiaal + inkoop per regel exact de geboekte kosten opleveren.
    // Arbeid-facturen (purchaseType 1, bv. ZZP via een inkoopfactuur) vallen bewust in de
    // rest-emmer: `arbeidskosten` blijft zo puur de urenregistratie, waar het Uren-tab op rekent.
    for (const b of gefactureerdeBon.values()) {
      const r = vindOfMaak(b.code, b.chapterId, b.chapterNaam, b.naam)
      if (b.purchaseType === 3)      r.onderaanneming += b.bedrag
      else if (b.purchaseType === 5) r.materiaal += b.bedrag
      else                           r.inkoopMaterieelAfval += b.bedrag
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

    // Afgeleide kolommen per regel toekennen. Geboekte kosten = de vier componentkolommen bij
    // elkaar — per definitie gelijk aan arbeid + alles mét inkoopfactuur.
    for (const r of regelMap.values()) {
      const code = r.code ?? GEEN
      r.geboekteKosten = r.arbeidskosten + r.onderaanneming + r.materiaal + r.inkoopMaterieelAfval
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
      // Sleutel = `${hoofdstukId ?? 'x'}|${code}` (== regelMap-sleutel). Zo geldt een pending %
      // alleen voor de bewerkte regel, niet voor gelijk-benoemde codes in andere hoofdstukken.
      for (const [key, r] of regelMap) {
        if (r.code && overlay.codes.has(key)) r.progress = overlay.codes.get(key)!
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
      onderaannemingPrognose: som((r) => r.onderaannemingPrognose),
      onderaanneming: som((r) => r.onderaanneming),
      materiaalPrognose: som((r) => r.materiaalPrognose),
      materiaal: som((r) => r.materiaal),
      inkoopMaterieelAfvalPrognose: som((r) => r.inkoopMaterieelAfvalPrognose),
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
  const client = await getBouw7ClientOfNull()
  if (!client) return null
  return { client, bouw7Id: String(dossier.bouw7_id) }
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
  /** Vanuit een EVA-bestelling aangemaakt (i.p.v. handmatig in Bouw7). */
  uitEva: boolean
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
  /** Vanuit een EVA-bestelling aangemaakt (i.p.v. handmatig in Bouw7). */
  uitEva: boolean
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
  /**
   * Hangt deze factuur aan een leverbon? Zo niet, dan kon Bouw7 hem niet aan een bestelling
   * koppelen — bijvoorbeeld omdat de bon al volledig was ingeboekt.
   */
  heeftLeverbon: boolean
  /** Leverbon-id: dáár hangt de bewakingscode, en dus het aangrijpingspunt voor hercoderen. */
  bonId: number | null
  /**
   * Kostensoort van de bon (`purchaseType`: 1=Arbeid, 2=Inkoop, 3=Onderaanneming, 4=Materieel,
   * 5=Materiaal, 6=Afval; 0 = ongetypeerde bon). Een doelcode moet een PSL van dezelfde
   * kostensoort hebben, anders landt de kost in de verkeerde kolom van de Financieel-tab.
   */
  kostensoort: number | null
  /**
   * Deze kost hangt via een inkooporder/OA-contract aan zijn bewakingscode (bonnummer =
   * `<contractnummer>B<nr>`). Hercoderen is dan geblokkeerd: de code komt uit de contracttermijn,
   * en de bon losweken laat contract en geboekte kosten uit elkaar lopen.
   */
  contractGebonden: boolean
}

/** Eén afwijking op de inkoop van dit dossier, bedoeld om op te volgen. */
export type InkoopSignaal = {
  soort: 'overfacturatie' | 'factuur_zonder_bon'
  /** Leverancier of onderaannemer. */
  partij: string | null
  /** Order-/contractnummer, of het factuurnummer bij een losse factuur. */
  referentie: string | null
  /** Bij overfacturatie: het bedrag te véél. Bij een losse factuur: het factuurbedrag. */
  bedrag: number
  toelichting: string
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
/**
 * Eén keuzemogelijkheid in de hercodeer-dropdown.
 *
 * Bewakingscodes zijn **niet uniek per project** — dezelfde codetekst kan onder meerdere
 * hoofdstukken staan (zie de dubbeltelling-valkuil in `getDossierBewaking`). Daarom is een
 * optie altijd hoofdstuk + code, en niet de code alleen: anders is bij het schrijven naar
 * Bouw7 niet te bepalen wélke van de gelijknamige codes bedoeld wordt.
 */
export type ProjectBewakingscode = {
  code: string
  naam: string | null
  hoofdstukId: number | null
  hoofdstukNaam: string | null
  /**
   * ProjectSecurityLink-id per kostensoort (1=Arbeid … 6=Afval). Een code heeft alleen een PSL
   * voor de kostensoorten waarvoor hij op dit project begroot of gebruikt is. Leeg = deze code
   * bestaat wel op het project, maar er kan (nog) geen kost naartoe in Bouw7.
   */
  pslPerKostensoort: Record<number, number>
}

/**
 * Herkomst van een Bouw7-overzicht. Nodig omdat een leeg resultaat drie totaal verschillende dingen
 * kan betekenen: het dossier hangt niet aan Bouw7, de call is mislukt, of er is écht niets. Voor de
 * tabs maakt dat weinig uit — voor de compleetheidscontrole bij gereedmelden alles: een storing mag
 * daar nooit als "alles compleet" doorgaan.
 */
export type Bouw7Bron = 'bouw7' | 'geen_koppeling' | 'fout'

export type DossierInkoopData = {
  beschikbaar: boolean
  /** Kwam dit overzicht daadwerkelijk uit Bouw7? Zie `Bouw7Bron`. */
  bron: Bouw7Bron
  inkooporders: InkoopOrderRegel[]
  onderaannemers: OnderaannemerContract[]
  geboekteKosten: GeboekteKostenRegel[]
  /** Bewakingscodes die al op dit project voorkomen (voor de hercodeer-dropdown). */
  projectcodes: ProjectBewakingscode[]
  /** Afwijkingen die opvolging vragen — bovenaan de tab getoond. */
  signalen: InkoopSignaal[]
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
  // Bouw7 levert op de bon `subcontracting` (niet `subcontractor`) — zonder deze regel toonde de
  // Type-kolom letterlijk "Subcontracting".
  subcontracting: 'Onderaanneming', purchase_order: 'Inkoop', delivery_ticket: 'Bon',
  remaining: 'Overig',
  equipment: 'Materieel', waste: 'Afval', misc: 'Overig', other: 'Overig',
}
/**
 * Bon-`purchaseTypeName` (Heimdall) → `purchaseType`-nummer (Apollo), dat gelijk is aan de
 * kostensoort van de bewakingslink (`purchaseType === projectSecurityLink.costType`, 701/701
 * gemeten). Fallback voor het geval Apollo een bon niet meelevert.
 */
const PURCHASE_TYPE_IDS: Record<string, number> = {
  delivery_ticket: 0, labor: 1, purchase_order: 2, subcontracting: 3, subcontractor: 3,
  equipment: 4, material: 5, remaining: 6, waste: 6,
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
/** Bedrag in de toelichting van een signaal, bv. "€ 10.212,50". */
const fmtBedrag = (n: number): string =>
  `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Bouw7-contract-ids die vanuit een EVA-bestelling zijn aangemaakt (werkbegroting →
 * inkooporder/OA-contract). Alleen voor het "EVA"-merkje in de tabel.
 */
async function getEvaContractIds(dossierId: string): Promise<Set<number>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: wbs } = await db.from('werkbegrotingen').select('id').eq('dossier_id', dossierId)
  const ids = ((wbs ?? []) as { id: string }[]).map(w => w.id)
  if (ids.length === 0) return new Set()
  const { data } = await db
    .from('werkbegroting_bestellingen')
    .select('bouw7_contract_id')
    .in('werkbegroting_id', ids)
    .not('bouw7_contract_id', 'is', null)
  return new Set(((data ?? []) as { bouw7_contract_id: number }[]).map(r => Number(r.bouw7_contract_id)))
}

/**
 * De bewakingscodes die in Bouw7 op dit project zijn aangemaakt (code → omschrijving).
 *
 * Bron: Athena `/project-control/{id}/cost-type/{ct}/chapters` — dezelfde bron als het
 * Financieel-tab, dus wat je daar per code ziet is exact wat je hier kunt kiezen.
 *
 * Bewust **niet** afgeleid uit de codes die al op een inkooporder, OA-contract of geboekte
 * kost staan: juist de code waar je een kost naártoe wilt verplaatsen is per definitie nog
 * nergens in gebruik. Op een project waar in Bouw7 nog niets gecodeerd is (alle kosten onder
 * `uncoded_costs`) leverde die afleiding een lege lijst op — hercoderen was dan onmogelijk.
 *
 * Per code komt daar ook de **PSL-id per kostensoort** vandaan (`securityCodes[].pslIds`) — dat is
 * het aangrijpingspunt om de code van een geboekte kost in Bouw7 te verzetten. Gesleuteld op
 * hoofdstuk + code, want dezelfde codetekst kan in meerdere hoofdstukken voorkomen.
 */
async function getProjectBewakingscodes(client: Bouw7Client, bouw7Id: string): Promise<Map<string, ProjectBewakingscode>> {
  const codes = new Map<string, ProjectBewakingscode>()
  const responses = await Promise.all(
    BEWAKING_KOSTENSOORTEN.map((ct) =>
      client
        .getAthena<Bouw7ControlResponse>(`/project-control/${bouw7Id}/cost-type/${ct}/chapters?include_subprojects=false`)
        .catch(() => null),
    ),
  )
  responses.forEach((resp, i) => {
    const ct = BEWAKING_KOSTENSOORTEN[i]
    for (const hoofdstuk of resp?.items ?? []) {
      const ci = hoofdstuk.chapterInfo
      if (ci?.name === 'uncoded_costs' || ci?.id === 0) continue
      for (const sc of hoofdstuk.securityCodes ?? []) {
        const code = (sc.code ?? '').trim()
        if (!code) continue
        const key = `${ci?.id ?? ''}|${code}`
        let entry = codes.get(key)
        if (!entry) {
          entry = {
            code,
            naam: sc.name?.trim() || null,
            hoofdstukId: ci?.id ?? null,
            hoofdstukNaam: ci?.name ?? null,
            pslPerKostensoort: {},
          }
          codes.set(key, entry)
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pslId = (sc as any).pslIds?.[0]
        if (pslId != null && entry.pslPerKostensoort[ct] == null) entry.pslPerKostensoort[ct] = Number(pslId)
      }
    }
  })
  return codes
}

export async function getDossierInkoop(dossierId: string): Promise<DossierInkoopData> {
  const leeg: DossierInkoopData = {
    beschikbaar: false, bron: 'geen_koppeling',
    inkooporders: [], onderaannemers: [], geboekteKosten: [], projectcodes: [], signalen: [],
    totalen: { besteld: 0, onderaanneming: 0, geboekt: 0, toegewezen: 0, nietToegewezen: 0 },
  }
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return leeg
  const { client, bouw7Id } = ctx

  // Elke deelcall vangt zijn eigen fout op zodat één uitvaller de tab niet leegtrekt. Daardoor
  // ziet de buitenste catch een storing echter nooit, en zou een volledig platte Bouw7 als "geen
  // inkooporders" doorgaan. Dat is precies het verschil waar `bron` voor bestaat, dus houden we
  // per call bij of hij gefaald heeft.
  let callGefaald = false
  const gefaald = <T>(leeg: T) => (): T => { callGefaald = true; return leeg }

  try {
    const [orderResp, subResp, apolloInvoices, heimdallResp, correcties, bouw7Codes] = await Promise.all([
      client.get<Bouw7ListResponse<Bouw7PurchaseOrderContract>>('/list/purchase-order-contracts', {
        q: `project.id = ${bouw7Id} LIMIT 500`,
      }).catch(gefaald({ items: [] as Bouw7PurchaseOrderContract[] } as Bouw7ListResponse<Bouw7PurchaseOrderContract>)),
      client.get<Bouw7ListResponse<Bouw7SubcontractorContract>>('/list/subcontractor-contracts', {
        q: `project.id = ${bouw7Id} LIMIT 500`,
      }).catch(gefaald({ items: [] as Bouw7SubcontractorContract[] } as Bouw7ListResponse<Bouw7SubcontractorContract>)),
      client.getApolloAll<Bouw7PurchaseInvoice>('/search/purchase-invoices', `project.id = ${bouw7Id}`)
        .catch(gefaald([] as Bouw7PurchaseInvoice[])),
      client.get<Bouw7PurchaseInvoiceListResponse>('/list/purchase-invoices', {
        q: `project.id = ${bouw7Id} LIMIT 1000`,
      }).catch(gefaald({ items: [] as Bouw7PurchaseInvoiceListItem[] } as Bouw7PurchaseInvoiceListResponse)),
      getInkoopCorrecties(dossierId).catch(() => [] as InkoopCorrectie[]),
      getProjectBewakingscodes(client, bouw7Id).catch(() => new Map<string, ProjectBewakingscode>()),
    ])

    // Welke contracten zijn vanuit een EVA-bestelling aangemaakt? Puur ter herkenning in de
    // tabel — de bedragen komen onverkort uit Bouw7.
    const evaContractIds = await getEvaContractIds(dossierId).catch(() => new Set<number>())

    // Apollo levert de bewakingscode: indexeer per deliveryTicket.id én per invoice.id (fallback).
    const codePerBon = new Map<number, { code: string | null; naam: string | null }>()
    const codePerInvoice = new Map<number, { code: string | null; naam: string | null }>()
    // Kostensoort van de bon (`purchaseType`) — nodig om de doel-PSL bij het hercoderen te kiezen.
    const kostensoortPerBon = new Map<number, number>()
    for (const inv of apolloInvoices) {
      const c = inv.deliveryTicket?.securityLink?.code
      const entry = { code: c?.code ?? null, naam: c?.name ?? null }
      if (inv.deliveryTicket?.id) codePerBon.set(inv.deliveryTicket.id, entry)
      if (inv.id) codePerInvoice.set(inv.id, entry)
      if (inv.deliveryTicket?.id != null && inv.deliveryTicket.purchaseType != null) {
        kostensoortPerBon.set(inv.deliveryTicket.id, inv.deliveryTicket.purchaseType)
      }
    }

    // Bonnummer → order-id / contract-id voor Bouw7-linkage
    const orderNummerIndex = new Map<string, number>()
    for (const o of orderResp.items ?? []) if (o.number && o.id != null) orderNummerIndex.set(o.number, o.id)
    const contractNummerIndex = new Map<string, number>()
    for (const sub of subResp.items ?? []) if (sub.number && sub.id != null) contractNummerIndex.set(sub.number, sub.id)

    const correctieMap = new Map<number, InkoopCorrectie>()
    for (const c of correcties) correctieMap.set(Number(c.bron_id), c)

    // Alleen ontvangen facturen (mét factuurnummer). Een afgeroepen bon uit een contract staat in
    // Bouw7 als concept-inkoopfactuur zonder factuurnummer — dat is een verplichting, geen geboekte
    // kost, en hoort dus niet in de geboekte-kostenlijst.
    const geboekteKosten: GeboekteKostenRegel[] = (heimdallResp.items ?? [])
      .filter((inv) => !!inv.invoiceNumber && inv.invoiceNumber.trim() !== '')
      .map((inv) => {
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

      // Contract-gebondenheid staat los van de EVA-toewijzing: een handmatige EVA-koppeling mag
      // niet verhullen dat de code van deze bon uit een contracttermijn komt (→ niet hercoderen).
      let bouw7OrderId: number | null = null
      let bouw7ContractId: number | null = null
      if (bon) {
        for (const [nummer, orderId] of orderNummerIndex) {
          if (bon === nummer || bon.startsWith(nummer + 'B')) { bouw7OrderId = orderId; break }
        }
        if (bouw7OrderId === null) {
          for (const [nummer, contractId] of contractNummerIndex) {
            if (bon === nummer || bon.startsWith(nummer + 'B')) { bouw7ContractId = contractId; break }
          }
        }
      }
      const contractGebonden = bouw7OrderId != null || bouw7ContractId != null

      if (effOrderId != null || effContractId != null) {
        linkBron = 'eva'
      } else if (contractGebonden) {
        effOrderId = bouw7OrderId
        effContractId = bouw7ContractId
        linkBron = 'bouw7'
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
        heeftLeverbon: inv.deliveryTicket?.id != null,
        bonId: inv.deliveryTicket?.id ?? null,
        kostensoort:
          (inv.deliveryTicket?.id != null ? kostensoortPerBon.get(inv.deliveryTicket.id) : undefined) ??
          PURCHASE_TYPE_IDS[(inv.deliveryTicket?.purchaseTypeName ?? '').toLowerCase()] ?? null,
        contractGebonden,
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
        uitEva: o.id != null && evaContractIds.has(o.id),
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
        uitEva: c.id != null && evaContractIds.has(c.id),
      }
    })

    // Projectbewakingscodes = de codes die in Bouw7 op dit project staan, aangevuld met codes die
    // al op een contract of geboekte kost voorkomen maar (nog) niet in de projectstructuur zitten —
    // anders zou een bestaande codering uit de lijst vallen en niet meer te herstellen zijn.
    //
    // Zo'n aanvulling heeft géén hoofdstuk en géén PSL-ids: er valt niet naartoe te hercoderen in
    // Bouw7, maar de bestaande codering blijft wel zichtbaar in de dropdown.
    const codeMap = new Map<string, ProjectBewakingscode>(bouw7Codes)
    const losseCodes = new Set([...codeMap.values()].map((c) => c.code))
    const vulAan = (code?: string | null, naam?: string | null) => {
      if (!code || losseCodes.has(code)) return
      losseCodes.add(code)
      codeMap.set(`|${code}`, { code, naam: naam ?? null, hoofdstukId: null, hoofdstukNaam: null, pslPerKostensoort: {} })
    }
    for (const o of orderResp.items ?? []) vulAan(o.projectSecurityLink?.code, o.projectSecurityLink?.name)
    for (const c of subResp.items ?? []) vulAan(c.projectSecurityLink?.code, c.projectSecurityLink?.name)
    for (const r of geboekteKosten) vulAan(r.bronCode, r.codeNaam)
    const projectcodes: ProjectBewakingscode[] = [...codeMap.values()]
      .sort((a, b) => a.code.localeCompare(b.code) || (a.hoofdstukNaam ?? '').localeCompare(b.hoofdstukNaam ?? ''))

    const besteld = inkooporders.reduce((s, r) => s + r.contractbedrag, 0)
    const onderaanneming = onderaannemers.reduce((s, c) => s + c.contractbedrag, 0)
    const geboekt = geboekteKosten.reduce((s, r) => s + r.bedrag, 0)
    const toegewezen = geboekteKosten.filter(r => r.toegewezenOrderId != null || r.toegewezenContractId != null).reduce((s, r) => s + r.bedrag, 0)
    const nietToegewezen = geboekt - toegewezen

    // ── Signalen: afwijkingen die opvolging vragen ────────────────────────────
    //
    // 1. Meer gefactureerd dan besteld. Dit is het creditnota-geval: een leverancier of
    //    onderaannemer heeft meer in rekening gebracht dan er aan opdracht ligt.
    // 2. Een factuur die aan het project hangt maar aan géén enkele leverbon. Bouw7 kan hem dan
    //    niet aan een bestelling koppelen — bijvoorbeeld omdat de bon al volledig was ingeboekt.
    //
    // Bewust géén signaal voor openstaande bonnen: dat staat al als "Nog verwacht" per order in
    // de tabel eronder.
    const signalen: InkoopSignaal[] = []

    for (const o of inkooporders) {
      const teveel = o.geboekt - o.contractbedrag
      if (teveel > 0.005) {
        signalen.push({
          soort: 'overfacturatie',
          partij: o.leverancier,
          referentie: o.nummer,
          bedrag: teveel,
          toelichting: `Gefactureerd ${fmtBedrag(o.geboekt)} tegenover een orderbedrag van ${fmtBedrag(o.contractbedrag)}.`,
        })
      }
    }
    for (const c of onderaannemers) {
      const teveel = c.geboekt - c.contractbedrag
      if (teveel > 0.005) {
        signalen.push({
          soort: 'overfacturatie',
          partij: c.onderaannemer,
          referentie: c.nummer,
          bedrag: teveel,
          toelichting: `Gefactureerd ${fmtBedrag(c.geboekt)} tegenover een contractbedrag van ${fmtBedrag(c.contractbedrag)}.`,
        })
      }
    }
    for (const r of geboekteKosten) {
      if (r.heeftLeverbon) continue
      signalen.push({
        soort: 'factuur_zonder_bon',
        partij: r.leverancier,
        referentie: r.factuurnummer,
        bedrag: r.bedrag,
        toelichting: 'Deze factuur hangt niet aan een leverbon en is dus aan geen enkele bestelling gekoppeld.',
      })
    }
    signalen.sort((a, b) => b.bedrag - a.bedrag)

    return {
      beschikbaar: inkooporders.length > 0 || onderaannemers.length > 0 || geboekteKosten.length > 0,
      bron: callGefaald ? 'fout' : 'bouw7',
      inkooporders, onderaannemers, geboekteKosten, projectcodes, signalen,
      totalen: { besteld, onderaanneming, geboekt, toegewezen, nietToegewezen },
    }
  } catch {
    return { ...leeg, bron: 'fout' }
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

type InkoopCorrectieResult = { ok: true; melding?: string } | { ok: false; error: string }

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

/* — Hercoderen: verplaatst de kost ook in Bouw7 — */

/**
 * Zet een geboekte kost op een andere bewakingscode — **in Bouw7 zelf**, niet als EVA-overlay.
 *
 * Een EVA-only correctie liet het Inkoop-tab kloppen maar de Financieel-tab niet: die leest per
 * bewakingscode rechtstreeks uit Bouw7 en kent de correctielaag niet. Daarom gaat de code nu naar
 * de leverbon in Bouw7 (`lib/dossiers/bouw7-bewakingscode.ts`); daarmee kloppen beide tabs én het
 * Bouw7-projectbewakingsscherm. Het fiscale deel van de factuur blijft onaangeroerd.
 *
 * Geweigerd wordt:
 * - een kost die via een **inkooporder of OA-contract** aan zijn code hangt (die code komt uit de
 *   contracttermijn — losweken laat contract en kosten uit elkaar lopen);
 * - een doelcode zonder PSL voor de kostensoort van de bon (de kost zou in de verkeerde kolom
 *   van de Financieel-tab landen; zet de code in Bouw7 eerst onder die kostensoort in de
 *   begroting).
 */
async function hercodeerEen(
  client: Bouw7Client,
  bouw7Id: string,
  rij: GeboekteKostenRegel,
  doel: ProjectBewakingscode,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const wat = rij.factuurnummer ?? `factuur ${rij.bronId}`
  if (rij.contractGebonden) {
    return { ok: false, error: `${wat}: hangt aan een inkooporder/OA-contract — daar bepaalt het contract de bewakingscode.` }
  }
  if (rij.bonId == null) {
    return { ok: false, error: `${wat}: heeft geen leverbon in Bouw7, dus er is niets om te hercoderen.` }
  }
  if (doel.hoofdstukId == null) {
    return { ok: false, error: `${wat}: bewakingscode "${doel.code}" staat niet in de projectstructuur van Bouw7 en is daar dus niet te kiezen.` }
  }
  const res = await schrijfBouw7BonBewakingscode(client, bouw7Id, rij.bonId, doel)
  return res.ok ? { ok: true } : { ok: false, error: `${wat}: ${res.error}` }
}

/**
 * Zoekt de doelcode op. `hoofdstukId` hoort erbij omdat dezelfde codetekst in meerdere
 * hoofdstukken kan staan; zonder hoofdstuk accepteren we alleen een code die maar één keer
 * voorkomt — anders is niet te bepalen welke bedoeld is.
 */
function vindDoelcode(
  codes: ProjectBewakingscode[],
  code: string,
  hoofdstukId: number | null,
): { ok: true; doel: ProjectBewakingscode } | { ok: false; error: string } {
  const kandidaten = codes.filter((c) => c.code === code)
  if (kandidaten.length === 0) return { ok: false, error: 'Bewakingscode bestaat niet op dit project.' }
  if (hoofdstukId != null) {
    const exact = kandidaten.find((c) => c.hoofdstukId === hoofdstukId)
    if (!exact) return { ok: false, error: 'Bewakingscode bestaat niet in dat hoofdstuk.' }
    return { ok: true, doel: exact }
  }
  if (kandidaten.length > 1) {
    return { ok: false, error: `Bewakingscode "${code}" komt in meerdere hoofdstukken voor — kies het hoofdstuk erbij.` }
  }
  return { ok: true, doel: kandidaten[0] }
}

/** Wist de oude EVA-code-overlay van een kost; de code staat nu immers in Bouw7 zelf. */
async function wisCodeOverlay(dossierId: string, bronId: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('inkoop_correcties')
    .select('id, toegewezen_order_id, toegewezen_contract_id, bewakingscode_override')
    .eq('dossier_id', dossierId).eq('bron_type', 'purchase_invoice').eq('bron_id', bronId)
    .maybeSingle()
  if (!data?.id || data.bewakingscode_override == null) return
  // Alleen de code-velden wissen; een handmatige order-/contracttoewijzing blijft staan.
  if (data.toegewezen_order_id != null || data.toegewezen_contract_id != null) {
    await supabase.from('inkoop_correcties')
      .update({ bewakingscode_override: null, bewakingscode_naam_override: null, updated_at: new Date().toISOString() })
      .eq('id', data.id)
  } else {
    await supabase.from('inkoop_correcties').delete().eq('id', data.id)
  }
}

/** Revalidatie na een hercodering: raakt zowel het Inkoop- als het Financieel-tab. */
function revalideerInkoopEnFinancieel(dossierId: string): void {
  for (const basis of ['/opdrachten', '/servicedesk']) {
    revalidatePath(`${basis}/${dossierId}/inkoop`)
    revalidatePath(`${basis}/${dossierId}/financieel`)
  }
}

export async function hercodeerGeboekteKost(
  dossierId: string,
  bronId: number,
  code: string,
  hoofdstukId: number | null = null,
): Promise<InkoopCorrectieResult> {
  await assertDossierBewerkbaar(dossierId)
  const codeClean = (code ?? '').trim()
  if (!codeClean) return { ok: false, error: 'Geen bewakingscode opgegeven.' }

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling voor dit dossier.' }

  const data = await getDossierInkoop(dossierId)
  const doel = vindDoelcode(data.projectcodes, codeClean, hoofdstukId)
  if (!doel.ok) return doel
  const rij = data.geboekteKosten.find((r) => r.bronId === bronId)
  if (!rij) return { ok: false, error: 'Geboekte kost niet gevonden op dit dossier.' }

  const res = await hercodeerEen(ctx.client, ctx.bouw7Id, rij, doel.doel)
  if (!res.ok) return res
  await wisCodeOverlay(dossierId, bronId)
  revalideerInkoopEnFinancieel(dossierId)
  return { ok: true }
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

/**
 * Bulk: zet meerdere geboekte kosten op dezelfde bewakingscode in Bouw7.
 *
 * Regel voor regel, want elke bon heeft zijn eigen kostensoort en dus zijn eigen doel-PSL.
 * Een regel die niet mag of niet kan (contractgebonden, geen leverbon, code niet begroot voor
 * die kostensoort) wordt overgeslagen en **benoemd** — stil overslaan zou de indruk wekken dat
 * alles verplaatst is.
 */
export async function hercodeerGeboekteKostenBulk(
  dossierId: string,
  bronIds: number[],
  code: string,
  hoofdstukId: number | null = null,
): Promise<InkoopCorrectieResult> {
  await assertDossierBewerkbaar(dossierId)
  const codeClean = (code ?? '').trim()
  if (!codeClean) return { ok: false, error: 'Geen bewakingscode opgegeven.' }
  const ids = [...new Set(bronIds.filter((n) => Number.isFinite(n)))]
  if (ids.length === 0) return { ok: false, error: 'Geen regels geselecteerd.' }

  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling voor dit dossier.' }

  const data = await getDossierInkoop(dossierId)
  const doel = vindDoelcode(data.projectcodes, codeClean, hoofdstukId)
  if (!doel.ok) return doel

  let gelukt = 0
  const fouten: string[] = []
  for (const bronId of ids) {
    const rij = data.geboekteKosten.find((r) => r.bronId === bronId)
    if (!rij) { fouten.push(`Kost ${bronId} niet gevonden.`); continue }
    const res = await hercodeerEen(ctx.client, ctx.bouw7Id, rij, doel.doel)
    if (res.ok) { gelukt++; await wisCodeOverlay(dossierId, bronId) }
    else fouten.push(res.error)
  }

  revalideerInkoopEnFinancieel(dossierId)
  if (gelukt === 0) return { ok: false, error: fouten.join(' · ') || 'Er is niets verplaatst.' }
  return {
    ok: true,
    melding: fouten.length === 0
      ? `${gelukt} regel(s) verplaatst naar ${codeClean}.`
      : `${gelukt} van ${ids.length} verplaatst. Overgeslagen: ${fouten.join(' · ')}`,
  }
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
  /** Bouw7-btw-tarief-id; nodig om deze termijn als factuurregel klaar te zetten. */
  vatTariffId: number | null
  /** Bouw7-id van de statement waar deze termijn onder hangt. */
  statementId: number | null
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
  /** Kwam dit overzicht daadwerkelijk uit Bouw7? Zie `Bouw7Bron`. */
  bron: Bouw7Bron
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
    beschikbaar: false, bron: 'geen_koppeling',
    termijnenBeschikbaar: false, termijnen: [], facturen: [], betaalgegevens: null,
    totalen: { aanneemsom: 0, meerwerk: 0, contractTotaal: 0, gefactureerd: 0, openstaand: 0 }, termijnenDekking: null,
  }
  const ctx = await bouw7VoorDossier(dossierId)
  // Betaalgegevens + aanneemsom komen via getDossierFinancieel (werkt ook zonder Bouw7-koppeling).
  const { bouw7Financial, relatieFacturatie } = await getDossierFinancieel(dossierId)
  if (!ctx) {
    return { ...leeg, betaalgegevens: relatieFacturatie }
  }
  const { client, bouw7Id } = ctx
  // Er ís een koppeling, dus vanaf hier telt elke mislukte call als storing — niet als "niets gevonden".
  // `fetchBouw7Financial` slikt zijn eigen fouten in en geeft dan null; met een geldige ctx betekent
  // die null dus dat Athena niet antwoordde, en dat mag geen contracttotaal van 0 opleveren.
  let bron: Bouw7Bron = bouw7Financial == null ? 'fout' : 'bouw7'

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
    bron = 'fout'
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
        vatTariffId: t.vatTariff?.id ?? null,
        statementId: t.statement?.id ?? null,
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
    bron,
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
    voorlopige_start?: string | null
    voorlopige_eind?: string | null
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
  /** Prognose-uren op deze code (0 als er niets begroot is). */
  prognoseUren: number
  /** Al geboekte uren op deze code. */
  geboekteUren: number
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

/**
 * Bewakingscodes (kostensoort Arbeid) waarop uren geboekt kunnen worden, met hun urenbudget.
 *
 * `alleenMetPrognose` beperkt de lijst tot codes waar daadwerkelijk uren op begroot zijn. Dat is
 * de stand voor het **invoeren** van uren in de weekstaat: een monteur hoort te kiezen uit het
 * werk dat voor dit project gepland is, niet uit de volledige codelijst — anders belandt er werk
 * op codes zonder budget en klopt de bewaking niet meer.
 *
 * Zonder de optie komt de volledige lijst terug. Dat blijft de stand voor het **corrigeren** van
 * al geboekte uren (`UrenDetailTable`): een uur dat op de verkeerde code staat moet naar elke
 * code te verplaatsen zijn, ook naar één zonder prognose.
 */
export async function getBewakingscodesVoorUurlog(
  dossierId: string,
  opties?: { alleenMetPrognose?: boolean },
): Promise<BewakingscodeOptie[]> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return []
  const { client, bouw7Id } = ctx
  try {
    const resp = await client.getAthena<Bouw7ControlResponse>(`/project-control/${bouw7Id}/cost-type/1/chapters?include_subprojects=false`)
    const gevonden: BewakingscodeOptie[] = []
    for (const item of resp.items ?? []) {
      const ci = item.chapterInfo
      if (ci?.name === 'uncoded_costs' || ci?.id === 0) continue
      for (const sc of item.securityCodes ?? []) {
        const code = (sc.code ?? '').trim()
        if (!code) continue
        const pslId = sc.pslIds?.[0]
        if (pslId == null) continue
        // prognosisHours valt terug op budgetHours: een code die nog niet herzien is heeft
        // alleen een begroting, en die telt net zo goed als "hier is werk voor ingepland".
        const prognoseUren = sc.hourInfo?.prognosisHours ?? sc.hourInfo?.budgetHours ?? 0
        gevonden.push({
          code,
          naam: sc.name ?? null,
          pslId,
          prognoseUren,
          geboekteUren: sc.hourInfo?.costHours ?? 0,
        })
      }
    }
    const lijst = opties?.alleenMetPrognose
      ? gevonden.filter(o => o.prognoseUren > 0)
      : gevonden
    return lijst.sort((a, b) => a.code.localeCompare(b.code))
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

/**
 * Verplaatst meerdere uur-logs in één keer naar een andere bewakingscode (project-security-link).
 * Elk uurlog is een aparte POST /project/hour-log upsert richting Bouw7; er is geen bulk-endpoint,
 * dus we sturen ze sequentieel en tellen mislukkingen op. De hele set faalt niet als één regel struikelt.
 */
export async function updateUurlogBewakingscodeBulk(
  dossierId: string,
  hourLogs: { id: number; bouw7ProjectId: number; logHours: string; logDate: string; hourTypeId: number }[],
  nieuwePslId: number,
): Promise<{ ok: boolean; error?: string; verplaatst?: number; mislukt?: number }> {
  await assertDossierBewerkbaar(dossierId)
  if (hourLogs.length === 0) return { ok: false, error: 'Geen regels geselecteerd.' }
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling voor dit dossier.' }
  const { client } = ctx

  let verplaatst = 0
  let mislukt = 0
  let laatsteFout: string | undefined
  for (const hourLog of hourLogs) {
    try {
      await client.post('/project/hour-log', {
        id: hourLog.id,
        project: { id: hourLog.bouw7ProjectId },
        logHours: hourLog.logHours,
        logDate: hourLog.logDate,
        hourType: { id: hourLog.hourTypeId },
        projectSecurityLink: { id: nieuwePslId },
      })
      verplaatst++
    } catch (e) {
      mislukt++
      laatsteFout = e instanceof Error ? e.message : 'Bouw7-update mislukt.'
    }
  }

  revalidatePath(`/opdrachten/${dossierId}/uren`)
  if (verplaatst === 0) return { ok: false, error: laatsteFout ?? 'Bouw7-update mislukt.', verplaatst, mislukt }
  return { ok: true, verplaatst, mislukt, error: mislukt > 0 ? laatsteFout : undefined }
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
