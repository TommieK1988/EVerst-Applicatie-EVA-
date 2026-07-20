'use client'

import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from 'date-fns'
import { nl } from 'date-fns/locale'
import { AlertTriangle, Check, GripVertical, RotateCcw, X } from 'lucide-react'
import { useMemo, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'

import type { Medewerker, MedewerkerRooster } from '@everts/database/platform-types'
import { verplaatsPlanningItem } from '@/app/(platform)/planning/actions'
import { crewKleur } from '@/lib/utils/crew'
import {
  DAG_MS, berekenConflicten, buitenRooster, clusterVoorConflict,
  type BlokInterval, type ConflictDetail, type EntryMetDossier, type WerkInterval,
} from './conflict'
import { verschuifTs } from './layout/index'

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

const LABEL_W = 96   // breedte van de naamkolom links van de tijdlijn
const LANE_H  = 40   // hoogte van één sleepbare baan
const SNAP_MS = 60 * 60 * 1000 // sleep-raster: 1 uur

// Zoomniveaus (zichtbare dagen). Krap inzoomen = meer pixels per uur, zodat je
// op het uur kunt slepen; uitzoomen om over meer dagen te verplaatsen.
const ZOOM_PRESETS = [
  { dagen: 1,  label: '1 dag' },
  { dagen: 2,  label: '2 dagen' },
  { dagen: 4,  label: '4 dagen' },
  { dagen: 7,  label: 'week' },
  { dagen: 14, label: '2 weken' },
] as const

type Wijziging = { id: string; start_dt: string; eind_dt: string }

type Venster = { vanMs: number; totMs: number; van: Date; tot: Date }

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

  // ─── Sleepbare tijdlijn ─────────────────────────────────────────────────────

  const stripRef = useRef<HTMLDivElement>(null)
  const dragRef  = useRef<
    { id: string; startX: number; origStartMs: number; durMs: number; venster: Venster } | null
  >(null)
  const [sleeptId, setSleeptId] = useState<string | null>(null)
  // Tijdens het slepen bevriezen we het venster zodat de balken niet mee-herschalen
  // (dat zou de balk onder de cursor laten wegdrijven).
  const [vastVenster, setVastVenster] = useState<Venster | null>(null)

  // Bereik dat de cluster-items (origineel + draft) samen beslaan.
  const clusterRange = useMemo(() => {
    let lo = Infinity, hi = -Infinity
    for (const e of cluster) {
      const d = draftVan(e.id)
      lo = Math.min(lo, parseISO(e.start_dt).getTime(), parseISO(d.start_dt).getTime())
      hi = Math.max(hi, parseISO(e.eind_dt).getTime(), parseISO(d.eind_dt).getTime())
    }
    return { lo, hi }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, draftEntries])

  // Aantal hele dagen dat de cluster minimaal beslaat — ondergrens voor inzoomen
  // (je kunt niet krapper dan de betrokken planningen zelf).
  const fitDagen = Math.max(
    1,
    Math.round(
      (addDays(startOfDay(new Date(clusterRange.hi - 1)), 1).getTime()
        - startOfDay(new Date(clusterRange.lo)).getTime()) / DAG_MS,
    ),
  )

  // Zoomniveau: standaard krap (op-het-uur slepen), uit te zoomen via de knoppen.
  const [zoomDagen, setZoomDagen] = useState<number>(() => {
    let lo = Infinity, hi = -Infinity
    for (const e of cluster) {
      lo = Math.min(lo, parseISO(e.start_dt).getTime())
      hi = Math.max(hi, parseISO(e.eind_dt).getTime())
    }
    const dagen = Math.max(1, Math.ceil((hi - lo) / DAG_MS))
    return Math.min(14, Math.max(2, dagen + 1))
  })

  const venster = useMemo<Venster>(() => {
    if (vastVenster) return vastVenster
    const vanFit = startOfDay(new Date(clusterRange.lo))
    const totFit = addDays(startOfDay(new Date(clusterRange.hi - 1)), 1)
    const totaal = Math.max(fitDagen, zoomDagen)
    const extra  = totaal - fitDagen
    const van = addDays(vanFit, -Math.floor(extra / 2))
    const tot = addDays(totFit, Math.ceil(extra / 2))
    return { vanMs: van.getTime(), totMs: tot.getTime(), van, tot }
  }, [clusterRange, fitDagen, zoomDagen, vastVenster])

  const dagenVenster = useMemo(
    () => eachDayOfInterval({ start: venster.van, end: addDays(venster.tot, -1) }),
    [venster],
  )
  const spanMs = venster.totMs - venster.vanMs
  const pct    = (ms: number) => ((ms - venster.vanMs) / spanMs) * 100
  const labelElke = Math.max(1, Math.ceil(dagenVenster.length / 10))
  const zichtbareDagen = Math.round(spanMs / DAG_MS)

  // Uurlijnen als hulp bij op-het-uur slepen — alleen als er genoeg ruimte per uur is.
  const uurLijnen = useMemo(() => {
    if (zichtbareDagen > 3) return [] as number[]
    const stapUur = zichtbareDagen <= 1 ? 2 : 3
    const lijnen: number[] = []
    for (let t = venster.vanMs; t < venster.totMs; t += stapUur * 60 * 60 * 1000) {
      if (new Date(t).getHours() !== 0) lijnen.push(t) // middernacht = daglijn
    }
    return lijnen
  }, [venster, zichtbareDagen])

  function barPointerDown(e: React.PointerEvent, entry: EntryMetDossier) {
    if (!stripRef.current) return
    const d = draftVan(entry.id)
    const origStartMs = parseISO(d.start_dt).getTime()
    const durMs       = parseISO(d.eind_dt).getTime() - origStartMs
    setVastVenster(venster)
    dragRef.current = { id: entry.id, startX: e.clientX, origStartMs, durMs, venster }
    setSleeptId(entry.id)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    e.preventDefault()
    e.stopPropagation()
  }

  function barPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current
    const rect = stripRef.current?.getBoundingClientRect()
    if (!drag || !rect) return
    const vspan   = drag.venster.totMs - drag.venster.vanMs
    const deltaMs = ((e.clientX - drag.startX) / rect.width) * vspan
    const snapped = Math.round(deltaMs / SNAP_MS) * SNAP_MS
    // Binnen het (bevroren) venster houden zodat de balk zichtbaar blijft.
    const maxStart = Math.max(drag.venster.vanMs, drag.venster.totMs - drag.durMs)
    const newStart = Math.max(drag.venster.vanMs, Math.min(drag.origStartMs + snapped, maxStart))
    zetDraft(drag.id, new Date(newStart), new Date(newStart + drag.durMs))
  }

  function barPointerUp() {
    if (!dragRef.current) return
    dragRef.current = null
    setSleeptId(null)
    setVastVenster(null)
  }

  // Context: niet-cluster werk-taken die in het venster vallen (om per ongeluk
  // erbovenop slepen zichtbaar te maken).
  const contextWerk = draftEntries.filter(
    e => !clusterIds.has(e.id)
      && parseISO(e.eind_dt).getTime() > venster.vanMs
      && parseISO(e.start_dt).getTime() < venster.totMs,
  )

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
        width: 'min(640px, calc(100vw - 32px))',
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
          {/* Sleepbare tijdlijn */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
              <label style={{ ...labelStyle, marginBottom: 0 }}>Sleep een balk om de overlap op te heffen</label>
              <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2, flexShrink: 0 }}>
                {ZOOM_PRESETS.map(z => {
                  const disabled = z.dagen < fitDagen
                  const actief   = !disabled && Math.max(fitDagen, zoomDagen) === z.dagen
                  return (
                    <button
                      key={z.dagen}
                      type="button"
                      disabled={disabled}
                      onClick={() => setZoomDagen(z.dagen)}
                      title={disabled ? 'De betrokken planning past niet in deze weergave' : `Toon ${z.label}`}
                      style={{
                        padding: '2px 8px', borderRadius: 4, border: 'none',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        background: actief ? 'var(--accent)' : 'transparent',
                        color: actief ? 'white' : 'var(--fg-muted)',
                        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
                        opacity: disabled ? 0.4 : 1,
                      }}
                    >
                      {z.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Dag-as */}
            <div style={{ display: 'flex', marginBottom: 2 }}>
              <span style={{ width: LABEL_W, flexShrink: 0 }} />
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

            <div style={{ display: 'flex' }}>
              {/* Naamkolom */}
              <div style={{ width: LABEL_W, flexShrink: 0 }}>
                {cluster.map((e, i) => (
                  <div key={e.id} title={titelVan(e)} style={{
                    height: LANE_H, display: 'flex', alignItems: 'center', gap: 6,
                    borderBottom: i < cluster.length - 1 ? '1px solid var(--border)' : 'none',
                    paddingRight: 6,
                  }}>
                    <div style={{ width: 9, height: 9, borderRadius: 2, background: kleurVan(e), flexShrink: 0 }} />
                    <span style={{
                      fontSize: 10, fontWeight: 600, color: 'var(--fg)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {korteNaam(e)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Tijdlijn met sleepbare balken */}
              <div
                ref={stripRef}
                style={{
                  position: 'relative', flex: 1, height: cluster.length * LANE_H,
                  background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                  overflow: 'hidden', touchAction: 'none',
                }}
              >
                {/* Dag-achtergrond: buiten rooster grijs, dag-scheidingslijnen */}
                {dagenVenster.map((d, i) => (
                  <div key={`dag-${i}`} style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${pct(d.getTime())}%`, width: `${(DAG_MS / spanMs) * 100}%`,
                    background: buitenRooster(d, roosters) ? 'rgba(0,0,0,0.06)' : 'transparent',
                    borderLeft: i > 0 ? '1px solid var(--border)' : 'none',
                    zIndex: 0,
                  }} />
                ))}

                {/* Uurlijnen (bij inzoomen) */}
                {uurLijnen.map((t, i) => (
                  <div key={`uur-${i}`} style={{
                    position: 'absolute', top: 0, bottom: 0, left: `${pct(t)}%`, width: 0,
                    borderLeft: '1px dashed var(--border)', opacity: 0.5, zIndex: 0,
                  }} />
                ))}

                {/* Blok-periodes (verlof/feestdag/ATV) */}
                {blokken.filter(b => b.s < venster.totMs && b.e > venster.vanMs).map((b, i) => (
                  <div key={`blok-${i}`} title={b.label} style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${pct(Math.max(b.s, venster.vanMs))}%`,
                    width: `${pct(Math.min(b.e, venster.totMs)) - pct(Math.max(b.s, venster.vanMs))}%`,
                    background: 'rgba(248,113,113,0.18)', zIndex: 1,
                  }} />
                ))}

                {/* Context: niet-cluster werk als lichte band, over de volle hoogte */}
                {contextWerk.map(e => {
                  const s = parseISO(e.start_dt).getTime()
                  const en = parseISO(e.eind_dt).getTime()
                  const l = pct(Math.max(s, venster.vanMs))
                  const w = Math.max(0.5, pct(Math.min(en, venster.totMs)) - l)
                  return (
                    <div key={`ctx-${e.id}`} title={`${titelVan(e)} (andere planning)`} style={{
                      position: 'absolute', top: 0, bottom: 0, left: `${l}%`, width: `${w}%`,
                      background: 'rgba(100,116,139,0.16)',
                      borderLeft: '1px dashed rgba(100,116,139,0.5)',
                      borderRight: '1px dashed rgba(100,116,139,0.5)',
                      zIndex: 1,
                    }} />
                  )
                })}

                {/* Baan-scheidingslijnen */}
                {cluster.slice(1).map((_, i) => (
                  <div key={`lane-${i}`} style={{
                    position: 'absolute', left: 0, right: 0, top: (i + 1) * LANE_H,
                    height: 1, background: 'var(--border)', zIndex: 2,
                  }} />
                ))}

                {/* Resterende conflicten — rode band over de volle hoogte */}
                {resterend.filter(c => c.s < venster.totMs && c.e > venster.vanMs).map((c, i) => (
                  <div key={`seg-${i}`} title="Overlap" style={{
                    position: 'absolute', top: 0, bottom: 0,
                    left: `${pct(Math.max(c.s, venster.vanMs))}%`,
                    width: `${Math.max(0.6, pct(Math.min(c.e, venster.totMs)) - pct(Math.max(c.s, venster.vanMs)))}%`,
                    background: 'rgba(239,68,68,0.20)',
                    borderLeft: '1px solid rgba(239,68,68,0.75)',
                    borderRight: '1px solid rgba(239,68,68,0.75)',
                    boxShadow: '0 0 7px 1px rgba(239,68,68,0.45)',
                    pointerEvents: 'none', zIndex: 3,
                  }} />
                ))}

                {/* Sleepbare cluster-balken, elk in eigen baan */}
                {cluster.map((e, i) => {
                  const d  = draftVan(e.id)
                  const s  = parseISO(d.start_dt).getTime()
                  const en = parseISO(d.eind_dt).getTime()
                  const l  = pct(Math.max(s, venster.vanMs))
                  const w  = Math.max(1.2, pct(Math.min(en, venster.totMs)) - l)
                  const actief = sleeptId === e.id
                  return (
                    <div
                      key={`bar-${e.id}`}
                      onPointerDown={ev => barPointerDown(ev, e)}
                      onPointerMove={barPointerMove}
                      onPointerUp={barPointerUp}
                      title={`${titelVan(e)} · ${fmt(s)} – ${fmt(en)}\nSleep om te verschuiven`}
                      style={{
                        position: 'absolute',
                        top: i * LANE_H + 6, height: LANE_H - 12,
                        left: `${l}%`, width: `${w}%`,
                        borderRadius: 5, background: kleurVan(e),
                        boxShadow: actief ? '0 4px 14px rgba(0,0,0,0.35)' : '0 1px 2px rgba(0,0,0,0.15)',
                        cursor: actief ? 'grabbing' : 'grab',
                        display: 'flex', alignItems: 'center', gap: 2,
                        paddingLeft: 4, paddingRight: 4, overflow: 'hidden',
                        userSelect: 'none', touchAction: 'none',
                        zIndex: actief ? 6 : 5,
                        outline: actief ? '2px solid rgba(255,255,255,0.8)' : 'none',
                      }}
                    >
                      <GripVertical size={12} color="rgba(255,255,255,0.9)" style={{ flexShrink: 0 }} />
                      <span style={{
                        fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, color: 'white',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {format(s, 'HH:mm', { locale: nl })}
                      </span>
                    </div>
                  )
                })}
              </div>
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

          {/* Handmatig verschuiven per planitem — precieze tijden en grote sprongen */}
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
