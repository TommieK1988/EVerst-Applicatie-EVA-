'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { OpdrachtOnderdeel } from '@everts/database'
import { getDossierBewaking } from './actions'
import { assertDossierBewerkbaar } from './guards'
import { getDossierMeerwerk } from './meerwerk'

/* ─── helpers ─────────────────────────────────────────────────────── */
const rond = (n: number): number => Math.round(n * 100) / 100
const num = (v: unknown): number => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  if (typeof v === 'string') { const n = parseFloat(v); return Number.isFinite(n) ? n : 0 }
  return 0
}

/* ─── views ───────────────────────────────────────────────────────── */
export type OpdrachtStelpostView = {
  id: string
  omschrijving: string
  bedrag_excl_btw: number | null
  in_opdracht: boolean
  bewakingscode: string | null
  /** Live bewaking (alleen gevuld zodra er een bewakingscode is toegekend). */
  begroot: number | null
  prognose: number | null
  geboekt: number | null
  progress: number | null
}
export type OpdrachtOptieView = {
  id: string
  omschrijving: string
  bedrag_excl_btw: number | null
  in_opdracht: boolean
}
export type OpdrachtMeerwerkView = {
  id: string
  omschrijving: string
  bedrag_excl_btw: number
}
export type OpdrachtOverzicht = {
  /** Aanneemsom excl. btw uit de hoofd-offerte (bevat stelposten alleen als stelposten_in_totaal aan staat). */
  aanneemsom: number | null
  /** Aanneemsom mét de stelposten erin (ongeacht stelposten_in_totaal) — de orderbasis. */
  aanneemsomInclStelposten: number | null
  /** Basisscope = aanneemsom-incl-stelposten − som stelposten (het niet-stelpost-werk). */
  basis: number | null
  /** Zitten de stelposten in de aanneemsom (quote.stelposten_in_totaal)? Zo niet: apart factureren. */
  stelpostenInAanneemsom: boolean
  stelposten: OpdrachtStelpostView[]
  opties: OpdrachtOptieView[]
  stelpostenTotaal: number
  /** Alle opties (gekozen + niet-gekozen). */
  optiesTotaal: number
  /** Alleen de opties die in opdracht zijn. */
  gekozenOptiesTotaal: number
  /** Goedgekeurde (akkoord/voltooid) meerwerkregels van het dossier. */
  meerwerken: OpdrachtMeerwerkView[]
  meerwerkTotaal: number
}

/** Hoofd-offerte (geen meerwerk-offerte) van een calculatieproject; nieuwste eerst. */
async function vindHoofdOfferte(
  supabase: any,
  projectId: string,
): Promise<{ id: string; subtotaal_ex_btw: number | null; stelposten_in_totaal: boolean | null } | null> {
  const { data } = await supabase
    .from('quotes')
    .select('id, subtotaal_ex_btw, stelposten_in_totaal, meerwerk_regel_id')
    .eq('project_id', projectId)
    .is('meerwerk_regel_id', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ?? null
}

/**
 * Seedt de opdracht-samenstelling uit de geaccepteerde offerte: één rij per stelpost-regel
 * (`quote_lines.is_stelpost`, in opdracht) en één rij per optionele sectie
 * (`quote_sections.is_optioneel`, standaard niet in opdracht). Idempotent — bestaande rijen
 * (op quote_line_id / quote_section_id) blijven ongemoeid, nieuwe posten worden toegevoegd.
 * Best effort: een fout blokkeert het tonen van het overzicht niet.
 */
export async function seedOpdrachtOnderdelen(dossierId: string): Promise<void> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossierId)
    .maybeSingle()
  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) return

  const quote = await vindHoofdOfferte(supabase, projectId)
  if (!quote) return

  // Al aanwezige herkomst-verwijzingen, zodat we alleen ontbrekende posten toevoegen.
  const { data: bestaand } = await supabase
    .from('opdracht_onderdelen')
    .select('quote_line_id, quote_section_id')
    .eq('dossier_id', dossierId)
  const gehadLines = new Set<string>((bestaand ?? []).map((r: any) => r.quote_line_id).filter(Boolean))
  const gehadSecties = new Set<string>((bestaand ?? []).map((r: any) => r.quote_section_id).filter(Boolean))

  const [{ data: stelpostLines }, { data: optieSecties }] = await Promise.all([
    supabase.from('quote_lines')
      .select('id, omschrijving, line_total, btw_pct')
      .eq('quote_id', quote.id)
      .eq('is_stelpost', true),
    supabase.from('quote_sections')
      .select('id, naam, subtotaal, nummer')
      .eq('quote_id', quote.id)
      .eq('is_optioneel', true),
  ])

  const rijen: Record<string, unknown>[] = []
  let vn = 1
  for (const l of (stelpostLines ?? []) as any[]) {
    if (gehadLines.has(l.id)) continue
    rijen.push({
      dossier_id: dossierId, quote_id: quote.id, soort: 'stelpost',
      quote_line_id: l.id, omschrijving: (l.omschrijving?.trim() || 'Stelpost'),
      volgnummer: vn++, in_opdracht: true,
      bedrag_excl_btw: rond(num(l.line_total)),
      btw_pct: l.btw_pct != null ? num(l.btw_pct) : null,
    })
  }
  vn = 1
  for (const s of (optieSecties ?? []) as any[]) {
    if (gehadSecties.has(s.id)) continue
    rijen.push({
      dossier_id: dossierId, quote_id: quote.id, soort: 'optie',
      quote_section_id: s.id, omschrijving: (s.naam?.trim() || 'Optie'),
      volgnummer: vn++, in_opdracht: false,
      bedrag_excl_btw: rond(num(s.subtotaal)), btw_pct: null,
    })
  }
  if (!rijen.length) return
  // Best effort: bij een race kan de unique-index (dossier+line/sectie) een dubbele insert weigeren.
  try { await supabase.from('opdracht_onderdelen').insert(rijen) } catch { /* genegeerd */ }
}

