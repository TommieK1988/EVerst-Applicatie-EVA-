'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { vereisBeheerder } from '@/lib/auth/rechten'
import { getBouw7Client } from '@/lib/bouw7/sync'
import { syncUursoorten } from '@/lib/bouw7/derive-stamdata'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type UrenCategorie = 'werk' | 'afwezig' | 'tijd_voor_tijd' | 'feestdag'

const CATEGORIEEN: UrenCategorie[] = ['werk', 'afwezig', 'tijd_voor_tijd', 'feestdag']

/** Deadlines en de terugvalgoedkeurder opslaan. */
export async function setUrenInstellingen(input: {
  terugval_goedkeurder_id: string | null
  tolerantie_uren: number
  indien_deadline_dag: number
  indien_deadline_tijd: string
  goedkeur_deadline_dag: number
  goedkeur_deadline_tijd: string
  goedkeuring_modus: 'eva' | 'bouw7'
}): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()

  const dagGeldig = (d: number) => Number.isInteger(d) && d >= 1 && d <= 7
  if (!dagGeldig(input.indien_deadline_dag) || !dagGeldig(input.goedkeur_deadline_dag)) {
    return { ok: false, error: 'Kies een geldige weekdag (maandag t/m zondag).' }
  }
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(input.indien_deadline_tijd) ||
      !/^\d{2}:\d{2}(:\d{2})?$/.test(input.goedkeur_deadline_tijd)) {
    return { ok: false, error: 'Vul een geldige tijd in (uu:mm).' }
  }
  if (!(input.tolerantie_uren >= 0 && input.tolerantie_uren < 100)) {
    return { ok: false, error: 'De speling moet tussen 0 en 100 uur liggen.' }
  }
  if (!['eva', 'bouw7'].includes(input.goedkeuring_modus)) {
    return { ok: false, error: 'Onbekende goedkeuringsroute.' }
  }

  const { error } = await db().from('uren_instellingen').update({
    terugval_goedkeurder_id: input.terugval_goedkeurder_id || null,
    tolerantie_uren: input.tolerantie_uren,
    indien_deadline_dag: input.indien_deadline_dag,
    indien_deadline_tijd: input.indien_deadline_tijd,
    goedkeur_deadline_dag: input.goedkeur_deadline_dag,
    goedkeur_deadline_tijd: input.goedkeur_deadline_tijd,
    goedkeuring_modus: input.goedkeuring_modus,
  }).eq('id', true)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/**
 * Classificatie van een uursoort. Bepaalt of een dossier + bewakingscode verplicht is en hoe de
 * uren meetellen in het overurensaldo — dus een verkeerde keuze hier vervuilt stilletjes het
 * saldo van iedereen. Alleen uursoorten mét een Bouw7-id zijn te classificeren: de rest kan
 * sowieso niet naar Bouw7 en hoort niet in de weekstaat thuis.
 */
export async function setUursoortCategorie(
  uursoortId: string,
  categorie: UrenCategorie | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  if (categorie !== null && !CATEGORIEEN.includes(categorie)) {
    return { ok: false, error: 'Onbekende categorie.' }
  }

  const supabase = db()
  const { data: soort } = await supabase
    .from('planning_uursoorten')
    .select('id, bouw7_id')
    .eq('id', uursoortId)
    .maybeSingle()
  if (!soort) return { ok: false, error: 'Uursoort niet gevonden.' }
  if (categorie !== null && !soort.bouw7_id) {
    return {
      ok: false,
      error: 'Deze uursoort bestaat niet in Bouw7 en kan daarom niet in de weekstaat gebruikt worden.',
    }
  }

  const { error } = await supabase
    .from('planning_uursoorten')
    .update({ uren_categorie: categorie })
    .eq('id', uursoortId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/** Het dossier waar niet-projectgebonden uren van deze werkmaatschappij op landen. */
export async function setIndirectDossier(
  werkmaatschappijId: string,
  dossierId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const { error } = await db()
    .from('bedrijfsgegevens')
    .update({ indirect_uren_dossier_id: dossierId || null })
    .eq('id', werkmaatschappijId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/**
 * Haalt de volledige uursoortenlijst opnieuw op uit Bouw7. Nieuwe soorten komen binnen zonder
 * categorie en zijn daarmee nog niet kiesbaar — dat is bewust, iemand moet ze eerst indelen.
 */
export async function herlaadUursoorten(): Promise<
  { ok: true; nieuw: number; gevonden: number } | { ok: false; error: string }
> {
  await vereisBeheerder()
  try {
    const client = await getBouw7Client()
    const res = await syncUursoorten(client)
    revalidatePath('/instellingen/uren')
    return { ok: true, nieuw: res.nieuw, gevonden: res.gevonden }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Ophalen uit Bouw7 mislukt.' }
  }
}

/**
 * Overschrijft de goedkeuringsroute voor één ploeg. Bedoeld om met één team proef te draaien op de
 * EVA-keten terwijl de rest in Bouw7 blijft accorderen. null = volg de bedrijfsinstelling.
 */
export async function setPloegModus(
  ploegId: string,
  modus: 'eva' | 'bouw7' | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  if (modus !== null && !['eva', 'bouw7'].includes(modus)) {
    return { ok: false, error: 'Onbekende goedkeuringsroute.' }
  }
  const { error } = await db()
    .from('ploegen')
    .update({ goedkeuring_modus: modus })
    .eq('id', ploegId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}
