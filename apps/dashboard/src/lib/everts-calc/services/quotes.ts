import { createClient } from '@/lib/everts-calc/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getDb(): Promise<any> {
  return createClient()
}
import type {
  Quote,
  Client,
  QuoteTemplate,
  QuoteLayout,
} from '@/lib/everts-calc/types-quotes'

// ─── Quotes ───────────────────────────────────────────────────────────────────

export type OfferteRij = {
  id: string
  quote_nummer: string
  type: 'verkoopofferte' | 'interne_calculatie'
  status: 'concept' | 'verzonden' | 'geaccepteerd' | 'afgewezen' | 'verlopen'
  titel: string
  referentie: string | null
  datum: string | null
  geldig_tot: string | null
  subtotaal_ex_btw: number
  btw_bedrag: number
  totaal_inc_btw: number
  client: { id: string; naam: string; bedrijfsnaam: string | null } | null
  totaal_kostprijs: number
  marge: number
  marge_pct: number | null
}

export async function getQuotesMetMarge(): Promise<OfferteRij[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id, quote_nummer, type, status, titel, referentie,
      datum, geldig_tot, subtotaal_ex_btw, btw_bedrag, totaal_inc_btw,
      created_at, updated_at,
      client:clients(id, naam, bedrijfsnaam),
      lines:quote_lines(hoeveelheid, kostprijs_pe)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((q: any) => {
    const totaal_kostprijs = (q.lines ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, l: any) => sum + ((l.hoeveelheid ?? 0) * (l.kostprijs_pe ?? 0)),
      0,
    )
    const subtotaal = q.subtotaal_ex_btw ?? 0
    const marge = subtotaal - totaal_kostprijs
    const marge_pct = subtotaal > 0 ? (marge / subtotaal) * 100 : null
    const { lines: _lines, ...rest } = q
    return { ...rest, totaal_kostprijs, marge, marge_pct } as OfferteRij
  })
}

export async function getQuotes(): Promise<Quote[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id, quote_nummer, type, status, titel, referentie,
      datum, geldig_tot, subtotaal_ex_btw, btw_bedrag, totaal_inc_btw,
      created_at, updated_at,
      client:clients(id, naam, bedrijfsnaam)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

export async function getQuote(id: string): Promise<Quote | null> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      *,
      client:clients(*),
      sections:quote_sections(
        *,
        lines:quote_lines(* )
      ),
      terms:quote_terms(*)
    `)
    .eq('id', id)
    .single()

  if (error) return null

  // Sorteer sections op volgorde, lines per sectie op volgorde, terms op type+volgorde
  if (data?.sections) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.sections.sort((a: any, b: any) => a.volgorde - b.volgorde)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.sections.forEach((s: any) => {
      if (s.lines) s.lines.sort((a: any, b: any) => a.volgorde - b.volgorde)
    })
  }
  if (data?.terms) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.terms.sort((a: any, b: any) => a.volgorde - b.volgorde)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data as any
}

// ─── Klanten ──────────────────────────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('actief', true)
    .order('naam')

  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

export async function getAllClients(): Promise<Client[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('naam')

  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

// ─── Templates ────────────────────────────────────────────────────────────────

export async function getDefaultTemplate(): Promise<QuoteTemplate | null> {
  const supabase = await getDb()
  const { data } = await supabase
    .from('quote_templates')
    .select('*')
    .eq('is_standaard', true)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? null) as any
}

export async function getQuoteTemplates(): Promise<QuoteTemplate[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quote_templates')
    .select('*')
    .order('naam')

  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}

// ─── Layouts ──────────────────────────────────────────────────────────────────

export async function getQuoteLayouts(): Promise<QuoteLayout[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quote_layouts')
    .select('*')
    .order('naam')

  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []) as any
}
