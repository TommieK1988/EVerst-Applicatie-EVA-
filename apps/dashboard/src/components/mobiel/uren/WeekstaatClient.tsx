'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import type { Weekstaat, WeekRegel, UursoortOptie, RegelInvoer } from '@/lib/uren/weekstaat'
import { voegRegelToe, wijzigRegel, verwijderRegel, verwijderOnkosten, dienWeekIn } from '@/lib/uren/weekstaat'
import RegelSheet from './RegelSheet'
import OnkostenSheet from './OnkostenSheet'

/**
 * De mobiele weekstaat: per dag een kaart met regels, een voortgangskop en één knop Indienen.
 *
 * Bewust dagkaarten en geen 7×N-raster — een breed grid is op een telefoon onwerkbaar. De
 * medewerker scrollt door zijn week zoals hij hem beleefd heeft: dag voor dag.
 */

const DAGNAMEN = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

function dagLabel(datum: string, vandaag: string) {
  if (datum === vandaag) return 'Vandaag'
  const d = new Date(`${datum}T12:00:00`)
  const isoDag = d.getDay() === 0 ? 6 : d.getDay() - 1
  return `${DAGNAMEN[isoDag]} ${d.getDate()} ${MAANDEN[d.getMonth()]}`
}

const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })
const euro = (n: number) => `€ ${n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const KOSTEN_LABEL: Record<string, string> = {
  parkeren: 'Parkeren', reiskosten: 'Reiskosten', overig: 'Overige kosten',
}

const STATUS_TEKST: Record<string, { label: string; kleur: string; achtergrond: string }> = {
  concept: { label: 'Nog niet ingediend', kleur: '#6b757c', achtergrond: '#f1f3f4' },
  ingediend: { label: 'Ingediend — wacht op je teamleider', kleur: '#0b6bcb', achtergrond: '#e8f1fc' },
  teamleider_akkoord: { label: 'Teamleider akkoord — wacht op de projectleiders', kleur: '#0b6bcb', achtergrond: '#e8f1fc' },
  goedgekeurd: { label: 'Goedgekeurd', kleur: '#009439', achtergrond: '#e6f5ec' },
  afgekeurd: { label: 'Afgekeurd — pas je week aan en dien opnieuw in', kleur: '#c0392b', achtergrond: '#fdecea' },
}

export default function WeekstaatClient({
  staat, uursoorten, vandaag,
}: {
  staat: Weekstaat
  uursoorten: UursoortOptie[]
  vandaag: string
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const ververs = () => startT(() => router.refresh())

  const [sheet, setSheet] = useState<{ datum: string; regel: WeekRegel | null } | null>(null)
  const [kostenSheet, setKostenSheet] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  const status = STATUS_TEKST[staat.status] ?? STATUS_TEKST.concept
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
        ? `Week ingediend. ${uur(staat.saldoMutatie)} uur naar je tijd-voor-tijdsaldo.`
        : 'Week ingediend.',
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
            <span style={{ fontSize: 16, fontWeight: 600, color: '#6b757c' }}> / {uur(staat.contracturen)} uur</span>
          </div>
          <div style={{ fontSize: 12, color: '#6b757c', textAlign: 'right' }}>
            saldo<br />
            <strong style={{ fontSize: 15, color: staat.saldoNu < 0 ? '#c0392b' : 'var(--fg)' }}>
              {staat.saldoNu > 0 ? '+' : ''}{uur(staat.saldoNu)} u
            </strong>
          </div>
        </div>

        <div style={{ height: 6, borderRadius: 3, background: '#e8ebed', margin: '10px 0 10px', overflow: 'hidden' }}>
          <div style={{
            width: `${voortgang}%`, height: '100%',
            background: staat.tekort > 0 ? '#e0a800' : '#009439',
            transition: 'width 160ms ease',
          }} />
        </div>

        <div style={{
          display: 'inline-block', padding: '4px 10px', borderRadius: 999,
          fontSize: 11, fontWeight: 700, color: status.kleur, background: status.achtergrond,
        }}>
          {status.label}
        </div>

        {staat.status === 'afgekeurd' && staat.afkeurReden && (
          <p style={{ fontSize: 13, color: '#c0392b', margin: '10px 0 0', lineHeight: 1.45 }}>
            <strong>Reden:</strong> {staat.afkeurReden}
          </p>
        )}
      </div>

      {/* ── Dagkaarten ──────────────────────────────────────────── */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                  {dagLabel(datum, vandaag)}
                </span>
                <span style={{
                  fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                  color: dagTotaal > 0 ? 'var(--fg)' : '#b3bcc2',
                }}>
                  {dagTotaal > 0 ? `${uur(dagTotaal)} u` : '—'}
                </span>
              </div>

              {regels.map(r => (
                <div key={r.id} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '11px 14px', borderBottom: '1px solid var(--border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>
                      {r.uursoort_naam}
                      {r.bron !== 'eva' && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#0b6bcb', marginLeft: 6 }}>
                          {r.afgeweken_van_bron ? 'aangepast' : 'automatisch'}
                        </span>
                      )}
                    </div>
                    {r.categorie === 'werk' && (
                      <div style={{ fontSize: 12, color: '#6b757c', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.dossier_label ?? 'geen project'}{r.bewakingscode ? ` · ${r.bewakingscode}` : ''}
                      </div>
                    )}
                    {r.opmerking && (
                      <div style={{ fontSize: 12, color: '#8a949a', marginTop: 2 }}>{r.opmerking}</div>
                    )}
                    {r.gewijzigd_door_goedkeurder && (
                      <div style={{ fontSize: 11, color: '#a15c00', marginTop: 3 }}>
                        Aangepast door je goedkeurder
                      </div>
                    )}
                  </div>

                  <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'var(--fg)' }}>
                    {uur(r.uren)}
                  </span>

                  {staat.bewerkbaar && (
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button type="button" onClick={() => setSheet({ datum, regel: r })}
                        aria-label="Aanpassen" style={rijKnop}>✎</button>
                      <button type="button" onClick={() => verwijder(r)}
                        aria-label="Verwijderen" style={{ ...rijKnop, color: '#c0392b' }}>×</button>
                    </div>
                  )}
                </div>
              ))}

              {dagKosten.map(k => (
                <div key={k.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 14px', borderTop: '1px solid var(--border)',
                  background: 'rgba(0,0,0,0.015)',
                }}>
                  <span style={{ fontSize: 13, color: 'var(--fg)', flex: 1, minWidth: 0 }}>
                    {KOSTEN_LABEL[k.soort]}
                    {k.km ? ` · ${k.km.toLocaleString('nl-NL')} km` : ''}
                    {k.omschrijving ? ` · ${k.omschrijving}` : ''}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {euro(k.bedrag)}
                  </span>
                  {staat.bewerkbaar && (
                    <button type="button" onClick={() => verwijderKosten(k.id)}
                      aria-label="Kosten verwijderen" style={{ ...rijKnop, color: '#c0392b' }}>×</button>
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
                    + Uren toevoegen
                  </button>
                  <button type="button" onClick={() => setKostenSheet(datum)}
                    style={{
                      padding: '11px 14px', border: 'none', background: 'transparent',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 700, color: '#6b757c',
                      cursor: 'pointer',
                    }}>
                    + Kosten
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
              +{uur(staat.saldoMutatie)} uur naar je tijd-voor-tijdsaldo
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
            {bezig ? 'Bezig…' : 'Week indienen'}
          </button>
        </div>
      )}

      {kostenSheet && (
        <OnkostenSheet
          weekId={staat.weekId}
          datum={kostenSheet}
          onSluit={() => setKostenSheet(null)}
          onKlaar={ververs}
        />
      )}

      {sheet && (
        <RegelSheet
          datum={sheet.datum}
          regel={sheet.regel}
          uursoorten={uursoorten}
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
