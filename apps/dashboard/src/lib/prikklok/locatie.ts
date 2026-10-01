import 'server-only'

// Positie en werkadres voor de prikklok: waar staat de medewerker, en hoe ver is dat van het
// dossier? Een dossier kan meerdere werkadressen hebben (geclusterde opdracht, verspreid bezit):
// het hoofdadres op `dossiers` plus de extra adressen uit `dossier_werkadressen`. De afstand is
// steeds die tot het dichtstbijzijnde van die adressen.

import { createAdminClient } from '@everts/database/server'
import { isBoekbaarDossier } from '@/lib/uren/boekbaar'
import { extraWerkadressenVan } from '@/lib/dossiers/werkadressen-data'
import { adresRegel, dichtstbijzijnd, werkpuntenVan, type Werkpunt } from '@/lib/dossiers/werkpunten'
import type { PogingReden, PositieInvoer, PrikklokFase, PrikklokInstellingen } from './types'

export const db = () => createAdminClient()

export const DOSSIER_SELECT = `
  id, dossiernummer, titel, hoofdstatus, opdracht_substatus, servicedesk_substatus, regie_bewakingscode, gearchiveerd, bouw7_id,
  werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad, adres_lat, adres_lng,
  relaties!klant_id ( naam )
`

export type DossierRij = {
  id: string
  dossiernummer: string | null
  titel: string | null
  hoofdstatus: string | null
  opdracht_substatus: string | null
  servicedesk_substatus: string | null
  regie_bewakingscode: string | null
  gearchiveerd: boolean | null
  bouw7_id: string | number | null
  werkadres_straat: string | null
  werkadres_huisnummer: string | null
  werkadres_postcode: string | null
  werkadres_stad: string | null
  adres_lat: number | null
  adres_lng: number | null
  relaties?: { naam?: string | null } | null
}

export const dossierLabel = (d: Pick<DossierRij, 'dossiernummer' | 'titel'>) =>
  [d.dossiernummer, d.titel].filter(Boolean).join(' · ') || 'Dossier'

export const adresVan = (d: DossierRij) => adresRegel(d.werkadres_straat, d.werkadres_huisnummer, d.werkadres_stad)

/**
 * Waarop uren geschreven mogen worden: lopende opdrachten én open servicedeskbonnen. Dezelfde
 * regel als de weekstaat (lib/uren/boekbaar.ts) — wie hier inklokt, moet straks ook een geldige
 * weekstaatregel opleveren.
 */
export const isLopend = (d: DossierRij) => isBoekbaarDossier(d)

export const meter = (m: number) =>
  m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} km`

/* ── Werkadressen van een dossier ─────────────────────────────────── */

/** Alle punten (hoofdadres + extra adressen) met coördinaten van één dossier. */
export async function werkpuntenVanDossier(d: DossierRij): Promise<Werkpunt[]> {
  const extra = await extraWerkadressenVan([d.id])
  return werkpuntenVan(d, extra.get(d.id) ?? [])
}

/** Afstand tot het dichtstbijzijnde werkadres van het dossier; null = geen enkel adres met locatie. */
export async function afstandTotDossier(
  pos: { lat: number; lng: number },
  d: DossierRij,
): Promise<{ punt: Werkpunt; afstand: number } | null> {
  return dichtstbijzijnd(pos, await werkpuntenVanDossier(d))
}

/* ── Positie ──────────────────────────────────────────────────────── */

export type BepaaldePositie = { lat: number; lng: number; nauwkeurigheid: number | null; gesimuleerd: boolean }

/**
 * Zet de invoer om in een positie. Een testlocatie mag alleen in de schaduwfase en neemt de
 * coördinaten van het gekozen dossier over (het hoofdadres, anders het eerste extra adres) — dat
 * is om aan het bureau de schermen te kunnen doorlopen, niet om de straal te omzeilen.
 */
export async function bepaalPositie(
  invoer: PositieInvoer,
  fase: PrikklokFase,
): Promise<BepaaldePositie | { fout: string }> {
  if (invoer.soort === 'test') {
    if (fase !== 'schaduw') return { fout: 'Een testlocatie kan alleen in de testfase.' }
    const { data } = await db().from('dossiers').select(DOSSIER_SELECT).eq('id', invoer.dossierId).maybeSingle()
    const punt = data ? (await werkpuntenVanDossier(data as DossierRij))[0] : undefined
    if (!punt) return { fout: 'Dit dossier heeft geen locatie.' }
    return { lat: punt.lat, lng: punt.lng, nauwkeurigheid: 5, gesimuleerd: true }
  }
  const { lat, lng, nauwkeurigheid } = invoer.positie
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { fout: 'Ongeldige locatie ontvangen.' }
  }
  return {
    lat, lng,
    nauwkeurigheid: nauwkeurigheid != null && Number.isFinite(nauwkeurigheid) ? nauwkeurigheid : null,
    gesimuleerd: false,
  }
}

/** Een fix met een te grote onzekerheid telt niet: bij 300 m marge zegt "binnen 250 m" niets. */
export function teOnnauwkeurig(pos: BepaaldePositie, inst: PrikklokInstellingen): boolean {
  return !pos.gesimuleerd && pos.nauwkeurigheid != null && pos.nauwkeurigheid > inst.max_nauwkeurigheid_m
}

export async function logPoging(p: {
  medewerkerId: string
  actie: 'in' | 'uit'
  reden: PogingReden
  pos?: BepaaldePositie | null
  dichtstbij?: { id: string; afstand: number } | null
}) {
  try {
    await db().from('prikklok_pogingen').insert({
      medewerker_id: p.medewerkerId,
      actie: p.actie,
      reden: p.reden,
      lat: p.pos?.lat ?? null,
      lng: p.pos?.lng ?? null,
      nauwkeurigheid_m: p.pos?.nauwkeurigheid ?? null,
      dichtstbij_dossier_id: p.dichtstbij?.id ?? null,
      dichtstbij_afstand_m: p.dichtstbij ? Math.round(p.dichtstbij.afstand) : null,
      gesimuleerd: p.pos?.gesimuleerd ?? false,
    })
  } catch {
    // Het logboek mag het inklokken nooit laten mislukken.
  }
}
