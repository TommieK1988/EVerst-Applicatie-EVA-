import Link from 'next/link'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { signPaden } from '@/lib/materieel/bestanden'
import { getMijnMaterieel, getRecentToegevoegd, type MaterieelKort } from '@/lib/materieel/zoeken'
import { CATEGORIE_LABELS, STATUS_META } from '@/lib/materieel/types'
import AppHeader from '@/components/mobiel/AppHeader'

export const metadata = { title: 'Materieel' }
export const dynamic = 'force-dynamic'

/**
 * Startscherm van materieel op de telefoon: scannen staat vooraan, want dat is
 * wat je in de bus of het magazijn doet. Daaronder je eigen spullen, zodat je
 * zonder te scannen kunt kijken wat er op jouw naam staat.
 */
export default async function MobielMaterieelPage() {
  const medewerker = await vereisMaterieelToegang('lezen', '/m')
  const rechten = await getEffectieveRechten(medewerker)
  const magToevoegen = heeftModuleToegang(rechten, 'materieelbeheer', 'schrijven')

  const [mijn, recent] = await Promise.all([
    getMijnMaterieel(medewerker.id),
    magToevoegen ? getRecentToegevoegd(medewerker.id, 5) : Promise.resolve([]),
  ])

  // Recent toegevoegd dat al bij "mijn materieel" staat, niet dubbel tonen.
  const mijnIds = new Set(mijn.map((m) => m.id))
  const overig = recent.filter((r) => !mijnIds.has(r.id))

  const fotos = await signPaden(
    [...mijn, ...overig].map((o) => o.hoofdfoto_path).filter(Boolean) as string[],
  )

  return (
    <>
      <AppHeader title="Materieel" sub="Scannen en toevoegen" backHref="/m" />
      <div style={{ padding: 14 }}>
        <Link
          href="/m/materieel/scan"
          style={{
            display: 'block', padding: '18px 16px', borderRadius: 14,
            background: '#009439', color: '#fff', textDecoration: 'none',
            fontSize: 17, fontWeight: 800, textAlign: 'center',
          }}
        >
          Sticker scannen
        </Link>

        {magToevoegen && (
          <Link
            href="/m/materieel/nieuw"
            style={{
              display: 'block', marginTop: 10, padding: '14px 16px', borderRadius: 12,
              background: 'var(--bg-elev)', color: 'var(--fg-muted)',
              border: '1px solid var(--border)', textDecoration: 'none',
              fontSize: 15, fontWeight: 600, textAlign: 'center',
            }}
          >
            Toevoegen zonder sticker
          </Link>
        )}

        <Lijst titel="Op mijn naam" items={mijn} fotos={fotos} leeg="Er staat nog niets op jouw naam." />
        {overig.length > 0 && (
          <Lijst titel="Recent door mij toegevoegd" items={overig} fotos={fotos} leeg="" />
        )}
      </div>
    </>
  )
}

function Lijst({
  titel, items, fotos, leeg,
}: {
  titel: string
  items: MaterieelKort[]
  fotos: Map<string, string>
  leeg: string
}) {
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>
        {titel}
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 14, color: 'var(--fg-muted)' }}>{leeg}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((o) => {
            const status = STATUS_META[o.status]
            const foto = o.hoofdfoto_path ? fotos.get(o.hoofdfoto_path) : null
            return (
              <Link
                key={o.id}
                href={`/m/materieel/${o.id}`}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: 10, borderRadius: 12,
                  background: 'var(--bg-elev)', border: '1px solid var(--border)',
                  textDecoration: 'none', color: 'var(--fg)',
                }}
              >
                <span style={{
                  width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                  background: foto ? `center/cover url(${foto})` : 'var(--bg)',
                  border: '1px solid var(--border)',
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.omschrijving}
                  </span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-muted)' }}>
                    {[CATEGORIE_LABELS[o.categorie], o.merk, o.type].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  color: status.kleur, background: `${status.kleur}1a`, flexShrink: 0,
                }}>
                  {status.label}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
