'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/everts-calc/supabase/server'
import { createAdminClient } from '@everts/database/server'
import { Bouw7Client } from '@/lib/bouw7/client'
import type { Bouw7ControlResponse, Bouw7ContractOrderLine } from '@/lib/bouw7/client'
import type { Werkbegroting, WerkbegrotingRegel, WerkbegrotingComponent, WerkbegrotingWijziging, WerkbegrotingBestelling, RelatieRef } from '@/lib/everts-calc/types'

export interface SyncWerkbegrotingResultaat {
  gelukt: boolean
  regels_geschreven: number
  fout?: string
}

/** Volledige client-toestand van een werkbegroting (localStorage) voor sync + gates. */
export interface WerkbegrotingPayload {
  wb: Werkbegroting
  regels: WerkbegrotingRegel[]
  componenten: WerkbegrotingComponent[]
  wijzigingen: WerkbegrotingWijziging[]
  dossierId: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── Sync werkbegroting naar Supabase ─────────────────────────────────────────
//
// De werkbegroting leeft localStorage-first; deze sync maakt Supabase de waarheid
// op momentopname zodat de server-side gates (accorderen, bestellingen, prognose)
// op echte data kunnen controleren. Regels/componenten die niet (meer) in de
// payload staan worden server-side soft-deleted (is_verwijderd = true).

export async function syncWerkbegrotingNaarSupabase(
  payload: WerkbegrotingPayload
): Promise<SyncWerkbegrotingResultaat> {
  // Cast naar any: de gegenereerde everts-calc-types lopen achter op de nieuwe
  // kolommen (is_verwijderd, dossier_id, nullable project_id).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any
  const nu = new Date().toISOString()
  const { wb, regels, componenten, wijzigingen, dossierId } = payload

  try {
    // 1. Upsert werkbegroting header. Synthetische project-ids ("wb-direct-…",
    //    geen uuid, niet in projects) gaan als null mee; dossier_id is het anker.
    const projectId = UUID_RE.test(wb.project_id) ? wb.project_id : null
    const { error: wbErr } = await db
      .from('werkbegrotingen')
      .upsert({
        id: wb.id, project_id: projectId, scenario_id: wb.scenario_id,
        naam: wb.naam, status: wb.status, dossier_id: dossierId, bijgewerkt_op: nu,
      }, { onConflict: 'id' })
    if (wbErr) throw new Error(`Werkbegroting header sync: ${wbErr.message}`)

    // 2. Upsert regels (incl. is_verwijderd)
    if (regels.length > 0) {
      const { error: regelErr } = await db
        .from('werkbegroting_regels')
        .upsert(
          regels.map(r => ({
            id: r.id, werkbegroting_id: r.werkbegroting_id,
            source_calculatieregel_id: r.source_calculatieregel_id,
            groep_id: r.groep_id, omschrijving: r.omschrijving,
            hoeveelheid: r.hoeveelheid, eenheid: r.eenheid,
            kostengroep: r.kostengroep ?? null, volgorde: r.volgorde,
            opslag_pct: r.opslag_pct ?? null, btw_pct: r.btw_pct ?? null,
            opmerking: r.opmerking ?? null, is_stelpost: r.is_stelpost ?? false,
            is_verwijderd: r.is_verwijderd ?? false,
            bijgewerkt_op: nu,
          })),
          { onConflict: 'id' }
        )
      if (regelErr) throw new Error(`Regels sync: ${regelErr.message}`)
    }

    // 3. Upsert componenten (incl. is_verwijderd)
    if (componenten.length > 0) {
      const { error: compErr } = await db
        .from('werkbegroting_componenten')
        .upsert(
          componenten.map(c => ({
            id: c.id, werkbegroting_regel_id: c.werkbegroting_regel_id,
            source_component_id: c.source_component_id, type: c.type,
            norm_hoeveelheid: c.norm_hoeveelheid, eenheid: c.eenheid ?? null,
            tarief: c.tarief, opslag_pct: c.opslag_pct ?? null,
            omschrijving: c.omschrijving ?? null, relatie_id: c.relatie_id ?? null,
            leverancier_naam: c.leverancier_naam ?? null,
            aannemersnaam: c.aannemersnaam ?? null, offertenummer: c.offertenummer ?? null,
            is_verwijderd: c.is_verwijderd ?? false,
            bijgewerkt_op: nu,
          })),
          { onConflict: 'id' }
        )
      if (compErr) throw new Error(`Componenten sync: ${compErr.message}`)
    }

    // 4. Server-side rijen die niet (meer) in de payload staan → soft delete.
    //    (Client verwijdert regels soms hard uit localStorage; de server bewaart
    //    ze als is_verwijderd zodat snapshots en bestellingen verklaarbaar blijven.)
    const inLijst = (ids: string[]) => `(${ids.map(id => `"${id}"`).join(',')})`
    const regelIds = regels.map(r => r.id)
    if (regelIds.length > 0) {
      await db
        .from('werkbegroting_regels')
        .update({ is_verwijderd: true, bijgewerkt_op: nu })
        .eq('werkbegroting_id', wb.id)
        .not('id', 'in', inLijst(regelIds))
    } else {
      await db
        .from('werkbegroting_regels')
        .update({ is_verwijderd: true, bijgewerkt_op: nu })
        .eq('werkbegroting_id', wb.id)
    }
    const compIds = componenten.map(c => c.id)
    if (regelIds.length > 0) {
      let verwijderQuery = db
        .from('werkbegroting_componenten')
        .update({ is_verwijderd: true, bijgewerkt_op: nu })
        .in('werkbegroting_regel_id', regelIds)
      if (compIds.length > 0) verwijderQuery = verwijderQuery.not('id', 'in', inLijst(compIds))
      await verwijderQuery
    }

    // 5. Wijzigingen (append-only)
    if (wijzigingen.length > 0) {
      const { error: wijzErr } = await db
        .from('werkbegroting_wijzigingen')
        .upsert(
          wijzigingen.map(w => ({
            id: w.id, werkbegroting_id: w.werkbegroting_id,
            werkbegroting_regel_id: w.werkbegroting_regel_id,
            component_id: w.component_id, veld: w.veld,
            oude_waarde: w.oude_waarde, nieuwe_waarde: w.nieuwe_waarde,
            user_id: w.user_id, aangemaakt_op: w.aangemaakt_op,
          })),
          { onConflict: 'id', ignoreDuplicates: true }
        )
      if (wijzErr) throw new Error(`Wijzigingen sync: ${wijzErr.message}`)
    }

    // 6. WB!-dossiervlag verversen (wijzigingen na accordering zichtbaar op kaart/tab).
    if (dossierId) {
      const { refreshDossierWbVlag } = await import('@/lib/goedkeuring/actions')
      await refreshDossierWbVlag(dossierId).catch(() => {})
    }

    return { gelukt: true, regels_geschreven: regels.length }
  } catch (err) {
    return { gelukt: false, regels_geschreven: 0, fout: err instanceof Error ? err.message : 'Onbekende fout' }
  }
}

// ─── Sync bestellingen naar Supabase ─────────────────────────────────────────

export async function syncBestellingenNaarSupabase(
  bestellingen: WerkbegrotingBestelling[]
): Promise<{ gelukt: boolean; fout?: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = (await createClient()) as any
  const nu = new Date().toISOString()

  try {
    for (const b of bestellingen) {
      const { error: bErr } = await db
        .from('werkbegroting_bestellingen')
        .upsert({ id: b.id, werkbegroting_id: b.werkbegroting_id, omschrijving: b.omschrijving, relatie_id: b.relatie_id ?? null, status: b.status, bijgewerkt_op: nu }, { onConflict: 'id' })
      if (bErr) throw new Error(`Bestelling sync: ${bErr.message}`)

      await db.from('werkbegroting_bestelling_regels').delete().eq('bestelling_id', b.id)

      if (b.component_ids.length > 0) {
        const { error: jErr } = await db
          .from('werkbegroting_bestelling_regels')
          .insert(b.component_ids.map((cid: string) => ({ bestelling_id: b.id, component_id: cid })))
        if (jErr) throw new Error(`Bestelling regels sync: ${jErr.message}`)
      }
    }

    return { gelukt: true }
  } catch (err) {
    return { gelukt: false, fout: err instanceof Error ? err.message : 'Onbekende fout' }
  }
}

// ─── Zoek relaties (leveranciers / onderaannemers) ────────────────────────────

export async function zoekRelaties(
  zoekterm: string,
  type?: 'leverancier' | 'onderaannemer'
): Promise<RelatieRef[]> {
  if (!zoekterm || zoekterm.length < 2) return []

  const db = await createClient()
  let query = db
    .from('relaties')
    .select('id, naam, types, email, telefoon')
    .ilike('naam', `%${zoekterm}%`)
    .eq('actief', true)
    .order('naam', { ascending: true })
    .limit(50)

  if (type) {
    query = query.contains('types', [type])
  } else {
    query = query.overlaps('types', ['leverancier', 'onderaannemer'])
  }

  const { data, error } = await query
  if (error || !data) return []
  return data as unknown as RelatieRef[]
}

// ─── Bulk update componenten ──────────────────────────────────────────────────

export async function bulkUpdateComponenten(
  componentIds: string[],
  patch: Partial<Pick<WerkbegrotingComponent, 'tarief' | 'relatie_id' | 'leverancier_naam' | 'aannemersnaam' | 'offertenummer'>>
): Promise<{ gelukt: boolean; fout?: string }> {
  if (componentIds.length === 0) return { gelukt: true }

  const db = await createClient()
  const nu = new Date().toISOString()

  const { error } = await db
    .from('werkbegroting_componenten')
    .update({ ...patch, bijgewerkt_op: nu })
    .in('id', componentIds)

  if (error) return { gelukt: false, fout: error.message }
  return { gelukt: true }
}

// ─── Controletaak bij goedkeuring aanvragen ───────────────────────────────────

export interface ControleTaakResultaat {
  /** Naam van de medewerker aan wie de taak is toegewezen (null als niemand gevonden). */
  toegewezenAan: string | null
  /** True als er geen controller op het dossier stond en is teruggevallen op Tom Kamminga. */
  isFallback: boolean
  /** True als er al een openstaande controletaak bestond (er is dan geen nieuwe gemaakt). */
  bestond: boolean
  taakId: string | null
}

/**
 * Maakt bij het indienen van een werkbegroting ter goedkeuring een taak
 * "Werkbegroting controleren" aan op het dossier, toegewezen aan de controller.
 * Staat er geen controller op het dossier, dan valt de taak terug op Tom Kamminga.
 */
export async function maakWerkbegrotingControleTaak(dossierId: string): Promise<ControleTaakResultaat> {
  const { maakBeoordeelTaak } = await import('@/lib/goedkeuring/taken')
  return maakBeoordeelTaak(dossierId, 'Werkbegroting controleren')
}

// ─── Goedkeuring: accorderen met regel-snapshot + gates ───────────────────────
//
// De goedkeuringsstatus wordt op regelniveau bijgehouden: bij accorderen wordt per
// actieve regel een hash (regelvelden + actieve componenten) vastgelegd in
// werkbegroting_goedkeuring_regels. Een regel is "geaccordeerd" zolang zijn actuele
// hash matcht met dat snapshot. Alle gates syncen eerst de client-payload en
// rekenen daarna server-side — de client kan niets forceren.

export type WerkbegrotingGoedkeuringStatusResultaat = {
  laatsteGoedkeuringId: string | null
  ooitGoedgekeurd: boolean
  regels: { regel_id: string; goedgekeurd: boolean }[]
  volledigGoedgekeurd: boolean
  /** Snapshot van de laatste goedgekeurde ronde — voor client-side badges. */
  snapshot: { regel_id: string; regel_hash: string }[]
}

/** Regel-goedkeuringsstatus voor de UI (badges + headerteller). */
export async function getWerkbegrotingGoedkeuringStatus(
  werkbegrotingId: string,
): Promise<WerkbegrotingGoedkeuringStatusResultaat> {
  const { berekenWerkbegrotingStatus } = await import('@/lib/goedkeuring/werkbegroting-status')
  const status = await berekenWerkbegrotingStatus(werkbegrotingId)
  return {
    laatsteGoedkeuringId: status.laatsteGoedkeuringId,
    ooitGoedgekeurd: status.ooitGoedgekeurd,
    regels: status.regels,
    volledigGoedgekeurd: status.volledigGoedgekeurd,
    snapshot: status.snapshot,
  }
}

export type AccordeerResultaat = { ok: true } | { ok: false; error: string }

/**
 * Accordeert een openstaande goedkeuringsaanvraag: synct de payload, legt per
 * actieve regel het snapshot vast, zet de aanvraag op 'goedgekeurd' en de
 * werkbegroting op 'geaccordeerd'. Autorisatie (controller/Directie/gedelegeerde)
 * wordt in keurGoed server-side afgedwongen.
 */
export async function accordeerWerkbegroting(
  goedkeuringId: string,
  payload: WerkbegrotingPayload,
  opmerking?: string,
): Promise<AccordeerResultaat> {
  const { bepaalBeoordeelContext } = await import('@/lib/goedkeuring/autorisatie')
  const { keurGoed, refreshDossierWbVlag } = await import('@/lib/goedkeuring/actions')
  const { hashWerkbegrotingRegel } = await import('@/lib/everts-calc/goedkeuring-hash')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // 1. Aanvraag + autorisatie vooraf controleren (vóór we snapshots schrijven).
  const { data: goedkeuring } = await db
    .from('goedkeuringen')
    .select('id, status, dossier_id, gedelegeerd_aan, meekijkers, aangevraagd_door')
    .eq('id', goedkeuringId)
    .maybeSingle()
  if (!goedkeuring) return { ok: false, error: 'Goedkeuringsaanvraag niet gevonden.' }
  if (goedkeuring.status !== 'aangevraagd') return { ok: false, error: 'Deze aanvraag staat niet meer open.' }
  const ctx = await bepaalBeoordeelContext(goedkeuring.dossier_id, goedkeuring)
  if (!ctx.magBeoordelen) return { ok: false, error: 'Je bent niet bevoegd om deze werkbegroting te accorderen.' }

  // 2. Payload syncen — Supabase is de waarheid op accordeermoment.
  const sync = await syncWerkbegrotingNaarSupabase(payload)
  if (!sync.gelukt) return { ok: false, error: `Synchroniseren mislukt: ${sync.fout}` }

  // 3. Snapshot per actieve regel.
  const actieveRegels = payload.regels.filter(r => !r.is_verwijderd)
  const compsPerRegel = new Map<string, WerkbegrotingComponent[]>()
  for (const c of payload.componenten) {
    if (c.is_verwijderd) continue
    const arr = compsPerRegel.get(c.werkbegroting_regel_id) ?? []
    arr.push(c)
    compsPerRegel.set(c.werkbegroting_regel_id, arr)
  }
  const snapshotRijen = await Promise.all(
    actieveRegels.map(async r => ({
      goedkeuring_id: goedkeuringId,
      regel_id: r.id,
      regel_hash: await hashWerkbegrotingRegel(r, compsPerRegel.get(r.id) ?? []),
    })),
  )
  await db.from('werkbegroting_goedkeuring_regels').delete().eq('goedkeuring_id', goedkeuringId)
  if (snapshotRijen.length > 0) {
    const { error: snapErr } = await db.from('werkbegroting_goedkeuring_regels').insert(snapshotRijen)
    if (snapErr) return { ok: false, error: `Snapshot opslaan mislukt: ${snapErr.message}` }
  }

  // 4. Goedkeuren (autorisatie + taak sluiten + audit in keurGoed).
  const res = await keurGoed(goedkeuringId, { opmerking })
  if (!res.ok) return res

  // 5. Werkbegroting-status → geaccordeerd + dossiervlag verversen.
  await db.from('werkbegrotingen').update({ status: 'geaccordeerd' }).eq('id', payload.wb.id)
  if (payload.dossierId) await refreshDossierWbVlag(payload.dossierId)

  return { ok: true }
}

// ─── Gate: bestellingen ───────────────────────────────────────────────────────

export type ZetBestellingKlaarResultaat = { ok: true } | { ok: false; error: string }

/**
 * Zet een bestelling klaar (of werkt hem bij): synct de payload en de bestelling,
 * en legt de componenten-hash vast waarmee later veroudering wordt gedetecteerd.
 * Klaarzetten is altijd toegestaan — alleen verzenden is gated.
 */
export async function zetBestellingKlaar(
  bestelling: WerkbegrotingBestelling,
  payload: WerkbegrotingPayload,
): Promise<ZetBestellingKlaarResultaat> {
  const { hashComponentenSet } = await import('@/lib/everts-calc/goedkeuring-hash')

  const sync = await syncWerkbegrotingNaarSupabase(payload)
  if (!sync.gelukt) return { ok: false, error: `Synchroniseren mislukt: ${sync.fout}` }

  const bestellingSync = await syncBestellingenNaarSupabase([bestelling])
  if (!bestellingSync.gelukt) return { ok: false, error: `Bestelling opslaan mislukt: ${bestellingSync.fout}` }

  const componenten = payload.componenten.filter(c => bestelling.component_ids.includes(c.id) && !c.is_verwijderd)
  const hash = await hashComponentenSet(componenten)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { error } = await db
    .from('werkbegroting_bestellingen')
    .update({ componenten_hash: hash, klaargezet_op: new Date().toISOString() })
    .eq('id', bestelling.id)
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

export type VerzendBestellingResultaat =
  | { ok: true }
  | { ok: false; reden: 'niet_goedgekeurd' | 'verouderd' | 'fout'; error: string; regels?: string[] }

/**
 * Gate: verzend een klaargezette bestelling. Alleen toegestaan als (a) alle
 * werkbegroting-regels achter de bestelde componenten onder de laatste accordering
 * vallen en (b) de componenten sinds het klaarzetten niet zijn gewijzigd.
 */
export async function verzendBestelling(
  bestellingId: string,
  payload: WerkbegrotingPayload,
): Promise<VerzendBestellingResultaat> {
  const { hashComponentenSet } = await import('@/lib/everts-calc/goedkeuring-hash')
  const { berekenWerkbegrotingStatus } = await import('@/lib/goedkeuring/werkbegroting-status')

  const sync = await syncWerkbegrotingNaarSupabase(payload)
  if (!sync.gelukt) return { ok: false, reden: 'fout', error: `Synchroniseren mislukt: ${sync.fout}` }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: bestelling } = await db
    .from('werkbegroting_bestellingen')
    .select('id, werkbegroting_id, componenten_hash, status')
    .eq('id', bestellingId)
    .maybeSingle()
  if (!bestelling) return { ok: false, reden: 'fout', error: 'Bestelling niet gevonden — zet hem eerst klaar.' }

  const { data: junction } = await db
    .from('werkbegroting_bestelling_regels')
    .select('component_id')
    .eq('bestelling_id', bestellingId)
  const componentIds = new Set<string>(((junction ?? []) as { component_id: string }[]).map(j => j.component_id))
  if (componentIds.size === 0) return { ok: false, reden: 'fout', error: 'Bestelling heeft geen componenten.' }

  const componenten = payload.componenten.filter(c => componentIds.has(c.id) && !c.is_verwijderd)
  if (componenten.length !== componentIds.size) {
    return { ok: false, reden: 'verouderd', error: 'Eén of meer bestelde componenten bestaan niet meer — werk de bestelling bij.' }
  }

  // (b) Verouderd-check: componenten gewijzigd sinds klaarzetten?
  const actueleHash = await hashComponentenSet(componenten)
  if (!bestelling.componenten_hash || actueleHash !== bestelling.componenten_hash) {
    return { ok: false, reden: 'verouderd', error: 'De werkbegroting is gewijzigd sinds deze bestelling is klaargezet — werk de bestelling bij.' }
  }

  // (a) Regel-goedkeuring: elke regel achter de bestelde componenten moet geaccordeerd zijn.
  const status = await berekenWerkbegrotingStatus(bestelling.werkbegroting_id)
  const goedgekeurdPerRegel = new Map(status.regels.map(r => [r.regel_id, r.goedgekeurd]))
  const regelIds = [...new Set(componenten.map(c => c.werkbegroting_regel_id))]
  const geblokkeerd = regelIds.filter(id => goedgekeurdPerRegel.get(id) !== true)
  if (geblokkeerd.length > 0) {
    const regelById = new Map(payload.regels.map(r => [r.id, r]))
    const namen = geblokkeerd.map(id => regelById.get(id)?.omschrijving || 'Onbekende regel')
    return {
      ok: false, reden: 'niet_goedgekeurd',
      error: 'Deze bestelling bevat regels die (nog) niet zijn geaccordeerd.',
      regels: namen,
    }
  }

  const { error } = await db
    .from('werkbegroting_bestellingen')
    .update({ status: 'verzonden', verzonden_op: new Date().toISOString() })
    .eq('id', bestellingId)
  if (error) return { ok: false, reden: 'fout', error: error.message }

  return { ok: true }
}

// ─── Werkbegroting-prognose naar Bouw7 (per bewakingscode) ────────────────────
//
// Schrijft per bewakingscode × kostensoort het veld "Niet/anders begroot"
// (prognosisOtherAmount) via POST /project/update-prognosis-other
// { id: <pslId>, prognosisOtherAmount, prognosisOtherHours }.
// In Bouw7 geldt: prognose = begroot + prognosisOtherAmount. We sturen dus het VERSCHIL
// tussen het werkbegroting-bedrag en het Bouw7-begrote bedrag, per code.
//
// Kostengroep (EVA) === bewakingscode (Bouw7). De koppeling wordt LIVE afgeleid:
// regel.kostengroep wordt op de Bouw7-code gematcht; per (code, kostensoort) bestaat
// precies één projectSecurityLink (PSL) waar we naartoe schrijven.

/** Kostensoorten die vanuit de werkbegroting gevoed worden (= component-types). */
const PROGNOSE_KOSTENSOORTEN = [1, 3, 5] as const

/** Component-type → Bouw7-kostensoort. `materieel` → Materiaal (5) is de afgesproken mapping. */
const TYPE_NAAR_BOUW7: Record<'arbeid' | 'materieel' | 'onderaanneming', { ct: number; label: string }> = {
  arbeid:         { ct: 1, label: 'Arbeid' },
  onderaanneming: { ct: 3, label: 'Onderaanneming' },
  materieel:      { ct: 5, label: 'Materiaal' },
}

/** Werkbegroting-totalen per bewakingscode (client berekent ze uit regels × componenten). */
export type WerkbegrotingCodeTotaal = {
  /** Bewakingscode = regel.kostengroep (kale code). Leeg = regel zonder code. */
  code: string
  arbeid?: { bedrag: number; uren: number }
  materieel?: { bedrag: number }
  onderaanneming?: { bedrag: number }
}
export type WerkbegrotingPrognoseTotalen = WerkbegrotingCodeTotaal[]

const getal = (v: unknown): number => {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
  return 0
}
const rond = (n: number): number => Math.round(n * 100) / 100

/** Gedeelde Bouw7-context (bouw7_id + ingelogde client) voor een dossier. */
async function bouw7Context(dossierId: string): Promise<{ ok: true; bouw7Id: string; client: Bouw7Client } | { ok: false; error: string }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data: dossier } = await db.from('dossiers').select('bouw7_id').eq('id', dossierId).single()
  const bouw7Id: string | null = dossier?.bouw7_id ?? null
  if (!bouw7Id) return { ok: false, error: 'Dit dossier is niet aan een Bouw7-project gekoppeld (geen bouw7_id).' }
  const { data: integratie } = await db.from('integraties').select('config').eq('naam', 'bouw7').maybeSingle()
  const config = integratie?.config as Record<string, string> | undefined
  if (!config?.api_key || !config?.app_name) return { ok: false, error: 'Bouw7 is niet geconfigureerd.' }
  return { ok: true, bouw7Id, client: new Bouw7Client(config.api_key, config.app_name) }
}

