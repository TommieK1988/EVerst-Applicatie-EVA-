'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import BottomSheet from '../BottomSheet'
import { AMBER, GRIJS, GROEN, OPPERVLAK, RAND, ROOD, TEKST, VLAK, primaireKnop, secundaireKnop, veld, label } from '../oplevering/stijl'
import { haalLocatie, herstelUitleg, LocatieFout } from '@/lib/locatie/toestemming'
import {
  zoekWerklocaties, klokIn, klokUit, meldVertrokken, meldGpsFout, type PrikklokStatus,
} from '@/lib/prikklok/actions'
import type { PositieInvoer, Werklocatie } from '@/lib/prikklok/types'

/**
 * De prikklok: één grote knop. Ingeklokt of niet, dat is het hele scherm.
 *
 * Inklokken gaat in twee stappen — eerst de locatie ophalen en de werkadressen binnen de straal
 * zoeken, dan kiezen. Ook bij één treffer vragen we een tik ter bevestiging: je ziet dan waar je
 * op inklokt, en een buurpand is zo snel verward.
 */

const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

function looptijd(sinds: string, nu: number): string {
  const min = Math.max(0, Math.floor((nu - new Date(sinds).getTime()) / 60_000))
  return `${Math.floor(min / 60)}u ${String(min % 60).padStart(2, '0')}m`
}

function nuAlsTijd(): string {
  return new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())
}

const WIJZE_TEKST: Record<string, string> = {
  locatie: 'uitgeklokt',
  wissel: 'gewisseld',
  handmatig: 'zelf opgegeven',
}

