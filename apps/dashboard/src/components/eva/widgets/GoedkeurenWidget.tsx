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
 * DE VOLGORDE IS HET ONTWERP. Bovenaan de twee stapels die je in hun eigen scherm in één keer
 * afwerkt — inkoopfacturen, dan uren — elk als één regel met een teller. Daaronder de
 * beslissingen per stuk: offertes en werkbegrotingen, op deadline, want daar zit iemand op te
 * wachten. Een stapel die leeg is verdwijnt: een regel "0 facturen" is geen informatie maar ruis.
 *
 * De uren-teller komt ná het renderen binnen. Die vraagt Bouw7 om uurregels, en de afspraak is
 * dat een schermbezoek nooit op Bouw7 wacht. Ligt Bouw7 eruit, dan blijft de rest van de widget
 * gewoon staan en verschijnt er een klein "uren onbekend" in plaats van een fout.
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

const UREN_KLEUR = '#f59e0b'

function datumKort(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function datumLang(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

/** Lokale dag als `YYYY-MM-DD` — nooit `toISOString()`, dat rekent naar UTC en schuift een dag op. */
function vandaagIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

/** De gedeelde vorm van een regel: kleurstreepje, titel, subtitel, datum rechts. */
function Regel({
  kleur, titel, subtitel, rechts, rechtsTitel, opvallend, href, onGa,
}: {
  kleur: string
  titel: React.ReactNode
  subtitel?: string | null
  rechts?: string
  rechtsTitel?: string
  /** Rood en vet: er is een datum verstreken. */
  opvallend?: boolean
  href: string | null
  onGa: (href: string) => void
}) {
  const klikbaar = !!href
  return (
    <div
      onClick={() => href && onGa(href)}
      role={klikbaar ? 'button' : undefined}
      tabIndex={klikbaar ? 0 : undefined}
      onKeyDown={e => { if (klikbaar && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onGa(href!) } }}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0',
        borderTop: '1px solid var(--border)', cursor: klikbaar ? 'pointer' : 'default',
      }}
    >
      <span style={{
        width: 3, alignSelf: 'stretch', minHeight: 22, borderRadius: 2,
        background: kleur, flexShrink: 0,
      }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12.5, fontWeight: 600, color: 'var(--fg)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{titel}</div>
        {subtitel && (
          <div style={{
            fontSize: 11, color: 'var(--fg-muted)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{subtitel}</div>
        )}
      </div>
      {rechts && (
        <span
          title={rechtsTitel}
          style={{
            fontSize: 11, flexShrink: 0,
            color: opvallend ? '#dc2626' : 'var(--fg-muted)',
            fontWeight: opvallend ? 700 : 400,
          }}
        >{rechts}</span>
      )}
    </div>
  )
}

/**
 * Een offerte of werkbegroting. Rechts staat de deadline als die er is — dat is de datum waarop
 * de lijst gesorteerd staat, dus dan leest de kolom als de volgorde. Is er geen deadline, dan
 * valt hij terug op sinds wanneer het bij je ligt; anders zou de regel er datumloos bij hangen.
 */
function ItemRegel({ item, onGa }: { item: GoedkeurenItem; onGa: (href: string) => void }) {
  const deadline = item.deadline ?? null
  const teLaat = !!deadline && deadline < vandaagIso()
  return (
    <Regel
      kleur={item.akkoord === false ? '#dc2626' : SOORT_KLEUR[item.soort]}
      titel={<span title={SOORT_LABEL[item.soort]}>{item.titel}</span>}
      subtitel={item.subtitel}
      rechts={datumKort(deadline ?? item.datum)}
      rechtsTitel={deadline
        ? `Deadline ${datumLang(deadline)}`
        : (item.datum ? `Ingediend ${datumLang(item.datum)}` : undefined)}
      opvallend={teLaat}
      href={item.href}
      onGa={onGa}
    />
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

  const { ligtBijJou, inkoop, afgehandeld, aantallen } = data
  const urenAantal = uren?.aantal ?? 0
  const totaal = ligtBijJou.length + inkoop.aantal + urenAantal
  const ga = React.useCallback((href: string) => router.push(href), [router])

  const delen = [
    aantallen.inkoopfactuur ? `${aantallen.inkoopfactuur} inkoop` : null,
    aantallen.offerte ? `${aantallen.offerte} offerte` : null,
    aantallen.werkbegroting ? `${aantallen.werkbegroting} begroting` : null,
    uren === null ? 'uren…' : uren.fout ? null : (uren.aantal ? `${uren.aantal} uren` : null),
  ].filter(Boolean)

  const inkoopTeLaat = !!inkoop.eersteVervaldatum && inkoop.eersteVervaldatum < vandaagIso()

  return (
    <WidgetShell
      title="Goedkeuren"
      subtitle={totaal === 0 && uren !== null ? 'Niets openstaand' : (delen.join(' · ') || 'Niets openstaand')}
    >
      {totaal === 0 && (
        <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
          Er ligt niets op je akkoord te wachten.
        </p>
      )}

      {/* Facturen bovenaan: één regel naar het inkoopscherm, dat zelf op "Te accorderen door mij" opent. */}
      {inkoop.aantal > 0 && (
        <Regel
          kleur={SOORT_KLEUR.inkoopfactuur}
          titel={`${inkoop.aantal} inkoopfactu${inkoop.aantal === 1 ? 'ur' : 'ren'} te fiatteren`}
          subtitel={inkoop.bedrag > 0 ? `Inkoop · ${euro(inkoop.bedrag)}` : 'Inkoop'}
          rechts={datumKort(inkoop.eersteVervaldatum)}
          rechtsTitel={inkoop.eersteVervaldatum
            ? `Vroegste vervaldatum ${datumLang(inkoop.eersteVervaldatum)}`
            : undefined}
          opvallend={inkoopTeLaat}
          href="/inkoop/facturen"
          onGa={ga}
        />
      )}

      {/* Uren daarna. Naar de hele stapel, niet naar een periode: oude regels moet je juist zien. */}
      {urenAantal > 0 && (
        <Regel
          kleur={UREN_KLEUR}
          titel={`${urenAantal} urenregel${urenAantal === 1 ? '' : 's'} te fiatteren`}
          subtitel="Uren"
          href="/uren?periode=te_keuren"
          onGa={ga}
        />
      )}

      {/* En dan het werk per stuk, op deadline. */}
      {ligtBijJou.slice(0, MAX_ZICHTBAAR).map(item => (
        <ItemRegel key={`${item.soort}-${item.id}`} item={item} onGa={ga} />
      ))}

      {ligtBijJou.length > MAX_ZICHTBAAR && (
        <div style={{ fontSize: 11, color: 'var(--fg-muted)', paddingTop: 6 }}>
          en nog {ligtBijJou.length - MAX_ZICHTBAAR} andere
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
      {data.inkoopSyncOp && inkoop.aantal > 0 && (
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
            <ItemRegel key={`af-${item.id}`} item={item} onGa={ga} />
          ))}
        </>
      )}
    </WidgetShell>
  )
}
