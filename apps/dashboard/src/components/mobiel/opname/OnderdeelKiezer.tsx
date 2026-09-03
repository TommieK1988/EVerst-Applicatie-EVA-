'use client'

import React from 'react'
import type { OpnameOnderdeelKeuze } from '@everts/database/opname-types'
import { chip, euro, GRIJS, kaart, RAND, TEKST, veld, ZACHT } from './stijl'

/**
 * De bibliotheek doorzoekbaar op een telefoon.
 *
 * Een corporatie-prijslijst is 300 tot 1500 regels. Drie dingen maken dat werkbaar:
 *
 *  1. **Zoeken zoals in de calculatie.** De logica komt uit `ActiviteitToevoegenModal`: AND over
 *     losse woorden, plús een samengetrokken variant zonder spaties, punten en koppeltekens. Zo
 *     vinden `wc 3`, `WC-3` en `wc3` allemaal hetzelfde. Die aanpak is op deze data al bewezen.
 *  2. **Hoofdgroep-chips** als tweede filter.
 *  3. **Vaak gebruikt** bovenaan. In de praktijk komt de helft van de regels uit dezelfde twintig
 *     onderdelen; dat scheelt op een telefoon meer dan welke zoekverbetering ook.
 *
 * Filteren gebeurt volledig lokaal op de al opgehaalde lijst — geen serverronde per toetsaanslag,
 * en het werkt door als de verbinding even wegvalt.
 */

/** Normaliseert voor de "samengetrokken" vergelijking: alles plat, zonder scheidingstekens. */
function samengetrokken(tekst: string): string {
  return tekst.toLowerCase().replace(/[\s.\-_/]+/g, '')
}

function zoekSleutel(o: OpnameOnderdeelKeuze): string {
  return [o.code, o.omschrijving, o.hoofdgroep, o.subgroep, o.toelichting].filter(Boolean).join(' ')
}

export function filterOnderdelen(
  onderdelen: OpnameOnderdeelKeuze[],
  zoek: string,
  hoofdgroep: string | null,
): OpnameOnderdeelKeuze[] {
  const termen = zoek.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const plat = samengetrokken(zoek)

  return onderdelen.filter(o => {
    if (hoofdgroep && o.hoofdgroep !== hoofdgroep) return false
    if (termen.length === 0) return true
    const sleutel = zoekSleutel(o).toLowerCase()
    if (termen.every(t => sleutel.includes(t))) return true
    // Terugval: `wc3` moet ook `WC-3` vinden.
    return plat.length > 0 && samengetrokken(sleutel).includes(plat)
  })
}

