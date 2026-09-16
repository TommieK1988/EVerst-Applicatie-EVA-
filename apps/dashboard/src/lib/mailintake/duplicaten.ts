/**
 * mailintake/duplicaten.ts
 *
 * "Staat dit al ingeschreven?" — de controle die vóór elk aanmaken draait, ook
 * wanneer een mens het doet.
 *
 * De aanleiding is een reëel probleem: dezelfde klus komt twee keer binnen (de
 * beheerder mailt, de VvE mailt ook), of iemand stuurt een herinnering op een
 * aanvraag die al loopt. Zonder deze controle staan er dan twee dossiers, twee
 * Bouw7-projecten en twee calculaties.
 *
 * BEGRENSDE QUERIES
 * Dit is precies het soort zoekopdracht dat ongemerkt tegen de PostgREST-grens van
 * 1000 rijen loopt. Daarom wordt er nooit breed geselecteerd: er zijn drie smalle
 * ingangen (klant, adres, referentie) die elk apart worden opgehaald en daarna
 * samengevoegd. Wie hier een filter weghaalt, krijgt stil een half antwoord.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { gelijkenis, normaliseerNaam } from './afzender'
import { DUPLICAAT_HARD, DUPLICAAT_TWIJFEL, type DuplicaatSoort } from './types'

export interface DuplicaatInvoer {
  berichtId: string
  relatieId: string | null
  onderwerp: string | null
  omschrijving: string | null
  postcode: string | null
  huisnummer: string | null
  referentie: string | null
  onzeReferentie: string | null
  bedrag: number | null
  bodyTekst: string | null
  conversationId: string | null
  /** sha256 van de niet-inline bijlagen. */
  bijlageHashes: string[]
}

export interface DuplicaatResultaat {
  score: number
  soort: DuplicaatSoort
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  klantnaam: string | null
  hoofdstatus: string | null
  substatus: string | null
  redenen: string[]
}

const DOSSIER_SELECT =
  'id, dossiernummer, titel, klant_id, referentie, hoofdstatus, aanvraag_substatus, ' +
  'offerte_substatus, opdracht_substatus, werkadres_postcode, werkadres_huisnummer, ' +
  'bedrag_excl_btw, created_at, klant:relaties!dossiers_klant_id_fkey(naam)'

/** 18 maanden terug; ouder werk is geen lopende aanvraag meer. */
function vensterVanaf(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 18)
  return d.toISOString()
}

function normaliseerPostcode(pc: string | null | undefined): string | null {
  const m = (pc ?? '').replace(/\s+/g, '').toUpperCase().match(/^(\d{4})([A-Z]{2})$/)
  return m ? `${m[1]} ${m[2]}` : null
}

function huisnummerKern(hn: string | null | undefined): string | null {
  const m = (hn ?? '').match(/\d+/)
  return m ? m[0] : null
}

/**
 * Zoekt mogelijke duplicaten en scoort ze. De score is een gewogen som, afgetopt
 * op 1,0 — geen kansberekening, maar een rangschikking die een mens moet kunnen
 * navertellen. Vandaar dat elke bijdrage ook als leesbare reden terugkomt.
 */
