'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type {
  MeerwerkRegel,
  MeerwerkStatus,
  MeerwerkAfrekenwijze,
  MeerwerkStelpostGrondslag,
  MeerwerkTermijnWijze,
} from '@everts/database'
import { getServicedeskRegie } from './servicedesk'
import { getDossierBewaking, bouw7VoorDossier } from './actions'
import { maakMeerwerkBewakingscodeBouw7 } from '@/app/(platform)/everts-calc/actions/werkbegroting'
import { maakMeerwerkOfferte } from '@/app/(platform)/everts-calc/actions/quotes'
import type { Bouw7Quotation, Bouw7QuotationDetail } from '@/lib/bouw7/client'

/** Statussen die als goedgekeurd meerwerk meetellen in het contracttotaal. */
const GOEDGEKEURD: MeerwerkStatus[] = ['akkoord', 'voltooid']

/** Toegestane statusovergangen. Afgewezen mag heropend worden naar Aangevraagd. */
const TRANSITIES: Record<MeerwerkStatus, MeerwerkStatus[]> = {
  aangevraagd:       ['offerte_verstuurd', 'akkoord', 'afgewezen'],
  offerte_verstuurd: ['akkoord', 'afgewezen', 'aangevraagd'],
  akkoord:           ['voltooid', 'afgewezen'],
  afgewezen:         ['aangevraagd'],
  voltooid:          [],
}

const rond = (n: number): number => Math.round(n * 100) / 100
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') { const n = parseFloat(v.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
  return 0
}

/** Effectief bedrag (excl. btw) per regel, afhankelijk van afrekenwijze/stelpost. */
function effectiefExcl(regel: MeerwerkRegel, regiePerCode: Map<string, number>): number {
  if (regel.is_stelpost && regel.stelpost_grondslag === 'eenheidsprijzen') {
    return rond((Number(regel.eenheidsprijs) || 0) * (Number(regel.hoeveelheid_werkelijk) || 0))
  }
  const opGeboekteKosten = regel.afrekenwijze === 'regie'
    || (regel.is_stelpost && regel.stelpost_grondslag === 'geboekte_kosten')
  if (opGeboekteKosten) {
    if (!regel.bewakingscode) return 0
    return rond(regiePerCode.get(regel.bewakingscode) ?? 0)
  }
  // aangenomen / handmatig
  return rond(Number(regel.bedrag_excl_btw) || 0)
}

export type MeerwerkRegelView = MeerwerkRegel & {
  effectiefExcl: number
  effectiefIncl: number
  btwEffectief: number
}

export type DossierMeerwerkData = {
  regels: MeerwerkRegelView[]
  totalen: { aantal: number; goedgekeurdExcl: number; goedgekeurdIncl: number }
}

/**
 * Haalt de meerwerkregels van een dossier op met per regel het effectieve bedrag. Regie- en
 * stelpost-op-geboekte-kosten-regels worden live berekend uit de geboekte uren/kosten op de eigen
 * bewakingscode (servicedesk-regiepatroon). De som van goedgekeurde regels is leidend voor het
 * meerwerk in het contracttotaal.
 */
export async function getDossierMeerwerk(dossierId: string): Promise<DossierMeerwerkData> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('meerwerk_regels')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: true })
  const regels = (data ?? []) as MeerwerkRegel[]

  // Regie alleen ophalen als er minstens één regie-/geboekte-kosten-regel mét code is.
  const heeftRegie = regels.some(r =>
    (r.afrekenwijze === 'regie' || (r.is_stelpost && r.stelpost_grondslag === 'geboekte_kosten')) && r.bewakingscode)
  const regiePerCode = new Map<string, number>()
  if (heeftRegie) {
    const regie = await getServicedeskRegie(dossierId)
    for (const r of regie.regels) {
      if (r.uitgesloten || !r.bewakingscode) continue
      regiePerCode.set(r.bewakingscode, (regiePerCode.get(r.bewakingscode) ?? 0) + (r.verkoopBedrag || 0))
    }
  }

  let goedgekeurdExcl = 0
  let goedgekeurdIncl = 0
  const views: MeerwerkRegelView[] = regels.map(r => {
    const excl = effectiefExcl(r, regiePerCode)
    const btwPct = r.btw_pct != null ? Number(r.btw_pct) : 21
    const incl = rond(excl * (1 + btwPct / 100))
    if (GOEDGEKEURD.includes(r.status)) { goedgekeurdExcl += excl; goedgekeurdIncl += incl }
    return { ...r, effectiefExcl: excl, effectiefIncl: incl, btwEffectief: btwPct }
  })

  return {
    regels: views,
    totalen: { aantal: regels.length, goedgekeurdExcl: rond(goedgekeurdExcl), goedgekeurdIncl: rond(goedgekeurdIncl) },
  }
}

