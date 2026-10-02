'use server'

/**
 * Extra werkadressen van een dossier — voor geclusterde opdrachten (meerdere vestigingen,
 * verspreid bezit). Het hoofdadres blijft werkadres_* op `dossiers` en gaat two-way met Bouw7;
 * deze adressen zijn EVA-eigen. Zie de migratie 20261001p_dossier_werkadressen.sql.
 *
 * Na opslaan geocoderen we het adres meteen, zodat de prikklok er direct mee werkt. Lukt dat niet
 * (Nominatim onbereikbaar), dan blijft `geocode_status` null en pakt de cron hem later op.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { GeenToegangError, vereisRecht } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'
import { geocodeWerkadres } from './geocode'
import { WERKADRES_SELECT, type ExtraWerkadresRij } from './werkadressen-data'

const db = () => createAdminClient()

export type ExtraWerkadres = ExtraWerkadresRij

export type WerkadresInvoer = {
  naam: string | null
  straat: string | null
  huisnummer: string | null
  postcode: string | null
  stad: string | null
  contact_naam: string | null
  contact_telefoon: string | null
}

type Resultaat = { ok: true; werkadres: ExtraWerkadres } | { ok: false; error: string }

const leeg = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t ? t : null
}

function schoon(invoer: WerkadresInvoer): WerkadresInvoer {
  const pc = leeg(invoer.postcode)
  return {
    naam: leeg(invoer.naam),
    straat: leeg(invoer.straat),
    huisnummer: leeg(invoer.huisnummer),
    // "1234ab" → "1234 AB", zoals de rest van EVA hem toont.
    postcode: pc && /^\d{4}\s?[a-z]{2}$/i.test(pc) ? `${pc.slice(0, 4)} ${pc.slice(-2).toUpperCase()}` : pc,
    stad: leeg(invoer.stad),
    contact_naam: leeg(invoer.contact_naam),
    contact_telefoon: leeg(invoer.contact_telefoon),
  }
}

function fout(e: unknown, standaard: string): { ok: false; error: string } {
  if (e instanceof GeenToegangError) return { ok: false, error: e.message || standaard }
  return { ok: false, error: standaard }
}

/** Geocodeer één rij en geef de bijgewerkte rij terug. Faalt stil: de cron probeert het later. */
async function geocodeRij(id: string): Promise<ExtraWerkadres | null> {
  const { data: rij } = await db().from('dossier_werkadressen').select(WERKADRES_SELECT).eq('id', id).maybeSingle()
  if (!rij) return null
  try {
    const punt = await geocodeWerkadres(rij.straat, rij.huisnummer, rij.postcode, rij.stad)
    const { data } = await db()
      .from('dossier_werkadressen')
      .update({
        lat: punt?.lat ?? null,
        lng: punt?.lng ?? null,
        geocode_status: punt ? 'ok' : 'geen_match',
        geocode_op: new Date().toISOString(),
      })
      .eq('id', id)
      .select(WERKADRES_SELECT)
      .maybeSingle()
    return (data as ExtraWerkadres | null) ?? (rij as ExtraWerkadres)
  } catch {
    return rij as ExtraWerkadres
  }
}

/** Desktop houdt de lijst zelf bij in de component; de mobiele dossierpagina is server-gerenderd. */
function vernieuw(dossierId: string) {
  revalidatePath(`/m/dossiers/${dossierId}`, 'layout')
}

export async function haalExtraWerkadressen(dossierId: string): Promise<ExtraWerkadres[]> {
  await vereisRecht('dossiers', 'lezen')
  const { data } = await db()
    .from('dossier_werkadressen')
    .select(WERKADRES_SELECT)
    .eq('dossier_id', dossierId)
    .order('volgorde')
    .order('aangemaakt_op')
    .limit(200)
  return (data ?? []) as ExtraWerkadres[]
}

export async function voegWerkadresToe(dossierId: string, invoer: WerkadresInvoer): Promise<Resultaat> {
  try {
    const { medewerker } = await vereisRecht('dossiers', 'schrijven')
    await assertDossierBewerkbaar(dossierId)
    const velden = schoon(invoer)
    if (!velden.straat && !velden.postcode) return { ok: false, error: 'Vul in elk geval straat of postcode in.' }

    const { data: laatste } = await db()
      .from('dossier_werkadressen')
      .select('volgorde')
      .eq('dossier_id', dossierId)
      .order('volgorde', { ascending: false })
      .limit(1)
      .maybeSingle()

    const { data, error } = await db()
      .from('dossier_werkadressen')
      .insert({ ...velden, dossier_id: dossierId, volgorde: (laatste?.volgorde ?? 0) + 1, aangemaakt_door: medewerker.id })
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: 'Het werkadres kon niet worden opgeslagen.' }

    const werkadres = await geocodeRij(data.id)
    vernieuw(dossierId)
    return werkadres ? { ok: true, werkadres } : { ok: false, error: 'Het werkadres kon niet worden gelezen.' }
  } catch (e) {
    return fout(e, 'Je hebt geen rechten om werkadressen toe te voegen.')
  }
}

export async function wijzigWerkadres(id: string, invoer: WerkadresInvoer): Promise<Resultaat> {
  try {
    await vereisRecht('dossiers', 'schrijven')
    const { data: huidig } = await db().from('dossier_werkadressen').select('dossier_id').eq('id', id).maybeSingle()
    if (!huidig) return { ok: false, error: 'Dit werkadres bestaat niet meer.' }
    await assertDossierBewerkbaar(huidig.dossier_id)
    const velden = schoon(invoer)
    if (!velden.straat && !velden.postcode) return { ok: false, error: 'Vul in elk geval straat of postcode in.' }

    // De trigger nult de coördinaten als het adres wijzigt; dan opnieuw geocoderen.
    const { data, error } = await db()
      .from('dossier_werkadressen')
      .update(velden)
      .eq('id', id)
      .select(WERKADRES_SELECT)
      .single()
    if (error || !data) return { ok: false, error: 'Het werkadres kon niet worden opgeslagen.' }

    const werkadres = data.geocode_status == null ? await geocodeRij(id) : (data as ExtraWerkadres)
    vernieuw(huidig.dossier_id)
    return werkadres ? { ok: true, werkadres } : { ok: false, error: 'Het werkadres kon niet worden gelezen.' }
  } catch (e) {
    return fout(e, 'Je hebt geen rechten om werkadressen te wijzigen.')
  }
}

export async function verwijderWerkadres(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await vereisRecht('dossiers', 'schrijven')
    const { data: huidig } = await db().from('dossier_werkadressen').select('dossier_id').eq('id', id).maybeSingle()
    if (!huidig) return { ok: true }
    await assertDossierBewerkbaar(huidig.dossier_id)
    const { error } = await db().from('dossier_werkadressen').delete().eq('id', id)
    if (error) return { ok: false, error: 'Het werkadres kon niet worden verwijderd.' }
    vernieuw(huidig.dossier_id)
    return { ok: true }
  } catch (e) {
    return fout(e, 'Je hebt geen rechten om werkadressen te verwijderen.')
  }
}
