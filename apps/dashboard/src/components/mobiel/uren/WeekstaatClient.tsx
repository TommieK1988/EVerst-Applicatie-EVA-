'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { useTranslations } from 'next-intl'
import { useDatumLocale } from '@/i18n/client'
import VertaalbareTekst from '@/components/vertalen/VertaalbareTekst'
import type { Weekstaat, WeekRegel, UursoortOptie, RegelInvoer } from '@/lib/uren/weekstaat'
import { voegRegelToe, wijzigRegel, verwijderRegel, dienWeekIn } from '@/lib/uren/weekstaat'
import { verwijderOnkosten } from '@/lib/uren/onkosten-acties'
import { OVERUREN_BRON } from '@/lib/uren/rekenregel'
import RegelSheet from './RegelSheet'
import OnkostenSheet from './OnkostenSheet'

/**
 * De mobiele weekstaat: per dag een kaart met regels, een voortgangskop en één knop Indienen.
 *
 * Bewust dagkaarten en geen 7×N-raster — een breed grid is op een telefoon onwerkbaar. De
 * medewerker scrollt door zijn week zoals hij hem beleefd heeft: dag voor dag.
 */

/** "maandag 8 september" in de taal van de app. */
function dagLabel(datum: string, locale: string) {
  return new Date(`${datum}T12:00:00`)
    .toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })
}

type StatusSleutel = 'concept' | 'ingediend' | 'teamleider_akkoord' | 'goedgekeurd' | 'afgekeurd'

/** Kleuren per weekstatus; de tekst staat in `uren.weekstaat.status.*`. */
const STATUS_KLEUR: Record<StatusSleutel, { kleur: string; achtergrond: string }> = {
  concept: { kleur: '#6b757c', achtergrond: '#f1f3f4' },
  ingediend: { kleur: '#0b6bcb', achtergrond: '#e8f1fc' },
  teamleider_akkoord: { kleur: '#0b6bcb', achtergrond: '#e8f1fc' },
  goedgekeurd: { kleur: '#009439', achtergrond: '#e6f5ec' },
  afgekeurd: { kleur: '#c0392b', achtergrond: '#fdecea' },
}

