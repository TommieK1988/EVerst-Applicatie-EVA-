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

// ─── Sync werkbegroting naar Supabase ─────────────────────────────────────────

export async function syncWerkbegrotingNaarSupabase(
  wb: Werkbegroting,
  regels: WerkbegrotingRegel[],
  componenten: WerkbegrotingComponent[],
  wijzigingen: WerkbegrotingWijziging[]
): Promise<SyncWerkbegrotingResultaat> {
  const db = await createClient()
  const nu = new Date().toISOString()

  try {
    // 1. Upsert werkbegroting header
    const { error: wbErr } = await db
      .from('werkbegrotingen')
      .upsert({ id: wb.id, project_id: wb.project_id, scenario_id: wb.scenario_id, naam: wb.naam, status: wb.status, bijgewerkt_op: nu }, { onConflict: 'id' })
    if (wbErr) throw new Error(`Werkbegroting header sync: ${wbErr.message}`)

    // 2. Upsert regels
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
            bijgewerkt_op: nu,
          })),
          { onConflict: 'id' }
        )
      if (regelErr) throw new Error(`Regels sync: ${regelErr.message}`)
    }

    // 3. Upsert componenten
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
            bijgewerkt_op: nu,
          })),
          { onConflict: 'id' }
        )
      if (compErr) throw new Error(`Componenten sync: ${compErr.message}`)
    }

    // 4. Wijzigingen (append-only)
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

    return { gelukt: true, regels_geschreven: regels.length }
  } catch (err) {
    return { gelukt: false, regels_geschreven: 0, fout: err instanceof Error ? err.message : 'Onbekende fout' }
  }
}

// ─── Sync bestellingen naar Supabase ─────────────────────────────────────────

export async function syncBestellingenNaarSupabase(
  bestellingen: WerkbegrotingBestelling[]
): Promise<{ gelukt: boolean; fout?: string }> {
  const db = await createClient()
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
    .limit(20)

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any

  // 1. Controller van het dossier ophalen
  const { data: dossier } = await db
    .from('dossiers')
    .select('controller_id')
    .eq('id', dossierId)
    .single()

  let medewerkerId: string | null = dossier?.controller_id ?? null
  let isFallback = false

  // 2. Geen controller → terugvallen op Tom Kamminga
  if (!medewerkerId) {
    isFallback = true
    const { data: tom } = await db
      .from('medewerkers')
      .select('id')
      .ilike('voornaam', 'Tom')
      .ilike('achternaam', 'Kamminga')
      .limit(1)
      .maybeSingle()
    medewerkerId = tom?.id ?? null
  }

  // 3. Naam + auth-koppeling van de toegewezen medewerker
  let naam: string | null = null
  let authUserId: string | null = null
  if (medewerkerId) {
    const { data: med } = await db
      .from('medewerkers')
      .select('voornaam, tussenvoegsel, achternaam, auth_user_id')
      .eq('id', medewerkerId)
      .single()
    if (med) {
      naam = [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ')
      authUserId = med.auth_user_id ?? null
    }
  }

  // 4. Bestaat er al een openstaande controletaak? Dan niet dubbel aanmaken.
  const { data: bestaand } = await db
    .from('tasks')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('titel', 'Werkbegroting controleren')
    .not('status', 'in', '("gereed","vervallen")')
    .limit(1)
    .maybeSingle()

  if (bestaand) {
    return { toegewezenAan: naam, isFallback, bestond: true, taakId: bestaand.id }
  }

  // 5. Taak aanmaken, rechtstreeks aan het dossier gekoppeld
  const { data: taak, error } = await db
    .from('tasks')
    .insert({
      titel:          'Werkbegroting controleren',
      dossier_id:     dossierId,
      status:         'open',
      prioriteit:     'hoog',
      assignee_type:  'direct',
      dossier_rollen: [],
    })
    .select('id')
    .single()

  if (error) throw new Error(`Fout bij aanmaken controletaak: ${error.message}`)

  // 6. Toewijzen aan de controller (of Tom Kamminga)
  if (authUserId) {
    await db.from('task_assignees').insert({
      task_id: taak.id,
      user_id: authUserId,
      rol:     'verantwoordelijke',
    })
  }

  revalidatePath('/opdrachten')
  revalidatePath('/taken')

  return { toegewezenAan: naam, isFallback, bestond: false, taakId: taak.id }
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
    if (!r) { r = { code, naam: null, hoofdstuk: null, pslPerCt: {}, begrootPerCt: {}, urenPerCt: {} }; map.set(code, r) }
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

export type PrognoseRegel = {
  /** Bewakingscode (= kostengroep). */
  code: string
  codeNaam: string | null
  type: 'arbeid' | 'materieel' | 'onderaanneming'
  label: string
  ct: number
  begroot: number
  werkbegroting: number
  /** Te schrijven prognosisOtherAmount = werkbegroting − begroot. */
  verschil: number
  /** Voor arbeid: bijbehorende uren-correctie. */
  verschilUren?: number
  pslId: number | null
  schrijfbaar: boolean
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
      const werkbegroting = invoer.bedrag
      const verschil = rond(werkbegroting - begroot)
      const pslId = ref?.pslPerCt[ct] ?? null

      let schrijfbaar = true
      let reden: string | undefined
      if (!code) { schrijfbaar = false; reden = 'Regel zonder bewakingscode (kostengroep leeg).' }
      else if (!ref) { schrijfbaar = false; reden = `Bewakingscode "${code}" niet gevonden in Bouw7.` }
      else if (pslId == null) { schrijfbaar = false; reden = `Geen ${map.label}-koppeling op deze code.` }
      else if (verschil === 0) { schrijfbaar = false; reden = 'Geen verschil t.o.v. begroot.' }

      let verschilUren: number | undefined
      if (type === 'arbeid') {
        const uren = (invoer as { uren: number }).uren
        const tarief = uren > 0 ? werkbegroting / uren : 0
        verschilUren = tarief > 0 ? rond(verschil / tarief) : 0
      }

      regels.push({ code, codeNaam: ref?.naam ?? null, type, label: map.label, ct, begroot, werkbegroting, verschil, verschilUren, pslId, schrijfbaar, reden })
    })
  }

  return { ok: true, bouw7Id: resolved.bouw7Id, regels }
}

