'use server'

/**
 * Muterende server-actions voor objectenbeheer.
 *
 * Alles hier draait op de admin-client (service-role, bypast RLS) en begint daarom
 * met `vereisRecht('objectenbeheer', …)` — anders is elke action als kale RPC
 * aanroepbaar door iedere ingelogde gebruiker.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from '@/lib/dossiers/guards'
import { schrijfPropertyAssetNaarBouw7, syncPropertyAssets } from '@/lib/bouw7/property-assets'
import { objectSchema, type ObjectInvoer, type OvernemenKeuze } from '@/lib/objecten/validations'
import { adresWijktAf, objectAdresRegel } from '@/lib/objecten/adres'
import type { VastgoedObjectRol } from '@everts/database'

export type ActieResultaat<T = undefined> =
  | { ok: true; data?: T; waarschuwing?: string }
  | { ok: false; fout: string }

function herlaad(objectId?: string) {
  revalidatePath('/objecten')
  if (objectId) revalidatePath(`/objecten/${objectId}`)
}

/**
 * Maak een object aan — in EVA én in Bouw7.
 *
 * De Bouw7-create is best-effort: mislukt hij, dan bestaat het object in EVA gewoon
 * met `bouw7_sync_status = 'pending'` en een leesbare reden. Het alternatief (de hele
 * actie laten falen) zou betekenen dat een Bouw7-storing het aanmaken blokkeert.
 *
 * Bouw7 eist `number`, `name` én `invoiceContact`. Die laatste is de opdrachtgever,
 * en die moet in Bouw7 bekend zijn (`relaties.bouw7_id`). Ontbreekt dat, dan slaan we
 * de push over en melden dat.
 */
export async function maakObject(invoer: ObjectInvoer): Promise<ActieResultaat<{ id: string }>> {
  const { medewerker } = await vereisRecht('objectenbeheer', 'schrijven')

  const parsed = objectSchema.safeParse(invoer)
  if (!parsed.success) {
    return { ok: false, fout: parsed.error.issues[0]?.message ?? 'Ongeldige invoer' }
  }
  const v = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  // `limit(1)`: Bouw7 kent hetzelfde nummer soms twee keer, en `maybeSingle()` zou
  // op meerdere treffers een fout geven in plaats van de botsing te melden.
  const { data: bestaand } = await supabase
    .from('vastgoed_objecten').select('id, naam')
    .ilike('objectnummer', v.objectnummer).limit(1).maybeSingle()
  if (bestaand) {
    return { ok: false, fout: `Objectnummer "${v.objectnummer}" is al in gebruik door "${bestaand.naam}".` }
  }

  const { data: nieuw, error } = await supabase
    .from('vastgoed_objecten')
    .insert({ ...v, bron: 'eva', created_by: medewerker.id, bouw7_sync_status: 'pending' })
    .select('id').single()
  if (error) return { ok: false, fout: `Aanmaken mislukt: ${error.message}` }

  const waarschuwing = await pushNaarBouw7(supabase, nieuw.id, v)
  herlaad(nieuw.id)
  return { ok: true, data: { id: nieuw.id }, waarschuwing }
}

/**
 * Werk een object bij. Velden die Bouw7 beheert worden ook daar bijgewerkt
 * (`POST /property-asset` is een upsert: `id` in de body = update).
 */
export async function updateObject(id: string, invoer: ObjectInvoer): Promise<ActieResultaat> {
  await vereisRecht('objectenbeheer', 'schrijven')

  const parsed = objectSchema.safeParse(invoer)
  if (!parsed.success) {
    return { ok: false, fout: parsed.error.issues[0]?.message ?? 'Ongeldige invoer' }
  }
  const v = parsed.data

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: botsing } = await supabase
    .from('vastgoed_objecten').select('id, naam')
    .ilike('objectnummer', v.objectnummer).neq('id', id).limit(1).maybeSingle()
  if (botsing) {
    return { ok: false, fout: `Objectnummer "${v.objectnummer}" is al in gebruik door "${botsing.naam}".` }
  }

  const { error } = await supabase.from('vastgoed_objecten').update(v).eq('id', id)
  if (error) return { ok: false, fout: `Opslaan mislukt: ${error.message}` }

  const waarschuwing = await pushNaarBouw7(supabase, id, v)
  herlaad(id)
  return { ok: true, waarschuwing }
}

