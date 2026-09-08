'use server'

/**
 * Sync van de Bouw7-inkoopfacturen naar `public.inkoopfacturen`.
 *
 * Eigen bestand omdat `sync.ts` al ruim 2000 regels is; `sync-management.ts` is het precedent.
 *
 * **Twee bronnen, twee kostenprofielen.** De lijst is één call voor álle facturen; het
 * `approval`-object zit alléén op het detail en kost één call per factuur. De sync haalt de lijst
 * dus altijd op, en het detail uitsluitend voor facturen waar de goedkeuringsworkflow nog loopt
 * (`bouw7_status` 1 of 5, in de praktijk ~155 stuks), oudste leesdatum eerst en begrensd door
 * `maxDetails`. Zo loopt een achterstand over meerdere runs leeg zonder dat één run vastloopt.
 *
 * **Kolomdiscipline (zoals bij `syncDebiteuren`).** De upsert-payload bevat uitsluitend
 * Bouw7-bronkolommen. Alles wat EVA zelf bijhoudt — opmerkingen, audit, betaalronde — staat in
 * andere kolommen of tabellen en wordt hier nooit aangeraakt.
 */

import { createAdminClient } from '@everts/database/server'
import { getBouw7Client, logSync, type SyncMode, type SyncResult } from './sync'
import { fingerprint } from './fingerprint'
import { bouw7RichTextNaarTekst } from './rich-text'
import { INKOOP_STATUS_WORKFLOW_LOOPT } from './inkoop-status'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import type {
  Bouw7Client,
  Bouw7PurchaseInvoiceListItem,
  Bouw7PurchaseInvoiceListResponse,
  Bouw7PurchaseInvoiceDetail,
} from './client'

/**
 * Bewakingscode per factuur uit de Apollo-zoekindex.
 *
 * De Heimdall-lijst heeft dit veld niet — daar zit `deliveryTicket` zonder `securityLink`.
 * Apollo `/search/purchase-invoices` heeft het wel, en accepteert `datePaid IS NULL` als filter,
 * wat exact dezelfde 559 facturen oplevert als onze eigen selectie. Eén call voor de hele set.
 */
type ApolloInkoopRij = {
  id: number
  deliveryTicket?: {
    securityLink?: {
      code?: {
        code?: string | null
        name?: string | null
        chapter?: { name?: string | null } | null
      } | null
    } | null
  } | null
}

/** Hoeveel approval-detailcalls één run maximaal doet. */
const MAX_DETAILS_STANDAARD = 250
/** Gelijktijdige detailcalls. Bewust laag: Bouw7 is de gedeelde bron van de hele cron. */
const DETAIL_PARALLEL = 5

/** ISO-datumstring → "YYYY-MM-DD" (lokale dag; Bouw7 levert al met offset). */
function toDate(dt?: string | null): string | null {
  return dt ? dt.slice(0, 10) : null
}

