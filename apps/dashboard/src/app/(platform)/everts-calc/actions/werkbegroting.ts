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

/**
 * Coerce een waarde naar een geldig UUID of null. Werkbegroting-regels/componenten
 * leven localStorage-first en krijgen bij aanmaken (nieuwe regel, Bouw7-import) soms
 * een lege string ("") voor uuid-velden als groep_id of source_*_id. Postgres weigert
 * die met `invalid input syntax for type uuid: ""`; null is de juiste representatie.
 */
const uuidOfNull = (v: unknown): string | null =>
  typeof v === 'string' && UUID_RE.test(v) ? v : null

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
            source_calculatieregel_id: uuidOfNull(r.source_calculatieregel_id),
            groep_id: uuidOfNull(r.groep_id), omschrijving: r.omschrijving,
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
            source_component_id: uuidOfNull(c.source_component_id), type: c.type,
            norm_hoeveelheid: c.norm_hoeveelheid, eenheid: c.eenheid ?? null,
            tarief: c.tarief, opslag_pct: c.opslag_pct ?? null,
            omschrijving: c.omschrijving ?? null, relatie_id: uuidOfNull(c.relatie_id),
            leverancier_naam: c.leverancier_naam ?? null,
            aannemersnaam: c.aannemersnaam ?? null, offertenummer: c.offertenummer ?? null,
            artikelnummer: c.artikelnummer ?? null, uurtype: c.uurtype ?? null,
            bouw7_line_id: c.bouw7_line_id ?? null,
            is_winkel: c.is_winkel ?? false,
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
            werkbegroting_regel_id: uuidOfNull(w.werkbegroting_regel_id),
            component_id: uuidOfNull(w.component_id), veld: w.veld,
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
        // LET OP: bouw7_contract_id / bouw7_nummer / bouw7_sync_* worden hier bewust NIET
        // meegeschreven. Die zijn server-side eigendom van de contract-push; zou de client ze
        // vanuit een oude localStorage-cache terugsturen, dan wist een lege waarde de koppeling
        // en maakt de volgende push een duplicaat-contract in Bouw7 (zelfde les als bouw7_line_id).
        .upsert({
          id: b.id, werkbegroting_id: b.werkbegroting_id, omschrijving: b.omschrijving,
          relatie_id: uuidOfNull(b.relatie_id), status: b.status, bijgewerkt_op: nu,
          soort: b.soort ?? null,
          levering_datum: b.levering_datum ?? null,
          levering_tekst: b.levering_tekst ?? null,
          betaalafspraak: b.betaalafspraak ?? null,
          interne_notitie: b.interne_notitie ?? null,
        }, { onConflict: 'id' })
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

// ─── Laden: gedeelde werkbegroting uit Supabase (bron van waarheid) ───────────
//
// De werkbegroting is Supabase-first: elke gebruiker/elk apparaat laadt dezelfde
// werkbegroting van de server. De client hydrateert hiermee zijn localStorage-cache
// (waar het grid + de calculaties op draaien) vóór het rendert. Alle rijen worden
// meegegeven — óók soft-deleted — zodat dedup en de latere sync consistent blijven.

export interface WerkbegrotingSnapshot {
  wb: Werkbegroting
  regels: WerkbegrotingRegel[]
  componenten: WerkbegrotingComponent[]
  wijzigingen: WerkbegrotingWijziging[]
  bestellingen: WerkbegrotingBestelling[]
}

/**
 * Haalt de (meest recente) werkbegroting van een dossier volledig uit Supabase op,
 * inclusief regels, componenten, wijzigingen en bestellingen. Retourneert null als er
 * nog geen gedeelde werkbegroting bestaat (dan valt de client terug op lokaal aanmaken
 * uit de calculatie).
 */
