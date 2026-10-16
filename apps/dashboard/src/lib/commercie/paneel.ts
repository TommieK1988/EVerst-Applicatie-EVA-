'use server'

/**
 * Alles wat het zijpaneel in "Te doen" nodig heeft voor één offerte, in één ronde.
 *
 * Het paneel opent bij een klik op een rij in de werklijst. Wat in de rij al zit (titel, klant,
 * contactpersoon, bedrag) komt niet nog eens mee; hier staat alleen wat de lijst niet laadt: de
 * bewakingskaart met namen, de tijdlijn, de geldigheid van de offerte en of er een PDF is.
 */

import { createAdminClient } from '@everts/database/server'
import { vereisRecht } from '@/lib/auth/rechten'
import { kiesOfferteBronnen } from '@/lib/dossiers/offerte-bron'
import { getBewaking, getTijdlijn, type BewakingWeergave, type TijdlijnRegel } from './actions'

export type OffertePaneelData = {
  bewaking: BewakingWeergave
  tijdlijn: TijdlijnRegel[]
  /** `geldig_tot` van de nieuwste verzonden EVA-offerte; null bij een Bouw7-offerte. */
  geldigTot: string | null
  versie: number | null
  /** Is er een offerte-PDF te openen via /api/dossiers/[id]/offerte/pdf? */
  heeftPdf: boolean
}

export async function getOffertePaneel(dossierId: string): Promise<OffertePaneelData> {
  await vereisRecht('dossiers', 'lezen')
  // Het id komt van de client en gaat in een `.or()`-filter: alleen een uuid laten passeren.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dossierId)) {
    throw new Error('Ongeldig dossier.')
  }
  const supabase = createAdminClient()

  const { data: dossier } = await supabase.from('dossiers')
    .select('everts_calc_project_id').eq('id', dossierId).maybeSingle()
  const projectId = dossier?.everts_calc_project_id ? String(dossier.everts_calc_project_id) : null

  // Begrensd op één dossier: een handvol versies.
  const quoteFilter = projectId
    ? `dossier_id.eq.${dossierId},project_id.eq.${projectId}`
    : `dossier_id.eq.${dossierId}`

  const [bewaking, tijdlijn, { data: quotes }, bronnen] = await Promise.all([
    getBewaking(dossierId),
    getTijdlijn(dossierId),
    supabase.from('quotes')
      .select('versie, geldig_tot, verzonden_at')
      .or(quoteFilter)
      .eq('status', 'verzonden')
      .is('meerwerk_regel_id', null)
      .neq('type', 'interne_calculatie')
      .order('versie', { ascending: false })
      .limit(1),
    kiesOfferteBronnen([dossierId]),
  ])

  const quote = quotes?.[0] ?? null
  return {
    bewaking,
    tijdlijn,
    geldigTot: quote?.geldig_tot ?? null,
    versie: quote?.versie ?? null,
    heeftPdf: bronnen.has(dossierId),
  }
}
