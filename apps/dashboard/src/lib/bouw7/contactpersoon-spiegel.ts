/**
 * Bouw7-spiegels van een EVA-contactpersoon.
 *
 * Bouw7 hangt een contactpersoon altijd onder precies één contact. Werkt iemand voor twee
 * opdrachtgevers, dan staat hij daar twee keer — in EVA is dat één mens met twee rijen in
 * `contactpersoon_bouw7_koppelingen`. Elke plek die een Bouw7-contactpersoon-id nodig heeft
 * moet daarom zeggen *bij welk bedrijf*: zet je een dossier van opdrachtgever B weg met de
 * spiegel van opdrachtgever A, dan weigert Bouw7 dat (of erger: hij accepteert de verkeerde).
 */

import { createAdminClient } from '@everts/database/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type Spiegel = {
  id: string
  bouw7_id: string
  bouw7_contact_id: string | null
  organisatie_id: string | null
  is_primair: boolean
}

/** Alle Bouw7-spiegels van deze persoon, primaire eerst. */
export async function spiegelsVanContactpersoon(contactpersoonId: string): Promise<Spiegel[]> {
  const { data } = await db()
    .from('contactpersoon_bouw7_koppelingen')
    .select('id, bouw7_id, bouw7_contact_id, organisatie_id, is_primair')
    .eq('contactpersoon_id', contactpersoonId)
    .order('is_primair', { ascending: false })
    .order('created_at')
  return (data ?? []) as Spiegel[]
}

/**
 * Het Bouw7-contactpersoon-id dat bij deze organisatie hoort. Zonder organisatie (of zonder
 * spiegel daarvoor) valt hij terug op de primaire spiegel — dat is precies wat er vóór het
 * ontdubbelen gebeurde en houdt bestaande aanroepers werkend.
 */
export async function bouw7CpIdVoorOrganisatie(
  contactpersoonId: string,
  organisatieId?: string | null,
): Promise<string | null> {
  const spiegels = await spiegelsVanContactpersoon(contactpersoonId)
  if (spiegels.length === 0) {
    // Terugval voor personen die nog geen spiegelrij hebben (bv. net in EVA aangemaakt).
    const { data } = await db().from('contactpersonen').select('bouw7_id').eq('id', contactpersoonId).maybeSingle()
    return data?.bouw7_id ?? null
  }
  if (organisatieId) {
    const raak = spiegels.find(s => s.organisatie_id === organisatieId)
    if (raak) return raak.bouw7_id
  }
  return spiegels[0].bouw7_id
}

/**
 * Leg een zojuist in Bouw7 aangemaakte contactpersoon vast als spiegel. `is_primair` alleen
 * als de persoon er nog geen heeft — de eerste spiegel is de kant waar EVA standaard naartoe
 * schrijft en waar `contactpersonen.bouw7_id` naar wijst.
 */
export async function legSpiegelVast(opts: {
  contactpersoonId: string
  bouw7Id: string | number
  bouw7ContactId?: string | number | null
  organisatieId?: string | null
}): Promise<void> {
  const supabase = db()
  const { data: bestaand } = await supabase
    .from('contactpersoon_bouw7_koppelingen')
    .select('id')
    .eq('contactpersoon_id', opts.contactpersoonId)
    .eq('is_primair', true)
    .maybeSingle()

  const primair = !bestaand
  await supabase
    .from('contactpersoon_bouw7_koppelingen')
    .upsert({
      contactpersoon_id: opts.contactpersoonId,
      bouw7_id:          String(opts.bouw7Id),
      bouw7_contact_id:  opts.bouw7ContactId != null ? String(opts.bouw7ContactId) : null,
      organisatie_id:    opts.organisatieId ?? null,
      bouw7_laatst_sync: new Date().toISOString(),
      is_primair:        primair,
    }, { onConflict: 'bouw7_id' })

  // De primaire spiegel blijft gespiegeld in contactpersonen.bouw7_id: dat is wat de rest van
  // EVA (en de partiële unique index) als "staat in Bouw7" leest.
  if (primair) {
    await supabase
      .from('contactpersonen')
      .update({ bouw7_id: String(opts.bouw7Id), bouw7_sync_status: 'synced' })
      .eq('id', opts.contactpersoonId)
  }
}
