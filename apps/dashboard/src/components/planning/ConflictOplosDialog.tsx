'use client'

import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { AlertTriangle, ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import { useMemo, useState, useTransition } from 'react'
import toast from 'react-hot-toast'

import type { Medewerker, MedewerkerRooster } from '@everts/database/platform-types'
import { verplaatsPlanningItem } from '@/app/(platform)/planning/actions'
import { crewKleur } from '@/lib/utils/crew'
import {
  DAG_MS, berekenConflicten, buitenRooster, clusterVoorConflict, vindVrijMoment,
  type BlokInterval, type ConflictDetail, type EntryMetDossier, type WerkInterval,
} from './conflict'
import { verschuifTs } from './layout/index'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

const STRIP_H = 30

type Wijziging = { id: string; start_dt: string; eind_dt: string }

type Props = {
  medewerker:     Medewerker
  conflict:       ConflictDetail
  /** Alle conflictsegmenten van deze medewerker (voor de cluster-bepaling). */
  conflicten:     ConflictDetail[]
  /** Alle (zichtbare) planitems van deze medewerker. */
  entriesRij:     EntryMetDossier[]
  blokken:        BlokInterval[]
  roosters:       MedewerkerRooster[]
  dossierMap:     Record<string, string>
  projectleiders: Record<string, { kleur: string | null; naam: string | null }>
  /** Zichtbare periode van de timeline — voor de "verschoven naar …"-melding. */
  zichtbaar:      { van: number; tot: number }
  /** Succesvol opgeslagen wijzigingen (kan een deel zijn bij een fout halverwege). */
  onApplied:      (wijzigingen: Wijziging[]) => void
  onClose:        () => void
}

export default function ConflictOplosDialog({
  medewerker, conflict, conflicten, entriesRij, blokken, roosters,
  dossierMap, projectleiders, zichtbaar, onApplied, onClose,
}: Props) {
  const [isPending, startTransition] = useTransition()
  // Draft: alleen afwijkingen t.o.v. het origineel; opslaan gebeurt pas bij "Toepassen".
  const [draft, setDraft] = useState<Record<string, { start_dt: string; eind_dt: string }>>({})

  const cluster    = useMemo(() => clusterVoorConflict(conflict, conflicten), [conflict, conflicten])
  const clusterIds = useMemo(() => new Set(cluster.map(e => e.id)), [cluster])

  const draftEntries = useMemo(
    () => entriesRij.map(e => (draft[e.id] ? { ...e, ...draft[e.id] } : e)),
    [entriesRij, draft],
  )

  const naarWork = (list: EntryMetDossier[]): WerkInterval[] =>
    list.map(e => ({ s: parseISO(e.start_dt).getTime(), e: parseISO(e.eind_dt).getTime(), entry: e }))

  const draftConflicten = useMemo(
    () => berekenConflicten(naarWork(draftEntries), blokken),
    [draftEntries, blokken],
  )

  const raaktCluster = (c: ConflictDetail) =>
    clusterIds.has(c.a.id) || (c.soort === 'overlap' && clusterIds.has(c.b.id))

  const resterend = draftConflicten.filter(raaktCluster)
  const opgelost  = resterend.length === 0
  const aantalWijzigingen = Object.keys(draft).length

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const titelVan = (e: EntryMetDossier) => {
    const dossier = dossierMap[e.dossier_id ?? ''] ?? 'Onbekend dossier'
    const taak    = e.planning_activiteiten?.titel
    return taak && taak !== dossier ? `${dossier} — ${taak}` : dossier
  }
  const korteNaam = (e: EntryMetDossier) =>
    dossierMap[e.dossier_id ?? ''] ?? e.planning_activiteiten?.titel ?? 'planitem'
  const kleurVan = (e: EntryMetDossier) => {
    const pl = projectleiders[e.dossier_id ?? '']
    return pl?.kleur ?? crewKleur(pl?.naam ?? dossierMap[e.dossier_id ?? ''] ?? '—')
  }
  const fmt     = (ms: number) => format(new Date(ms), 'EEE d MMM HH:mm', { locale: nl })
  const fmtKort = (d: Date)    => format(d, 'EEE d MMM HH:mm', { locale: nl })

  const draftVan = (id: string) => draftEntries.find(e => e.id === id)!

  function zetDraft(id: string, start: Date, eind: Date) {
    setDraft(prev => ({ ...prev, [id]: { start_dt: start.toISOString(), eind_dt: eind.toISOString() } }))
  }

  // ─── Snelle oplossingen ─────────────────────────────────────────────────────

  type Voorstel = {
    key:     string
    label:   string
    doel:    { start: Date; eind: Date } | null
    moverId: string
  }

  const voorstellen = useMemo<Voorstel[]>(() => {
    const maakVoorstel = (key: string, label: string, mover: EntryMetDossier, vanafMs: number): Voorstel => {
      const d      = draftVan(mover.id)
      const duurMs = parseISO(d.eind_dt).getTime() - parseISO(d.start_dt).getTime()
      const doel = vindVrijMoment({
        duurMs,
        vanafMs,
        tijdVanDagVan: parseISO(d.start_dt),
        andereWerk: naarWork(draftEntries.filter(e => e.id !== mover.id)),
        blokken,
        roosters,
      })
      return { key, label, doel, moverId: mover.id }
    }
    // Vanaf de dag ná `ms`, op het tijdstip-van-de-dag van het te verschuiven item.
    const dagNa = (ms: number, mover: EntryMetDossier): number => {
      const t = parseISO(draftVan(mover.id).start_dt)
      const d = addDays(startOfDay(new Date(ms - 1)), 1)
      d.setHours(t.getHours(), t.getMinutes(), 0, 0)
      return d.getTime()
    }

    const lijst: Voorstel[] = []
    if (conflict.soort === 'overlap') {
      const a = draftVan(conflict.a.id)
      const b = draftVan(conflict.b.id)
      lijst.push(
        maakVoorstel('b-na-a', `Plan “${korteNaam(b)}” ná “${korteNaam(a)}”`, b, parseISO(a.eind_dt).getTime()),
        maakVoorstel('a-na-b', `Plan “${korteNaam(a)}” ná “${korteNaam(b)}”`, a, parseISO(b.eind_dt).getTime()),
        maakVoorstel('b-vrij', `“${korteNaam(b)}” naar eerstvolgend vrij moment`, b, dagNa(conflict.e, b)),
      )
      // Bouw7-items liever laten staan: opties die een EVA-item verschuiven bovenaan.
      lijst.sort((x, y) => {
        const bron = (id: string) => (entriesRij.find(e => e.id === id)?.bron === 'bouw7' ? 1 : 0)
        return bron(x.moverId) - bron(y.moverId)
      })
    } else {
      lijst.push(
        maakVoorstel('na-blok', 'Verplaats naar eerstvolgende werkbare dag', draftVan(conflict.a.id), dagNa(conflict.e, conflict.a)),
      )
    }
    return lijst
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conflict, draftEntries, blokken, roosters, entriesRij])

  // ─── Mini-tijdlijn (Nu / Na wijziging) ──────────────────────────────────────

  const venster = useMemo(() => {
    let min = Infinity, max = -Infinity
    for (const e of cluster) {
      const d = draftVan(e.id)
      min = Math.min(min, parseISO(e.start_dt).getTime(), parseISO(d.start_dt).getTime())
      max = Math.max(max, parseISO(e.eind_dt).getTime(), parseISO(d.eind_dt).getTime())
    }
    const van = addDays(startOfDay(new Date(min)), -1)
    const tot = addDays(startOfDay(new Date(max - 1)), 2)
    return { vanMs: van.getTime(), totMs: tot.getTime(), van, tot }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, draftEntries])

  const dagenVenster = useMemo(
    () => eachDayOfInterval({ start: venster.van, end: addDays(venster.tot, -1) }),
    [venster],
  )
  const spanMs = venster.totMs - venster.vanMs
  const pct    = (ms: number) => ((ms - venster.vanMs) / spanMs) * 100
  const labelElke = Math.max(1, Math.ceil(dagenVenster.length / 10))

  function Strip({ label, lijst, segs }: { label: string; lijst: EntryMetDossier[]; segs: ConflictDetail[] }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 78, flexShrink: 0, fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textAlign: 'right' }}>
          {label}
        </span>
        <div style={{
          position: 'relative', flex: 1, height: STRIP_H,
          background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
          overflow: 'hidden',
        }}>
          {/* Dag-achtergrond: buiten rooster grijs, dag-scheidingslijnen */}
          {dagenVenster.map((d, i) => (
            <div key={i} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(d.getTime())}%`, width: `${(DAG_MS / spanMs) * 100}%`,
              background: buitenRooster(d, roosters) ? 'rgba(0,0,0,0.06)' : 'transparent',
              borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
            }} />
          ))}
          {/* Blok-periodes (verlof/feestdag/ATV) */}
          {blokken.filter(b => b.s < venster.totMs && b.e > venster.vanMs).map((b, i) => (
            <div key={`blok-${i}`} title={b.label} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct(Math.max(b.s, venster.vanMs))}%`,
              width: `${pct(Math.min(b.e, venster.totMs)) - pct(Math.max(b.s, venster.vanMs))}%`,
              background: 'rgba(248,113,113,0.20)',
            }} />
          ))}
          {/* Planitems: cluster gekleurd, overige grijs */}
          {lijst.map(e => {
            const s = parseISO(e.start_dt).getTime()
            const en = parseISO(e.eind_dt).getTime()
            if (en <= venster.vanMs || s >= venster.totMs) return null
            const l = pct(Math.max(s, venster.vanMs))
            const w = Math.max(0.6, pct(Math.min(en, venster.totMs)) - l)
            const inCluster = clusterIds.has(e.id)
            return (
              <div key={e.id} title={`${titelVan(e)} · ${fmt(s)} – ${fmt(en)}`} style={{
                position: 'absolute', top: 5, height: STRIP_H - 10,
                left: `${l}%`, width: `${w}%`,
                borderRadius: 3,
                background: inCluster ? kleurVan(e) : 'var(--fg-muted)',
                opacity: inCluster ? 1 : 0.35,
              }} />
            )
          })}
          {/* Resterende conflictsegmenten — zelfde rode gloed als in de timeline */}
          {segs.filter(c => c.s < venster.totMs && c.e > venster.vanMs).map((c, i) => (
            <div key={`seg-${i}`} style={{
              position: 'absolute', top: 3, height: STRIP_H - 6,
              left: `${pct(Math.max(c.s, venster.vanMs))}%`,
              width: `${Math.max(0.6, pct(Math.min(c.e, venster.totMs)) - pct(Math.max(c.s, venster.vanMs)))}%`,
              borderRadius: 4,
              background: 'rgba(239,68,68,0.22)',
              border: '1px solid rgba(239,68,68,0.75)',
              boxShadow: '0 0 7px 1px rgba(239,68,68,0.55)',
            }} />
          ))}
        </div>
      </div>
    )
  }

  // ─── Opslaan ────────────────────────────────────────────────────────────────

  function handleToepassen() {
    startTransition(async () => {
      const toegepast: Wijziging[] = []
      for (const [id, w] of Object.entries(draft)) {
        const e = entriesRij.find(x => x.id === id)
        if (!e) continue
        const result = await verplaatsPlanningItem(id, {
          start_dt:    w.start_dt,
          eind_dt:     w.eind_dt,
          dossier_id:  e.dossier_id ?? '',
          uursoort_id: e.planning_activiteiten?.uursoort_id ?? null,
          uren:        e.uren,
        })
        if (!result.ok) {
          toast.error(`${korteNaam(e)}: ${result.error}`)
          if (toegepast.length > 0) {
            // Deels opgeslagen: parent bijwerken, rest van de draft blijft staan.
            onApplied(toegepast)
            setDraft(prev => {
              const rest = { ...prev }
              for (const t of toegepast) delete rest[t.id]
              return rest
            })
          }
          return
        }
        toegepast.push({ id, start_dt: w.start_dt, eind_dt: w.eind_dt })
      }

      // Item(s) buiten de zichtbare periode verschoven? Meld waarheen.
      const buitenBeeld = toegepast.filter(t => {
        const s = parseISO(t.start_dt).getTime()
        return s < zichtbaar.van || s >= zichtbaar.tot
      })
      if (buitenBeeld.length > 0) {
        const e = entriesRij.find(x => x.id === buitenBeeld[0].id)
        toast.success(`${opgelost ? 'Conflict opgelost' : 'Planning aangepast'} — “${e ? korteNaam(e) : 'planitem'}” staat nu op ${fmtKort(parseISO(buitenBeeld[0].start_dt))} (buiten beeld)`)
      } else {
        toast.success(opgelost ? 'Conflict opgelost' : 'Planning aangepast')
      }
      onApplied(toegepast)
      onClose()
    })
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  const naam = [medewerker.voornaam, medewerker.tussenvoegsel, medewerker.achternaam].filter(Boolean).join(' ')

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--bg-elev)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: 'min(620px, calc(100vw - 32px))',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="#ef4444" style={{ flexShrink: 0 }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
                Conflict oplossen — {naam}
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--fg-muted)', marginTop: 4, lineHeight: 1.5 }}>
              {conflict.soort === 'overlap' ? (
                <><strong>{titelVan(conflict.a)}</strong> overlapt met <strong>{titelVan(conflict.b)}</strong></>
              ) : (
                <><strong>{titelVan(conflict.a)}</strong> valt tijdens <strong>{conflict.blokLabel}</strong></>
              )}
              {' · '}{fmt(conflict.s)} – {fmt(conflict.e)}
              {cluster.length > 2 && <> · Dit conflict raakt {cluster.length} planitems.</>}
            </div>
          </div>
          <button type="button" onClick={onClose} className="eva-btn-ghost" style={{ padding: 4, flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Mini-tijdlijn: Nu vs. Na wijziging */}
          <div>
            <label style={labelStyle}>Voorbeeld</label>
            {/* Dag-as */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ width: 78, flexShrink: 0 }} />
              <div style={{ position: 'relative', flex: 1, height: 14 }}>
                {dagenVenster.map((d, i) => (
                  i % labelElke === 0 ? (
                    <span key={i} style={{
                      position: 'absolute', left: `${pct(d.getTime())}%`,
                      fontSize: 9, color: 'var(--fg-muted)', whiteSpace: 'nowrap', paddingLeft: 3,
                    }}>
                      {format(d, 'EEE d', { locale: nl })}
                    </span>
                  ) : null
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Strip label="Nu"            lijst={entriesRij}   segs={conflicten.filter(raaktCluster)} />
              <Strip label="Na wijziging"  lijst={draftEntries} segs={resterend} />
            </div>
            {/* Statusregel */}
            <div style={{
              marginTop: 8, display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 11, fontWeight: 700,
              color: opgelost ? '#15803d' : '#b91c1c',
            }}>
              {opgelost
                ? <><Check size={13} /> Geen overlap meer</>
                : <><AlertTriangle size={13} /> Nog {resterend.length} conflict{resterend.length === 1 ? '' : 'en'}</>}
            </div>
          </div>

          {/* Snelle oplossingen */}
          {!opgelost && (
            <div>
              <label style={labelStyle}>Snelle oplossingen</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {voorstellen.map(v => (
                  <button
                    key={v.key}
                    type="button"
                    disabled={!v.doel}
                    onClick={() => v.doel && zetDraft(v.moverId, v.doel.start, v.doel.eind)}
                    className="eva-btn-ghost"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
                      textAlign: 'left', cursor: v.doel ? 'pointer' : 'not-allowed',
                      opacity: v.doel ? 1 : 0.55,
                    }}
                  >
                    <span style={{
                      fontSize: 12, fontWeight: 600, color: 'var(--fg)', minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {v.label}
                    </span>
                    <span style={{
                      fontSize: 10, color: 'var(--fg-muted)', flexShrink: 0,
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                    }}>
                      <ArrowRight size={11} />
                      {v.doel ? fmtKort(v.doel.start) : 'geen vrij moment gevonden'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Handmatig verschuiven per planitem */}
          <div>
            <label style={labelStyle}>Handmatig verschuiven</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cluster.map(orig => {
                const d       = draftVan(orig.id)
                const startDt = parseISO(d.start_dt)
                const eindDt  = parseISO(d.eind_dt)
                const gewijzigd = !!draft[orig.id]
                const zetVelden = (patch: Partial<{ sd: string; st: string; ed: string; et: string }>) => {
                  const sd = patch.sd ?? format(startDt, 'yyyy-MM-dd')
                  const st = patch.st ?? format(startDt, 'HH:mm')
                  const ed = patch.ed ?? format(eindDt,  'yyyy-MM-dd')
                  const et = patch.et ?? format(eindDt,  'HH:mm')
                  zetDraft(orig.id, new Date(`${sd}T${st}`), new Date(`${ed}T${et}`))
                }
                const verschuifDagen = (dagen: number) => {
                  setDraft(prev => ({
                    ...prev,
                    [orig.id]: { start_dt: verschuifTs(d.start_dt, dagen), eind_dt: verschuifTs(d.eind_dt, dagen) },
                  }))
                }
                return (
                  <div key={orig.id} style={{
                    border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px',
                    display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: kleurVan(orig), flexShrink: 0 }} />
                      <div style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--fg)', minWidth: 0, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {titelVan(orig)}
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--fg-muted)', flexShrink: 0 }}>{orig.uren}u</span>
                      {gewijzigd && (
                        <button
                          type="button"
                          onClick={() => setDraft(prev => { const rest = { ...prev }; delete rest[orig.id]; return rest })}
                          className="eva-btn-ghost"
                          style={{ padding: '2px 6px', fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                        >
                          <RotateCcw size={11} /> Herstel
                        </button>
                      )}
                    </div>

                    {orig.bron === 'bouw7' && (
                      <div style={{
                        border: '1px solid rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.08)',
                        borderRadius: 6, padding: '6px 10px', fontSize: 10, color: 'var(--fg)',
                      }}>
                        Dit item komt uit Bouw7 — een volgende synchronisatie kan deze wijziging overschrijven.
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button type="button" className="eva-btn-ghost" onClick={() => verschuifDagen(-1)}
                          style={{ padding: '4px 8px', fontSize: 11 }} title="Eén dag eerder">− 1 dag</button>
                        <button type="button" className="eva-btn-ghost" onClick={() => verschuifDagen(1)}
                          style={{ padding: '4px 8px', fontSize: 11 }} title="Eén dag later">+ 1 dag</button>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto auto', gap: 6, alignItems: 'end' }}>
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 2 }}>Start</label>
                          <input type="date" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
                            value={format(startDt, 'yyyy-MM-dd')}
                            onChange={e => e.target.value && zetVelden({ sd: e.target.value })} />
                        </div>
                        <input type="time" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
                          value={format(startDt, 'HH:mm')}
                          onChange={e => e.target.value && zetVelden({ st: e.target.value })} />
                        <div>
                          <label style={{ ...labelStyle, marginBottom: 2 }}>Eind</label>
                          <input type="date" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
                            value={format(eindDt, 'yyyy-MM-dd')}
                            onChange={e => e.target.value && zetVelden({ ed: e.target.value })} />
                        </div>
                        <input type="time" className="eva-input" style={{ fontSize: 11, padding: '4px 6px' }}
                          value={format(eindDt, 'HH:mm')}
                          onChange={e => e.target.value && zetVelden({ et: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" onClick={onClose} className="eva-btn-ghost">Annuleren</button>
            <button
              type="button"
              onClick={handleToepassen}
              disabled={isPending || aantalWijzigingen === 0}
              className="eva-btn-primary"
            >
              {isPending
                ? 'Bezig…'
                : `Toepassen${aantalWijzigingen > 0 ? ` (${aantalWijzigingen} wijziging${aantalWijzigingen === 1 ? '' : 'en'})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
