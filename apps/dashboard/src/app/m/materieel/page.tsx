import Link from 'next/link'
import { getAppVertaler } from '@/i18n/server'
import { getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { vereisMaterieelToegang } from '@/lib/materieel/auth'
import { signPaden } from '@/lib/materieel/bestanden'
import {
  getMijnMaterieel, getRecentToegevoegd, getZonderSticker, telZonderSticker,
  type MaterieelKort,
} from '@/lib/materieel/zoeken'
import { STATUS_META } from '@/lib/materieel/types'
import AppHeader from '@/components/mobiel/AppHeader'
import MaterieelZoek from '@/components/mobiel/materieel/MaterieelZoek'
import MaterieelToevoegKnop from '@/components/mobiel/materieel/MaterieelToevoegKnop'

export const metadata = { title: 'Materieel' }
export const dynamic = 'force-dynamic'

/**
 * Startscherm van materieel op de telefoon.
 *
 * Bovenaan staat wat aan jou is toegewezen: dat is waar de meeste vragen over
 * gaan en het kost geen handeling. Daaronder een zoekveld over al het materieel
 * — niet alles heeft een leesbare sticker, en dan zoek je op wat er wél op staat:
 * merk, serienummer of het nummer van de keuringssticker. Toevoegen (scannen of
 * zonder sticker) zit achter de plus onderaan, binnen duimbereik.
 *
 * "Recent door mij toegevoegd" is kantoorwerk: het is de terugblik op een rij
 * invoerbeurten achter elkaar. Een app-gebruiker voegt hooguit incidenteel iets
 * toe en houdt zo een kort scherm over; daarom staat die lijst alleen bij
 * platformgebruikers.
 */
export default async function MobielMaterieelPage() {
  const medewerker = await vereisMaterieelToegang('lezen', '/m')
  const rechten = await getEffectieveRechten(medewerker)
  // Stickers koppelen is dagelijks werk ('schrijven'); nieuw materieel toevoegen
  // is voorbehouden aan 'beheren'.
  const magKoppelen = heeftModuleToegang(rechten, 'materieelbeheer', 'schrijven')
  const magToevoegen = heeftModuleToegang(rechten, 'materieelbeheer', 'beheren')
  // App-gebruikers krijgen een kort scherm; de terugblik op eigen invoer is kantoorwerk.
  const toonRecent = magToevoegen && medewerker.gebruiker_type === 'platform_gebruiker'

  const [mijn, recent, teStickeren, teStickerenTotaal] = await Promise.all([
    getMijnMaterieel(medewerker.id),
    toonRecent ? getRecentToegevoegd(medewerker.id, 5) : Promise.resolve([]),
    magKoppelen ? getZonderSticker(null, 8) : Promise.resolve([]),
    magKoppelen ? telZonderSticker() : Promise.resolve(0),
  ])

  // Recent toegevoegd dat al bij "mijn materieel" staat, niet dubbel tonen.
  const mijnIds = new Set(mijn.map((m) => m.id))
  const overig = recent.filter((r) => !mijnIds.has(r.id))

  const t = await getAppVertaler('materieel')
  const fotos = await signPaden(
    [...mijn, ...overig, ...teStickeren].map((o) => o.hoofdfoto_path).filter(Boolean) as string[],
  )

  return (
    <>
      <AppHeader title={t('titel')} sub={t('start.sub')} backHref="/m" />
      <div style={{ padding: 14 }}>
        <MaterieelZoek
          boven={
            <Lijst
              titel={t('start.toegewezenAanMij')}
              items={mijn}
              fotos={fotos}
              leeg={t('start.nietsOpNaam')}
              t={t}
              eersteBlok
            />
          }
        >
          {teStickerenTotaal > 0 && (
            <Lijst
              /* Werkvoorraad bij het stickeren van een bestaande inventaris: kantoor
                 voert in, de bus plakt. Open je zo'n object, dan zit de knop
                 "Sticker koppelen" op het paspoort. */
              titel={t('start.nogGeenSticker', { aantal: teStickerenTotaal })}
              items={teStickeren}
              fotos={fotos}
              leeg=""
              t={t}
            />
          )}

          {toonRecent && overig.length > 0 && (
            <Lijst titel={t('start.recentToegevoegd')} items={overig} fotos={fotos} leeg="" t={t} />
          )}
        </MaterieelZoek>
      </div>

      <MaterieelToevoegKnop magToevoegen={magToevoegen} />
    </>
  )
}

type Vertaler = Awaited<ReturnType<typeof getAppVertaler<'materieel'>>>

function Lijst({
  titel, items, fotos, leeg, eersteBlok = false, t,
}: {
  titel: string
  items: MaterieelKort[]
  fotos: Map<string, string>
  leeg: string
  /** Bovenaan het scherm: geen extra ruimte boven de eerste kop. */
  eersteBlok?: boolean
  t: Vertaler
}) {
  return (
    <div style={{ marginTop: eersteBlok ? 0 : 22 }}>
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
                    {[t(`categorie.${o.categorie}`), o.merk, o.type].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999,
                  color: status.kleur, background: `${status.kleur}1a`, flexShrink: 0,
                }}>
                  {t(`status.${o.status}`)}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
