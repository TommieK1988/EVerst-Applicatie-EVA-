import { createAdminClient } from '@everts/database/server'
import type {
  MedewerkerFunctie, MedewerkerAfdeling, Ploeg,
  CaoDocument, CaoLoonschaal, Bedrijfsgegevens,
  MedewerkerAttribuutDefinitie,
} from '@everts/database/platform-types'
import { PageHeader, Card, CardBody, SubTabs } from '@/components/ui'
import FunctiesAfdelingenBeheer, { type MedewerkerOptie } from '../functies-afdelingen/FunctiesAfdelingenBeheer'
import CaoBeheer from '../cao/CaoBeheer'
import AttribuutDefinitiesBeheer from '../medewerker-attributen/AttribuutDefinitiesBeheer'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'Medewerkers' }

/**
 * Alles wat je aan een medewerkerprofiel kunt hangen op één scherm: de keuzelijsten
 * (functies, afdelingen, ploegen), de CAO-loonschalen en de eigen velden.
 *
 * Tabbladen en geen gestapelde kaarten: dit zijn de zwaarste beheerders van de hele
 * instellingenmap. Met `?deel=` haalt de server alleen het gekozen deel op.
 */
const DELEN = [
  { deel: 'functies', label: 'Functies, afdelingen & ploegen' },
  { deel: 'cao', label: 'CAO' },
  { deel: 'attributen', label: 'Eigen velden' },
] as const

type Deel = (typeof DELEN)[number]['deel']

export default async function Page({ searchParams }: { searchParams: Promise<{ deel?: string }> }) {
  const { deel: gevraagd } = await searchParams
  const deel: Deel = DELEN.some(d => d.deel === gevraagd) ? (gevraagd as Deel) : 'functies'

  return (
    <div className="eva-page-full">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Beheer" title="Medewerkers" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Wat er op een medewerkerprofiel te kiezen valt: functies, afdelingen en ploegen, de
        loonschalen uit de CAO, en de eigen velden die je zelf bijhoudt.
      </p>

      <SubTabs delen={DELEN.map(d => ({ ...d, actief: d.deel === deel }))} />

      {deel === 'functies' && <Functies />}
      {deel === 'cao' && <Cao />}
      {deel === 'attributen' && <Attributen />}
    </div>
  )
}

async function Functies() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data: functies }, { data: afdelingen }, { data: ploegen }, { data: medewerkers }] = await Promise.all([
    supabase.from('medewerker_functies').select('*').order('volgorde').order('naam'),
    supabase.from('medewerker_afdelingen').select('*').order('volgorde').order('naam'),
    supabase.from('ploegen').select('*').order('volgorde').order('naam'),
    supabase
      .from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, afdeling, uren_goedkeurder_id, auth_user_id')
      .eq('actief', true)
      .order('voornaam'),
  ])

  return (
    <Card>
      <CardBody>
        <FunctiesAfdelingenBeheer
          functies={(functies ?? []) as MedewerkerFunctie[]}
          afdelingen={(afdelingen ?? []) as MedewerkerAfdeling[]}
          ploegen={(ploegen ?? []) as Ploeg[]}
          medewerkers={(medewerkers ?? []) as MedewerkerOptie[]}
        />
      </CardBody>
    </Card>
  )
}

async function Cao() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [{ data: docs }, { data: wms }] = await Promise.all([
    supabase
      .from('cao_documenten')
      .select('*, schalen:cao_loonschalen(*)')
      .eq('actief', true)
      .order('created_at', { ascending: false }),
    supabase
      .from('bedrijfsgegevens')
      .select('id, naam')
      .in('type', ['organisatie', 'werkmaatschappij'])
      .order('naam'),
  ])

  const initial = (docs ?? []).map((d: CaoDocument & { schalen: CaoLoonschaal[] }) => ({
    ...d,
    schalen: (d.schalen ?? []).sort((a: CaoLoonschaal, b: CaoLoonschaal) => a.volgorde - b.volgorde),
  }))

  return (
    <Card>
      <CardBody>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px' }}>
          Upload een CAO-document als PDF. EVA leest de loonschalen en treden automatisch in via AI.
          De schalen zijn daarna selecteerbaar bij het medewerkerprofiel.
        </p>
        <CaoBeheer
          initial={initial}
          werkmaatschappijen={(wms ?? []) as Pick<Bedrijfsgegevens, 'id' | 'naam'>[]}
        />
      </CardBody>
    </Card>
  )
}

async function Attributen() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const { data } = await supabase
    .from('medewerker_attribuut_definities')
    .select('*')
    .order('volgorde', { ascending: true })

  return (
    <Card>
      <CardBody>
        <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px' }}>
          Welke extra velden beschikbaar zijn op het medewerkerprofiel. Hier voeg je velden toe,
          bewerk je ze of zet je ze uit.
        </p>
        <AttribuutDefinitiesBeheer initial={(data ?? []) as MedewerkerAttribuutDefinitie[]} />
      </CardBody>
    </Card>
  )
}