/**
 * Opdracht-samenstelling + live bewaking voor het Financiële-totalen-blok. Seedt eerst (idempotent)
 * en leest daarna de onderdelen. De begroot/werkelijk-bewaking wordt alleen live uit Bouw7 gehaald
 * zodra er stelposten met een bewakingscode zijn (voorkomt een zware call op elke Informatie-render).
 * Geeft null terug als het dossier geen calculatie/hoofd-offerte heeft.
 */
export async function getOpdrachtOverzicht(dossierId: string): Promise<OpdrachtOverzicht | null> {
  const supabase = createAdminClient() as any
  const { data: dossier } = await supabase
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossierId)
    .maybeSingle()
  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) return null

  const quote = await vindHoofdOfferte(supabase, projectId)
  if (!quote) return null

  await seedOpdrachtOnderdelen(dossierId)

  const { data: onderdelen } = await supabase
    .from('opdracht_onderdelen')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('volgnummer', { ascending: true })
  const rows = (onderdelen ?? []) as OpdrachtOnderdeel[]

  // Live bewaking per bewakingscode — alleen als er codes zijn toegekend.
  const heeftCodes = rows.some(r => r.soort === 'stelpost' && !!r.bewakingscode)
  const perCode = new Map<string, { begroot: number; prognose: number; geboekt: number; progress: number | null }>()
  if (heeftCodes) {
    const bewaking = await getDossierBewaking(dossierId).catch(() => null)
    if (bewaking) {
      for (const h of bewaking.hoofdstukken) {
        for (const r of h.regels) {
          if (!r.code) continue
          perCode.set(r.code, { begroot: r.begroot, prognose: r.prognose, geboekt: r.geboekteKosten, progress: r.progress })
        }
      }
    }
  }

  const stelposten: OpdrachtStelpostView[] = rows
    .filter(r => r.soort === 'stelpost')
    .map(r => {
      const bw = r.bewakingscode ? perCode.get(r.bewakingscode) : undefined
      return {
        id: r.id, omschrijving: r.omschrijving,
        bedrag_excl_btw: r.bedrag_excl_btw != null ? num(r.bedrag_excl_btw) : null,
        in_opdracht: r.in_opdracht, bewakingscode: r.bewakingscode,
        begroot: bw?.begroot ?? null, prognose: bw?.prognose ?? null,
        geboekt: bw?.geboekt ?? null, progress: bw?.progress ?? null,
      }
    })
  const opties: OpdrachtOptieView[] = rows
    .filter(r => r.soort === 'optie')
    .map(r => ({
      id: r.id, omschrijving: r.omschrijving,
      bedrag_excl_btw: r.bedrag_excl_btw != null ? num(r.bedrag_excl_btw) : null,
      in_opdracht: r.in_opdracht,
    }))

  const aanneemsom = quote.subtotaal_ex_btw != null ? num(quote.subtotaal_ex_btw) : null
  const stelpostenTotaal = rond(stelposten.reduce((s, x) => s + num(x.bedrag_excl_btw), 0))
  // Stelposten zitten in de aanneemsom als de offerte dat zo instelt (default true). Zo niet, staan ze
  // erbuiten en moeten ze apart worden gefactureerd — dan telt aanneemsomInclStelposten ze wél mee als
  // orderbasis, zodat contracttotaal en opsomming kloppen.
  const stelpostenInAanneemsom = quote.stelposten_in_totaal ?? true
  const aanneemsomInclStelposten = aanneemsom == null
    ? null
    : rond(stelpostenInAanneemsom ? aanneemsom : aanneemsom + stelpostenTotaal)
  const basis = aanneemsomInclStelposten == null ? null : rond(aanneemsomInclStelposten - stelpostenTotaal)
  const optiesTotaal = rond(opties.reduce((s, x) => s + num(x.bedrag_excl_btw), 0))
  const gekozenOptiesTotaal = rond(opties.filter(o => o.in_opdracht).reduce((s, x) => s + num(x.bedrag_excl_btw), 0))

  // Goedgekeurde (akkoord/voltooid) meerwerkregels, itemized voor het blok.
  const mw = await getDossierMeerwerk(dossierId).catch(() => null)
  const meerwerken: OpdrachtMeerwerkView[] = (mw?.regels ?? [])
    .filter(r => r.status === 'akkoord' || r.status === 'voltooid')
    .map(r => ({ id: r.id, omschrijving: r.omschrijving, bedrag_excl_btw: rond(num(r.effectiefExcl)) }))
  const meerwerkTotaal = rond(mw?.totalen.goedgekeurdExcl ?? 0)

  return {
    aanneemsom, aanneemsomInclStelposten, basis, stelpostenInAanneemsom,
    stelposten, opties, stelpostenTotaal, optiesTotaal, gekozenOptiesTotaal,
    meerwerken, meerwerkTotaal,
  }
}

