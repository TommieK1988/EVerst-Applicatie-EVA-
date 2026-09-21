'use server'

/**
 * Server-actions voor de PDF-bijlages van een calculatie.
 *
 * De bijlages horen bij het scenario (de calculatie) en worden bij het aanmaken van
 * de offerte bevroren gekopieerd naar `quote_bijlagen`. Ze staan bewust in een eigen
 * tabel en niet in de scenario-JSONB: een upload is een serverhandeling, terwijl die
 * blob als geheel door de client wordt teruggeschreven. Zouden ze in de blob staan,
 * dan wist een tweede open tabblad met een autosave de bijlage die je net uploadde.
 */

import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht, GeenToegangError } from '@/lib/auth/rechten'
import { BIJLAGE_BUCKET } from '@/lib/everts-calc/pdf-bijlagen'
import { haalBestandBytes, type BestandBron } from '@/lib/dossiers/bestand-bytes'
import { getDossierBestanden } from '@/lib/dossiers/bestanden'
import { getDossierSharePointBestanden } from '@/lib/dossiers/sharepoint-bestanden'

/** Zelfde grens als de bucket zelf afdwingt; hier voor een nette melding. */
const MAX_BYTES = 25 * 1024 * 1024
const MAX_BIJLAGEN = 50

export interface CalculatieBijlage {
  id: string
  bestandsnaam: string
  bytes: number
  paginas: number | null
  volgorde: number
  /** Kortlopende signed URL om de bijlage te openen (privébucket). */
  url: string | null
}

/** Eén rij uit `calculatie_bijlagen`. De tabel staat nog niet in de gegenereerde
 *  types, dus is de client ongetypeerd — de rijen hier dus wél. */
interface BijlageRij {
  id: string
  bestandsnaam: string
  bytes: number | null
  paginas: number | null
  volgorde: number | null
  pad: string
}

type Resultaat<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function admin(): any {
  return createAdminClient()
}

/** Bestandsnaam veilig maken voor een storage-pad, met behoud van de .pdf-extensie. */
function veiligeNaam(naam: string): string {
  return naam.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
}

// ─── Lezen ────────────────────────────────────────────────────────────────────

export async function getCalculatieBijlagen(
  projectId: string,
  scenarioId: string,
): Promise<CalculatieBijlage[]> {
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch {
    return []
  }
  if (!projectId || !scenarioId) return []

  const db = admin()
  const { data, error } = await db
    .from('calculatie_bijlagen')
    .select('id, bestandsnaam, bytes, paginas, volgorde, pad')
    .eq('project_id', projectId)
    .eq('scenario_id', scenarioId)
    .order('volgorde', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(MAX_BIJLAGEN)
  if (error || !data) return []

  const rijen: BijlageRij[] = data
  return Promise.all(
    rijen.map(async r => {
      const { data: signed } = await db.storage.from(BIJLAGE_BUCKET).createSignedUrl(r.pad, 3600)
      return {
        id: r.id,
        bestandsnaam: r.bestandsnaam,
        bytes: Number(r.bytes ?? 0),
        paginas: r.paginas ?? null,
        volgorde: r.volgorde ?? 0,
        url: signed?.signedUrl ?? null,
      }
    }),
  )
}

/**
 * Of er al een offerte van deze calculatie bestaat. Het scherm waarschuwt daarmee dat
 * een nieuwe bijlage niet vanzelf in die offerte belandt — de bijlages worden bevroren
 * op het moment van aanmaken.
 */
export async function heeftOfferteVoorScenario(
  projectId: string,
  scenarioId: string,
): Promise<{ bestaat: boolean; alleenConcept: boolean }> {
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch {
    return { bestaat: false, alleenConcept: true }
  }
  const { data } = await admin()
    .from('quotes')
    .select('status')
    .eq('project_id', projectId)
    .eq('scenario_id', scenarioId)
    .limit(10)
  const rijen: { status: string }[] = data ?? []
  return {
    bestaat: rijen.length > 0,
    alleenConcept: rijen.length > 0 && rijen.every(q => q.status === 'concept'),
  }
}

// ─── Uploaden ─────────────────────────────────────────────────────────────────

/**
 * Voegt één PDF toe aan een calculatie.
 *
 * De validatie gaat verder dan de extensie: we lezen de magic bytes én laten pdf-lib
 * het bestand écht openen, zónder `ignoreEncryption`. Dat vangt twee praktijkfouten
 * die anders pas bij het verzenden opvallen — een hernoemde .docx, en een
 * wachtwoordbeveiligde PDF waarvan de pagina's niet te kopiëren zijn.
 */
export async function uploadCalculatieBijlage(
  projectId: string,
  scenarioId: string,
  formData: FormData,
): Promise<Resultaat<CalculatieBijlage>> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Geen toegang' }
    throw e
  }

  const file = formData.get('bestand') as File | null
  if (!file || !file.size) return { ok: false, error: 'Geen bestand meegegeven' }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: `"${file.name}" is te groot (max. 25 MB).` }
  }

  return bewaarBijlage(projectId, scenarioId, file.name, Buffer.from(await file.arrayBuffer()))
}

