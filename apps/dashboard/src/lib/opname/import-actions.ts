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
 * dan elke anderhalve seconde heen en weer reist. Vandaar: elke foto gaat mee, maar het formaat
 * krimpt mee met het aantal, met een plafond op het totaal en een teller die eerlijk zegt hoeveel
 * foto's het onverhoopt niet haalden.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import type { Opname, OpnameRegel } from '@everts/database/opname-types'
import { vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import type { ImportRegel } from './naar-calculatie'
import { haalOp } from '@/lib/net/deadline'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Formaten waarin een foto de calculatie in kan, van ruim naar zuinig.
 *
 * Alle foto's van een regel gaan mee, niet alleen de hoofdfoto — twee foto's van dezelfde schade
 * vertellen samen het verhaal, en de tweede kwijtraken zonder melding is precies wat er misging.
 * De prijs daarvoor is dat een foto kleiner wordt naarmate er meer zijn: liever elke foto op de
 * offerte in een wat lagere resolutie dan een volledige foto en een lege plek.
 *
 * Het ruimste formaat is groter dan het houtrotrapport (380px), want dit kan op A4 in de offerte.
 */
const FOTO_PROFIELEN = [
  { px: 800, kwaliteit: 65 },
  { px: 640, kwaliteit: 60 },
  { px: 480, kwaliteit: 55 },
  { px: 360, kwaliteit: 50 },
] as const
/** Bronfoto's boven deze grens slaan we over: die zijn niet verkleind vóór het uploaden. */
const MAX_BRON_BYTES = 20 * 1024 * 1024
/** Plafond op het totaal aan base64 dat de snapshot in gaat. */
const MAX_TOTAAL_BASE64 = 3 * 1024 * 1024
/** Gelijktijdig opgehaalde foto's — niet alles tegelijk, dat trekt sharp leeg. */
const FOTO_PARALLEL = 6

export type ImportPayload = {
  opname: Opname
  /** Niet de eerste opname op dit dossier — stuurt de kop van de bovengroep. */
  aanvullend: boolean
  regels: ImportRegel[]
  /** Hoeveel regelfoto's er bestaan en hoeveel er daadwerkelijk meegingen. */
  fotos: { beschikbaar: number; meegenomen: number; bytes: number }
}

/**
 * Hoeveel foto's er zijn bepaalt hoe groot ze mogen zijn.
 *
 * Een opname met drie foto's mag ze ruim houden; een mutatiewoning met tachtig foto's kan dat
 * niet. Zo blijft het totaal onder het plafond zonder dat er iets hoeft af te vallen.
 *
 * De grenzen zijn gemeten aan echte opnamefoto's: een telefoonfoto (1200×1600, 400 kB) komt op
 * 800px uit rond de 35 kB base64, op 640px rond 23 kB en op 360px rond 9 kB. Ze staan ruim, want
 * een foto die zijn aandeel toch overschrijdt verkleint zichzelf alsnog een stap verder.
 */
function profielVoorAantal(aantal: number): number {
  if (aantal <= 25) return 0
  if (aantal <= 50) return 1
  if (aantal <= 90) return 2
  return 3
}

async function fotoNaarDataUrl(
  url: string,
  vanafProfiel: number,
  ruimte: number,
): Promise<{ dataUrl: string; bytes: number }> {
  try {
    const res = await haalOp(url, { dienst: 'Fotobestand', timeoutMs: 20_000 })
    if (!res.ok) return { dataUrl: '', bytes: 0 }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength === 0 || buf.byteLength > MAX_BRON_BYTES) return { dataUrl: '', bytes: 0 }

    // Sharp doet drie dingen die geen van alle optioneel zijn: verkleinen, EXIF-rotatie toepassen
    // (telefoonfoto's staan anders op hun kant) en transparantie op wit zetten.
    const sharp = (await import('sharp')).default
    let laatste = { dataUrl: '', bytes: 0 }

    // Past de foto niet binnen zijn aandeel, dan volgt een poging in een kleiner formaat in plaats
    // van hem te laten vallen. Eén panoramafoto van 4000px hoort de rest niet te verdringen.
    for (let i = vanafProfiel; i < FOTO_PROFIELEN.length; i++) {
      const { px, kwaliteit } = FOTO_PROFIELEN[i]
      const jpeg = await sharp(buf)
        .rotate()
        .resize({ width: px, height: px, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: kwaliteit, mozjpeg: true })
        .toBuffer()
      const base64 = `data:image/jpeg;base64,${jpeg.toString('base64')}`
      laatste = { dataUrl: base64, bytes: base64.length }
      if (laatste.bytes <= ruimte) return laatste
    }
    return laatste
  } catch {
    // Onleesbaar of niet-ondersteund formaat (bv. HEIC zonder libheif) → geen foto. De regel gaat
    // gewoon mee; alleen het plaatje ontbreekt.
    return { dataUrl: '', bytes: 0 }
  }
}