export default function PrikklokClient({ status }: { status: PrikklokStatus }) {
  const router = useRouter()
  const [bezig, setBezig] = useState<null | 'in' | 'uit' | 'vertrek'>(null)
  const [fout, setFout] = useState<{ tekst: string; vertrekAanbieden: boolean } | null>(null)
  const [keuze, setKeuze] = useState<{ locaties: Werklocatie[]; invoer: PositieInvoer } | null>(null)
  const [vertrekOpen, setVertrekOpen] = useState(false)
  const [testDossier, setTestDossier] = useState('')
  const [nu, setNu] = useState(() => Date.now())

  useEffect(() => {
    const t = setInterval(() => setNu(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  const open = status.open
  const schaduw = status.fase === 'schaduw'

  /** Positie van de telefoon, of de gekozen testlocatie. Null = fout al getoond. */
  async function positie(actie: 'in' | 'uit'): Promise<PositieInvoer | null> {
    if (schaduw && testDossier) return { soort: 'test', dossierId: testDossier }
    try {
      const loc = await haalLocatie({ vernieuwen: true, timeoutMs: 20_000 })
      return { soort: 'gps', positie: { lat: loc.lat, lng: loc.lng, nauwkeurigheid: loc.nauwkeurigheid } }
    } catch (e) {
      if (e instanceof LocatieFout) {
        const geweigerd = e.soort === 'geweigerd'
        void meldGpsFout(actie, geweigerd ? 'geweigerd' : 'geen_gps').catch(() => {})
        setFout({
          tekst: geweigerd ? `${e.message} ${herstelUitleg()}` : e.message,
          vertrekAanbieden: false,
        })
      } else {
        setFout({ tekst: 'Locatie ophalen lukte niet.', vertrekAanbieden: false })
      }
      return null
    }
  }

  async function startInklokken() {
    setFout(null)
    setBezig('in')
    try {
      const invoer = await positie('in')
      if (!invoer) return
      const res = await zoekWerklocaties(invoer)
      if (!res.ok) {
        setFout({ tekst: res.melding, vertrekAanbieden: false })
        return
      }
      setKeuze({ locaties: res.locaties, invoer })
    } catch {
      setFout({ tekst: 'Er ging iets mis. Probeer het opnieuw.', vertrekAanbieden: false })
    } finally {
      setBezig(null)
    }
  }

  async function bevestigInklokken(dossierId: string) {
    if (!keuze) return
    setBezig('in')
    try {
      const res = await klokIn(dossierId, keuze.invoer)
      setKeuze(null)
      if (res.ok) {
        toast.success(res.melding)
        router.refresh()
      } else {
        setFout({ tekst: res.melding, vertrekAanbieden: false })
      }
    } finally {
      setBezig(null)
    }
  }

  async function uitklokken() {
    setFout(null)
    setBezig('uit')
    try {
      const invoer = await positie('uit')
      if (!invoer) return
      const res = await klokUit(invoer)
      if (res.ok) {
        toast.success(res.melding)
        router.refresh()
      } else {
        setFout({ tekst: res.melding, vertrekAanbieden: res.reden === 'te_ver' || res.reden === 'geen_coordinaten' })
      }
    } catch {
      setFout({ tekst: 'Er ging iets mis. Probeer het opnieuw.', vertrekAanbieden: false })
    } finally {
      setBezig(null)
    }
  }

  async function bevestigVertrek(tijd: string) {
    setBezig('vertrek')
    try {
      // Positie is hier een bijzaak: lukt hij niet, dan gaat de opgave toch door.
      let invoer: PositieInvoer | null = null
      if (schaduw && testDossier) invoer = { soort: 'test', dossierId: testDossier }
      else {
        try {
          const loc = await haalLocatie({ maxLeeftijdMs: 60_000, timeoutMs: 8_000 })
          invoer = { soort: 'gps', positie: { lat: loc.lat, lng: loc.lng, nauwkeurigheid: loc.nauwkeurigheid } }
        } catch { /* zonder positie verder */ }
      }
      const res = await meldVertrokken(tijd, invoer)
      if (res.ok) {
        toast.success(res.melding)
        setVertrekOpen(false)
        setFout(null)
        router.refresh()
      } else {
        toast.error(res.melding)
      }
    } finally {
      setBezig(null)
    }
  }

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {schaduw && (
        <div style={{
          padding: '10px 12px', borderRadius: 10, background: '#fff6db', color: '#6b5200',
          fontSize: 13, lineHeight: 1.45, border: '1px solid #f0dc9c',
        }}>
          <strong>Testmodus.</strong> De prikklok telt nog niet mee: je urenstaat en Bouw7 blijven
          onaangeroerd.
        </div>
      )}

      {/* ── Vergeten uit te klokken: eerst dat oplossen ─────────── */}
      {open?.vergeten ? (
        <VergetenKaart
          dossier={open.dossier_label}
          datum={open.datum}
          inTijd={open.in_tijd}
          bezig={bezig === 'vertrek'}
          onBevestig={bevestigVertrek}
        />
      ) : (
        <>
          {/* ── Statuskaart ────────────────────────────────────── */}
          <div style={{
            background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 16,
            padding: 20, display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch',
          }}>
            {open ? (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: GROEN, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Ingeklokt sinds {open.in_tijd}
                </div>
                <div style={{ fontSize: 32, fontWeight: 800, color: TEKST, fontVariantNumeric: 'tabular-nums', margin: '4px 0' }}>
                  {looptijd(open.in_op, nu)}
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: TEKST }}>{open.dossier_label}</div>
                {open.adres && <div style={{ fontSize: 13, color: GRIJS, marginTop: 2 }}>{open.adres}</div>}
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: GRIJS, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Niet ingeklokt
                </div>
                <div style={{ fontSize: 14, color: GRIJS, marginTop: 4, lineHeight: 1.45 }}>
                  Inklokken kan binnen {status.straal_m} m van het werkadres.
                </div>
              </div>
            )}

            {open ? (
              <>
                <button type="button" onClick={uitklokken} disabled={!!bezig} style={{ ...primaireKnop, background: ROOD, padding: '18px 16px', fontSize: 18 }}>
                  {bezig === 'uit' ? 'Locatie ophalen…' : 'Uitklokken'}
                </button>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button type="button" onClick={startInklokken} disabled={!!bezig} style={secundaireKnop}>
                    {bezig === 'in' ? 'Zoeken…' : 'Wisselen'}
                  </button>
                  <button type="button" onClick={() => setVertrekOpen(true)} disabled={!!bezig} style={secundaireKnop}>
                    Al vertrokken
                  </button>
                </div>
              </>
            ) : (
              <button type="button" onClick={startInklokken} disabled={!!bezig} style={{ ...primaireKnop, padding: '18px 16px', fontSize: 18 }}>
                {bezig === 'in' ? 'Locatie ophalen…' : 'Inklokken'}
              </button>
            )}
          </div>

          {fout && (
            <div role="alert" style={{
              padding: '12px 14px', borderRadius: 12, background: '#fdecea', color: '#8a1c12',
              fontSize: 14, lineHeight: 1.45, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <span>{fout.tekst}</span>
              {fout.vertrekAanbieden && open && (
                <button type="button" onClick={() => setVertrekOpen(true)} style={{ ...secundaireKnop, color: '#8a1c12' }}>
                  Ik ben al vertrokken
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Vandaag ───────────────────────────────────────────── */}
      {status.sessiesVandaag.length > 0 && (
        <div style={{ background: OPPERVLAK, border: `1px solid ${RAND}`, borderRadius: 16, overflow: 'hidden' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '12px 16px', borderBottom: `1px solid ${RAND}`,
          }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>Vandaag</span>
            <span style={{ fontSize: 13, color: GRIJS }}>
              {status.vandaag ? `${uur(status.vandaag.uren)} uur` : '—'}
              {status.vandaag && status.vandaag.pauzeMinuten > 0 && ` · ${status.vandaag.pauzeMinuten} min pauze eraf`}
            </span>
          </div>
          {status.sessiesVandaag.map(s => (
            <div key={s.id} style={{ padding: '10px 16px', borderBottom: `1px solid ${RAND}`, fontSize: 13 }}>
              <div style={{ color: TEKST, fontWeight: 600 }}>{s.dossier_label}</div>
              <div style={{ color: GRIJS, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                {s.in_tijd} – {s.uit_tijd ?? 'nu'}
                {s.uit_wijze && ` · ${WIJZE_TEKST[s.uit_wijze]}`}
                {s.uit_wijze === 'handmatig' && s.uit_afstand_m != null && ` (${Math.round(s.uit_afstand_m)} m van het werk)`}
                {s.gesimuleerd && ' · testlocatie'}
              </div>
            </div>
          ))}
        </div>
      )}

      <Link href="/m/prikklok/week" style={{
        ...secundaireKnop, textAlign: 'center', textDecoration: 'none', color: TEKST, display: 'block',
      }}>
        Mijn week controleren
      </Link>

      {/* ── Testlocatie (alleen schaduwfase) ──────────────────── */}
      {schaduw && status.testDossiers.length > 0 && (
        <div style={{ borderTop: `1px dashed ${RAND}`, paddingTop: 16 }}>
          <label style={label} htmlFor="prikklok-test">Testlocatie (alleen in testmodus)</label>
          <select id="prikklok-test" value={testDossier} onChange={e => setTestDossier(e.target.value)} style={veld}>
            <option value="">Echte GPS-locatie gebruiken</option>
            {status.testDossiers.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
          <p style={{ fontSize: 12, color: GRIJS, margin: '8px 0 0', lineHeight: 1.45 }}>
            Doet alsof je op het werkadres van dit dossier staat. Zulke sessies worden gemarkeerd.
          </p>
        </div>
      )}

      {keuze && (
        <BottomSheet titel={keuze.locaties.length === 1 ? 'Hier inklokken?' : 'Op welk werk klok je in?'} onSluit={() => setKeuze(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {keuze.locaties.map(l => (
              <button
                key={l.id}
                type="button"
                disabled={!!bezig}
                onClick={() => bevestigInklokken(l.id)}
                style={{
                  textAlign: 'left', padding: '12px 14px', borderRadius: 12,
                  border: `1px solid ${l.ingepland ? GROEN : RAND}`, background: VLAK,
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, color: TEKST }}>{l.label}</span>
                {l.adres && <span style={{ fontSize: 13, color: GRIJS }}>{l.adres}</span>}
                <span style={{ fontSize: 12, color: l.ingepland ? GROEN : GRIJS, fontWeight: 600 }}>
                  {l.ingepland ? 'Vandaag ingepland · ' : ''}{l.afstand_m} m
                </span>
              </button>
            ))}
            {keuze.locaties.length === 1 && (
              <button type="button" disabled={!!bezig} onClick={() => bevestigInklokken(keuze.locaties[0].id)} style={{ ...primaireKnop, marginTop: 4 }}>
                {bezig ? 'Bezig…' : 'Inklokken'}
              </button>
            )}
          </div>
        </BottomSheet>
      )}

      {vertrekOpen && open && (
        <VertrekSheet
          inTijd={open.in_tijd}
          bezig={bezig === 'vertrek'}
          onSluit={() => setVertrekOpen(false)}
          onBevestig={bevestigVertrek}
        />
      )}
    </div>
  )
}

function VertrekSheet({ inTijd, bezig, onSluit, onBevestig }: {
  inTijd: string
  bezig: boolean
  onSluit: () => void
  onBevestig: (tijd: string) => void
}) {
  const [tijd, setTijd] = useState(nuAlsTijd)
  return (
    <BottomSheet titel="Hoe laat ben je vertrokken?" onSluit={onSluit}>
      <p style={{ fontSize: 14, color: GRIJS, margin: 0, lineHeight: 1.5 }}>
        Je bent niet meer op het werkadres. Geef op hoe laat je wegging; dit komt als
        &lsquo;zelf opgegeven&rsquo; in je weekcontrole. Ingeklokt om {inTijd}.
      </p>
      <input type="time" value={tijd} onChange={e => setTijd(e.target.value)} style={veld} aria-label="Vertrektijd" />
      <button type="button" disabled={bezig || !tijd} onClick={() => onBevestig(tijd)} style={{ ...primaireKnop, opacity: bezig || !tijd ? 0.5 : 1 }}>
        {bezig ? 'Opslaan…' : 'Vertrektijd vastleggen'}
      </button>
    </BottomSheet>
  )
}

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag']

function VergetenKaart({ dossier, datum, inTijd, bezig, onBevestig }: {
  dossier: string
  datum: string
  inTijd: string
  bezig: boolean
  onBevestig: (tijd: string) => void
}) {
  const [tijd, setTijd] = useState('')
  const d = new Date(`${datum}T12:00:00`)
  return (
    <div style={{
      background: OPPERVLAK, border: `2px solid ${AMBER}`, borderRadius: 16, padding: 20,
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: AMBER, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Niet uitgeklokt
      </div>
      <div style={{ fontSize: 15, color: TEKST, lineHeight: 1.5 }}>
        Op {DAGEN[d.getDay()]} {d.getDate()}-{d.getMonth() + 1} ben je om {inTijd} ingeklokt bij{' '}
        <strong>{dossier}</strong>, maar niet uitgeklokt. Hoe laat ben je vertrokken?
      </div>
      <input type="time" value={tijd} onChange={e => setTijd(e.target.value)} style={veld} aria-label="Vertrektijd" />
      <button type="button" disabled={bezig || !tijd} onClick={() => onBevestig(tijd)} style={{ ...primaireKnop, opacity: bezig || !tijd ? 0.5 : 1 }}>
        {bezig ? 'Opslaan…' : 'Vertrektijd vastleggen'}
      </button>
      <p style={{ fontSize: 12, color: GRIJS, margin: 0, lineHeight: 1.45 }}>
        Tot je dit invult, telt die dag 0 uur en kun je niet opnieuw inklokken.
      </p>
    </div>
  )
}
