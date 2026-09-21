/**
 * dossiers/meerwerk-werkbegroting.ts
 *
 * Haalt de calculatieregels van goedgekeurd meerwerk over naar de werkbegroting van het dossier.
 *
 * Waarom dit bestand bestaat: een meerwerk-calculatie is een eigen scenario in het
 * dossier-calculatieproject (`scenario.meerwerk_regel_id`, zie `maakMeerwerkScenario`), terwijl de
 * werkbegroting uit precies één scenario wordt opgebouwd — het standaardscenario
 * (`maakWerkbegrotingVanCalculatie`). Daardoor viel het meerwerk er structureel buiten: bij akkoord
 * kreeg je wél een bewakingscode (MW01) en dus een groepskop in de werkbegroting, maar geen enkele
 * regel eronder. De kostprijs was al uitgerekend en moest met de hand worden overgetypt.
 *
 * De kopie hangt aan de bewakingscode van het meerwerk: `kostengroep` krijgt exact het label dat de
 * werkbegroting voor de groepskop gebruikt ("MW01 — omschrijving"), zodat de lege kop de gevulde kop
 * wordt en de regels langs de normale weg als bestelregels onder die code in Bouw7 belanden.
 *
 * Idempotentie zit op `meerwerk_regels.wb_overgehaald_op`, niet op de aanwezigheid van de regels:
 * een regel die de calculator bewust uit de werkbegroting haalde mag bij de volgende inhaalslag niet
 * terugkomen.
 */

import { createAdminClient } from '@everts/database/server'
import { isTekstregel } from '@/lib/everts-calc/types'
import type { Scenario, Groep, Calculatieregel, Componentregel } from '@/lib/everts-calc/types'

/** De vorm van `calculatie_snapshots.data` voor zover hier nodig. */
type SnapshotVorm = {
  scenarios?: Scenario[]
  groepen?: Groep[]
  regels?: Calculatieregel[]
  componenten?: Componentregel[]
}

/** Waarom er niets is overgehaald. Geen van deze is een fout — er valt alleen niets te doen. */
export type OvernameReden =
  | 'al-overgehaald'
  | 'niet-goedgekeurd'
  | 'geen-bewakingscode'
  | 'geen-calculatieproject'
  | 'geen-meerwerkcalculatie'
  | 'geen-werkbegroting'
  | 'geen-regels'

export type MeerwerkOvernameResultaat =
  | { ok: true; regels: number; reden?: OvernameReden }
  | { ok: false; error: string }

/** Statussen waarin het meerwerk daadwerkelijk uitgevoerd wordt en dus begroot moet worden. */
const GOEDGEKEURD = ['akkoord', 'voltooid']

/**
 * Kostengroep-label. Moet teken voor teken gelijk zijn aan wat de werkbegroting voor de groepskop
 * van een eigen bewakingscode maakt (`kostengroepLabel` in WerkbegrotingGrid, gevoed door
 * `leesEigenBewakingscodes`) — inclusief de em-dash. Wijkt het af, dan staan er twee koppen voor
 * dezelfde code.
 */
function kostengroepLabel(code: string, omschrijving: string | null): string {
  const naam = (omschrijving ?? '').trim() || code
  return `${code} — ${naam}`
}

/** `.in()` in behapbare brokken, zodat een lange calculatie de query niet opblaast. */
async function inBrokken<T>(ids: string[], fn: (brok: string[]) => Promise<T[]>): Promise<T[]> {
  const uit: T[] = []
  for (let i = 0; i < ids.length; i += 200) uit.push(...await fn(ids.slice(i, i + 200)))
  return uit
}

/**
 * Kopieert regels + componenten van de meerwerk-calculatie naar de werkbegroting van het dossier.
 *
 * Best effort van opzet: elke "hier valt niets te halen"-situatie (geen calculatie gemaakt, nog geen
 * werkbegroting, geen bewakingscode) geeft `ok: true` met een reden terug en laat
 * `wb_overgehaald_op` leeg, zodat de inhaalslag het alsnog oppakt zodra het wél kan.
 */