export default function OnderdeelKiezer({
  onderdelen,
  vaakGebruiktIds,
  toonPrijzen = true,
  onKies,
}: {
  onderdelen: OpnameOnderdeelKeuze[]
  vaakGebruiktIds: string[]
  toonPrijzen?: boolean
  onKies: (onderdeel: OpnameOnderdeelKeuze) => void
}) {
  const [zoek, setZoek] = React.useState('')
  const [hoofdgroep, setHoofdgroep] = React.useState<string | null>(null)

  const hoofdgroepen = React.useMemo(() => {
    const gezien: string[] = []
    for (const o of onderdelen) {
      if (o.hoofdgroep && !gezien.includes(o.hoofdgroep)) gezien.push(o.hoofdgroep)
    }
    return gezien
  }, [onderdelen])

  const gefilterd = React.useMemo(
    () => filterOnderdelen(onderdelen, zoek, hoofdgroep),
    [onderdelen, zoek, hoofdgroep],
  )

  const vaakGebruikt = React.useMemo(() => {
    if (zoek.trim() || hoofdgroep) return []
    const perId = new Map(onderdelen.map(o => [o.id, o]))
    return vaakGebruiktIds.map(id => perId.get(id)).filter((o): o is OpnameOnderdeelKeuze => !!o)
  }, [onderdelen, vaakGebruiktIds, zoek, hoofdgroep])

  // Boven dit aantal wordt de lijst afgekapt met een telling eronder. Een telefoon hoeft geen
  // 1400 rijen te renderen; wie zo veel resultaten heeft moet zoeken, niet scrollen.
  const MAX_GETOOND = 80
  const getoond = gefilterd.slice(0, MAX_GETOOND)

  return (
    <div style={{ padding: '12px 14px' }}>
      <input
        type="search"
        value={zoek}
        onChange={e => setZoek(e.target.value)}
        placeholder="Zoek op code of omschrijving"
        style={{ ...veld, marginBottom: 10 }}
        // inputMode text (niet search): het toetsenbord houdt dan de gewone lay-out.
        inputMode="text"
        autoComplete="off"
      />

      {hoofdgroepen.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 4 }}>
          <button type="button" style={chip(hoofdgroep === null)} onClick={() => setHoofdgroep(null)}>
            Alles
          </button>
          {hoofdgroepen.map(g => (
            <button
              key={g}
              type="button"
              style={chip(hoofdgroep === g)}
              onClick={() => setHoofdgroep(hoofdgroep === g ? null : g)}
            >
              {g}
            </button>
          ))}
        </div>
      )}

      {vaakGebruikt.length > 0 && (
        <>
          <p style={{ margin: '8px 0 6px', fontSize: 12, fontWeight: 700, color: GRIJS }}>
            Vaak gebruikt bij deze opdrachtgever
          </p>
          {vaakGebruikt.map(o => (
            <OnderdeelRij key={`vaak-${o.id}`} onderdeel={o} toonPrijzen={toonPrijzen} onKies={onKies} />
          ))}
          <p style={{ margin: '14px 0 6px', fontSize: 12, fontWeight: 700, color: GRIJS }}>
            Hele lijst
          </p>
        </>
      )}

      {getoond.length === 0 ? (
        <p style={{ padding: '18px 4px', fontSize: 14, color: GRIJS }}>
          Niets gevonden. Voeg het toe als los punt, dan prijst de calculator het later.
        </p>
      ) : (
        getoond.map(o => (
          <OnderdeelRij key={o.id} onderdeel={o} toonPrijzen={toonPrijzen} onKies={onKies} />
        ))
      )}

      {gefilterd.length > MAX_GETOOND && (
        <p style={{ padding: '10px 4px 0', fontSize: 12, color: ZACHT }}>
          {gefilterd.length - MAX_GETOOND} resultaten meer — zoek verder om ze te zien.
        </p>
      )}
    </div>
  )
}

function OnderdeelRij({
  onderdeel,
  toonPrijzen,
  onKies,
}: {
  onderdeel: OpnameOnderdeelKeuze
  toonPrijzen: boolean
  onKies: (o: OpnameOnderdeelKeuze) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onKies(onderdeel)}
      style={{
        ...kaart,
        marginBottom: 8,
        width: '100%',
        textAlign: 'left',
        display: 'block',
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: TEKST }}>{onderdeel.omschrijving}</div>
          <div style={{ fontSize: 12, color: GRIJS, marginTop: 2 }}>
            {[onderdeel.code, onderdeel.hoofdgroep].filter(Boolean).join(' · ')}
          </div>
        </div>
        {toonPrijzen && (
          <div style={{ flexShrink: 0, textAlign: 'right' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>
              {euro(onderdeel.verkoop_pe)}
            </div>
            <div style={{ fontSize: 11, color: ZACHT }}>per {onderdeel.eenheid}</div>
          </div>
        )}
      </div>
      {(onderdeel.foto_verplicht || onderdeel.toelichting_verplicht) && (
        <div style={{ marginTop: 8, fontSize: 11, color: GRIJS, borderTop: `1px solid ${RAND}`, paddingTop: 6 }}>
          {[onderdeel.foto_verplicht && 'foto verplicht', onderdeel.toelichting_verplicht && 'toelichting verplicht']
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
    </button>
  )
}
