'use server'

import { createAdminClient } from '@everts/database/server'
import { appGraphFetch } from '@/lib/o365/graph'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import {
  matchDossierFolder,
  listFolderChildren,
  resolveShareLink,
  resolveDriveContext,
  zoekContainerMappen,
  maakContainerMap,
  haalMapItem,
  dossierMapNaam,
  saneerMapNaam,
  type SharePointBestand,
  type SharePointMap,
  type MatchStatus,
} from '@/lib/o365/sharepoint'
import {
  DOSSIER_SELECT,
  netteFout,
  matchInputVan,
  zorgVoorMap,
  type DossierRij,
  type UploadResultaat,
} from '@/lib/o365/dossier-map'

export type { SharePointBestand, SharePointMap } from '@/lib/o365/sharepoint'
export type { UploadResultaat } from '@/lib/o365/dossier-map'

export type DossierSharePointData = {
  /** O365_DOSSIER_DRIVE_ID is ingesteld. */
  geconfigureerd: boolean
  status: MatchStatus | null
  mapUrl: string | null
  bestanden: SharePointBestand[]
  /** true = map handmatig gekozen; een automatische rematch laat hem met rust. */
  handmatig: boolean
  /** Voorstel voor een nieuwe map: `{dossiernummer} - {titel}`. */
  voorstelNaam: string | null
  /** Bij 'meerdere': de gevonden mappen, zodat de gebruiker direct kan kiezen. */
  kandidaten?: SharePointMap[]
  /** Leesbare reden wanneer er iets misgaat (i.p.v. een crash). */
  fout?: string | null
  /** Neutrale melding (bv. "map bestond al en is gekoppeld"). */
  melding?: string | null
}

const LEEG: DossierSharePointData = {
  geconfigureerd: false,
  status: null,
  mapUrl: null,
  bestanden: [],
  handmatig: false,
  voorstelNaam: null,
  fout: null,
}

/**
 * Negatieve resultaten ('niet_gevonden'/'meerdere') zijn een cache, geen eindoordeel:
 * de container is een calculatie-archief, dus een map die er vandaag niet is kan er
 * morgen wél staan. Na deze TTL probeert EVA het uit zichzelf opnieuw.
 */
const NEGATIEVE_CACHE_MS = 15 * 60 * 1000

function foutData(fout: string, status: MatchStatus | null = null): DossierSharePointData {
  return { geconfigureerd: true, status, mapUrl: null, bestanden: [], handmatig: false, voorstelNaam: null, fout }
}

async function leesDossier(dossierId: string): Promise<DossierRij | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase.from('dossiers').select(DOSSIER_SELECT).eq('id', dossierId).maybeSingle()
  return (data as DossierRij | null) ?? null
}

/** Schrijft de koppeling (of het negatieve resultaat) weg op het dossier. */
async function schrijfKoppeling(
  dossierId: string,
  velden: {
    driveId: string | null
    itemId: string | null
    webUrl: string | null
    status: MatchStatus | null
    handmatig?: boolean
  },
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  await supabase
    .from('dossiers')
    .update({
      sharepoint_drive_id: velden.driveId,
      sharepoint_item_id: velden.itemId,
      sharepoint_web_url: velden.webUrl,
      sharepoint_match_status: velden.status,
      ...(velden.handmatig === undefined ? {} : { sharepoint_handmatig: velden.handmatig }),
      sharepoint_gematcht_op: new Date().toISOString(),
    })
    .eq('id', dossierId)
}

/**
 * Wist de koppeling én het tijdstempel, zodat de eerstvolgende leesactie meteen
 * opnieuw matcht in plaats van tegen de TTL aan te lopen.
 */
async function wisKoppeling(dossierId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  await supabase
    .from('dossiers')
    .update({
      sharepoint_drive_id: null,
      sharepoint_item_id: null,
      sharepoint_web_url: null,
      sharepoint_match_status: null,
      sharepoint_handmatig: false,
      sharepoint_gematcht_op: null,
    })
    .eq('id', dossierId)
}

/** Bouwt het antwoord voor een gekoppelde map: bestanden ophalen, fouten opvangen. */
async function metBestanden(
  dossierId: string,
  d: DossierRij,
  driveId: string,
  itemId: string,
  mapUrl: string | null,
  handmatig: boolean,
  melding?: string,
): Promise<DossierSharePointData> {
  const basis: DossierSharePointData = {
    geconfigureerd: true,
    status: 'gematcht',
    mapUrl,
    bestanden: [],
    handmatig,
    voorstelNaam: dossierMapNaam(d) || null,
    melding: melding ?? null,
    fout: null,
  }
  try {
    const bestanden = await listFolderChildren(driveId, itemId)
    return { ...basis, bestanden: await zonderWordWerkbestanden(dossierId, bestanden) }
  } catch (err) {
    return { ...basis, fout: netteFout(err) }
  }
}

