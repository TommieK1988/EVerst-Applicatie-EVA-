/**
 * o365/dossier-map.ts
 *
 * Server-to-server helpers rond de SharePoint-dossiermap: de map bepalen (of
 * aanmaken) en er buffers naartoe uploaden.
 *
 * Bewust `server-only` en géén `'use server'`: in een 'use server'-bestand zou
 * `uploadBuffersNaarDossierMap` een publiek RPC-endpoint zijn dat een willekeurige
 * byte-array plus dossierId accepteert — een ingelogde gebruiker kan dan elk bestand
 * onder elk dossier in SharePoint zetten. De aanroepers zitten allemaal server-side
 * (offerte-verzenden, PDF-route, documenten-archivering), dus een gewone module
 * volstaat en het endpoint verdwijnt.
 */
import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { appGraphFetch } from './graph'
import {
  matchDossierFolder,
  maakContainerMap,
  resolveDriveContext,
  dossierMapNaam,
  saneerMapNaam,
  type DriveContext,
} from './sharepoint'

/**
 * Losjes getypeerde admin-client. De dossier- en dossiermap-tabellen staan niet in de
 * gegenereerde `database.types.ts`, dus een cast is onvermijdelijk — die staat hier één
 * keer in plaats van in elke aanroeper. Gedeeld met de andere dossiermap-modules.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dossierDb(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient() as any
}

export interface DossierRij {
  dossiernummer: string | null
  bouw7_id: string | number | null
  titel: string | null
  /** Bouw7-categorie: bepaalt welke standaardbestanden in de map horen. */
  bouw7_categorie_id: number | null
  /** Werkmaatschappij: tweede filter op de standaardbestanden. */
  werkmaatschappij_id: string | null
  sharepoint_drive_id: string | null
  sharepoint_item_id: string | null
  sharepoint_web_url: string | null
  sharepoint_match_status: 'gematcht' | 'niet_gevonden' | 'meerdere' | null
  sharepoint_handmatig: boolean | null
  sharepoint_gematcht_op: string | null
  /** De mapnaam die EVA zelf schreef; leeg = map gematcht/handmatig gekozen. */
  sharepoint_map_naam: string | null
}

export const DOSSIER_SELECT =
  'dossiernummer, bouw7_id, titel, bouw7_categorie_id, werkmaatschappij_id, sharepoint_drive_id, sharepoint_item_id, sharepoint_web_url, sharepoint_match_status, sharepoint_handmatig, sharepoint_gematcht_op, sharepoint_map_naam'

/** Maakt van een (Graph/token/DB) fout een korte, leesbare melding. */
export function netteFout(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.length > 300 ? msg.slice(0, 300) + '…' : msg
}

/**
 * `bestanden` bevat per geslaagd bestand de driveItem-gegevens, zodat een
 * consument (documenten-module) het bestand kan terugvinden/linken. Consumenten
 * die dat niet nodig hebben (offerte-archivering) negeren het veld.
 */
export type UploadResultaat = {
  ok: boolean
  geuploaded: number
  mapUrl?: string | null
  fout?: string
  bestanden?: { naam: string; driveId: string | null; itemId: string | null; webUrl: string | null }[]
}

export function matchInputVan(d: DossierRij) {
  return {
    dossiernummer: d.dossiernummer,
    bouw7Id: d.bouw7_id != null ? String(d.bouw7_id) : null,
    titel: d.titel,
  }
}

/**
 * `nieuw` zegt of de map zojuist is aangemaakt (dan horen de standaardbestanden erin) en
 * `naam` welke naam EVA daarbij schreef — leeg wanneer de map al bestond, want dan is hij
 * niet van ons en hernoemen we hem nooit.
 */
export type MapResultaat = {
  driveId: string
  itemId: string
  webUrl: string | null
  nieuw: boolean
  naam: string | null
}

/**
 * Bepaalt de dossiermap: bestaande koppeling → autonome match → anders **aanmaken**.
 * Een gloednieuwe aanvraag heeft nog geen map; die maken we hier aan onder de naam
 * `{dossiernummer} - {titel}`, zodat de autonome match hem later terugvindt.
 */
