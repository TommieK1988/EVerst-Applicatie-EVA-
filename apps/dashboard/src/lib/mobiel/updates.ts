import 'server-only'
import { createClient } from '@everts/database/server'

export type MobielUpdate = {
  id: string
  datum: string
  titel: string
  omschrijving: string
  categorie: 'nieuw' | 'verbeterd' | 'opgelost'
}

/** Mobiel ziet wat voor mobiel geschreven is, plus wat voor iedereen geldt. */
const MOBIEL = ['mobiel', 'beide']

/**
 * Changelog-items voor EVA Mobiel die deze gebruiker nog niet gezien heeft — voor de
 * melding op het startscherm. Leest met de gewone sessie: `changelog` is voor iedere
 * ingelogde gebruiker leesbaar en `changelog_gezien` alleen de eigen rij.
 *
 * Het gezien-moment is een eigen kolom (`gezien_mobiel_op`), los van kantoor: wie op de
 * computer de updates las, moet op de telefoon toch de oproep krijgen om de app opnieuw
 * op te starten. Nooit gezien = alles telt; begrensd op een handvol, de rest is oud nieuws.
 */
export async function haalOngelezenMobielUpdates(userId: string): Promise<MobielUpdate[]> {
  const supabase = await createClient()
  const { data: gezien } = await supabase
    .from('changelog_gezien')
    .select('gezien_mobiel_op')
    .eq('user_id', userId)
    .maybeSingle()
  const drempel = gezien?.gezien_mobiel_op ?? '1970-01-01T00:00:00Z'

  const { data } = await supabase
    .from('changelog')
    .select('id, datum, titel, omschrijving, categorie')
    .eq('gepubliceerd', true)
    .in('doelgroep', MOBIEL)
    .gt('aangemaakt_op', drempel)
    .order('aangemaakt_op', { ascending: false })
    .limit(5)
  return (data ?? []) as MobielUpdate[]
}
