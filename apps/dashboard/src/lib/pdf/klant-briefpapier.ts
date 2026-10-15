import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { fetchBriefpapier } from '@/lib/everts-calc/briefpapier'

/**
 * Het briefpapier voor rapporten naar de klant (opleverrapport, meerwerkoverzicht), als bytes.
 *
 * Bron: Instellingen → Bedrijfsgegevens → Huisstijl (`bedrijfsgegevens.briefpapier_pdf_url`).
 * Volgorde:
 *   1. de werkmaatschappij van het dossier;
 *   2. de organisatie (zonder eigen briefpapier valt een werkmaatschappij daarop terug);
 *   3. het briefpapier van een offerte-lay-out — de oude bron, voor het geval de huisstijl leeg is.
 * Best-effort: zonder briefpapier komt het rapport er kaal uit, niet fout.
 */
export async function haalKlantBriefpapier(werkmaatschappijId?: string | null): Promise<Buffer | null> {
  const supabase = createAdminClient()

  const { data: bedrijven } = await supabase
    .from('bedrijfsgegevens')
    .select('id, type, briefpapier_pdf_url')
    .not('briefpapier_pdf_url', 'is', null)
    .limit(50)
  const eigen = bedrijven?.find(b => b.id === werkmaatschappijId)?.briefpapier_pdf_url
  const organisatie = bedrijven?.find(b => b.type === 'organisatie')?.briefpapier_pdf_url
  const url = eigen ?? organisatie
  if (url) return fetchBriefpapier(url)

  const { data } = await supabase
    .from('quote_layouts')
    .select('briefpapier_pdf_url, is_standaard, updated_at')
    // Alleen offerte-lay-outs: deze documenten gaan naar de klant, dus het
    // briefpapier van een interne-begrotingslay-out hoort er niet onder.
    .eq('soort', 'offerte')
    .not('briefpapier_pdf_url', 'is', null)
    .order('is_standaard', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return fetchBriefpapier(data?.briefpapier_pdf_url ?? null)
}
