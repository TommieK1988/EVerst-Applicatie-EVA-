import { createAdminClient } from '@everts/database/server'
import type { PlanningUursoort } from '@everts/database/platform-types'
import { PageHeader, Card, CardBody, SubTabs } from '@/components/ui'
import { vereisModuleToegang } from '@/lib/auth/rechten'
import { getBedrijfsinstellingen } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import UrenInstellingenBeheer from '@/components/instellingen/UrenInstellingenBeheer'
import UurtariefBeheer from '@/components/instellingen/UurtariefBeheer'
import UursoortBeheer from '@/components/planning/UursoortBeheer'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'Uren' }
export const dynamic = 'force-dynamic'

/**
 * Weekstaat, uursoorten en uurtarieven op één scherm.
 *
 * Ze horen bij elkaar: een uursoort zonder tarief en zonder weekstaat-telling is halve
 * informatie. Tabbladen en geen gestapelde kaarten, want de drie beheerders zijn samen ruim
 * duizend regels client — met `?deel=` laadt alleen het gekozen deel.
 */
const DELEN = [
  { deel: 'verantwoording', label: 'Verantwoording' },
  { deel: 'uursoorten', label: 'Uursoorten' },
  { deel: 'tarieven', label: 'Uurtarieven' },
] as const

type Deel = (typeof DELEN)[number]['deel']

export default async function UrenInstellingenPage({ searchParams }: { searchParams: Promise<{ deel?: string }> }) {
  // Let op: dit gold al voor de weekstaat-instellingen en dekt nu ook uursoorten en tarieven,
  // die eerder zonder page-guard bereikbaar waren.
  await vereisModuleToegang('instellingen', 'beheren')

  const { deel: gevraagd } = await searchParams
  const deel: Deel = DELEN.some(d => d.deel === gevraagd) ? (gevraagd as Deel) : 'verantwoording'

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Financieel" title="Uren" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Hoe de weekstaat rekent en waar de uren landen. De uursoorten komen uit Bouw7; wat EVA er
        zelf bij vastlegt is hoe elke soort meetelt en welk tarief eraan hangt.
      </p>

      <SubTabs delen={DELEN.map(d => ({ ...d, actief: d.deel === deel }))} />

      {deel === 'verantwoording' && <Verantwoording />}
      {deel === 'uursoorten' && <Uursoorten />}
      {deel === 'tarieven' && <Tarieven />}
    </div>
  )
}

async function Verantwoording() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any

  const [{ data: instellingen }, { data: uursoorten }, { data: werkmaatschappijen }, { data: medewerkers }, { data: dossiers }, { data: ploegen }, { data: afdelingen }] =
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
      supabase.from('medewerker_afdelingen').select('naam').eq('actief', true).order('volgorde'),
    ])

  return (
    <UrenInstellingenBeheer
      instellingen={instellingen ?? null}
      uursoorten={uursoorten ?? []}
      werkmaatschappijen={werkmaatschappijen ?? []}
      medewerkers={medewerkers ?? []}
      indirectDossiers={dossiers ?? []}
      ploegen={ploegen ?? []}
      afdelingen={(afdelingen ?? []).map((a: { naam: string }) => a.naam)}
    />
  )
}

async function Uursoorten() {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('planning_uursoorten')
    .select('*')
    .eq('actief', true)
    .order('volgorde', { ascending: true })

  return (
    <Card>
      <CardBody>
        <UursoortBeheer initial={(data ?? []) as PlanningUursoort[]} />
      </CardBody>
    </Card>
  )
}

async function Tarieven() {
  const instellingen = await getBedrijfsinstellingen()
  return (
    <Card>
      <CardBody>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px' }}>
          Uurtarieven volgen de hiërarchie medewerker → uursoort → globaal. Ze worden gebruikt door
          planning, urenregistratie en calculatie.
        </p>
        <UurtariefBeheer initial={instellingen.uurtarieven ?? []} />
      </CardBody>
    </Card>
  )
}
