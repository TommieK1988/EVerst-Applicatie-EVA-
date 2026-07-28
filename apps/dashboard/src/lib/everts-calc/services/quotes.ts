import { createClient } from '@/lib/everts-calc/supabase/server'
import { createAdminClient } from '@everts/database/server'

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
  status: 'concept' | 'verzonden'
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

  // Platform-dossier (optioneel — via quote.project_id → dossiers.everts_calc_project_id)
  dossier_id: string | null
  dossier_hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht' | null
}

export async function getQuotesMetMarge(): Promise<OfferteRij[]> {
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id, project_id, quote_nummer, type, status, titel, referentie,
      datum, geldig_tot, subtotaal_ex_btw, btw_bedrag, totaal_inc_btw,
      created_at, updated_at,
      client:clients(id, naam, bedrijfsnaam),
      lines:quote_lines(hoeveelheid, kostprijs_pe)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  // Platform-dossiers koppelen via everts_calc_project_id (niet in de gegenereerde
  // types → admin client). Zelfde patroon als services/calculaties.ts.
  const projectIds = Array.from(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new Set((data ?? []).map((q: any) => q.project_id).filter(Boolean)),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossierByProject = new Map<string, any>()
  if (projectIds.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const platformClient = createAdminClient() as any
    const { data: dossiers } = await platformClient
      .from('dossiers')
      .select('id, hoofdstatus, everts_calc_project_id')
      .in('everts_calc_project_id', projectIds)
    for (const d of dossiers ?? []) {
      if (d.everts_calc_project_id) dossierByProject.set(d.everts_calc_project_id, d)
    }
  }

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
    const dossier = q.project_id ? dossierByProject.get(q.project_id) ?? null : null
    const { lines: _lines, project_id: _project_id, ...rest } = q
    return {
      ...rest,
      totaal_kostprijs,
      marge,
      marge_pct,
      dossier_id: dossier?.id ?? null,
      dossier_hoofdstatus: dossier?.hoofdstatus ?? null,
    } as OfferteRij
  })
}

// ─── Quotes per dossier (Calculatie-tab in Opdrachten) ────────────────────────

export type DossierQuoteRij = {
  id: string
  quote_nummer: string
  type: 'verkoopofferte' | 'interne_calculatie'
  status: 'concept' | 'verzonden'
  titel: string
  referentie: string | null
  datum: string | null
  geldig_tot: string | null
  subtotaal_ex_btw: number
  btw_bedrag: number
  totaal_inc_btw: number
  totaal_kostprijs: number
  marge: number
  marge_pct: number | null
  /** Scenario (calculatie) waaruit de offerte gemaakt is; null bij oudere offertes. */
  scenario_id: string | null
  /** Gevuld wanneer dit een meerwerk-offerte is (back-reference naar meerwerk_regels). */
  meerwerk_regel_id: string | null
  /** Versienummer van de offerte (erft van de calculatie; null bij legacy). */
  versie: number | null
  /** Verzenddatum (gezet bij status=verzonden); null bij concept/legacy. */
  verzonden_at: string | null
}

/**
 * Alle everts-calc quotes die aan een platform-dossier gekoppeld zijn, via
 * dossiers.everts_calc_project_id → quotes.project_id. Meerwerk-offertes hangen
 * aan hetzelfde project en komen dus automatisch mee (herkenbaar aan meerwerk_regel_id).
 */
export async function getQuotesVoorDossier(
  dossierId: string,
): Promise<{ projectId: string | null; projectAangemaakt: string | null; rijen: DossierQuoteRij[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformClient = createAdminClient() as any
  const { data: dossier } = await platformClient
    .from('dossiers')
    .select('everts_calc_project_id')
    .eq('id', dossierId)
    .single()
  const projectId: string | null = dossier?.everts_calc_project_id ?? null
  if (!projectId) return { projectId: null, projectAangemaakt: null, rijen: [] }

  const supabase = await getDb()

  // Aanmaakdatum van het calculatieproject (voor de calculatie-regel in de tabel).
  // maybeSingle: oudere project-id's uit het localStorage-tijdperk bestaan soms niet meer.
  const { data: project } = await supabase
    .from('projects')
    .select('created_at')
    .eq('id', projectId)
    .maybeSingle()
  const projectAangemaakt: string | null = project?.created_at ?? null
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id, quote_nummer, type, status, titel, referentie,
      datum, geldig_tot, subtotaal_ex_btw, btw_bedrag, totaal_inc_btw,
      scenario_id, meerwerk_regel_id, versie, verzonden_at, created_at,
      lines:quote_lines(hoeveelheid, kostprijs_pe)
    `)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rijen = (data ?? []).map((q: any) => {
    const totaal_kostprijs = (q.lines ?? []).reduce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sum: number, l: any) => sum + ((l.hoeveelheid ?? 0) * (l.kostprijs_pe ?? 0)),
      0,
    )
    const subtotaal = q.subtotaal_ex_btw ?? 0
    const marge = subtotaal - totaal_kostprijs
    const marge_pct = subtotaal > 0 ? (marge / subtotaal) * 100 : null
    const { lines: _lines, created_at: _created_at, ...rest } = q
    return { ...rest, totaal_kostprijs, marge, marge_pct } as DossierQuoteRij
  })

  return { projectId, projectAangemaakt, rijen }
}

/**
 * Alle everts-calc quotes van één project (op quotes.project_id). Gebruikt voor het eigen
 * calculatieproject van een meerwerkregel — dat hangt niet aan dossiers.everts_calc_project_id.
 */
export async function getQuotesVoorProject(projectId: string): Promise<DossierQuoteRij[]> {
  if (!projectId) return []
  const supabase = await getDb()
  const { data, error } = await supabase
    .from('quotes')
    .select(`
      id, quote_nummer, type, status, titel, referentie,
      datum, geldig_tot, subtotaal_ex_btw, btw_bedrag, totaal_inc_btw,
      scenario_id, meerwerk_regel_id, versie, verzonden_at, created_at,
      lines:quote_lines(hoeveelheid, kostprijs_pe)
    `)
    .eq('project_id', projectId)
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
    const { lines: _lines, created_at: _created_at, ...rest } = q
    return { ...rest, totaal_kostprijs, marge, marge_pct } as DossierQuoteRij
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
