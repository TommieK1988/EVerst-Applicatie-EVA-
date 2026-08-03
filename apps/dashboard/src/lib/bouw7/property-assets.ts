'use server'

/**
 * Vastgoedobjecten ↔ Bouw7 `property-assets`.
 *
 * Bouw7 is de bron van waarheid voor de identiteit van een object (nummer, naam, adres,
 * factuurrelatie); EVA verrijkt met eigen velden (contactpersoon ter plaatse, notities,
 * coördinaten, soort) die Bouw7 niet kent en die de sync dus nooit aanraakt.
 *
 * Geverifieerd tegen de live API, aug 2026:
 *  - lezen  : `GET /list/property-assets` (meervoud! enkelvoud geeft 404/403)
 *  - schrijven: `POST /property-asset` — upsert, `id` in de body = update.
 *    Verplicht: `number`, `name`, `invoiceContact`. Let op de asymmetrie: bij het
 *    lezen heet dat veld `invoiceRecipient`.
 */

import { createAdminClient } from '@everts/database/server'
import type { Bouw7PropertyAsset, Bouw7PropertyAssetCreate } from './client'
import { getBouw7Client, fetchAllPages, type SyncMode, type SyncResult } from './sync'
import { fingerprint } from './fingerprint'

/** Bouw7 levert ISO-timestamps; de EVA-kolommen zijn `date`. */
function toDate(dt?: string | null): string | null {
  return dt ? dt.slice(0, 10) : null
}