export async function laadWerkbegrotingSnapshot(dossierId: string): Promise<WerkbegrotingSnapshot | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  const { data: wbRow } = await db
    .from('werkbegrotingen')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('bijgewerkt_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!wbRow) return null

  const [{ data: regelRows }, { data: bestellingRows }] = await Promise.all([
    db.from('werkbegroting_regels').select('*').eq('werkbegroting_id', wbRow.id),
    db.from('werkbegroting_bestellingen').select('*').eq('werkbegroting_id', wbRow.id),
  ])
  const regels = (regelRows ?? []) as Record<string, unknown>[]
  const regelIds = regels.map(r => r.id as string)

  const [{ data: compRows }, { data: wijzRows }, { data: junctionRows }] = await Promise.all([
    regelIds.length > 0
      ? db.from('werkbegroting_componenten').select('*').in('werkbegroting_regel_id', regelIds)
      : Promise.resolve({ data: [] }),
    db.from('werkbegroting_wijzigingen').select('*').eq('werkbegroting_id', wbRow.id),
    (bestellingRows ?? []).length > 0
      ? db.from('werkbegroting_bestelling_regels').select('*').in('bestelling_id', (bestellingRows ?? []).map((b: { id: string }) => b.id))
      : Promise.resolve({ data: [] }),
  ])

  const compIdsPerBestelling = new Map<string, string[]>()
  for (const j of (junctionRows ?? []) as { bestelling_id: string; component_id: string }[]) {
    const arr = compIdsPerBestelling.get(j.bestelling_id) ?? []
    arr.push(j.component_id)
    compIdsPerBestelling.set(j.bestelling_id, arr)
  }

  const wb: Werkbegroting = {
    id: wbRow.id,
    project_id: wbRow.project_id ?? `wb-direct-${wbRow.id}`,
    scenario_id: wbRow.scenario_id,
    naam: wbRow.naam ?? 'Werkbegroting',
    status: (wbRow.status ?? 'concept') as Werkbegroting['status'],
    aangemaakt_op: wbRow.aangemaakt_op,
    bijgewerkt_op: wbRow.bijgewerkt_op,
  }

  return {
    wb,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    regels: regels.map((r: any): WerkbegrotingRegel => ({
      id: r.id, werkbegroting_id: r.werkbegroting_id,
      source_calculatieregel_id: r.source_calculatieregel_id ?? null,
      groep_id: r.groep_id ?? '', omschrijving: r.omschrijving ?? '',
      hoeveelheid: Number(r.hoeveelheid ?? 0), eenheid: r.eenheid ?? 'st',
      kostengroep: r.kostengroep ?? undefined, volgorde: r.volgorde ?? 0,
      opslag_pct: r.opslag_pct ?? undefined, btw_pct: r.btw_pct ?? undefined,
      opmerking: r.opmerking ?? undefined, is_stelpost: r.is_stelpost ?? false,
      is_verwijderd: r.is_verwijderd ?? false,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    componenten: ((compRows ?? []) as any[]).map((c: any): WerkbegrotingComponent => ({
      id: c.id, werkbegroting_regel_id: c.werkbegroting_regel_id,
      source_component_id: c.source_component_id ?? null, type: c.type,
      norm_hoeveelheid: Number(c.norm_hoeveelheid ?? 0), eenheid: c.eenheid ?? undefined,
      tarief: Number(c.tarief ?? 0), opslag_pct: c.opslag_pct ?? undefined,
      omschrijving: c.omschrijving ?? undefined, relatie_id: c.relatie_id ?? undefined,
      leverancier_naam: c.leverancier_naam ?? undefined, aannemersnaam: c.aannemersnaam ?? undefined,
      offertenummer: c.offertenummer ?? undefined, artikelnummer: c.artikelnummer ?? undefined,
      uurtype: c.uurtype ?? undefined,
      bouw7_line_id: c.bouw7_line_id ?? undefined,
      is_winkel: c.is_winkel ?? false,
      is_verwijderd: c.is_verwijderd ?? false,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    wijzigingen: ((wijzRows ?? []) as any[]).map((w: any): WerkbegrotingWijziging => ({
      id: w.id, werkbegroting_id: w.werkbegroting_id,
      werkbegroting_regel_id: w.werkbegroting_regel_id ?? null, component_id: w.component_id ?? null,
      veld: w.veld, oude_waarde: w.oude_waarde ?? null, nieuwe_waarde: w.nieuwe_waarde ?? null,
      user_id: w.user_id ?? null, aangemaakt_op: w.aangemaakt_op,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bestellingen: ((bestellingRows ?? []) as any[]).map((b: any): WerkbegrotingBestelling => ({
      id: b.id, werkbegroting_id: b.werkbegroting_id, omschrijving: b.omschrijving ?? '',
      relatie_id: b.relatie_id ?? undefined, status: (b.status ?? 'concept') as WerkbegrotingBestelling['status'],
      component_ids: compIdsPerBestelling.get(b.id) ?? [],
      soort: b.soort ?? undefined,
      bouw7_contract_id: b.bouw7_contract_id ?? null,
      bouw7_nummer: b.bouw7_nummer ?? null,
      bouw7_leverbon_id: b.bouw7_leverbon_id ?? null,
      bouw7_bonnummer: b.bouw7_bonnummer ?? null,
      bouw7_sync_status: b.bouw7_sync_status ?? null,
      bouw7_sync_fout: b.bouw7_sync_fout ?? null,
      levering_datum: b.levering_datum ?? null,
      levering_tekst: b.levering_tekst ?? null,
      betaalafspraak: b.betaalafspraak ?? null,
      interne_notitie: b.interne_notitie ?? null,
    })),
  }
}

// ─── Prognose-doelhoofdstuk per dossier (gedeeld) ─────────────────────────────
//
// Welk Bouw7-hoofdstuk de werkbegroting-prognose naartoe schrijft, is een dossier-
// scoped keuze die door alle gebruikers/apparaten gedeeld hoort te worden (stond
// eerder in localStorage → per apparaat verschillend).

export async function laadPrognoseDoelHoofdstuk(dossierId: string): Promise<number | null> {
  if (!dossierId) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data } = await db
    .from('wb_prognose_instellingen')
    .select('doel_hoofdstuk_id')
    .eq('dossier_id', dossierId)
    .maybeSingle()
  const id = data?.doel_hoofdstuk_id
  return id == null ? null : Number(id)
}

export async function bewaarPrognoseDoelHoofdstuk(dossierId: string, hoofdstukId: number | null): Promise<void> {
  if (!dossierId) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  await db
    .from('wb_prognose_instellingen')
    .upsert(
      { dossier_id: dossierId, doel_hoofdstuk_id: hoofdstukId, bijgewerkt_op: new Date().toISOString() },
      { onConflict: 'dossier_id' }
    )
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

export type AccordeerResultaat =
  | { ok: true; bouw7?: BestelEnPrognoseResultaat }
  | { ok: false; error: string }

/**
 * Accordeert een openstaande goedkeuringsaanvraag: synct de payload, legt per
 * actieve regel het snapshot vast, zet de aanvraag op 'goedgekeurd' en de
 * werkbegroting op 'geaccordeerd'. Autorisatie (controller/Directie/gedelegeerde)
 * wordt in keurGoed server-side afgedwongen. Accordeert een controller of de directie,
 * dan worden zowel de bestelregels ("verwachte kosten") als de prognose ("niet/anders
 * begroot") direct (best effort) naar Bouw7 gestuurd.
 */
export async function accordeerWerkbegroting(
  goedkeuringId: string,
  payload: WerkbegrotingPayload,
  opmerking?: string,
  doelHoofdstukId?: number | null,
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

  // 6. Auto naar Bouw7 — bestelregels ("verwachte kosten") én prognose ("niet/anders
  //    begroot") in één handeling, maar alleen als de accorderende gebruiker controller of
  //    directie is (een gedelegeerde mag wél accorderen, maar niet naar Bouw7 schrijven).
  //    Best effort: het accorderen zelf blijft geslaagd, ook als de Bouw7-push (deels) faalt.
  if (payload.dossierId && (ctx.isController || ctx.isDirectie)) {
    try {
      // Doelhoofdstuk voor evt. nieuwe codes: meegegeven door de client → anders 'WB' → anders het eerste.
      let hoofdstuk = doelHoofdstukId ?? null
      if (hoofdstuk == null) {
        const hs = await getProjectHoofdstukken(payload.dossierId)
        if (hs.ok) hoofdstuk = (hs.hoofdstukken.find(h => h.naam.trim().toUpperCase() === 'WB') ?? hs.hoofdstukken[0])?.id ?? null
      }
      const bouw7 = await stuurBeideNaarBouw7Intern(payload.dossierId, payload, hoofdstuk)
      return { ok: true, bouw7 }
    } catch (e) {
      return { ok: true, bouw7: { ok: false, melding: `Bouw7-push mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`, fouten: [], bestelregels: null, prognose: null } }
    }
  }

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
  const { controleerBestellingGates } = await import('@/lib/everts-calc/bestelling-gates')

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

  const gate = await controleerBestellingGates({
    bestellingId,
    werkbegrotingId: bestelling.werkbegroting_id,
    componentenHash: bestelling.componenten_hash ?? null,
    componentIds: new Set<string>(((junction ?? []) as { component_id: string }[]).map(j => j.component_id)),
    componenten: payload.componenten,
    regels: payload.regels,
  })
  if (!gate.ok) return gate

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

/**
 * Component-type → Bouw7-kostensoort. `materieel` → Materiaal (5) is de afgesproken mapping.
 *
 * LET OP — twee verschillende kostentype-enums:
 *  - `ct`     = kostensoort van de **bewakingscode/PSL** (1 Arbeid · 3 Onderaanneming · 5 Materiaal).
 *               Dit is de nummering van `/project-control/{id}/cost-type/{ct}/chapters`.
 *  - `lineCt` = kostentype van de **bestelregel** zelf: een eigen, nul-gebaseerde enum die de
 *               volgorde van de Bouw7-dropdown volgt (0 Materiaal · 1 Onderaanneming · 2 Arbeid ·
 *               3 Materieel · 4 Overig).
 * Bouw7 valideert bij `POST /contract-order-line` dat `costType` (lineCt) past bij de kostensoort
 * van de meegegeven PSL. Sturen we `costType` niet mee, dan valt Bouw7 terug op 0 (Materiaal) en
 * weigert het een arbeid- of OA-PSL met een 400 "does not have cost type material".
 * De mapping is afgeleid uit 625 bestaande bestelregels (100% consistent), komt exact overeen met
 * de kostentype-dropdown in de Bouw7-UI, en is met schrijftests bevestigd. Zie WRITE-ENDPOINTS.md §2b.
 */
const TYPE_NAAR_BOUW7: Record<'arbeid' | 'materieel' | 'onderaanneming', { ct: number; lineCt: number; label: string }> = {
  arbeid:         { ct: 1, lineCt: 2, label: 'Arbeid' },
  onderaanneming: { ct: 3, lineCt: 1, label: 'Onderaanneming' },
  materieel:      { ct: 5, lineCt: 0, label: 'Materiaal' },
}

/** Bestelregel-kostentype (`ContractOrderLine.costType`) → kostensoort van de PSL. */
const LINE_CT_NAAR_PSL_CT: Record<number, number> = { 0: 5, 1: 3, 2: 1, 3: 4, 4: 6 }

/** Werkbegroting-totalen per bewakingscode (client berekent ze uit regels × componenten). */
export type WerkbegrotingCodeTotaal = {
  /** Kale bewakingscode = regel.kostengroep zonder "— omschrijving". Leeg = regel zonder code. */
  code: string
  /** Omschrijving-deel van de kostengroep — onderscheidt gelijk-genummerde codes. */
  naam?: string | null
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

// ── Bewakingscode-identiteit (code + omschrijving) ──────────────────────────────
// Bouw7 kan meerdere bewakingscodes met hetzelfde nummer hebben (andere omschrijving).
// De koppeling met een EVA-kostengroep gebeurt daarom op code + omschrijving, niet op
// code alleen. De kostengroep-string draagt beide: "CODE — Omschrijving" (of enkel "CODE").

/** Kale bewakingscode uit een kostengroep-string ("CODE — Naam" → "CODE"). */
const kaleCode = (kg?: string | null): string => (kg ?? '').split(/\s[—-]\s/)[0].trim()
/** Omschrijving-deel uit een kostengroep-string ("CODE — Naam" → "Naam"), of null. */
const kgNaamDeel = (kg?: string | null): string | null => {
  const d = (kg ?? '').split(/\s[—-]\s/)
  return d.length > 1 ? (d.slice(1).join(' — ').trim() || null) : null
}
/** Identiteit = code + omschrijving; onderscheidt gelijk-genummerde bewakingscodes. */
const codeIdentity = (code: string, naam?: string | null): string => `${code.trim()}${(naam ?? '').trim()}`
/** Kostengroep-waarde/label: "CODE — Naam" (met omschrijving) of "CODE". */
const kostengroepLabel = (code: string, naam?: string | null): string => {
  const n = (naam ?? '').trim()
  return n ? `${code} — ${n}` : code
}

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
  /** Primaire PSL-id per kostensoort (= eerste van pslsPerCt) — voor de prognose-write. */
  pslPerCt: Record<number, number>
  /**
   * Álle PSL-ids per kostensoort. In Bouw7 kunnen meerdere bewakingscodes dezelfde code
   * (nummer) hebben — verspreid over hoofdstukken. Die worden hier onder één code-groep
   * verzameld i.p.v. weggevallen: hun begrote bedragen worden gesommeerd en al hun PSL-ids
   * bewaard, zodat bij de prognose geen enkele wordt gedropt.
   */
  pslsPerCt: Record<number, number[]>
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

  // Gekeyd op identiteit (code + omschrijving): gelijk-genummerde bewakingscodes met een
  // andere omschrijving blijven zo apart en vallen niet tegen elkaar weg.
  const map = new Map<string, BewakingscodeRef>()
  const ensure = (code: string, naam: string | null): BewakingscodeRef => {
    const key = codeIdentity(code, naam)
    let r = map.get(key)
    if (!r) { r = { code, naam: naam?.trim() || null, hoofdstuk: null, pslPerCt: {}, pslsPerCt: {}, begrootPerCt: {}, urenPerCt: {}, meerwerkPerCt: {}, meerwerkUrenPerCt: {}, prognosisOtherPerCt: {} }; map.set(key, r) }
    return r
  }
  /** PSL registreren voor een code×kostensoort: primair (eerste) + volledige lijst, gededupliceerd. */
  const registreerPsl = (ref: BewakingscodeRef, ct: number, psl: number): void => {
    const lijst = ref.pslsPerCt[ct] ?? (ref.pslsPerCt[ct] = [])
    if (!lijst.includes(psl)) lijst.push(psl)
    if (ref.pslPerCt[ct] == null) ref.pslPerCt[ct] = psl
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
          const ref = ensure(code, sc.name ?? null)
          if (!ref.hoofdstuk) ref.hoofdstuk = ci?.name ?? null
          // Dubbele codes (zelfde nummer, ander hoofdstuk) NIET overschrijven maar optellen,
          // en álle PSL-ids bewaren zodat er geen bewakingscode wegvalt.
          for (const psl of sc.pslIds ?? []) registreerPsl(ref, ct, psl)
          ref.begrootPerCt[ct] = (ref.begrootPerCt[ct] ?? 0) + getal(sc.budgetAmount)
          ref.urenPerCt[ct] = (ref.urenPerCt[ct] ?? 0) + getal(sc.hourInfo?.budgetHours)
          ref.meerwerkPerCt[ct] = (ref.meerwerkPerCt[ct] ?? 0) + getal(sc.additionalWorkAmount)
          ref.meerwerkUrenPerCt[ct] = (ref.meerwerkUrenPerCt[ct] ?? 0) + getal(sc.hourInfo?.additionalWorkHours)
          ref.prognosisOtherPerCt[ct] = (ref.prognosisOtherPerCt[ct] ?? 0) + getal((sc as { prognosisOtherAmount?: number | string }).prognosisOtherAmount)
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
      // Map is op identiteit gekeyd; hier matchen we op code (bestelregels dragen geen
      // omschrijving) en vullen de PSL bij op de eerste ref van die code die er nog geen heeft.
      const refsByCode = new Map<string, BewakingscodeRef[]>()
      for (const r of map.values()) {
        const arr = refsByCode.get(r.code) ?? []
        arr.push(r); refsByCode.set(r.code, arr)
      }
      for (const ol of orderLines) {
        const code = (ol.projectSecurityLink?.code ?? '').trim()
        const ct = ol.projectSecurityLink?.costType ?? ol.costType
        const psl = ol.projectSecurityLink?.id
        if (!code || ct == null || psl == null) continue
        const refs = refsByCode.get(code) ?? []
        const target = refs.find(r => (r.pslsPerCt[ct]?.length ?? 0) === 0) ?? refs[0]
        if (target) registreerPsl(target, ct, psl)
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

// ─── Stelposten: eigen bewakingscode aanmaken (zelfde pad, ander hoofdstuk) ────

/**
 * Zoekt een vrije bewakingscode op het project, beginnend bij `prefix01` en doorlopend tot een
 * nummer dat nog niet als code op het project staat. Nodig omdat `zorgVoorOntbrekendePsls`
 * read-modify-write is: blind doornummeren naar een code die al bestaat hangt de stelpost stil aan
 * een vreemde bewakingscode, waarna je iets anders bewaakt dan je denkt. `bezet` bevat de codes die
 * EVA zelf al heeft uitgedeeld maar die (nog) niet in Bouw7 staan.
 */
export async function vindVrijeBewakingscode(
  dossierId: string,
  prefix: string,
  bezet: string[] = [],
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const gebruikt = new Set<string>(bezet.map(c => c.trim().toUpperCase()).filter(Boolean))
  // Bouw7 is gezaghebbend over wat er al op het project staat; lukt de call niet, dan blijft de
  // EVA-kant de enige bron (en geeft de codes-toewijzing hoogstens een botsing die Bouw7 weigert).
  const resolved = await resolveBewakingscodes(dossierId)
  if (resolved.ok) for (const c of resolved.codes) gebruikt.add(c.code.trim().toUpperCase())

  for (let n = 1; n <= 99; n++) {
    const kandidaat = `${prefix}${String(n).padStart(2, '0')}`
    if (!gebruikt.has(kandidaat.toUpperCase())) return { ok: true, code: kandidaat }
  }
  return { ok: false, error: `Geen vrije ${prefix}-code beschikbaar op dit project.` }
}

/**
 * Maakt voor een stelpost een eigen bewakingscode aan in Bouw7. Zelfde bewezen pad als meerwerk,
 * met twee verschillen die financieel uitmaken:
 *   1. het doelhoofdstuk is een stelpost-hoofdstuk (niet het meerwerk-hoofdstuk waar
 *      `maakMeerwerkBewakingscodeBouw7` standaard op mikt) — anders staat je stelpost tussen het
 *      meerwerk en telt hij daar visueel in mee;
 *   2. `begroot` is een KOSTPRIJS die de gebruiker zelf invult. Nooit het stelpostbedrag: dat is
 *      omzet inclusief AK en winst, en als budget zou het de verwachte kosten opblazen en de marge
 *      op het Financieel-tab vernielen.
 */
export async function maakStelpostBewakingscodeBouw7(
  dossierId: string,
  opts: { code: string; naam: string; begroot?: number | null; kostensoort?: number },
): Promise<MeerwerkBewakingscodeResultaat> {
  const hk = await getProjectHoofdstukken(dossierId)
  if (!hk.ok) return { ok: false, error: hk.error }
  const stelpost = hk.hoofdstukken.find(h => /stelpost|^sp\b|^sp$/i.test(h.naam.trim()))
  // Geen stelpost-hoofdstuk? Neem het eerste, maar nooit een hoofdstuk dat naar meerwerk verwijst.
  const hoofdstukId = (stelpost
    ?? hk.hoofdstukken.find(h => !/meerwerk|^mw\b|^mw$/i.test(h.naam.trim()))
    ?? hk.hoofdstukken[0])?.id ?? null
  if (hoofdstukId == null) {
    return { ok: false, error: 'Geen hoofdstuk gevonden om de bewakingscode onder te plaatsen.' }
  }
  return maakMeerwerkBewakingscodeBouw7(dossierId, {
    code: opts.code,
    naam: opts.naam,
    bedrag: opts.begroot ?? null,
    kostensoort: opts.kostensoort,
    hoofdstukId,
  })
}

export type PrognoseRegel = {
  /** Kale bewakingscode (= kostengroep zonder omschrijving). */
  code: string
  codeNaam: string | null
  /** Identiteit (code + omschrijving) waarmee de Bouw7-PSL/reset wordt gematcht. */
  identity: string
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
  // Match op identiteit (code + omschrijving); val terug op code alleen voor bestaande
  // kostengroepen die (nog) zonder omschrijving zijn vastgelegd.
  const byIdentity = new Map(resolved.codes.map(c => [codeIdentity(c.code, c.naam), c]))
  const byCode = new Map<string, BewakingscodeRef[]>()
  for (const c of resolved.codes) {
    const arr = byCode.get(c.code) ?? []
    arr.push(c); byCode.set(c.code, arr)
  }

  const regels: PrognoseRegel[] = []
  for (const codeTotaal of totalen) {
    const code = (codeTotaal.code ?? '').trim()
    const naam = codeTotaal.naam ?? null
    const ref = code ? (byIdentity.get(codeIdentity(code, naam)) ?? byCode.get(code)?.[0]) : undefined
    // Identiteit voor de reset-sync/PSL-lookup: die van de gematchte Bouw7-code, anders
    // de identiteit uit de werkbegroting (nieuw aan te maken code).
    const identity = ref ? codeIdentity(ref.code, ref.naam) : codeIdentity(code, naam)

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

      regels.push({ code, codeNaam: ref?.naam ?? naam, identity, type, label: map.label, ct, begroot, meerwerk, werkbegroting, verschil, verschilUren, pslId, schrijfbaar, actie, nieuweCode, reden })
    })
  }

  return { ok: true, bouw7Id: resolved.bouw7Id, regels }
}

/** Preview: bereken (read-only) wat er naar Bouw7 geschreven zou worden. Schrijft niets. */
export async function previewWerkbegrotingPrognoseBouw7(dossierId: string, totalen: WerkbegrotingPrognoseTotalen): Promise<PrognoseResultaat> {
  return berekenPrognoseRegels(dossierId, totalen)
}

// ─── Autorisatie: prognose naar Bouw7 — alleen controller of directie ─────────
//
// De prognose is een besluit dat de begroting in Bouw7 raakt; alleen de toegewezen
// controller van het dossier of iemand uit afdeling Directie mag hem versturen.
// Andere rollen (projectleider, calculator, gedelegeerde) niet.

async function magPrognoseSturenIntern(dossierId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { bepaalBeoordeelContext } = await import('@/lib/goedkeuring/autorisatie')
  const ctx = await bepaalBeoordeelContext(dossierId)
  if (!ctx.medewerker) return { ok: false, error: 'Niet ingelogd of geen medewerker-profiel.' }
  if (!ctx.isController && !ctx.isDirectie) {
    return { ok: false, error: 'Alleen de controller of de directie mag de prognose naar Bouw7 sturen.' }
  }
  return { ok: true }
}

/** Mag de ingelogde gebruiker de prognose naar Bouw7 sturen? (controller of directie) */
export async function magPrognoseSturen(dossierId: string): Promise<boolean> {
  return (await magPrognoseSturenIntern(dossierId)).ok
}

/** Werkbegroting-prognosetotalen server-side afleiden uit de payload (regels × componenten). */
function berekenPrognoseTotalenUitPayload(payload: WerkbegrotingPayload): WerkbegrotingPrognoseTotalen {
  const regelById = new Map(payload.regels.filter(r => !r.is_verwijderd).map(r => [r.id, r]))
  const perCode = new Map<string, WerkbegrotingCodeTotaal>()
  const ensure = (code: string, naam: string | null): WerkbegrotingCodeTotaal => {
    const key = codeIdentity(code, naam)
    let t = perCode.get(key)
    if (!t) { t = { code, naam }; perCode.set(key, t) }
    return t
  }
  for (const comp of payload.componenten) {
    if (comp.is_verwijderd) continue
    const regel = regelById.get(comp.werkbegroting_regel_id)
    if (!regel) continue
    const code = kaleCode(regel.kostengroep)
    const naam = kgNaamDeel(regel.kostengroep)
    const hoeveelheid = regel.hoeveelheid * comp.norm_hoeveelheid
    const bedrag = hoeveelheid * comp.tarief
    const t = ensure(code, naam)
    if (comp.type === 'arbeid') { t.arbeid = t.arbeid ?? { bedrag: 0, uren: 0 }; t.arbeid.bedrag += bedrag; t.arbeid.uren += hoeveelheid }
    else if (comp.type === 'onderaanneming') { t.onderaanneming = t.onderaanneming ?? { bedrag: 0 }; t.onderaanneming.bedrag += bedrag }
    else if (comp.type === 'materieel') { t.materieel = t.materieel ?? { bedrag: 0 }; t.materieel.bedrag += bedrag }
  }
  return [...perCode.values()]
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
  // Autorisatie: alleen de controller van het dossier of de directie mag de prognose sturen.
  const autor = await magPrognoseSturenIntern(dossierId)
  if (!autor.ok) return { ok: false, error: autor.error }

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
  const codeMap = naResolve.ok ? new Map(naResolve.codes.map(c => [codeIdentity(c.code, c.naam), c])) : new Map<string, BewakingscodeRef>()
  for (const r of berekend.regels) {
    if (r.actie === 'aanmaken' && r.pslId == null) {
      r.pslId = codeMap.get(r.identity)?.pslPerCt[r.ct] ?? null
      if (r.pslId == null) fouten.push(`PSL voor ${r.code} / ${r.label} niet gevonden na aanmaken.`)
    }
  }

  // Helper: secundaire PSL's van een code-identiteit × kostensoort (alle PSL's behalve de primaire).
  const secundairePsls = (identity: string, ct: number, primair: number | null): number[] =>
    (codeMap.get(identity)?.pslsPerCt[ct] ?? []).filter(p => p !== primair)

  // 3) Prognose ("Niet/anders begroot") wegschrijven voor alle regels met een PSL.
  //    Heeft een code meerdere PSL's (dubbele bewakingscode, zelfde nummer/ander hoofdstuk),
  //    dan gaat het verschil naar de primaire PSL en worden de secundaire PSL's op 0 gezet —
  //    zo blijft het totaal per code exact gelijk aan de werkbegroting zonder dubbeltelling.
  let geschreven = 0
  try {
    for (const r of berekend.regels) {
      if (r.actie === 'skip' || r.pslId == null) continue
      const body: Record<string, unknown> = { id: r.pslId, prognosisOtherAmount: String(r.verschil) }
      if (r.type === 'arbeid') body.prognosisOtherHours = String(r.verschilUren ?? 0)
      await client.post('/project/update-prognosis-other', body)
      geschreven++
      for (const psl of secundairePsls(r.identity, r.ct, r.pslId)) {
        const nul: Record<string, unknown> = { id: psl, prognosisOtherAmount: '0' }
        if (r.type === 'arbeid') nul.prognosisOtherHours = '0'
        await client.post('/project/update-prognosis-other', nul)
        geschreven++
      }
    }

    // 4) Reset-sync: elke bestaande PSL (Arbeid/OA/Materiaal) die NIET in de werkbegroting staat →
    //    prognose moet 0 worden (werkbegroting is exact leidend). Omdat prognose = begroot +
    //    meerwerk + "Niet/anders begroot", zetten we op de primaire PSL Niet/anders begroot op
    //    −(begroot + meerwerk) (gesommeerd over dubbele codes) en de secundaire PSL's op 0, zodat
    //    het codetotaal 0 wordt. Onvoorwaardelijk, want het chapters-endpoint geeft de huidige
    //    waarde niet terug.
    const inWerkbegroting = new Set(berekend.regels.filter(r => r.actie !== 'skip').map(r => `${r.identity}|${r.ct}`))
    let gereset = 0
    for (const c of codeMap.values()) {
      const identity = codeIdentity(c.code, c.naam)
      for (const ct of PROGNOSE_KOSTENSOORTEN) {
        const psl = c.pslPerCt[ct]
        if (psl == null) continue
        if (inWerkbegroting.has(`${identity}|${ct}`)) continue
        const body: Record<string, unknown> = { id: psl, prognosisOtherAmount: String(rond(-((c.begrootPerCt[ct] ?? 0) + (c.meerwerkPerCt[ct] ?? 0)))) }
        if (ct === 1) body.prognosisOtherHours = String(rond(-((c.urenPerCt[ct] ?? 0) + (c.meerwerkUrenPerCt[ct] ?? 0))))
        await client.post('/project/update-prognosis-other', body)
        gereset++
        for (const sec of secundairePsls(identity, ct, psl)) {
          const nul: Record<string, unknown> = { id: sec, prognosisOtherAmount: '0' }
          if (ct === 1) nul.prognosisOtherHours = '0'
          await client.post('/project/update-prognosis-other', nul)
          gereset++
        }
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
  /** Omschrijving van de bijbehorende bewakingscode (via PSL-id opgezocht) — onderscheidt dubbele codes. */
  codeNaam: string | null
  omschrijving: string
  /** Werkelijk aantal = quantity × quantityFactor. */
  aantal: number
  eenheid: string
  /** Prijs per eenheid (unitPrice). */
  prijs: number
  type: 'arbeid' | 'onderaanneming' | 'materieel'
  /** Leverancier/onderaannemer (Bouw7 contact.name), indien bekend. */
  leverancierNaam: string | null
  /** Bouw7 contact.type ('subcontractor' = onderaanneming, anders inkoop/leverancier). */
  leverancierType: string | null
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

  // PSL-id → bewakingscode-ref, zodat elke bestelregel aan de juiste (code + omschrijving)
  // gekoppeld wordt — óók als twee bewakingscodes hetzelfde nummer hebben.
  const pslToRef = new Map<number, BewakingscodeRef>()
  const refsByCode = new Map<string, BewakingscodeRef[]>()
  for (const c of resolved.codes) {
    for (const ct of PROGNOSE_KOSTENSOORTEN) for (const psl of c.pslsPerCt[ct] ?? []) pslToRef.set(psl, c)
    const arr = refsByCode.get(c.code) ?? []
    arr.push(c); refsByCode.set(c.code, arr)
  }
  const naamVoorRegel = (code: string, pslId: number | undefined): string | null => {
    if (pslId != null) { const r = pslToRef.get(pslId); if (r) return r.naam }
    return refsByCode.get(code)?.[0]?.naam ?? null
  }

  let bestelregels: BestelregelImport[] = []
  try {
    const lines = await ctx.client
      .get<{ items?: Bouw7ContractOrderLine[] }>('/list/contract-order-lines', { q: `project.id = ${ctx.bouw7Id} SORT(description, ASC) LIMIT 1000` })
      .then(r => r.items ?? [])
    bestelregels = lines
      .map((ol): BestelregelImport => {
        // PSL-kostensoort is leidend; valt die weg, dan de regel-enum ernaartoe vertalen
        // (die telt anders 1 = Onderaanneming als 1 = Arbeid).
        const ct = ol.projectSecurityLink?.costType
          ?? (ol.costType != null ? LINE_CT_NAAR_PSL_CT[ol.costType] : undefined)
        const type = ct === 1 ? 'arbeid' : ct === 3 ? 'onderaanneming' : 'materieel'
        const factor = getal(ol.quantityFactor)
        const aantal = getal(ol.quantity) * (factor || 1)
        const code = (ol.projectSecurityLink?.code ?? '').trim()
        return {
          bouw7LineId: ol.id,
          code,
          codeNaam: naamVoorRegel(code, ol.projectSecurityLink?.id),
          omschrijving: ol.description ?? '',
          aantal,
          eenheid: ol.unit ?? 'st',
          prijs: getal(ol.unitPrice),
          type,
          leverancierNaam: ol.contact?.name?.trim() || null,
          leverancierType: ol.contact?.type ?? null,
        }
      })
      .filter(b => b.code)
  } catch {
    // Bestelregels zijn optioneel; de codes alleen importeren mag ook.
  }

  return { ok: true, codes: resolved.codes.map(c => ({ code: c.code, naam: c.naam })), bestelregels }
}

// ─── Werkbegroting-regels als bestelregels naar Bouw7 (upsert per regel) ──────
//
// Elke werkbegroting-COMPONENT → één contract-order-line ("verwachte kosten") in Bouw7,
// via het ongedocumenteerde `POST /contract-order-line` (Heimdall, zónder /project/{id}-prefix).
// Het wél gedocumenteerde `POST /project/{id}/contract-order-line` is NIET bruikbaar: dat is
// material-only (het negeert `costType` en weigert een arbeid-/OA-PSL met een 400
// "does not have cost type material"). Zie WRITE-ENDPOINTS.md §2b.
// Identiteit via werkbegroting_componenten.bouw7_line_id:
//   null  → aanmaken   (POST zonder id) → id opslaan
//   gevuld→ bijwerken  (POST mét id)     → geen duplicaat
//   soft-deleted + id → neutraliseren   (POST mét id, quantity "0")
// Bestelde regels (code met inkooporder/OA/geboekte factuur) worden overgeslagen en
// nooit aangeraakt (fiscale bescherming; zie getVergrendeldeBewakingscodes).
//
// De update-semantiek is geverifieerd op testproject 3869371 (juli 2026): een POST mét `id`
// geeft 200 met hetzelfde id terug en werkt de bestaande regel bij — geen duplicaat.

/**
 * Bewakingscodes waarop al inkoop "verbruikt" is: er staat een inkooporder, een
 * onderaannemerscontract of een geboekte inkoopfactuur op. Regels op zo'n code worden
 * in EVA vergrendeld en bij de sync overgeslagen. Bron: dezelfde reads als getDossierInkoop.
 */
export async function getVergrendeldeBewakingscodes(
  dossierId: string,
): Promise<{ ok: true; codes: string[] } | { ok: false; error: string }> {
  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return ctx
  const { client, bouw7Id } = ctx
  const codes = new Set<string>()
  try {
    type CodeLink = { projectSecurityLink?: { code?: string | null } | null }
    type ApolloInv = { deliveryTicket?: { securityLink?: { code?: { code?: string | null } | null } | null } | null }
    const [orderResp, subResp, apolloInvoices] = await Promise.all([
      client.get<{ items?: CodeLink[] }>('/list/purchase-order-contracts', { q: `project.id = ${bouw7Id} LIMIT 500` }).catch(() => ({ items: [] as CodeLink[] })),
      client.get<{ items?: CodeLink[] }>('/list/subcontractor-contracts', { q: `project.id = ${bouw7Id} LIMIT 500` }).catch(() => ({ items: [] as CodeLink[] })),
      client.getApolloAll<ApolloInv>('/search/purchase-invoices', `project.id = ${bouw7Id}`).catch(() => [] as ApolloInv[]),
    ])
    for (const o of orderResp.items ?? []) { const c = (o.projectSecurityLink?.code ?? '').trim(); if (c) codes.add(c) }
    for (const s of subResp.items ?? []) { const c = (s.projectSecurityLink?.code ?? '').trim(); if (c) codes.add(c) }
    for (const inv of apolloInvoices) { const c = (inv.deliveryTicket?.securityLink?.code?.code ?? '').trim(); if (c) codes.add(c) }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ophalen vergrendelde codes mislukt.' }
  }
  return { ok: true, codes: [...codes] }
}

export type BestelregelActie = 'aanmaken' | 'bijwerken' | 'neutraliseren' | 'skip'

/** Eén geplande bestelregel-actie voor een werkbegroting-component. */
export type BestelregelPlanRegel = {
  componentId: string
  code: string
  codeNaam: string | null
  type: 'arbeid' | 'onderaanneming' | 'materieel'
  label: string
  /** Kostensoort van de bewakingscode/PSL (1/3/5) — bepaalt welke PSL we aanschrijven. */
  ct: number
  /** Kostentype van de bestelregel zelf (0-gebaseerde enum) — moet bij `ct` passen. */
  lineCt: number
  omschrijving: string
  aantal: number
  prijs: number
  bedrag: number
  eenheid: string
  bouw7LineId: number | null
  pslId: number | null
  actie: BestelregelActie
  vergrendeld: boolean
  reden?: string
}
export type BestelregelPreviewResultaat =
  | { ok: true; bouw7Id: string; regels: BestelregelPlanRegel[]; vergrendeldeCodes: string[] }
  | { ok: false; error: string }

/** Gedeelde planner: bepaal per component welke actie naar Bouw7 nodig is. */
async function bouwBestelregelPlan(dossierId: string, payload: WerkbegrotingPayload): Promise<BestelregelPreviewResultaat> {
  const resolved = await resolveBewakingscodes(dossierId)
  if (!resolved.ok) return resolved
  const verg = await getVergrendeldeBewakingscodes(dossierId)
  const vergrendeldeCodes = verg.ok ? verg.codes : []
  const vergSet = new Set(vergrendeldeCodes)

  const refsByCode = new Map<string, BewakingscodeRef[]>()
  for (const c of resolved.codes) { const a = refsByCode.get(c.code) ?? []; a.push(c); refsByCode.set(c.code, a) }
  const refVoor = (code: string, naam: string | null): BewakingscodeRef | undefined => {
    const arr = refsByCode.get(code)
    if (!arr) return undefined
    return arr.find(r => codeIdentity(r.code, r.naam) === codeIdentity(code, naam)) ?? arr[0]
  }

  const regelById = new Map(payload.regels.map(r => [r.id, r]))
  const regels: BestelregelPlanRegel[] = []
  for (const comp of payload.componenten) {
    const regel = regelById.get(comp.werkbegroting_regel_id)
    if (!regel) continue
    const verwijderd = !!comp.is_verwijderd || !!regel.is_verwijderd
    const code = kaleCode(regel.kostengroep)
    const naam = kgNaamDeel(regel.kostengroep)
    const map = TYPE_NAAR_BOUW7[comp.type]
    const ref = code ? refVoor(code, naam) : undefined
    const pslId = ref?.pslPerCt[map.ct] ?? null
    // Aantal/prijs mirroren de EVA-werkbegroting-som (tarief zonder opslag, net als de UI-totalen).
    const aantal = rond(regel.hoeveelheid * comp.norm_hoeveelheid)
    const prijs = rond(comp.tarief)
    const bedrag = rond(aantal * prijs)
    const bouw7LineId = comp.bouw7_line_id ?? null
    const vergrendeld = !!code && vergSet.has(code)

    let actie: BestelregelActie = 'aanmaken'
    let reden: string | undefined
    if (!code) { actie = 'skip'; reden = 'Regel zonder bewakingscode (kostengroep leeg).' }
    else if (vergrendeld) { actie = 'skip'; reden = 'Besteld in Bouw7 — vergrendeld.' }
    else if (verwijderd) {
      if (bouw7LineId != null) actie = 'neutraliseren'
      else { actie = 'skip'; reden = 'Verwijderd, nooit verzonden.' }
    }
    else if (bedrag === 0 && bouw7LineId == null) { actie = 'skip'; reden = 'Geen bedrag.' }
    else if (bouw7LineId == null) actie = 'aanmaken'
    else actie = 'bijwerken'

    regels.push({
      componentId: comp.id, code, codeNaam: ref?.naam ?? naam, type: comp.type, label: map.label, ct: map.ct, lineCt: map.lineCt,
      omschrijving: (comp.omschrijving?.trim() || regel.omschrijving || '').trim(),
      aantal, prijs, bedrag, eenheid: String(comp.eenheid || regel.eenheid || 'st'),
      bouw7LineId, pslId, actie, vergrendeld, reden,
    })
  }

  // ── Idempotentie: bestaande Bouw7-bestelregels adopteren ─────────────────────
  // Kern van de duplicaat-fix. Zonder dit maakt élke druk op de knop nieuwe regels aan
  // zodra het bouw7_line_id niet bewaard is (de client-sync kan de kolom op null zetten,
  // of een create gaf het id niet terug). We halen de bestaande regels van het project op
  // en koppelen een component-zonder-id aan een identieke Bouw7-regel: dan wordt het een
  // 'bijwerken' (upsert op dat id) i.p.v. 'aanmaken'. Best effort — faalt dit, dan valt de
  // push terug op het oude gedrag (create), nooit op een harde fout.
  try {
    const ctx = await bouw7Context(dossierId)
    if (ctx.ok) {
      const bestaande = await ctx.client
        .get<{ items?: Bouw7ContractOrderLine[] }>('/list/contract-order-lines', { q: `project.id = ${ctx.bouw7Id} LIMIT 1000` })
        .then(r => r.items ?? [])
        .catch(() => [] as Bouw7ContractOrderLine[])
    // Regels die al een id claimen niet nogmaals adopteren.
      const geclaimd = new Set<number>()
      for (const r of regels) if (r.bouw7LineId != null) geclaimd.add(r.bouw7LineId)
      for (const r of regels) {
        if (r.actie !== 'aanmaken') continue
        const match = bestaande.find(ol =>
          !geclaimd.has(ol.id) &&
          (r.pslId != null
            ? ol.projectSecurityLink?.id === r.pslId
            : (ol.projectSecurityLink?.code ?? '').trim() === r.code && ol.costType === r.lineCt) &&
          (ol.description ?? '') === (r.omschrijving || r.label) &&
          Math.abs(getal(ol.unitPrice) - r.prijs) < 0.005,
        )
        if (match) {
          r.bouw7LineId = match.id
          r.pslId = match.projectSecurityLink?.id ?? r.pslId
          r.actie = 'bijwerken'
          geclaimd.add(match.id)
        }
      }
    }
  } catch { /* adoptie is best effort */ }

  return { ok: true, bouw7Id: resolved.bouw7Id, regels, vergrendeldeCodes }
}

/** Preview (read-only): bereken per component welke actie naar Bouw7 nodig is. Schrijft niets. */
export async function previewWerkbegrotingBestelregelsBouw7(dossierId: string, payload: WerkbegrotingPayload): Promise<BestelregelPreviewResultaat> {
  return bouwBestelregelPlan(dossierId, payload)
}

/**
 * Herkent de Bouw7-fout "het meegestuurde `id` bestaat niet (meer)" op `POST /contract-order-line`:
 * `404 {"type":"entity_not_found","message":"Property with name \"id\", that contains a reference
 * to an Object with ID #<id> of type \"ContractOrderLine\" does not exist."}`
 *
 * Dit gebeurt als een bestelregel in Bouw7 is verwijderd terwijl EVA het id nog bewaart (o.a. bij
 * ids die uit de import komen). Bewust strak: het moet over ons eigen `id` gaan én over een
 * ContractOrderLine — zo blijft een 404 over een onbekende PSL of contact gewoon een harde fout.
 */
function isOnbekendLineId(e: unknown, lineId: number | null): boolean {
  if (lineId == null) return false
  const msg = e instanceof Error ? e.message : ''
  return /\b404\b/.test(msg)
    && /entity_not_found/.test(msg)
    && /ContractOrderLine/.test(msg)
    && new RegExp(`#${lineId}\\b`).test(msg)
}

export type StuurBestelregelsResultaat =
  | {
      ok: true
      aangemaakt: number
      bijgewerkt: number
      geneutraliseerd: number
      overgeslagen: number
      fouten: string[]
      lineIdPerComponent: Record<string, number>
      /**
       * Componenten waarvan het bouw7_line_id in Bouw7 niet meer bestond. Server-side al op null
       * gezet; de client MOET ze ook lokaal wissen, anders schrijft de eerstvolgende
       * `syncWerkbegrotingNaarSupabase` het verlopen id vanuit localStorage weer terug.
       */
      gewisteComponenten: string[]
    }
  | {
      ok: false
      error: string
      /**
       * Ook bij een afbreking halverwege: de regels die dáárvoor al in Bouw7 zijn aangemaakt.
       * Zonder dit staan ze wél in Bouw7 maar kent EVA hun id niet → duplicaten bij de volgende push.
       */
      lineIdPerComponent: Record<string, number>
      gewisteComponenten: string[]
    }

/**
 * Upsert de werkbegroting-componenten als bestelregels in Bouw7 (aanmaken/bijwerken/neutraliseren),
 * bestelde regels overgeslagen. Ontbrekende PSL's worden eerst aangemaakt (begroot 0). Het
 * teruggekregen contract-order-line-id wordt naar `werkbegroting_componenten.bouw7_line_id`
 * geschreven zodat een volgende sync bijwerkt i.p.v. dupliceert.
 */
export async function stuurWerkbegrotingBestelregelsBouw7(
  dossierId: string,
  payload: WerkbegrotingPayload,
  doelHoofdstukId: number | null = null,
): Promise<StuurBestelregelsResultaat> {
  const leeg = { lineIdPerComponent: {}, gewisteComponenten: [] }
  // Sync eerst zodat de bouw7_line_id-backfill straks op bestaande Supabase-rijen landt.
  const sync = await syncWerkbegrotingNaarSupabase(payload)
  if (!sync.gelukt) return { ok: false, error: `Synchroniseren mislukt: ${sync.fout}`, ...leeg }

  const plan = await bouwBestelregelPlan(dossierId, payload)
  if (!plan.ok) return { ok: false, error: plan.error, ...leeg }

  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return { ok: false, error: ctx.error, ...leeg }
  const { client, bouw7Id } = ctx
  const fouten: string[] = []

  // 1) Ontbrekende PSL's aanmaken (begroot 0) voor te schrijven regels zonder pslId.
  const teMaken = plan.regels
    .filter(r => (r.actie === 'aanmaken' || r.actie === 'bijwerken') && r.pslId == null && r.code)
    .map(r => ({ code: r.code, naam: r.codeNaam, ct: r.ct }))
  if (teMaken.length > 0) {
    try {
      const res = await zorgVoorOntbrekendePsls(client, bouw7Id, teMaken, doelHoofdstukId)
      fouten.push(...res.fouten)
      const naResolve = await resolveBewakingscodes(dossierId)
      if (naResolve.ok) {
        const refsByCode = new Map<string, BewakingscodeRef[]>()
        for (const c of naResolve.codes) { const a = refsByCode.get(c.code) ?? []; a.push(c); refsByCode.set(c.code, a) }
        for (const r of plan.regels) {
          if (r.pslId != null || !r.code) continue
          const ref = refsByCode.get(r.code)?.find(x => codeIdentity(x.code, x.naam) === codeIdentity(r.code, r.codeNaam)) ?? refsByCode.get(r.code)?.[0]
          r.pslId = ref?.pslPerCt[r.ct] ?? null
        }
      }
    } catch (e) {
      // Nog vóór de eerste bestelregel — er is nog niets uitgedeeld om te bewaren.
      return { ok: false, error: `Aanmaken bewakingscodes mislukt: ${e instanceof Error ? e.message : 'onbekende fout'}`, ...leeg }
    }
  }

  // 2) Contact-id's (relaties.bouw7_id) ophalen voor de te schrijven componenten.
  const compById = new Map(payload.componenten.map(c => [c.id, c]))
  const relatieIds = [...new Set(payload.componenten.map(c => c.relatie_id).filter((x): x is string => !!x && UUID_RE.test(x)))]
  const contactPerRelatie = new Map<string, number>()
  if (relatieIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    const { data } = await db.from('relaties').select('id, bouw7_id').in('id', relatieIds)
    for (const r of data ?? []) { const bid = Number(r.bouw7_id); if (Number.isFinite(bid) && bid > 0) contactPerRelatie.set(r.id, bid) }
  }

  // 3) Upsert per regel.
  let aangemaakt = 0, bijgewerkt = 0, geneutraliseerd = 0
  const lineIdPerComponent: Record<string, number> = {}
  // Componenten waarvan het bouw7_line_id in Bouw7 niet meer bestaat → koppeling wissen.
  const teWissen: string[] = []

  /**
   * Koppelingen naar Supabase wegschrijven. Wordt óók aangeroepen als de push halverwege
   * afbreekt: de regels die dan al in Bouw7 staan moeten hun id houden, anders maakt de
   * volgende push duplicaten aan.
   */
  const persisteerKoppelingen = async (): Promise<void> => {
    if (Object.keys(lineIdPerComponent).length === 0 && teWissen.length === 0) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    const nu = new Date().toISOString()
    for (const [componentId, lineId] of Object.entries(lineIdPerComponent)) {
      // Let op: de PostgREST-builder is thenable maar heeft géén `.catch` → nooit `.catch()` op de
      // query zetten (dat gooit "catch is not a function"). Altijd await + try/catch.
      try { await db.from('werkbegroting_componenten').update({ bouw7_line_id: lineId, bijgewerkt_op: nu }).eq('id', componentId) } catch { /* best effort */ }
    }
    // Verlopen koppelingen opruimen, anders loopt élke volgende push weer op dezelfde 404.
    if (teWissen.length > 0) {
      try { await db.from('werkbegroting_componenten').update({ bouw7_line_id: null, bijgewerkt_op: nu }).in('id', teWissen) } catch { /* best effort */ }
    }
  }

  try {
    for (const r of plan.regels) {
      if (r.actie === 'skip') continue
      const comp = compById.get(r.componentId)
      const relatieId = comp?.relatie_id && UUID_RE.test(comp.relatie_id) ? comp.relatie_id : null
      const contactId = relatieId ? contactPerRelatie.get(relatieId) : undefined
      const quantity = r.actie === 'neutraliseren' ? '0' : String(r.aantal)
      const body: Record<string, unknown> = {
        project: { id: Number(bouw7Id) },
        description: r.omschrijving || r.label,
        quantity,
        unitPrice: String(r.prijs),
        costType: r.lineCt,
        ...(r.eenheid ? { unit: r.eenheid } : {}),
        ...(r.pslId != null ? { projectSecurityLink: { id: r.pslId } } : {}),
        ...(contactId != null ? { contact: { id: contactId } } : {}),
        ...(r.bouw7LineId != null ? { id: r.bouw7LineId } : {}),
      }
      let resp: { id?: number } | undefined
      let actie = r.actie
      try {
        resp = await client.post<{ id?: number } | undefined>('/contract-order-line', body)
      } catch (e) {
        if (!isOnbekendLineId(e, r.bouw7LineId)) throw e
        // Het opgeslagen bouw7_line_id bestaat niet meer in Bouw7 — de regel is daar verwijderd.
        // Niet fataal: bij bijwerken maken we 'm opnieuw aan, bij neutraliseren is 'ie al weg.
        if (r.actie === 'neutraliseren') { teWissen.push(r.componentId); geneutraliseerd++; continue }
        delete body.id
        resp = await client.post<{ id?: number } | undefined>('/contract-order-line', body)
        actie = 'aanmaken'
      }

      // Bij (her)aanmaken nooit terugvallen op het oude id — dat bestaat juist niet meer.
      const nieuwId = resp?.id ?? (actie === 'aanmaken' ? null : r.bouw7LineId) ?? null
      if (nieuwId != null) lineIdPerComponent[r.componentId] = nieuwId
      else if (actie === 'aanmaken' && r.bouw7LineId != null) teWissen.push(r.componentId)
      if (actie === 'aanmaken') aangemaakt++
      else if (actie === 'bijwerken') bijgewerkt++
      else geneutraliseerd++
    }
  } catch (e) {
    // Bewaar wat er vóór de fout al is aangemaakt — die regels staan in Bouw7 en zouden bij een
    // volgende push anders nogmaals worden aangemaakt.
    await persisteerKoppelingen()
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    const error = /\b40[13]\b/.test(msg) ? `Geweigerd (${msg}) — schrijfrechten of ids niet toegestaan.` : msg
    return { ok: false, error, lineIdPerComponent, gewisteComponenten: teWissen }
  }

  // 4) Backfill: gaf de POST geen id terug bij aanmaken, match de nieuwe regel op inhoud via /list.
  const zonderId = plan.regels.filter(r => r.actie === 'aanmaken' && lineIdPerComponent[r.componentId] == null)
  if (zonderId.length > 0) {
    try {
      const lines = await client
        .get<{ items?: Bouw7ContractOrderLine[] }>('/list/contract-order-lines', { q: `project.id = ${bouw7Id} LIMIT 1000` })
        .then(r => r.items ?? [])
      const gebruikt = new Set<number>(Object.values(lineIdPerComponent))
      for (const r of zonderId) {
        const match = lines.find(ol =>
          !gebruikt.has(ol.id) &&
          (ol.projectSecurityLink?.code ?? '').trim() === r.code &&
          (ol.description ?? '') === (r.omschrijving || r.label) &&
          Math.abs(getal(ol.unitPrice) - r.prijs) < 0.005,
        )
        if (match) { lineIdPerComponent[r.componentId] = match.id; gebruikt.add(match.id) }
      }
    } catch { /* backfill best effort */ }
  }

  // 5) bouw7_line_id terugschrijven naar Supabase (client patcht ook zijn localStorage).
  await persisteerKoppelingen()

  const overgeslagen = plan.regels.filter(r => r.actie === 'skip').length
  return { ok: true, aangemaakt, bijgewerkt, geneutraliseerd, overgeslagen, fouten, lineIdPerComponent, gewisteComponenten: teWissen }
}

// ─── Combineren: bestelregels + prognose in één keer naar Bouw7 ───────────────
//
// Bij het goedkeuren van een werkbegroting (en via de knop "Naar Bouw7") worden BEIDE
// Bouw7-kolommen in één handeling bijgewerkt: de bestelregels ("verwachte kosten") en de
// prognose ("niet/anders begroot"). Dit zijn twee losse kolommen in Bouw7 — ze tellen niet
// dubbel in EVA's eigen financiën. Best effort: de ene helft kan slagen terwijl de andere
// (bijv. door de goedkeurings-gate op de prognose) wordt overgeslagen.

export type BestelEnPrognoseResultaat = {
  /** True als minstens één van beide helften iets naar Bouw7 heeft geschreven. */
  ok: boolean
  /** Korte, leesbare samenvatting voor de toast. */
  melding: string
  /** Waarschuwingen/fouten per helft (niet fataal). */
  fouten: string[]
  /** Resultaat van de bestelregel-push (met lineIdPerComponent voor de client-patch). */
  bestelregels: StuurBestelregelsResultaat | null
  /** Resultaat van de prognose-push. */
  prognose: StuurPrognoseResultaat | null
}

/** Interne combineerder (géén eigen autorisatie — callers regelen dat). */
async function stuurBeideNaarBouw7Intern(
  dossierId: string,
  payload: WerkbegrotingPayload,
  doelHoofdstukId: number | null,
): Promise<BestelEnPrognoseResultaat> {
  const fouten: string[] = []
  const delen: string[] = []

  // 1) Bestelregels ("verwachte kosten"). Idempotent — adopteert bestaande regels, dus geen duplicaten.
  const bestel = await stuurWerkbegrotingBestelregelsBouw7(dossierId, payload, doelHoofdstukId)
  if (bestel.ok) {
    const d: string[] = []
    if (bestel.aangemaakt) d.push(`${bestel.aangemaakt} aangemaakt`)
    if (bestel.bijgewerkt) d.push(`${bestel.bijgewerkt} bijgewerkt`)
    if (bestel.geneutraliseerd) d.push(`${bestel.geneutraliseerd} verwijderd`)
    delen.push(`Bestelregels: ${d.join(', ') || 'niets te doen'}`)
    fouten.push(...bestel.fouten)
  } else {
    fouten.push(`Bestelregels: ${bestel.error}`)
  }

  // 2) Prognose ("niet/anders begroot"). Zelf-gated: autorisatie (controller/directie) + volledige goedkeuring.
  const totalen = berekenPrognoseTotalenUitPayload(payload)
  const prognose = await stuurWerkbegrotingPrognoseBouw7(dossierId, totalen, doelHoofdstukId, payload)
  if (prognose.ok) {
    const d = [`${prognose.geschreven} bijgewerkt`]
    if (prognose.aangemaakt) d.push(`${prognose.aangemaakt} aangemaakt`)
    if (prognose.gereset) d.push(`${prognose.gereset} gereset`)
    delen.push(`Prognose: ${d.join(', ')}`)
    fouten.push(...prognose.fouten)
  } else {
    fouten.push(`Prognose: ${prognose.error}`)
  }

  return {
    ok: bestel.ok || prognose.ok,
    melding: delen.join(' · ') || 'Niets naar Bouw7 verstuurd.',
    fouten,
    bestelregels: bestel,
    prognose,
  }
}

/**
 * Publieke variant (knop "Naar Bouw7"): stuurt bestelregels én prognose in één keer.
 * De prognose-helft handhaaft zelf de autorisatie (controller/directie) en de
 * goedkeurings-gate; de bestelregel-helft draait ook zonder die rechten.
 */
export async function stuurWerkbegrotingBestelEnPrognoseBouw7(
  dossierId: string,
  payload: WerkbegrotingPayload,
  doelHoofdstukId: number | null = null,
): Promise<BestelEnPrognoseResultaat> {
  return stuurBeideNaarBouw7Intern(dossierId, payload, doelHoofdstukId)
}

/**
 * Optioneel "schoon opnieuw": verwijder ALLE bestelregels van het project in één keer
 * (`DELETE /project/{id}/contract-order-lines`) en wis de EVA-koppelingen. Alleen toegestaan
 * als er nog GEEN inkoop op het project staat (anders zou het bestelde regels meeslepen).
 * Na afloop moeten de regels opnieuw gepusht worden (alle bouw7_line_id zijn gewist).
 */
export async function resetBouw7Bestelregels(
  dossierId: string,
  payload: WerkbegrotingPayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const verg = await getVergrendeldeBewakingscodes(dossierId)
  if (verg.ok && verg.codes.length > 0) {
    return { ok: false, error: 'Er staat al inkoop op dit project — een volledige reset zou bestelde regels verwijderen. Niet toegestaan.' }
  }
  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return ctx
  try {
    await ctx.client.del(`/project/${ctx.bouw7Id}/contract-order-lines`)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Verwijderen mislukt.' }
  }
  // EVA-koppelingen wissen zodat een volgende push alles opnieuw aanmaakt.
  const compIds = payload.componenten.map(c => c.id)
  if (compIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any
    // PostgREST-builder heeft geen `.catch` → await + try/catch.
    try { await db.from('werkbegroting_componenten').update({ bouw7_line_id: null }).in('id', compIds) } catch { /* best effort */ }
  }
  return { ok: true }
}