/**
 * Leest een opname en zet hem klaar voor de client-side import.
 *
 * Alle foto's van een regel gaan mee, verkleind naar een formaat dat past bij hoeveel het er in
 * totaal zijn. Het origineel blijft in `opname_fotos` staan voor de dossier-tab en het
 * opnamerapport; wat hier meegaat is de offertekopie.
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

  // Alle foto's van een regel, hoofdfoto voorop zodat die bij krapte als eerste binnen is.
  const opdrachten: { regelId: string; url: string }[] = []
  for (const regel of alleRegels) {
    const lijst = perRegel.get(regel.id)
    if (!lijst?.length) continue
    const geordend = [...lijst].sort((a, b) => Number(b.is_hoofdfoto) - Number(a.is_hoofdfoto))
    for (const foto of geordend) opdrachten.push({ regelId: regel.id, url: foto.url })
  }

  // Het formaat volgt uit het aantal foto's, en elke foto krijgt een gelijk aandeel van het
  // plafond als bovengrens. Zo passen ze in de praktijk allemaal.
  const profiel = profielVoorAantal(opdrachten.length)
  const aandeel = opdrachten.length > 0 ? Math.floor(MAX_TOTAAL_BASE64 / opdrachten.length) : 0

  const dataUrls = new Map<string, string[]>()
  let totaal = 0
  let meegenomen = 0
  for (let i = 0; i < opdrachten.length; i += FOTO_PARALLEL) {
    // Al over het plafond: de rest niet meer ophalen. Scheelt netwerk én sharp-werk.
    if (totaal >= MAX_TOTAAL_BASE64) break
    const blok = opdrachten.slice(i, i + FOTO_PARALLEL)
    const uitkomsten = await Promise.all(
      blok.map(o => fotoNaarDataUrl(o.url, profiel, aandeel)),
    )
    uitkomsten.forEach((uit, j) => {
      if (!uit.dataUrl) return
      if (totaal + uit.bytes > MAX_TOTAAL_BASE64) return
      const regelId = blok[j].regelId
      const bestaand = dataUrls.get(regelId)
      if (bestaand) bestaand.push(uit.dataUrl)
      else dataUrls.set(regelId, [uit.dataUrl])
      totaal += uit.bytes
      meegenomen += 1
    })
  }

  // Is dit de eerste opname op dit dossier, of een aanvullende? Bepaalt de kop van de bovengroep
  // in de calculatie. Geteld op aanmaakmoment: de volgorde waarin ze gemaakt zijn is de volgorde
  // die de calculator herkent, ook als twee opnames dezelfde datum dragen.
  const { count: eerdere } = await supabase
    .from('opnames')
    .select('id', { count: 'exact', head: true })
    .eq('dossier_id', opname.dossier_id)
    .neq('status', 'geannuleerd')
    .lt('created_at', opname.created_at)

  const payload: ImportPayload = {
    opname: opname as Opname,
    aanvullend: (eerdere ?? 0) > 0,
    regels: alleRegels.map(r => {
      const fotos = dataUrls.get(r.id)
      return fotos?.length ? { ...r, afbeeldingen: fotos } : r
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
