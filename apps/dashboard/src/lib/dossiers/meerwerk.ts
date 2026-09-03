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
import { bouw7VoorDossier, koppelCalculatieProject } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { maakMeerwerkBewakingscodeBouw7 } from '@/app/(platform)/everts-calc/actions/werkbegroting'

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
  totalen: {
    aantal: number
    /** Aantal regels dat als goedgekeurd meetelt — bepaalt óf EVA leidend is, los van het bedrag. */
    goedgekeurdAantal: number
    goedgekeurdExcl: number
    goedgekeurdIncl: number
  }
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
  let goedgekeurdAantal = 0
  const views: MeerwerkRegelView[] = regels.map(r => {
    const excl = effectiefExcl(r, regiePerCode)
    const btwPct = r.btw_pct != null ? Number(r.btw_pct) : 21
    const incl = rond(excl * (1 + btwPct / 100))
    if (GOEDGEKEURD.includes(r.status)) { goedgekeurdExcl += excl; goedgekeurdIncl += incl; goedgekeurdAantal++ }
    return { ...r, effectiefExcl: excl, effectiefIncl: incl, btwEffectief: btwPct }
  })

  return {
    regels: views,
    totalen: {
      aantal: regels.length,
      goedgekeurdAantal,
      goedgekeurdExcl: rond(goedgekeurdExcl),
      goedgekeurdIncl: rond(goedgekeurdIncl),
    },
  }
}

/**
 * Compacte som van goedgekeurd meerwerk (excl. btw) plus het aantal regels waarop die som rust.
 *
 * Het aantal is nodig om te bepalen óf EVA leidend is boven het Bouw7-aggregaat. Op het bedrag
 * alleen afgaan gaat mis bij netto **minderwerk**: een som van bijvoorbeeld −€ 48.000 betekent niet
 * "geen EVA-regels", maar "per saldo minder werk", en dat hoort het contracttotaal te verlagen.
 */
export async function getGoedgekeurdMeerwerk(
  dossierId: string,
): Promise<{ excl: number; aantal: number }> {
  const { totalen } = await getDossierMeerwerk(dossierId)
  return { excl: totalen.goedgekeurdExcl, aantal: totalen.goedgekeurdAantal }
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
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { data: maxRow } = await supabase
    .from('meerwerk_regels')
    .select('volgnummer')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const volgnummer = (maxRow?.volgnummer ?? 0) + 1

  // Bewakingscode wordt bewust NIET hier aangemaakt — dat gebeurt pas bij status 'akkoord'
  // (zie setMeerwerkStatus). Zo staan er geen losse codes in Bouw7 voor nog niet goedgekeurd meerwerk.
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
): Promise<{ ok: true; waarschuwing?: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: bestaand } = await supabase.from('meerwerk_regels').select('*').eq('id', id).single()
  if (bestaand?.dossier_id) await assertDossierBewerkbaar(bestaand.dossier_id)
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

  // Twee-weg: een bewerkte EVA-eigen regel die aan een Bouw7-meerwerkregel hangt terugschrijven naar Bouw7.
  // Geïmporteerde regels (bron='bouw7_line') niet — daar is Bouw7 leidend en de sync overschrijft toch.
  let waarschuwing: string | undefined
  if (bestaand?.bron === 'eva' && bestaand.bouw7_line_id != null) {
    const res = await updateMeerwerkInBouw7({ ...(bestaand as MeerwerkRegel), ...(velden as Partial<MeerwerkRegel>) })
    if (!res.ok) waarschuwing = `Wijziging in EVA opgeslagen, maar terugschrijven naar Bouw7 mislukt: ${res.error}`
  }

  revalidatePath(`/opdrachten/${row.dossier_id}/meerwerk`)
  return { ok: true, waarschuwing }
}