export default function WeekstaatClient({
  staat, uursoorten, vandaag,
}: {
  staat: Weekstaat
  uursoorten: UursoortOptie[]
  vandaag: string
}) {
  const t = useTranslations('uren')
  const locale = useDatumLocale()
  const uur = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 })
  const euro = (n: number) => `€ ${n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  const [sheet, setSheet] = useState<{ datum: string; regel: WeekRegel | null } | null>(null)
  const [kostenSheet, setKostenSheet] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  const statusSleutel: StatusSleutel = staat.status in STATUS_KLEUR ? staat.status as StatusSleutel : 'concept'
  const status = STATUS_KLEUR[statusSleutel]
  // De overuren die EVA als min-regel tijd voor tijd heeft neergezet (zie lib/uren/overuren.ts).
  const overuren = -staat.regels
    .filter(r => r.bron === OVERUREN_BRON)
    .reduce((s, r) => s + r.uren, 0)
  const voortgang = staat.contracturen > 0
    ? Math.min(100, (staat.totaalUren / staat.contracturen) * 100)
    : 0

  async function bewaarRegel(invoer: RegelInvoer) {
    const r = sheet?.regel
      ? await wijzigRegel(sheet.regel.id, invoer)
      : await voegRegelToe(staat.weekId, invoer)
    if (r.ok) ververs()
    return r
  }

  async function verwijderKosten(id: string) {
    const r = await verwijderOnkosten(id)
    if (!r.ok) { toast.error(r.error); return }
    ververs()
  }

  async function verwijder(regel: WeekRegel) {
    const r = await verwijderRegel(regel.id)
    if (!r.ok) { toast.error(r.error); return }
    ververs()
  }

  async function indienen() {
    setBezig(true)
    const r = await dienWeekIn(staat.weekId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(
      staat.saldoMutatie > 0
        ? t('weekstaat.ingediendMetSaldo', { uren: uur(staat.saldoMutatie) })
        : t('weekstaat.ingediend'),
    )
    ververs()
  }

  return (
    <>
      {/* ── Kop: voortgang tegen de norm ────────────────────────── */}
      <div style={{ padding: '16px 16px 12px', background: 'var(--bg-elev)', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fg)', fontVariantNumeric: 'tabular-nums' }}>
            {uur(staat.totaalUren)}
            {/* Een extern heeft geen norm en geen saldo: alleen wat hij gewerkt heeft telt. */}
            {!staat.extern && (
              <span style={{ fontSize: 16, fontWeight: 600, color: '#6b757c' }}>{t('weekstaat.vanNorm', { uren: uur(staat.contracturen) })}</span>
            )}
          </div>
          {!staat.extern && <div style={{ fontSize: 12, color: '#6b757c', textAlign: 'right' }}>
            {t('weekstaat.saldo')}<br />
            <strong style={{ fontSize: 15, color: staat.saldoNu < 0 ? '#c0392b' : 'var(--fg)' }}>
              {t('eenheid.urenKort', { uren: `${staat.saldoNu > 0 ? '+' : ''}${uur(staat.saldoNu)}` })}
            </strong>
          </div>}
        </div>

        {staat.extern ? <div style={{ height: 10 }} /> : (
          <div style={{ height: 6, borderRadius: 3, background: '#e8ebed', margin: '10px 0 10px', overflow: 'hidden' }}>
            <div style={{
              width: `${voortgang}%`, height: '100%',
              background: staat.tekort > 0 ? '#e0a800' : '#009439',
              transition: 'width 160ms ease',
            }} />
          </div>
        )}

        <div style={{
          display: 'inline-block', padding: '4px 10px', borderRadius: 999,
          fontSize: 11, fontWeight: 700, color: status.kleur, background: status.achtergrond,
        }}>
          {t(`weekstaat.status.${statusSleutel}`)}
        </div>

        {staat.status === 'afgekeurd' && staat.afkeurReden && (
          <p style={{ fontSize: 13, color: '#c0392b', margin: '10px 0 0', lineHeight: 1.45 }}>
            <strong>{t('weekstaat.reden')}</strong>{' '}
            <VertaalbareTekst tekst={staat.afkeurReden} />
          </p>
        )}
      </div>

      {/* ── Dagkaarten ──────────────────────────────────────────── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Uitleg bij de min-regel: zonder dit lijkt het alsof er uren worden afgepakt. */}
        {overuren > 0 && (
          <div style={{
            padding: '12px 14px', borderRadius: 12, background: '#e8f1fc',
            border: '1px solid #c7ddf6', color: '#0b4f96', fontSize: 13, lineHeight: 1.5,
          }}>
            <strong style={{ display: 'block', marginBottom: 2 }}>
              {t('weekstaat.overurenTitel', { uren: uur(overuren) })}
            </strong>
            {t('weekstaat.overurenUitleg', { uren: uur(overuren) })}
          </div>
        )}
        {staat.dagen.map(datum => {
          const regels = staat.regels.filter(r => r.datum === datum)
          const dagKosten = staat.onkosten.filter(k => k.datum === datum)
          const dagTotaal = regels.reduce((s, r) => s + r.uren, 0)
          const isVandaag = datum === vandaag

          // Lege weekenddagen tonen we niet: die vullen het scherm zonder iets te zeggen.
          const isWeekend = [6, 7].includes(new Date(`${datum}T12:00:00`).getDay() || 7)
          if (isWeekend && regels.length === 0 && dagKosten.length === 0 && !staat.bewerkbaar) return null

          return (
            <div key={datum} style={{
              border: `1px solid ${isVandaag ? '#009439' : 'var(--border)'}`,
              borderRadius: 12, background: 'var(--bg-elev)', overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 14px', borderBottom: regels.length ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
                  {isVandaag ? t('weekstaat.vandaag') : dagLabel(datum, locale)}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: dagTotaal > 0 ? 'var(--fg)' : '#b3bcc2',
                }}>
                  {dagTotaal > 0 ? t('eenheid.urenKort', { uren: uur(dagTotaal) }) : '—'}
                </span>
              </div>

              {regels.map(r => { const auto = r.bron === OVERUREN_BRON; return (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '11px 14px', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                      <VertaalbareTekst tekst={r.uursoort_naam} label={false} />
                      {r.bron !== 'eva' && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#0b6bcb', marginLeft: 6 }}>
                          {r.afgeweken_van_bron ? t('weekstaat.aangepast') : t('weekstaat.automatisch')}
                        </span>
                      )}
                    </div>
                    {r.categorie === 'werk' && (
                      <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.dossier_label ?? t('weekstaat.geenProject')}{r.bewakingscode ? ` · ${r.bewakingscode}` : ''}
                      </div>
                    )}
                    {/* De opmerking van de automatische regel is Nederlands voor Bouw7; de monteur
                        krijgt hem in de taal van de app. */}
                    {auto ? (
                      <div style={{ fontSize: 12, color: '#0b6bcb', marginTop: 2 }}>{t('weekstaat.overurenRegel')}</div>
                    ) : r.opmerking && (
                      <div style={{ fontSize: 12, color: '#8a949a', marginTop: 2 }}>{r.opmerking}</div>
                    )}
                    {r.gewijzigd_door_goedkeurder && (
                      <div style={{ fontSize: 11, color: '#a15c00', marginTop: 3 }}>
                        {t('weekstaat.aangepastDoorGoedkeurder')}
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--fg)' }}>
                    {uur(r.uren)}
                  </span>

                  {staat.bewerkbaar && !auto && (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button type="button" onClick={() => setSheet({ datum, regel: r })}
                        // eslint-disable-next-line i18next/no-literal-string -- potlood-pictogram, geen tekst
                        aria-label={t('weekstaat.aanpassen')} style={rijKnop}>✎</button>
                      <button type="button" onClick={() => verwijder(r)}
                        aria-label={t('weekstaat.verwijderen')} style={{ ...rijKnop, color: '#c0392b' }}>×</button>
                    </div>
                  )}
                </div>
              ) })}

              {dagKosten.map(k => (
                <div key={k.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', borderTop: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.015)',
                }}>
                  {k.bon_url && (
                    <a href={k.bon_url} target="_blank" rel="noreferrer" style={{ flexShrink: 0, lineHeight: 0 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={k.bon_url} alt={t('weekstaat.bonnetje')} style={{
                        width: 30, height: 30, objectFit: 'cover',
                        borderRadius: 6, border: '1px solid var(--border)',
                      }} />
                    </a>
                  )}
                  <span style={{ fontSize: 13, color: 'var(--fg)', flex: 1, minWidth: 0 }}>
                    {t(`onkosten.label.${k.soort}`)}
                    {k.vervoermiddel ? ` · ${t(`onkosten.vervoer.${k.vervoermiddel}`)}` : ''}
                    {k.km ? ` · ${t('weekstaat.km', { km: k.km.toLocaleString(locale) })}` : ''}
                    {k.omschrijving ? ` · ${k.omschrijving}` : ''}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {euro(k.bedrag)}
                  </span>
                  {staat.bewerkbaar && (
                    <button type="button" onClick={() => verwijderKosten(k.id)}
                      aria-label={t('weekstaat.kostenVerwijderen')} style={{ ...rijKnop, color: '#c0392b' }}>×</button>
                  )}
                </div>
              ))}

              {staat.bewerkbaar && (
                <div style={{ display: 'flex', borderTop: dagKosten.length ? '1px solid var(--border)' : 'none' }}>
                  <button type="button" onClick={() => setSheet({ datum, regel: null })}
                    style={{
                      flex: 1, padding: '11px 14px', border: 'none', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#009439',
                      cursor: 'pointer', textAlign: 'left',
                    }}>
                    {t('weekstaat.urenToevoegen')}
                  </button>
                  <button type="button" onClick={() => setKostenSheet(datum)}
                    style={{
                      padding: '11px 14px', border: 'none', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#6b757c',
                      cursor: 'pointer',
                    }}>
                    {t('weekstaat.kostenToevoegen')}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Indienen ────────────────────────────────────────────── */}
      {staat.bewerkbaar && (
        <div style={{
          position: 'sticky', bottom: 0, marginTop: 'auto', flexShrink: 0,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
          background: 'var(--neutral-0, #fff)', borderTop: '1px solid var(--border)',
        }}>
          {staat.blokkade && (
            <p style={{ fontSize: 12, color: '#a15c00', margin: '0 0 8px', textAlign: 'center' }}>
              {staat.blokkade}
            </p>
          )}
          {!staat.blokkade && staat.saldoMutatie > 0 && (
            <p style={{ fontSize: 12, color: '#009439', margin: '0 0 8px', textAlign: 'center' }}>
              {t('weekstaat.naarSaldo', { uren: uur(staat.saldoMutatie) })}
            </p>
          )}
          <button type="button" onClick={indienen} disabled={!staat.magIndienen || bezig}
            style={{
              width: '100%', padding: '15px 0', borderRadius: 12, border: 'none',
              fontFamily: 'inherit', fontSize: 16, fontWeight: 700, cursor: staat.magIndienen ? 'pointer' : 'default',
              background: staat.magIndienen ? '#009439' : '#e8ebed',
              color: staat.magIndienen ? '#fff' : '#9aa4ab',
              opacity: bezig ? 0.6 : 1,
            }}>
            {bezig ? t('knop.bezig') : t('weekstaat.weekIndienen')}
          </button>
        </div>
      )}

      {kostenSheet && (
        <OnkostenSheet
          weekId={staat.weekId}
          datum={kostenSheet}
          kmTarieven={staat.kmTarieven}
          onSluit={() => setKostenSheet(null)}
          onKlaar={ververs}
        />
      )}

      {sheet && (
        <RegelSheet
          datum={sheet.datum}
          regel={sheet.regel}
          uursoorten={uursoorten}
          kantoor={staat.kantoor}
          onSluit={() => setSheet(null)}
          onBewaar={bewaarRegel}
        />
      )}
    </>
  )
}

const rijKnop: React.CSSProperties = {
  width: 30, height: 30, padding: 0, border: 'none', background: 'transparent',
  cursor: 'pointer', color: '#6b757c', fontSize: 16, lineHeight: 1, flexShrink: 0,
}
