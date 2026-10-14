'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisSessie } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'

/**
 * Aanvullingen op het opleverrapport naar het voorbeeld van het team: punten die góéd zijn
 * uitgevoerd, en vrije tekst (algemene opmerkingen + afspraken) per oplevermoment.
 *
 * Een eigen module omdat `oplevering.ts` al ruim boven de regellimiet zit.
 */

const db = () => createAdminClient()

/**
 * Legt een goed uitgevoerd punt vast bij een oplevermoment.
 *
 * Zelfde nummerreeks als de opleverpunten van het moment (één volgnummer per rij), maar meteen
 * `geaccepteerd`: er valt niets te herstellen of toe te wijzen. Daardoor telt het overal al als
 * afgerond — herinneringen, gereed-controle en betaalsignaal hoeven er niets van te weten.
 * Foto's gaan daarna via `uploadOpleverFoto` met soort `algemeen`.
 */
export async function maakGoedPunt(
  momentId: string,
  data: { omschrijving: string; ruimte?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const mw = await vereisSessie()
  const omschrijving = data.omschrijving.trim()
  if (!omschrijving) return { ok: false, error: 'Omschrijving is verplicht' }

  const supabase = db()
  const { data: moment } = await supabase
    .from('oplever_momenten').select('dossier_id').eq('id', momentId).maybeSingle()
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden' }
  await assertDossierBewerkbaar(moment.dossier_id)

  const { data: maxRow } = await supabase
    .from('oplever_punten').select('volgnummer').eq('moment_id', momentId)
    .order('volgnummer', { ascending: false }).limit(1).maybeSingle()

  const nu = new Date().toISOString()
  const { data: ins, error } = await supabase
    .from('oplever_punten')
    .insert({
      moment_id: momentId,
      dossier_id: moment.dossier_id,
      volgnummer: (maxRow?.volgnummer ?? 0) + 1,
      omschrijving,
      ruimte: data.ruimte?.trim() || null,
      is_goed: true,
      status: 'geaccepteerd',
      afgemeld_op: nu,
      geaccepteerd_op: nu,
      created_by: mw.id,
    })
    .select('id')
    .single()
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${moment.dossier_id}/kam`)
  return { ok: true, id: ins.id }
}

/** Slaat "Algemene opmerkingen" en/of "Afspraken" van een oplevermoment op. Leeg = weghalen. */
export async function updateMomentTeksten(
  momentId: string,
  teksten: { opmerking?: string | null; afspraken?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisSessie()
  const supabase = db()
  const { data: moment } = await supabase
    .from('oplever_momenten').select('dossier_id').eq('id', momentId).maybeSingle()
  if (!moment) return { ok: false, error: 'Oplevermoment niet gevonden' }
  await assertDossierBewerkbaar(moment.dossier_id)

  const velden: { updated_at: string; opmerking?: string | null; afspraken?: string | null } = {
    updated_at: new Date().toISOString(),
  }
  if (teksten.opmerking !== undefined) velden.opmerking = teksten.opmerking?.trim() || null
  if (teksten.afspraken !== undefined) velden.afspraken = teksten.afspraken?.trim() || null

  const { error } = await supabase.from('oplever_momenten').update(velden).eq('id', momentId)
  if (error) return { ok: false, error: error.message }
  revalidatePath(`/opdrachten/${moment.dossier_id}/kam`)
  return { ok: true }
}