/**
 * Zet de Bouw7-relevante velden door naar Bouw7 en sla het resultaat op.
 * Geeft een leesbare waarschuwing terug als het niet lukte — nooit een throw,
 * want een Bouw7-storing mag het opslaan in EVA niet ongedaan maken.
 */
async function pushNaarBouw7(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  objectId: string,
  v: ObjectInvoer,
): Promise<string | undefined> {
  const { data: object } = await supabase
    .from('vastgoed_objecten').select('bouw7_property_asset_id').eq('id', objectId).maybeSingle()

  let bouw7ContactId: number | null = null
  if (v.standaard_opdrachtgever_id) {
    const { data: relatie } = await supabase
      .from('relaties').select('bouw7_id').eq('id', v.standaard_opdrachtgever_id).maybeSingle()
    const ruw = relatie?.bouw7_id
    bouw7ContactId = ruw != null && String(ruw).trim() !== '' ? Number(ruw) : null
  }

  if (!bouw7ContactId) {
    const reden = v.standaard_opdrachtgever_id
      ? 'De opdrachtgever bestaat nog niet in Bouw7.'
      : 'Er is nog geen opdrachtgever gekozen; Bouw7 vereist die bij een object.'
    await supabase.from('vastgoed_objecten')
      .update({ bouw7_sync_status: 'pending', bouw7_sync_fout: reden }).eq('id', objectId)
    return `Het object staat in EVA, maar is nog niet naar Bouw7 gestuurd. ${reden}`
  }

  const res = await schrijfPropertyAssetNaarBouw7({
    ...(object?.bouw7_property_asset_id ? { id: Number(object.bouw7_property_asset_id) } : {}),
    number: v.objectnummer,
    name: v.naam,
    invoiceContact: { id: bouw7ContactId },
    description: v.omschrijving ?? null,
    streetName: v.adres_straat ?? null,
    houseNumber: v.adres_huisnummer ?? null,
    zipCode: v.adres_postcode ?? null,
    city: v.adres_plaats ?? null,
    country: 'NL',
  })

  if (!res.ok) {
    await supabase.from('vastgoed_objecten')
      .update({ bouw7_sync_status: 'error', bouw7_sync_fout: res.fout }).eq('id', objectId)
    return `Het object staat in EVA, maar Bouw7 gaf een fout: ${res.fout}`
  }

  await supabase.from('vastgoed_objecten').update({
    bouw7_property_asset_id: res.bouw7Id,
    bouw7_sync_status: 'synced',
    bouw7_sync_fout: null,
    bouw7_laatst_sync: new Date().toISOString(),
  }).eq('id', objectId)
  return undefined
}

/**
 * Objecten uit Bouw7 ophalen. Handmatige knop; de geplande sync doet dit ook.
 * Vereist `beheren` omdat het alle objecten in één klap kan overschrijven.
 */
export async function synchroniseerObjecten(): Promise<ActieResultaat<{ melding: string }>> {
  await vereisRecht('objectenbeheer', 'beheren')
  const res = await syncPropertyAssets('full')
  herlaad()

  const delen = [
    `${res.nieuw} nieuw`,
    `${res.bijgewerkt} bijgewerkt`,
    ...(res.overgeslagen ? [`${res.overgeslagen} ongewijzigd`] : []),
    ...(res.fouten ? [`${res.fouten} met fout`] : []),
  ]
  if (res.fouten && res.foutMelding) {
    return { ok: true, data: { melding: delen.join(', ') }, waarschuwing: res.foutMelding }
  }
  return { ok: true, data: { melding: delen.join(', ') } }
}

/* ── Relaties bij een object ─────────────────────────────────────────────── */

export async function koppelRelatieAanObject(
  objectId: string, relatieId: string, rol: VastgoedObjectRol, primair = false,
): Promise<ActieResultaat> {
  await vereisRecht('objectenbeheer', 'schrijven')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('vastgoed_object_relaties')
    .upsert({ object_id: objectId, relatie_id: relatieId, rol, primair },
            { onConflict: 'object_id,relatie_id,rol' })
  if (error) return { ok: false, fout: error.message }
  herlaad(objectId)
  return { ok: true }
}

export async function ontkoppelRelatieVanObject(koppelId: string, objectId: string): Promise<ActieResultaat> {
  await vereisRecht('objectenbeheer', 'schrijven')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { error } = await supabase.from('vastgoed_object_relaties').delete().eq('id', koppelId)
  if (error) return { ok: false, fout: error.message }
  herlaad(objectId)
  return { ok: true }
}

