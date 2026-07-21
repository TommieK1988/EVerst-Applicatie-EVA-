import React from 'react'
import { getDossierBewaking } from '@/lib/dossiers/actions'

/**
 * Voortgang per bewakingscode (mobiel).
 *
 * Twee dingen naast elkaar: hoeveel werk is gereed, en hoeveel uren zijn daarvoor
 * gebruikt. De vergelijking is de kern — meer uren verbruikt dan werk gereed
 * betekent achterlopen. Dat oordeel staat er in gewone taal bij.
 *
 * LET OP: `progress` uit `getDossierBewaking` staat AL in procenten (0–100),
 * niet in een fractie. Niet met 100 vermenigvuldigen.
 *
 * Bewust géén grafiek-library: een eigen SVG-ring en CSS-balken schelen een
 * zware clientbundel op een telefoon, en zo blijft dit een server-component.
 */
const GROEN = '#009439'
const AMBER = '#b98900'
const ROOD = '#b42318'
const SPOOR = '#eef1f2'

const getal = (v: number) => v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
const pctTekst = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)
const klem = (v: number | null) => (v == null ? 0 : Math.min(Math.max(v, 0), 100))

function Ring({ pct }: { pct: number | null }) {
  const r = 52
  const omtrek = 2 * Math.PI * r

  return (
    <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden>
      <circle cx="66" cy="66" r={r} fill="none" stroke={SPOOR} strokeWidth="14" />
      {pct != null && (
        <circle
          cx="66" cy="66" r={r} fill="none" stroke={GROEN} strokeWidth="14"
          strokeDasharray={omtrek} strokeDashoffset={omtrek * (1 - klem(pct) / 100)}
          strokeLinecap="round" transform="rotate(-90 66 66)"
        />
      )}
      <text x="66" y="60" textAnchor="middle" dominantBaseline="central"
        fontSize="32" fontWeight="800" fill="#161b20">{pctTekst(pct)}</text>
      <text x="66" y="86" textAnchor="middle" dominantBaseline="central"
        fontSize="13" fontWeight="600" fill="#6b757c">gereed</text>
    </svg>
  )
}

/** Balk met een expliciete schaal 0–100%, zodat twee balken vergelijkbaar zijn. */
function Balk({ pct, kleur, gestreept }: { pct: number | null; kleur: string; gestreept?: boolean }) {
  return (
    <div style={{ height: 16, borderRadius: 999, background: SPOOR, overflow: 'hidden' }}>
      <div
        style={{
          height: '100%', width: `${klem(pct)}%`, borderRadius: 999,
          background: gestreept
            ? `repeating-linear-gradient(135deg, ${kleur}, ${kleur} 7px, ${kleur}cc 7px, ${kleur}cc 14px)`
            : kleur,
        }}
      />
    </div>
  )
}

/** Oordeel in gewone taal: verbruik je uren sneller dan je werk afkrijgt? */
function oordeel(gereed: number | null, urenPct: number | null): { tekst: string; kleur: string } | null {
  if (gereed == null || urenPct == null) return null
  const verschil = urenPct - gereed
  if (verschil > 15) return { tekst: 'Let op: meer uren verbruikt dan werk gereed', kleur: ROOD }
  if (verschil > 5) return { tekst: 'Uren lopen iets voor op de voortgang', kleur: AMBER }
  if (verschil < -10) return { tekst: 'Ruim binnen de prognose', kleur: GROEN }
  return { tekst: 'Op koers', kleur: GROEN }
}

/** Twee grote getallen naast elkaar: geboekt tegenover prognose. */
function Uren({ geboekt, prognose }: { geboekt: number; prognose: number }) {
  const over = prognose > 0 && geboekt > prognose
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: over ? ROOD : '#161b20', lineHeight: 1.1 }}>
          {getal(geboekt)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b757c' }}>uur geboekt</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: '#c3cbd0', paddingBottom: 4 }}>van</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#161b20', lineHeight: 1.1 }}>
          {getal(prognose)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b757c' }}>uur prognose</div>
      </div>
    </div>
  )
}

export default async function VoortgangView({ dossierId }: { dossierId: string }) {
  const data = await getDossierBewaking(dossierId).catch(() => null)

  if (!data || !data.beschikbaar) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 15 }}>
        Nog geen voortgangsgegevens voor dit dossier.
      </div>
    )
  }

  // Alleen codes met arbeid: daar gaat voortgang over.
  const regels = data.hoofdstukken
    .flatMap(h => h.regels)
    .filter(r => (r.prognoseUren ?? 0) > 0 || (r.geboekteUren ?? 0) > 0)

  if (regels.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 15 }}>
        Er zijn nog geen arbeidsuren geprognosticeerd of geboekt.
      </div>
    )
  }

  const totProg = data.totalen.prognoseUren ?? 0
  const totGeboekt = data.totalen.geboekteUren ?? 0
  const totUrenPct = totProg > 0 ? (totGeboekt / totProg) * 100 : null

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stand van het hele project */}
      <div style={{
        background: '#fff', border: '1px solid #e3e8ea', borderRadius: 16, padding: 18,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <Ring pct={data.projectProgress} />
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Uren geboekt={totGeboekt} prognose={totProg} />
          <Balk
            pct={totUrenPct}
            kleur={totUrenPct != null && totUrenPct > 100 ? ROOD : '#5b6770'}
            gestreept
          />
        </div>
      </div>

      {/* Per bewakingscode */}
      {regels.map((r, i) => {
        const gereed = r.progress
        const urenPct = (r.prognoseUren ?? 0) > 0 ? (r.geboekteUren / r.prognoseUren) * 100 : null
        const mening = oordeel(gereed, urenPct)
        const urenKleur = urenPct != null && urenPct > 100 ? ROOD : '#5b6770'

        return (
          <div key={r.code ?? i} style={{
            background: '#fff', border: '1px solid #e3e8ea', borderRadius: 16,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#161b20', lineHeight: 1.3 }}>
                {r.naam ?? r.code ?? 'Zonder code'}
              </div>
              {r.code && r.naam && (
                <div style={{ fontSize: 13, color: '#9aa4ab', marginTop: 2 }}>{r.code}</div>
              )}
            </div>

            {/* Werk gereed — effen groen */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: '#6b757c' }}>Werk gereed</span>
                <span style={{ fontSize: 24, fontWeight: 800, color: '#161b20' }}>{pctTekst(gereed)}</span>
              </div>
              <Balk pct={gereed} kleur={GROEN} />
            </div>

            {/* Uren — gestreept en grijs, zodat je hem niet met "gereed" verwart */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#6b757c', marginBottom: 7 }}>Uren</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Uren geboekt={r.geboekteUren} prognose={r.prognoseUren} />
                <Balk pct={urenPct} kleur={urenKleur} gestreept />
                {urenPct != null && urenPct > 100 && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: ROOD }}>
                    {getal(r.geboekteUren - r.prognoseUren)} uur boven de prognose
                  </div>
                )}
              </div>
            </div>

            {mening && (
              <div style={{
                fontSize: 15, fontWeight: 600, color: mening.kleur,
                background: `${mening.kleur}14`, borderRadius: 10, padding: '11px 13px',
              }}>
                {mening.tekst}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
