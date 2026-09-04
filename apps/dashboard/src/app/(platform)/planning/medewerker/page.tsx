import { createAdminClient } from '@everts/database/server'
import type { Metadata } from 'next'
import type { Medewerker, MedewerkerRooster, MedewerkerAfwezigheid, PlanningItemVerrijkt, PlanningUursoort } from '@everts/database/platform-types'
import MedewerkerTimeline from '@/components/planning/MedewerkerTimeline'
import { haalPlanningItemsMetExpansie } from '../bedrijfsagenda/actions'
import { berekenFeestdagen } from '@/lib/agenda/feestdagen'
import { PageHeader } from '@/components/ui'
import VerlofGoedkeurenKnop from '@/components/planning/VerlofGoedkeurenKnop'
import { haalAlleRijen } from '@/lib/supabase/paginate'

export const metadata: Metadata = { title: 'Medewerkerplanning' }

/** Niet-uitvoerende afdelingen die buiten de medewerkerplanning blijven.
 *  Pas deze lijst aan als de afdelingsindeling wijzigt. */
const KANTOOR_AFDELINGEN = ['Projectbureau', 'Administratie', 'Directie']

/** Dossierregel zoals dit scherm hem nodig heeft: alleen titel + projectleider voor de balken. */
type DossierRegel = {
  id: string
  titel: string
  dossiernummer: string | null
  project_manager_id: string | null
  medewerkers: { voornaam: string; tussenvoegsel: string | null; achternaam: string; kleur: string | null } | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export default async function MedewerkerplanningPage() {
  const supabase = db()
  const vandaag  = new Date().toISOString().slice(0, 10)
  const jaar     = new Date().getFullYear()

  const feestdagen = berekenFeestdagen(jaar)

  const [medewerkerRes, entries, roostersRes, afwezigheidRes, dossiers, uursoortRes, ploegenRes, agendaItems] = await Promise.all([
    supabase.from('medewerkers').select('*').eq('actief', true).order('achternaam'),
    // Gepagineerd: `planning_items` is voorbij de 1000 rijen gegroeid en PostgREST kapte de rest
    // er stil af, waardoor willekeurige medewerkers een lege regel kregen terwijl hun planning
    // gewoon in de database stond. Zie lib/supabase/paginate.ts.
    haalAlleRijen<PlanningItemVerrijkt>((van, tot) =>
      supabase
        .from('planning_items')
        .select('*, planning_activiteiten ( titel, uursoort_id, geschatte_uren, dossier_id ), medewerkers ( voornaam, tussenvoegsel, achternaam, functie )')
        .order('id')
        .range(van, tot)),
    supabase.from('medewerker_roosters').select('*'),
    supabase.from('medewerker_afwezigheid').select('*').gte('eind_datum', vandaag),
    // Ook gepagineerd: het dossierbestand groeit gestaag richting de 1000 en zou daarna
    // stilzwijgend afkappen — balken tonen dan een rauwe UUID in plaats van een titel.
    haalAlleRijen<DossierRegel>((van, tot) =>
      supabase.from('dossiers')
        .select('id, titel, dossiernummer, project_manager_id, medewerkers!project_manager_id ( voornaam, tussenvoegsel, achternaam, kleur )')
        // Zelfde scope als de planning-sync: opdracht + servicedesk (LB-status/categorie) —
        // anders tonen balken van servicedesk-dossiers een rauwe dossier-UUID als titel.
        .or('hoofdstatus.eq.opdracht,bouw7_projectstatus_naam.ilike.LB.%,bouw7_categorie_naam.in.(Dagelijks onderhoud,Mutatie)')
        .order('id')
        .range(van, tot)),
    supabase.from('planning_uursoorten').select('id, naam, kleur, code').eq('actief', true),
    supabase.from('ploegen').select('id, naam').eq('actief', true),
    haalPlanningItemsMetExpansie(jaar),
  ])

  const ploegNamen: Record<string, string> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const p of ((ploegenRes.data ?? []) as any[])) ploegNamen[p.id] = p.naam

  // Alleen uitvoerend personeel: kantoor-afdelingen weglaten (medewerkers zonder
  // afdeling blijven wél staan).
  const medewerkers = ((medewerkerRes.data ?? []) as Medewerker[])
    .filter(m => !m.afdeling || !KANTOOR_AFDELINGEN.includes(m.afdeling))
  const roosters    = (roostersRes.data ?? []) as MedewerkerRooster[]
  const afwezigheid = (afwezigheidRes.data ?? []) as MedewerkerAfwezigheid[]
  const uursoorten  = (uursoortRes.data ?? []) as PlanningUursoort[]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const entriesMetDossier: (PlanningItemVerrijkt & { dossier_id?: string })[] = entries.map((e: any) => ({
    ...e,
    dossier_id: e.planning_activiteiten?.dossier_id ?? undefined,
  }))

  const dossierMap: Record<string, string> = {}
  const projectleiders: Record<string, { kleur: string | null; naam: string | null }> = {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const d of (dossiers as any[])) {
    dossierMap[d.id] = d.dossiernummer ? `${d.dossiernummer} ${d.titel}` : d.titel
    const med = d.medewerkers
    projectleiders[d.id] = {
      kleur: med?.kleur ?? null,
      naam: med ? [med.voornaam, med.tussenvoegsel, med.achternaam].filter(Boolean).join(' ') : null,
    }
  }

  return (
    <div className="eva-page-vol">
      {/* Toelichting op de bediening staat in de HELP-tekst van de topbar (lib/page-help.ts). */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <PageHeader eyebrow="Planning" title="Medewerkerplanning" className="mb-3" />
        {/* Verlof beoordelen hoort hier: je ziet meteen wie er die week al vrij is en wat er staat. */}
        <div style={{ marginLeft: 'auto', paddingTop: 6 }}>
          <VerlofGoedkeurenKnop />
        </div>
      </div>

      <MedewerkerTimeline
        medewerkers={medewerkers}
        entries={entriesMetDossier}
        roosters={roosters}
        afwezigheid={afwezigheid}
        dossierMap={dossierMap}
        projectleiders={projectleiders}
        ploegNamen={ploegNamen}
        uursoorten={uursoorten}
        agendaItems={agendaItems}
        feestdagen={feestdagen}
      />
    </div>
  )
}
