import 'server-only'
import { createAdminClient } from '@everts/database/server'
import { laadPdfAfzender, type PdfAfzender } from '@/lib/pdf/afzender'
import type { PlanningActiviteit, PlanningFase, PlanningUursoort } from '@everts/database/platform-types'

/**
 * De gegevens achter de A3-uitdraai van de detailplanning.
 *
 * Los van de opmaak (`detailplanning-pdf.ts`) en los van de route, zodat de
 * tekenkant zonder database te controleren is.
 *
 * WAT HIER BEWUST NIET WORDT OPGEHAALD: `planning_items` en `medewerkers`. De
 * uitdraai toont fases en activiteiten, geen namen — en ook geen onderaannemer
 * of leverancier. Dat is een keuze van het vel zelf, niet van de datalaag die
 * het toevallig makkelijk maakt: wie hier later een join naar `medewerkers`
 * legt, zet mensen op papier die daar niet horen.
 *
 * Prettig neveneffect: zonder `planning_items` is er niets dat over de
 * PostgREST-grens van 1000 rijen heen kan groeien. Alle queries hieronder zijn
 * begrensd op één dossier of op een expliciete lijst ids.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export type DetailplanningKop = {
  dossiernummer: string | null
  titel: string
  opdrachtgever: string | null
  projectleider: string | null
  /** Alleen gevuld als het dossier aan een werkmaatschappij hangt; de meeste doen dat niet. */
  werkmaatschappij: string | null
}

/** De moederorganisatie — de afzender van het vel, niet de werkmaatschappij van het dossier. */
export type DetailplanningBedrijf = PdfAfzender

export type DetailplanningGegevens = {
  kop: DetailplanningKop
  bedrijf: DetailplanningBedrijf
  fasen: PlanningFase[]
  activiteiten: PlanningActiviteit[]
  /** Alleen de uursoorten die op dit dossier daadwerkelijk voorkomen — dat is de legenda. */
  uursoorten: Pick<PlanningUursoort, 'id' | 'naam' | 'kleur'>[]
}

/** Volledige naam van een medewerker, met tussenvoegsel op de juiste plek. */
function volledigeNaam(m: { voornaam?: string | null; tussenvoegsel?: string | null; achternaam?: string | null } | null): string | null {
  if (!m) return null
  const naam = [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ').trim()
  return naam || null
}

/**
 * Alles wat op het vel komt, of `null` als het dossier niet bestaat.
 *
 * Een dossier zonder activiteiten geeft wél een resultaat (met een lege lijst):
 * de route beslist zelf dat daar niets van te maken valt.
 */
export async function laadDetailplanning(dossierId: string): Promise<DetailplanningGegevens | null> {
  const supabase = db()

  const { data: dossier } = await supabase
    .from('dossiers')
    .select('dossiernummer, titel, klant_id, project_manager_id, werkmaatschappij_id')
    .eq('id', dossierId)
    .maybeSingle()

  if (!dossier) return null

  const [activiteitenRes, fasenRes, klantRes, plRes, bedrijf, wmRes] = await Promise.all([
    supabase
      .from('planning_activiteiten')
      .select('id, dossier_id, fase_id, uursoort_id, titel, gewenste_start, deadline, volgorde')
      .eq('dossier_id', dossierId)
      .order('volgorde'),
    supabase
      .from('planning_fasen')
      .select('id, dossier_id, naam, volgorde')
      .eq('dossier_id', dossierId)
      .order('volgorde'),
    dossier.klant_id
      ? supabase.from('relaties').select('naam').eq('id', dossier.klant_id).maybeSingle()
      : Promise.resolve({ data: null }),
    dossier.project_manager_id
      ? supabase
          .from('medewerkers')
          .select('voornaam, tussenvoegsel, achternaam')
          .eq('id', dossier.project_manager_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    // Let op: de afzender is de moederorganisatie, niet zomaar de eerste rij
    // uit `bedrijfsgegevens`. Waarom dat uitmaakt staat in `lib/pdf/afzender.ts`.
    laadPdfAfzender(),
    dossier.werkmaatschappij_id
      ? supabase.from('bedrijfsgegevens').select('naam').eq('id', dossier.werkmaatschappij_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const activiteiten = (activiteitenRes.data ?? []) as PlanningActiviteit[]

  // Alleen de uursoorten die op dit dossier voorkomen: de legenda onderaan het vel
  // hoort de kleuren te verklaren die er staan, niet de hele stamtabel.
  const uursoortIds = [...new Set(activiteiten.map(a => a.uursoort_id).filter(Boolean))] as string[]
  const { data: uursoortenRaw } = uursoortIds.length
    ? await supabase.from('planning_uursoorten').select('id, naam, kleur').in('id', uursoortIds)
    : { data: [] }

  return {
    kop: {
      dossiernummer: dossier.dossiernummer ?? null,
      titel: dossier.titel ?? '',
      opdrachtgever: (klantRes.data as { naam?: string } | null)?.naam ?? null,
      projectleider: volledigeNaam(plRes.data as Parameters<typeof volledigeNaam>[0]),
      werkmaatschappij: (wmRes.data as { naam?: string } | null)?.naam ?? null,
    },
    bedrijf,
    fasen: (fasenRes.data ?? []) as PlanningFase[],
    activiteiten,
    uursoorten: (uursoortenRaw ?? []) as Pick<PlanningUursoort, 'id' | 'naam' | 'kleur'>[],
  }
}