/** Compacte som van goedgekeurd meerwerk (excl. btw) — voor contracttotaal-berekeningen elders. */
export async function getGoedgekeurdMeerwerkExcl(dossierId: string): Promise<number> {
  const { totalen } = await getDossierMeerwerk(dossierId)
  return totalen.goedgekeurdExcl
}

export type NieuweMeerwerkData = {
  omschrijving: string
  afrekenwijze: MeerwerkAfrekenwijze
  is_stelpost?: boolean
  stelpost_grondslag?: MeerwerkStelpostGrondslag | null
  bedrag_excl_btw?: number | null
  eenheid?: string | null
  eenheidsprijs?: number | null
  hoeveelheid_werkelijk?: number | null
  btw_pct?: number | null
  factuurreferentie?: string | null
}

export async function maakMeerwerkRegel(
  dossierId: string,
  data: NieuweMeerwerkData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: maxRow } = await supabase
    .from('meerwerk_regels')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  const { data: ins, error } = await supabase
    .from('meerwerk_regels')
    .insert({
      dossier_id: dossierId,
      volgnummer,
      omschrijving: data.omschrijving,
      afrekenwijze: data.afrekenwijze,
      is_stelpost: data.is_stelpost ?? false,
      stelpost_grondslag: data.is_stelpost ? (data.stelpost_grondslag ?? null) : null,
      bedrag_excl_btw: data.bedrag_excl_btw ?? null,
      eenheid: data.eenheid ?? null,
      eenheidsprijs: data.eenheidsprijs ?? null,
      hoeveelheid_werkelijk: data.hoeveelheid_werkelijk ?? null,
      btw_pct: data.btw_pct ?? null,
      factuurreferentie: data.factuurreferentie ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/meerwerk`)
  return { ok: true, id: ins.id }
}

export async function updateMeerwerkRegel(
  id: string,
  patch: Partial<NieuweMeerwerkData> & { termijn_wijze?: MeerwerkTermijnWijze | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const velden: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ['omschrijving', 'afrekenwijze', 'is_stelpost', 'stelpost_grondslag', 'bedrag_excl_btw',
    'eenheid', 'eenheidsprijs', 'hoeveelheid_werkelijk', 'btw_pct', 'factuurreferentie', 'termijn_wijze'] as const) {
    if (k in patch) velden[k] = (patch as any)[k]
  }
  // Stelpost-grondslag alleen relevant bij stelpost.
  if (velden.is_stelpost === false) velden.stelpost_grondslag = null

  const { data: row, error } = await supabase
    .from('meerwerk_regels')
    .update(velden)
    .eq('id', id)
    .select('dossier_id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${row.dossier_id}/meerwerk`)
  return { ok: true }
}

export async function verwijderMeerwerkRegel(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: row } = await supabase.from('meerwerk_regels').select('dossier_id').eq('id', id).single()
  const { error } = await supabase.from('meerwerk_regels').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }
  if (row?.dossier_id) revalidatePath(`/opdrachten/${row.dossier_id}/meerwerk`)
  return { ok: true }
}

/**
 * Statusovergang met validatie. Bij 'akkoord' wordt automatisch een eigen bewakingscode in Bouw7
 * aangemaakt (best effort — een Bouw7-fout blokkeert de statuswijziging niet, maar geeft een
 * waarschuwing terug). Bij 'afgewezen' kan een reden worden vastgelegd.
 */
