'use server'

/**
 * uitvraag-pakketten.ts — Server-acties voor uitvragen vanuit de calculatie (calculatie fase 6).
 * Zie uitvraag-pakket-types.ts voor het model.
 *
 * CONTRACT — de signaturen hieronder liggen vast; de schermen bouwen erop.
 *
 * Patroon gelijk aan `uitvragen.ts`: admin-client, per actie `vereisSessie()` en bij elke mutatie
 * `assertDossierBewerkbaar()`, en een `{ ok }`-resultaat in plaats van een throw.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { UITVRAAG_TRANSITIES } from '@everts/database'
import type { UitvraagSoort, UitvraagStatus } from '@everts/database'
import { vereisSessie } from '@/lib/auth/rechten'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import { dagenTussen, nlDelen } from '@/lib/planning/nl-tijd'
import { uploadBuffersNaarDossierMap } from '@/lib/o365/dossier-map'
import { assertDossierBewerkbaar } from './guards'
import { controleerOffertePdf, controleerPakket, offerteBestandsnaam } from './uitvraag-pakket-invoer'
import type {
  ActieResultaat, NieuwUitvraagPakket, UitvraagPakket, UitvraagPakketPartij, UitvraagPost,
} from './uitvraag-pakket-types'

/** Vandaag als YYYY-MM-DD in Nederlandse tijd (de server draait in UTC). */
function vandaag(): string {
  return nlDelen(new Date().toISOString()).datum
}

/** Zelfde drie routes als `ververs()` in uitvragen.ts: de tab Uitvraag leeft op alle drie. */
function ververs(dossierId: string): void {
  for (const sectie of ['aanvragen', 'offertes', 'opdrachten']) {
    revalidatePath(`/${sectie}/${dossierId}/uitvraag`)
  }
}

/* ─── lezen ───────────────────────────────────────────────────────── */

