'use server'

/**
 * Serverkant van de calculatie-import: de opname klaarzetten, en achteraf vastleggen dat hij is
 * omgezet.
 *
 * De eigenlijke vertaling naar groepen/regels/componenten gebeurt CLIENT-side (zie
 * `naar-calculatie.ts` en de toelichting daar). Wat hier gebeurt is het werk dat op de server thuis
 * hoort: de regels lezen en de foto's tot compacte data-URL's persen.
 *
 * ── Waarom foto's een hard budget krijgen ────────────────────────────────────
 *
 * `Calculatieregel.werkomschrijving_afbeeldingen` is een array base64 data-URL's. Dat hele
 * calculatiemodel gaat bij ÉLKE autosave (debounce 1,5 s) als één JSONB-blob naar
 * `calculatie_snapshots`. Veertig regels met drie onverkleinde telefoonfoto's is tien megabyte die
 * dan elke anderhalve seconde heen en weer reist. Vandaar: alleen de hoofdfoto, fors verkleind, en
 * een plafond op het totaal — met een teller die eerlijk zegt hoeveel foto's het niet haalden.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Opname, OpnameRegel } from '@everts/database/opname-types'
import { vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import type { ImportRegel } from './naar-calculatie'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/** Ingesloten fotobreedte. Groter dan het houtrotrapport (380px), want dit kan op A4 in de offerte. */
const FOTO_PX = 800
const FOTO_JPEG_KWALITEIT = 65
/** Bronfoto's boven deze grens slaan we over: die zijn niet verkleind vóór het uploaden. */
const MAX_BRON_BYTES = 20 * 1024 * 1024
/** Plafond op het totaal aan base64 dat de snapshot in gaat. */
const MAX_TOTAAL_BASE64 = 3 * 1024 * 1024
/** Gelijktijdig opgehaalde foto's — niet alles tegelijk, dat trekt sharp leeg. */
const FOTO_PARALLEL = 6

export type ImportPayload = {
  opname: Opname
  regels: ImportRegel[]
  /** Hoeveel regelfoto's er bestaan en hoeveel er daadwerkelijk meegingen. */
  fotos: { beschikbaar: number; meegenomen: number; bytes: number }
}

async function fotoNaarDataUrl(url: string): Promise<{ dataUrl: string; bytes: number }> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { dataUrl: '', bytes: 0 }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BRON_BYTES) return { dataUrl: '', bytes: 0 }

    // Sharp doet drie dingen die geen van alle optioneel zijn: verkleinen, EXIF-rotatie toepassen
    // (telefoonfoto's staan anders op hun kant) en transparantie op wit zetten.
    const sharp = (await import('sharp')).default
    const jpeg = await sharp(buf)
      .rotate()
      .resize({ width: FOTO_PX, height: FOTO_PX, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: FOTO_JPEG_KWALITEIT, mozjpeg: true })
      .toBuffer()
    const base64 = `data:image/jpeg;base64,${jpeg.toString('base64')}`
    return { dataUrl: base64, bytes: base64.length }
  } catch {
    // Onleesbaar of niet-ondersteund formaat (bv. HEIC zonder libheif) → geen foto. De regel gaat
    // gewoon mee; alleen het plaatje ontbreekt.
    return { dataUrl: '', bytes: 0 }
  }
}

/**
 * Leest een opname en zet hem klaar voor de client-side import.
 *
 * Alleen de hoofdfoto per regel gaat mee. De overige foto's blijven in `opname_fotos` en zijn
 * zichtbaar op de dossier-tab en straks in het opnamerapport.
 */