function toNum(v: string | number | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function volledigeNaam(e?: { firstName?: string | null; lastName?: string | null } | null): string | null {
  if (!e) return null
  const naam = [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
  return naam || null
}

/** Voer `taak` uit over `items` met hooguit `limiet` gelijktijdige aanroepen. */
async function metLimiet<T>(items: T[], limiet: number, taak: (item: T) => Promise<void>): Promise<void> {
  let volgende = 0
  const werkers = Array.from({ length: Math.min(limiet, items.length) }, async () => {
    for (;;) {
      const i = volgende++
      if (i >= items.length) return
      await taak(items[i])
    }
  })
  await Promise.all(werkers)
}

/** De Bouw7-bronkolommen van één factuurrij — precies wat de sync mag schrijven. */
type BronRij = Record<string, unknown>

function bouwBronRij(
  inv: Bouw7PurchaseInvoiceListItem,
  koppel: {
    dossierByProject: Map<string, { id: string }>
    relatieByBouw7: Map<string, string>
    codePerFactuur: Map<string, { code: string | null; naam: string | null; hoofdstuk: string | null }>
  },
  nu: string
): { invoiceId: string; bron: BronRij } {
  const invoiceId = String(inv.id)
  const projectId = inv.project?.id != null ? String(inv.project.id) : null
  const dossier = projectId ? koppel.dossierByProject.get(projectId) : undefined
  const relatieId = inv.supplier?.id != null ? koppel.relatieByBouw7.get(String(inv.supplier.id)) ?? null : null
  const code = koppel.codePerFactuur.get(invoiceId) ?? null

  // Alleen velden die de EVA-rij bepalen. `updatedAt` vangt wijzigingen die we niet los volgen
  // (bv. een gewijzigde goedkeurder) zonder dat we per factuur het detail hoeven te lezen.
  const hash = fingerprint({
    nr:   inv.invoiceNumber ?? null,
    st:   inv.status ?? null,
    sup:  inv.supplier?.id ?? null,
    proj: projectId,
    incl: toNum(inv.total),
    fd:   toDate(inv.date),
    vd:   toDate(inv.dueDate),
    bet:  toDate(inv.datePaid),
    appr: inv.currentApprover ?? null,
    upd:  inv.updatedAt ?? null,
    code: code?.code ?? null,
  })

  return {
    invoiceId,
    bron: {
      bouw7_invoice_id:        invoiceId,
      factuurnummer:           inv.invoiceNumber ?? null,
      betalingskenmerk:        inv.paymentReference ?? null,
      boekstuknummer:          inv.entryNumber != null ? String(inv.entryNumber) : null,
      bouw7_status:            inv.status ?? null,

      leverancier_bouw7_id:    inv.supplier?.id != null ? String(inv.supplier.id) : null,
      leverancier_naam:        inv.supplier?.name ?? null,
      leverancier_type:        inv.supplier?.type ?? null,
      leverancier_relatie_id:  relatieId,

      bouw7_project_id:        projectId,
      project_naam:            inv.project?.name ?? null,
      project_nummer:          inv.project?.number ?? null,
      dossier_id:              dossier?.id ?? null,

      divisie_bouw7_id:        inv.division?.id ?? null,
      divisie_naam:            inv.division?.description ?? null,
      divisie_exact_id:        inv.division?.exactDivisionId ?? null,
      journaalcode_inkoop:     inv.division?.journalCodePurchase ?? null,
      vestiging_naam:          inv.branch?.name ?? null,

      bedrag_excl:             toNum(inv.subTotal),
      btw_bedrag:              toNum(inv.vatTotal),
      bedrag_incl:             toNum(inv.total),
      factuurdatum:            toDate(inv.date),
      vervaldatum:             toDate(inv.dueDate),
      datum_betaald:           toDate(inv.datePaid),

      bouw7_opmerking:         bouw7RichTextNaarTekst(inv.comment ?? '') || null,
      ordernummer:             inv.orderNumber || null,
      bon_nummer:              inv.deliveryTicket?.number ?? null,
      bon_omschrijving:        bouw7RichTextNaarTekst(inv.deliveryTicket?.description ?? '') || null,

      bewakingscode:           code?.code ?? null,
      bewakingscode_naam:      code?.naam ?? null,
      bewakingscode_hoofdstuk: code?.hoofdstuk ?? null,

      is_muteerbaar:           inv.isMutable ?? null,
      is_geboekt_in_exact:     inv.isBookedInExact ?? null,
      is_geboekt_in_twinfield: inv.isBookedInTwinfield ?? null,
      uit_basecone:            inv.isOriginatingFromBasecone ?? null,
      keten_verloopt_op:       toDate(inv.chainLiabilityDocumentExpirationDate),

      bouw7_aangemaakt_op:     inv.createdAt ?? null,
      bouw7_gewijzigd_op:      inv.updatedAt ?? null,

      // Weergavenaam uit de lijst. Nooit op matchen — zie de kolomtoelichting in de migratie.
      huidige_goedkeurder_naam: inv.currentApprover ?? null,

      bouw7_sync_hash:         hash,
      bouw7_laatst_sync:       nu,
    },
  }
}

/**
 * Werk het `approval`-blok van één factuur bij uit het Bouw7-detail.
 * Schrijft de approval-kolommen op `inkoopfacturen` en spiegelt de keten in
 * `inkoopfactuur_goedkeurders`. Gooit niet — een mislukte detailcall mag de run niet stoppen;
 * `false` betekent alleen dat déze factuur is overgeslagen.
 */
async function ververApproval(
  bouw7: Bouw7Client,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  rij: { id: string; bouw7_invoice_id: string },
  medewerkerByBouw7: Map<string, string>,
  nu: string
): Promise<boolean> {
  let detail: Bouw7PurchaseInvoiceDetail
  try {
    detail = await bouw7.get<Bouw7PurchaseInvoiceDetail>(
      `/purchase-invoicing/purchase-invoice/${rij.bouw7_invoice_id}`
    )
  } catch {
    return false
  }

  const approval = detail.approval ?? null
  const huidig = approval?.currentApprover ?? null
  const employeeId = huidig?.employee?.id != null ? String(huidig.employee.id) : null
  const goedkeurderId = employeeId ? medewerkerByBouw7.get(employeeId) ?? null : null

  await supabase
    .from('inkoopfacturen')
    .update({
      bouw7_approval_id:                     approval?.id != null ? String(approval.id) : null,
      approval_workflow_id:                  approval?.workflowId != null ? String(approval.workflowId) : null,
      approval_index:                        approval?.currentIndex ?? null,
      approval_is_goedgekeurd:               approval?.isApproved ?? null,
      approval_kan_accorderen:               approval?.canApprove ?? null,
      huidige_goedkeurder_bouw7_employee_id: employeeId,
      huidige_goedkeurder_id:                goedkeurderId,
      approval_laatste_actie_op:             approval?.lastActionDate ?? null,
      approval_laatst_gelezen_op:            nu,
    })
    .eq('id', rij.id)

  const stappen = (approval?.approvers ?? []).map(a => ({
    inkoopfactuur_id:  rij.id,
    bouw7_approver_id: String(a.id),
    volgorde:          a.index ?? null,
    bouw7_employee_id: a.employee?.id != null ? String(a.employee.id) : null,
    medewerker_id:     a.employee?.id != null ? medewerkerByBouw7.get(String(a.employee.id)) ?? null : null,
    naam:              volledigeNaam(a.employee),
    status:            a.approvalStatus ?? null,
    besloten_op:       a.approvalDate ?? null,
    opmerking:         bouw7RichTextNaarTekst(a.comment ?? '') || null,
    updated_at:        nu,
  }))

  if (stappen.length > 0) {
    await supabase
      .from('inkoopfactuur_goedkeurders')
      .upsert(stappen, { onConflict: 'inkoopfactuur_id,bouw7_approver_id' })
  }

  return true
}

/**
 * Haal de inkoopfacturen op en werk EVA bij.
 *
 * `mode: 'full'` schrijft alle rijen opnieuw weg; `'incremental'` (default) slaat facturen met
 * een ongewijzigde fingerprint over. De approval-detailcalls staan daar los van: die volgen
 * altijd de eigen wachtrij op `approval_laatst_gelezen_op`.
 */
export async function syncInkoopfacturen(
  opts?: { mode?: SyncMode; maxDetails?: number }
): Promise<SyncResult> {
  const mode: SyncMode = opts?.mode ?? 'incremental'
  const maxDetails = opts?.maxDetails ?? MAX_DETAILS_STANDAARD
  const start = Date.now()
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  const nu = new Date().toISOString()
  const vandaag = nu.slice(0, 10)

  try {
    const bouw7 = await getBouw7Client()
    // Eén call voor álles: dit endpoint negeert limit/offset en geeft de volledige lijst terug
    // (3040 rijen ≈ 4 MB, geverifieerd sep 2026). Filteren doen we in geheugen.
    const resp = await bouw7.get<Bouw7PurchaseInvoiceListResponse>('/list/purchase-invoices')
    const facturen = (resp.items ?? []).filter(inv => !inv.datePaid)

    // Bewakingscodes in één klap uit Apollo. Fail-soft: valt deze bron weg, dan blijft de kolom
    // leeg maar loopt de rest van de sync gewoon door — een ontbrekende code is geen reden om
    // 559 facturen niet bij te werken.
    const codePerFactuur = new Map<string, { code: string | null; naam: string | null; hoofdstuk: string | null }>()
    try {
      const apollo = await bouw7.getApolloAll<ApolloInkoopRij>(
        '/search/purchase-invoices', 'datePaid IS NULL', 1000,
      )
      for (const rij of apollo) {
        const code = rij.deliveryTicket?.securityLink?.code
        if (!code?.code) continue
        codePerFactuur.set(String(rij.id), {
          code: code.code ?? null,
          naam: code.name ?? null,
          hoofdstuk: code.chapter?.name ?? null,
        })
      }
    } catch {
      // stil — zie hierboven
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any

    // Alle vier de koppelmaps gepagineerd: dossiers (680), relaties (619) en inkoopfacturen (559)
    // groeien richting de 1000-rijengrens waar PostgREST stil afkapt. Zie lib/supabase/paginate.ts.
    type KoppelRij = { id: string; bouw7_id: string }
    type MedewerkerRij = { id: string; bouw7_id: string }
    type BestaandeRij = {
      id: string
      bouw7_invoice_id: string
      bouw7_sync_hash: string | null
      status: string
      huidige_goedkeurder_id: string | null
    }

    const [dossierRows, relatieRows, medewerkerRows, bestaand] = await Promise.all([
      haalAlleRijen<KoppelRij>((van, tot) =>
        supabase.from('dossiers').select('id, bouw7_id')
          .not('bouw7_id', 'is', null).order('id').range(van, tot)),
      haalAlleRijen<KoppelRij>((van, tot) =>
        supabase.from('relaties').select('id, bouw7_id')
          .not('bouw7_id', 'is', null).order('id').range(van, tot)),
      haalAlleRijen<MedewerkerRij>((van, tot) =>
        supabase.from('medewerkers').select('id, bouw7_id')
          .not('bouw7_id', 'is', null).order('id').range(van, tot)),
      haalAlleRijen<BestaandeRij>((van, tot) =>
        supabase.from('inkoopfacturen')
          .select('id, bouw7_invoice_id, bouw7_sync_hash, status, huidige_goedkeurder_id')
          .order('id').range(van, tot)),
    ])

    const dossierByProject = new Map<string, { id: string }>(
      dossierRows.map(d => [String(d.bouw7_id), { id: d.id }])
    )
    const relatieByBouw7 = new Map<string, string>(
      relatieRows.map(r => [String(r.bouw7_id), r.id])
    )
    const medewerkerByBouw7 = new Map<string, string>(
      medewerkerRows.map(m => [String(m.bouw7_id), m.id])
    )
    const bestaandByInvoice = new Map<string, BestaandeRij>(
      bestaand.map(d => [d.bouw7_invoice_id, d])
    )

    const openInvoiceIds = new Set<string>()
    const allRows = facturen.map(inv => {
      const rij = bouwBronRij(inv, { dossierByProject, relatieByBouw7, codePerFactuur }, nu)
      openInvoiceIds.add(rij.invoiceId)
      return rij
    })

    const nieuweRows = allRows.filter(r => !bestaandByInvoice.has(r.invoiceId))
    const bestaandeRows = allRows.filter(r => bestaandByInvoice.has(r.invoiceId))
    const teUpdaten = mode === 'full'
      ? bestaandeRows
      : bestaandeRows.filter(r => bestaandByInvoice.get(r.invoiceId)?.bouw7_sync_hash !== r.bron.bouw7_sync_hash)

    result.nieuw = nieuweRows.length
    result.bijgewerkt = teUpdaten.length
    result.overgeslagen = bestaandeRows.length - teUpdaten.length

    for (let i = 0; i < nieuweRows.length; i += 500) {
      const { error } = await supabase
        .from('inkoopfacturen')
        .insert(nieuweRows.slice(i, i + 500).map(r => ({ ...r.bron, status: 'open' })))
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // Update uitsluitend de Bouw7-bronkolommen; opmerkingen, audit en betaalronde blijven staan.
    for (const r of teUpdaten) {
      const { error } = await supabase
        .from('inkoopfacturen')
        .update(r.bron)
        .eq('bouw7_invoice_id', r.invoiceId)
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // Zacht afsluiten: staat niet meer in de onbetaalde Bouw7-lijst → afgehandeld.
    // Niet verwijderen: de opmerkingen, de audit en de betaalronde-historie moeten blijven.
    const teSluiten = bestaand
      .filter((d: BestaandeRij) => d.status === 'open' && !openInvoiceIds.has(d.bouw7_invoice_id))
      .map((d: BestaandeRij) => d.id)
    for (let i = 0; i < teSluiten.length; i += 500) {
      const { error } = await supabase
        .from('inkoopfacturen')
        .update({ status: 'afgehandeld', datum_betaald: vandaag, bouw7_laatst_sync: nu })
        .in('id', teSluiten.slice(i, i + 500))
      if (error) { result.fouten++; result.foutMelding = error.message }
    }

    // ── Approval-detail: alleen waar de workflow nog loopt, oudste leesdatum eerst ──────
    //
    // BEWUST GEEN MELDING PER FACTUUR. Een eerste versie stuurde een notificatie zodra er een
    // goedkeurder aan zet kwam; bij 143 openstaande facturen liep de goedkeurder daarmee in één
    // sync-run vol. Inkoopfacturen komen in bulk binnen — dat is een werkvoorraad, geen
    // gebeurtenis waar je per stuk op geattendeerd wilt worden. De werkvoorraad staat op het
    // tabblad "Te accorderen door mij" met een teller; dát is de ingang.
    const { data: teVerversen } = await supabase
      .from('inkoopfacturen')
      .select('id, bouw7_invoice_id')
      .eq('status', 'open')
      .in('bouw7_status', INKOOP_STATUS_WORKFLOW_LOOPT)
      .order('approval_laatst_gelezen_op', { ascending: true, nullsFirst: true })
      .limit(maxDetails)

    type VerversRij = { id: string; bouw7_invoice_id: string }
    const rijen: VerversRij[] = teVerversen ?? []

    await metLimiet(rijen, DETAIL_PARALLEL, async rij => {
      const gelukt = await ververApproval(bouw7, supabase, rij, medewerkerByBouw7, nu)
      if (!gelukt) result.fouten++
    })
  } catch (e: unknown) {
    result.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
    result.fouten++
  }

  await logSync('inkoopfacturen', 'in', result, Date.now() - start)
  return result
}

/**
 * Ververs één factuur direct uit Bouw7 — lijstvelden én de goedkeuringsketen.
 *
 * Nodig omdat de sync maar twee keer per dag loopt: het paneel moet de actuele stand tonen, en
 * vóór/na een stem mag er nooit op verouderde approval-state worden gewerkt.
 */
export async function ververEenInkoopfactuur(inkoopfactuurId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const nu = new Date().toISOString()

  const { data: rij } = await supabase
    .from('inkoopfacturen')
    .select('id, bouw7_invoice_id')
    .eq('id', inkoopfactuurId)
    .maybeSingle()
  if (!rij) return

  const bouw7 = await getBouw7Client()

  const medewerkerRows = await haalAlleRijen<{ id: string; bouw7_id: string }>((van, tot) =>
    supabase.from('medewerkers').select('id, bouw7_id')
      .not('bouw7_id', 'is', null).order('id').range(van, tot))
  const medewerkerByBouw7 = new Map<string, string>(
    medewerkerRows.map(m => [String(m.bouw7_id), m.id])
  )

  await ververApproval(bouw7, supabase, rij, medewerkerByBouw7, nu)

  // De lijstvelden (status, betaaldatum, bedragen) komen uit de lijst-call; die is te duur voor
  // één factuur. Het detail geeft status en datePaid ook terug — genoeg om de rij bij te trekken.
  try {
    const detail = await bouw7.get<Bouw7PurchaseInvoiceDetail & { datePaid?: string | null }>(
      `/purchase-invoicing/purchase-invoice/${rij.bouw7_invoice_id}`
    )
    await supabase
      .from('inkoopfacturen')
      .update({
        bouw7_status:      detail.status ?? null,
        datum_betaald:     toDate(detail.datePaid),
        bouw7_laatst_sync: nu,
      })
      .eq('id', rij.id)
  } catch {
    // Stil: de approval-kant is al bijgewerkt; de lijstvelden komen bij de volgende sync mee.
  }
}
