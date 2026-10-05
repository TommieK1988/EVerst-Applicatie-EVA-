'use server'

import { createClient } from '@everts/database/server'

/**
 * Markeer de mobiele updates als gezien. Raakt `gezien_op` (kantoor) niet aan; bestaat er
 * nog geen rij, dan krijgt kantoor het begin der tijden, zodat de kantoorbadge niet
 * stilletjes op nul springt door iets wat op de telefoon gebeurde.
 */
export async function markeerMobielUpdatesGezien(): Promise<void> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const nu = new Date().toISOString()
    const { data: bijgewerkt } = await supabase
      .from('changelog_gezien')
      .update({ gezien_mobiel_op: nu })
      .eq('user_id', user.id)
      .select('user_id')
    if (bijgewerkt && bijgewerkt.length > 0) return

    await supabase
      .from('changelog_gezien')
      .insert({ user_id: user.id, gezien_op: '1970-01-01T00:00:00Z', gezien_mobiel_op: nu })
  } catch {
    /* stil — niet kritiek; dan komt de melding de volgende keer nog eens */
  }
}
