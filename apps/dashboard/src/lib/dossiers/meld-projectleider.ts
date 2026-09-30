import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { maakNotificatie } from '@/lib/notificaties/maak'

/**
 * Laat de projectleider van een dossier weten wat de buitendienst deed (pakbon, gebruikt
 * materiaal, gereedmelding, opmerking voor kantoor). Niet naar jezelf: doet de projectleider het
 * zelf, dan is een melding in zijn eigen belletje alleen ruis.
 *
 * Los van de 'use server'-modules die hem aanroepen: daar mag alleen een async export staan die
 * als server action bereikbaar is, en dit hoort géén vanaf de client aanroepbare actie te zijn.
 */
export async function meldAanProjectleider(
  dossier: { id: string; titel: string | null; dossiernummer: string | null; project_manager_id: string | null },
  doorMedewerkerId: string,
  melding: { type: string; titel: string; body: string; url: string },
): Promise<void> {
  if (!dossier.project_manager_id || dossier.project_manager_id === doorMedewerkerId) return
  const { data: pl } = await createAdminClient()
    .from('medewerkers')
    .select('auth_user_id')
    .eq('id', dossier.project_manager_id)
    .maybeSingle()
  if (!pl?.auth_user_id) return
  await maakNotificatie({
    user_id: pl.auth_user_id,
    ...melding,
    dossier_id: dossier.id,
    dossier_naam: [dossier.dossiernummer, dossier.titel].filter(Boolean).join(' · ') || null,
  })
}
