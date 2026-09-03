import Link from 'next/link'
import { getOpnamesVoorDossier } from '@/lib/opname/opnames'
import { OPNAME_STATUS_LABELS } from '@everts/database/opname-types'
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

const datumKort = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * De opnames van dit dossier op de telefoon: kiezen welke je opent, of een nieuwe starten.
 *
 * Het invullen zelf gebeurt op `/m/opname/[opnameId]` — een top-level route, zie de toelichting
 * daar over het `[tab]`-segment.
 */
export default async function OpnameView({ dossierId }: { dossierId: string }) {
  const opnames = await getOpnamesVoorDossier(dossierId).catch(() => [])

  return (
    <div style={{ padding: '14px 16px 24px' }}>
      {opnames.length === 0 ? (
        <p style={{ margin: '0 0 14px', fontSize: 14, color: GRIJS }}>
          Er is nog geen opname voor dit dossier.
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
                  {datumKort(opname.datum)}
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
                {OPNAME_STATUS_LABELS[opname.status] ?? opname.status}
              </span>
            </div>
          </Link>
        ))
      )}

      <NieuweOpnameKnop dossierId={dossierId} />
    </div>
  )
}
