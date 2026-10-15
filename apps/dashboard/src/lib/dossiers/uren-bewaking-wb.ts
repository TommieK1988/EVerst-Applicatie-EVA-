import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'
import {
  begroteArbeidPerCode,
  type WbArbeidComponentInvoer,
  type WbRegelInvoer,
} from './uren-bewaking-wb-bereken'

const STATUS_PRIO: Record<string, number> = { geaccordeerd: 0, definitief: 1, concept: 2 }

/**
 * Begrote arbeid (uren + bedrag) per bewakingscode uit de werkbegroting van dit dossier, of null
 * als er geen werkbegroting met arbeid is.
 *
 * De werkbegroting hangt aan het dossier via `dossier_id`. Het synthetische `wb-direct-…`-id
 * bestaat alleen in de client; in de database staat `project_id` dan op null (het is een
 * uuid-kolom). Heeft een dossier er meer dan één, dan wint de meest definitieve, daarna de
 * laatst bijgewerkte.
 *
 * Soft-deleted regels en componenten tellen niet mee. Beide queries pagineren: een grote
 * werkbegroting kan boven de 1000 rijen uitkomen, en PostgREST kapt dan stil af.
 */
export async function laadBegroteArbeidPerCode(
  dossierId: string,
): Promise<Map<string, { uren: number; bedrag: number }> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const { data: werkbegrotingen } = await supabase
    .from('werkbegrotingen')
    .select('id, status')
    .eq('dossier_id', dossierId)
    .order('bijgewerkt_op', { ascending: false })
    .limit(20)
  if (!werkbegrotingen || werkbegrotingen.length === 0) return null

  const wb = [...(werkbegrotingen as { id: string; status: string | null }[])]
    .sort((a, b) => (STATUS_PRIO[a.status ?? ''] ?? 3) - (STATUS_PRIO[b.status ?? ''] ?? 3))[0]

  const regels = await haalAlleRijen<WbRegelInvoer>((van, tot) =>
    supabase
      .from('werkbegroting_regels')
      .select('id, kostengroep, hoeveelheid')
      .eq('werkbegroting_id', wb.id)
      .eq('is_verwijderd', false)
      .not('kostengroep', 'is', null)
      .neq('kostengroep', '')
      .order('id')
      .range(van, tot))
  if (regels.length === 0) return null

  // Filteren op de werkbegroting (via de regel-join) in plaats van een `.in()` met alle
  // regel-id's: dat houdt de URL kort, hoe groot de werkbegroting ook wordt.
  const componenten = await haalAlleRijen<WbArbeidComponentInvoer>((van, tot) =>
    supabase
      .from('werkbegroting_componenten')
      .select('werkbegroting_regel_id, norm_hoeveelheid, tarief, werkbegroting_regels!inner(werkbegroting_id)')
      .eq('werkbegroting_regels.werkbegroting_id', wb.id)
      .eq('type', 'arbeid')
      .eq('is_verwijderd', false)
      .order('id')
      .range(van, tot))

  const perCode = begroteArbeidPerCode(regels, componenten)
  return perCode.size > 0 ? perCode : null
}
