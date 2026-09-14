'use client'

import React from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Clock, Stamp } from 'lucide-react'
import { getUrenTeFiatterenAantal } from '@/lib/goedkeuren/widget'
import type { UrenSignaal } from '@/lib/mobiel/home'

const ROOD = '#b42318'
const ORANJE = '#b85a00'
const GRIJS = '#6b757c'
const ZACHT = '#9aa4ab'

/**
 * "Te doen"-blok op het mobiele startscherm: wat er van jóu verwacht wordt,
 * boven de tegels. Verschijnt alleen als er iets is — een leeg blok met "niets
 * te doen" kost elke dag ruimte om één keer per week iets te melden.
 *
 * Twee soorten regels, met verschillende herkomst:
 *
 * - **Uren invullen/indienen** komt van de server mee. Dat is een goedkope lees
 *   uit `uren_weken` en hoort dus gewoon bij de eerste render.
 * - **Uren fiatteren** wordt hier ná het renderen opgehaald: die telling kost een
 *   gepagineerde Bouw7-call, en de afspraak in dit project is dat een schermbezoek
 *   geen Bouw7-call doet. Zelfde patroon als de desktop-GoedkeurenWidget. De
 *   pagina gaf al mee of het zin heeft (`magFiatteren`), zodat een monteur die op
 *   geen enkel dossier projectleider is Bouw7 helemaal niet aanroept.
 *
 * De fiatteer-regel gaat naar `/m/uren/keuren` en NIET naar het Uren-overzicht:
 * dat is een platformscherm, en `MobileRedirect` stuurt een telefoon daarvandaan
 * meteen terug naar `/m`.
 */
export default function HomeSignalen({ uren, magFiatteren }: {
  uren: UrenSignaal[]
  magFiatteren: boolean
}) {
  const [fiatteren, setFiatteren] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (!magFiatteren) return
    let afgebroken = false
    getUrenTeFiatterenAantal()
      .then(r => { if (!afgebroken && !r.fout) setFiatteren(r.aantal) })
      // Fail-soft: is Bouw7 niet bereikbaar, dan blijft de regel gewoon weg. Een
      // foutmelding op het startscherm helpt niemand die het veld in gaat.
      .catch(() => {})
    return () => { afgebroken = true }
  }, [magFiatteren])

  const teFiatteren = fiatteren ?? 0
  if (uren.length === 0 && teFiatteren === 0) return null

  return (
    <section style={{ padding: '14px 16px 0' }}>
      <h2 style={{
        margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: GRIJS,
        letterSpacing: '-0.01em',
      }}>
        Te doen
      </h2>

      <div style={{
        background: 'var(--bg-elev, #fff)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
      }}>
        {uren.map((signaal, i) => (
          <Link
            key={signaal.id}
            href={signaal.href}
            style={{ ...regelStyle, borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}
          >
            <Icoon kleur={signaal.urgent ? ROOD : ORANJE}>
              {signaal.urgent
                ? <AlertTriangle size={17} strokeWidth={2.1} />
                : <Clock size={17} strokeWidth={2.1} />}
            </Icoon>
            <Tekst titel={signaal.titel} sub={signaal.sub} />
            <ChevronRight size={16} strokeWidth={2.4} color={ZACHT} style={{ flexShrink: 0 }} />
          </Link>
        ))}

        {teFiatteren > 0 && (
          <Link
            href="/m/uren/keuren"
            style={{
              ...regelStyle,
              borderTop: uren.length === 0 ? 'none' : '1px solid var(--border)',
            }}
          >
            <Icoon kleur={ORANJE}><Stamp size={17} strokeWidth={2.1} /></Icoon>
            {/* Zelfde formulering als de desktop-GoedkeurenWidget, zodat je hetzelfde
                werk niet onder twee namen tegenkomt. */}
            <Tekst
              titel={`${teFiatteren} urenregel${teFiatteren === 1 ? '' : 's'} te fiatteren`}
              sub="Uren van je ploeg of project goedkeuren"
            />
            <ChevronRight size={16} strokeWidth={2.4} color={ZACHT} style={{ flexShrink: 0 }} />
          </Link>
        )}
      </div>
    </section>
  )
}

const regelStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 11,
  padding: '11px 14px',
  color: 'inherit', textDecoration: 'none',
  WebkitTapHighlightColor: 'transparent',
}

function Icoon({ kleur, children }: { kleur: string; children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        display: 'grid', placeItems: 'center',
        background: `${kleur}1a`, color: kleur,
      }}
    >
      {children}
    </span>
  )
}

function Tekst({ titel, sub }: { titel: string; sub: string }) {
  // minWidth 0 maakt de ellipsis pas mogelijk binnen een flexregel.
  return (
    <span style={{ minWidth: 0, flex: 1 }}>
      <span style={{
        display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--fg)',
        lineHeight: 1.3,
      }}>
        {titel}
      </span>
      <span style={{ display: 'block', fontSize: 12, color: GRIJS, marginTop: 2 }}>
        {sub}
      </span>
    </span>
  )
}