export async function laadOpnameVoorImport(
  opnameId: string,
): Promise<{ ok: true; payload: ImportPayload } | { ok: false; error: string }> {
  await vereisRecht('everts_calc', 'schrijven')
  const supabase = db()

  const { data: opname } = await supabase.from('opnames').select('*').eq('id', opnameId).maybeSingle()
  if (!opname) return { ok: false, error: 'Opname niet gevonden' }

  const { data: regels, error } = await supabase
    .from('opname_regels')
    .select('*')
    .eq('opname_id', opnameId)
    .order('volgorde')
  if (error) return { ok: false, error: `Regels ophalen mislukt: ${error.message}` }
  const alleRegels = (regels ?? []) as OpnameRegel[]
  if (alleRegels.length === 0) return { ok: false, error: 'Deze opname heeft nog geen regels' }

  const { data: fotos } = await supabase
    .from('opname_fotos')
    .select('regel_id, url, is_hoofdfoto, volgorde')
    .eq('opname_id', opnameId)
    .not('regel_id', 'is', null)
    .order('volgorde')

  const perRegel = new Map<string, { url: string; is_hoofdfoto: boolean }[]>()
  for (const f of (fotos ?? []) as { regel_id: string; url: string; is_hoofdfoto: boolean }[]) {
    const lijst = perRegel.get(f.regel_id)
    if (lijst) lijst.push(f)
    else perRegel.set(f.regel_id, [f])
  }

  // Per regel één foto: de hoofdfoto, anders de eerste.
  const opdrachten: { regelId: string; url: string }[] = []
  for (const regel of alleRegels) {
    const lijst = perRegel.get(regel.id)
    if (!lijst?.length) continue
    const gekozen = lijst.find(f => f.is_hoofdfoto) ?? lijst[0]
    opdrachten.push({ regelId: regel.id, url: gekozen.url })
  }

  const dataUrls = new Map<string, string>()
  let totaal = 0
  let meegenomen = 0
  for (let i = 0; i < opdrachten.length; i += FOTO_PARALLEL) {
    // Al over het plafond: de rest niet meer ophalen. Scheelt netwerk én sharp-werk.
    if (totaal >= MAX_TOTAAL_BASE64) break
    const blok = opdrachten.slice(i, i + FOTO_PARALLEL)
    const uitkomsten = await Promise.all(blok.map(o => fotoNaarDataUrl(o.url)))
    uitkomsten.forEach((uit, j) => {
      if (!uit.dataUrl) return
      if (totaal + uit.bytes > MAX_TOTAAL_BASE64) return
      dataUrls.set(blok[j].regelId, uit.dataUrl)
      totaal += uit.bytes
      meegenomen += 1
    })
  }

  const payload: ImportPayload = {
    opname: opname as Opname,
    regels: alleRegels.map(r => {
      const foto = dataUrls.get(r.id)
      return foto ? { ...r, afbeeldingen: [foto] } : r
    }),
    fotos: { beschikbaar: opdrachten.length, meegenomen, bytes: totaal },
  }
  return { ok: true, payload }
}

/** Legt vast waar deze opname in de calculatie is geland. */
export async function markeerOpnameOmgezet(
  opnameId: string,
  koppeling: { projectId: string; scenarioId: string; groepId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { medewerker } = await vereisRecht('everts_calc', 'schrijven')
  const supabase = db()

  const { data: opname } = await supabase
    .from('opnames')
    .select('dossier_id')
    .eq('id', opnameId)
    .maybeSingle()
  if (!opname) return { ok: false, error: 'Opname niet gevonden' }
  await assertDossierBewerkbaar(opname.dossier_id)

  const { error } = await supabase
    .from('opnames')
    .update({
      status: 'omgezet',
      calculatie_project_id: koppeling.projectId,
      calculatie_scenario_id: koppeling.scenarioId,
      calculatie_groep_id: koppeling.groepId,
      omgezet_op: new Date().toISOString(),
      omgezet_door: medewerker.id,
    })
    .eq('id', opnameId)
  if (error) return { ok: false, error: `Vastleggen mislukt: ${error.message}` }

  revalidatePath(`/opdrachten/${opname.dossier_id}/opname`)
  revalidatePath(`/aanvragen/${opname.dossier_id}/opname`)
  return { ok: true }
}

/**
 * De scenario's van een project waar geïmporteerd MAG worden.
 *
 * Bevroren scenario's (die bij een verzonden offerte horen) vallen af. `beschermBevrorenScenarios`
 * in de sync-action gooit alles wat daarheen gaat stil weg: de import zou dan lijken te lukken
 * terwijl er niets verandert. Beter ze hier niet aanbieden en zeggen waarom.
 */
export async function getImporteerbareScenarios(
  projectId: string,
): Promise<{ id: string; naam: string; is_standaard: boolean }[]> {
  await vereisRecht('everts_calc', 'lezen')
  const { data } = await db()
    .from('calculatie_snapshots')
    .select('data')
    .eq('project_id', projectId)
    .maybeSingle()

  const scenarios = (data?.data?.scenarios ?? []) as {
    id: string
    naam: string
    is_standaard?: boolean
    bevroren_op?: string | null
  }[]
  return scenarios
    .filter(s => !s.bevroren_op)
    .map(s => ({ id: s.id, naam: s.naam, is_standaard: !!s.is_standaard }))
}
