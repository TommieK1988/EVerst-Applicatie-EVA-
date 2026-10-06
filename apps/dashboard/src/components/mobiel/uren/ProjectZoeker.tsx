'use client'

import { useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { DossierOptie } from '@/lib/uren/weekstaat'

/**
 * Projectkeuze in de urenregel: een zoekveld met daaronder de treffers, in plaats van een lange
 * keuzelijst om doorheen te scrollen.
 *
 * De lijst is al klein (alleen waar de monteur ingepland staat), dus er wordt in de browser
 * gefilterd. De groep indirecte uren verschijnt alleen nog bij een bestaande regel die al op zo'n
 * project stond; nieuw kiezen kan daar niet meer (zie `getDossierOpties`). Elk woord uit de zoekterm moet in nummer of naam voorkomen, zodat
 * "kerk 183" net zo goed werkt als "20265.00183".
 */

const GRIJS = '#6b757c'
const GROEN = '#009439'

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

export default function ProjectZoeker({
  opties, laden, gekozenId, onKies, kantoor
}: {
  opties: DossierOptie[]
  laden: boolean
  gekozenId: string
  onKies: (id: string) => void
  /** Kantoor: de lijst bevat ook de dossiers waarop hij een rol heeft, dus een andere lege-lijsttekst. */
  kantoor?: boolean
}) {
  const t = useTranslations('uren')
  const [zoek, setZoek] = useState('')
  const invoer = useRef<HTMLInputElement>(null)

  const gekozen = opties.find(o => o.id === gekozenId)

  const treffers = useMemo(() => {
    const woorden = zoek.toLowerCase().split(/\s+/).filter(Boolean)
    return opties.filter(o => woorden.every(w => o.label.toLowerCase().includes(w)))
  }, [opties, zoek])

  if (gekozen) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px 10px 14px',
        borderRadius: 10, border: `1.5px solid ${GROEN}`, background: 'rgba(0,148,57,0.06)',
      }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--fg)', lineHeight: 1.35 }}>
          {gekozen.label}
        </div>
        <button
          type="button"
          onClick={() => { onKies(''); setZoek(''); setTimeout(() => invoer.current?.focus(), 0) }}
          style={{
            flexShrink: 0, padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
            border: '1px solid var(--border)', background: 'var(--bg)',
            fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: GRIJS,
          }}
        >
          {t('regel.wijzigProject')}
        </button>
      </div>
    )
  }

  const ingepland = treffers.filter(o => !o.indirect)
  const indirect = treffers.filter(o => o.indirect)
  const heeftIngepland = opties.some(o => !o.indirect)

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <input
          ref={invoer}
          type="search"
          value={zoek}
          onChange={e => setZoek(e.target.value)}
          placeholder={t('regel.zoekProject')}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={veld}
        />
        {zoek && (
          <button
            type="button"
            onClick={() => { setZoek(''); invoer.current?.focus() }}
            aria-label={t('knop.annuleren')}
            style={{
              position: 'absolute', right: 4, top: 4, bottom: 4, width: 40,
              border: 'none', background: 'transparent', color: GRIJS,
              fontSize: 20, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            ×
          </button>
        )}
      </div>

      {laden ? (
        <Melding>{t('regel.codesOphalen')}</Melding>
      ) : (
        <>
          {!heeftIngepland && !zoek && <Melding>{t(kantoor ? 'regel.geenProjectKantoor' : 'regel.geenIngepland')}</Melding>}
          {zoek && treffers.length === 0 && <Melding>{t('regel.geenResultaat', { zoek })}</Melding>}

          {ingepland.length > 0 && (
            <Groep kop={t('regel.ingepland')}>
              {ingepland.map(o => (
                <Treffer key={o.id} label={o.label} badge={o.vandaag ? t('regel.dezeDag') : null} onKies={() => onKies(o.id)} />
              ))}
            </Groep>
          )}
          {indirect.length > 0 && (
            <Groep kop={t('regel.indirecteUren')}>
              {indirect.map(o => (
                <Treffer key={o.id} label={o.label} badge={null} onKies={() => onKies(o.id)} />
              ))}
            </Groep>
          )}
        </>
      )}
    </div>
  )
}

function Melding({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13, color: GRIJS, margin: '10px 0 0', lineHeight: 1.45 }}>{children}</p>
}

function Groep({ kop, children }: { kop: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
        letterSpacing: '0.04em', marginBottom: 6,
      }}>
        {kop}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Treffer({ label, badge, onKies }: { label: string; badge: string | null; onKies: () => void }) {
  return (
    <button
      type="button"
      onClick={onKies}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
        padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
        border: '1px solid var(--border)', background: 'var(--bg)',
        fontFamily: 'inherit', fontSize: 14, color: 'var(--fg)', lineHeight: 1.35,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {badge && (
        <span style={{
          flexShrink: 0, padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          background: 'rgba(0,148,57,0.1)', color: GROEN,
        }}>
          {badge}
        </span>
      )}
    </button>
  )
}
