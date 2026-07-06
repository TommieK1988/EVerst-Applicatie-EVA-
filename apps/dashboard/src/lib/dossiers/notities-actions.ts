'use server'

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import { assertDossierBewerkbaar } from './guards'

export type DossierNotitie = {
  id: string
  inhoud: string
  created_at: string
  medewerker_id: string | null
  auteur_naam: string
}

function volledigeNaam(m: { voornaam: string | null; tussenvoegsel: string | null; achternaam: string | null } | null): string {
  if (!m) return 'Onbekend'
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim() || 'Onbekend'
}

/** Notities van een dossier, nieuwste eerst, met auteursnaam. */
export async function getDossierNotities(dossierId: string): Promise<DossierNotitie[]> {
  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('dossier_notities')
    .select('id, inhoud, created_at, medewerker_id, medewerkers(voornaam, tussenvoegsel, achternaam)')
    .eq('dossier_id', dossierId)
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return (data as any[]).map(r => ({
    id:            r.id,
    inhoud:        r.inhoud,
    created_at:    r.created_at,
    medewerker_id: r.medewerker_id,
    auteur_naam:   volledigeNaam(r.medewerkers ?? null),
  }))
}

/** Plaats een notitie op een dossier; auteur = ingelogde medewerker. */
export async function plaatsDossierNotitie(
  dossierId: string,
  inhoud: string,
): Promise<{ ok: true; notitie: DossierNotitie } | { ok: false; error: string }> {
  const tekst = inhoud.trim()
  if (!tekst) return { ok: false, error: 'Lege notitie' }
  await assertDossierBewerkbaar(dossierId)

  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd' }

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('dossier_notities')
    .insert({ dossier_id: dossierId, medewerker_id: mw.id, inhoud: tekst })
    .select('id, inhoud, created_at, medewerker_id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Plaatsen mislukt' }

  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  return {
    ok: true,
    notitie: {
      id:            data.id,
      inhoud:        data.inhoud,
      created_at:    data.created_at,
      medewerker_id: data.medewerker_id,
      auteur_naam:   volledigeNaam(mw),
    },
  }
}

/** Verwijder een eigen notitie (alleen de plaatser). */
export async function verwijderDossierNotitie(
  notitieId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const mw = await getCurrentMedewerker()
  if (!mw) return { ok: false, error: 'Niet ingelogd' }

  const supabase = createAdminClient() as any

  // Vangnet: notities van een afgesloten (alleen-lezen) dossier mogen niet verwijderd worden.
  const { data: notitie } = await supabase
    .from('dossier_notities')
    .select('dossier_id')
    .eq('id', notitieId)
    .maybeSingle()
  if (notitie?.dossier_id) await assertDossierBewerkbaar(notitie.dossier_id)

  const { error } = await supabase
    .from('dossier_notities')
    .delete()
    .eq('id', notitieId)
    .eq('medewerker_id', mw.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/opdrachten')
  revalidatePath('/servicedesk')
  return { ok: true }
}