/** Preview: bereken (read-only) wat er naar Bouw7 geschreven zou worden. Schrijft niets. */
export async function previewWerkbegrotingPrognoseBouw7(dossierId: string, totalen: WerkbegrotingPrognoseTotalen): Promise<PrognoseResultaat> {
  return berekenPrognoseRegels(dossierId, totalen)
}

export type StuurPrognoseResultaat =
  | { ok: true; geschreven: number; overgeslagen: number; regels: PrognoseRegel[] }
  | { ok: false; error: string }

/**
 * Schrijft de nieuwe prognosebedragen naar Bouw7 ("Niet/anders begroot" per bewakingscode ×
 * kostensoort). Alleen schrijfbare regels met een verschil ≠ 0 worden weggeschreven.
 */
export async function stuurWerkbegrotingPrognoseBouw7(dossierId: string, totalen: WerkbegrotingPrognoseTotalen): Promise<StuurPrognoseResultaat> {
  const berekend = await berekenPrognoseRegels(dossierId, totalen)
  if (!berekend.ok) return { ok: false, error: berekend.error }

  const ctx = await bouw7Context(dossierId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { client } = ctx

  let geschreven = 0
  try {
    for (const r of berekend.regels) {
      if (!r.schrijfbaar || r.pslId == null) continue
      const body: Record<string, unknown> = { id: r.pslId, prognosisOtherAmount: String(r.verschil) }
      if (r.type === 'arbeid') body.prognosisOtherHours = String(r.verschilUren ?? 0)
      await client.post('/project/update-prognosis-other', body)
      geschreven++
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Onbekende fout'
    return { ok: false, error: /\b40[13]\b/.test(msg) ? `Geweigerd (${msg}) — schrijfrechten of ids niet toegestaan.` : msg }
  }

  const overgeslagen = berekend.regels.filter(r => !r.schrijfbaar).length
  return { ok: true, geschreven, overgeslagen, regels: berekend.regels }
}

// ─── Import bewakingscodes + bestelregels uit Bouw7 (Scenario B) ──────────────

/** Eén bestelregel uit Bouw7, klaar om als werkbegroting-component te seeden. */
export type BestelregelImport = {
  code: string
  omschrijving: string
  bedrag: number
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
        return { code: (ol.projectSecurityLink?.code ?? '').trim(), omschrijving: ol.description ?? '', bedrag: getal(ol.totalPrice), type }
      })
      .filter(b => b.code)
  } catch {
    // Bestelregels zijn optioneel; de codes alleen importeren mag ook.
  }

  return { ok: true, codes: resolved.codes.map(c => ({ code: c.code, naam: c.naam })), bestelregels }
}
