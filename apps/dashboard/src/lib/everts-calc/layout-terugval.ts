/**
 * layout-terugval.ts
 *
 * De lay-out van een offerte, met terugval op de standaard-lay-out van dezelfde soort.
 *
 * `quotes.layout_id` verwijst met ON DELETE SET NULL naar `quote_layouts`: wordt een
 * lay-out verwijderd terwijl er nog offertes op staan, dan houden die offertes géén
 * lay-out over — en dus geen Word-sjabloon. Zonder terugval kon zo'n offerte daarna
 * niet meer als PDF gemaakt, goedgekeurd of verzonden worden.
 */

import 'server-only'

/** Offerte-type → lay-outsoort (zie `LayoutSoort` in actions/quote-instellingen). */
function soortVanOfferte(type: string | null | undefined): 'offerte' | 'interne_begroting' {
  return type === 'interne_calculatie' ? 'interne_begroting' : 'offerte'
}

/**
 * Geeft `quote.layout` terug, of — als de offerte geen lay-out (meer) heeft — de
 * standaard-lay-out van de bijbehorende soort. `{}` als er ook geen standaard is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function layoutMetTerugval(supabase: any, quote: any): Promise<any> {
  if (quote?.layout) return quote.layout
  const { data } = await supabase
    .from('quote_layouts')
    .select('*')
    .eq('soort', soortVanOfferte(quote?.type))
    .eq('is_standaard', true)
    .limit(1)
    .maybeSingle()
  return data ?? {}
}
