'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import { useVertalingen } from '@/components/vertalen/useVertaling'
import {
  vraagVerlofAan, trekVerlofIn, berekenMijnVerlofUren,
  type VerlofAanvraag,
} from '@/lib/uren/verlof'
import type { IngeplandVerlof } from '@/lib/uren/afwezigheid-mobiel'
import IngeplandVerlofKaart from './IngeplandVerlofKaart'
import VerlofAanvraagKaart from './VerlofAanvraagKaart'

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

/** Eén datum in de taal van de app, bijv. "8 sep" of met jaar "8 sep 2026". */
function kortDatum(d: string, locale: string, metJaar: boolean) {
  return new Date(`${d}T12:00:00`).toLocaleDateString(locale, {
    day: 'numeric', month: 'short', ...(metJaar ? { year: 'numeric' } : {}),
  })
}

/** Vandaag als 'YYYY-MM-DD' in de tijdzone van de telefoon. */
function vandaagIso() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
}

export default function VerlofClient({
  aanvragen, ingepland, soorten, saldo,
}: {
  aanvragen: VerlofAanvraag[]
  /** Verlof uit de planning dat niet via de app is aangevraagd (meestal uit Bouw7). */
  ingepland: IngeplandVerlof[]
  soorten: Array<{ id: string; naam: string }>
  saldo: number
}) {
  const t = useTranslations('verlof')
  const locale = useDatumLocale()
  const getal = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 })
  // Jaartal altijd erbij — de lijst loopt terug tot vorig jaar. Binnen één jaar alleen achter de
  // einddatum ("8 sep t/m 12 sep 2026"), over de jaargrens achter allebei.
  const periode = (start: string, eind: string) => start === eind
    ? kortDatum(start, locale, true)
    : t('periode', {
      van: kortDatum(start, locale, start.slice(0, 4) !== eind.slice(0, 4)),
      tot: kortDatum(eind, locale, true),
    })
  // Namen van verlofsoorten stelt kantoor in; in een <option> kan geen component.
  const soortNamen = useVertalingen(soorten.map(s => s.naam))
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  // Eén lijst, nieuwste periode bovenaan: wat je in de app aanvroeg en wat er in de planning staat
  // horen voor de medewerker bij elkaar — het is allebei "wanneer ben ik vrij".
  // Verlof dat al voorbij is gaat onder een inklapknop, zodat bovenaan staat wat er nog komt.
  const { komend, verleden } = useMemo(() => {
    const vandaag = vandaagIso()
    const alle = [
      ...aanvragen.map(a => ({ soort: 'aanvraag' as const, datum: a.startDatum, eind: a.eindDatum, a })),
      ...ingepland.map(v => ({ soort: 'planning' as const, datum: v.startDatum, eind: v.eindDatum, v })),
    ].sort((x, y) => y.datum.localeCompare(x.datum))
    return { komend: alle.filter(r => r.eind >= vandaag), verleden: alle.filter(r => r.eind < vandaag) }
  }, [aanvragen, ingepland])
  const [verledenOpen, setVerledenOpen] = useState(false)

  const toonRegel = (r: (typeof komend)[number]) => r.soort === 'planning'
    ? <IngeplandVerlofKaart key={`p-${r.v.id}`} verlof={r.v}
      periode={periode(r.v.startDatum, r.v.eindDatum)} />
    : <VerlofAanvraagKaart key={r.a.id} aanvraag={r.a}
      periode={periode(r.a.startDatum, r.a.eindDatum)} onIntrekken={intrekken} />

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
    if (!start || !tot) { toast.error(heleDagen ? t('kiesPeriode') : t('kiesDag')); return }
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
    toast.success(t('verstuurd'))
    setOpen(false); setStart(''); setEind(''); setToelichting(''); setBerekend(null)
    setHeleDagen(true)
    ververs()
  }

  async function intrekken(a: VerlofAanvraag) {
    const r = await trekVerlofIn(a.id)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(t('ingetrokkenMelding'))
    ververs()
  }

  return (
    <>
      <div style={{ padding: '14px 16px', background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 12, color: '#6b757c' }}>{t('saldo')}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: saldo < 0 ? '#c0392b' : 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
          {t('aantalUur', { uren: `${saldo > 0 ? '+' : ''}${getal(saldo)}` })}
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {komend.length === 0 && (
          <p style={{ textAlign: 'center', color: '#6b757c', padding: '32px 0', fontSize: 14 }}>
            {verleden.length === 0 ? t('geenAanvragen') : t('geenKomend')}
          </p>
        )}
        {komend.map(toonRegel)}

        {verleden.length > 0 && (
          <button type="button" onClick={() => setVerledenOpen(o => !o)} aria-expanded={verledenOpen}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              marginTop: komend.length > 0 ? 8 : 0, padding: '12px 14px', borderRadius: 12,
              border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#6b757c', textAlign: 'left',
            }}>
            <span>{t('verleden', { aantal: verleden.length })}</span>
            <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0, transition: 'transform 150ms', transform: verledenOpen ? 'rotate(180deg)' : 'none' }}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        )}
        {verledenOpen && verleden.map(toonRegel)}
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
          {t('verlofAanvragen')}
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
              {t('verlofAanvragen')}
            </div>

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={labelStijl}>{t('soort')}</label>
                <select value={soortId} onChange={e => setSoortId(e.target.value)} style={veld}>
                  {soorten.map((s, i) => <option key={s.id} value={s.id}>{soortNamen[i]?.tekst ?? s.naam}</option>)}
                </select>
              </div>

              <div>
                <label style={labelStijl}>{t('hoeLang')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => setHeleDagen(true)} style={keuze(heleDagen)}>
                    {t('heleDagen')}
                  </button>
                  <button type="button" onClick={() => setHeleDagen(false)} style={keuze(!heleDagen)}>
                    {t('deelVanDag')}
                  </button>
                </div>
              </div>

              {heleDagen ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={labelStijl}>{t('van')}</label>
                    <input type="date" value={start} onChange={e => setStart(e.target.value)} style={veld} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={labelStijl}>{t('totEnMet')}</label>
                    <input type="date" value={eind} min={start || undefined}
                      onChange={e => setEind(e.target.value)} style={veld} />
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label style={labelStijl}>{t('dag')}</label>
                    <input type="date" value={start} onChange={e => setStart(e.target.value)} style={veld} />
                  </div>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <label style={labelStijl}>{t('vanaf')}</label>
                      <input type="time" value={vanTijd} step={300}
                        onChange={e => setVanTijd(e.target.value)} style={veld} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={labelStijl}>{t('tot')}</label>
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
                      ? t('geenRoosterdagenPeriode')
                      : t('geenRoosterdagDag')
                  ) : !heleDagen ? (
                    vensterUren <= 0 ? (
                      t('eindNaBegin')
                    ) : (
                      <>
                        <strong>{t('aantalUur', { uren: kosten.toLocaleString(locale) })}</strong>
                        {vensterUren > berekend.uren && (
                          <div style={{ marginTop: 4 }}>
                            {t('meerDanWerkdag', { uren: berekend.uren.toLocaleString(locale) })}
                          </div>
                        )}
                      </>
                    )
                  ) : (
                    <>
                      <strong>{t('roosterdagen', { dagen: berekend.dagen, uren: berekend.uren.toLocaleString(locale) })}</strong>
                      {berekend.overgeslagen.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {t('feestdagen', { aantal: berekend.overgeslagen.length })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              <div>
                <label style={labelStijl}>{t('toelichting')}</label>
                <input type="text" value={toelichting} onChange={e => setToelichting(e.target.value)}
                  placeholder={t('toelichtingVoorbeeld')} style={veld} />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18, flexShrink: 0 }}>
              <button type="button" onClick={() => setOpen(false)}
                style={{ ...actieKnop, background: 'transparent', color: '#6b757c', border: '1px solid var(--border)' }}>
                {t('annuleren')}
              </button>
              <button type="button" onClick={verstuur}
                disabled={bezig || !kanVersturen}
                style={{
                  ...actieKnop, background: '#009439', color: '#fff', border: 'none',
                  opacity: bezig || !kanVersturen ? 0.5 : 1,
                }}>
                {bezig ? t('bezig') : t('aanvragen')}
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