/** Strip de HTML uit Bouw7's `description` zodat de tekst leesbaar in EVA staat. */
function ontHtml(raw?: string | null): string | null {
  if (!raw) return null
  const tekst = raw
    .replace(/<\s*(br|\/p|\/li|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .split('\n').map((r) => r.trim()).filter(Boolean).join('\n')
  return tekst || null
}

/**
 * Raad de soort uit naam/nummer. Bouw7 kent geen soort-veld, en de gebruiker wil in EVA
 * op VvE/complex kunnen filteren. Alleen een startwaarde bij het aanmaken — de sync
 * overschrijft `soort` daarna nooit meer, zodat handmatige correcties blijven staan.
 */
function raadSoort(a: Bouw7PropertyAsset): 'vve' | 'complex' | 'pand' | 'locatie' | 'overig' {
  const tekst = `${a.name ?? ''} ${a.number ?? ''}`.toLowerCase()
  if (/\bvve\b|vereniging van eigenaren/.test(tekst)) return 'vve'
  if (/complex/.test(tekst)) return 'complex'
  // Een naam die met een straatnaam + huisnummer begint is in de praktijk één pand.
  if (/^\s*[a-z][\w'’\- ]+\s+\d/i.test(a.name ?? '')) return 'pand'
  return 'complex'
}

/**
 * Haal alle Bouw7-vastgoedobjecten op en spiegel ze naar `vastgoed_objecten`.
 *
 * Incrementeel op `bouw7_sync_hash`: ongewijzigde objecten worden overgeslagen zodat de
 * sync geen trigger-churn veroorzaakt. `full` schrijft altijd (drift-correctie).
 *
 * De EVA-eigen velden (soort, contact_*, notities, lat/lng, standaard_contactpersoon_id)
 * staan bewust NIET in de update-payload — die blijven van EVA.
 */
export async function syncPropertyAssets(mode: SyncMode = 'incremental'): Promise<SyncResult> {
  const result: SyncResult = { nieuw: 0, bijgewerkt: 0, fouten: 0, overgeslagen: 0 }
  // `database.types.ts` wordt gegenereerd en kent `vastgoed_objecten` nog niet;
  // zelfde cast-patroon als de rest van de sync-laag.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  try {
    const bouw7 = await getBouw7Client()
    const assets = await fetchAllPages<Bouw7PropertyAsset>(bouw7, '/list/property-assets')

    // Bestaande objecten + hun hash (voor de incrementele overslag).
    const { data: bestaand, error: leesFout } = await supabase
      .from('vastgoed_objecten')
      .select('id, bouw7_property_asset_id, bouw7_sync_hash, objectnummer')
      .not('bouw7_property_asset_id', 'is', null)
    if (leesFout) throw new Error(`Kan bestaande objecten niet lezen: ${leesFout.message}`)

    type BestaandeRij = { id: string; bouw7_property_asset_id: number; bouw7_sync_hash: string | null }
    const perAssetId = new Map<string, { id: string; bouw7_sync_hash: string | null }>(
      ((bestaand ?? []) as BestaandeRij[]).map((o) =>
        [String(o.bouw7_property_asset_id), { id: o.id, bouw7_sync_hash: o.bouw7_sync_hash }]),
    )

    // Bouw7-contact → EVA-relatie, voor `invoiceRecipient` → standaard_opdrachtgever_id.
    const contactIds = [...new Set(assets.map((a) => a.invoiceRecipient?.id).filter(Boolean))].map(String)
    const relatieMap = new Map<string, string>()
    if (contactIds.length) {
      const { data: relaties } = await supabase
        .from('relaties').select('id, bouw7_id').in('bouw7_id', contactIds)
      for (const r of (relaties ?? []) as { id: string; bouw7_id: string }[]) {
        relatieMap.set(r.bouw7_id, r.id)
      }
    }

    const nu = new Date().toISOString()
    const nieuw: Record<string, unknown>[] = []
    const bij: Record<string, unknown>[] = []

    for (const a of assets) {
      if (!a.number?.trim() || !a.name?.trim()) {
        // Zonder nummer kunnen we niet dedupliceren (unique index op objectnummer).
        result.fouten++
        result.foutMelding = `Bouw7-object ${a.id} heeft geen nummer of naam en is overgeslagen`
        continue
      }

      const hash = fingerprint({
        nr: a.number, nm: a.name,
        str: a.streetName ?? null, hnr: a.houseNumber ?? null,
        pc: a.zipCode ?? null, pl: a.city ?? null, land: a.country ?? null,
        oms: a.description ?? null,
        inv: a.invoiceRecipient?.id ?? null,
        d1: a.firstDeliveryDate ?? null, d2: a.secondDeliveryDate ?? null,
      })

      const bestaandeRij = perAssetId.get(String(a.id))
      if (mode !== 'full' && bestaandeRij && bestaandeRij.bouw7_sync_hash === hash) {
        result.overgeslagen!++
        continue
      }

      // Velden die uit Bouw7 komen. Bewust géén soort/contact_*/notities/lat/lng hier:
      // die zijn van EVA en mogen door een sync nooit worden teruggezet.
      const uitBouw7 = {
        objectnummer:               a.number.trim(),
        naam:                       a.name.trim(),
        adres_straat:               a.streetName?.trim() || null,
        adres_huisnummer:           a.houseNumber?.trim() || null,
        adres_postcode:             a.zipCode?.trim() || null,
        adres_plaats:               a.city?.trim() || null,
        adres_land:                 a.country?.trim() || 'NL',
        omschrijving:               ontHtml(a.description),
        standaard_opdrachtgever_id: a.invoiceRecipient?.id
                                      ? (relatieMap.get(String(a.invoiceRecipient.id)) ?? null)
                                      : null,
        eerste_opleverdatum:        toDate(a.firstDeliveryDate),
        tweede_opleverdatum:        toDate(a.secondDeliveryDate),
        bouw7_property_asset_id:    a.id,
        bouw7_sync_hash:            hash,
        bouw7_laatst_sync:          nu,
        bouw7_sync_status:          'synced',
        bouw7_sync_fout:            null,
      }

      if (bestaandeRij) {
        bij.push({ id: bestaandeRij.id, ...uitBouw7 })
      } else {
        nieuw.push({ ...uitBouw7, soort: raadSoort(a), bron: 'bouw7' })
      }
    }

    // Botst een nieuw object op het objectnummer, dan is dat één specifieke, legitieme
    // samenloop: iemand had het object al handmatig in EVA aangemaakt en nu komt het
    // Bouw7-origineel binnen. Die rij adopteren we.
    //
    // Het moet uitdrukkelijk een rij ZONDER `bouw7_property_asset_id` zijn. Bouw7's
    // `number` is namelijk niet uniek — HW1013 en HW1149 staan er elk twee keer in —
    // en zonder die voorwaarde zou de tweede het eerste Bouw7-object overschrijven en
    // een object stilzwijgend uit EVA laten verdwijnen.
    for (const rij of nieuw) {
      const { error } = await supabase.from('vastgoed_objecten').insert(rij)
      if (!error) { result.nieuw++; continue }

      const { data: evaObject } = await supabase
        .from('vastgoed_objecten').select('id')
        .ilike('objectnummer', rij.objectnummer as string)
        .is('bouw7_property_asset_id', null)
        .maybeSingle()

      if (evaObject?.id) {
        const { error: koppelFout } = await supabase
          .from('vastgoed_objecten').update(rij).eq('id', evaObject.id)
        if (koppelFout) { result.fouten++; result.foutMelding = koppelFout.message }
        else result.bijgewerkt++
      } else {
        result.fouten++
        result.foutMelding = `Object "${rij.naam}" (${rij.objectnummer}) kon niet worden opgeslagen: ${error.message}`
      }
    }

    for (let i = 0; i < bij.length; i += 200) {
      const { error } = await supabase
        .from('vastgoed_objecten').upsert(bij.slice(i, i + 200), { onConflict: 'id' })
      if (error) { result.fouten++; result.foutMelding = error.message }
      else result.bijgewerkt += bij.slice(i, i + 200).length
    }
  } catch (e) {
    result.fouten++
    result.foutMelding = e instanceof Error ? e.message : 'Onbekende fout'
  }

  return result
}

export type PropertyAssetSchrijfResultaat =
  | { ok: true; bouw7Id: number }
  | { ok: false; fout: string }

/**
 * Maak of werk een vastgoedobject bij in Bouw7 (`POST /property-asset`, upsert).
 *
 * Best-effort van opzet: de aanroeper beslist of een mislukking blokkerend is. Het object
 * bestaat in EVA ook zonder Bouw7-id; `bouw7_sync_status` legt vast dat het nog niet
 * doorgezet is, zodat het later opnieuw geprobeerd kan worden.
 */
export async function schrijfPropertyAssetNaarBouw7(
  input: Bouw7PropertyAssetCreate,
): Promise<PropertyAssetSchrijfResultaat> {
  try {
    const bouw7 = await getBouw7Client()
    const res = await bouw7.post<Bouw7PropertyAsset>('/property-asset', input)
    if (!res?.id) return { ok: false, fout: 'Bouw7 gaf geen object-id terug' }
    return { ok: true, bouw7Id: res.id }
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : 'Onbekende fout' }
  }
}
