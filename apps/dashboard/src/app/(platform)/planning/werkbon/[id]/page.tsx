import { createAdminClient } from '@everts/database/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import Link from 'next/link'
import WerkbonFlow from '@/components/planning/werkbon/WerkbonFlow'

export const metadata: Metadata = { title: 'Werkbon' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

export default async function WerkbonPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = db()

  const { data: item, error } = await supabase
    .from('planning_items')
    .select(`
      *,
      planning_activiteiten (
        *,
        dossiers ( titel, dossiernummer, relaties!klant_id ( naam ) )
      ),
      medewerkers ( voornaam, achternaam ),
      werkbonnen ( id, start_dt, klaar_gemeld_op )
    `)
    .eq('id', params.id)
    .single()

  if (error || !item) notFound()

  const activiteit = item.planning_activiteiten
  const dossier    = activiteit?.dossiers
  const klant      = dossier?.relaties?.naam ?? '—'
  const bestaand   = item.werkbonnen?.[0] ?? null

  // Andere medewerkers op dezelfde activiteit
  const { data: andereItems } = await supabase
    .from('planning_items')
    .select('medewerkers ( voornaam, tussenvoegsel, achternaam )')
    .eq('activiteit_id', activiteit.id)
    .neq('id', params.id)

  const andereMedewerkers = ((andereItems ?? []) as any[]).map((e: any) => {
    const m = e.medewerkers
    return [m?.voornaam, m?.tussenvoegsel, m?.achternaam].filter(Boolean).join(' ')
  }).filter(Boolean)

  return (
    <div>
      {/* Mini-header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Link href="/planning/mijn-werkbonnen" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-muted)', textDecoration: 'none' }}>
          ← Mijn werkbonnen
        </Link>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--fg)', marginLeft: 'auto' }}>
          {activiteit?.titel ?? 'Werkbon'}
        </span>
      </div>

      <WerkbonFlow
        planning_item_id={params.id}
        activiteitTitel={activiteit?.titel ?? '—'}
        dossierTitel={dossier?.dossiernummer ? `${dossier.dossiernummer} ${dossier.titel}` : (dossier?.titel ?? '—')}
        klantNaam={klant}
        locatieAdres={activiteit?.locatie_adres ?? null}
        omschrijving={activiteit?.omschrijving ?? null}
        medewerkersOokGepland={andereMedewerkers}
        bestaandeWerkbonId={bestaand?.id ?? null}
        readsAlBezig={!!bestaand && !bestaand.klaar_gemeld_op}
      />
    </div>
  )
}