/**
 * Filtert de Word-werkdocumenten van offertes uit de lijst.
 *
 * Die bestanden horen in de dossiermap thuis, maar niet in de bestandenlijst: als
 * losse download omzeilen ze de goedkeuringsgate en het CONCEPT-watermerk dat EVA's
 * eigen offerte-knoppen wél afdwingen. Faalt de lookup, dan tonen we liever te veel
 * dan een lege lijst.
 */
async function zonderWordWerkbestanden(
  dossierId: string,
  bestanden: SharePointBestand[],
): Promise<SharePointBestand[]> {
  try {
    const { getWordWerkbestandItemIds } = await import('@/lib/everts-calc/offerte-word')
    const verbergen = await getWordWerkbestandItemIds(dossierId)
    if (verbergen.size === 0) return bestanden
    return bestanden.filter((b) => !verbergen.has(b.id))
  } catch (err) {
    console.warn('Word-werkbestanden filteren mislukt:', err)
    return bestanden
  }
}

/**
 * Leest de SharePoint-dossierbestanden. Matcht de map autonoom (en cachet de match
 * op het dossier) als dat nog niet gebeurd is; lijst daarna de bestanden.
 * Gooit nooit — geeft bij fouten een `fout`-melding terug.
 */
export async function getDossierSharePointBestanden(dossierId: string): Promise<DossierSharePointData> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return LEEG

  try {
    await vereisSessie()

    const d = await leesDossier(dossierId)
    if (!d) return { ...LEEG, geconfigureerd: true }

    const handmatig = !!d.sharepoint_handmatig
    const gekoppeld = d.sharepoint_match_status === 'gematcht' && !!d.sharepoint_item_id && !!d.sharepoint_drive_id

    if (gekoppeld) {
      return metBestanden(dossierId, d, d.sharepoint_drive_id!, d.sharepoint_item_id!, d.sharepoint_web_url, handmatig)
    }

    // De TTL geldt alleen voor 'niet_gevonden' — dát is het geval dat Graph zou
    // blijven bevragen voor dossiers die (nog) geen map hebben. Bij 'meerdere'
    // matchen we altijd opnieuw: het antwoord zit dan toch in de listing-cache, en
    // alleen zo krijgt de UI de kandidatenlijst mee om uit te kiezen.
    const verlopen =
      !d.sharepoint_gematcht_op || Date.now() - Date.parse(d.sharepoint_gematcht_op) > NEGATIEVE_CACHE_MS
    const cacheGeldig = d.sharepoint_match_status === 'niet_gevonden' && !verlopen

    // Een handmatige koppeling die stukging (map verwijderd) laten we staan i.p.v.
    // hem stilletjes te overschrijven met een automatische match.
    if (handmatig || cacheGeldig) {
      return {
        geconfigureerd: true,
        status: d.sharepoint_match_status,
        mapUrl: d.sharepoint_web_url,
        bestanden: [],
        handmatig,
        voorstelNaam: dossierMapNaam(d) || null,
        fout: null,
      }
    }

    // Nog niet gematcht of de negatieve cache is verlopen → opnieuw proberen en cachen.
    const ctx = await resolveDriveContext(envValue)
    if (!ctx) {
      return foutData(
        'Kon O365_DOSSIER_DRIVE_ID niet herleiden — geef een geldige drive-id of een SharePoint-link naar de dossierbibliotheek/-map.',
      )
    }

    const m = await matchDossierFolder(matchInputVan(d), ctx)
    await schrijfKoppeling(dossierId, {
      driveId: m.driveId ?? null,
      itemId: m.itemId ?? null,
      webUrl: m.webUrl ?? null,
      status: m.status,
    })

    if (m.status === 'gematcht' && m.driveId && m.itemId) {
      return metBestanden(dossierId, d, m.driveId, m.itemId, m.webUrl ?? null, false)
    }

    return {
      geconfigureerd: true,
      status: m.status,
      mapUrl: null,
      bestanden: [],
      handmatig: false,
      voorstelNaam: dossierMapNaam(d) || null,
      kandidaten: m.kandidaten,
      fout: null,
    }
  } catch (err) {
    return foutData(netteFout(err))
  }
}

/** Reset de koppeling en zoekt de map opnieuw (knop bij niet-gevonden/meerdere). */
export async function hermatchDossierSharePoint(dossierId: string): Promise<DossierSharePointData> {
  try {
    await vereisSessie()
    await assertDossierBewerkbaar(dossierId)
    await wisKoppeling(dossierId)
  } catch (err) {
    return foutData(netteFout(err))
  }
  return getDossierSharePointBestanden(dossierId)
}