export async function haalMeerwerkNaarWerkbegroting(regelId: string): Promise<MeerwerkOvernameResultaat> {
  const db = createAdminClient()

  const { data: regel, error: leesFout } = await db
    .from('meerwerk_regels')
    .select('id, dossier_id, status, bewakingscode, omschrijving, wb_overgehaald_op')
    .eq('id', regelId)
    .maybeSingle()
  if (leesFout) return { ok: false, error: leesFout.message }
  if (!regel) return { ok: false, error: 'Meerwerkregel niet gevonden.' }

  if (regel.wb_overgehaald_op) return { ok: true, regels: 0, reden: 'al-overgehaald' }
  if (!GOEDGEKEURD.includes(regel.status)) return { ok: true, regels: 0, reden: 'niet-goedgekeurd' }
  // Zonder bewakingscode is er geen kostengroep om de regels onder te hangen; ze zouden als
  // groeploze rijen in de werkbegroting opduiken en nergens op bewaakt worden.
  const code = (regel.bewakingscode ?? '').trim()
  if (!code) return { ok: true, regels: 0, reden: 'geen-bewakingscode' }

  const { data: dossier } = await db
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', regel.dossier_id)
    .maybeSingle()
  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) return { ok: true, regels: 0, reden: 'geen-calculatieproject' }

  const { data: snapRij } = await db
    .from('calculatie_snapshots')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle()
  const snap = (snapRij?.data ?? null) as SnapshotVorm | null
  if (!snap) return { ok: true, regels: 0, reden: 'geen-meerwerkcalculatie' }

  const scenario = (snap.scenarios ?? []).find(s => s.meerwerk_regel_id === regelId)
  if (!scenario) return { ok: true, regels: 0, reden: 'geen-meerwerkcalculatie' }

  const groepIds = new Set((snap.groepen ?? []).filter(g => g.scenario_id === scenario.id).map(g => g.id))
  // Tekstregels blijven achter in de calculatie: ze horen bij de offerte, niet bij de uitvoering.
  // Zelfde afweging als in `maakWerkbegrotingVanCalculatie`.
  const calcRegels = (snap.regels ?? [])
    .filter(r => groepIds.has(r.groep_id) && !isTekstregel(r))
    .sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0))
  if (calcRegels.length === 0) return { ok: true, regels: 0, reden: 'geen-regels' }

  const { data: wbRij } = await db
    .from('werkbegrotingen')
    .select('id')
    .eq('dossier_id', regel.dossier_id)
    .order('bijgewerkt_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!wbRij) return { ok: true, regels: 0, reden: 'geen-werkbegroting' }

  // Al aanwezig (ook als soft-deleted): niet nog eens toevoegen. Begrensd op de source-ids die we
  // zelf willen schrijven, dus nooit een onbegrensde select op een grote werkbegroting.
  const calcIds = calcRegels.map(r => r.id)
  const bestaand = await inBrokken(calcIds, async brok => {
    const { data } = await db
      .from('werkbegroting_regels')
      .select('source_calculatieregel_id')
      .eq('werkbegroting_id', wbRij.id)
      .in('source_calculatieregel_id', brok)
    return (data ?? []) as { source_calculatieregel_id: string | null }[]
  })
  const alAanwezig = new Set(bestaand.map(r => r.source_calculatieregel_id).filter(Boolean) as string[])
  const teKopieren = calcRegels.filter(r => !alAanwezig.has(r.id))

  const nu = new Date().toISOString()
  const kostengroep = kostengroepLabel(code, regel.omschrijving)

  if (teKopieren.length > 0) {
    const { data: hoogste } = await db
      .from('werkbegroting_regels')
      .select('volgorde')
      .eq('werkbegroting_id', wbRij.id)
      .order('volgorde', { ascending: false })
      .limit(1)
      .maybeSingle()
    let volgorde = Number(hoogste?.volgorde ?? 0)

    const nieuweRegels = teKopieren.map(r => ({
      id: crypto.randomUUID(),
      werkbegroting_id: wbRij.id as string,
      source_calculatieregel_id: r.id,
      // De calculatiegroep hoort bij het meerwerk-scenario, niet bij het scenario van deze
      // werkbegroting; meenemen zou de regel onder een vreemde groepskop hangen. De kostengroep
      // (= bewakingscode) is hier de groepering.
      groep_id: null,
      omschrijving: r.omschrijving ?? '',
      hoeveelheid: r.hoeveelheid ?? 0,
      eenheid: r.eenheid ?? 'st',
      kostengroep,
      volgorde: ++volgorde,
      opslag_pct: r.opslag_pct ?? null,
      btw_pct: r.btw_pct ?? null,
      btw_tarief_id: r.btw_tarief_id ?? null,
      opmerking: r.opmerking ?? null,
      is_stelpost: r.is_stelpost ?? false,
      is_verwijderd: false,
      aangemaakt_op: nu,
      bijgewerkt_op: nu,
    }))
    const { error: regelFout } = await db.from('werkbegroting_regels').insert(nieuweRegels)
    if (regelFout) return { ok: false, error: `Regels overhalen mislukt: ${regelFout.message}` }

    const wbIdPerCalcId = new Map(nieuweRegels.map(r => [r.source_calculatieregel_id, r.id]))
    const nieuweComponenten = (snap.componenten ?? [])
      .filter(c => wbIdPerCalcId.has(c.calculatieregel_id))
      .map(c => ({
        id: crypto.randomUUID(),
        werkbegroting_regel_id: wbIdPerCalcId.get(c.calculatieregel_id) as string,
        source_component_id: c.id,
        type: c.type,
        norm_hoeveelheid: c.norm_hoeveelheid ?? 0,
        // Arbeid rekent altijd in uren; de calculatie laat die eenheid soms leeg.
        eenheid: c.type === 'arbeid' ? 'uur' : (c.eenheid ?? null),
        tarief: c.tarief ?? 0,
        opslag_pct: c.opslag_pct ?? null,
        omschrijving: c.omschrijving ?? null,
        leverancier_naam: c.leverancier ?? null,
        aannemersnaam: c.aannemersnaam ?? null,
        offertenummer: c.offertenummer ?? null,
        is_verwijderd: false,
        aangemaakt_op: nu,
        bijgewerkt_op: nu,
      }))
    if (nieuweComponenten.length > 0) {
      const { error: compFout } = await db.from('werkbegroting_componenten').insert(nieuweComponenten)
      if (compFout) return { ok: false, error: `Componenten overhalen mislukt: ${compFout.message}` }
    }
  }

  await db
    .from('meerwerk_regels')
    .update({ wb_overgehaald_op: nu, updated_at: nu })
    .eq('id', regelId)

  return { ok: true, regels: teKopieren.length }
}

