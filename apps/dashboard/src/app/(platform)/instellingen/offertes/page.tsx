import { PageHeader, Card, CardBody, SubTabs } from '@/components/ui'
import { getGoedkeuringDrempelOfferte } from '@/app/(platform)/instellingen/bedrijfsinstellingen/actions'
import { getLayouts } from '../offerte-layout/actions'
import LayoutsBeheer from '../offerte-layout/LayoutsBeheer'
import { getAlgemeneVoorwaarden, type AlgemeneVoorwaarden } from '../algemene-voorwaarden/actions'
import AlgemeneVoorwaardenBeheer from '../algemene-voorwaarden/AlgemeneVoorwaardenBeheer'
import { getBetalingscondities, type Betalingsconditie } from '../betalingscondities/actions'
import BetalingsconditiesBeheer from '../betalingscondities/BetalingsconditiesBeheer'
import GoedkeuringDrempelBeheer from './GoedkeuringDrempelBeheer'
import TerugNaarInstellingen from '@/components/instellingen/TerugNaarInstellingen'

export const metadata = { title: 'Offertes' }
export const dynamic = 'force-dynamic'

/**
 * Alles wat bij een offerte hoort op één scherm, verdeeld over tabbladen.
 *
 * Tabbladen en geen gestapelde kaarten: de opmaak- en voorwaardenbeheerders zijn zware
 * client-eilanden met eigen uploads. Met `?deel=` haalt de server alleen het gekozen deel op.
 */
const DELEN = [
  { deel: 'opmaak', label: 'Opmaak' },
  { deel: 'voorwaarden', label: 'Algemene voorwaarden' },
  { deel: 'condities', label: 'Betalingscondities' },
  { deel: 'goedkeuring', label: 'Goedkeuring' },
] as const

type Deel = (typeof DELEN)[number]['deel']

export default async function Page({ searchParams }: { searchParams: Promise<{ deel?: string }> }) {
  const { deel: gevraagd } = await searchParams
  const deel: Deel = DELEN.some(d => d.deel === gevraagd) ? (gevraagd as Deel) : 'opmaak'

  return (
    <div className="eva-page">
      <TerugNaarInstellingen />
      <PageHeader eyebrow="Dossiers & offertes" title="Offertes" />
      <p className="eva-page-desc" style={{ marginTop: -14, marginBottom: 22 }}>
        Hoe een offerte eruitziet en wat erbij hoort: de Word-opmaak, de algemene voorwaarden,
        het termijnschema en vanaf welk bedrag een offerte langs een tweede paar ogen moet.
      </p>

      <SubTabs delen={DELEN.map(d => ({ ...d, actief: d.deel === deel }))} />

      {deel === 'opmaak' && <Opmaak />}
      {deel === 'voorwaarden' && <Voorwaarden />}
      {deel === 'condities' && <Condities />}
      {deel === 'goedkeuring' && <Goedkeuring />}
    </div>
  )
}

async function Opmaak() {
  let layouts = []
  try {
    layouts = await getLayouts()
  } catch {
    // Tabel bestaat nog niet
  }
  return (
    <Card>
      <CardBody>
        <LayoutsBeheer initial={layouts} />
      </CardBody>
    </Card>
  )
}

async function Voorwaarden() {
  let items: AlgemeneVoorwaarden[] = []
  try {
    items = await getAlgemeneVoorwaarden()
  } catch {
    // Tabel bestaat nog niet
  }
  return (
    <div className="eva-card" style={{ padding: '24px 28px' }}>
      <AlgemeneVoorwaardenBeheer initial={items} />
    </div>
  )
}

async function Condities() {
  let condities: Betalingsconditie[] = []
  try {
    condities = await getBetalingscondities()
  } catch {
    // Tabel bestaat nog niet
  }
  return (
    <div className="eva-card" style={{ padding: '24px 28px' }}>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: '0 0 14px' }}>
        Termijnschema&apos;s voor de aanneemsom — welk percentage wanneer verschuldigd is.
        De betalingstermijn in dagen stel je per relatie in.
      </p>
      <BetalingsconditiesBeheer initial={condities} />
    </div>
  )
}

async function Goedkeuring() {
  const drempel = await getGoedkeuringDrempelOfferte()
  return (
    <Card style={{ maxWidth: 560 }}>
      <CardBody>
        <h2 style={{ fontFamily: 'var(--font-ui)', fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>
          Goedkeuring offertes
        </h2>
        <GoedkeuringDrempelBeheer initial={drempel} />
      </CardBody>
    </Card>
  )
}
