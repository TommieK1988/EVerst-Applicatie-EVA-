import { createAdminClient } from '@everts/database/server'
import type {
  Medewerker, MedewerkerRooster, MedewerkerAfwezigheid,
  PlanningItemVerrijkt, PlanningActiviteit, PlanningUursoort,
  PlanningWerkbegrotingRegelMetUursoort, Relatie,
  PlanningFase, PlanningAfhankelijkheid, Uurtarief,
} from '@everts/database/platform-types'
import ActiviteitGantt, { type TaakMarker } from './ActiviteitGantt'
import BudgetHeader from './BudgetHeader'
import SyncWerkbegrotingKnop from './SyncWerkbegrotingKnop'
import SyncBouw7PlanningKnop from './SyncBouw7PlanningKnop'
import MedewerkerTimeline from './MedewerkerTimeline'
import PlanningTabSwitcher from './PlanningTabSwitcher'
import { getBedrijfsinstellingen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

type BudgetRij = PlanningWerkbegrotingRegelMetUursoort & { geplande_uren: number }

export default async function DossierPlanningTab({ dossier_id }: { dossier_id: string }) {
  const supabase = db()
  const vandaag  = new Date().toISOString().slice(0, 10)

  // Stap 1: data die niet van elkaar afhankelijk zijn
  const [
    medewerkerRes, activiteitenRes, roostersRes,
    afwezigheidRes, werkbegrotingRes, uursoortRes, dossierRes, onderaannemerRes,
    fasenRes,
  ] = await Promise.all([
    supabase.from('medewerkers').select('*').eq('actief', true).order('achternaam'),
    supabase.from('planning_activiteiten').select('*').eq('dossier_id', dossier_id).order('volgorde'),
    supabase.from('medewerker_roosters').select('*'),
    supabase.from('medewerker_afwezigheid').select('*').gte('eind_datum', vandaag),
    supabase
      .from('planning_werkbegroting_regels')
      .select('*, planning_uursoorten ( naam, kleur, code )')
      .eq('dossier_id', dossier_id),
    supabase.from('planning_uursoorten').select('id, naam, kleur, code').eq('actief', true),
    supabase.from('dossiers').select('everts_calc_project_id, titel, dossiernummer, bouw7_id').eq('id', dossier_id).single(),
    supabase.from('relaties').select('id, naam').eq('type', 'onderaannemer').eq('actief', true).order('naam'),
    supabase.from('planning_fasen').select('*').eq('dossier_id', dossier_id).order('volgorde'),
  ])

  // Taken (uit task_lists gekoppeld aan dit dossier als 'project'-entity)
  const takenLijstenRes = await supabase
    .from('task_lists')
    .select('id, tasks ( id, titel, deadline, status, prioriteit )')
    .eq('entity_type', 'project')
    .eq('entity_id', dossier_id)
  const taken: TaakMarker[] = ((takenLijstenRes.data ?? []) as any[])
    .flatMap(l => (l.tasks ?? []) as any[])
    .filter(t => t && t.deadline)
    .map(t => ({
      id: t.id,
      titel: t.titel ?? '',
      deadline: t.deadline,
      status: t.status ?? null,
      prioriteit: t.prioriteit ?? null,
    }))

  const activiteiten = (activiteitenRes.data ?? []) as PlanningActiviteit[]
  const activiteitIds = activiteiten.map((a: PlanningActiviteit) => a.id)

  // Stap 2: items + afhankelijkheden (afhankelijk van activiteitIds)
  const [itemsRes, afhankelijkhedenRes] = await Promise.all([
    activiteitIds.length > 0
      ? supabase
          .from('planning_items')
          .select('*, medewerkers ( voornaam, tussenvoegsel, achternaam, functie ), planning_activiteiten ( titel, uursoort_id, geschatte_uren )')
          .in('activiteit_id', activiteitIds)
      : Promise.resolve({ data: [] }),
    activiteitIds.length > 0
      ? supabase
          .from('planning_activiteit_afhankelijkheden')
          .select('*')
          .or(`van_activiteit_id.in.(${activiteitIds.join(',')}),naar_activiteit_id.in.(${activiteitIds.join(',')})`)
      : Promise.resolve({ data: [] }),
  ])

  const medewerkers       = (medewerkerRes.data ?? []) as Medewerker[]
  const items             = (itemsRes.data ?? []) as PlanningItemVerrijkt[]
  const roosters          = (roostersRes.data ?? []) as MedewerkerRooster[]
  const afwezigheid       = (afwezigheidRes.data ?? []) as MedewerkerAfwezigheid[]
  const uursoorten        = (uursoortRes.data ?? []) as PlanningUursoort[]
  const onderaannemers    = (onderaannemerRes.data ?? []) as Pick<Relatie, 'id' | 'naam'>[]
  const fasen             = (fasenRes.data ?? []) as PlanningFase[]
  const afhankelijkheden  = (afhankelijkhedenRes.data ?? []) as PlanningAfhankelijkheid[]
  const heeftCalcProject  = !!(dossierRes.data?.everts_calc_project_id)
  const heeftBouw7        = !!(dossierRes.data?.bouw7_id)
  const bouw7LaatstSync   = activiteiten
    .filter((a: any) => a.bron === 'bouw7' && a.bouw7_laatst_sync)
    .map((a: any) => a.bouw7_laatst_sync as string)
    .sort()
    .pop() ?? null
  const bedrijfsinstellingen = await getBedrijfsinstellingen()
  const uurtarieven: Uurtarief[] = bedrijfsinstellingen.uurtarieven ?? []

  // Geplande uren per uursoort
  const geplandPerUursoort: Record<string, number> = {}
  for (const item of items) {
    const uid = (item as any).planning_activiteiten?.uursoort_id
    if (uid) geplandPerUursoort[uid] = (geplandPerUursoort[uid] ?? 0) + (item.uren ?? 0)
  }

  const budgetRegels: BudgetRij[] = ((werkbegrotingRes.data ?? []) as any[]).map((r: any) => ({
    ...r,
    geplande_uren: geplandPerUursoort[r.uursoort_id] ?? 0,
  }))

  const uursoortKleuren: Record<string, string> = {}
  for (const u of uursoorten) {
    if (u.kleur) uursoortKleuren[u.id] = u.kleur
  }

  // MedewerkerTimeline-data, gefilterd op dit dossier
  const dossierTitel = dossierRes.data?.dossiernummer
    ? `${dossierRes.data.dossiernummer} ${dossierRes.data.titel ?? ''}`.trim()
    : (dossierRes.data?.titel ?? '')
  const dossierMap: Record<string, string> = { [dossier_id]: dossierTitel }
  const timelineEntries = items.map(e => ({ ...e, dossier_id }))

  return (
    <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {budgetRegels.length > 0 && <BudgetHeader regels={budgetRegels} />}
      {(heeftCalcProject || heeftBouw7) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {heeftCalcProject && <SyncWerkbegrotingKnop dossier_id={dossier_id} />}
          {heeftBouw7 && <SyncBouw7PlanningKnop dossier_id={dossier_id} laatstSync={bouw7LaatstSync} />}
        </div>
      )}

      <PlanningTabSwitcher
        activiteiten={
          <ActiviteitGantt
            dossier_id={dossier_id}
            activiteiten={activiteiten}
            items={items}
            medewerkers={medewerkers}
            uursoorten={uursoorten}
            onderaannemers={onderaannemers}
            werkbegrotingUursoortIds={budgetRegels.map(r => r.uursoort_id)}
            fasen={fasen}
            afhankelijkheden={afhankelijkheden}
            roosters={roosters}
            afwezigheid={afwezigheid}
            uurtarieven={uurtarieven}
            taken={taken}
          />
        }
        medewerkers={
          <MedewerkerTimeline
            medewerkers={medewerkers}
            entries={timelineEntries}
            roosters={roosters}
            afwezigheid={afwezigheid}
            dossierMap={dossierMap}
            uursoorten={uursoorten}
          />
        }
      />
    </div>
  )
}
