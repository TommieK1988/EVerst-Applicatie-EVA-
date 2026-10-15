import 'server-only'
import { createAdminClient } from '@everts/database/server'

import { dossierHref } from '@/lib/dossiers/href'
import { maakNotificatie } from '@/lib/notificaties/maak'

import { waarGaatHetOver } from './koppeling-tekst'

/**
 * mailintake/melden-koppeling.ts
 *
 * Meldt de projectleider dat er een mail aan zijn dossier is gekoppeld.
 *
 * Zonder dit verdween zo'n mail stil: hij ging uit het Postvak, de bijlagen naar de
 * dossiermap, en wie het dossier draait merkte er niets van tot hij toevallig in die
 * map keek. Juist bij een lopend dossier is een nieuwe mail vaak iets waar de
 * projectleider op moet reageren -- een wijziging, een klacht, een akkoord.
 *
 * In de melding staat waar de mail over gaat (zie `koppeling-tekst.ts`), zodat de
 * projectleider zonder doorklikken ziet of hij er nu iets mee moet.
 *
 * De link gaat naar het dossier en niet naar het bericht in de Mailintake: niet elke
 * projectleider heeft rechten op die module, en het dossier is waar hij werkt.
 *
 * Wie zelf koppelt, krijgt geen melding: die weet het al. Heeft het dossier geen
 * projectleider, dan is er niemand om te melden; dat is bij een verse aanvraag normaal.
 *
 * Gooit niet: het koppelen is dan al gebeurd en mag niet op een melding sneuvelen.
 */
export async function meldKoppelingAanProjectleider(
  berichtId: string,
  dossierId: string,
  gekoppeldDoor: string | null,
): Promise<void> {
  try {
    const supabase = createAdminClient()

    const { data: d } = await supabase
      .from('dossiers')
      .select('dossiernummer, titel, hoofdstatus, servicedesk_substatus, project_manager_id')
      .eq('id', dossierId)
      .maybeSingle()
    if (!d?.project_manager_id || d.project_manager_id === gekoppeldDoor) return

    const { data: pl } = await supabase
      .from('medewerkers').select('auth_user_id')
      .eq('id', d.project_manager_id).eq('actief', true)
      .maybeSingle()
    if (!pl?.auth_user_id) return

    const { data: b } = await supabase
      .from('mailintake_berichten').select('onderwerp, van_naam, van_adres, samenvatting, body_preview')
      .eq('id', berichtId)
      .maybeSingle()

    const afzender = b?.van_naam || b?.van_adres || 'onbekende afzender'
    const onderwerp = (b?.onderwerp ?? '').trim() || '(geen onderwerp)'
    const inhoud = waarGaatHetOver(b?.samenvatting ?? null, b?.body_preview ?? null)

    await maakNotificatie({
      user_id: pl.auth_user_id,
      type: 'mailintake_gekoppeld',
      titel: `Nieuwe mail gekoppeld aan ${d.dossiernummer ?? 'je dossier'}`,
      body: [
        `Van ${afzender}: "${onderwerp}".`,
        inhoud,
        'De mail en bijlagen gaan naar de dossiermap.',
      ].filter(Boolean).join(' '),
      url: dossierHref(dossierId, d.hoofdstatus, d.servicedesk_substatus),
      dossier_id: dossierId,
      dossier_naam: d.titel,
    })
  } catch {
    // stil — zie de kop van dit bestand
  }
}
