/**
 * Federatieve zoek-service voor de globale snelzoeker + EVA-vraagantwoord.
 *
 * Doorzoekt EVA's eigen data (dossiers, relaties, contactpersonen, particulieren,
 * medewerkers) met simpele ilike-queries. Geen externe bronnen, geen internet.
 *
 * Server-only module: gebruikt de admin-client (conform de rest van de app —
 * RLS is een aparte, getrackte blocker). De aanroepende API-routes dwingen een
 * auth-check af zodat alleen ingelogde gebruikers kunnen zoeken.
 */
import { createAdminClient } from '@everts/database/server'
import { getOmzetVoorRelatie } from '@/lib/relaties/actions'

export type EntityType =
  | 'dossier'
  | 'relatie'
  | 'contactpersoon'
  | 'particulier'
  | 'medewerker'

export type SearchHit = {
  type: EntityType
  id: string
  label: string
  sublabel?: string | null
  badge?: string | null
  /** Detail-URL, of null als de entiteit geen detailpagina heeft (medewerker). */
  href: string | null
}

export type SearchGroup = {
  type: EntityType
  label: string
  hits: SearchHit[]
}

export type GroupedResults = {
  query: string
  groups: SearchGroup[]
  total: number
}

const GROEP_LABELS: Record<EntityType, string> = {
  relatie: 'Relaties',
  dossier: 'Dossiers',
  medewerker: 'Medewerkers',
  contactpersoon: 'Contactpersonen',
  particulier: 'Particulieren',
}

/** Volgorde waarin groepen getoond worden (entiteit-eerst: relaties & medewerkers bovenaan). */
const GROEP_VOLGORDE: EntityType[] = [
  'relatie',
  'medewerker',
  'dossier',
  'contactpersoon',
  'particulier',
]

/** Dossier-detailroutes lopen per hoofdstatus (er is geen losse /dossiers/[id]). */
const HOOFDSTATUS_SEGMENT: Record<string, string> = {
  aanvraag: 'aanvragen',
  offerte: 'offertes',
  opdracht: 'opdrachten',
}

function dossierHref(id: string, hoofdstatus: string | null): string {
  const seg = HOOFDSTATUS_SEGMENT[hoofdstatus ?? ''] ?? 'opdrachten'
  return `/${seg}/${id}`
}

function volledigeNaam(
  voornaam?: string | null,
  tussenvoegsel?: string | null,
  achternaam?: string | null,
): string {
  return [voornaam, tussenvoegsel, achternaam].filter(Boolean).join(' ').trim()
}

/** Maak een term veilig voor gebruik binnen een PostgREST `.or()`-filter (komma's/haakjes breken de parser). */
function safeOrTerm(term: string): string {
  return term.replace(/[,()]/g, ' ').trim()
}

/**
 * Doorzoek alle kern-entiteiten parallel op een vrije term.
 * Retourneert getypeerde, gegroepeerde treffers (entiteit-eerst).
 */
