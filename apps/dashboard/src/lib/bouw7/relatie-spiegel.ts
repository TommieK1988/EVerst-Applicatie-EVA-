/**
 * Bouw7-spiegels van een EVA-relatie.
 *
 * Bouw7 geeft een contact precies één type: klant, leverancier of onderaannemer. Een bedrijf
 * dat twee rollen heeft — Van der Kraan Totaalonderhoud koopt bij ons in én levert aan ons —
 * staat daar dus twee keer. In EVA is dat één relatie met `types = {opdrachtgever,leverancier}`
 * en twee rijen in `relatie_bouw7_koppelingen`.
 *
 * Elke plek die een Bouw7-contact-id nodig heeft moet daarom zeggen *in welke rol*: een
 * verkooporder hoort bij de klant-spiegel, een bestelling bij de leverancier-spiegel. Schrijf
 * je naar de verkeerde, dan komt de regel bij Bouw7 onder het verkeerde contact te hangen.
 *
 * Andersom is even belangrijk: `relatieIdVoorBouw7Contact` vertaalt een Bouw7-contact terug
 * naar de EVA-relatie. Dat moet via de spiegels en niet via `relaties.bouw7_id`, want na een
 * samenvoeging staat dat veld bij de verliezer leeg terwijl zijn spiegel naar de blijver is
 * verhuisd — een project op het oude contact hoort gewoon bij de overgebleven relatie.
 */

import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'

const db = () => createAdminClient()

/** De rollen zoals EVA ze kent; gelijk aan `relaties.types` en `bouw7_type`. */
export type RelatieRol = 'opdrachtgever' | 'leverancier' | 'onderaannemer'

export type RelatieSpiegel = {
  id: string
  relatie_id: string
  bouw7_id: string
  bouw7_type: string | null
  is_primair: boolean
}

/** Alle Bouw7-spiegels van deze relatie, primaire eerst. */
export async function spiegelsVanRelatie(relatieId: string): Promise<RelatieSpiegel[]> {
  const { data } = await db()
    .from('relatie_bouw7_koppelingen')
    .select('id, relatie_id, bouw7_id, bouw7_type, is_primair')
    .eq('relatie_id', relatieId)
    .order('is_primair', { ascending: false })
    .order('created_at')
  return (data ?? []) as RelatieSpiegel[]
}

/**
 * Het Bouw7-contact-id waarmee deze relatie in de gevraagde rol bekend staat. Zonder rol (of
 * zonder spiegel daarvoor) valt hij terug op de primaire spiegel — dat is precies wat er vóór
 * het ontdubbelen gebeurde en houdt bestaande aanroepers werkend.
 */
export async function bouw7IdVoorRol(
  relatieId: string,
  rol?: RelatieRol | null,
): Promise<string | null> {
  const spiegels = await spiegelsVanRelatie(relatieId)
  if (spiegels.length === 0) {
    // Terugval voor relaties die nog geen spiegelrij hebben (bv. net in EVA aangemaakt).
    const { data } = await db().from('relaties').select('bouw7_id').eq('id', relatieId).maybeSingle()
    return data?.bouw7_id ?? null
  }
  if (rol) {
    const raak = spiegels.find(s => s.bouw7_type === rol)
    if (raak) return raak.bouw7_id
  }
  return spiegels[0].bouw7_id
}

/**
 * Alle spiegels als map `bouw7_id → relatie_id`. Dit is de vertaling die de sync overal nodig
 * heeft: welk Bouw7-contact hoort bij welke EVA-relatie.
 *
 * Gepagineerd, want dit is precies de query waar een stille afkapping op 1000 rijen het meeste
 * kwaad doet: een niet-gevonden contact wordt als *nieuw* aangemaakt, en dan staat het duplicaat
 * dat we net hebben opgeruimd er weer.
 */
export async function alleSpiegelsAlsMap(): Promise<Map<string, string>> {
  const supabase = db()
  const rijen = await haalAlleRijen<{ bouw7_id: string; relatie_id: string }>((van, tot) => supabase
    .from('relatie_bouw7_koppelingen')
    .select('bouw7_id, relatie_id')
    .order('id')
    .range(van, tot))
  return new Map(rijen.map(r => [r.bouw7_id, r.relatie_id]))
}

/**
 * Leg een Bouw7-contact vast als spiegel van deze relatie. `is_primair` alleen als de relatie
 * er nog geen heeft — de eerste spiegel is de kant waar EVA standaard naartoe schrijft en waar
 * `relaties.bouw7_id` naar wijst.
 */
export async function legRelatieSpiegelVast(opts: {
  relatieId: string
  bouw7Id: string | number
  bouw7Type?: RelatieRol | string | null
}): Promise<void> {
  const supabase = db()
  const { data: bestaand } = await supabase
    .from('relatie_bouw7_koppelingen')
    .select('id')
    .eq('relatie_id', opts.relatieId)
    .eq('is_primair', true)
    .maybeSingle()

  const primair = !bestaand
  await supabase
    .from('relatie_bouw7_koppelingen')
    .upsert({
      relatie_id:        opts.relatieId,
      bouw7_id:          String(opts.bouw7Id),
      bouw7_type:        opts.bouw7Type ?? null,
      bouw7_laatst_sync: new Date().toISOString(),
      is_primair:        primair,
    }, { onConflict: 'bouw7_id' })

  // De primaire spiegel blijft gespiegeld in relaties.bouw7_id: dat is wat de rest van EVA
  // (en de partiële unique index) als "staat in Bouw7" leest.
  if (primair) {
    await supabase
      .from('relaties')
      .update({ bouw7_id: String(opts.bouw7Id), bouw7_sync_status: 'synced' })
      .eq('id', opts.relatieId)
  }
}
