'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
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

function dagLabel(datum: string, locale: string) {
  const d = new Date(`${datum}T12:00:00`)
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'numeric' }).format(d)
}

function verschuif(datum: string, dagen: number) {
  const d = new Date(`${datum}T12:00:00`)
  d.setDate(d.getDate() + dagen)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const MARKERING: Record<Markering, {
  sleutel: 'nogOpen' | 'handmatigUitgeklokt' | 'geenBewakingscode' | 'gesimuleerd'
  kleur: string
}> = {
  nog_open: { sleutel: 'nogOpen', kleur: ROOD },
  handmatig_uitgeklokt: { sleutel: 'handmatigUitgeklokt', kleur: AMBER },
  geen_bewakingscode: { sleutel: 'geenBewakingscode', kleur: AMBER },
  gesimuleerd: { sleutel: 'gesimuleerd', kleur: GRIJS },
}

const WIJZEN = ['locatie', 'wissel', 'handmatig'] as const
const isWijze = (w: string): w is (typeof WIJZEN)[number] => (WIJZEN as readonly string[]).includes(w)

export default function PrikklokWeekClient({ week }: { week: PrikklokWeek }) {
  const t = useTranslations('prikklok')
  const locale = useDatumLocale()
  const uur = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 })
  const router = useRouter()
  const [codeVoor, setCodeVoor] = useState<PrikklokRegel | null>(null)
  const schaduw = week.fase === 'schaduw'
  const verschil = week.totaalPrikklok - week.totaalUrenstaat
  const totaalPrikklok = t.rich('week.totaalPrikklok', {
    uren: uur(week.totaalPrikklok),
    klein: (c) => <span style={{ fontSize: 16, fontWeight: 600, color: GRIJS }}>{c}</span>,
  })

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
        padding: '8px 12px', flexShrink: 0, background: OPPERVLAK, borderBottom: `1px solid ${RAND}`,
      }}>
        <Link href={`/m/prikklok/week?week=${verschuif(week.weekStart, -7)}`} style={navKnop} aria-label={t('week.vorigeWeek')}>←</Link>
        <div style={{ fontSize: 14, fontWeight: 700, color: TEKST }}>{t('week.weekNummer', { nummer: week.weekNr })}</div>
        <Link href={`/m/prikklok/week?week=${verschuif(week.weekStart, 7)}`} style={navKnop} aria-label={t('week.volgendeWeek')}>→</Link>
      </div>

      {/* ── Kop ─────────────────────────────────────────────────── */}
      <div style={{ padding: '16px 16px 12px', background: OPPERVLAK, borderBottom: `1px solid ${RAND}`, flexShrink: 0 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: TEKST, fontVariantNumeric: 'tabular-nums' }}>
          {totaalPrikklok}
        </div>
        {schaduw && (
          <div style={{ fontSize: 13, color: GRIJS, marginTop: 4 }}>
            {t('week.inUrenstaatTotaal', { uren: uur(week.totaalUrenstaat) })}
            {Math.abs(verschil) >= 0.01 && (
              <strong style={{ color: AMBER }}>
                {` · ${t('week.verschil', { verschil: `${verschil > 0 ? '+' : ''}${uur(verschil)}` })}`}
              </strong>
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
            ? t('week.openPunten', { aantal: week.openPunten })
            : t('week.allesCompleet')}
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
                <span style={{ fontSize: 14, fontWeight: 700, color: TEKST, textTransform: 'capitalize' }}>{dagLabel(dag.datum, locale)}</span>
                <span style={{ fontSize: 13, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
                  {dag.prikklok ? t('week.urenKort', { uren: uur(dag.prikklok.uren) }) : '—'}
                  {dag.prikklok && dag.prikklok.pauzeMinuten > 0 && ` · ${t('week.pauzeMin', { minuten: String(dag.prikklok.pauzeMinuten) })}`}
                </span>
              </div>

              {!dag.prikklok && (
                <div style={{ padding: '10px 16px', fontSize: 13, color: GRIJS }}>{t('week.nietIngeklokt')}</div>
              )}

              {dag.prikklok?.regels.map(r => (
                <div key={r.sessieIds.join('-')} style={{ padding: '10px 16px', borderBottom: `1px solid ${RAND}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: TEKST, minWidth: 0 }}>{r.dossier_label}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: TEKST, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {t('week.urenKort', { uren: uur(r.uren) })}
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
                    {r.bewakingscode ? t('week.code', { code: r.bewakingscode }) : t('week.bewakingscodeKiezen')}
                  </button>
                  {r.markeringen.filter(m => m !== 'geen_bewakingscode').length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                      {r.markeringen.filter(m => m !== 'geen_bewakingscode').map(m => (
                        <span key={m} style={{
                          fontSize: 11, fontWeight: 700, color: MARKERING[m].kleur,
                          border: `1px solid ${MARKERING[m].kleur}`, borderRadius: 999, padding: '2px 8px',
                        }}>
                          {t(`week.markering.${MARKERING[m].sleutel}`)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {dag.sessies.length > 0 && (
                <details style={{ padding: '8px 16px', borderBottom: schaduw ? `1px solid ${RAND}` : undefined }}>
                  <summary style={{ fontSize: 12, color: GRIJS, cursor: 'pointer' }}>{t('week.inUitkloktijden')}</summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                    {dag.sessies.map(s => (
                      <div key={s.id} style={{ fontSize: 12, color: GRIJS, fontVariantNumeric: 'tabular-nums' }}>
                        {s.in_tijd} – {s.uit_tijd ?? '…'} · {s.dossier_label}
                        {s.uit_wijze && ` · ${isWijze(s.uit_wijze) ? t(`wijze.${s.uit_wijze}`) : s.uit_wijze}`}
                        {s.uit_wijze === 'handmatig' && s.uit_afstand_m != null && ` ${t('afstandVanWerk', { meter: String(Math.round(s.uit_afstand_m)) })}`}
                      </div>
                    ))}
                  </div>
                </details>
              )}

              {schaduw && (
                <div style={{ padding: '8px 16px 10px', background: VLAK }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: GRIJS }}>
                    <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: 10.5 }}>{t('week.inJeUrenstaat')}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {t('week.urenKort', { uren: uur(dag.urenstaatTotaal) })}
                      {dag.prikklok && Math.abs(dagVerschil) >= 0.01 && (
                        <strong style={{ color: AMBER }}> ({dagVerschil > 0 ? '+' : ''}{uur(dagVerschil)})</strong>
                      )}
                    </span>
                  </div>
                  {dag.urenstaat.map((u, i) => (
                    <div key={i} style={{ fontSize: 12, color: GRIJS, marginTop: 2 }}>
                      {t('week.urenKort', { uren: uur(u.uren) })} · {u.label}{u.bewakingscode ? ` · ${u.bewakingscode}` : ''}
                      {u.uursoort && <>{' · '}<VertaalbareTekst tekst={u.uursoort} label={false} /></>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ fontSize: 13, color: GRIJS, lineHeight: 1.5, padding: '4px 4px 0' }}>
          {schaduw
            ? t('week.voetSchaduw')
            : t('week.voetNormaal')}
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
  const t = useTranslations('prikklok')
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
    <BottomSheet titel={t('week.bewakingscode')} onSluit={onSluit}>
      <div style={{ fontSize: 13, color: GRIJS }}>{regel.dossier_label}</div>
      {codes === null && <div style={{ fontSize: 14, color: GRIJS }}>{t('week.codesLaden')}</div>}
      {codes?.length === 0 && (
        <div style={{ fontSize: 14, color: GRIJS }}>{t('week.geenCodes')}</div>
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
