'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  vraagVerlofAan, trekVerlofIn, berekenMijnVerlofUren,
  type VerlofAanvraag,
} from '@/lib/uren/verlof'

/**
 * Verlof aanvragen en je eigen aanvragen volgen, op de telefoon.
 *
 * De uren worden live berekend zodra de medewerker een periode kiest: weekenden en feestdagen
 * vallen er vanzelf uit. Dat is het antwoord op de vraag die iedereen stelt -- "hoeveel kost me
 * dit?" -- en voorkomt dat iemand een week aanvraagt en er een dag naast zit.
 *
 * Naast hele dagen kan iemand een deel van een dag vrij vragen (tandarts, school, een middag weg).
 * Dat is bewust beperkt tot één dag: bij een venster over meerdere dagen is niet te zeggen of je
 * elke dag die uren vrij bent of alleen de eerste. De uren volgen dan uit het venster, nooit meer
 * dan een hele roosterdag.
 */

const veld: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--bg)',
  fontFamily: 'inherit', fontSize: 15, color: 'var(--fg)',
}

const labelStijl: React.CSSProperties = {
  display: 'block', fontSize: 12, fontWeight: 700, color: '#6b757c',
  marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em',
}

const STATUS: Record<string, { label: string; kleur: string; achtergrond: string }> = {
  aangevraagd: { label: 'Wacht op akkoord', kleur: '#a15c00', achtergrond: '#fdf3e3' },
  goedgekeurd: { label: 'Goedgekeurd', kleur: '#009439', achtergrond: '#e6f5ec' },
  afgewezen: { label: 'Afgewezen', kleur: '#c0392b', achtergrond: '#fdecea' },
  ingetrokken: { label: 'Ingetrokken', kleur: '#8a8c86', achtergrond: '#f1f3f4' },
}

/** "13:00-17:00" achter de periode, alleen bij een deel van een dag. */
function venster(a: VerlofAanvraag) {
  return a.startTijd && a.eindTijd ? ` · ${a.startTijd}-${a.eindTijd}` : ''
}

function periode(start: string, eind: string) {
  const f = (d: string) => new Date(`${d}T12:00:00`)
    .toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
  return start === eind ? f(start) : `${f(start)} t/m ${f(eind)}`
}

