'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BottomSheet from '../BottomSheet'
import { AMBER, GRIJS, GROEN, OPPERVLAK, RAND, ROOD, TEKST, VLAK, primaireKnop } from '../oplevering/stijl'
import { getBewakingscodesVoorUurlog, type BewakingscodeOptie } from '@/lib/dossiers/actions'
import { zetBewakingscode, type PrikklokWeek } from '@/lib/prikklok/actions'
import type { Markering, PrikklokRegel } from '@/lib/prikklok/bereken'

/**
 * De weekcontrole van de prikklok: per dag de regels die de prikklok zou maken, met de
 * onderliggende in- en uitkloktijden. In de testfase staat daarnaast wat er nu in de echte
 * weekstaat staat, zodat de rekenregels tegen de werkelijkheid te leggen zijn.
 */

const DAGNAMEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']
const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

function dagLabel(datum: string) {
  const d = new Date(`${datum}T12:00:00`)
  return `${DAGNAMEN[d.getDay()]} ${d.getDate()}-${d.getMonth() + 1}`
}

function verschuif(datum: string, dagen: number) {
  const d = new Date(`${datum}T12:00:00`)
  d.setDate(d.getDate() + dagen)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MARKERING: Record<Markering, { tekst: string; kleur: string }> = {
  nog_open: { tekst: 'Nog niet uitgeklokt', kleur: ROOD },
  handmatig_uitgeklokt: { tekst: 'Vertrektijd zelf opgegeven', kleur: AMBER },
  geen_bewakingscode: { tekst: 'Kies een bewakingscode', kleur: AMBER },
  gesimuleerd: { tekst: 'Testlocatie', kleur: GRIJS },
}

const WIJZE_TEKST: Record<string, string> = { locatie: 'uitgeklokt', wissel: 'gewisseld', handmatig: 'zelf opgegeven' }

export default function PrikklokWeekClient({ week }: { week: PrikklokWeek }) {
  const router = useRouter()
  const [codeVoor, setCodeVoor] = useState<PrikklokRegel | null>(null)
  const schaduw = week.fase === 'schaduw'
  const verschil = week.totaalPrikklok - week.totaalUrenstaat

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '8px 12px', flexShrink: 0, background: OPPERVLAK, borderBottom: `1px solid ${RAND}`,
      }}>
        <Link href={`/m/prikklok/week?week=${verschuif(week.weekStart, -7)}`} style={navKnop} aria-label="Vorige week">←</Link>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>Week {week.weekNr}</div>
        <Link href={`/m/prikklok/week?week=${verschuif(week.weekStart, 7)}`} style={navKnop} aria-label="Volgende week">→</Link>
      </div>

      {/* ── Kop ─────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 16px 12px', background: OPPERVLAK, borderBottom: `1px solid ${RAND}`, flexShrink: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: TEKST, fontVariantNumeric: 'tabular-nums' }}>
          {uur(week.totaalPrikklok)}
          <span style={{ fontSize: 16, fontWeight: 600, color: GRIJS }}> uur volgens de prikklok</span>
        </div>
        {schaduw && (
          <div style={{ fontSize: 13, color: GRIJS, marginTop: 4 }}>
            In je urenstaat: {uur(week.totaalUrenstaat)} uur
            {Math.abs(verschil) >= 0.01 && (
              <strong style={{ color: AMBER }}> · verschil {verschil > 0 ? '+' : ''}{uur(verschil)}</strong>
            )}
          </div>
        )}
        <div style={{
          display: 'inline-block', marginTop: 10, padding: '4px 12px', borderRadius: 999,
          fontSize: 11, fontWeight: 700,
          color: week.openPunten ? AMBER : GROEN,
          background: week.openPunten ? '#fff6db' : '#e6f5ec',
        }}>
          {week.openPunten
            ? `${week.openPunten} ${week.openPunten === 1 ? 'punt vraagt' : 'punten vragen'} nog aandacht`
            : 'Alles compleet'}
        </div>
      </div>

      {/* ── Dagen ───────────────────────────────────────────────── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {week.dagen.map(dag => {
          const heeftIets = dag.prikklok || dag.urenstaat.length
          const weekend = [0, 6].includes(new Date(`${dag.datum}T12:00:00`).getDay())
          if (!heeftIets && weekend) return null
          const dagVerschil = (dag.prikklok?.uren ?? 0) - dag.urenstaatTotaal
          return (
            <div key={dag.datum} style={{ background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 14, overflow: 'hidden' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
                padding: '10px 16px', borderBottom: `1px solid ${RAND}`,
              }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: TEKST, textTransform: 'capitalize' }}>{dagLabel(dag.datum)}</span>
                <span style={{ fontSize: 13, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
                  {dag.prikklok ? `${uur(dag.prikklok.uren)} u` : '—'}
                  {dag.prikklok && dag.prikklok.pauzeMinuten > 0 && ` · ${dag.prikklok.pauzeMinuten} min pauze`}
                </span>
              </div>

              {!dag.prikklok && (
                <div style={{ padding: '10px 16px', fontSize: 13, color: GRIJS }}>Niet ingeklokt.</div>
              )}

              {dag.prikklok?.regels.map(r => (
                <div key={r.sessieIds.join('-')} style={{ padding: '10px 16px', borderBottom: `1px solid ${RAND}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: TEKST, minWidth: 0 }}>{r.dossier_label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEKST, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {uur(r.uren)} u
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCodeVoor(r)}
                    style={{
                      marginTop: 4, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
                      fontSize: 13, color: r.bewakingscode ? GRIJS : AMBER, fontWeight: r.bewakingscode ? 400 : 600,
                      textDecoration: 'underline', textUnderlineOffset: 2,
                    }}
                  >
                    {r.bewakingscode ? `Code ${r.bewakingscode}` : 'Bewakingscode kiezen'}
                  </button>
                  {r.markeringen.filter(m => m !== 'geen_bewakingscode').length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {r.markeringen.filter(m => m !== 'geen_bewakingscode').map(m => (
                        <span key={m} style={{
                          fontSize: 11, fontWeight: 700, color: MARKERING[m].kleur,
                          border: `1px solid ${MARKERING[m].kleur}`, borderRadius: 999, padding: '2px 8px',
                        }}>
                          {MARKERING[m].tekst}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {dag.sessies.length > 0 && (
                <details style={{ padding: '8px 16px', borderBottom: schaduw ? `1px solid ${RAND}` : undefined }}>
                  <summary style={{ fontSize: 12, color: GRIJS, cursor: 'pointer' }}>In- en uitkloktijden</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                    {dag.sessies.map(s => (
                      <div key={s.id} style={{ fontSize: 12, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
                        {s.in_tijd} – {s.uit_tijd ?? '…'} · {s.dossier_label}
                        {s.uit_wijze && ` · ${WIJZE_TEKST[s.uit_wijze]}`}
                        {s.uit_wijze === 'handmatig' && s.uit_afstand_m != null && ` (${Math.round(s.uit_afstand_m)} m van het werk)`}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {schaduw && (
                <div style={{ padding: '8px 16px 10px', background: VLAK }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GRIJS }}>
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10.5 }}>In je urenstaat</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {uur(dag.urenstaatTotaal)} u
                      {dag.prikklok && Math.abs(dagVerschil) >= 0.01 && (
                        <strong style={{ color: AMBER }}> ({dagVerschil > 0 ? '+' : ''}{uur(dagVerschil)})</strong>
                      )}
                    </span>
                  </div>
                  {dag.urenstaat.map((u, i) => (
                    <div key={i} style={{ fontSize: 12, color: GRIJS, marginTop: 2 }}>
                      {uur(u.uren)} u · {u.label}{u.bewakingscode ? ` · ${u.bewakingscode}` : ''}{u.uursoort ? ` · ${u.uursoort}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ fontSize: 13, color: GRIJS, lineHeight: 1.5, padding: '4px 4px 0' }}>
          {schaduw
            ? 'Testmodus: deze week gaat nog niet naar je urenstaat. Straks controleer je hier je week en dien je hem in één keer in.'
            : 'Controleer je week. Klopt alles, dan dien je hem in via Uren.'}
        </div>
      </div>

      {codeVoor && (
        <CodeSheet
          regel={codeVoor}
          onSluit={() => setCodeVoor(null)}
          onGekozen={() => { setCodeVoor(null); router.refresh() }}
        />
      )}
    </>
  )
}

function CodeSheet({ regel, onSluit, onGekozen }: {
  regel: PrikklokRegel
  onSluit: () => void
  onGekozen: () => void
}) {
  const [codes, setCodes] = useState<BewakingscodeOptie[] | null>(null)
  const [bezig, setBezig] = useState(false)

  useEffect(() => {
    // Zelfde lijst als de weekstaat: alleen codes waar uren op begroot zijn.
    getBewakingscodesVoorUurlog(regel.dossier_id, { alleenMetPrognose: true })
      .then(setCodes)
      .catch(() => setCodes([]))
  }, [regel.dossier_id])

  async function kies(o: BewakingscodeOptie) {
    setBezig(true)
    try {
      const res = await zetBewakingscode(regel.sessieIds, o.code, o.pslId)
      if (res.ok) { toast.success(res.melding); onGekozen() }
      else toast.error(res.melding)
    } finally {
      setBezig(false)
    }
  }

  return (
    <BottomSheet titel="Bewakingscode" onSluit={onSluit}>
      <div style={{ fontSize: 13, color: GRIJS }}>{regel.dossier_label}</div>
      {codes === null && <div style={{ fontSize: 14, color: GRIJS }}>Codes laden…</div>}
      {codes?.length === 0 && (
        <div style={{ fontSize: 14, color: GRIJS }}>Voor dit dossier zijn geen codes met begrote uren gevonden.</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {codes?.map(o => (
          <button
            key={`${o.code}-${o.pslId}`}
            type="button"
            disabled={bezig}
            onClick={() => kies(o)}
            style={{
              ...primaireKnop, background: o.code === regel.bewakingscode ? GROEN : VLAK,
              color: o.code === regel.bewakingscode ? '#fff' : TEKST, border: `1px solid ${RAND}`,
              textAlign: 'left', fontSize: 14, fontWeight: 600, padding: '12px 14px',
            }}
          >
            {o.code}{o.naam ? ` · ${o.naam}` : ''}
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}

const navKnop: React.CSSProperties = {
  width: 40, height: 40, flexShrink: 0, borderRadius: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: `1px solid ${RAND}`, background: VLAK, color: TEKST, fontSize: 17, textDecoration: 'none',
}
