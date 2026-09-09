'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { WidgetShell, WidgetRij, MAX_WIDGET_RIJEN } from './index'
import { IconCheck } from '../Icons'
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
 * De widget gebruikt dezelfde `WidgetRij` als de dossierwidgets en houdt zich aan dezelfde
 * zeven regels. Hij had eerst een eigen opmaak (kleurbalkje in plaats van een stip, grotere
 * letter, scheidslijn bovenaan) en viel daardoor uit de toon tussen de tegels ernaast.
 *
 * De uren-teller komt ná het renderen binnen. Die vraagt Bouw7 om uurregels, en de afspraak is
 * dat een schermbezoek nooit op Bouw7 wacht. Ligt Bouw7 eruit, dan blijft de rest van de widget
 * gewoon staan en verschijnt er een klein "uren onbekend" in plaats van een fout.
 */

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
const ROOD = '#d04a2a'
const GROEN = '#009439'

/** Hoeveel afgehandelde meldingen er hoogstens bij mogen, als er regels over zijn. */
const MAX_AFGEHANDELD = 3

/**
 * Datum als kort label rechts, in de bewoording van de andere widgets: verlopen werk is de
 * uitzondering die je moet zien, de rest is een dag.
 */
function datumLabel(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const vandaag = new Date()
  vandaag.setHours(0, 0, 0, 0)
  const dagen = Math.round((d.getTime() - vandaag.getTime()) / 86_400_000)
  if (dagen < 0) return 'Verlopen'
  if (dagen === 0) return 'Vandaag'
  if (dagen === 1) return 'Morgen'
  if (dagen <= 7) return 'Deze week'
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

const euro = (n: number) =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

/** Wat er van een offerte of werkbegroting op de regel komt. */
function itemRegel(item: GoedkeurenItem, afgehandeld: boolean) {
  const label = datumLabel(item.deadline ?? (afgehandeld ? null : item.datum))
  const stip = afgehandeld
    ? (item.akkoord ? GROEN : ROOD)
    : SOORT_KLEUR[item.soort]
  return {
    sleutel: `${afgehandeld ? 'af' : 'open'}-${item.id}`,
    stip,
    titel: item.titel,
    sub: item.subtitel ?? SOORT_LABEL[item.soort],
    rechts: label,
    rechtsKleur: label === 'Verlopen' ? ROOD : (afgehandeld ? 'var(--fg-muted)' : stip),
    href: item.href,
  }
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

  // Wat er bij je ligt, in de volgorde van het ontwerp: stapels eerst, dan de beslissingen.
  const open = [
    ...(inkoop.aantal > 0 ? [{
      sleutel: 'inkoop',
      stip: SOORT_KLEUR.inkoopfactuur,
      titel: `${inkoop.aantal} inkoopfactu${inkoop.aantal === 1 ? 'ur' : 'ren'} te fiatteren`,
      sub: inkoop.bedrag > 0 ? `Inkoop · ${euro(inkoop.bedrag)}` : 'Inkoop',
      rechts: datumLabel(inkoop.eersteVervaldatum),
      rechtsKleur: datumLabel(inkoop.eersteVervaldatum) === 'Verlopen' ? ROOD : SOORT_KLEUR.inkoopfactuur,
      href: '/inkoop/facturen',
    }] : []),
    ...(urenAantal > 0 ? [{
      sleutel: 'uren',
      stip: UREN_KLEUR,
      titel: `${urenAantal} urenregel${urenAantal === 1 ? '' : 's'} te fiatteren`,
      sub: 'Uren',
      rechts: null,
      rechtsKleur: undefined,
      href: '/uren?periode=te_keuren',
    }] : []),
    ...ligtBijJou.map(i => itemRegel(i, false)),
  ].slice(0, MAX_WIDGET_RIJEN)

  // De afgehandeld-meldingen vullen alleen de regels op die overblijven; het kopje erboven kost
  // ook ruimte, dus als je stapel vol staat verdwijnt het blok. Dat is de goede kant op: dan heb
  // je wat te doen, en is een terugmelding van vorige week niet waar je naar moet kijken.
  const ruimte = MAX_WIDGET_RIJEN - open.length
  const meldingen = ruimte > 0
    ? afgehandeld.slice(0, Math.min(ruimte, MAX_AFGEHANDELD)).map(i => itemRegel(i, true))
    : []

  return (
    <WidgetShell
      title="Goedkeuren"
      subtitle={totaal === 0 && uren !== null ? 'Niets openstaand' : (delen.join(' · ') || 'Niets openstaand')}
      Icon={IconCheck}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {open.length === 0 && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--fg-muted)', padding: '8px 0' }}>
            Er ligt niets op je akkoord te wachten.
          </div>
        )}

        {open.map((r, i) => (
          <WidgetRij
            key={r.sleutel}
            stip={r.stip}
            titel={r.titel}
            sub={r.sub}
            rechts={r.rechts}
            rechtsKleur={r.rechtsKleur}
            laatste={i === open.length - 1}
            onKlik={r.href ? () => ga(r.href!) : undefined}
          />
        ))}

        {uren?.fout && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg-muted)', paddingTop: 3 }}>
            Uren konden niet worden opgehaald ({uren.fout}).
          </div>
        )}

        {/*
          Peiltijd, geen sierlijkheid. De inkoopstand komt uit de Bouw7-sync van twee keer per dag;
          zonder dit regeltje zou de teller stil verouderen en zou je niet weten of je op
          Synchroniseer moet drukken.
        */}
        {data.inkoopSyncOp && inkoop.aantal > 0 && (
          <div style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--fg-muted)', paddingTop: 3 }}>
            Inkoopstand uit Bouw7 van {syncTijdLabel(data.inkoopSyncOp).toLowerCase()}
          </div>
        )}

        {meldingen.length > 0 && (
          <>
            <div style={{
              fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 700,
              textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--fg-muted)',
              marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)',
            }}>
              Afgehandeld voor jou
            </div>
            {meldingen.map((r, i) => (
              <WidgetRij
                key={r.sleutel}
                stip={r.stip}
                titel={r.titel}
                sub={r.sub}
                rechts={r.rechts}
                rechtsKleur={r.rechtsKleur}
                laatste={i === meldingen.length - 1}
                onKlik={r.href ? () => ga(r.href!) : undefined}
              />
            ))}
          </>
        )}
      </div>
    </WidgetShell>
  )
}
