import { createAdminClient } from '@everts/database/server'
import { PageHeader, SubTabs } from '@/components/ui'
import { vereisModuleToegang, getCurrentMedewerker } from '@/lib/auth/rechten'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'
import AfdelingRechtenBeheer, { type AfdelingMetRechten } from './AfdelingRechtenBeheer'
import GebruikerRechtenBeheer, { type GebruikerRij } from './GebruikerRechtenBeheer'
import UitlegOverzicht from './UitlegOverzicht'

export const metadata = { title: 'Gebruikers & rechten' }
export const dynamic = 'force-dynamic'

/**
 * Alle rechten op één scherm. Ze stonden eerst op twee plekken — de
 * afdelingsmatrix hier, de persoonlijke afwijking op het medewerkerdetail — en
 * daardoor zag je nooit het geheel: waaróm iemand ergens wel of niet bij kon,
 * moest je uit twee schermen bij elkaar zoeken.
 *
 * Tabbladen via `?deel=` en geen client-state: elk deel haalt zijn eigen data op.
 */
const DELEN = [
  { deel: 'gebruikers', label: 'Gebruikers' },
  { deel: 'afdelingen', label: 'Afdelingen' },
  { deel: 'uitleg',     label: 'Wat betekent wat' },
] as const

type Deel = (typeof DELEN)[number]['deel']

export default async function GebruikersPage({
  searchParams,
}: {
  searchParams: Promise<{ deel?: string }>
}) {
  // Dit scherm toont van iedere collega zijn rechten en laat ze wijzigen. Alleen
  // beheerders; de actions erachter eisen dezelfde gate, want ze zijn ook als
  // kale RPC aanroepbaar.
  await vereisModuleToegang('instellingen', 'beheren')

  const { deel: gevraagd } = await searchParams
  const deel: Deel = DELEN.some(d => d.deel === gevraagd) ? (gevraagd as Deel) : 'gebruikers'

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Instellingen" title="Gebruikers & rechten" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Wie mag wat, en waar. Elke afdeling heeft een standaard; per collega kun je daarvan
        afwijken. Desktop en mobiel stel je apart in — iemand kan op zijn telefoon meer of
        minder mogen dan op zijn werkplek.
      </p>

      <SubTabs delen={DELEN.map(d => ({ ...d, actief: d.deel === deel }))} />

      {deel === 'gebruikers' && <Gebruikers />}
      {deel === 'afdelingen' && <Afdelingen />}
      {deel === 'uitleg' && <UitlegOverzicht />}
    </div>
  )
}

/**
 * De kolommen `rechten` (jsonb) en `afdeling_id` staan nog niet in de
 * gegenereerde `database.types.ts`, dus de getypeerde client wijst ze af. Eén
 * cast op één plek, net als in ./actions.ts — niet per functie opnieuw.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => createAdminClient() as any

async function Gebruikers() {
  const [ik, gebruikersRes, afdelingenRes] = await Promise.all([
    getCurrentMedewerker(),
    db().from('medewerkers')
      .select('id, voornaam, tussenvoegsel, achternaam, email, afdeling, afdeling_id, gebruiker_type, rechten, rechten_override, o365_email, auth_user_id')
      .neq('gebruiker_type', 'geen')
      .eq('actief', true)
      .order('achternaam'),
    db().from('medewerker_afdelingen')
      .select('id, rechten, standaard_rechten')
      .eq('actief', true),
  ])

  // Beide begrensd: hooguit enkele tientallen gebruikers en een handvol
  // afdelingen. Geen paginering nodig, wel bewust gecontroleerd.
  type AfdelingRij = { id: string; rechten: unknown; standaard_rechten: unknown }
  const perAfdeling = new Map<string, AfdelingRij>(
    ((afdelingenRes.data ?? []) as AfdelingRij[]).map(a => [a.id, a]),
  )

  const gebruikers: GebruikerRij[] = ((gebruikersRes.data ?? []) as Array<
    Omit<GebruikerRij, 'afdeling_rechten' | 'afdeling_standaard_rechten'> & { afdeling_id: string | null }
  >).map(g => {
    const a = g.afdeling_id ? perAfdeling.get(g.afdeling_id) : undefined
    return {
      ...g,
      afdeling_rechten: a?.rechten ?? null,
      afdeling_standaard_rechten: a?.standaard_rechten ?? null,
    }
  })

  return <GebruikerRechtenBeheer gebruikers={gebruikers} eigenId={ik?.id ?? null} />
}

async function Afdelingen() {
  const { data } = await db()
    .from('medewerker_afdelingen')
    .select('id, naam, volgorde, actief, rechten, standaard_rechten')
    .eq('actief', true)
    .order('volgorde')
    .order('naam')

  return (
    <div>
      <p style={{
        fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)',
        margin: '0 0 14px', maxWidth: 780, lineHeight: 1.5,
      }}>
        Dit is de standaard die iedereen in die afdeling krijgt. Wijkt iemand af, dan stel je dat
        bij hem in onder Gebruikers — de afwijking wint. Klap een onderdeel uit om te lezen wat
        lezen, schrijven en beheren daar betekenen.
      </p>
      <AfdelingRechtenBeheer afdelingen={(data ?? []) as AfdelingMetRechten[]} />
    </div>
  )
}