/**
 * De overname zoals `setMeerwerkStatus` hem bij akkoord aanroept: nooit gooiend, en met de tekst die
 * de gebruiker te zien krijgt. Zit hier en niet in de aanroeper zodat die de afweging niet hoeft te
 * kennen — de overname mag een akkoord nooit blokkeren.
 */
export async function overnameBijAkkoord(
  regelId: string,
): Promise<{ melding?: string; waarschuwing?: string }> {
  try {
    const res = await haalMeerwerkNaarWerkbegroting(regelId)
    if (!res.ok) return { waarschuwing: `Calculatie niet naar de werkbegroting overgehaald: ${res.error}` }
    if (res.regels === 0) return {}
    return {
      melding: res.regels === 1
        ? 'Calculatieregel overgehaald naar de werkbegroting'
        : `${res.regels} calculatieregels overgehaald naar de werkbegroting`,
    }
  } catch (e) {
    return { waarschuwing: `Calculatie niet naar de werkbegroting overgehaald: ${e instanceof Error ? e.message : ''}` }
  }
}

/**
 * Inhaalslag voor een heel dossier: haalt elk goedgekeurd meerwerk over dat nog niet is overgehaald.
 *
 * Draait bij het openen van de werkbegroting. Nodig omdat het akkoord ook kan vallen voordat de
 * werkbegroting überhaupt bestaat — dan is er nog niets om regels in te zetten — en het dekt
 * meerwerk dat al akkoord stond voordat deze overname er was.
 */
export async function haalGoedgekeurdMeerwerkNaarWerkbegroting(
  dossierId: string,
): Promise<{ regels: number }> {
  const db = createAdminClient()
  const { data } = await db
    .from('meerwerk_regels')
    .select('id')
    .eq('dossier_id', dossierId)
    .in('status', GOEDGEKEURD)
    .not('bewakingscode', 'is', null)
    .is('wb_overgehaald_op', null)
    .order('volgnummer', { ascending: true })

  let regels = 0
  for (const r of ((data ?? []) as { id: string }[])) {
    const res = await haalMeerwerkNaarWerkbegroting(r.id)
    if (res.ok) regels += res.regels
  }
  return { regels }
}