/** Eén Bouw7-bewakingscode met, per kostensoort, de PSL-id, het begrote bedrag en de begrote uren. */
export type BewakingscodeRef = {
  code: string
  naam: string | null
  hoofdstuk: string | null
  pslPerCt: Record<number, number>
  begrootPerCt: Record<number, number>
  urenPerCt: Record<number, number>
  /** Meerwerk (additionalWorkAmount) per kostensoort — grondslag naast begroot voor de prognose. */
  meerwerkPerCt: Record<number, number>
  /** Meerwerk-uren (hourInfo.additionalWorkHours) per kostensoort. */
  meerwerkUrenPerCt: Record<number, number>
  /** Huidige "Niet/anders begroot" (prognosisOtherAmount) per kostensoort — nodig voor reset-sync. */
  prognosisOtherPerCt: Record<number, number>
}
export type ResolveBewakingscodesResultaat =
  | { ok: true; bouw7Id: string; codes: BewakingscodeRef[] }
  | { ok: false; error: string }

/**
 * Haalt de bewakingscodes van een Bouw7-project op met, per kostensoort (1/3/5), de PSL-id,
 * het begrote bedrag en de begrote uren. Bron: `/cost-type/{ct}/chapters` (securityCodes);
 * ontbrekende PSL-ids worden aangevuld uit de bestelregels (`/list/contract-order-lines`).
 */
