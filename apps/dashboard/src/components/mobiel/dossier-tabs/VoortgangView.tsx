import React from 'react'
import { getDossierBewaking } from '@/lib/dossiers/actions'

/**
 * Voortgang per bewakingscode (mobiel).
 *
 * Toont per code met arbeid: prognose-uren, geboekte uren en % gereed — groot en
 * visueel. De kern is de vergelijking tussen die twee: verbruik je sneller uren
 * dan je werk afkrijgt, dan loop je achter. Dat oordeel staat er in gewone taal
 * bij, zodat je het in één oogopslag ziet zonder cijfers te vergelijken.
 *
 * Bewust géén grafiek-library: een eigen SVG-ring en CSS-balken schelen een
 * zware clientbundel op een telefoon, en zo blijft dit een server-component.
 * Zware live-Bouw7-call → de pagina wikkelt dit in `<Suspense>`.
 */
const GROEN = '#009439'
const AMBER = '#b98900'
const ROOD = '#b42318'
const GRIJS = '#eef1f2'

const uren = (v: number) =>
  v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })

function Ring({ pct }: { pct: number | null }) {
  const p = pct == null ? 0 : Math.min(Math.max(pct, 0), 100)
  const r = 52
  const omtrek = 2 * Math.PI * r

  return (
    <svg width="128" height="128" viewBox="0 0 128 128" aria-hidden>
      <circle cx="64" cy="64" r={r} fill="none" stroke={GRIJS} strokeWidth="13" />
      {pct != null && (
        <circle
          cx="64" cy="64" r={r} fill="none" stroke={GROEN} strokeWidth="13"
          strokeDasharray={omtrek} strokeDashoffset={omtrek * (1 - p / 100)}
          strokeLinecap="round" transform="rotate(-90 64 64)"
        />
      )}
      <text x="64" y="64" textAnchor="middle" dominantBaseline="central"
        fontSize="31" fontWeight="800" fill="#161b20">
        {pct == null ? '—' : `${Math.round(p)}%`}
      </text>
    </svg>
  )
}

function Balk({ pct, kleur }: { pct: number | null; kleur: string }) {
  const p = pct == null ? 0 : Math.min(Math.max(pct, 0), 100)
  return (
    <div style={{ height: 14, borderRadius: 999, background: GRIJS, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${p}%`, background: kleur, borderRadius: 999 }} />
    </div>
  )
}

function Regel({ label, waarde, pct, kleur }: {
  label: string; waarde: string; pct: number | null; kleur: string
}) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: '#6b757c' }}>{label}</span>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#161b20' }}>{waarde}</span>
      </div>
      <Balk pct={pct} kleur={kleur} />
    </div>
  )
}

/** Oordeel in gewone taal: verbruik je uren sneller dan je werk afkrijgt? */
function oordeel(gereedPct: number | null, urenPct: number | null): { tekst: string; kleur: string } | null {
  if (gereedPct == null || urenPct == null) return null
  const verschil = urenPct - gereedPct
  if (verschil > 15) return { tekst: 'Meer uren verbruikt dan werk gereed', kleur: ROOD }
  if (verschil > 5) return { tekst: 'Uren lopen iets voor op de voortgang', kleur: AMBER }
  if (verschil < -10) return { tekst: 'Ruim binnen de prognose', kleur: GROEN }
  return { tekst: 'Op koers', kleur: GROEN }
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
  const projectPct = data.projectProgress != null ? data.projectProgress * 100 : null

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Stand van het hele project */}
      <div style={{
        background: '#fff', border: '1px solid #e3e8ea', borderRadius: 16, padding: 18,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: '#6b757c', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Gereed
        </div>
        <Ring pct={projectPct} />
        <div style={{ width: '100%' }}>
          <Regel
            label="Uren"
            waarde={`${uren(totGeboekt)} van ${uren(totProg)}`}
            pct={totUrenPct}
            kleur={totUrenPct != null && totUrenPct > 100 ? ROOD : GROEN}
          />
        </div>
      </div>

      {/* Per bewakingscode */}
      {regels.map((r, i) => {
        const gereedPct = r.progress != null ? r.progress * 100 : null
        const urenPct = (r.prognoseUren ?? 0) > 0 ? (r.geboekteUren / r.prognoseUren) * 100 : null
        const mening = oordeel(gereedPct, urenPct)

        return (
          <div key={r.code ?? i} style={{
            background: '#fff', border: '1px solid #e3e8ea', borderRadius: 16,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 14,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: '#161b20', lineHeight: 1.3 }}>
                {r.naam ?? r.code ?? 'Zonder code'}
              </div>
              {r.code && r.naam && (
                <div style={{ fontSize: 13, color: '#9aa4ab', marginTop: 2 }}>{r.code}</div>
              )}
            </div>

            <Regel
              label="Gereed"
              waarde={gereedPct == null ? '—' : `${Math.round(gereedPct)}%`}
              pct={gereedPct}
              kleur={GROEN}
            />

            <Regel
              label="Uren"
              waarde={`${uren(r.geboekteUren)} van ${uren(r.prognoseUren)}`}
              pct={urenPct}
              kleur={urenPct != null && urenPct > 100 ? ROOD : urenPct != null && urenPct > 90 ? AMBER : GROEN}
            />

            {mening && (
              <div style={{
                fontSize: 14, fontWeight: 600, color: mening.kleur,
                background: `${mening.kleur}14`, borderRadius: 10, padding: '10px 12px',
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