export default function VerlofClient({
  aanvragen, soorten, saldo,
}: {
  aanvragen: VerlofAanvraag[]
  soorten: Array<{ id: string; naam: string }>
  saldo: number
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  const [open, setOpen] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [soortId, setSoortId] = useState(soorten[0]?.id ?? '')
  const [start, setStart] = useState('')
  const [eind, setEind] = useState('')
  const [heleDagen, setHeleDagen] = useState(true)
  const [vanTijd, setVanTijd] = useState('08:00')
  const [totTijd, setTotTijd] = useState('12:00')
  const [toelichting, setToelichting] = useState('')
  const [berekend, setBerekend] = useState<{ uren: number; dagen: number; overgeslagen: string[] } | null>(null)

  // Zodra er een geldige periode staat: laten zien wat het kost. Weekenden en feestdagen zitten
  // er al uit, dus dit is het getal dat straks van het saldo af gaat.
  const tot = heleDagen ? eind : start
  useEffect(() => {
    if (!start || !tot || tot < start) { setBerekend(null); return }
    let levend = true
    berekenMijnVerlofUren(start, tot)
      .then(r => { if (levend) setBerekend(r) })
      .catch(() => { if (levend) setBerekend(null) })
    return () => { levend = false }
  }, [start, tot])

  // Wat het venster kost. Nooit meer dan een hele roosterdag: wie 07:00-19:00 kiest neemt geen
  // anderhalve dag verlof op. Hetzelfde plafond geldt op de server.
  const vensterUren = useMemo(() => {
    const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
    const minuten = m(totTijd) - m(vanTijd)
    if (!(minuten > 0)) return 0
    return Math.round((minuten / 60) * 100) / 100
  }, [vanTijd, totTijd])

  const kosten = heleDagen
    ? (berekend?.uren ?? 0)
    : Math.min(berekend?.uren ?? 0, vensterUren)
  const kanVersturen = !!berekend && berekend.dagen > 0 && kosten > 0

  async function verstuur() {
    if (!start || !tot) { toast.error(heleDagen ? 'Kies een periode.' : 'Kies een dag.'); return }
    setBezig(true)
    const r = await vraagVerlofAan({
      uursoortId: soortId, startDatum: start, eindDatum: tot,
      heleDagen,
      startTijd: heleDagen ? null : vanTijd,
      eindTijd: heleDagen ? null : totTijd,
      toelichting: toelichting || null,
    })
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aanvraag verstuurd.')
    setOpen(false); setStart(''); setEind(''); setToelichting(''); setBerekend(null)
    setHeleDagen(true)
    ververs()
  }

  async function intrekken(a: VerlofAanvraag) {
    const r = await trekVerlofIn(a.id)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aanvraag ingetrokken.')
    ververs()
  }

  return (
    <>
      <div style={{ padding: '14px 16px', background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: '#6b757c' }}>Tijd-voor-tijdsaldo</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: saldo < 0 ? '#c0392b' : 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {saldo > 0 ? '+' : ''}{saldo.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {aanvragen.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#6b757c', padding: '32px 0', fontSize: 14 }}>
            Je hebt nog geen verlof aangevraagd.
          </p>
        ) : aanvragen.map(a => {
          const st = STATUS[a.status] ?? STATUS.aangevraagd
          return (
            <div key={a.id} style={{
              border: '1px solid var(--border)', borderRadius: 12,
              background: 'var(--bg-elev)', padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
                    {periode(a.startDatum, a.eindDatum)}{venster(a)}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2 }}>
                    {a.uursoortNaam} · {a.urenTotaal.toLocaleString('nl-NL')} uur
                  </div>
                </div>
                <span style={{
                  padding: '4px 9px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                  color: st.kleur, background: st.achtergrond, whiteSpace: 'nowrap', height: 'fit-content',
                }}>
                  {st.label}
                </span>
              </div>

              {a.toelichting && (
                <div style={{ fontSize: 12, color: '#8a949a', marginTop: 6 }}>{a.toelichting}</div>
              )}
              {a.status === 'afgewezen' && a.afwijzingReden && (
                <div style={{ fontSize: 12, color: '#c0392b', marginTop: 6 }}>
                  <strong>Reden:</strong> {a.afwijzingReden}
                </div>
              )}
              {/* Een hele afdeling kan beoordelen, dus de naam erbij: anders weet de aanvrager
                  niet bij wie hij moet zijn als hij er iets over wil vragen. */}
              {a.beoordelaarNaam && (a.status === 'goedgekeurd' || a.status === 'afgewezen') && (
                <div style={{ fontSize: 11, color: '#8a949a', marginTop: 6 }}>
                  {a.status === 'goedgekeurd' ? 'Goedgekeurd' : 'Afgewezen'} door {a.beoordelaarNaam}
                </div>
              )}
              {a.status === 'goedgekeurd' && a.bouw7Status === 'fout' && (
                <div style={{ fontSize: 11, color: '#a15c00', marginTop: 6 }}>
                  Je verlof staat vast, maar is nog niet in Bouw7 verwerkt. De administratie ziet dit.
                </div>
              )}
              {a.status === 'aangevraagd' && (
                <button type="button" onClick={() => intrekken(a)}
                  style={{
                    marginTop: 8, border: 'none', background: 'transparent', padding: 0,
                    fontFamily: 'inherit', fontSize: 12, fontWeight: 700, color: '#c0392b', cursor: 'pointer',
                  }}>
                  Intrekken
                </button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{
        position: 'sticky', bottom: 0, marginTop: 'auto', flexShrink: 0,
        padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--neutral-0, #fff)', borderTop: '1px solid var(--border)',
      }}>
        <button type="button" onClick={() => setOpen(true)}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
            fontFamily: 'inherit', fontSize: 16, fontWeight: 700,
            background: '#009439', color: '#fff', cursor: 'pointer',
          }}>
          Verlof aanvragen
        </button>
      </div>

      {open && (
        <div onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 70,
            background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'flex-end',
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              width: '100%', background: 'var(--bg-elev)',
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              padding: '8px 20px calc(20px + env(safe-area-inset-bottom, 0px))',
              maxHeight: '92dvh', display: 'flex', flexDirection: 'column',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.15)',
            }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: '#d7dde0', margin: '0 auto 16px', flexShrink: 0 }} />
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--fg)', marginBottom: 16, flexShrink: 0 }}>
              Verlof aanvragen
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStijl}>Soort</label>
                <select value={soortId} onChange={e => setSoortId(e.target.value)} style={veld}>
                  {soorten.map(s => <option key={s.id} value={s.id}>{s.naam}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStijl}>Hoe lang</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setHeleDagen(true)} style={keuze(heleDagen)}>
                    Hele dag(en)
                  </button>
                  <button type="button" onClick={() => setHeleDagen(false)} style={keuze(!heleDagen)}>
                    Deel van een dag
                  </button>
                </div>
              </div>

              {heleDagen ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStijl}>Van</label>
                    <input type="date" value={start} onChange={e => setStart(e.target.value)} style={veld} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStijl}>Tot en met</label>
                    <input type="date" value={eind} min={start || undefined}
                      onChange={e => setEind(e.target.value)} style={veld} />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label style={labelStijl}>Dag</label>
                    <input type="date" value={start} onChange={e => setStart(e.target.value)} style={veld} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStijl}>Vanaf</label>
                      <input type="time" value={vanTijd} step={300}
                        onChange={e => setVanTijd(e.target.value)} style={veld} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStijl}>Tot</label>
                      <input type="time" value={totTijd} step={300} min={vanTijd}
                        onChange={e => setTotTijd(e.target.value)} style={veld} />
                    </div>
                  </div>
                </>
              )}

              {berekend && (
                <div style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: kanVersturen ? '#eef6f1' : '#fdf3e3',
                  color: kanVersturen ? '#0d5c30' : '#a15c00',
                  fontSize: 13, lineHeight: 1.5,
                }}>
                  {berekend.dagen === 0 ? (
                    heleDagen
                      ? 'In deze periode vallen geen roosterdagen — er is dan geen verlof op te nemen.'
                      : 'Op deze dag werk je volgens je rooster niet — er is dan geen verlof op te nemen.'
                  ) : !heleDagen ? (
                    vensterUren <= 0 ? (
                      'De eindtijd moet ná de begintijd liggen.'
                    ) : (
                      <>
                        <strong>{kosten.toLocaleString('nl-NL')} uur</strong>
                        {vensterUren > berekend.uren && (
                          <div style={{ marginTop: 4 }}>
                            Meer dan een hele werkdag kan niet — er gaat één roosterdag
                            ({berekend.uren.toLocaleString('nl-NL')} uur) af.
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    <>
                      <strong>{berekend.dagen} roosterdag{berekend.dagen === 1 ? '' : 'en'} ·{' '}
                      {berekend.uren.toLocaleString('nl-NL')} uur</strong>
                      {berekend.overgeslagen.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {berekend.overgeslagen.length} feestdag
                          {berekend.overgeslagen.length === 1 ? '' : 'en'} valt hierbuiten — daar
                          hoef je geen verlof voor op te nemen.
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label style={labelStijl}>Toelichting (optioneel)</label>
                <input type="text" value={toelichting} onChange={e => setToelichting(e.target.value)}
                  placeholder="Bijvoorbeeld: zomervakantie" style={veld} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
              <button type="button" onClick={() => setOpen(false)}
                style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
                Annuleren
              </button>
              <button type="button" onClick={verstuur}
                disabled={bezig || !kanVersturen}
                style={{
                  ...actieKnop, background: '#009439', color: '#fff', border: 'none',
                  opacity: bezig || !kanVersturen ? 0.5 : 1,
                }}>
                {bezig ? 'Bezig…' : 'Aanvragen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

/** Segmentknop voor "Hele dag(en)" / "Deel van een dag". */
function keuze(actief: boolean): React.CSSProperties {
  return {
    flex: 1, padding: '11px 0', borderRadius: 10, cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
    border: `1px solid ${actief ? '#009439' : 'var(--border)'}`,
    background: actief ? '#e6f5ec' : 'var(--bg)',
    color: actief ? '#0d5c30' : '#6b757c',
  }
}

const actieKnop: React.CSSProperties = {
  flex: 1, padding: '14px 0', borderRadius: 11, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 15, fontWeight: 700,
}