/** Alle pakketten van een dossier, nieuwste eerst, met posten en partijen. */
export async function getUitvraagPakketten(dossierId: string): Promise<UitvraagPakket[]> {
  // Ook lezen loopt via de admin-client; zonder sessie is dit een open endpoint.
  await vereisSessie()
  const db = createAdminClient()

  // Begrensd door het dossier: zoveel pakketten heeft geen dossier.
  const { data: pakketten, error } = await db
    .from('dossier_uitvraag_pakketten')
    .select('*')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Uitvragen ophalen mislukt: ${error.message}`)
  if (!pakketten || pakketten.length === 0) return []

  const ids = pakketten.map(p => p.id)
  // Posten: per pakket meestal een handvol, maar een grote calculatie met veel pakketten kan in
  // totaal toch richting de PostgREST-grens gaan. Daarom gepagineerd, met een stabiele sortering.
  const [posten, partijRes] = await Promise.all([
    haalAlleRijen((van, tot) => db
      .from('dossier_uitvraag_posten')
      .select('*')
      .in('pakket_id', ids)
      .order('pakket_id').order('volgorde').order('id')
      .range(van, tot)),
    // Partijen: begrensd door het dossier (een handvol per pakket).
    db.from('dossier_uitvragen')
      .select('*, relaties(email)')
      .eq('dossier_id', dossierId)
      .not('pakket_id', 'is', null)
      .order('volgnummer', { ascending: true }),
  ])
  if (partijRes.error) throw new Error(`Uitvragen ophalen mislukt: ${partijRes.error.message}`)

  const nu = vandaag()
  const postenPer = new Map<string, UitvraagPost[]>()
  for (const p of posten) {
    const lijst = postenPer.get(p.pakket_id) ?? []
    lijst.push({
      calculatieregel_id: p.calculatieregel_id,
      omschrijving: p.omschrijving,
      hoeveelheid: p.hoeveelheid,
      eenheid: p.eenheid,
    })
    postenPer.set(p.pakket_id, lijst)
  }

  const partijenPer = new Map<string, UitvraagPakketPartij[]>()
  for (const r of partijRes.data ?? []) {
    if (!r.pakket_id) continue
    const { relaties, ...rij } = r
    const lijst = partijenPer.get(r.pakket_id) ?? []
    lijst.push({
      ...rij,
      soort: rij.soort as UitvraagSoort,
      status: rij.status as UitvraagStatus,
      dagen_open: rij.aangevraagd_op ? dagenTussen(rij.aangevraagd_op, nu) : null,
      partij_email: relaties?.email ?? null,
    })
    partijenPer.set(r.pakket_id, lijst)
  }

  return pakketten.map(p => ({
    id: p.id,
    dossier_id: p.dossier_id,
    naam: p.naam,
    soort: p.soort as UitvraagSoort,
    scenario_id: p.scenario_id,
    reactie_uiterlijk: p.reactie_uiterlijk,
    projectbezoek_op: p.projectbezoek_op,
    created_at: p.created_at,
    posten: postenPer.get(p.id) ?? [],
    partijen: partijenPer.get(p.id) ?? [],
  }))
}

/* ─── muteren ─────────────────────────────────────────────────────── */

/**
 * Maakt het pakket, de posten en per partij een rij in dossier_uitvragen (status open, nog niet
 * gemaild: aangevraagd_op blijft leeg tot de mail echt weg is). Geeft de nieuwe uitvraag-ids terug
 * in de volgorde van `input.partijen`, zodat het scherm daarna per partij het mailvenster opent.
 * Dubbel gekozen partijen vallen eruit; de ids volgen dan de eerste keer dat een partij voorkomt.
 */
export async function maakUitvraagPakket(
  input: NieuwUitvraagPakket,
): Promise<ActieResultaat<{ pakketId: string; uitvraagIds: string[] }>> {
  // Muterende actie op de admin-client: zonder deze gate is dit een publiek aanroepbaar endpoint voor
  // iedereen met een sessie. vereisSessie en niet vereisRecht('dossiers'): die module staat niet in
  // AFGEDWONGEN_MODULES, dus een rechtencheck zou collega's buitensluiten die dat recht nooit
  // expliciet hebben gekregen. Zelfde afweging als in uitvragen.ts en meerwerk.ts.
  const medewerker = await vereisSessie()
  await assertDossierBewerkbaar(input.dossierId)

  const check = controleerPakket(input)
  if (!check.ok) return check
  const p = check.data
  const db = createAdminClient()

  const { data: pakket, error: pakketFout } = await db
    .from('dossier_uitvraag_pakketten')
    .insert({
      dossier_id: input.dossierId,
      naam: p.naam,
      soort: p.soort,
      scenario_id: input.scenarioId || null,
      reactie_uiterlijk: p.reactieUiterlijk,
      projectbezoek_op: p.projectbezoekOp,
      created_by: medewerker.id,
    })
    .select('id')
    .single()
  if (pakketFout || !pakket) return { ok: false, error: pakketFout?.message ?? 'Uitvraag aanmaken mislukt.' }

  // Gaat er hierna iets mis, dan gaat het pakket weer weg. De FK's staan op cascade, dus de posten
  // en partijrijen die al wél stonden verdwijnen mee: geen half pakket in de tab.
  const terugdraaien = async (fout: string): Promise<{ ok: false; error: string }> => {
    await db.from('dossier_uitvraag_pakketten').delete().eq('id', pakket.id)
    return { ok: false, error: fout }
  }

  if (p.posten.length > 0) {
    const { error } = await db.from('dossier_uitvraag_posten').insert(
      p.posten.map((post, volgorde) => ({ pakket_id: pakket.id, ...post, volgorde })),
    )
    if (error) return terugdraaien(`Posten opslaan mislukt: ${error.message}`)
  }

  const { data: maxRow } = await db
    .from('dossier_uitvragen')
    .select('volgnummer')
    .eq('dossier_id', input.dossierId)
    .order('volgnummer', { ascending: false })
    .limit(1)
    .maybeSingle()
  const start = (maxRow?.volgnummer ?? 0) + 1

  const { data: rijen, error: rijFout } = await db
    .from('dossier_uitvragen')
    .insert(p.partijen.map((partij, i) => ({
      dossier_id: input.dossierId,
      volgnummer: start + i,
      discipline: p.naam,
      soort: p.soort,
      relatie_id: partij.relatie_id,
      partij_naam: partij.naam,
      reactie_uiterlijk: p.reactieUiterlijk,
      pakket_id: pakket.id,
      status: 'open',
      aangevraagd_op: null,
      created_by: medewerker.id,
    })))
    .select('id, volgnummer')
  if (rijFout || !rijen || rijen.length !== p.partijen.length) {
    return terugdraaien(`Partijen opslaan mislukt: ${rijFout?.message ?? 'onvolledig opgeslagen'}`)
  }

  // Op volgnummer terugzoeken in plaats van op de volgorde van het antwoord te vertrouwen.
  const perVolgnummer = new Map(rijen.map(r => [r.volgnummer, r.id]))
  const uitvraagIds = p.partijen.map((_, i) => perVolgnummer.get(start + i) ?? '')
  if (uitvraagIds.some(id => !id)) return terugdraaien('Partijen opslaan mislukt.')

  ververs(input.dossierId)
  return { ok: true, data: { pakketId: pakket.id, uitvraagIds } }
}

/** Kiest met welke partij de calculatie rekent (of geen, met `null`). Hooguit één per pakket. */
export async function zetRekentMet(pakketId: string, uitvraagId: string | null): Promise<ActieResultaat> {
  await vereisSessie()
  const db = createAdminClient()
  const { data: pakket } = await db
    .from('dossier_uitvraag_pakketten')
    .select('id, dossier_id')
    .eq('id', pakketId)
    .maybeSingle()
  if (!pakket) return { ok: false, error: 'Uitvraag niet gevonden.' }
  await assertDossierBewerkbaar(pakket.dossier_id)

  if (uitvraagId) {
    const { data: rij } = await db
      .from('dossier_uitvragen')
      .select('id, status, pakket_id')
      .eq('id', uitvraagId)
      .maybeSingle()
    if (!rij || rij.pakket_id !== pakketId) return { ok: false, error: 'Deze partij hoort niet bij deze uitvraag.' }
    if (rij.status === 'ingetrokken' || rij.status === 'afgevallen') {
      return { ok: false, error: 'Met een ingetrokken of afgevallen partij kan de calculatie niet rekenen.' }
    }
  }

  // Eerst alles uit, dan de gekozen aan: andersom botst het met de unieke index (één per pakket).
  const nu = new Date().toISOString()
  const { error: uitFout } = await db
    .from('dossier_uitvragen')
    .update({ rekent_mee: false, updated_at: nu })
    .eq('pakket_id', pakketId)
    .eq('rekent_mee', true)
  if (uitFout) return { ok: false, error: uitFout.message }

  if (uitvraagId) {
    const { error } = await db
      .from('dossier_uitvragen')
      .update({ rekent_mee: true, updated_at: nu })
      .eq('id', uitvraagId)
      .eq('pakket_id', pakketId)
    if (error) return { ok: false, error: error.message }
  }

  ververs(pakket.dossier_id)
  return { ok: true, data: null }
}

/**
 * "Offerte binnen": zet de pdf (FormData-veld `bestand`) in de dossiermap (Bestanden) en zet de
 * uitvraag op ontvangen. Zonder bestand alleen de status.
 *
 * Volgorde zoals bij het mailen: eerst het externe deel (SharePoint), pas daarna de administratie.
 * Mislukt de upload, dan blijft de uitvraag ongewijzigd en kan de gebruiker het opnieuw proberen.
 */
export async function markeerOfferteBinnen(
  uitvraagId: string,
  formData: FormData,
): Promise<ActieResultaat<{ url: string | null }>> {
  await vereisSessie()
  const db = createAdminClient()
  const { data: rij } = await db
    .from('dossier_uitvragen')
    .select('id, dossier_id, status, partij_naam, discipline, offerte_bestand_url')
    .eq('id', uitvraagId)
    .maybeSingle()
  if (!rij) return { ok: false, error: 'Uitvraag niet gevonden.' }
  await assertDossierBewerkbaar(rij.dossier_id)

  // Staat hij al op ontvangen (of verder: gegund), dan alleen het bestand bijwerken.
  const status = rij.status as UitvraagStatus
  const alBinnen = status === 'ontvangen' || status === 'gegund'
  if (!alBinnen && !UITVRAAG_TRANSITIES[status]?.includes('ontvangen')) {
    return { ok: false, error: 'Een ingetrokken uitvraag kan geen offerte ontvangen. Zet hem eerst weer op open.' }
  }

  const veld = formData.get('bestand')
  const bestand = veld instanceof File && veld.size > 0 ? veld : null
  const datum = vandaag()
  const velden: {
    updated_at: string; status?: string; ontvangen_op?: string
    offerte_bestand_naam?: string; offerte_bestand_url?: string | null
  } = { updated_at: new Date().toISOString() }

  let url: string | null = rij.offerte_bestand_url
  if (bestand) {
    const bytes = new Uint8Array(await bestand.arrayBuffer())
    const fout = controleerOffertePdf(bestand.name, bestand.size, bytes.subarray(0, 5))
    if (fout) return { ok: false, error: fout }

    const naam = offerteBestandsnaam(rij.partij_naam, rij.discipline, datum)
    const res = await uploadBuffersNaarDossierMap(rij.dossier_id, [
      { naam, contentType: 'application/pdf', bytes },
    ])
    if (!res.ok || res.geuploaded === 0) {
      const reden = res.fout?.startsWith('SharePoint niet geconfigureerd')
        ? 'SharePoint is niet ingesteld, dus de pdf kan niet in de dossiermap worden gezet.'
        : `De pdf kon niet in de dossiermap worden gezet${res.fout ? `: ${res.fout}` : '.'}`
      return { ok: false, error: `${reden} Er is niets gewijzigd.` }
    }
    // Liefst de link naar het bestand zelf; geeft Graph die niet terug, dan de dossiermap.
    url = res.bestanden?.[0]?.webUrl ?? res.mapUrl ?? null
    velden.offerte_bestand_naam = naam
    velden.offerte_bestand_url = url
  }

  if (!alBinnen) {
    velden.status = 'ontvangen'
    velden.ontvangen_op = datum
  }

  const { error } = await db.from('dossier_uitvragen').update(velden).eq('id', uitvraagId)
  if (error) return { ok: false, error: error.message }
  ververs(rij.dossier_id)
  return { ok: true, data: { url } }
}
