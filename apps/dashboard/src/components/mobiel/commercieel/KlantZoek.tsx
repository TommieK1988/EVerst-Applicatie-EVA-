'use client'

/**
 * Zoekscherm van de module Commercieel: vind de opdrachtgever die je zo gaat spreken.
 *
 * Zoekt op bedrijfsnaam, plaats én contactpersoon — aan de telefoon ken je vaak wel de
 * persoon en niet de precieze bedrijfsnaam. Personen zijn eigen treffers, met een icoontje en
 * met hun functie en werkgever eronder, en ze gaan naar hun eigen kaart: je zoekt iemand op
 * omdat je hém spreekt, niet om bij zijn werkgever uit te komen.
 *
 * Zoekpatroon overgenomen van `components/mobiel/materieel/MaterieelZoek.tsx`: vanaf twee
 * tekens, 250 ms typepauze, en een `afgebroken`-vlag in de cleanup zodat een traag antwoord
 * op een oude zoekterm een nieuwer resultaat niet overschrijft.
 *
 * Zonder zoekterm staan de recent geopende klanten in beeld. Dat is op een telefoon vaak
 * genoeg: je spreekt dezelfde handvol opdrachtgevers.
 */

import React from 'react'
import Link from 'next/link'
import { User } from 'lucide-react'
import { zoekKlantenActie } from '@/app/m/commercieel/actions'
import type { KlantTreffer } from '@/lib/commercie/klanten-zoeken'
import { leesRecent, type RecenteKlant } from './recent'
import { GRIJS, RAND, ROOD, TEKST, lijstRij, veld } from './stijl'

const MIN_TEKENS = 2

function KopRegel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 700, color: GRIJS, textTransform: 'uppercase',
      letterSpacing: '.04em', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

function KlantRegel({
  href, naam, onder, persoon = false,
}: {
  href: string
  naam: string
  onder?: string | null
  /** Toont een persoon-icoontje, zodat je een naam niet voor een bedrijf aanziet. */
  persoon?: boolean
}) {
  return (
    <Link href={href} style={lijstRij}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        {persoon && <User size={14} style={{ flexShrink: 0, color: GRIJS }} aria-hidden />}
        <span style={{
          fontSize: 15, fontWeight: 600, color: TEKST, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {naam}
        </span>
      </div>
      {onder && (
        <div style={{
          fontSize: 13, color: GRIJS, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {onder}
        </div>
      )}
    </Link>
  )
}

export default function KlantZoek() {
  const [term, setTerm]         = React.useState('')
  const [treffers, setTreffers] = React.useState<KlantTreffer[] | null>(null)
  const [zoekt, setZoekt]       = React.useState(false)
  const [fout, setFout]         = React.useState<string | null>(null)
  const [recent, setRecent]     = React.useState<RecenteKlant[]>([])

  // localStorage bestaat pas na hydratatie; op de server zou dit de render laten crashen.
  React.useEffect(() => { setRecent(leesRecent()) }, [])

  const schoon = term.trim()

  React.useEffect(() => {
    if (schoon.length < MIN_TEKENS) { setTreffers(null); setFout(null); setZoekt(false); return }
    let afgebroken = false
    setZoekt(true)
    const timer = setTimeout(async () => {
      const res = await zoekKlantenActie(schoon)
      if (afgebroken) return
      if (res.ok) { setTreffers(res.data); setFout(null) } else { setFout(res.error) }
      setZoekt(false)
    }, 250)
    return () => { afgebroken = true; clearTimeout(timer) }
  }, [schoon])

  return (
    <div style={{ padding: 16 }}>
      <div style={{ position: 'relative' }}>
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Zoek op bedrijf of contactpersoon"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          style={veld}
        />
        {schoon.length > 0 && (
          <button
            type="button"
            onClick={() => setTerm('')}
            aria-label="Zoekterm wissen"
            style={{
              position: 'absolute', right: 6, top: 6, bottom: 6, width: 36,
              border: 'none', background: 'transparent', color: GRIJS,
              fontSize: 18, cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            ×
          </button>
        )}
      </div>

      {fout && (
        <div style={{
          marginTop: 10, padding: 12, borderRadius: 10, border: `1px solid ${RAND}`,
          background: 'rgba(180,35,24,.06)', color: ROOD, fontSize: 14, lineHeight: 1.45,
        }}>
          {fout}
        </div>
      )}

      {/* Geen zoekterm: de klanten waar je laatst was. */}
      {treffers === null && !fout && (
        <div style={{ marginTop: 18 }}>
          {recent.length > 0 ? (
            <>
              <KopRegel>Recent geopend</KopRegel>
              {recent.map(r => (
                <KlantRegel key={r.id} href={`/m/commercieel/${r.id}`} naam={r.naam} onder={r.plaats} />
              ))}
            </>
          ) : (
            <div style={{ fontSize: 14, color: GRIJS, lineHeight: 1.5, paddingTop: 8 }}>
              Zoek een opdrachtgever om te zien wat er loopt, wat er open staat en wat er nog
              betaald moet worden.
            </div>
          )}
        </div>
      )}

      {treffers !== null && !fout && (
        <div style={{ marginTop: 18 }}>
          <KopRegel>{zoekt ? 'Zoeken…' : `Gevonden (${treffers.length})`}</KopRegel>
          {treffers.length === 0 && !zoekt ? (
            <div style={{ fontSize: 14, color: GRIJS, lineHeight: 1.5 }}>
              Niets gevonden voor &ldquo;{schoon}&rdquo;.
            </div>
          ) : (
            treffers.map(t => (
              <KlantRegel
                key={`${t.soort}-${t.id}`}
                // Een persoon heeft zijn eigen kaart: je zoekt hem omdat je hém spreekt.
                href={t.soort === 'contactpersoon'
                  ? `/m/commercieel/cp/${t.id}`
                  : `/m/commercieel/${t.id}`}
                naam={t.naam}
                onder={t.onder}
                persoon={t.soort === 'contactpersoon'}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
