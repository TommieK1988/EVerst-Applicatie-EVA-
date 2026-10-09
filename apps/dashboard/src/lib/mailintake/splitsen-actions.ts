'use server'

/**
 * mailintake/splitsen-actions.ts
 *
 * Het afronden van een bericht waar meerdere dossiers uit zijn gekomen. Het
 * aanmaken zelf loopt gewoon via `maakDossierVanBericht` met een `deel`; zie
 * `splitsen.ts` voor het waarom.
 */

import { createAdminClient } from '@everts/database/server'
import { revalidatePath } from 'next/cache'

import { vereisRecht } from '@/lib/auth/rechten'
import { planNabehandeling, voerNabehandelingUit } from './nabehandeling'
import { haalDeelDossiers } from './splitsen'

/**
 * Zet een gesplitst bericht op 'verwerkt'.
 *
 * Pas als de behandelaar zegt dat alle delen er zijn: wat er dan nog in de mail
 * stond, is bewust overgeslagen. Dat staat met de reden in het besluitenlog, zodat
 * een adres dat nergens terechtkwam achteraf terug te vinden is.
 */
export async function rondGesplitstBerichtAf(
  berichtId: string,
  overgeslagen: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { medewerker } = await vereisRecht('mailintake', 'schrijven')
  const supabase = createAdminClient()

  const { data: b } = await supabase
    .from('mailintake_berichten').select('status').eq('id', berichtId).maybeSingle()
  if (!b) return { ok: false, error: 'Bericht niet gevonden.' }
  if (b.status === 'verwerkt') return { ok: false, error: 'Dit bericht is al afgehandeld.' }

  const delen = await haalDeelDossiers(berichtId)
  if (!delen.length) return { ok: false, error: 'Er is nog geen dossier uit dit bericht aangemaakt.' }

  await supabase.from('mailintake_berichten').update({
    status: 'verwerkt',
    besluit: 'handmatig_aangemaakt',
    behandeld_door: medewerker.id,
    behandeld_op: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', berichtId)

  await supabase.from('mailintake_besluiten').insert({
    bericht_id: berichtId, actor: 'medewerker', medewerker_id: medewerker.id,
    actie: 'gesplitst_afgerond',
    details: {
      dossiers: delen.map(d => ({ dossier_id: d.id, dossiernummer: d.dossiernummer })),
      overgeslagen: overgeslagen?.trim() || null,
    },
  })

  await planNabehandeling(berichtId)
  await voerNabehandelingUit(berichtId).catch(() => {})
  revalidatePath('/mailintake')
  return { ok: true }
}
