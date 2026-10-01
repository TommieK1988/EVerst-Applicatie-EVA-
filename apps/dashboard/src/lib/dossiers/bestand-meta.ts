'use server'

/**
 * Wat EVA per dossierbestand bijhoudt naast de bron: de soort en (voor Bouw7) een
 * eigen weergavenaam. Plus de twee acties uit het voorvertoningspaneel die de bron
 * wél raken: een SharePoint-bestand hernoemen en een SharePoint-voorvertoning ophalen.
 *
 * Elke action begint met een rechtencheck: ze schrijven met de service role, en een
 * server action is ook als kale RPC aan te roepen.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import {
  bestandStaatInMap, haalVoorvertoningUrl, hernoemBestandItem, saneerBestandsnaam,
} from '@/lib/o365/sharepoint-bestand'
import type { BestandMeta, BestandSoortDef } from './bestand-soort'

type Resultaat = { ok: true } | { ok: false; error: string }

export type BestandMetaData = { meta: BestandMeta[]; soorten: BestandSoortDef[] }

/**
 * Meta van één dossier plus álle soorten (ook inactieve: een handmatig gekozen soort
 * die later is uitgezet moet nog een naam hebben). Faalt stil naar leeg, zodat de
 * lijst blijft werken als de tabellen er (nog) niet zijn.
 */
export async function getBestandMeta(dossierId: string): Promise<BestandMetaData> {
  await vereisRecht('dossiers', 'lezen')
  const db = createAdminClient()
  const [meta, soorten] = await Promise.all([
    // Begrensd door het dossier: zoveel bestanden heeft geen enkel dossier.
    db.from('dossier_bestand_meta').select('sleutel, weergavenaam, soort_id').eq('dossier_id', dossierId),
    // Beheerlijst van een handvol soorten.
    db.from('bestand_soorten').select('*').order('volgorde').order('naam').limit(500),
  ])
  return {
    meta: (meta.data ?? []).map(m => ({ sleutel: m.sleutel, weergavenaam: m.weergavenaam, soortId: m.soort_id })),
    soorten: soorten.data ?? [],
  }
}

/** Handmatig een soort kiezen; `null` = terug naar automatisch herkennen. */
export async function zetBestandSoort(dossierId: string, sleutel: string, soortId: string | null): Promise<Resultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  const { error } = await createAdminClient()
    .from('dossier_bestand_meta')
    .upsert({
      dossier_id: dossierId,
      sleutel,
      soort_id: soortId,
      bijgewerkt_door: medewerker.id,
      bijgewerkt_op: new Date().toISOString(),
    }, { onConflict: 'dossier_id,sleutel' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export type HernoemInvoer = {
  sleutel: string
  bron: 'Bouw7' | 'SharePoint'
  /** Alleen bij SharePoint; uit de `bronQuery` van de rij. */
  driveId?: string | null
  itemId?: string | null
  extensie: string | null
}

export type HernoemResultaat =
  | { ok: true; naam: string; webUrl?: string | null }
  | { ok: false; error: string }

/**
 * Hernoemt een bestand. `nieuweNaam` is zonder extensie; die blijft altijd staan, zodat
 * een bestand niet per ongeluk onopenbaar wordt.
 *
 * - SharePoint: echt hernoemen in SharePoint.
 * - Bouw7: kan niet via de API, dus EVA bewaart een weergavenaam. Leeg = terug naar
 *   de Bouw7-naam.
 *
 * Staat het bestand in het klantportaal, dan gaat de naam daar mee: het portaal
 * bewaart een bevroren kopie van de naam.
 */
export async function hernoemDossierBestand(
  dossierId: string,
  invoer: HernoemInvoer,
  nieuweNaam: string,
): Promise<HernoemResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  await assertDossierBewerkbaar(dossierId)
  const db = createAdminClient()

  const basis = saneerBestandsnaam(nieuweNaam)
  const ext = invoer.extensie?.replace(/^\./, '') || null
  const metExtensie = (n: string) =>
    !ext || n.toLowerCase().endsWith(`.${ext.toLowerCase()}`) ? n : `${n}.${ext}`

  let naam: string
  let webUrl: string | null | undefined

  if (invoer.bron === 'SharePoint') {
    if (!basis) return { ok: false, error: 'Geef een naam op.' }
    if (!invoer.driveId || !invoer.itemId) return { ok: false, error: 'Onbekend SharePoint-bestand.' }

    const { data: d } = await db
      .from('dossiers')
      .select('sharepoint_drive_id, sharepoint_item_id')
      .eq('id', dossierId)
      .maybeSingle()
    if (!d?.sharepoint_item_id || d.sharepoint_drive_id !== invoer.driveId
      || !(await bestandStaatInMap(invoer.driveId, invoer.itemId, d.sharepoint_item_id))) {
      return { ok: false, error: 'Dit bestand staat niet in de dossiermap.' }
    }

    const res = await hernoemBestandItem(invoer.driveId, invoer.itemId, metExtensie(basis))
    switch (res.status) {
      case 'hernoemd': naam = res.naam; webUrl = res.webUrl; break
      case 'naam_bezet': return { ok: false, error: 'Er staat al een bestand met die naam in de map.' }
      case 'in_gebruik': return { ok: false, error: 'Het bestand is ergens geopend. Sluit het en probeer het opnieuw.' }
      case 'niet_gevonden': return { ok: false, error: 'Het bestand bestaat niet meer in SharePoint.' }
      default: return { ok: false, error: `Hernoemen mislukt: ${res.fout}` }
    }
  } else {
    const { error } = await db
      .from('dossier_bestand_meta')
      .upsert({
        dossier_id: dossierId,
        sleutel: invoer.sleutel,
        weergavenaam: basis || null,
        bijgewerkt_door: medewerker.id,
        bijgewerkt_op: new Date().toISOString(),
      }, { onConflict: 'dossier_id,sleutel' })
    if (error) return { ok: false, error: error.message }
    naam = basis
  }

  // Leeg bij Bouw7 = terug naar de Bouw7-naam; die kennen we hier niet, dus het
  // portaal houdt dan wat het had.
  if (naam) {
    await db
      .from('portaal_bestanden')
      .update({ naam: invoer.bron === 'Bouw7' ? metExtensie(naam) : naam })
      .eq('dossier_id', dossierId)
      .eq('sleutel', invoer.sleutel)
  }

  revalidatePath(`/opdrachten/${dossierId}/bestanden`)
  return { ok: true, naam, webUrl }
}

/** Kortlevende insluitlink voor de voorvertoning van een SharePoint-bestand. */
export async function getSharePointVoorvertoning(
  dossierId: string,
  driveId: string,
  itemId: string,
): Promise<string | null> {
  await vereisRecht('dossiers', 'lezen')
  const { data: d } = await createAdminClient()
    .from('dossiers')
    .select('sharepoint_drive_id, sharepoint_item_id')
    .eq('id', dossierId)
    .maybeSingle()
  if (!d?.sharepoint_item_id || d.sharepoint_drive_id !== driveId) return null
  if (!(await bestandStaatInMap(driveId, itemId, d.sharepoint_item_id))) return null
  return haalVoorvertoningUrl(driveId, itemId)
}
