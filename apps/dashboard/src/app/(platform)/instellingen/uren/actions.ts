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

/** Deadlines, de terugvalgoedkeurder en de kilometervergoedingen opslaan. */
export async function setUrenInstellingen(input: {
  terugval_goedkeurder_id: string | null
  niet_gewerkt_goedkeurder_id: string | null
  /** Dossiers waarop ook gewerkte uren naar de eigen goedkeurder gaan. */
  indirecte_dossier_ids: string[]
  tolerantie_uren: number
  indien_deadline_dag: number
  indien_deadline_tijd: string
  goedkeur_deadline_dag: number
  goedkeur_deadline_tijd: string
  goedkeuring_modus: 'eva' | 'bouw7'
  km_vergoeding_auto: number
  km_vergoeding_bromfiets: number
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
  // Dezelfde grenzen als de check-constraint op de tabel; een tarief van tientjes per kilometer
  // is altijd een typefout.
  const tariefGeldig = (n: number) => Number.isFinite(n) && n >= 0 && n < 10
  if (!tariefGeldig(input.km_vergoeding_auto) || !tariefGeldig(input.km_vergoeding_bromfiets)) {
    return { ok: false, error: 'Een kilometervergoeding moet tussen 0 en 10 euro liggen.' }
  }

  const { error } = await db().from('uren_instellingen').update({
    terugval_goedkeurder_id: input.terugval_goedkeurder_id || null,
    niet_gewerkt_goedkeurder_id: input.niet_gewerkt_goedkeurder_id || null,
    indirecte_dossier_ids: input.indirecte_dossier_ids ?? [],
    tolerantie_uren: input.tolerantie_uren,
    indien_deadline_dag: input.indien_deadline_dag,
    indien_deadline_tijd: input.indien_deadline_tijd,
    goedkeur_deadline_dag: input.goedkeur_deadline_dag,
    goedkeur_deadline_tijd: input.goedkeur_deadline_tijd,
    goedkeuring_modus: input.goedkeuring_modus,
    km_vergoeding_auto: input.km_vergoeding_auto,
    km_vergoeding_bromfiets: input.km_vergoeding_bromfiets,
  }).eq('id', true)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/**
 * Wie beoordeelt het verlof van welke afdeling. Standaard: Uitvoering -> Projectbureau, de rest ->
 * Directie. Iedereen van de beoordelende afdeling mag goed- of afkeuren, zodat een aanvraag niet
 * stilligt als één persoon op vakantie is.
 *
 * Beide kanten moeten een bestaande, actieve afdeling zijn: een route naar een afdeling die niet
 * meer bestaat betekent dat verlof bij niemand terechtkomt.
 */
export async function setVerlofRoutes(
  routes: Record<string, string>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()

  const { data: afdelingen } = await db()
    .from('medewerker_afdelingen').select('naam').eq('actief', true).limit(200)
  const geldig = new Map<string, string>(
    ((afdelingen ?? []) as Array<{ naam: string }>).map(a => [a.naam.trim().toLowerCase(), a.naam]),
  )

  const schoon: Record<string, string> = {}
  for (const [van, naar] of Object.entries(routes ?? {})) {
    const vanNaam = geldig.get((van ?? '').trim().toLowerCase())
    if (!vanNaam) return { ok: false, error: `Onbekende afdeling: ${van}.` }
    const naarNaam = (naar ?? '').trim()
      ? geldig.get(naar.trim().toLowerCase())
      : null
    if (naar?.trim() && !naarNaam) {
      return { ok: false, error: `Onbekende beoordelende afdeling: ${naar}.` }
    }
    if (naarNaam) schoon[vanNaam] = naarNaam
  }

  const { error } = await db()
    .from('uren_instellingen').update({ verlof_routes: schoon }).eq('id', true)
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

/**
 * Een van de twee indirecte-urenprojecten van een werkmaatschappij: `niet_gewerkt` voor verlof,
 * ziek, feestdag en tijd voor tijd; `gewerkt` voor overhead (alle werk van kantoor).
 */
export async function setIndirectDossier(
  werkmaatschappijId: string,
  soort: 'gewerkt' | 'niet_gewerkt',
  dossierId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const kolom = soort === 'gewerkt' ? 'indirect_gewerkt_dossier_id' : 'indirect_uren_dossier_id'
  const { error } = await db()
    .from('bedrijfsgegevens')
    .update({ [kolom]: dossierId || null })
    .eq('id', werkmaatschappijId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/**
 * De afdelingen die nooit een project kiezen. Hun gewerkte uren landen vanzelf op het gewerkte
 * indirecte project van hun werkmaatschappij. Alleen bestaande, actieve afdelingen.
 */
export async function setIndirecteAfdelingen(
  afdelingen: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const { data } = await db()
    .from('medewerker_afdelingen').select('naam').eq('actief', true).limit(200)
  const geldig = new Set(((data ?? []) as Array<{ naam: string }>).map(a => a.naam))
  const onbekend = afdelingen.find(a => !geldig.has(a))
  if (onbekend) return { ok: false, error: `Onbekende afdeling: ${onbekend}.` }

  const { error } = await db()
    .from('uren_instellingen').update({ indirecte_afdelingen: afdelingen }).eq('id', true)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/** Het vaste project voor de gewerkte uren van externen op een kantoorafdeling. */
export async function setExternKantoorDossier(
  dossierId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const { error } = await db()
    .from('uren_instellingen').update({ extern_kantoor_dossier_id: dossierId || null }).eq('id', true)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/instellingen/uren')
  return { ok: true }
}

/**
 * Zet de werkmaatschappij van een medewerker vanaf het urenscherm. Zonder werkmaatschappij weet
 * EVA niet op welk indirect project zijn verlof en overhead horen.
 */
export async function setMedewerkerWerkmaatschappij(
  medewerkerId: string,
  werkmaatschappijId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await vereisBeheerder()
  const { data: wm } = await db()
    .from('bedrijfsgegevens').select('id').eq('id', werkmaatschappijId)
    .eq('type', 'werkmaatschappij').maybeSingle()
  if (!wm) return { ok: false, error: 'Onbekende werkmaatschappij.' }

  const { error } = await db()
    .from('medewerkers').update({ werkmaatschappij_id: werkmaatschappijId }).eq('id', medewerkerId)
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
