/* ─── Procesdatums van een dossier: ophalen ──────────────────────────
   De acht datums van het Projectinformatie-blok. Alles komt uit EVA's eigen
   gegevens; de Bouw7-datums (verwacht_startdatum/-einddatum) worden hier
   bewust niet gebruikt — start/eind volgen de detailplanning.

   Server-only (Supabase admin-client). Types en rekenwerk staan in
   ./datum-regels, dat óók de client mag laden. */

import { createAdminClient } from '@everts/database/server'
import { LEGE_DOSSIER_DATUMS, type DossierDatums } from './datum-regels'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type DossierDatumVelden = Partial<{
  aanvraagdatum: string | null
  deadline: string | null
  verzonden_op: string | null
  opdrachtdatum: string | null
  financieel_gereed_op: string | null
  bouw7_aanmaakdatum: string | null
  created_at: string | null
}>

/**
 * Start/eind van de uitvoering = de buitenste grenzen van de detailplanning.
 * `planning_items` heeft zelf geen dossier_id; de koppeling loopt via
 * `planning_activiteiten` (zelfde tweetraps-patroon als DossierPlanningTab).
 * De RPC `planning_datums_per_dossier()` is hier niet bruikbaar: die aggregeert
 * zonder parameter over álle dossiers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function laadPlanningDatums(supabase: any, dossierId: string) {
  const leeg: { startdatum: string | null; einddatum: string | null } =
    { startdatum: null, einddatum: null }
  try {
    const { data: activiteiten } = await supabase
      .from('planning_activiteiten')
      .select('id')
      .eq('dossier_id', dossierId)

    const ids = ((activiteiten ?? []) as { id: string }[]).map(a => a.id)
    if (ids.length === 0) return leeg

    // Twee gerichte queries i.p.v. alle blokken ophalen en in JS reduceren.
    const [startRes, eindRes] = await Promise.all([
      supabase.from('planning_items').select('start_dt').in('activiteit_id', ids)
        .order('start_dt', { ascending: true }).limit(1).maybeSingle(),
      supabase.from('planning_items').select('eind_dt').in('activiteit_id', ids)
        .order('eind_dt', { ascending: false }).limit(1).maybeSingle(),
    ])

    return {
      startdatum: startRes.data?.start_dt ?? null,
      einddatum:  eindRes.data?.eind_dt  ?? null,
    }
  } catch {
    return leeg
  }
}

/**
 * Opleverdatum = de eindoplevering van het dossier. Bewust alleen
 * `type = 'eindoplevering'`: een dossier kan ook voor-, tussen- en
 * overige momenten hebben, en die zijn niet "de" opleverdatum.
 * Meerdere eindopleveringen (bv. na afkeur) → de meest recente.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function laadOpleverdatum(supabase: any, dossierId: string): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('oplever_momenten')
      .select('opgeleverd_op')
      .eq('dossier_id', dossierId)
      .eq('type', 'eindoplevering')
      .not('opgeleverd_op', 'is', null)
      .order('opgeleverd_op', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.opgeleverd_op ?? null
  } catch {
    return null
  }
}

/**
 * De acht procesdatums van één dossier. Best-effort: valt een deelbron weg,
 * dan blijft die datum leeg in plaats van dat het hele blok sneuvelt.
 */
export async function getDossierDatums(dossierId: string): Promise<DossierDatums> {
  const supabase = db()

  const [dossierRes, planning, opleverdatum] = await Promise.all([
    supabase
      .from('dossiers')
      // Bewust `*`: bij een expliciete kolomlijst laat PostgREST de héle query
      // falen zodra één kolom ontbreekt, waardoor álle procesdatums leeg bleven.
      // Nu vullen we elke datum die wél bekend is; een ontbrekend veld blijft leeg.
      .select('*')
      .eq('id', dossierId)
      .maybeSingle(),
    laadPlanningDatums(supabase, dossierId),
    laadOpleverdatum(supabase, dossierId),
  ])

  const d = (dossierRes.data ?? null) as DossierDatumVelden | null
  if (!d) return LEGE_DOSSIER_DATUMS

  return {
    // Handmatige invoer wint; anders de aanmaakdatum van het project. `created_at` is
    // pas de laatste keus: bij de meeste dossiers is dat de dag van de Bouw7-import
    // (9 juni 2026) en niet het moment dat de aanvraag ontstond. Zelfde volgorde als
    // het Servicedesk-paneel voor zijn doorlooptijd hanteert.
    aanvraagdatum:     d.aanvraagdatum ?? d.bouw7_aanmaakdatum ?? d.created_at ?? null,
    deadline:          d.deadline ?? null,
    offertedatum:      d.verzonden_op ?? null,
    opdrachtdatum:     d.opdrachtdatum ?? null,
    startdatum:        planning.startdatum,
    einddatum:         planning.einddatum,
    opleverdatum,
    financieel_gereed: d.financieel_gereed_op ?? null,
  }
}
