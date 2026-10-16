'use server'

/**
 * Losse instellingen op de offertekaart: nabellen ja/nee en de stilstand. Los van
 * `slaStapOp`/`legUitkomstVast` omdat ze de afgesproken stap niet raken; wel komt er een
 * notitie in de tijdlijn, zodat herleidbaar blijft wie wat wanneer heeft besloten.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { vertaalDbFout, type ActieResultaat } from './types'
import { alsOpvolging, alsStilReden, OPVOLGING_KEUZES, STIL_REDEN_LABEL } from './opvolging'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/

async function kaartId(dossierId: string): Promise<string | null> {
  const supabase = createAdminClient()
  const { data } = await supabase.from('commercie_bewaking').select('id').eq('dossier_id', dossierId).maybeSingle()
  if (data) return data.id
  const { data: nieuw } = await supabase.from('commercie_bewaking')
    .insert({ dossier_id: dossierId, soort: 'offerte' }).select('id').single()
  return nieuw?.id ?? null
}

async function legVast(
  dossierId: string,
  velden: { opvolging?: string | null; stil_reden?: string | null; besluit_datum?: string | null },
  notitie: string, door: string): Promise<ActieResultaat> {
  if (!UUID.test(dossierId)) return { ok: false, error: 'Onbekend dossier.' }
  const id = await kaartId(dossierId)
  if (!id) return { ok: false, error: 'Kon de bewakingskaart niet aanmaken.' }
  const supabase = createAdminClient()
  const { error } = await supabase.from('commercie_bewaking').update(velden).eq('id', id)
  if (error) return { ok: false, error: vertaalDbFout(error.message) }
  await supabase.from('commercie_gebeurtenissen').insert({ bewaking_id: id, soort: 'notitie', tekst: notitie, door })
  revalidatePath('/offertes')
  return { ok: true }
}

/** Nabellen: null = automatisch op bedrag, 'altijd' of 'niet'. */
export async function zetOpvolging(dossierId: string, opvolging: string | null): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  const waarde = alsOpvolging(opvolging)
  const label = OPVOLGING_KEUZES.find(k => k.waarde === waarde)?.label ?? 'Op bedrag'
  return legVast(dossierId, { opvolging: waarde }, `In de belronde: ${label.toLowerCase()}`, medewerker.id)
}

/** Waarom de offerte stilstaat en wanneer de klant beslist; beide mogen leeg. */
export async function zetStilstand(
  dossierId: string,
  stilReden: string | null,
  besluitDatum: string | null,
): Promise<ActieResultaat> {
  const { medewerker } = await vereisRecht('dossiers', 'schrijven')
  const reden = alsStilReden(stilReden)
  const besluit = besluitDatum && ISO_DATUM.test(besluitDatum) ? besluitDatum : null
  const tekst = [
    `Stilstand: ${reden ? STIL_REDEN_LABEL[reden].toLowerCase() : 'geen reden'}`,
    besluit && `besluit verwacht ${besluit}`,
  ].filter(Boolean).join(' · ')
  return legVast(dossierId, { stil_reden: reden, besluit_datum: besluit }, tekst, medewerker.id)
}
