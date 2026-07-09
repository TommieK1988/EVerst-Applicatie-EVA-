import { createClient as createEvertsCalcClient } from '@/lib/everts-calc/supabase/server'
import { createAdminClient } from '@everts/database/server'

export type CalculatieRij = {
  id: string
  project_number: string | null
  name: string
  client_name: string | null
  project_status: string
  created_at: string

  // Dossier (optioneel — niet elke calculatie heeft een platform-dossier)
  dossier_id: string | null
  dossiernummer: string | null
  dossier_hoofdstatus: 'aanvraag' | 'offerte' | 'opdracht' | null
  dossier_substatus: string | null

  // Beste offerte per project (optioneel)
  quote_id: string | null
  quote_nummer: string | null
  quote_status: 'concept' | 'verzonden' | null

  // Financieel (null als geen offerte)
  subtotaal_ex_btw: number | null
  btw_bedrag: number | null
  totaal_inc_btw: number | null
  stelposten_subtotaal: number | null
  opties_subtotaal: number | null

  // Berekend
  totaal_kostprijs: number | null
  marge: number | null
  marge_pct: number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function kiesBesteQuote(quotes: any[]): any | null {
  if (!quotes.length) return null
  // Een definitieve (verzonden) offerte gaat voor; anders de meest recente concept.
  const verzonden = quotes.find(q => q.status === 'verzonden')
  if (verzonden) return verzonden
  return quotes.reduce((a, b) => (a.created_at > b.created_at ? a : b))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function berekenMarge(quote: any): { totaal_kostprijs: number; marge: number; marge_pct: number | null } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totaal_kostprijs = (quote.lines ?? []).reduce((sum: number, l: any) =>
    sum + ((l.hoeveelheid ?? 0) * (l.kostprijs_pe ?? 0)), 0)
  const subtotaal = quote.subtotaal_ex_btw ?? 0
  const marge = subtotaal - totaal_kostprijs
  const marge_pct = subtotaal > 0 ? (marge / subtotaal) * 100 : null
  return { totaal_kostprijs, marge, marge_pct }
}

// ── Hoofd-query ───────────────────────────────────────────────────────────────

export async function getCalculatiesMetData(): Promise<CalculatieRij[]> {
  const calcClient = await createEvertsCalcClient()

  // 1. Alle projects
  const { data: projects, error: projectsError } = await calcClient
    .from('projects')
    .select('id, name, project_number, client_name, status, created_at')
    .order('updated_at', { ascending: false })
  if (projectsError) throw new Error(projectsError.message)
  if (!projects?.length) return []

  const projectIds = projects.map(p => p.id)

  // 2. Alle quotes voor deze projects (met lines voor margeberekening)
  const { data: quotes, error: quotesError } = await calcClient
    .from('quotes')
    .select(`
      id, project_id, quote_nummer, type, status,
      subtotaal_ex_btw, btw_bedrag, totaal_inc_btw,
      stelposten_subtotaal, opties_subtotaal, created_at,
      lines:quote_lines(hoeveelheid, kostprijs_pe)
    `)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in('project_id', projectIds as any)
  if (quotesError) throw new Error(quotesError.message)

  // Groepeer quotes per project
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const quotesByProject = new Map<string, any[]>()
  for (const q of quotes ?? []) {
    if (!q.project_id) continue
    if (!quotesByProject.has(q.project_id)) quotesByProject.set(q.project_id, [])
    quotesByProject.get(q.project_id)!.push(q)
  }

  // 3. Platform-dossiers via admin client (everts_calc_project_id niet in gegenereerde types)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformClient = createAdminClient() as any
  const { data: dossiers } = await platformClient
    .from('dossiers')
    .select('id, dossiernummer, hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, everts_calc_project_id')
    .in('everts_calc_project_id', projectIds)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dossierByProject = new Map<string, any>()
  for (const d of dossiers ?? []) {
    if (d.everts_calc_project_id) dossierByProject.set(d.everts_calc_project_id, d)
  }

  // 4. Join alles
  return projects.map(p => {
    const projectQuotes = quotesByProject.get(p.id) ?? []
    const quote = kiesBesteQuote(projectQuotes)
    const dossier = dossierByProject.get(p.id) ?? null

    const { totaal_kostprijs, marge, marge_pct } = quote
      ? berekenMarge(quote)
      : { totaal_kostprijs: null, marge: null, marge_pct: null }

    // Substatus afleiden uit hoofdstatus
    let dossier_substatus: string | null = null
    if (dossier) {
      if (dossier.hoofdstatus === 'aanvraag') dossier_substatus = dossier.aanvraag_substatus
      else if (dossier.hoofdstatus === 'offerte') dossier_substatus = dossier.offerte_substatus
      else dossier_substatus = dossier.opdracht_substatus
    }

    return {
      id: p.id,
      project_number: p.project_number ?? null,
      name: p.name,
      client_name: p.client_name ?? null,
      project_status: p.status,
      created_at: p.created_at,

      dossier_id: dossier?.id ?? null,
      dossiernummer: dossier?.dossiernummer ?? null,
      dossier_hoofdstatus: dossier?.hoofdstatus ?? null,
      dossier_substatus,

      quote_id: quote?.id ?? null,
      quote_nummer: quote?.quote_nummer ?? null,
      quote_status: quote?.status ?? null,

      subtotaal_ex_btw: quote?.subtotaal_ex_btw ?? null,
      btw_bedrag: quote?.btw_bedrag ?? null,
      totaal_inc_btw: quote?.totaal_inc_btw ?? null,
      stelposten_subtotaal: quote?.stelposten_subtotaal ?? null,
      opties_subtotaal: quote?.opties_subtotaal ?? null,

      totaal_kostprijs: totaal_kostprijs !== null ? totaal_kostprijs : null,
      marge: marge !== null ? marge : null,
      marge_pct,
    } satisfies CalculatieRij
  })
}