/**
 * Valideert een PDF en bewaart hem als bijlage bij de calculatie. Gedeeld door de
 * upload vanaf de pc en het overnemen uit de dossiermap, zodat beide wegen dezelfde
 * controles doorlopen.
 */
async function bewaarBijlage(
  projectId: string,
  scenarioId: string,
  bestandsnaam: string,
  buffer: Buffer,
): Promise<Resultaat<CalculatieBijlage>> {
  if (buffer.byteLength === 0) return { ok: false, error: `"${bestandsnaam}" is leeg.` }
  if (buffer.byteLength > MAX_BYTES) {
    return { ok: false, error: `"${bestandsnaam}" is te groot (max. 25 MB).` }
  }
  if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return { ok: false, error: `"${bestandsnaam}" is geen PDF-bestand.` }
  }

  let paginas: number | null = null
  try {
    const { PDFDocument } = await import('pdf-lib')
    paginas = (await PDFDocument.load(buffer)).getPageCount()
  } catch {
    return {
      ok: false,
      error: `"${bestandsnaam}" kan niet worden gelezen. Is de PDF beveiligd met een wachtwoord, sla hem dan zonder beveiliging op.`,
    }
  }

  const db = admin()
  const { count } = await db
    .from('calculatie_bijlagen')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('scenario_id', scenarioId)
  if ((count ?? 0) >= MAX_BIJLAGEN) {
    return { ok: false, error: `Maximaal ${MAX_BIJLAGEN} bijlages per calculatie.` }
  }

  const pad = `calculatie/${projectId}/${scenarioId}/${randomUUID()}-${veiligeNaam(bestandsnaam)}`
  const { error: upErr } = await db.storage
    .from(BIJLAGE_BUCKET)
    .upload(pad, buffer, { contentType: 'application/pdf', upsert: false })
  if (upErr) return { ok: false, error: upErr.message }

  // Achteraan in de lijst.
  const { data: laatste } = await db
    .from('calculatie_bijlagen')
    .select('volgorde')
    .eq('project_id', projectId)
    .eq('scenario_id', scenarioId)
    .order('volgorde', { ascending: false })
    .limit(1)
  const vorige: { volgorde: number | null }[] = laatste ?? []
  const volgorde = vorige[0]?.volgorde != null ? vorige[0].volgorde + 1 : 0

  const { data: rij, error } = await db
    .from('calculatie_bijlagen')
    .insert({
      project_id: projectId,
      scenario_id: scenarioId,
      bestandsnaam,
      pad,
      bytes: buffer.byteLength,
      paginas,
      volgorde,
    })
    .select('id, bestandsnaam, bytes, paginas, volgorde')
    .single()

  if (error) {
    // Rij mislukt → het bestand hier meteen opruimen, anders blijft het verweesd achter.
    await db.storage.from(BIJLAGE_BUCKET).remove([pad]).catch(() => null)
    return { ok: false, error: error.message }
  }

  const { data: signed } = await db.storage.from(BIJLAGE_BUCKET).createSignedUrl(pad, 3600)
  revalidatePath('/dossiers')
  return {
    ok: true,
    data: {
      id: rij.id,
      bestandsnaam: rij.bestandsnaam,
      bytes: Number(rij.bytes ?? 0),
      paginas: rij.paginas ?? null,
      volgorde: rij.volgorde ?? 0,
      url: signed?.signedUrl ?? null,
    },
  }
}