export async function zoekDuplicaten(invoer: DuplicaatInvoer): Promise<DuplicaatResultaat[]> {
  const supabase = createAdminClient()
  const vanaf = vensterVanaf()
  const kandidaten = new Map<string, any>()

  const voegToe = (rijen: any[] | null) => {
    for (const r of rijen ?? []) if (r?.id) kandidaten.set(r.id, r)
  }

  // ── Ingang 1: zelfde klant ────────────────────────────────────────────────
  if (invoer.relatieId) {
    const { data } = await supabase
      .from('dossiers').select(DOSSIER_SELECT)
      .eq('klant_id', invoer.relatieId)
      .gte('created_at', vanaf)
      .order('created_at', { ascending: false })
      .limit(200)
    voegToe(data)
  }

  // ── Ingang 2: zelfde adres ────────────────────────────────────────────────
  const pc = normaliseerPostcode(invoer.postcode)
  if (pc) {
    const { data } = await supabase
      .from('dossiers').select(DOSSIER_SELECT)
      .eq('werkadres_postcode', pc)
      .gte('created_at', vanaf)
      .order('created_at', { ascending: false })
      .limit(200)
    voegToe(data)
  }

  // ── Ingang 3: referentie van de klant, of ons eigen nummer in hun mail ────
  for (const ref of [invoer.referentie, invoer.onzeReferentie]) {
    const v = (ref ?? '').trim()
    if (v.length < 3) continue
    const { data } = await supabase
      .from('dossiers').select(DOSSIER_SELECT)
      .or(`referentie.eq.${v},dossiernummer.eq.${v}`)
      .limit(50)
    voegToe(data)
  }

  // ── Ingang 4: eerder bericht in dezelfde conversatie ──────────────────────
  const conversatieDossiers = new Set<string>()
  if (invoer.conversationId) {
    const { data } = await supabase
      .from('mailintake_berichten')
      .select('dossier_id')
      .eq('conversation_id', invoer.conversationId)
      .not('dossier_id', 'is', null)
      .neq('id', invoer.berichtId)
      .limit(20)
    for (const r of data ?? []) if (r.dossier_id) conversatieDossiers.add(r.dossier_id)
    if (conversatieDossiers.size) {
      const { data: d } = await supabase
        .from('dossiers').select(DOSSIER_SELECT).in('id', [...conversatieDossiers]).limit(20)
      voegToe(d)
    }
  }

  // ── Ingang 5: een bijlage die al ergens aan hangt ─────────────────────────
  const hashDossiers = new Set<string>()
  if (invoer.bijlageHashes.length) {
    const { data } = await supabase
      .from('mailintake_bijlagen')
      .select('sha256, bericht:mailintake_berichten!inner(dossier_id)')
      .in('sha256', invoer.bijlageHashes.slice(0, 20))
      .not('bericht.dossier_id', 'is', null)
      .limit(50)
    for (const r of data ?? []) {
      const did = (r as any).bericht?.dossier_id
      if (did) hashDossiers.add(did)
    }
    if (hashDossiers.size) {
      const { data: d } = await supabase
        .from('dossiers').select(DOSSIER_SELECT).in('id', [...hashDossiers]).limit(20)
      voegToe(d)
    }
  }

  // ── Scoren ────────────────────────────────────────────────────────────────
  const hn = huisnummerKern(invoer.huisnummer)
  const tekst = `${invoer.onderwerp ?? ''} ${invoer.bodyTekst ?? ''}`.toLowerCase()
  const eigenOmschrijving = normaliseerNaam(invoer.omschrijving ?? invoer.onderwerp ?? '')

  const resultaten: DuplicaatResultaat[] = []

  for (const d of kandidaten.values()) {
    let score = 0
    const redenen: string[] = []
    let soort: DuplicaatSoort = 'duplicaat'

    if (conversatieDossiers.has(d.id)) {
      score += 1
      redenen.push('Eerdere mail in dezelfde conversatie hangt al aan dit dossier')
    }
    if (hashDossiers.has(d.id)) {
      score += 0.9
      redenen.push('Een identieke bijlage hangt al aan dit dossier')
    }
    if (d.dossiernummer && tekst.includes(String(d.dossiernummer).toLowerCase())) {
      score += 0.5
      redenen.push(`Het dossiernummer ${d.dossiernummer} wordt in de mail genoemd`)
    }
    if (pc && d.werkadres_postcode === pc && hn && huisnummerKern(d.werkadres_huisnummer) === hn) {
      score += 0.45
      redenen.push('Zelfde werkadres')
    }
    if (invoer.relatieId && d.klant_id === invoer.relatieId && pc && d.werkadres_postcode === pc) {
      score += 0.1
      redenen.push('Zelfde opdrachtgever op dit adres')
    }
    const ref = (invoer.referentie ?? '').trim()
    if (ref.length >= 3 && d.referentie && String(d.referentie).trim() === ref) {
      score += 0.4
      redenen.push(`Zelfde referentie (${ref})`)
    }
    if (eigenOmschrijving && d.titel) {
      const s = gelijkenis(eigenOmschrijving, normaliseerNaam(d.titel))
      if (s >= 0.6) {
        score += 0.2 * s
        redenen.push('De omschrijving lijkt sterk op de titel van dit dossier')
      }
    }
    if (invoer.bedrag != null && d.bedrag_excl_btw != null && Number(d.bedrag_excl_btw) > 0) {
      const afwijking = Math.abs(Number(d.bedrag_excl_btw) - invoer.bedrag) / Number(d.bedrag_excl_btw)
      if (afwijking <= 0.01) {
        score += 0.1
        redenen.push('Zelfde bedrag')
      }
    }

    if (score <= 0) continue

    // Waar hoort deze kandidaat thuis? Dat bepaalt welke knop het scherm aanbiedt.
    if (d.hoofdstatus === 'offerte') soort = 'offerte_match'
    else if (d.hoofdstatus === 'opdracht' && d.opdracht_substatus !== 'financieel_afgesloten') soort = 'meerwerk_kandidaat'

    resultaten.push({
      score: Math.min(1, Math.round(score * 100) / 100),
      soort,
      dossierId: d.id,
      dossiernummer: d.dossiernummer ?? null,
      titel: d.titel ?? null,
      klantnaam: d.klant?.naam ?? null,
      hoofdstatus: d.hoofdstatus ?? null,
      substatus: d.opdracht_substatus ?? d.offerte_substatus ?? d.aanvraag_substatus ?? null,
      redenen,
    })
  }

  return resultaten.sort((a, b) => b.score - a.score).slice(0, 10)
}

export function isHardeDuplicaat(score: number | null | undefined): boolean {
  return (score ?? 0) >= DUPLICAAT_HARD
}

export function vraagtOmBevestiging(score: number | null | undefined): boolean {
  return (score ?? 0) >= DUPLICAAT_TWIJFEL
}
