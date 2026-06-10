import { createAdminClient } from '@everts/database/server'
import GanttBord from '@/components/planning/GanttBord'
import { PageHeader } from '@/components/ui'
import type { Dossier } from '@everts/database/platform-types'

export type OpdrachtRij = Dossier & {
  klant_naam:          string | null
  projectleider_naam:  string | null
  projectleider_kleur: string | null
  geplande_uren_pct?:  number
  planning_start?:     string | null
  planning_eind?:      string | null
}

export const metadata = { title: 'Projectplanning' }

export default async function ProjectplanningPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [{ data, error }, { data: planData }] = await Promise.all([
    supabase
      .from('dossiers')
      .select(`
        *,
        relaties!klant_id ( naam ),
        medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam, kleur )
      `)
      .eq('hoofdstatus', 'opdracht')
      .not('opdracht_substatus', 'in', '(financieel_gereed,financieel_afgesloten)')
      .order('verwacht_startdatum', { ascending: true, nullsFirst: false }),

    supabase.rpc('planning_datums_per_dossier'),
  ])

  if (error) {
    throw new Error(`Opdrachten konden niet worden geladen: ${error.message}`)
  }

  const planMap = new Map<string, { planning_start: string; planning_eind: string }>(
    (planData ?? []).map((r: any) => [r.dossier_id, r]),
  )

  const opdrachten: OpdrachtRij[] = (data ?? []).map((row: any) => {
    const med = row.medewerkers
    const projectleider_naam = med
      ? [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ')
      : null
    const plan = planMap.get(row.id)
    return {
      ...row,
      relaties:            undefined,
      medewerkers:         undefined,
      klant_naam:          row.relaties?.naam ?? null,
      projectleider_naam,
      projectleider_kleur: med?.kleur ?? null,
      planning_start:      plan?.planning_start ?? null,
      planning_eind:       plan?.planning_eind  ?? null,
    }
  })

  return (
    <div className="eva-page-full">
      <PageHeader
        eyebrow="Planning"
        title="Projectplanning"
        className="mb-2"
      />
      <p className="mb-[22px] text-sm text-neutral-500">
        Overzicht van alle lopende opdrachten op een tijdlijn.
      </p>

      <GanttBord opdrachten={opdrachten} />
    </div>
  )
}
