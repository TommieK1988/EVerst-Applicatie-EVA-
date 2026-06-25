import { createAdminClient } from '@everts/database/server'
import type { Metadata } from 'next'
import type { Medewerker, MedewerkerRooster, MedewerkerAfwezigheid, PlanningItemVerrijkt, PlanningUursoort } from '@everts/database/platform-types'
import MedewerkerTimeline from '@/components/planning/MedewerkerTimeline'
import { haalPlanningItemsMetExpansie } from '../bedrijfsagenda/actions'
import { berekenFeestdagen } from '@/lib/agenda/feestdagen'
import { PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Medewerkerplanning' }

/** Niet-uitvoerende afdelingen die buiten de medewerkerplanning blijven.
 *  Pas deze lijst aan als de afdelingsindeling wijzigt. */
const KANTOOR_AFDELINGEN = ['Projectbureau', 'Administratie', 'Directie']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export default async function MedewerkerplanningPage() {
  const supabase = db()
  const vandaag  = new Date().toISOString().slice(0, 10)
  const jaar     = new Date().getFullYear()

  const feestdagen = berekenFeestdagen(jaar)

  const [medewerkerRes, entriesRes, roostersRes, afwezigheidRes, dossiersRes, uursoortRes, agendaItems] = await Promise.all([
    supabase.from('medewerkers').select('*').eq('actief', true).order('achternaam'),
    supabase
      .from('planning_items')
      .select('*, planning_activiteiten ( titel, uursoort_id, geschatte_uren, dossier_id ), medewerkers ( voornaam, tussenvoegsel, achternaam, functie )'),
    supabase.from('medewerker_roosters').select('*'),
    supabase.from('medewerker_afwezigheid').select('*').gte('eind_datum', vandaag),
    supabase.from('dossiers').select('id, titel, dossiernummer').eq('hoofdstatus', 'opdracht'),
    supabase.from('planning_uursoorten').select('id, naam, kleur, code').eq('actief', true),
    haalPlanningItemsMetExpansie(jaar),
  ])

  // Alleen uitvoerend personeel: kantoor-afdelingen weglaten (medewerkers zonder
  // afdeling blijven wél staan).
  const medewerkers = ((medewerkerRes.data ?? []) as Medewerker[])
    .filter(m => !m.afdeling || !KANTOOR_AFDELINGEN.includes(m.afdeling))
  const roosters    = (roostersRes.data ?? []) as MedewerkerRooster[]
  const afwezigheid = (afwezigheidRes.data ?? []) as MedewerkerAfwezigheid[]
  const uursoorten  = (uursoortRes.data ?? []) as PlanningUursoort[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entries: (PlanningItemVerrijkt & { dossier_id?: string })[] = (entriesRes.data ?? []).map((e: any) => ({
    ...e,
    dossier_id: e.planning_activiteiten?.dossier_id ?? undefined,
  }))

  const dossierMap: Record<string, string> = {}
  for (const d of (dossiersRes.data ?? [])) {
    dossierMap[d.id] = d.dossiernummer ? `${d.dossiernummer} ${d.titel}` : d.titel
  }

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Planning" title="Medewerkerplanning" className="mb-2" />
      <p className="mb-[22px] text-sm text-neutral-500">
        Capaciteitsoverzicht — sleep entries om medewerkers te herplannen.
      </p>

      <MedewerkerTimeline
        medewerkers={medewerkers}
        entries={entries}
        roosters={roosters}
        afwezigheid={afwezigheid}
        dossierMap={dossierMap}
        uursoorten={uursoorten}
        agendaItems={agendaItems}
        feestdagen={feestdagen}
      />
    </div>
  )
}
