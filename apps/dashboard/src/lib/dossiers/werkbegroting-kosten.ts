import 'server-only'

import { createAdminClient } from '@everts/database/server'
import { haalAlleRijen } from '@/lib/supabase/paginate'

/** Bewakingscode uit een kostengroep "CODE — omschrijving" (zelfde regel als de werkbegroting). */
const kaleCode = (kg: string | null): string => (kg ?? '').split(/\s[—-]\s/)[0].trim()

/**
 * Kosten per bewakingscode uit de werkbegroting van een dossier: per regel × component
 * hoeveelheid × norm × tarief, over alle componenttypes (arbeid, onderaanneming, materieel,
 * materiaal). Dat is kostprijs — de opslag zit er niet in. Goedgekeurd meerwerk staat er ook in:
 * dat wordt bij het akkoord naar de werkbegroting overgehaald.
 *
 * null = het dossier heeft (nog) geen gevulde werkbegroting.
 */
export async function getWerkbegrotingKostenPerCode(dossierId: string): Promise<Map<string, number> | null> {
  const supabase = createAdminClient()

  const { data: wb } = await supabase
    .from('werkbegrotingen')
    .select('id')
    .eq('dossier_id', dossierId)
    .order('bijgewerkt_op', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!wb) return null

  const regels = await haalAlleRijen<{ id: string; kostengroep: string | null; hoeveelheid: number | null }>((van, tot) =>
    supabase.from('werkbegroting_regels')
      .select('id, kostengroep, hoeveelheid')
      .eq('werkbegroting_id', wb.id)
      .eq('is_verwijderd', false)
      .order('id')
      .range(van, tot))
  // Een werkbegroting zonder regels is aangemaakt maar nooit gevuld (oudere, uit Bouw7
  // geïmporteerde dossiers): dan is er niets om op te rekenen.
  if (regels.length === 0) return null
  const regelById = new Map(regels.map(r => [r.id, r]))

  const kosten = new Map<string, number>()
  // Per blok van regel-id's: een `.in()` met honderden uuid's past niet in één URL.
  for (let i = 0; i < regels.length; i += 200) {
    const ids = regels.slice(i, i + 200).map(r => r.id)
    const componenten = await haalAlleRijen<{ werkbegroting_regel_id: string; norm_hoeveelheid: number | null; tarief: number | null }>((van, tot) =>
      supabase.from('werkbegroting_componenten')
        .select('werkbegroting_regel_id, norm_hoeveelheid, tarief')
        .in('werkbegroting_regel_id', ids)
        .eq('is_verwijderd', false)
        .order('id')
        .range(van, tot))
    for (const c of componenten) {
      const regel = regelById.get(c.werkbegroting_regel_id)
      if (!regel) continue
      const code = kaleCode(regel.kostengroep)
      if (!code) continue
      const bedrag = Number(regel.hoeveelheid ?? 0) * Number(c.norm_hoeveelheid ?? 0) * Number(c.tarief ?? 0)
      kosten.set(code, (kosten.get(code) ?? 0) + bedrag)
    }
  }
  return kosten
}