// ─── Verwijderen en ordenen ───────────────────────────────────────────────────

export async function verwijderCalculatieBijlage(id: string): Promise<Resultaat> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Geen toegang' }
    throw e
  }

  const db = admin()
  const { data: rij } = await db
    .from('calculatie_bijlagen').select('pad').eq('id', id).maybeSingle()

  const { error } = await db.from('calculatie_bijlagen').delete().eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Het bestand van een al aangemaakte offerte staat onder een eigen pad
  // (offerte/{quoteId}/…), dus dit raakt nooit een bestaande offerte.
  if (rij?.pad) await db.storage.from(BIJLAGE_BUCKET).remove([rij.pad]).catch(() => null)
  revalidatePath('/dossiers')
  return { ok: true }
}

/** Zet de volgorde opnieuw; `ids` is de gewenste volgorde van boven naar beneden. */
export async function herordenCalculatieBijlagen(ids: string[]): Promise<Resultaat> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Geen toegang' }
    throw e
  }

  const db = admin()
  for (let i = 0; i < ids.length; i++) {
    const { error } = await db.from('calculatie_bijlagen').update({ volgorde: i }).eq('id', ids[i])
    if (error) return { ok: false, error: error.message }
  }
  revalidatePath('/dossiers')
  return { ok: true }
}

// ─── Meereizen bij kopiëren en reviseren ──────────────────────────────────────

/**
 * Kopieert de bijlages van de ene calculatie naar de andere, inclusief de bestanden.
 *
 * Nodig omdat `kopieerScenario` in de client-store draait en deze tabel niet kent:
 * zonder deze aanroep verliest een revisie of kopie stil zijn bijlages. De bestanden
 * worden écht gekopieerd (niet hergebruikt), zodat het weggooien van een bijlage bij
 * de ene calculatie de andere niet uitholt.
 */
export async function kopieerBijlagenNaarScenario(
  projectId: string,
  bronScenarioId: string,
  doelScenarioId: string,
): Promise<Resultaat<{ gekopieerd: number }>> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Geen toegang' }
    throw e
  }
  if (bronScenarioId === doelScenarioId) return { ok: true, data: { gekopieerd: 0 } }

  const db = admin()
  const { data: bronnen } = await db
    .from('calculatie_bijlagen')
    .select('bestandsnaam, pad, bytes, paginas, volgorde')
    .eq('project_id', projectId)
    .eq('scenario_id', bronScenarioId)
    .order('volgorde', { ascending: true })
    .limit(MAX_BIJLAGEN)

  const rijen: BijlageRij[] = bronnen ?? []
  if (rijen.length === 0) return { ok: true, data: { gekopieerd: 0 } }

  let gekopieerd = 0
  for (const bron of rijen) {
    const doelPad = `calculatie/${projectId}/${doelScenarioId}/${randomUUID()}-${veiligeNaam(bron.bestandsnaam)}`
    const { error: copyErr } = await db.storage.from(BIJLAGE_BUCKET).copy(bron.pad, doelPad)
    if (copyErr) {
      console.error(`Bijlage "${bron.bestandsnaam}" niet meegekopieerd naar de nieuwe calculatie:`, copyErr)
      continue
    }
    const { error } = await db.from('calculatie_bijlagen').insert({
      project_id: projectId,
      scenario_id: doelScenarioId,
      bestandsnaam: bron.bestandsnaam,
      pad: doelPad,
      bytes: bron.bytes,
      paginas: bron.paginas,
      volgorde: bron.volgorde,
    })
    if (error) {
      await db.storage.from(BIJLAGE_BUCKET).remove([doelPad]).catch(() => null)
      console.error(`Bijlagerij "${bron.bestandsnaam}" niet aangemaakt:`, error)
      continue
    }
    gekopieerd++
  }
  return { ok: true, data: { gekopieerd } }
}

// ─── Kiezen uit de dossiermap ─────────────────────────────────────────────────

