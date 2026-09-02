'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Button, Card, CardBody } from '@/components/ui'
import { useDialogen } from '@/components/ui/dialogen'
import {
  keurWeekGoed, keurRegelsGoed, keurAf, getWeekRegels,
  type TeWeek, type TeRegel,
} from '@/lib/uren/goedkeuring'
import { keurVerlofGoed, wijsVerlofAf, type VerlofAanvraag } from '@/lib/uren/verlof'

/**
 * Twee werklijsten naast elkaar: de weken waar ik teamleider van ben, en de urenregels op mijn
 * eigen dossiers. Een week die in Bouw7 geaccordeerd wordt staat er wel bij, maar zonder knoppen —
 * daar beslist EVA niet over.
 */

const uur = (n: number) => n.toLocaleString('nl-NL', { maximumFractionDigits: 2 })

function datumKort(d: string) {
  const dt = new Date(`${d}T12:00:00`)
  return dt.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
}

export default function GoedkeurenClient({
  weken, regels, verlof, bedrijfsModus,
}: {
  weken: TeWeek[]
  regels: TeRegel[]
  verlof: VerlofAanvraag[]
  bedrijfsModus: 'eva' | 'bouw7'
}) {
  const router = useRouter()
  const [, startT] = useTransition()
  const { vraagTekst } = useDialogen()
  const ververs = () => startT(() => router.refresh())

  const [tab, setTab] = useState<'team' | 'projecten' | 'verlof'>(
    weken.length ? 'team' : regels.length ? 'projecten' : verlof.length ? 'verlof' : 'team',
  )
  const [open, setOpen] = useState<string | null>(null)
  const [detail, setDetail] = useState<Record<string, TeRegel[]>>({})
  const [gekozen, setGekozen] = useState<Set<string>>(new Set())
  const [bezig, setBezig] = useState(false)

  async function klapUit(weekId: string) {
    if (open === weekId) { setOpen(null); return }
    setOpen(weekId)
    if (!detail[weekId]) {
      const r = await getWeekRegels(weekId)
      setDetail(d => ({ ...d, [weekId]: r }))
    }
  }

  async function goedkeurenWeek(w: TeWeek) {
    setBezig(true)
    const r = await keurWeekGoed(w.weekId)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(r.volledig
      ? `Week ${w.weekNr} van ${w.medewerkerNaam} is rond en gaat naar Bouw7.`
      : `Week ${w.weekNr} akkoord. De projectleiders kijken er nog naar.`)
    ververs()
  }

  async function afkeuren(w: TeWeek) {
    const reden = await vraagTekst({
      titel: `Week ${w.weekNr} van ${w.medewerkerNaam} afkeuren`,
      omschrijving: 'De medewerker ziet deze reden bij zijn weekstaat en kan hem daarna aanpassen en opnieuw indienen.',
      placeholder: 'Bijvoorbeeld: dinsdag mist nog uren op het Bijdorplaan-project',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Afkeuren',
    })
    if (!reden?.trim()) return
    setBezig(true)
    const r = await keurAf(w.weekId, reden)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Week afgekeurd en teruggestuurd.')
    ververs()
  }

  async function goedkeurenRegels(ids: string[]) {
    if (!ids.length) { toast.error('Selecteer eerst regels.'); return }
    setBezig(true)
    const r = await keurRegelsGoed(ids)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(r.afgeronde > 0
      ? `Akkoord. ${r.afgeronde} week${r.afgeronde === 1 ? '' : 'en'} is daarmee rond en gaat naar Bouw7.`
      : 'Akkoord.')
    setGekozen(new Set())
    ververs()
  }

  async function verlofGoed(a: VerlofAanvraag) {
    setBezig(true)
    const r = await keurVerlofGoed(a.id)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(r.bouw7
      ? `Verlof van ${a.medewerkerNaam} goedgekeurd en doorgezet naar Bouw7.`
      : `Verlof van ${a.medewerkerNaam} goedgekeurd. Het doorzetten naar Bouw7 lukte niet en wordt automatisch opnieuw geprobeerd.`)
    ververs()
  }

  async function verlofAf(a: VerlofAanvraag) {
    const reden = await vraagTekst({
      titel: `Verlofaanvraag van ${a.medewerkerNaam} afwijzen`,
      omschrijving: 'De medewerker ziet deze reden bij zijn aanvraag.',
      placeholder: 'Bijvoorbeeld: die week staat de oplevering gepland',
      meerregelig: true,
      verplicht: true,
      bevestigLabel: 'Afwijzen',
    })
    if (!reden?.trim()) return
    setBezig(true)
    const r = await wijsVerlofAf(a.id, reden)
    setBezig(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Aanvraag afgewezen.')
    ververs()
  }

  // Regels gegroepeerd per dossier: een projectleider kijkt per project, niet per medewerker.
  const perDossier = new Map<string, TeRegel[]>()
  for (const r of regels) {
    const lijst = perDossier.get(r.dossierLabel) ?? []
    lijst.push(r)
    perDossier.set(r.dossierLabel, lijst)
  }

  const bouw7Weken = weken.filter(w => w.modus === 'bouw7').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {bedrijfsModus === 'bouw7' && (
        <Card>
          <CardBody style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16 }}>ℹ️</span>
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0, lineHeight: 1.5 }}>
              Uren worden op dit moment <strong>in Bouw7</strong> geaccordeerd. Weken die in EVA
              worden ingediend gaan daar meteen naartoe en wachten op je akkoord in Bouw7; EVA leest
              dat terug. Wil je hier accorderen, zet dan de route om in
              Instellingen&nbsp;→&nbsp;Urenverantwoording — dat kan ook per ploeg, om eerst met één
              team proef te draaien.
            </p>
          </CardBody>
        </Card>
      )}

      <div style={{ display: 'flex', gap: 6 }}>
        {([
          ['team', `Mijn team (${weken.length})`],
          ['projecten', `Mijn projecten (${regels.length})`],
          ['verlof', `Verlof (${verlof.length})`],
        ] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            style={{
              padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
              fontFamily: 'var(--font-ui)', fontSize: 13, fontWeight: 700,
              border: `1px solid ${tab === k ? 'var(--fg)' : 'var(--border)'}`,
              background: tab === k ? 'var(--fg)' : 'transparent',
              color: tab === k ? 'var(--bg)' : 'var(--fg-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Mijn team ───────────────────────────────────────────── */}
      {tab === 'team' && (
        <Card>
          <CardBody>
            {weken.length === 0 ? (
              <p style={leeg}>Er staan geen weken op jouw akkoord te wachten.</p>
            ) : (
              <>
                {bouw7Weken > 0 && (
                  <p style={{ ...leeg, marginBottom: 12 }}>
                    {bouw7Weken} van deze {weken.length} week/weken wordt in Bouw7 geaccordeerd en
                    is hier alleen ter informatie.
                  </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {weken.map(w => {
                    const inBouw7 = w.modus === 'bouw7'
                    const wachtOpPl = w.status === 'teamleider_akkoord'
                    return (
                      <div key={w.weekId} style={{ border: '1px solid var(--border)', borderRadius: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px' }}>
                          <button type="button" onClick={() => klapUit(w.weekId)}
                            style={{ ...linkKnop, flex: 1, textAlign: 'left' }}>
                            <strong style={{ fontSize: 13 }}>{w.medewerkerNaam}</strong>
                            <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                              {' '}· week {w.weekNr} · {uur(w.totaalUren)} van {uur(w.contracturen)} uur
                              {' '}· {w.regels} regel{w.regels === 1 ? '' : 's'}
                            </span>
                          </button>

                          {inBouw7 ? (
                            <span style={chip('#0b6bcb', '#e8f1fc')}>wacht op akkoord in Bouw7</span>
                          ) : wachtOpPl ? (
                            <span style={chip('#a15c00', '#fdf3e3')}>
                              {w.openProjectleiders} regel{w.openProjectleiders === 1 ? '' : 's'} bij de projectleider
                            </span>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button variant="ghost" size="sm" disabled={bezig} onClick={() => afkeuren(w)}>
                                Afkeuren
                              </Button>
                              <Button variant="primary" size="sm" disabled={bezig} onClick={() => goedkeurenWeek(w)}>
                                Goedkeuren
                              </Button>
                            </div>
                          )}
                        </div>

                        {open === w.weekId && (
                          <div style={{ borderTop: '1px solid var(--border)', padding: '8px 14px 12px' }}>
                            {!detail[w.weekId] ? (
                              <p style={leeg}>Bezig met ophalen…</p>
                            ) : (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 12 }}>
                                <tbody>
                                  {detail[w.weekId].map(r => (
                                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                      <td style={{ padding: '6px 8px 6px 0', whiteSpace: 'nowrap', color: 'var(--fg-muted)' }}>
                                        {datumKort(r.datum)}
                                      </td>
                                      <td style={{ padding: '6px 8px' }}>{r.uursoortNaam}</td>
                                      <td style={{ padding: '6px 8px', color: 'var(--fg-muted)' }}>
                                        {r.dossierLabel}{r.bewakingscode ? ` · ${r.bewakingscode}` : ''}
                                        {r.afgewekenVanBron && (
                                          <span style={{ color: '#a15c00' }}> · afgeweken van Bouw7</span>
                                        )}
                                      </td>
                                      <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                        {uur(r.uren)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Verlof ──────────────────────────────────────────────── */}
      {tab === 'verlof' && (
        <Card>
          <CardBody>
            {verlof.length === 0 ? (
              <p style={leeg}>Er staan geen verlofaanvragen op jouw akkoord te wachten.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {verlof.map(a => (
                  <div key={a.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    border: '1px solid var(--border)', borderRadius: 10, padding: '11px 14px',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={{ fontFamily: 'var(--font-ui)', fontSize: 13 }}>{a.medewerkerNaam}</strong>
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)' }}>
                        {' '}· {a.uursoortNaam} · {datumKort(a.startDatum)} t/m {datumKort(a.eindDatum)}
                        {' '}· {uur(a.urenTotaal)} uur
                      </span>
                      {a.toelichting && (
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                          {a.toelichting}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button variant="ghost" size="sm" disabled={bezig} onClick={() => verlofAf(a)}>
                        Afwijzen
                      </Button>
                      <Button variant="primary" size="sm" disabled={bezig} onClick={() => verlofGoed(a)}>
                        Goedkeuren
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── Mijn projecten ──────────────────────────────────────── */}
      {tab === 'projecten' && (
        <Card>
          <CardBody>
            {regels.length === 0 ? (
              <p style={leeg}>Er staan geen uren op jouw projecten te wachten.</p>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <Button variant="ghost" size="sm"
                    onClick={() => setGekozen(new Set(regels.map(r => r.id)))}>
                    Alles selecteren
                  </Button>
                  <Button variant="primary" size="sm" disabled={bezig || gekozen.size === 0}
                    onClick={() => goedkeurenRegels([...gekozen])} style={{ marginLeft: 'auto' }}>
                    {gekozen.size} regel{gekozen.size === 1 ? '' : 's'} goedkeuren
                  </Button>
                </div>

                {[...perDossier].map(([dossier, lijst]) => (
                  <div key={dossier} style={{ marginBottom: 16 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
                      fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--fg)',
                    }}>
                      <span style={{ flex: 1 }}>{dossier}</span>
                      <span style={{ color: 'var(--fg-muted)', fontWeight: 600 }}>
                        {uur(lijst.reduce((s, r) => s + r.uren, 0))} uur
                      </span>
                      <Button variant="ghost" size="sm" disabled={bezig}
                        onClick={() => goedkeurenRegels(lijst.map(r => r.id))}>
                        Alles akkoord
                      </Button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-ui)', fontSize: 12 }}>
                      <tbody>
                        {lijst.map(r => (
                          <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px 6px 0', width: 28 }}>
                              <input type="checkbox" checked={gekozen.has(r.id)}
                                onChange={e => setGekozen(s => {
                                  const n = new Set(s)
                                  if (e.target.checked) n.add(r.id); else n.delete(r.id)
                                  return n
                                })} />
                            </td>
                            <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: 'var(--fg-muted)' }}>
                              {datumKort(r.datum)}
                            </td>
                            <td style={{ padding: '6px 8px' }}>{r.medewerkerNaam}</td>
                            <td style={{ padding: '6px 8px', color: 'var(--fg-muted)' }}>
                              {r.uursoortNaam}{r.bewakingscode ? ` · ${r.bewakingscode}` : ''}
                              {r.opmerking ? ` · ${r.opmerking}` : ''}
                            </td>
                            <td style={{ padding: '6px 0 6px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                              {uur(r.uren)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

const leeg: React.CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--fg-muted)', margin: 0,
}

const linkKnop: React.CSSProperties = {
  border: 'none', background: 'transparent', cursor: 'pointer',
  fontFamily: 'var(--font-ui)', color: 'var(--fg)', padding: 0,
}

const chip = (kleur: string, achtergrond: string): React.CSSProperties => ({
  padding: '4px 9px', borderRadius: 999, fontFamily: 'var(--font-ui)',
  fontSize: 11, fontWeight: 700, color: kleur, background: achtergrond, whiteSpace: 'nowrap',
})
