/**
 * mailintake/data.ts
 *
 * Leesfuncties voor de schermen. Bewust géén 'use server': dit wordt door
 * server-componenten aangeroepen en levert getypeerde rijen op, zodat de tabel
 * niet met `unknown` hoeft te werken.
 *
 * Elke query is begrensd. Een postvak dat stil op 1000 rijen afkapt zou precies
 * de berichten verbergen die nog moeten worden opgepakt.
 */

import 'server-only'
import { createAdminClient } from '@everts/database/server'

import type { PostbusRij, BijlageRij, PostvakRij, PostvakTab } from './types'

export type { PostvakRij, PostvakTab }

const LIJST_SELECT = `
  id, onderwerp, van_naam, van_adres, ontvangen_op, heeft_bijlagen,
  soort, soort_vertrouwen, samenvatting, status, besluit, dossier_id,
  herkend_via, herkenning_score, duplicaat_topscore, outlook_nabehandeling, laatste_fout,
  postbus:mailintake_postbussen(naam, sleutel),
  relatie:relaties(id, naam),
  dossier:dossiers(dossiernummer),
  toegewezen:medewerkers!mailintake_berichten_toegewezen_medewerker_id_fkey(voornaam, achternaam)
`

function naam(m: { voornaam?: string | null; achternaam?: string | null } | null): string | null {
  if (!m) return null
  const n = [m.voornaam, m.achternaam].filter(Boolean).join(' ').trim()
  return n || null
}

/** Het postvak voor één tabblad. */
export async function getPostvakRijen(tab: PostvakTab = 'te_behandelen'): Promise<PostvakRij[]> {
  const supabase = createAdminClient() as any
  let q = supabase.from('mailintake_berichten').select(LIJST_SELECT)

  switch (tab) {
    case 'te_behandelen': q = q.eq('status', 'wacht_op_mens'); break
    case 'verwerkt':
      q = q.eq('status', 'verwerkt')
        .gte('behandeld_op', new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString())
      break
    case 'geen_aanvraag': q = q.eq('status', 'geen_aanvraag')
      .gte('ontvangen_op', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()); break
    case 'genegeerd': q = q.eq('status', 'genegeerd'); break
    case 'mislukt':   q = q.in('status', ['mislukt', 'bezig']); break
    default:
      // "Alles" is de laatste 30 dagen — een echt onbegrensde lijst kapt stil af.
      q = q.gte('ontvangen_op', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())
  }

  const { data } = await q.order('ontvangen_op', { ascending: false }).limit(500)
  const rijen = (data ?? []) as any[]

  // Het dossiernummer van de sterkste duplicaatkandidaat, voor de badge in de lijst.
  const ids = rijen.filter(r => (r.duplicaat_topscore ?? 0) >= 0.55).map(r => r.id)
  const dupPerBericht = new Map<string, string>()
  if (ids.length) {
    const { data: dups } = await supabase
      .from('mailintake_duplicaat_kandidaten')
      .select('bericht_id, score, dossier:dossiers(dossiernummer)')
      .in('bericht_id', ids)
      .order('score', { ascending: false })
      .limit(1000)
    for (const d of (dups ?? []) as any[]) {
      if (!dupPerBericht.has(d.bericht_id) && d.dossier?.dossiernummer) {
        dupPerBericht.set(d.bericht_id, d.dossier.dossiernummer)
      }
    }
  }

  return rijen.map(r => ({
    id: r.id,
    onderwerp: r.onderwerp,
    vanNaam: r.van_naam,
    vanAdres: r.van_adres,
    ontvangenOp: r.ontvangen_op,
    heeftBijlagen: Boolean(r.heeft_bijlagen),
    soort: r.soort,
    soortVertrouwen: r.soort_vertrouwen != null ? Number(r.soort_vertrouwen) : null,
    samenvatting: r.samenvatting,
    status: r.status,
    besluit: r.besluit,
    postbusNaam: r.postbus?.naam ?? '—',
    postbusSleutel: r.postbus?.sleutel ?? '',
    relatieId: r.relatie?.id ?? null,
    relatieNaam: r.relatie?.naam ?? null,
    herkendVia: r.herkend_via,
    herkenningScore: r.herkenning_score != null ? Number(r.herkenning_score) : null,
    duplicaatTopscore: r.duplicaat_topscore != null ? Number(r.duplicaat_topscore) : null,
    duplicaatDossiernummer: dupPerBericht.get(r.id) ?? null,
    dossierId: r.dossier_id,
    dossiernummer: r.dossier?.dossiernummer ?? null,
    toegewezenNaam: naam(r.toegewezen),
    outlookNabehandeling: r.outlook_nabehandeling ?? 'nvt',
    laatsteFout: r.laatste_fout,
  }))
}