/* ── Dossier ↔ object ────────────────────────────────────────────────────── */

/**
 * Koppel een dossier aan een object en neem de gekozen velden over.
 *
 * Alleen de aangevinkte groepen worden gekopieerd, en binnen een groep wordt een
 * al gevuld dossierveld nooit stilzwijgend overschreven — behalve als de gebruiker
 * die groep expliciet aanvinkt. Dat is de hele bedoeling van de vinkjes.
 */
export async function koppelDossierAanObject(
  dossierId: string, objectId: string, overnemen: OvernemenKeuze,
): Promise<ActieResultaat> {
  await vereisRecht('objectenbeheer', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data: object } = await supabase
    .from('vastgoed_objecten').select('*').eq('id', objectId).maybeSingle()
  if (!object) return { ok: false, fout: 'Object niet gevonden' }

  const wijziging: Record<string, unknown> = {
    object_id: objectId,
    object_gekoppeld_op: new Date().toISOString(),
    object_koppel_bron: 'handmatig',
  }

  if (overnemen.werkadres) {
    wijziging.werkadres_straat     = object.adres_straat
    wijziging.werkadres_huisnummer = object.adres_huisnummer
    wijziging.werkadres_postcode   = object.adres_postcode
    wijziging.werkadres_stad       = object.adres_plaats
  }
  if (overnemen.opdrachtgever && object.standaard_opdrachtgever_id) {
    wijziging.klant_id = object.standaard_opdrachtgever_id
    if (object.standaard_contactpersoon_id) wijziging.contactpersoon_id = object.standaard_contactpersoon_id
  }
  if (overnemen.vveCode && object.vve_code) wijziging.vve_code = object.vve_code
  if (overnemen.contactTerPlaatse) {
    wijziging.werkadres_naam     = object.contact_naam
    wijziging.werkadres_telefoon = object.contact_telefoon
    wijziging.werkadres_email    = object.contact_email
  }

  const { error } = await supabase.from('dossiers').update(wijziging).eq('id', dossierId)
  if (error) return { ok: false, fout: `Koppelen mislukt: ${error.message}` }

  herlaad(objectId)
  revalidatePath(`/opdrachten/${dossierId}`)
  return { ok: true }
}

export async function ontkoppelDossierVanObject(dossierId: string): Promise<ActieResultaat> {
  await vereisRecht('objectenbeheer', 'schrijven')
  await assertDossierBewerkbaar(dossierId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  // Het werkadres blijft staan: het dossier is er niet minder concreet op geworden.
  const { error } = await supabase.from('dossiers')
    .update({ object_id: null, object_gekoppeld_op: null, object_koppel_bron: null })
    .eq('id', dossierId)
  if (error) return { ok: false, fout: error.message }

  herlaad()
  revalidatePath(`/opdrachten/${dossierId}`)
  return { ok: true }
}

/**
 * Het object waaraan een dossier hangt, plus of het werkadres ervan afwijkt.
 * Eigen action zodat het koppelblok op het dossier zichzelf kan vullen en de
 * dossier-pagina er geen extra query voor hoeft door te geven.
 */
export async function getDossierObject(dossierId: string): Promise<{
  object: { id: string; naam: string; objectnummer: string; adres: string } | null
  wijktAf: boolean
}> {
  await vereisRecht('objectenbeheer', 'lezen')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('object_id, werkadres_straat, werkadres_huisnummer, werkadres_postcode, werkadres_stad')
    .eq('id', dossierId).maybeSingle()
  if (!dossier?.object_id) return { object: null, wijktAf: false }

  const { data: object } = await supabase
    .from('vastgoed_objecten')
    .select('id, naam, objectnummer, adres_straat, adres_huisnummer, adres_postcode, adres_plaats')
    .eq('id', dossier.object_id).maybeSingle()
  if (!object) return { object: null, wijktAf: false }

  return {
    object: {
      id: object.id,
      naam: object.naam,
      objectnummer: object.objectnummer,
      adres: objectAdresRegel(object),
    },
    wijktAf: adresWijktAf(dossier, object),
  }
}

/** Neem het adres van het object over op een dossier dat ervan is afgeweken. */
export async function neemObjectadresOver(dossierId: string, objectId: string): Promise<ActieResultaat> {
  return koppelDossierAanObject(dossierId, objectId, {
    werkadres: true, opdrachtgever: false, vveCode: false, contactTerPlaatse: false,
  })
}