export async function bepaalOfMaakDossierMap(
  ctx: DriveContext,
  d: DossierRij,
): Promise<MapResultaat> {
  const m = await matchDossierFolder(matchInputVan(d), ctx)
  if (m.status === 'gematcht' && m.driveId && m.itemId) {
    return { driveId: m.driveId, itemId: m.itemId, webUrl: m.webUrl ?? null, nieuw: false, naam: null }
  }

  // Niet (uniek) gevonden → map aanmaken. maakContainerMap vangt de naambotsing zelf af.
  const naam = dossierMapNaam(d) || `Dossier ${d.dossiernummer ?? ''}`.trim()
  const map = await maakContainerMap(ctx, naam)
  return {
    driveId: map.driveId,
    itemId: map.itemId,
    webUrl: map.webUrl,
    nieuw: map.status === 'aangemaakt',
    // Alleen een map die EVA zelf aanmaakte mag later meebewegen met de projectnaam.
    // Een map die er al stond is van iemand anders, ook al heet hij precies zo.
    naam: map.status === 'aangemaakt' ? saneerMapNaam(naam) : null,
  }
}

/**
 * Upload één of meer in-memory buffers (bv. offerte-PDF, .eml) naar de SharePoint-
 * dossiermap. Maakt de map zo nodig aan en cachet hem op het dossier. Gooit nooit —
 * geeft bij fouten een `fout`-melding terug zodat de aanroeper niet blokkeert.
 */
export async function uploadBuffersNaarDossierMap(
  dossierId: string,
  bestanden: { naam: string; contentType: string; bytes: Uint8Array }[],
): Promise<UploadResultaat> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return { ok: false, geuploaded: 0, fout: 'SharePoint niet geconfigureerd (O365_DOSSIER_DRIVE_ID).' }
  if (bestanden.length === 0) return { ok: true, geuploaded: 0 }

  try {
    const supabase = dossierDb()
    const { data: dossier } = await supabase.from('dossiers').select(DOSSIER_SELECT).eq('id', dossierId).single()
    const d = dossier as DossierRij | null
    if (!d) return { ok: false, geuploaded: 0, fout: 'Dossier niet gevonden.' }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return { ok: false, geuploaded: 0, fout: 'Kon O365_DOSSIER_DRIVE_ID niet herleiden naar een drive/map.' }

    const map = await zorgVoorMap(supabase, dossierId, ctx, d)
    const { driveId, itemId, mapUrl } = map

    let geuploaded = 0
    const fouten: string[] = []
    const geplaatst: NonNullable<UploadResultaat['bestanden']> = []
    for (const b of bestanden) {
      try {
        const res = await appGraphFetch(`/drives/${driveId}/items/${itemId}:/${encodeURIComponent(b.naam)}:/content`, {
          method: 'PUT',
          headers: { 'Content-Type': b.contentType || 'application/octet-stream' },
          body: b.bytes as unknown as BodyInit,
        })
        if (res.ok) {
          geuploaded++
          // Graph geeft het aangemaakte driveItem terug; best-effort uitlezen zodat
          // een onverwacht antwoord de upload niet alsnog laat "mislukken".
          try {
            const item = await res.json()
            geplaatst.push({
              naam: b.naam,
              driveId: item?.parentReference?.driveId ?? driveId ?? null,
              itemId: item?.id ?? null,
              webUrl: item?.webUrl ?? null,
            })
          } catch {
            geplaatst.push({ naam: b.naam, driveId: driveId ?? null, itemId: null, webUrl: null })
          }
        } else fouten.push(`${b.naam} (${res.status})`)
      } catch (e) {
        fouten.push(`${b.naam}: ${netteFout(e)}`)
      }
    }

    return {
      ok: fouten.length === 0,
      geuploaded,
      mapUrl,
      bestanden: geplaatst,
      fout: fouten.length ? `Niet geüpload: ${fouten.join(', ')}` : undefined,
    }
  } catch (err) {
    return { ok: false, geuploaded: 0, fout: netteFout(err) }
  }
}

/**
 * Zorgt dat er een gekoppelde map is (uit de cache of nieuw) en schrijft de
 * koppeling weg op het dossier. Gedeeld door beide upload-paden.
 */
