import 'server-only'
import { createAdminClient } from '@everts/database/server'

/**
 * mailintake/splitsen.ts
 *
 * Eén bericht, meerdere dossiers. Een mail van een beheerder over twee panden is
 * twee klussen: twee werkadressen, twee Bouw7-projecten, op dezelfde opdrachtgever.
 * Tot dit er was maakte de intake er één dossier van en stond het tweede adres
 * alleen in de opmerkingen -- en daar raakte het zoek.
 *
 * Een gesplitst bericht houdt `dossier_id` leeg. De delen hangen via
 * `dossiers.mailintake_bericht_id` aan het bericht; dat veld zet het aanmaken voor
 * elk dossier toch al. Het bericht blijft open tot de behandelaar het afrondt --
 * zie `rondGesplitstBerichtAf` in `splitsen-actions.ts`.
 */

export interface DeelDossier {
  id: string
  dossiernummer: string | null
  titel: string | null
}

/** De dossiers die al uit dit bericht zijn gemaakt, oudste eerst. */
export async function haalDeelDossiers(berichtId: string): Promise<DeelDossier[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('dossiers')
    .select('id, dossiernummer, titel')
    .eq('mailintake_bericht_id', berichtId)
    .order('created_at')
    .limit(50)
  return (data ?? []) as DeelDossier[]
}