/* ─── Picker: zoeken, kiezen, aanmaken, ontkoppelen ───────────────────────── */

export type MappenLijst = { ok: boolean; mappen: SharePointMap[]; totaal: number; fout?: string }

/** Zoekt mappen in de dossiercontainer, voor de picker. */
export async function zoekSharePointMappen(
  dossierId: string,
  query: string,
  offset = 0,
  limit = 50,
): Promise<MappenLijst> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return { ok: false, mappen: [], totaal: 0, fout: 'SharePoint niet geconfigureerd.' }

  try {
    await vereisSessie()
    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return { ok: false, mappen: [], totaal: 0, fout: 'Kon de dossierbibliotheek niet bereiken.' }
    const { mappen, totaal } = await zoekContainerMappen(ctx, query, offset, limit)
    return { ok: true, mappen, totaal }
  } catch (err) {
    return { ok: false, mappen: [], totaal: 0, fout: netteFout(err) }
  }
}

/**
 * Koppelt een map die de gebruiker in de picker koos. De itemId komt van de client,
 * dus we halen hem eerst op: bestaat hij, is het een map, en zit hij in de
 * geconfigureerde drive? Zonder die check zou een kale RPC elk dossier naar een
 * willekeurig driveItem kunnen laten wijzen.
 */
export async function koppelDossierMap(dossierId: string, itemId: string): Promise<DossierSharePointData> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return LEEG

  try {
    await vereisSessie()
    await assertDossierBewerkbaar(dossierId)

    const d = await leesDossier(dossierId)
    if (!d) return { ...LEEG, geconfigureerd: true }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return foutData('Kon de dossierbibliotheek niet bereiken.')

    const m = await haalMapItem(ctx.driveId, itemId)
    if (m.status !== 'gematcht' || !m.driveId || !m.itemId || m.driveId !== ctx.driveId) {
      return foutData('Deze map hoort niet bij de ingestelde dossierbibliotheek.', 'niet_gevonden')
    }

    await schrijfKoppeling(dossierId, {
      driveId: m.driveId,
      itemId: m.itemId,
      webUrl: m.webUrl ?? null,
      status: 'gematcht',
      handmatig: true,
    })
    return metBestanden(dossierId, d, m.driveId, m.itemId, m.webUrl ?? null, true)
  } catch (err) {
    return foutData(netteFout(err))
  }
}

/**
 * Maakt een nieuwe dossiermap aan en koppelt hem. Zonder `naam` gebruiken we
 * `{dossiernummer} - {titel}` — de conventie in de container, zodat de automatische
 * match hem later ook zelfstandig terugvindt.
 */
export async function maakDossierMap(dossierId: string, naam?: string): Promise<DossierSharePointData> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return LEEG

  try {
    await vereisSessie()
    await assertDossierBewerkbaar(dossierId)

    const d = await leesDossier(dossierId)
    if (!d) return { ...LEEG, geconfigureerd: true }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return foutData('Kon de dossierbibliotheek niet bereiken.')

    const gewenst = saneerMapNaam(naam?.trim() || dossierMapNaam(d))
    if (!gewenst) return foutData('Geef een mapnaam op.', d.sharepoint_match_status)

    const map = await maakContainerMap(ctx, gewenst)
    await schrijfKoppeling(dossierId, {
      driveId: map.driveId,
      itemId: map.itemId,
      webUrl: map.webUrl,
      status: 'gematcht',
      handmatig: true,
    })
    return metBestanden(
      dossierId,
      d,
      map.driveId,
      map.itemId,
      map.webUrl,
      true,
      map.status === 'bestaat_al' ? 'Deze map bestond al en is nu gekoppeld.' : undefined,
    )
  } catch (err) {
    return foutData(netteFout(err), 'niet_gevonden')
  }
}

/**
 * Haalt de koppeling weg. Raakt **niets** in SharePoint aan — de map en de
 * bestanden blijven onaangeroerd; alleen EVA vergeet welke map erbij hoort.
 *
 * Bewust géén rematch achteraf: die zou de zojuist losgekoppelde map er meteen weer
 * aan hangen. De gebruiker houdt een lege kaart over en kiest zelf een map (of maakt
 * er een). Bij een volgend bezoek probeert EVA het weer automatisch — daarvoor is
 * "Opnieuw zoeken".
 */
