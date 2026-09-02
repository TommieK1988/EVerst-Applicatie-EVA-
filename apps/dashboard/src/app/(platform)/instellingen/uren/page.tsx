import { createAdminClient } from '@everts/database/server'
import { PageHeader } from '@/components/ui'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import UrenInstellingenBeheer from '@/components/instellingen/UrenInstellingenBeheer'

export const metadata = { title: 'Urenverantwoording' }
export const dynamic = 'force-dynamic'

export default async function UrenInstellingenPage() {
  await vereisModuleToegang('instellingen', 'beheren')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [{ data: instellingen }, { data: uursoorten }, { data: werkmaatschappijen }, { data: medewerkers }, { data: dossiers }, { data: ploegen }] =
    await Promise.all([
      supabase.from('uren_instellingen').select('*').eq('id', true).maybeSingle(),
      supabase
        .from('planning_uursoorten')
        .select('id, naam, code, bouw7_id, uren_categorie, actief')
        .order('naam', { ascending: true }),
      supabase.from('bedrijfsgegevens').select('id, naam, indirect_uren_dossier_id').order('naam'),
      supabase
        .from('medewerkers')
        .select('id, voornaam, tussenvoegsel, achternaam')
        .eq('actief', true)
        .neq('gebruiker_type', 'geen')
        .order('voornaam'),
      // De kandidaat-dossiers voor indirecte uren. Bewust beperkt tot dossiers met een
      // Bouw7-koppeling: zonder Bouw7-project kan er geen hour-log op geboekt worden.
      supabase
        .from('dossiers')
        .select('id, dossiernummer, titel')
        .not('bouw7_id', 'is', null)
        .ilike('titel', '%indirect%')
        .order('titel'),
      supabase.from('ploegen').select('id, naam, goedkeuring_modus').eq('actief', true).order('volgorde'),
    ])

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Instellingen" title="Urenverantwoording" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Bepaalt hoe de weekstaat rekent en waar de uren landen. De uursoorten komen uit Bouw7;
        wat EVA er zelf bij vastlegt is hoe elke soort meetelt.
      </p>

      <UrenInstellingenBeheer
        instellingen={instellingen ?? null}
        uursoorten={uursoorten ?? []}
        werkmaatschappijen={werkmaatschappijen ?? []}
        medewerkers={medewerkers ?? []}
        indirectDossiers={dossiers ?? []}
        ploegen={ploegen ?? []}
      />
    </div>
  )
}