export async function verwijderMeerwerkRegel(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: row } = await supabase.from('meerwerk_regels').select('dossier_id').eq('id', id).single()
  if (row?.dossier_id) await assertDossierBewerkbaar(row.dossier_id)
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
  await assertDossierBewerkbaar(r.dossier_id)

  if (r.status !== status && !TRANSITIES[r.status].includes(status)) {
    return { ok: false, error: `Ongeldige statusovergang: ${r.status} → ${status}.` }
  }

  const velden: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'afgewezen') velden.afgewezen_reden = opts?.afgewezenReden ?? null
  if (opts?.termijnWijze !== undefined) velden.termijn_wijze = opts.termijnWijze

  let waarschuwing: string | undefined

  // Fallback/retry bij akkoord: normaal is de bewakingscode al bij het aanmaken van de regel gezet.
  // De guard bouw7_chapter_id == null voorkomt dubbel aanmaken; alleen voor EVA-native regels zonder
  // Bouw7-koppeling (geïmporteerde/teruggeschreven Bouw7-meerwerkregels krijgen er geen).
  if (status === 'akkoord' && r.bron === 'eva' && r.bouw7_line_id == null && r.bouw7_chapter_id == null) {
    const code = `MW${String(r.volgnummer).padStart(2, '0')}`
    // Seed-bedrag: alleen zinvol bij aangenomen/handmatig (regie-bedrag is op dit moment nog 0).
    const bedrag = r.afrekenwijze === 'aangenomen' && !r.is_stelpost ? (Number(r.bedrag_excl_btw) || null) : null
    const res = await maakMeerwerkBewakingscodeBouw7(r.dossier_id, { code, naam: r.omschrijving, bedrag })
    if (res.ok) {
      velden.bewakingscode = code
      velden.bouw7_chapter_id = res.chapterId
      velden.bouw7_security_code_id = res.pslId
      if (res.waarschuwing) waarschuwing = res.waarschuwing
    } else {
      // Bouw7-write mislukt → statuswijziging gaat door; code lokaal vastleggen zodat EVA hem toont.
      velden.bewakingscode = code
      waarschuwing = `Status op Akkoord gezet, maar bewakingscode in Bouw7 aanmaken mislukt: ${res.error}`
    }
  }

  const { error } = await supabase.from('meerwerk_regels').update(velden).eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Statuswijziging terugschrijven naar Bouw7 als de regel aan een Bouw7-meerwerkregel hangt.
  if (r.bouw7_line_id != null) {
    const res = await updateMeerwerkInBouw7({ ...r, ...(velden as Partial<MeerwerkRegel>), status })
    if (!res.ok) {
      waarschuwing = [waarschuwing, `Status in EVA bijgewerkt, maar terugschrijven naar Bouw7 mislukt: ${res.error}`]
        .filter(Boolean).join(' ')
    }
  }

  revalidatePath(`/opdrachten/${r.dossier_id}/meerwerk`)
  return { ok: true, waarschuwing }
}

/**
 * Zorgt dat het **dossier-calculatieproject** bestaat en geeft het project-id terug — géén apart
 * project en géén offerte. De meerwerk-calculatie is een scenario ín dit dossier-project (gemarkeerd
 * met meerwerk_regel_id, zie `maakMeerwerkScenario`), zodat hij onder het Calculatie-tab terugkomt.
 * De client maakt/opent dat scenario en maakt er via de normale flow (lay-out-keuze) de offerte van.
 */
export async function maakMeerwerkCalculatie(
  regelId: string,
): Promise<{ ok: true; projectId: string; dossierId: string; omschrijving: string } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: regel } = await supabase
    .from('meerwerk_regels')
    .select('id, dossier_id, omschrijving')
    .eq('id', regelId)
    .single()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  await assertDossierBewerkbaar(regel.dossier_id)

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', regel.dossier_id)
    .single()
  let projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) {
    // Geen dossier-calculatieproject? Zelf aanmaken en koppelen (idempotent).
    const kp = await koppelCalculatieProject(regel.dossier_id)
    if (!kp.ok) return { ok: false, error: kp.error }
    projectId = kp.projectId
  }

  return { ok: true, projectId, dossierId: regel.dossier_id, omschrijving: regel.omschrijving }
}

// ─── Nieuwe meerwerkregel naar Bouw7 schrijven (POST additional-work-line) ─────

/** EVA-status → Bouw7-meerwerkstatus. */
const EVA_STATUS_NAAR_BOUW7: Record<MeerwerkStatus, number> = {
  aangevraagd: 0,        // Geregistreerd
  offerte_verstuurd: 0,  // (geen Bouw7-equivalent) → Geregistreerd
  akkoord: 1,            // Akkoord
  afgewezen: 2,          // Niet akkoord
  voltooid: 3,           // Opgeleverd
}

/**
 * Bouwt de Bouw7 additional-work-line-body uit een EVA-regel. `executor` (Aangevraagd door) = de
 * Bouw7-klant van het dossier; ontbreekt die, dan wordt het veld weggelaten (leeg in Bouw7).
 * `id` wordt door de aanroeper toegevoegd bij een update.
 */
