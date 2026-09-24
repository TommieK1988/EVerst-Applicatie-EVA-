import type { MedewerkerAfwezigheid } from '@everts/database/platform-types'
import { haalAlleRijen } from '@/lib/supabase/paginate'

/**
 * Afwezigheid (verlof, ziekte, …) voor de planningsschermen.
 *
 * Tot sep 2026 laadden de Medewerkerplanning en de dossier-planning alleen afwezigheid met een
 * einddatum van vandaag of later. De tijdlijn laat je echter terugbladeren, en de planitems zelf
 * kwamen wél volledig mee — dus zodra een verlofdag voorbij was, verdween hij van het scherm
 * ("Chimène had 21 september verlof in Bouw7, maar EVA toont het niet"). De data stond gewoon in
 * de database.
 *
 * Nu: alles vanaf 1 januari van vorig jaar, gepagineerd (de tabel groeit met elke sync; zie
 * lib/supabase/paginate.ts over de stille afkapping op 1000 rijen).
 */
export async function haalAfwezigheidVoorPlanning(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<MedewerkerAfwezigheid[]> {
  const vanaf = `${new Date().getFullYear() - 1}-01-01`
  return haalAlleRijen<MedewerkerAfwezigheid>((van, tot) =>
    supabase
      .from('medewerker_afwezigheid')
      .select('*')
      .gte('eind_datum', vanaf)
      .order('id')
      .range(van, tot))
}