export async function searchAllEntities(
  query: string,
  opts?: { limitPer?: number },
): Promise<GroupedResults> {
  const term = query.trim()
  if (term.length < 2) return { query: term, groups: [], total: 0 }

  const limit = opts?.limitPer ?? 6
  const supabase = createAdminClient() as any
  const like = `%${term}%`
  const orLike = `%${safeOrTerm(term)}%`

  const [dossiersRes, relatiesRes, contactRes, particulierRes, medewerkerRes] =
    await Promise.all([
      supabase
        .from('dossiers')
        .select('id, dossiernummer, titel, hoofdstatus, relaties!klant_id ( naam )')
        .or(`titel.ilike.${orLike},dossiernummer.ilike.${orLike}`)
        .order('updated_at', { ascending: false })
        .limit(limit),
      supabase
        .from('relaties')
        .select('id, naam, types, adres_plaats')
        .ilike('naam', like)
        .order('naam', { ascending: true })
        .limit(limit),
      supabase
        .from('contactpersonen')
        .select('id, voornaam, tussenvoegsel, achternaam, email')
        .or(`voornaam.ilike.${orLike},achternaam.ilike.${orLike},email.ilike.${orLike}`)
        .eq('actief', true)
        .order('achternaam', { ascending: true })
        .limit(limit),
      supabase
        .from('particulieren')
        .select('id, voornaam, tussenvoegsel, achternaam, email, adres_plaats')
        .or(`voornaam.ilike.${orLike},achternaam.ilike.${orLike},email.ilike.${orLike}`)
        .eq('actief', true)
        .order('achternaam', { ascending: true })
        .limit(limit),
      supabase
        .from('medewerkers')
        .select('id, voornaam, tussenvoegsel, achternaam, functie, afdeling')
        .or(`voornaam.ilike.${orLike},achternaam.ilike.${orLike}`)
        .eq('actief', true)
        .order('achternaam', { ascending: true })
        .limit(limit),
    ])

  const groepen: Record<EntityType, SearchHit[]> = {
    relatie: (relatiesRes.data ?? []).map((r: any) => ({
      type: 'relatie' as const,
      id: r.id,
      label: r.naam,
      sublabel: r.adres_plaats ?? null,
      badge: Array.isArray(r.types) && r.types.length ? r.types[0] : null,
      href: `/relaties/${r.id}`,
    })),
    medewerker: (medewerkerRes.data ?? []).map((m: any) => ({
      type: 'medewerker' as const,
      id: m.id,
      label: volledigeNaam(m.voornaam, m.tussenvoegsel, m.achternaam),
      sublabel: [m.functie, m.afdeling].filter(Boolean).join(' · ') || null,
      badge: null,
      href: null, // geen detailpagina → inline profielpaneel in de snelzoeker
    })),
    dossier: (dossiersRes.data ?? []).map((d: any) => ({
      type: 'dossier' as const,
      id: d.id,
      label: d.titel,
      sublabel: [d.dossiernummer, d.relaties?.naam].filter(Boolean).join(' · ') || null,
      badge: d.hoofdstatus ?? null,
      href: dossierHref(d.id, d.hoofdstatus),
    })),
    contactpersoon: (contactRes.data ?? []).map((c: any) => ({
      type: 'contactpersoon' as const,
      id: c.id,
      label: volledigeNaam(c.voornaam, c.tussenvoegsel, c.achternaam),
      sublabel: c.email ?? null,
      badge: null,
      href: `/relaties/contactpersonen/${c.id}`,
    })),
    particulier: (particulierRes.data ?? []).map((p: any) => ({
      type: 'particulier' as const,
      id: p.id,
      label: volledigeNaam(p.voornaam, p.tussenvoegsel, p.achternaam),
      sublabel: [p.email, p.adres_plaats].filter(Boolean).join(' · ') || null,
      badge: null,
      href: `/relaties/particulieren/${p.id}`,
    })),
  }

  const groups: SearchGroup[] = GROEP_VOLGORDE
    .map((type) => ({ type, label: GROEP_LABELS[type], hits: groepen[type] }))
    .filter((g) => g.hits.length > 0)

  const total = groups.reduce((sum, g) => sum + g.hits.length, 0)
  return { query: term, groups, total }
}

/* ─── Profiel van één medewerker (voor het inline paneel + AI-tool) ─────── */

export type MedewerkerProfiel = {
  id: string
  naam: string
  functie: string | null
  afdeling: string | null
  email: string | null
  telefoon: string | null
  in_dienst_vanaf: string | null
  uit_dienst_per: string | null
  extern: boolean
  actief: boolean
  adres_plaats: string | null
  uurtarief_verkoop: number | null
  uurtarief_kostprijs: number | null
  cao_schaal: string | null
  werkmaatschappij: string | null
}