/**
 * Zet een optie wél/niet in de opdracht. Een aangezette optie telt daarna mee in het contracttotaal
 * (maar krijgt geen eigen bewakingscode). Respecteert afgesloten (alleen-lezen) dossiers.
 */
export async function zetOptieInOpdracht(
  onderdeelId: string,
  inOpdracht: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('dossier_id, soort')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Onderdeel niet gevonden.' }
  await assertDossierBewerkbaar(rij.dossier_id)
  const { error } = await supabase
    .from('opdracht_onderdelen')
    .update({ in_opdracht: inOpdracht, updated_at: new Date().toISOString() })
    .eq('id', onderdeelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  return { ok: true }
}

/**
 * Wijst elke stelpost zonder code een eigen kale bewakingscode toe (`SP01`, `SP02`, … op volgnummer).
 * Deze code gebruikt de calculator als **kostengroep** op de stelpost in de werkbegroting; het budget
 * loopt dan via de bestaande bestelregels+prognose "Naar Bouw7"-flow (geen dubbeltelling). Zodra de
 * PSL in Bouw7 bestaat verschijnt begroot/werkelijk vanzelf in het blok. Bestaande codes blijven staan.
 */
export async function wijsStelpostBewakingscodesToe(
  dossierId: string,
): Promise<{ ok: true; aantal: number } | { ok: false; error: string }> {
  await assertDossierBewerkbaar(dossierId)
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('opdracht_onderdelen')
    .select('id, volgnummer, bewakingscode')
    .eq('dossier_id', dossierId)
    .eq('soort', 'stelpost')
    .order('volgnummer', { ascending: true })
  const rows = (data ?? []) as { id: string; volgnummer: number; bewakingscode: string | null }[]

  let aantal = 0
  for (const r of rows) {
    if (r.bewakingscode && r.bewakingscode.trim()) continue
    const code = `SP${String(r.volgnummer).padStart(2, '0')}`
    const { error } = await supabase
      .from('opdracht_onderdelen')
      .update({ bewakingscode: code, updated_at: new Date().toISOString() })
      .eq('id', r.id)
    if (!error) aantal++
  }
  revalidatePath(`/opdrachten/${dossierId}/informatie`)
  return { ok: true, aantal }
}

/** Zet/wijzigt handmatig de bewakingscode van één stelpost (kale code, bijv. "SP01"). */
export async function zetStelpostBewakingscode(
  onderdeelId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient() as any
  const { data: rij } = await supabase
    .from('opdracht_onderdelen')
    .select('dossier_id, soort')
    .eq('id', onderdeelId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Onderdeel niet gevonden.' }
  if (rij.soort !== 'stelpost') return { ok: false, error: 'Alleen stelposten krijgen een bewakingscode.' }
  await assertDossierBewerkbaar(rij.dossier_id)
  const schoon = code.trim() || null
  const { error } = await supabase
    .from('opdracht_onderdelen')
    .update({ bewakingscode: schoon, updated_at: new Date().toISOString() })
    .eq('id', onderdeelId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${rij.dossier_id}/informatie`)
  return { ok: true }
}
