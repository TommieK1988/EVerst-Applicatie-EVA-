'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { WidgetShell } from './index'
import { syncTijdLabel } from '@/components/eva/SyncKnop'
import { getUrenTeFiatterenAantal } from '@/lib/goedkeuren/widget'
import type { GoedkeurenData, GoedkeurenItem, GoedkeurenSoort } from '@/lib/goedkeuren/widget'

/**
 * "Goedkeuren" — één plek voor alles wat op jouw akkoord wacht.
 *
 * Twee blokken, en dat onderscheid is bewust: bovenin wat er bij jou ligt (actie), onderin wat er
 * met jouw eigen aanvragen is gebeurd (seintje). Dat tweede blok bestaat omdat je anders niet
 * merkt dat de controller je werkbegroting heeft goedgekeurd — of juist heeft teruggestuurd.
 *
 * De uren-teller komt ná het renderen binnen. Die vraagt Bouw7 om een periode uurregels, en de
 * afspraak is dat een schermbezoek nooit op Bouw7 wacht. Ligt Bouw7 eruit, dan blijft de rest
 * van de widget gewoon staan en verschijnt er een klein "uren onbekend" in plaats van een fout.
 */

const MAX_ZICHTBAAR = 6

const SOORT_LABEL: Record<GoedkeurenSoort, string> = {
  inkoopfactuur: 'Inkoopfactuur',
  offerte: 'Offerte',
  werkbegroting: 'Werkbegroting',
}

const SOORT_KLEUR: Record<GoedkeurenSoort, string> = {
  inkoopfactuur: '#0f766e',
  offerte: '#2563eb',
  werkbegroting: '#7c3aed',
}

function datumKort(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function Rij({ item, onGa }: { item: GoedkeurenItem; onGa: (href: string) => void }) {
  const klikbaar = !!item.href
  return (
    <div
      onClick={() => item.href && onGa(item.href)}
      role={klikbaar ? 'button' : undefined}
      tabIndex={klikbaar ? 0 : undefined}
      onKeyDown={e => { if (klikbaar && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onGa(item.href!) } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0',
        borderTop: '1px solid var(--border)', cursor: klikbaar ? 'pointer' : 'default',
      }}
    >
      <span
        title={SOORT_LABEL[item.soort]}
        style={{
          width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2,
          background: item.akkoord === false ? '#dc2626' : SOORT_KLEUR[item.soort], flexShrink: 0,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{item.titel}</div>
        {item.subtitel && (
          <div style={{
            fontSize: 11, color: 'var(--fg-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.subtitel}</div>
        )}
      </div>
      <span style={{ fontSize: 11, color: 'var(--fg-muted)', flexShrink: 0 }}>{datumKort(item.datum)}</span>
    </div>
  )
}

export default function GoedkeurenWidget({ data }: { data: GoedkeurenData }) {
  const router = useRouter()
  const [uren, setUren] = React.useState<{ aantal: number; fout: string | null } | null>(null)

  React.useEffect(() => {
    let afgebroken = false
    getUrenTeFiatterenAantal()
      .then(r => { if (!afgebroken) setUren(r) })
      .catch(() => { if (!afgebroken) setUren({ aantal: 0, fout: 'niet bereikbaar' }) })
    return () => { afgebroken = true }
  }, [])

  const { ligtBijJou, afgehandeld, aantallen } = data
  const totaal = ligtBijJou.length + (uren?.aantal ?? 0)

  const delen = [
    aantallen.inkoopfactuur ? `${aantallen.inkoopfactuur} inkoop` : null,
    aantallen.offerte ? `${aantallen.offerte} offerte` : null,
    aantallen.werkbegroting ? `${aantallen.werkbegroting} begroting` : null,
    uren === null ? 'uren…' : uren.fout ? null : (uren.aantal ? `${uren.aantal} uren` : null),
  ].filter(Boolean)

  return (
    <WidgetShell
      title="Goedkeuren"
      subtitle={totaal === 0 && uren !== null ? 'Niets openstaand' : (delen.join(' · ') || 'Niets openstaand')}
    >
      {ligtBijJou.length === 0 && (uren?.aantal ?? 0) === 0 && (
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
          Er ligt niets op je akkoord te wachten.
        </p>
      )}

      {ligtBijJou.slice(0, MAX_ZICHTBAAR).map(item => (
        <Rij key={`${item.soort}-${item.id}`} item={item} onGa={h => router.push(h)} />
      ))}

      {ligtBijJou.length > MAX_ZICHTBAAR && (
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', paddingTop: 6 }}>
          en nog {ligtBijJou.length - MAX_ZICHTBAAR} andere
        </div>
      )}

      {/* Uren staan apart: er is geen lijst per regel maar één ingang naar het urenscherm. */}
      {uren && uren.aantal > 0 && (
        <div
          onClick={() => router.push('/uren')}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/uren') } }}
          style={{
            display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0',
            borderTop: '1px solid var(--border)', cursor: 'pointer',
          }}
        >
          <span style={{ width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2, background: '#f59e0b', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg)' }}>
              {uren.aantal} urenregel{uren.aantal === 1 ? '' : 's'} te fiatteren
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Uren</div>
          </div>
        </div>
      )}

      {uren?.fout && (
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', paddingTop: 6 }}>
          Uren konden niet worden opgehaald ({uren.fout}).
        </div>
      )}

      {/*
        Peiltijd, geen sierlijkheid. De inkoopstand komt uit de Bouw7-sync van twee keer per dag;
        zonder dit regeltje zou de teller stil verouderen en zou je niet weten of je op
        Synchroniseer moet drukken.
      */}
      {data.inkoopSyncOp && aantallen.inkoopfactuur > 0 && (
        <div style={{ fontSize: 10.5, color: 'var(--fg-muted)', paddingTop: 6 }}>
          Inkoopstand uit Bouw7 van {syncTijdLabel(data.inkoopSyncOp).toLowerCase()}
        </div>
      )}

      {afgehandeld.length > 0 && (
        <>
          <div style={{
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
            color: 'var(--fg-muted)', marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)',
          }}>
            Afgehandeld voor jou
          </div>
          {afgehandeld.slice(0, 3).map(item => (
            <Rij key={`af-${item.id}`} item={item} onGa={h => router.push(h)} />
          ))}
        </>
      )}
    </WidgetShell>
  )
}