export async function ontkoppelDossierMap(dossierId: string): Promise<DossierSharePointData> {
  try {
    await vereisSessie()
    await assertDossierBewerkbaar(dossierId)

    const d = await leesDossier(dossierId)
    if (!d) return { ...LEEG, geconfigureerd: true }

    await wisKoppeling(dossierId)
    return {
      geconfigureerd: true,
      status: 'niet_gevonden',
      mapUrl: null,
      bestanden: [],
      handmatig: false,
      voorstelNaam: dossierMapNaam(d) || null,
      melding: 'Koppeling weggehaald. De map staat nog gewoon in SharePoint.',
      fout: null,
    }
  } catch (err) {
    return foutData(netteFout(err))
  }
}

/** Koppelt handmatig een SharePoint-map via een deel-link (fallback naast de picker). */
export async function koppelDossierMapViaLink(dossierId: string, shareLink: string): Promise<DossierSharePointData> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return LEEG

  try {
    await vereisSessie()
    await assertDossierBewerkbaar(dossierId)

    const d = await leesDossier(dossierId)
    if (!d) return { ...LEEG, geconfigureerd: true }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return foutData('Kon de dossierbibliotheek niet bereiken.')

    let m
    try {
      m = await resolveShareLink(shareLink)
    } catch (err) {
      // Onder Sites.Selected geeft Graph 403 voor links buiten de toegestane sites.
      const msg = netteFout(err)
      return foutData(
        /\b403\b|accessDenied/i.test(msg)
          ? 'EVA heeft geen toegang tot deze locatie. Kies een map uit de dossierbibliotheek.'
          : msg,
        'niet_gevonden',
      )
    }

    if (m.status !== 'gematcht' || !m.driveId || !m.itemId) {
      return foutData(
        'De link kon niet naar een map worden herleid. Plak een link naar de map zelf (niet naar een bestand).',
        'niet_gevonden',
      )
    }
    if (m.driveId !== ctx.driveId) {
      return foutData('Deze map staat buiten de ingestelde dossierbibliotheek.', 'niet_gevonden')
    }

    await schrijfKoppeling(dossierId, {
      driveId: m.driveId,
      itemId: m.itemId,
      webUrl: m.webUrl ?? null,
      status: 'gematcht',
      handmatig: true,
    })
    return metBestanden(dossierId, d, m.driveId, m.itemId, m.webUrl ?? null, true)
  } catch (err) {
    return foutData(netteFout(err))
  }
}

/* ─── Upload (bestanden meegestuurd bij een nieuwe aanvraag) ─────────────── */

/**
 * Upload de meegestuurde bestanden van een (nieuwe) aanvraag naar de SharePoint-dossiermap.
 * Bestaat de map nog niet, dan wordt hij aangemaakt. Gooit nooit — geeft per saldo een
 * `fout`-melding terug zodat de UI het kan tonen zonder de aanvraag te blokkeren.
 */
export async function uploadDossierBestandenNaarSharePoint(
  dossierId: string,
  formData: FormData,
): Promise<UploadResultaat> {
  const envValue = process.env.O365_DOSSIER_DRIVE_ID
  if (!envValue) return { ok: false, geuploaded: 0, fout: 'SharePoint niet geconfigureerd (O365_DOSSIER_DRIVE_ID).' }

  const files = formData.getAll('bestanden').filter((f): f is File => f instanceof File)
  if (files.length === 0) return { ok: true, geuploaded: 0 }

  try {
    await vereisSessie()
    await assertDossierBewerkbaar(dossierId)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createAdminClient() as any
    const d = await leesDossier(dossierId)
    if (!d) return { ok: false, geuploaded: 0, fout: 'Dossier niet gevonden.' }

    const ctx = await resolveDriveContext(envValue)
    if (!ctx) return { ok: false, geuploaded: 0, fout: 'Kon O365_DOSSIER_DRIVE_ID niet herleiden naar een drive/map.' }

    const { driveId, itemId, mapUrl } = await zorgVoorMap(supabase, dossierId, ctx, d)

    // Bestanden uploaden (simple upload; geschikt voor gangbare offerte-/foto-bestanden).
    let geuploaded = 0
    const fouten: string[] = []
    for (const f of files) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer())
        const res = await appGraphFetch(`/drives/${driveId}/items/${itemId}:/${encodeURIComponent(f.name)}:/content`, {
          method: 'PUT',
          headers: { 'Content-Type': f.type || 'application/octet-stream' },
          body: bytes,
        })
        if (res.ok) geuploaded++
        else fouten.push(`${f.name} (${res.status})`)
      } catch (e) {
        fouten.push(`${f.name}: ${netteFout(e)}`)
      }
    }

    return {
      ok: fouten.length === 0,
      geuploaded,
      mapUrl,
      fout: fouten.length ? `Niet geüpload: ${fouten.join(', ')}` : undefined,
    }
  } catch (err) {
    return { ok: false, geuploaded: 0, fout: netteFout(err) }
  }
}