export interface DossierPdf {
  /** Stabiele sleutel voor de lijst; draagt ook de bron-aanduiding. */
  sleutel: string
  naam: string
  bron: 'SharePoint' | 'Bouw7'
  grootte: number | null
  datum: string | null
}

/** De bron-aanduiding gecodeerd in één sleutel, zodat de client hem kan teruggeven. */
function codeer(bron: BestandBron): string {
  return bron.bron === 'sharepoint'
    ? `sharepoint:${bron.driveId}:${bron.itemId}`
    : `bouw7:${bron.hash ?? ''}:${bron.id ?? ''}`
}

function decodeerSleutel(sleutel: string): BestandBron | null {
  const [soort, a, b] = sleutel.split(':')
  if (soort === 'sharepoint' && a && b) return { bron: 'sharepoint', driveId: a, itemId: b }
  if (soort === 'bouw7' && (a || b)) return { bron: 'bouw7', hash: a || null, id: b || null }
  return null
}

/**
 * De PDF's die al in de dossiermap staan — SharePoint én Bouw7 — zodat je een bijlage
 * kunt kiezen in plaats van hem eerst te downloaden en opnieuw te uploaden.
 *
 * Alleen PDF's: alles wat hier gekozen wordt gaat ongewijzigd de offerte-PDF in.
 */
export async function getDossierPdfs(dossierId: string): Promise<DossierPdf[]> {
  try {
    await vereisRecht('everts_calc', 'lezen')
  } catch {
    return []
  }
  if (!dossierId) return []

  const isPdf = (naam: string) => naam.toLowerCase().endsWith('.pdf')
  const uit: DossierPdf[] = []

  // Beide bronnen zijn best-effort: valt SharePoint of Bouw7 weg, dan toont de kiezer
  // gewoon wat er wél is in plaats van helemaal leeg te blijven.
  const [sp, b7] = await Promise.all([
    getDossierSharePointBestanden(dossierId).catch(() => null),
    getDossierBestanden(dossierId).catch(() => null),
  ])

  for (const f of (sp?.bestanden ?? [])) {
    // Zonder driveId kunnen we de bytes later niet ophalen, dus die rij heeft geen zin.
    if (!isPdf(f.naam) || !f.driveId) continue
    uit.push({
      sleutel: codeer({ bron: 'sharepoint', driveId: f.driveId, itemId: f.id }),
      naam: f.naam,
      bron: 'SharePoint',
      grootte: f.grootte ?? null,
      datum: f.datum ?? null,
    })
  }

  for (const f of (b7?.bestanden ?? [])) {
    if (!isPdf(f.naam)) continue
    uit.push({
      sleutel: codeer({ bron: 'bouw7', hash: f.fileHash ?? null, id: f.id != null ? String(f.id) : null }),
      naam: f.naam,
      bron: 'Bouw7',
      grootte: f.grootte ?? null,
      datum: f.datum ?? null,
    })
  }

  uit.sort((a, b) => a.naam.localeCompare(b.naam, 'nl'))
  return uit
}

/**
 * Neemt een bestand uit de dossiermap over als bijlage bij de calculatie.
 *
 * Het bestand wordt echt gekopieerd naar de bijlagebucket en niet als verwijzing
 * bewaard: een offerte moet blijven tonen wat er is verstuurd, ook als het bestand
 * later uit de dossiermap verdwijnt of wordt vervangen.
 */
export async function neemDossierBestandOverAlsBijlage(
  projectId: string,
  scenarioId: string,
  sleutel: string,
): Promise<Resultaat<CalculatieBijlage>> {
  try {
    await vereisRecht('everts_calc', 'schrijven')
  } catch (e) {
    if (e instanceof GeenToegangError) return { ok: false, error: 'Geen toegang' }
    throw e
  }

  const bron = decodeerSleutel(sleutel)
  if (!bron) return { ok: false, error: 'Onbekend bestand' }

  let bytes: Buffer
  let naam: string
  try {
    const res = await haalBestandBytes(bron)
    bytes = res.data
    naam = res.fileName ?? 'Bijlage.pdf'
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Bestand kon niet worden opgehaald' }
  }

  return bewaarBijlage(projectId, scenarioId, naam, bytes)
}
