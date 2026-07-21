import { createAdminClient } from '@everts/database/server'
import { notFound } from 'next/navigation'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import AppHeader from '@/components/mobiel/AppHeader'
import WerkbonFlow from '@/components/planning/werkbon/WerkbonFlow'

export const metadata = { title: 'Werkbon · EVA Mobiel' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

/**
 * Mobiele werkbon-registratie: hergebruikt de bestaande `WerkbonFlow` (start/stop,
 * foto's, handtekening, uren → `uren_regels`) binnen de /m-shell.
 */
export default async function MobielWerkbonPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const medewerker = await getCurrentMedewerker()
  if (!medewerker) notFound()

  const supabase = db()

  const { data: item, error } = await supabase
    .from('planning_items')
    .select(`
      *,
      planning_activiteiten (
        *,
        dossiers ( titel, dossiernummer, relaties!klant_id ( naam ) )
      ),
      werkbonnen ( id, start_dt, klaar_gemeld_op )
    `)
    .eq('id', id)
    .single()

  if (error || !item) notFound()

  // IDOR-guard: alleen de eigen werkbon mag geopend/geregistreerd worden.
  if (item.medewerker_id !== medewerker.id) notFound()

  const activiteit = item.planning_activiteiten
  const dossier = activiteit?.dossiers
  const klant = dossier?.relaties?.naam ?? '—'
  const bestaand = item.werkbonnen?.[0] ?? null

  const { data: andereItems } = await supabase
    .from('planning_items')
    .select('medewerkers ( voornaam, tussenvoegsel, achternaam )')
    .eq('activiteit_id', activiteit?.id)
    .neq('id', id)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const andereMedewerkers = ((andereItems ?? []) as any[]).map((e: any) => {
    const m = e.medewerkers
    return [m?.voornaam, m?.tussenvoegsel, m?.achternaam].filter(Boolean).join(' ')
  }).filter(Boolean)

  return (
    <>
      <AppHeader title={activiteit?.titel ?? 'Werkbon'} sub={klant} backHref="/m/uren" />
      <WerkbonFlow
        planning_item_id={id}
        activiteitTitel={activiteit?.titel ?? '—'}
        dossierTitel={dossier?.dossiernummer ? `${dossier.dossiernummer} ${dossier.titel}` : (dossier?.titel ?? '—')}
        klantNaam={klant}
        locatieAdres={activiteit?.locatie_adres ?? null}
        omschrijving={activiteit?.omschrijving ?? null}
        medewerkersOokGepland={andereMedewerkers}
        bestaandeWerkbonId={bestaand?.id ?? null}
        readsAlBezig={!!bestaand && !bestaand.klaar_gemeld_op}
      />
    </>
  )
}