export async function resolveBewakingscodes(dossierId: string): Promise<ResolveBewakingscodesResultaat> {
  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return ctx
  const { client, bouw7Id } = ctx

  const map = new Map<string, BewakingscodeRef>()
  const ensure = (code: string): BewakingscodeRef => {
    let r = map.get(code)
    if (!r) { r = { code, naam: null, hoofdstuk: null, pslPerCt: {}, begrootPerCt: {}, urenPerCt: {}, meerwerkPerCt: {}, meerwerkUrenPerCt: {}, prognosisOtherPerCt: {} }; map.set(code, r) }
    return r
  }

  try {
    const responses = await Promise.all(
      PROGNOSE_KOSTENSOORTEN.map(ct =>
        client.getAthena<Bouw7ControlResponse>(`/project-control/${bouw7Id}/cost-type/${ct}/chapters?include_subprojects=false`).catch(() => null),
      ),
    )
    PROGNOSE_KOSTENSOORTEN.forEach((ct, i) => {
      const resp = responses[i]
      if (!resp) return
      for (const item of resp.items ?? []) {
        const ci = item.chapterInfo
        if (ci?.name === 'uncoded_costs' || ci?.id === 0) continue
        for (const sc of item.securityCodes ?? []) {
          const code = (sc.code ?? '').trim()
          if (!code) continue
          const ref = ensure(code)
          if (!ref.naam) ref.naam = sc.name ?? null
          if (!ref.hoofdstuk) ref.hoofdstuk = ci?.name ?? null
          const psl = sc.pslIds?.[0]
          if (psl != null) ref.pslPerCt[ct] = psl
          ref.begrootPerCt[ct] = getal(sc.budgetAmount)
          ref.urenPerCt[ct] = getal(sc.hourInfo?.budgetHours)
          ref.meerwerkPerCt[ct] = getal(sc.additionalWorkAmount)
          ref.meerwerkUrenPerCt[ct] = getal(sc.hourInfo?.additionalWorkHours)
          ref.prognosisOtherPerCt[ct] = getal((sc as { prognosisOtherAmount?: number | string }).prognosisOtherAmount)
        }
      }
    })

    // Fallback: ontbrekende PSL-ids aanvullen uit de bestelregels.
    const ontbreekt = [...map.values()].some(r => PROGNOSE_KOSTENSOORTEN.some(ct => r.begrootPerCt[ct] != null && r.pslPerCt[ct] == null))
    if (ontbreekt) {
      const orderLines = await client
        .get<{ items?: Bouw7ContractOrderLine[] }>('/list/contract-order-lines', { q: `project.id = ${bouw7Id} LIMIT 1000` })
        .then(r => r.items ?? [])
        .catch(() => [] as Bouw7ContractOrderLine[])
      for (const ol of orderLines) {
        const code = (ol.projectSecurityLink?.code ?? '').trim()
        const ct = ol.projectSecurityLink?.costType ?? ol.costType
        const psl = ol.projectSecurityLink?.id
        if (!code || ct == null || psl == null) continue
        const ref = map.get(code)
        if (ref && ref.pslPerCt[ct] == null) ref.pslPerCt[ct] = psl
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ophalen Bouw7-bewakingscodes mislukt.' }
  }

  return { ok: true, bouw7Id, codes: [...map.values()] }
}

// ─── Ontbrekende (code × kostensoort) in Bouw7 aanmaken ───────────────────────
//
// Bouw7-bewakingscodes + begrotingen staan in één structuur:
//   GET  /project/{id}/project-security-links  → [{ securityObject, securityCodesPerChapters: [...] }]
//   POST /project/{id}/project-security-links  → { securityCodeChaptersPerObjects: [...zelfde array...] }
// De prognose-write (update-prognosis-other) kan alleen naar een bestaande PSL. Ontbreekt de
// (code × kostensoort), dan voegen we 'm hier toe (begroot 0, read-modify-write) — en zo nodig
// maken we de code zelf aan via POST /security-code. Daarna re-resolven we de nieuwe PSL-id.

/** Kostensoort → veldnaam in de project-security-links structuur (begroot-bedrag). */
const CT_STRUCTUUR_VELD: Record<number, string> = {
  1: 'laborCosts',          // Arbeid
  3: 'subcontractorCosts',  // Onderaanneming
  5: 'materialCosts',       // Materiaal
}

type SecBudgetData = {
  securityCode: { id: number; name?: string | null; code?: string | null; chapterName?: string | null }
  [veld: string]: unknown
}
type SecChapter = {
  securityCodeChapter: { id: number; name?: string; code?: string }
  budgetDataPerSecurityCodes: SecBudgetData[]
}
type SecObject = { securityObject: unknown | null; securityCodesPerChapters: SecChapter[] }

/** Maakt een nieuwe bewakingscode aan onder een hoofdstuk; geeft het nieuwe securityCode-id terug. */
async function createSecurityCode(client: Bouw7Client, naam: string, code: string, chapterId: number): Promise<number> {
  const res = await client.post<{ id: number }>('/security-code', { name: naam || code, code, securityCodeChapter: { id: chapterId } })
  return res.id
}

/**
 * Zorgt dat voor elke ontbrekende (code × kostensoort) een PSL bestaat: voegt de code/kostensoort
 * met begroot 0 toe aan de project-security-links structuur (read-modify-write), en maakt de code
 * eerst aan als die nog niet op het project staat. Nieuwe codes gaan onder het gekozen bestaande
 * hoofdstuk (`doelHoofdstukId`, per dossier ingesteld in EVA); ontbreekt dat, dan wordt de code
 * overgeslagen + gemeld.
 */
async function zorgVoorOntbrekendePsls(
  client: Bouw7Client,
  bouw7Id: string,
  ontbrekend: { code: string; naam: string | null; ct: number }[],
  doelHoofdstukId: number | null,
): Promise<{ aangemaakt: number; fouten: string[] }> {
  if (ontbrekend.length === 0) return { aangemaakt: 0, fouten: [] }

  const struct = await client.get<SecObject[]>(`/project/${bouw7Id}/project-security-links`)
  let obj = struct[0]
  if (!obj) { obj = { securityObject: null, securityCodesPerChapters: [] }; struct.push(obj) }

  // Index: code → budgetData-entry die al op het project staat.
  const codeEntry = new Map<string, SecBudgetData>()
  for (const chap of obj.securityCodesPerChapters) {
    for (const bd of chap.budgetDataPerSecurityCodes ?? []) {
      const c = (bd.securityCode?.code ?? '').trim()
      if (c) codeEntry.set(c, bd)
    }
  }

  // Nieuwe codes komen onder het in EVA gekozen bestaande hoofdstuk (doelHoofdstukId, per dossier).
  const doelChapter = (): SecChapter | null =>
    doelHoofdstukId == null
      ? null
      : (obj.securityCodesPerChapters.find(ch => ch.securityCodeChapter?.id === doelHoofdstukId) ?? null)

  // Per code groeperen (we maken een code max één keer aan).
  const perCode = new Map<string, { naam: string | null; cts: number[] }>()
  for (const o of ontbrekend) {
    const g = perCode.get(o.code) ?? { naam: o.naam, cts: [] }
    g.cts.push(o.ct)
    perCode.set(o.code, g)
  }

  const fouten: string[] = []
  let aangemaakt = 0
  for (const [code, { naam, cts }] of perCode) {
    let bd = codeEntry.get(code)
    if (!bd) {
      const chap = doelChapter()
      if (!chap) { fouten.push(`Geen (geldig) doelhoofdstuk gekozen voor nieuwe code "${code}". Kies een hoofdstuk in EVA bij 'Prognose naar Bouw7'.`); continue }
      try {
        const newId = await createSecurityCode(client, naam ?? code, code, chap.securityCodeChapter.id)
        bd = { securityCode: { id: newId, name: naam ?? code, code, chapterName: chap.securityCodeChapter.name } }
        chap.budgetDataPerSecurityCodes = chap.budgetDataPerSecurityCodes ?? []
        chap.budgetDataPerSecurityCodes.push(bd)
        codeEntry.set(code, bd)
      } catch (e) { fouten.push(`Code "${code}" aanmaken mislukt: ${e instanceof Error ? e.message : ''}`); continue }
    }
    // Begroot 0 op de ontbrekende kostensoort(en) → PSL ontstaat.
    for (const ct of cts) {
      const veld = CT_STRUCTUUR_VELD[ct]
      if (!veld) continue
      if (bd[veld] == null) bd[veld] = '0'
      // Arbeid: Bouw7 eist dat bij laborCosts óók laborHours én laborHourlyRate zijn gezet.
      if (ct === 1) {
        if (bd.laborHours == null) bd.laborHours = '0'
        if (bd.laborHourlyRate == null) bd.laborHourlyRate = '0'
      }
      aangemaakt++
    }
  }

  try {
    await client.post(`/project/${bouw7Id}/project-security-links`, { securityCodeChaptersPerObjects: struct })
  } catch (e) {
    return { aangemaakt: 0, fouten: [...fouten, `Structuur opslaan mislukt: ${e instanceof Error ? e.message : ''}`] }
  }
  return { aangemaakt, fouten }
}

/** Eén bestaand hoofdstuk (securityCodeChapter) op een project. */
export type Hoofdstuk = { id: number; naam: string }

/** Haalt de bestaande hoofdstukken van een Bouw7-project op (voor de doelhoofdstuk-keuze in EVA). */
export async function getProjectHoofdstukken(dossierId: string): Promise<{ ok: true; hoofdstukken: Hoofdstuk[] } | { ok: false; error: string }> {
  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return ctx
  try {
    const struct = await ctx.client.get<SecObject[]>(`/project/${ctx.bouw7Id}/project-security-links`)
    const hoofdstukken = (struct[0]?.securityCodesPerChapters ?? [])
      .map(c => ({ id: c.securityCodeChapter?.id as number, naam: c.securityCodeChapter?.name ?? '' }))
      .filter(h => h.id != null)
    return { ok: true, hoofdstukken }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Hoofdstukken ophalen mislukt.' }
  }
}

// ─── Meerwerk: eigen bewakingscode aanmaken + prognose (hergebruik bewezen pad) ─

export type MeerwerkBewakingscodeResultaat =
  | { ok: true; chapterId: number | null; pslId: number | null; prognoseGezet: boolean; waarschuwing?: string }
  | { ok: false; error: string }

/**
 * Maakt voor een meerwerkregel een eigen bewakingscode aan in Bouw7 (onder een meerwerk-/gekozen
 * hoofdstuk) en zet — best effort — de prognose ("Niet/anders begroot") op de meegegeven kostensoort.
 * Hergebruikt exact het bewezen werkbegroting→prognose-pad (`createSecurityCode` +
 * `project-security-links` + `update-prognosis-other`). Faalt netjes: de bewakingscode wordt
 * aangemaakt ook als de prognose-write wordt geweigerd (waarschuwing teruggegeven).
 *
 * NB: welk Bouw7-veld het meerwerk-*bedrag* idealiter voedt is nog te bevestigen op een testproject
 * (zie WRITE-ENDPOINTS.md); daarom is de prognose-write best-effort en blokkeert hij de EVA-flow niet.
 */
export async function maakMeerwerkBewakingscodeBouw7(
  dossierId: string,
  opts: { code: string; naam: string; bedrag?: number | null; kostensoort?: number; hoofdstukId?: number | null },
): Promise<MeerwerkBewakingscodeResultaat> {
  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return ctx
  const { client, bouw7Id } = ctx
  const code = opts.code.trim()
  if (!code) return { ok: false, error: 'Lege bewakingscode.' }
  const ct = opts.kostensoort ?? 5 // Materiaal als neutrale default-kostensoort.

  // 1. Doelhoofdstuk: expliciet meegegeven → anders een hoofdstuk dat op 'meerwerk'/'MW' lijkt → anders het eerste.
  let chapterId = opts.hoofdstukId ?? null
  let chapterFout: string | undefined
  if (chapterId == null) {
    const hk = await getProjectHoofdstukken(dossierId)
    if (hk.ok) {
      const mw = hk.hoofdstukken.find(h => /meerwerk|^mw\b|^mw$/i.test(h.naam.trim()))
      chapterId = (mw ?? hk.hoofdstukken[0])?.id ?? null
    } else chapterFout = hk.error
  }
  if (chapterId == null) return { ok: false, error: chapterFout ?? 'Geen hoofdstuk gevonden om de bewakingscode onder te plaatsen.' }

  // 2. Code + PSL aanmaken (begroot 0) — read-modify-write op de structuur.
  let maakRes: { aangemaakt: number; fouten: string[] }
  try {
    maakRes = await zorgVoorOntbrekendePsls(client, bouw7Id, [{ code, naam: opts.naam, ct }], chapterId)
  } catch (e) {
    return { ok: false, error: `Bewakingscode aanmaken mislukt: ${e instanceof Error ? e.message : ''}` }
  }
  if (maakRes.aangemaakt === 0 && maakRes.fouten.length > 0) {
    return { ok: false, error: maakRes.fouten.join(' ') }
  }

  // 3. PSL-id teruglezen voor de prognose-write.
  const resolved = await resolveBewakingscodes(dossierId)
  const ref = resolved.ok ? resolved.codes.find(c => c.code === code) : undefined
  const pslId = ref?.pslPerCt[ct] ?? null

  // 4. Prognose ("Niet/anders begroot") — best effort.
  let prognoseGezet = false
  let waarschuwing: string | undefined = maakRes.fouten.length > 0 ? maakRes.fouten.join(' ') : undefined
  const bedrag = opts.bedrag != null ? rond(Number(opts.bedrag)) : null
  if (bedrag != null && bedrag !== 0 && pslId != null) {
    try {
      const begroot = ref?.begrootPerCt[ct] ?? 0
      const meerwerk = ref?.meerwerkPerCt[ct] ?? 0
      await client.post('/project/update-prognosis-other', { id: pslId, prognosisOtherAmount: String(rond(bedrag - begroot - meerwerk)) })
      prognoseGezet = true
    } catch (e) {
      const m = e instanceof Error ? e.message : ''
      waarschuwing = `Bewakingscode aangemaakt, maar prognose schrijven mislukt: ${m}`
    }
  }

  return { ok: true, chapterId, pslId, prognoseGezet, waarschuwing }
}

export type PrognoseRegel = {
  /** Bewakingscode (= kostengroep). */
  code: string
  codeNaam: string | null
  type: 'arbeid' | 'materieel' | 'onderaanneming'
  label: string
  ct: number
  begroot: number
  /** Meerwerk (additionalWorkAmount) op deze code × kostensoort — grondslag naast begroot. */
  meerwerk: number
  werkbegroting: number
  /** Te schrijven prognosisOtherAmount = werkbegroting − begroot − meerwerk. */
  verschil: number
  /** Voor arbeid: bijbehorende uren-correctie. */
  verschilUren?: number
  pslId: number | null
  schrijfbaar: boolean
  /** 'schrijf' = bestaande PSL bijwerken · 'aanmaken' = PSL (en evt. code) eerst aanmaken · 'skip'. */
  actie: 'schrijf' | 'aanmaken' | 'skip'
  /** True als ook de bewakingscode zelf nog niet op het project staat. */
  nieuweCode?: boolean
  reden?: string
}

export type PrognoseResultaat =
  | { ok: true; bouw7Id: string; regels: PrognoseRegel[] }
  | { ok: false; error: string }

/** Gedeelde berekening: match werkbegroting-codes op Bouw7-bewakingscodes en bepaal de verschillen. */
async function berekenPrognoseRegels(dossierId: string, totalen: WerkbegrotingPrognoseTotalen): Promise<PrognoseResultaat> {
  const resolved = await resolveBewakingscodes(dossierId)
  if (!resolved.ok) return resolved
  const codeMap = new Map(resolved.codes.map(c => [c.code, c]))

  const regels: PrognoseRegel[] = []
  for (const codeTotaal of totalen) {
    const code = (codeTotaal.code ?? '').trim()
    const ref = code ? codeMap.get(code) : undefined

    ;(['arbeid', 'onderaanneming', 'materieel'] as const).forEach(type => {
      const invoer = codeTotaal[type]
      if (!invoer) return
      const map = TYPE_NAAR_BOUW7[type]
      const ct = map.ct
      const begroot = ref?.begrootPerCt[ct] ?? 0
      const meerwerk = ref?.meerwerkPerCt[ct] ?? 0
      const werkbegroting = invoer.bedrag
      const verschil = rond(werkbegroting - begroot - meerwerk)
      const pslId = ref?.pslPerCt[ct] ?? null

      let schrijfbaar = true
      let actie: PrognoseRegel['actie'] = 'schrijf'
      let nieuweCode = false
      let reden: string | undefined
      if (!code) {
        schrijfbaar = false; actie = 'skip'; reden = 'Regel zonder bewakingscode (kostengroep leeg).'
      } else if (werkbegroting === 0) {
        // Geen werkbegroting-bedrag → niets te schrijven/aanmaken. (Telt ook niet als "in werkbegroting"
        // voor de reset-sync, zodat een 0-regel de bijbehorende code juist naar prognose 0 brengt.)
        schrijfbaar = false; actie = 'skip'; reden = 'Geen werkbegroting-bedrag.'
      } else if (pslId == null) {
        // PSL bestaat nog niet → wordt aangemaakt (begroot 0). Bestaat de code ook niet → ook de code aanmaken.
        actie = 'aanmaken'; nieuweCode = !ref
        reden = ref ? `Kostensoort ${map.label} wordt aangemaakt op deze code.` : `Nieuwe code + kostensoort ${map.label} wordt aangemaakt.`
      }

      let verschilUren: number | undefined
      if (type === 'arbeid') {
        const uren = (invoer as { uren: number }).uren
        const tarief = uren > 0 ? werkbegroting / uren : 0
        verschilUren = tarief > 0 ? rond(verschil / tarief) : 0
      }

      regels.push({ code, codeNaam: ref?.naam ?? null, type, label: map.label, ct, begroot, meerwerk, werkbegroting, verschil, verschilUren, pslId, schrijfbaar, actie, nieuweCode, reden })
    })
  }

  return { ok: true, bouw7Id: resolved.bouw7Id, regels }
}

/** Preview: bereken (read-only) wat er naar Bouw7 geschreven zou worden. Schrijft niets. */
export async function previewWerkbegrotingPrognoseBouw7(dossierId: string, totalen: WerkbegrotingPrognoseTotalen): Promise<PrognoseResultaat> {
  return berekenPrognoseRegels(dossierId, totalen)
}

export type StuurPrognoseResultaat =
  | { ok: true; geschreven: number; aangemaakt: number; gereset: number; overgeslagen: number; fouten: string[]; regels: PrognoseRegel[] }
  | { ok: false; error: string }

/**
 * Schrijft de nieuwe prognosebedragen naar Bouw7 ("Niet/anders begroot" per bewakingscode ×
 * kostensoort). Ontbrekende (code × kostensoort) — en zo nodig de code zelf — worden eerst
 * aangemaakt (begroot 0), daarna wordt de prognose weggeschreven.
 */
export async function stuurWerkbegrotingPrognoseBouw7(dossierId: string, totalen: WerkbegrotingPrognoseTotalen, doelHoofdstukId: number | null = null, payload?: WerkbegrotingPayload): Promise<StuurPrognoseResultaat> {
  // Gate: prognose is een aggregaat over de hele werkbegroting en mag alleen bij
  // een volledig geaccordeerde werkbegroting (geen niet-geaccordeerde wijzigingen).
  if (payload) {
    const sync = await syncWerkbegrotingNaarSupabase(payload)
    if (!sync.gelukt) return { ok: false, error: `Synchroniseren mislukt: ${sync.fout}` }
    const { berekenWerkbegrotingStatus } = await import('@/lib/goedkeuring/werkbegroting-status')
    const status = await berekenWerkbegrotingStatus(payload.wb.id)
    if (!status.volledigGoedgekeurd) {
      return { ok: false, error: 'De werkbegroting bevat niet-geaccordeerde wijzigingen. Laat de werkbegroting eerst (opnieuw) accorderen voordat je de prognose naar Bouw7 stuurt.' }
    }
  }

  const berekend = await berekenPrognoseRegels(dossierId, totalen)
  if (!berekend.ok) return { ok: false, error: berekend.error }

  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { client, bouw7Id } = ctx
  const fouten: string[] = []
  let aangemaakt = 0

  // 1) Ontbrekende (code × kostensoort) aanmaken (begroot 0), incl. nieuwe codes onder het gekozen hoofdstuk.
  const teMaken = berekend.regels.filter(r => r.actie === 'aanmaken').map(r => ({ code: r.code, naam: r.codeNaam, ct: r.ct }))
  if (teMaken.length > 0) {
    try {
      const res = await zorgVoorOntbrekendePsls(client, bouw7Id, teMaken, doelHoofdstukId)
      aangemaakt = res.aangemaakt
      fouten.push(...res.fouten)
    } catch (e) {
      return { ok: false, error: `Aanmaken bewakingscodes mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}` }
    }
  }

  // 2) Eén keer resolven na het aanmaken → nieuwe PSL-id's invullen + huidige "Niet/anders begroot"
  //    per code ophalen (voor de reset-sync hieronder).
  const naResolve = await resolveBewakingscodes(dossierId)
  const codeMap = naResolve.ok ? new Map(naResolve.codes.map(c => [c.code, c])) : new Map<string, BewakingscodeRef>()
  for (const r of berekend.regels) {
    if (r.actie === 'aanmaken' && r.pslId == null) {
      r.pslId = codeMap.get(r.code)?.pslPerCt[r.ct] ?? null
      if (r.pslId == null) fouten.push(`PSL voor ${r.code} / ${r.label} niet gevonden na aanmaken.`)
    }
  }

  // 3) Prognose ("Niet/anders begroot") wegschrijven voor alle regels met een PSL.
  let geschreven = 0
  try {
    for (const r of berekend.regels) {
      if (r.actie === 'skip' || r.pslId == null) continue
      const body: Record<string, unknown> = { id: r.pslId, prognosisOtherAmount: String(r.verschil) }
      if (r.type === 'arbeid') body.prognosisOtherHours = String(r.verschilUren ?? 0)
      await client.post('/project/update-prognosis-other', body)
      geschreven++
    }

    // 4) Reset-sync: elke bestaande PSL (Arbeid/OA/Materiaal) die NIET in de werkbegroting staat →
    //    prognose moet 0 worden (werkbegroting is exact leidend). Omdat prognose = begroot +
    //    meerwerk + "Niet/anders begroot", zetten we Niet/anders begroot op −(begroot + meerwerk)
    //    (en −(begrote uren + meerwerk-uren) voor arbeid). Onvoorwaardelijk, want het chapters-
    //    endpoint geeft de huidige waarde niet terug.
    const inWerkbegroting = new Set(berekend.regels.filter(r => r.actie !== 'skip').map(r => `${r.code}|${r.ct}`))
    let gereset = 0
    for (const c of codeMap.values()) {
      for (const ct of PROGNOSE_KOSTENSOORTEN) {
        const psl = c.pslPerCt[ct]
        if (psl == null) continue
        if (inWerkbegroting.has(`${c.code}|${ct}`)) continue
        const body: Record<string, unknown> = { id: psl, prognosisOtherAmount: String(rond(-((c.begrootPerCt[ct] ?? 0) + (c.meerwerkPerCt[ct] ?? 0)))) }
        if (ct === 1) body.prognosisOtherHours = String(rond(-((c.urenPerCt[ct] ?? 0) + (c.meerwerkUrenPerCt[ct] ?? 0))))
        await client.post('/project/update-prognosis-other', body)
        gereset++
      }
    }

    const overgeslagen = berekend.regels.filter(r => r.actie === 'skip').length
    return { ok: true, geschreven, aangemaakt, gereset, overgeslagen, fouten, regels: berekend.regels }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return { ok: false, error: /\b40[13]\b/.test(msg) ? `Geweigerd (${msg}) — schrijfrechten of ids niet toegestaan.` : msg }
  }
}

// ─── Import bewakingscodes + bestelregels uit Bouw7 (Scenario B) ──────────────

/** Eén bestelregel uit Bouw7, klaar om als werkbegroting-component te seeden. */
export type BestelregelImport = {
  /** Stabiel Bouw7 contract-order-line id — voor dedup bij herhaald overhalen. */
  bouw7LineId: number
  code: string
  omschrijving: string
  /** Werkelijk aantal = quantity × quantityFactor. */
  aantal: number
  eenheid: string
  /** Prijs per eenheid (unitPrice). */
  prijs: number
  type: 'arbeid' | 'onderaanneming' | 'materieel'
}
export type ImportBewakingscodesResultaat =
  | { ok: true; codes: { code: string; naam: string | null }[]; bestelregels: BestelregelImport[] }
  | { ok: false; error: string }

/**
 * Read-only: haalt voor een aan Bouw7 gekoppeld dossier de bewakingscodes (code + naam) én de
 * bestelregels op, zodat de client de werkbegroting kan seeden (Scenario B — project uit Bouw7).
 */
export async function getBouw7BewakingscodesImport(dossierId: string): Promise<ImportBewakingscodesResultaat> {
  const resolved = await resolveBewakingscodes(dossierId)
  if (!resolved.ok) return resolved

  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return ctx

  let bestelregels: BestelregelImport[] = []
  try {
    const lines = await ctx.client
      .get<{ items?: Bouw7ContractOrderLine[] }>('/list/contract-order-lines', { q: `project.id = ${ctx.bouw7Id} SORT(description, ASC) LIMIT 1000` })
      .then(r => r.items ?? [])
    bestelregels = lines
      .map((ol): BestelregelImport => {
        const ct = ol.projectSecurityLink?.costType ?? ol.costType
        const type = ct === 1 ? 'arbeid' : ct === 3 ? 'onderaanneming' : 'materieel'
        const factor = getal(ol.quantityFactor)
        const aantal = getal(ol.quantity) * (factor || 1)
        return {
          bouw7LineId: ol.id,
          code: (ol.projectSecurityLink?.code ?? '').trim(),
          omschrijving: ol.description ?? '',
          aantal,
          eenheid: ol.unit ?? 'st',
          prijs: getal(ol.unitPrice),
          type,
        }
      })
      .filter(b => b.code)
  } catch {
    // Bestelregels zijn optioneel; de codes alleen importeren mag ook.
  }

  return { ok: true, codes: resolved.codes.map(c => ({ code: c.code, naam: c.naam })), bestelregels }
}