async function bouwBouw7MeerwerkBody(regel: MeerwerkRegel): Promise<Record<string, unknown>> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('klant:relaties(bouw7_id)')
    .eq('id', regel.dossier_id)
    .single()
  const executorId = dossier?.klant?.bouw7_id

  const mw = await getDossierMeerwerk(regel.dossier_id)
  const view = mw.regels.find(r => r.id === regel.id)
  const verkoop = rond(view?.effectiefExcl ?? (Number(regel.bedrag_excl_btw) || 0))
  const begroot = rond(regel.begroot_bedrag != null ? Number(regel.begroot_bedrag) : 0)

  const body: Record<string, unknown> = {
    description: regel.omschrijving,
    cost: String(verkoop),
    budgetAmount: String(begroot),
    date: (regel.created_at ? String(regel.created_at) : new Date().toISOString()).slice(0, 10),
    // Bouw7 valideert `note` als NotBlank (leeg/ontbrekend => 400). Zonder factuurreferentie
    // vullen we daarom de omschrijving in.
    note: regel.factuurreferentie?.trim() || regel.omschrijving?.trim() || 'Meerwerk',
    status: EVA_STATUS_NAAR_BOUW7[regel.status] ?? 0,
    isProvisional: !!regel.is_stelpost,
  }
  if (executorId) body.executor = { id: Number(executorId) }
  return body
}

/**
 * Schrijft een EVA-meerwerkregel als echte meerwerkregel naar Bouw7
 * (`POST /project/{projectId}/additional-work-line`, Heimdall — upsert; `id` weggelaten = create).
 * Na aanmaken worden het teruggegeven Bouw7-id + MW-nummer op de EVA-regel vastgelegd (en de
 * bronsleutel, tegen dubbele import). Regels die al aan een Bouw7-regel hangen worden overgeslagen.
 */
export async function stuurMeerwerkNaarBouw7(
  regelId: string,
): Promise<{ ok: true; nummer: string | null } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: regel } = await supabase.from('meerwerk_regels').select('*').eq('id', regelId).single()
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }
  await assertDossierBewerkbaar(regel.dossier_id)
  if (regel.bouw7_line_id) return { ok: true, nummer: regel.bouw7_nummer ?? null }

  const ctx = await bouw7VoorDossier(regel.dossier_id)
  if (!ctx) return { ok: false, error: 'Dossier is niet aan een Bouw7-project gekoppeld.' }
  const { client, bouw7Id } = ctx

  const body = await bouwBouw7MeerwerkBody(regel as MeerwerkRegel)

  let created: { id?: number; number?: string }
  try {
    created = await client.post<{ id?: number; number?: string }>(`/project/${bouw7Id}/additional-work-line`, body)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Aanmaken in Bouw7 mislukt.' }
  }
  if (!created?.id) return { ok: false, error: 'Bouw7 gaf geen meerwerkregel-id terug.' }

  await supabase
    .from('meerwerk_regels')
    .update({
      bouw7_line_id: created.id,
      bouw7_nummer: created.number ?? null,
      bouw7_bron_sleutel: `line:${created.id}`,
      updated_at: new Date().toISOString(),
    })
    .eq('id', regelId)

  revalidatePath(`/opdrachten/${regel.dossier_id}/meerwerk`)
  return { ok: true, nummer: created.number ?? null }
}

/**
 * Werkt een al aan Bouw7 gekoppelde meerwerkregel bij (zelfde POST-endpoint mét `id` = update in het
 * Bouw7-upsertpatroon). Gebruikt voor het terugschrijven van o.a. statuswijzigingen. Best effort.
 */
async function updateMeerwerkInBouw7(regel: MeerwerkRegel): Promise<{ ok: boolean; error?: string }> {
  if (regel.bouw7_line_id == null) return { ok: true }
  const ctx = await bouw7VoorDossier(regel.dossier_id)
  if (!ctx) return { ok: false, error: 'Geen Bouw7-koppeling.' }
  const body = await bouwBouw7MeerwerkBody(regel)
  body.id = regel.bouw7_line_id
  try {
    await ctx.client.post(`/project/${ctx.bouw7Id}/additional-work-line`, body)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Bouw7-update mislukt.' }
  }
}