/** Tellers voor de tabbladen. */
export async function getPostvakTellers(): Promise<Record<string, number>> {
  const supabase = createAdminClient() as any
  const statussen = ['wacht_op_mens', 'geen_aanvraag', 'genegeerd', 'mislukt']
  const uit: Record<string, number> = {}
  for (const s of statussen) {
    const { count } = await supabase
      .from('mailintake_berichten').select('id', { count: 'exact', head: true }).eq('status', s)
    uit[s] = count ?? 0
  }
  return uit
}

export interface DuplicaatWeergave {
  id: string
  dossierId: string
  dossiernummer: string | null
  titel: string | null
  klantnaam: string | null
  hoofdstatus: string | null
  score: number
  redenen: string[]
  soort: string
}

export interface BerichtDetail {
  bericht: Record<string, any>
  postbus: PostbusRij | null
  bijlagen: BijlageRij[]
  extractie: Record<string, any> | null
  duplicaten: DuplicaatWeergave[]
  log: { id: string; moment: string; actor: string; actie: string; details: Record<string, any> }[]
}

/** Alles wat het behandelscherm nodig heeft, in één keer. */
export async function getBerichtDetail(id: string): Promise<BerichtDetail | null> {
  const supabase = createAdminClient() as any

  const { data: bericht } = await supabase
    .from('mailintake_berichten')
    .select(`*,
             postbus:mailintake_postbussen(*),
             relatie:relaties(id, naam),
             contactpersoon:contactpersonen(id, voornaam, achternaam, email),
             dossier:dossiers(id, dossiernummer, titel)`)
    .eq('id', id)
    .maybeSingle()

  if (!bericht) return null

  const [bijlagen, extractie, duplicaten, log] = await Promise.all([
    supabase.from('mailintake_bijlagen').select('*')
      .eq('bericht_id', id).eq('is_inline', false).order('bestandsnaam').limit(50),
    supabase.from('mailintake_extracties').select('*')
      .eq('bericht_id', id).order('versie', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('mailintake_duplicaat_kandidaten')
      .select('*, dossier:dossiers(id, dossiernummer, titel, hoofdstatus, klant:relaties!dossiers_klant_id_fkey(naam))')
      .eq('bericht_id', id).order('score', { ascending: false }).limit(10),
    supabase.from('mailintake_besluiten').select('*')
      .eq('bericht_id', id).order('moment', { ascending: false }).limit(30),
  ])

  return {
    bericht,
    postbus: (bericht.postbus ?? null) as PostbusRij | null,
    bijlagen: (bijlagen.data ?? []) as BijlageRij[],
    extractie: extractie.data ?? null,
    duplicaten: ((duplicaten.data ?? []) as any[]).map(d => ({
      id: d.id,
      dossierId: d.dossier_id,
      dossiernummer: d.dossier?.dossiernummer ?? null,
      titel: d.dossier?.titel ?? null,
      klantnaam: d.dossier?.klant?.naam ?? null,
      hoofdstatus: d.dossier?.hoofdstatus ?? null,
      score: Number(d.score),
      redenen: d.redenen ?? [],
      soort: d.soort,
    })),
    log: (log.data ?? []) as any[],
  }
}

export async function getPostbussen(): Promise<PostbusRij[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase.from('mailintake_postbussen').select('*').order('sleutel').limit(20)
  return (data ?? []) as PostbusRij[]
}

export interface AliasRij {
  id: string
  patroon: string
  soort: 'koppel' | 'negeer'
  relatieNaam: string | null
  laatstGebruiktOp: string | null
  createdAt: string
}

export async function getAliassen(): Promise<AliasRij[]> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('mailintake_aliassen')
    .select('id, patroon, soort, laatst_gebruikt_op, created_at, relatie:relaties(naam)')
    .order('created_at', { ascending: false })
    .limit(500)
  return ((data ?? []) as any[]).map(a => ({
    id: a.id,
    patroon: a.patroon,
    soort: a.soort,
    relatieNaam: a.relatie?.naam ?? null,
    laatstGebruiktOp: a.laatst_gebruikt_op,
    createdAt: a.created_at,
  }))
}
