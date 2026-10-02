import React from 'react'
import { getDossierBewaking } from '@/lib/dossiers/actions'
import { isDossierBewerkbaar, magVoortgangWijzigen } from '@/lib/dossiers/guards'
import WerkGereedInvoer from './WerkGereedInvoer'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import { getAppLocale, getAppVertaler } from '@/i18n/server'

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
 * Wie een projectrol op het dossier heeft, kan de "Werk gereed" per code hier wijzigen
 * (zie WerkGereedInvoer); voor de rest blijft het scherm alleen-lezen.
 *
 * Bewust géén grafiek-library: een eigen SVG-ring en CSS-balken schelen een
 * zware clientbundel op een telefoon, en zo blijft dit een server-component.
 */
const GROEN = '#009439'
const AMBER = '#b98900'
const ROOD = '#b42318'
const SPOOR = '#eef1f2'
const LEISTEEN = '#5b6770'

const getal = (v: number, locale: string) => v.toLocaleString(locale, { maximumFractionDigits: 1 })
const pctTekst = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)
const klem = (v: number | null) => (v == null ? 0 : Math.min(Math.max(v, 0), 100))

function Ring({ pct, gereedTekst }: { pct: number | null; gereedTekst: string }) {
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
        fontSize="13" fontWeight="600" fill="#6b757c">{gereedTekst}</text>
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
function oordeel(gereed: number | null, urenPct: number | null): { sleutel: 'teVeel' | 'ietsVoor' | 'ruim' | 'opKoers'; kleur: string } | null {
  if (gereed == null || urenPct == null) return null
  const verschil = urenPct - gereed
  if (verschil > 15) return { sleutel: 'teVeel', kleur: ROOD }
  if (verschil > 5) return { sleutel: 'ietsVoor', kleur: AMBER }
  if (verschil < -10) return { sleutel: 'ruim', kleur: GROEN }
  return { sleutel: 'opKoers', kleur: GROEN }
}

type UrenTeksten = { locale: string; geboekt: string; van: string; prognose: string }

/** Twee grote getallen naast elkaar: geboekt tegenover prognose. */
function Uren({ geboekt, prognose, teksten }: { geboekt: number; prognose: number; teksten: UrenTeksten }) {
  const over = prognose > 0 && geboekt > prognose
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 18 }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: over ? ROOD : '#161b20', lineHeight: 1.1 }}>
          {getal(geboekt, teksten.locale)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b757c' }}>{teksten.geboekt}</div>
      </div>
      <div style={{ fontSize: 20, fontWeight: 600, color: '#c3cbd0', paddingBottom: 4 }}>{teksten.van}</div>
      <div>
        <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--fg)', lineHeight: 1.1 }}>
          {getal(prognose, teksten.locale)}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#6b757c' }}>{teksten.prognose}</div>
      </div>
    </div>
  )
}

export default async function VoortgangView({ dossierId }: { dossierId: string }) {
  // De app is van de uitvoering: de kostengroep Correcties hoort hier nooit bij.
  const [data, magWijzigen, bewerkbaarDossier, t, locale] = await Promise.all([
    getDossierBewaking(dossierId, { verbergCorrecties: true }).catch(() => null),
    magVoortgangWijzigen(dossierId).catch(() => false),
    isDossierBewerkbaar(dossierId).catch(() => false),
    getAppVertaler('dossiertabs'),
    getAppLocale(),
  ])
  const urenTeksten: UrenTeksten = {
    locale, geboekt: t('voortgang.uurGeboekt'), van: t('voortgang.van'), prognose: t('voortgang.uurPrognose'),
  }
  const bewerkbaar = magWijzigen && bewerkbaarDossier

  if (!data || !data.beschikbaar) {
    return (
      <div style={{ textAlign: 'center', color: '#6b757c', padding: '40px 16px', fontSize: 15 }}>
        {t('voortgang.geen')}
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
        {t('voortgang.geenUren')}
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
        background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 16, padding: 18,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
      }}>
        <Ring pct={data.projectProgress} gereedTekst={t('voortgang.gereed')} />
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Uren geboekt={totGeboekt} prognose={totProg} teksten={urenTeksten} />
          <Balk
            pct={totUrenPct}
            kleur={totUrenPct != null && totUrenPct > 100 ? ROOD : '#5b6770'}
            gestreept
          />
        </div>
      </div>

      {/* Per bewakingscode */}
      {regels.map((r, i) => {
        // Mobiel gaat over arbeid: toon (en bewerk) het arbeid-%, niet het totaal van de code.
        const gereed = r.arbeidProgress
        const urenPct = (r.prognoseUren ?? 0) > 0 ? (r.geboekteUren / r.prognoseUren) * 100 : null
        const mening = oordeel(gereed, urenPct)
        const urenKleur = urenPct != null && urenPct > 100 ? ROOD : LEISTEEN

        return (
          <div key={`${r.hoofdstukId ?? 'x'}|${r.code ?? ''}|${i}`} style={{
            background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: 16,
            padding: 16, display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', lineHeight: 1.3 }}>
                {r.naam ? <VertaalbareTekst tekst={r.naam} label={false} /> : r.code ?? t('voortgang.zonderCode')}
              </div>
              {r.code && r.naam && (
                <div style={{ fontSize: 13, color: '#9aa4ab', marginTop: 2 }}>{r.code}</div>
              )}
            </div>

            {/* Werk gereed — effen groen; met projectrol aan te passen */}
            <WerkGereedInvoer
              dossierId={dossierId} bouw7Id={data.bouw7Id} code={r.code} naam={r.naam}
              hoofdstukId={r.hoofdstukId} initial={gereed} bewerkbaar={bewerkbaar}
            />

            {/* Uren — gestreept en grijs, zodat je hem niet met "gereed" verwart */}
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#6b757c', marginBottom: 7 }}>{t('voortgang.uren')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <Uren geboekt={r.geboekteUren} prognose={r.prognoseUren} teksten={urenTeksten} />
                <Balk pct={urenPct} kleur={urenKleur} gestreept />
                {urenPct != null && urenPct > 100 && (
                  <div style={{ fontSize: 14, fontWeight: 700, color: ROOD }}>
                    {t('voortgang.bovenPrognose', { uren: getal(r.geboekteUren - r.prognoseUren, locale) })}
                  </div>
                )}
              </div>
            </div>

            {mening && (
              <div style={{
                fontSize: 15, fontWeight: 600, color: mening.kleur,
                background: `${mening.kleur}14`, borderRadius: 10, padding: '11px 13px',
              }}>
                {t(`voortgang.oordeel.${mening.sleutel}`)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