export async function zorgVoorMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  dossierId: string,
  ctx: DriveContext,
  d: DossierRij,
): Promise<{ driveId: string; itemId: string; mapUrl: string | null; nieuw: boolean }> {
  if (d.sharepoint_match_status === 'gematcht' && d.sharepoint_drive_id && d.sharepoint_item_id) {
    return {
      driveId: d.sharepoint_drive_id,
      itemId: d.sharepoint_item_id,
      mapUrl: d.sharepoint_web_url,
      nieuw: false,
    }
  }

  const map = await bepaalOfMaakDossierMap(ctx, d)
  await supabase
    .from('dossiers')
    .update({
      sharepoint_drive_id: map.driveId,
      sharepoint_item_id: map.itemId,
      sharepoint_web_url: map.webUrl,
      sharepoint_match_status: 'gematcht',
      sharepoint_gematcht_op: new Date().toISOString(),
      // Bewust géén `sharepoint_handmatig`: dat blijft staan op wat het was, zodat een
      // automatisch aangemaakte map niet als handmatige keuze geldt en de zelfherstellende
      // match blijft werken.
      sharepoint_map_naam: map.naam,
    })
    .eq('id', dossierId)

  return { driveId: map.driveId, itemId: map.itemId, mapUrl: map.webUrl, nieuw: map.nieuw }
}

/* ─── Map aanmaken bij een nieuwe aanvraag ────────────────────────────────── */

export type AanmaakResultaat = {
  ok: boolean
  status: 'aangemaakt' | 'bestond_al' | 'overgeslagen'
  mapUrl?: string | null
  /** Aantal geplaatste voorbeeldbestanden uit de instellingen. */
  geplaatst?: number
  fout?: string
}

/**
 * Geeft een nieuwe aanvraag meteen zijn eigen dossiermap, inclusief de
 * voorbeeldbestanden uit de instellingen.
 *
 * **POST-first, bewust niet via `bepaalOfMaakDossierMap`.** Die matcht eerst, en dat
 * pagineert de hele container (honderden mappen) — precies de wachttijd die je in de
 * aanvraagmodal niet wilt. Bij een zojuist door Bouw7 uitgegeven dossiernummer kán er nog
 * geen map met dat prefix zijn, dus we posten direct; `maakContainerMap` valt bij de
 * onwaarschijnlijke 409 zelf terug op de listing.
 *
 * Idempotent en gooit nooit: een dossier dat al een map heeft wordt overgeslagen.
 */
export async function zorgVoorDossierMapBijAanmaak(dossierId: string): Promise<AanmaakResultaat> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return { ok: true, status: 'overgeslagen' }

  try {
    const supabase = dossierDb()
    const { data } = await supabase.from('dossiers').select(DOSSIER_SELECT).eq('id', dossierId).maybeSingle()
    const d = data as DossierRij | null
    if (!d) return { ok: false, status: 'overgeslagen', fout: 'Dossier niet gevonden.' }

    // Al een map → niets te doen.
    if (d.sharepoint_item_id && d.sharepoint_drive_id) return { ok: true, status: 'overgeslagen' }

    // Zonder dossiernummer zou de map alleen de titel als naam krijgen, en daarmee is hij
    // niet meer op nummer terug te vinden. De naloop pakt hem op zodra Bouw7 het nummer
    // alsnog levert (`sharepoint_map_gewenst` blijft tot dan staan).
    if (!d.dossiernummer) return { ok: true, status: 'overgeslagen' }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return { ok: false, status: 'overgeslagen', fout: 'Kon de dossierbibliotheek niet bereiken.' }

    const naam = saneerMapNaam(dossierMapNaam(d))
    if (!naam) return { ok: true, status: 'overgeslagen' }

    const map = await maakContainerMap(ctx, naam)
    const nieuw = map.status === 'aangemaakt'

    await supabase
      .from('dossiers')
      .update({
        sharepoint_drive_id: map.driveId,
        sharepoint_item_id: map.itemId,
        sharepoint_web_url: map.webUrl,
        sharepoint_match_status: 'gematcht',
        sharepoint_handmatig: false,
        sharepoint_gematcht_op: new Date().toISOString(),
        // Alleen onze eigen map mag later meebewegen met de projectnaam.
        sharepoint_map_naam: nieuw ? naam : null,
      })
      .eq('id', dossierId)

    if (!nieuw) return { ok: true, status: 'bestond_al', mapUrl: map.webUrl }

    // Voorbeeldbestanden alleen in een verse map: een bestaande map is van de calculator.
    const { plaatsStandaardbestanden } = await import('./dossiermap-standaardbestanden')
    const res = await plaatsStandaardbestanden(d, { driveId: map.driveId, itemId: map.itemId })

    return {
      ok: res.fouten.length === 0,
      status: 'aangemaakt',
      mapUrl: map.webUrl,
      geplaatst: res.geplaatst,
      fout: res.fouten.length ? res.fouten.join(' · ') : undefined,
    }
  } catch (err) {
    return { ok: false, status: 'overgeslagen', fout: netteFout(err) }
  }
}