export async function setMeerwerkStatus(
  id: string,
  status: MeerwerkStatus,
  opts?: { termijnWijze?: MeerwerkTermijnWijze | null; afgewezenReden?: string | null },
): Promise<{ ok: true; waarschuwing?: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: regel, error: leesFout } = await supabase
    .from('meerwerk_regels')
    .select('*')
    .eq('id', id)
    .single()
  if (leesFout || !regel) return { ok: false, error: leesFout?.message ?? 'Meerwerkregel niet gevonden.' }
  const r = regel as MeerwerkRegel

  if (r.status !== status && !TRANSITIES[r.status].includes(status)) {
    return { ok: false, error: `Ongeldige statusovergang: ${r.status} → ${status}.` }
  }

  const velden: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'afgewezen') velden.afgewezen_reden = opts?.afgewezenReden ?? null
  if (opts?.termijnWijze !== undefined) velden.termijn_wijze = opts.termijnWijze

  let waarschuwing: string | undefined

  // Bij akkoord: eigen bewakingscode in Bouw7 aanmaken (eenmalig — alleen als nog geen Bouw7-code).
  if (status === 'akkoord' && r.bouw7_chapter_id == null) {
    const code = r.bewakingscode?.trim() || `MW${String(r.volgnummer).padStart(2, '0')}`
    // Seed-bedrag: alleen zinvol bij aangenomen/handmatig (regie-bedrag is op dit moment nog 0).
    const bedrag = r.afrekenwijze === 'aangenomen' && !r.is_stelpost ? (Number(r.bedrag_excl_btw) || null) : null
    const res = await maakMeerwerkBewakingscodeBouw7(r.dossier_id, { code, naam: r.omschrijving, bedrag })
    if (res.ok) {
      velden.bewakingscode = code
      velden.bouw7_chapter_id = res.chapterId
      if (res.waarschuwing) waarschuwing = res.waarschuwing
    } else {
      // Bouw7-write mislukt → statuswijziging gaat door; code lokaal vastleggen zodat EVA hem toont.
      velden.bewakingscode = code
      waarschuwing = `Status op Akkoord gezet, maar bewakingscode in Bouw7 aanmaken mislukt: ${res.error}`
    }
  }

  const { error } = await supabase.from('meerwerk_regels').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${r.dossier_id}/meerwerk`)
  return { ok: true, waarschuwing }
}

/**
 * Maakt (en koppelt) een "Meerwerk offerte"-calculatie voor een regel. Vereist dat het dossier al een
 * everts-calc project heeft (open anders eerst de Calculatie-tab). Slaat het quote-id op de regel op.
 */
export async function maakMeerwerkCalculatie(
  regelId: string,
): Promise<{ ok: true; quoteId: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: regel } = await supabase
    .from('meerwerk_regels')
    .select('id, dossier_id, omschrijving, factuurreferentie, quote_id')
    .eq('id', regelId)
    .single()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  if (regel.quote_id) return { ok: true, quoteId: regel.quote_id }

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', regel.dossier_id)
    .single()
  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) {
    return { ok: false, error: 'Dit dossier heeft nog geen calculatieproject. Open eerst de Calculatie-tab.' }
  }

  const res = await maakMeerwerkOfferte({
    projectId,
    meerwerkRegelId: regelId,
    omschrijving: regel.omschrijving,
    referentie: regel.factuurreferentie ?? null,
  })
  if (!res.ok) return res

  await supabase.from('meerwerk_regels').update({ quote_id: res.quoteId, updated_at: new Date().toISOString() }).eq('id', regelId)
  revalidatePath(`/opdrachten/${regel.dossier_id}/meerwerk`)
  return { ok: true, quoteId: res.quoteId }
}

// ─── Bestaand Bouw7-meerwerk: lezen (2 bronnen) + importeren als EVA-regel ─────

export type Bouw7MeerwerkPerCode = {
  sleutel: string
  code: string
  naam: string | null
  hoofdstukId: number | null
  bedrag: number
  alGeimporteerd: boolean
}
export type Bouw7MeerwerkOfferteRegel = {
  sleutel: string
  quotationId: number
  lineId: number
  quotationNummer: string | null
  omschrijving: string
  aantal: number | null
  eenheid: string | null
  prijs: number | null
  bedrag: number
  btwPct: number | null
  alGeimporteerd: boolean
}
export type Bouw7MeerwerkData = {
  beschikbaar: boolean
  perCode: Bouw7MeerwerkPerCode[]
  offerteRegels: Bouw7MeerwerkOfferteRegel[]
}

/**
 * Leest bestaand meerwerk uit Bouw7 uit twee bronnen: (1) geboekt meerwerk per bewakingscode
 * (additionalWorkAmount, via getDossierBewaking) en (2) meerwerk-offerteregels (offerte-hoofdstukken
 * met additionalWork=true, via /list/quotations + /quotation/{id}). Per regel wordt gemarkeerd of hij
 * al als EVA-regel is geïmporteerd (op bronsleutel).
 */
export async function getBouw7Meerwerk(dossierId: string): Promise<Bouw7MeerwerkData> {
  const ctx = await bouw7VoorDossier(dossierId)
  if (!ctx) return { beschikbaar: false, perCode: [], offerteRegels: [] }
  const { client, bouw7Id } = ctx

  const supabase = createAdminClient() as any
  const { data: bestaand } = await supabase
    .from('meerwerk_regels')
    .select('bouw7_bron_sleutel')
    .eq('dossier_id', dossierId)
    .not('bouw7_bron_sleutel', 'is', null)
  const geimporteerd = new Set<string>((bestaand ?? []).map((r: any) => r.bouw7_bron_sleutel))

  // 1. Geboekt meerwerk per bewakingscode.
  const perCode: Bouw7MeerwerkPerCode[] = []
  try {
    const bewaking = await getDossierBewaking(dossierId)
    for (const h of bewaking.hoofdstukken) {
      for (const r of h.regels) {
        if (!r.code || Math.abs(r.meerwerk) < 0.005) continue
        const sleutel = `code:${r.code}`
        perCode.push({ sleutel, code: r.code, naam: r.naam, hoofdstukId: r.hoofdstukId, bedrag: rond(r.meerwerk), alGeimporteerd: geimporteerd.has(sleutel) })
      }
    }
  } catch { /* bewaking niet beschikbaar */ }

  // 2. Meerwerk-offerteregels (chapters met additionalWork=true).
  const offerteRegels: Bouw7MeerwerkOfferteRegel[] = []
  try {
    const lijst = await client.get<{ items?: Bouw7Quotation[] }>('/list/quotations', {
      q: `project.id = ${bouw7Id} SORT(quotationDate, DESC) LIMIT 50`,
    })
    const quotations = lijst.items ?? []
    const details = await Promise.all(
      quotations.map(q => client.get<Bouw7QuotationDetail>(`/quotation/${q.id}`).catch(() => null)),
    )
    quotations.forEach((q, i) => {
      const d = details[i]
      if (!d) return
      for (const ch of d.chapters ?? []) {
        if (!ch.additionalWork) continue
        for (const ln of ch.lines ?? []) {
          const sleutel = `offerte:${q.id}:${ln.id}`
          offerteRegels.push({
            sleutel,
            quotationId: q.id,
            lineId: ln.id,
            quotationNummer: q.quotationNumber ?? null,
            omschrijving: ln.description?.trim() || ch.name?.trim() || 'Meerwerk',
            aantal: ln.quantity != null ? num(ln.quantity) : null,
            eenheid: ln.unit ?? null,
            prijs: ln.price != null ? num(ln.price) : null,
            bedrag: rond(num(ln.subtotal)),
            btwPct: ln.vatTariffPercentage != null ? num(ln.vatTariffPercentage) : null,
            alGeimporteerd: geimporteerd.has(sleutel),
          })
        }
      }
    })
  } catch { /* offertes niet beschikbaar */ }

  return { beschikbaar: perCode.length > 0 || offerteRegels.length > 0, perCode, offerteRegels }
}

export type ImporteerMeerwerkItem = {
  bron: 'bouw7_code' | 'bouw7_offerte'
  sleutel: string
  omschrijving: string
  bedrag: number
  bewakingscode?: string | null
  bouw7ChapterId?: number | null
  eenheid?: string | null
  eenheidsprijs?: number | null
  aantal?: number | null
  btwPct?: number | null
}

/**
 * Importeert één bestaand Bouw7-meerwerk als bewerkbare EVA-regel (status 'aangevraagd'). Dedupe op
 * bronsleutel — dubbel importeren geeft de bestaande regel terug. Voor per-code-import wordt de
 * bestaande bewakingscode + hoofdstuk meegenomen, zodat een latere 'akkoord' geen dubbele code aanmaakt.
 */
export async function importeerBouw7Meerwerk(
  dossierId: string,
  item: ImporteerMeerwerkItem,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any

  const { data: bestaand } = await supabase
    .from('meerwerk_regels')
    .select('id')
    .eq('dossier_id', dossierId)
    .eq('bouw7_bron_sleutel', item.sleutel)
    .maybeSingle()
  if (bestaand) return { ok: true, id: bestaand.id }

  const { data: maxRow } = await supabase
    .from('meerwerk_regels')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  const { data: ins, error } = await supabase
    .from('meerwerk_regels')
    .insert({
      dossier_id: dossierId,
      volgnummer,
      omschrijving: item.omschrijving,
      afrekenwijze: 'aangenomen',
      is_stelpost: false,
      bedrag_excl_btw: item.bedrag,
      eenheid: item.eenheid ?? null,
      eenheidsprijs: item.eenheidsprijs ?? null,
      btw_pct: item.btwPct ?? null,
      bewakingscode: item.bewakingscode ?? null,
      bouw7_chapter_id: item.bouw7ChapterId ?? null,
      bron: item.bron,
      bouw7_bron_sleutel: item.sleutel,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${dossierId}/meerwerk`)
  return { ok: true, id: ins.id }
}