export async function getMedewerkerProfiel(id: string): Promise<MedewerkerProfiel | null> {
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('medewerkers')
    .select(
      'id, voornaam, tussenvoegsel, achternaam, functie, afdeling, email, telefoon, ' +
        'in_dienst_vanaf, uit_dienst_per, extern, actief, adres_plaats, ' +
        'uurtarief_verkoop, uurtarief_kostprijs, cao_schaal, ' +
        'werkmaatschappij:bedrijfsgegevens!werkmaatschappij_id ( naam )',
    )
    .eq('id', id)
    .single()

  if (!data) return null
  return {
    id: data.id,
    naam: volledigeNaam(data.voornaam, data.tussenvoegsel, data.achternaam),
    functie: data.functie,
    afdeling: data.afdeling,
    email: data.email,
    telefoon: data.telefoon,
    in_dienst_vanaf: data.in_dienst_vanaf,
    uit_dienst_per: data.uit_dienst_per,
    extern: !!data.extern,
    actief: !!data.actief,
    adres_plaats: data.adres_plaats,
    uurtarief_verkoop: data.uurtarief_verkoop != null ? Number(data.uurtarief_verkoop) : null,
    uurtarief_kostprijs: data.uurtarief_kostprijs != null ? Number(data.uurtarief_kostprijs) : null,
    cao_schaal: data.cao_schaal,
    werkmaatschappij: data.werkmaatschappij?.naam ?? null,
  }
}

/* ─── Dossiers van een opdrachtgever (AI-tool) ──────────────────────────── */

export async function getDossiersVoorRelatie(
  relatieId: string,
  opts?: { hoofdstatus?: string; limit?: number },
): Promise<
  { id: string; dossiernummer: string | null; titel: string; hoofdstatus: string; substatus: string | null; bedrag_excl_btw: number | null }[]
> {
  const supabase = createAdminClient() as any
  let q = supabase
    .from('dossiers')
    .select(
      'id, dossiernummer, titel, hoofdstatus, aanvraag_substatus, offerte_substatus, opdracht_substatus, bedrag_excl_btw',
    )
    .eq('klant_id', relatieId)
    .order('updated_at', { ascending: false })
    .limit(opts?.limit ?? 50)

  if (opts?.hoofdstatus) q = q.eq('hoofdstatus', opts.hoofdstatus)

  const { data } = await q
  return (data ?? []).map((d: any) => ({
    id: d.id,
    dossiernummer: d.dossiernummer,
    titel: d.titel,
    hoofdstatus: d.hoofdstatus,
    substatus:
      d.opdracht_substatus ?? d.offerte_substatus ?? d.aanvraag_substatus ?? null,
    bedrag_excl_btw: d.bedrag_excl_btw != null ? Number(d.bedrag_excl_btw) : null,
  }))
}

/* ─── Financiën van een relatie: "open bedrag" (AI-tool) ────────────────── */

export type RelatieFinancien = {
  relatie_id: string
  openstaand_werk_eva: {
    totaal_excl_btw: number
    dossiers: { id: string; dossiernummer: string | null; titel: string; bedrag: number | null; substatus: string }[]
  }
  openstaande_facturen_bouw7_exact: {
    beschikbaar: false
    toelichting: string
  }
}

/**
 * "Hoeveel staat er nog open bij <opdrachtgever>?"
 *
 * Deel 1 — openstaand WERK in EVA: opdrachten die financieel nog niet afgesloten
 * zijn (hergebruikt getOmzetVoorRelatie).
 * Deel 2 — openstaande FACTUREN/debiteuren: zit in Bouw7/Exact, nog niet gekoppeld.
 */
export async function getRelatieFinancien(relatieId: string): Promise<RelatieFinancien> {
  const omzet = await getOmzetVoorRelatie(relatieId)
  const totaal = omzet.openstaand.reduce((sum, d) => sum + (d.bedrag ?? 0), 0)

  return {
    relatie_id: relatieId,
    openstaand_werk_eva: {
      totaal_excl_btw: totaal,
      dossiers: omzet.openstaand.map((d) => ({
        id: d.id,
        dossiernummer: d.dossiernummer,
        titel: d.titel,
        bedrag: d.bedrag,
        substatus: d.substatus,
      })),
    },
    openstaande_facturen_bouw7_exact: {
      beschikbaar: false,
      toelichting:
        'Openstaande facturen/debiteuren komen uit Bouw7/Exact en zijn nog niet aan EVA gekoppeld. ' +
        'Toon alleen het openstaande werk uit EVA en vermeld dat facturen nog niet beschikbaar zijn.',
    },
  }
}
