import Link from 'next/link'
import { getOpnamesVoorDossier } from '@/lib/opname/opnames'
import { getAppLocale, getAppVertaler } from '@/i18n/server'
import NieuweOpnameKnop from '@/components/mobiel/opname/NieuweOpnameKnop'

const GRIJS = 'var(--fg-muted)'
const RAND = 'var(--border)'
const TEKST = 'var(--fg)'
const OPPERVLAK = 'var(--bg-elev)'

const STATUS_KLEUR: Record<string, string> = {
  concept: '#b98900',
  gereed: '#1d4e89',
  omgezet: '#009439',
  geannuleerd: '#6b757c',
}

const datumKort = (iso: string, locale: string) =>
  new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })

const STATUS_SLEUTELS = ['concept', 'gereed', 'omgezet', 'geannuleerd'] as const
const isStatusSleutel = (s: string): s is (typeof STATUS_SLEUTELS)[number] =>
  (STATUS_SLEUTELS as readonly string[]).includes(s)

/**
 * De opnames van dit dossier op de telefoon: kiezen welke je opent, of een nieuwe starten.
 *
 * Het invullen zelf gebeurt op `/m/opname/[opnameId]` — een top-level route, zie de toelichting
 * daar over het `[tab]`-segment.
 */
export default async function OpnameView({ dossierId }: { dossierId: string }) {
  const [opnames, t, locale] = await Promise.all([
    getOpnamesVoorDossier(dossierId).catch(() => []),
    getAppVertaler('dossiertabs'),
    getAppLocale(),
  ])

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {opnames.length === 0 ? (
        <p style={{ margin: '0 0 14px', fontSize: 14, color: GRIJS }}>
          {t('opname.geen')}
        </p>
      ) : (
        opnames.map(opname => (
          <Link
            key={opname.id}
            href={`/m/opname/${opname.id}`}
            style={{
              display: 'block', textDecoration: 'none',
              background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14,
              padding: 14, marginBottom: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: TEKST }}>{opname.opnamenummer}</div>
                <div style={{ fontSize: 12.5, color: GRIJS, marginTop: 2 }}>
                  {datumKort(opname.datum, locale)}
                  {opname.adres_vrij ? ` · ${opname.adres_vrij}` : ''}
                </div>
              </div>
              <span
                style={{
                  flexShrink: 0, alignSelf: 'flex-start',
                  padding: '3px 9px', borderRadius: 999,
                  border: `1px solid ${STATUS_KLEUR[opname.status] ?? GRIJS}`,
                  color: STATUS_KLEUR[opname.status] ?? GRIJS,
                  fontSize: 11, fontWeight: 700,
                }}
              >
                {isStatusSleutel(opname.status) ? t(`opname.status.${opname.status}`) : opname.status}
              </span>
            </div>
          </Link>
        ))
      )}

      <NieuweOpnameKnop dossierId={dossierId} />
    </div>
  )
}
