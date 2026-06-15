'use client'

import { addDays, differenceInDays, parseISO, startOfDay, startOfMonth } from 'date-fns'
import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { crewKleur } from '@/lib/utils/crew'
import {
  buildGridUnits, buildHeader, KLEUR, LABEL_W, PeriodeNav, PeriodeScrubber,
  PlanningShell, RIJ_HOOGTE, usePlanningLayout, viewBereik, type View,
} from './layout'
import type { OpdrachtRij } from '@/app/(platform)/planning/project/page'

const SUBSTATUS_KLEUR: Record<string, string> = {
  nieuwe_opdracht:   '#3a7fb8',
  werkvoorbereiding: '#e08a1e',
  onderhanden:       '#009439',
  uitvoering_gereed: '#8650c4',
}

export default function GanttBord({ opdrachten }: { opdrachten: OpdrachtRij[] }) {
  const [peildatum,   setPeildatum]   = useState(() => startOfMonth(new Date()))
  const [view,        setView]        = useState<View>('maand')
  const [kleurModus,  setKleurModus]  = useState<'status' | 'projectleider'>('projectleider')
  const [viewStart, setViewStart] = useState(() => viewBereik('maand', startOfMonth(new Date())).vs)
  const [availableW, setAvailableW] = useState(800)
  const [geselecteerdeCategorieen, setGeselecteerdeCategorieen] = useState<string[]>([])
  const wrapRef   = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setAvailableW(Math.max(100, entry.contentRect.width - LABEL_W))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const layout = usePlanningLayout({ peildatum, view, availableW })
  const { ppd, totalDays } = layout
  const vs = viewStart
  const ve = useMemo(() => addDays(viewStart, totalDays - 1), [viewStart, totalDays])
  const { spans: effSpans, cols: effCols } = useMemo(() => buildHeader(view, vs, ve, ppd), [view, vs, ve, ppd])
  const effGridUnits = useMemo(() => buildGridUnits(view, vs, ve, ppd), [view, vs, ve, ppd])
  const effectiefLayout = useMemo(
    () => ({ ...layout, vs, ve, spans: effSpans, cols: effCols, gridUnits: effGridUnits }),
    [layout, vs, ve, effSpans, effCols, effGridUnits])

  const uniekeCat = useMemo(
    () => [...new Set(opdrachten.map(o => o.categorie).filter(Boolean) as string[])].sort(),
    [opdrachten],
  )

  const gefilterd = useMemo(
    () => opdrachten
      .filter(d => d.planning_start || d.planning_eind || d.verwacht_startdatum || d.verwacht_einddatum)
      .filter(d => geselecteerdeCategorieen.length === 0 || geselecteerdeCategorieen.includes(d.categorie ?? '')),
    [opdrachten, geselecteerdeCategorieen],
  )

  function getKleur(o: OpdrachtRij) {
    if (kleurModus === 'projectleider')
      return o.projectleider_kleur ?? crewKleur(o.projectleider_naam ?? '—')
    return SUBSTATUS_KLEUR[o.opdracht_substatus ?? ''] ?? '#888'
  }

  function handlePeildatum(pd: Date) {
    setPeildatum(pd)
    setViewStart(viewBereik(view, pd).vs)
  }
  function handleView(v: View) {
    setView(v)
    setViewStart(viewBereik(v, peildatum).vs)
  }
  function handleVandaag() {
    const pd = startOfMonth(new Date())
    setPeildatum(pd)
    setViewStart(viewBereik(view, pd).vs)
    setTimeout(scrollNaarVandaag, 50)
  }

  function scrollNaarVandaag() {
    if (!scrollRef.current) return
    const offset = differenceInDays(startOfDay(new Date()), startOfDay(vs))
    scrollRef.current.scrollLeft = Math.max(0, offset * ppd - 80)
  }

  useEffect(() => {
    const t = setTimeout(scrollNaarVandaag, 50)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peildatum.getTime(), ppd])

  function balk(start: Date, eind: Date) {
    const startOff = Math.max(0, differenceInDays(startOfDay(start), startOfDay(vs)))
    const eindOff  = Math.min(totalDays, differenceInDays(startOfDay(eind), startOfDay(vs)) + 1)
    const w = Math.max(1, eindOff - startOff) * ppd - 2
    return { left: startOff * ppd, width: w }
  }

  const bodyHoogte = gefilterd.length * RIJ_HOOGTE

  // DS-spec: border-radius 6px + box-shadow op activiteitbaren + hover-lift
  const balkStijl = (
    <style>{`
      .gantt-balk {
        border-radius: 6px;
        box-shadow: 0 1px 2px rgba(0,0,0,0.10);
        transition: box-shadow 120ms, transform 120ms;
      }
      .gantt-balk:hover {
        box-shadow: 0 4px 10px -2px rgba(0,0,0,0.20);
        transform: translateY(-1px);
        z-index: 6;
      }
    `}</style>
  )

  const labelKolom = (
    <div>
      {gefilterd.map(o => {
        const kleur = getKleur(o)
        return (
          <div key={o.id} style={{
            height: RIJ_HOOGTE, display: 'flex', alignItems: 'center',
            paddingLeft: 12, paddingRight: 8,
            borderBottom: `1px solid ${KLEUR.border}`,
          }}>
            <div style={{
              width: 4, height: 24, borderRadius: 2,
              background: kleur, flexShrink: 0, marginRight: 10,
            }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                color: KLEUR.fg,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {o.titel}
              </div>
              <div style={{
                fontSize: 10, color: KLEUR.fgMuted,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {o.klant_naam ?? o.dossiernummer ?? '—'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const body = (
    <>
      {gefilterd.map((o, i) => {
        const startStr = o.planning_start ?? o.verwacht_startdatum
        const eindStr  = o.planning_eind  ?? o.verwacht_einddatum
        const start = startStr ? parseISO(startStr) : vs
        const eind  = eindStr  ? parseISO(eindStr)  : ve
        const { left, width } = balk(start, eind)
        const kleur = getKleur(o)
        const pct   = o.geplande_uren_pct ?? 0

        return (
          <div key={o.id} style={{
            position: 'absolute', top: i * RIJ_HOOGTE, height: RIJ_HOOGTE,
            left: 0, right: 0,
            borderBottom: `1px solid ${KLEUR.border}`,
          }}>
            {width > 0 && (
              <Link
                href={`/opdrachten/${o.id}/informatie`}
                className="gantt-balk"
                style={{
                  position: 'absolute', top: 8, bottom: 8,
                  left, width,
                  borderRadius: 6, overflow: 'hidden',
                  background: kleur, textDecoration: 'none',
                  display: 'flex', alignItems: 'center', paddingLeft: 8,
                  cursor: 'pointer', zIndex: 4,
                }}
                title={`${o.titel} — ${o.opdracht_substatus ?? ''}`}
              >
                <div style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0,
                  width: `${pct}%`, background: 'rgba(0,0,0,0.15)',
                }} />
                <span style={{
                  position: 'relative', fontFamily: 'var(--font-ui)', fontSize: 11,
                  fontWeight: 600, color: 'white', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: width - 16,
                }}>
                  {width > 60 ? (o.dossiernummer ? `${o.dossiernummer} ` : '') + o.titel : ''}
                </span>
              </Link>
            )}
          </div>
        )
      })}
    </>
  )

  const legendaItems = kleurModus === 'status'
    ? Object.entries(SUBSTATUS_KLEUR).map(([key, kleur]) => ({ label: key.replace(/_/g, ' '), kleur }))
    : [...new Map(gefilterd.map(o => [
        o.projectleider_naam ?? '—',
        { label: o.projectleider_naam ?? '—', kleur: o.projectleider_kleur ?? crewKleur(o.projectleider_naam ?? '—') },
      ])).values()]

  const legenda = (
    <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      {legendaItems.map(({ label, kleur }) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 12, borderRadius: 2, background: kleur }} />
          <span style={{ fontSize: 10, color: KLEUR.fgMuted, textTransform: 'capitalize' }}>
            {label}
          </span>
        </div>
      ))}
    </div>
  )

  const kleurToggle = (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
      {(['status', 'projectleider'] as const).map(modus => (
        <button key={modus} onClick={() => setKleurModus(modus)} style={{
          padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
          background: kleurModus === modus ? 'var(--accent)' : 'transparent',
          color: kleurModus === modus ? 'white' : 'var(--fg-muted)',
          fontSize: 10, fontWeight: 700,
        }}>
          {modus === 'status' ? 'Status' : 'Medewerker'}
        </button>
      ))}
    </div>
  )

  const categorieSlicer = uniekeCat.length >= 2 ? (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
      {uniekeCat.map(cat => {
        const actief = geselecteerdeCategorieen.includes(cat)
        return (
          <button key={cat} onClick={() => setGeselecteerdeCategorieen(prev =>
            actief ? prev.filter(c => c !== cat) : [...prev, cat]
          )} style={{
            padding: '3px 10px', borderRadius: 20, border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
            background: actief ? 'var(--accent)' : 'transparent',
            color: actief ? 'white' : 'var(--fg-muted)',
            fontSize: 10, fontWeight: 600, cursor: 'pointer',
          }}>
            {cat}
          </button>
        )
      })}
      {geselecteerdeCategorieen.length > 0 && (
        <button onClick={() => setGeselecteerdeCategorieen([])} style={{
          padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)',
          background: 'transparent', color: 'var(--fg-muted)',
          fontSize: 10, cursor: 'pointer',
        }}>
          × wis
        </button>
      )}
    </div>
  ) : null

  return (
    <div ref={wrapRef}>
      {balkStijl}
      {categorieSlicer}
      {gefilterd.length === 0 ? (
        <>
          <PeriodeNav
            peildatum={peildatum}
            view={view}
            onPeildatum={handlePeildatum}
            onView={handleView}
            onVandaag={handleVandaag}
          />
          <div style={{
            padding: '40px 24px', textAlign: 'center',
            border: `2px dashed ${KLEUR.border}`, borderRadius: 10,
            color: KLEUR.fgMuted, fontFamily: 'var(--font-ui)', fontSize: 13,
          }}>
            Geen opdrachten met geplande start- of einddatum gevonden.
            Stel start- en einddatum in op de opdracht om ze hier te tonen.
          </div>
        </>
      ) : (
        <>
          <PlanningShell
            layout={effectiefLayout}
            scrollRef={scrollRef}
            toolbar={
              <>
                <PeriodeNav
                  peildatum={peildatum}
                  view={view}
                  onPeildatum={handlePeildatum}
                  onView={handleView}
                  onVandaag={handleVandaag}
                  rightSlot={kleurToggle}
                />
                <PeriodeScrubber view={view} peildatum={peildatum} vs={viewStart} onChange={setViewStart} />
              </>
            }
            labelHeader="Opdracht"
            labelKolom={labelKolom}
            body={body}
            bodyHoogte={bodyHoogte}
            legenda={legenda}
          />
        </>
      )}
    </div>
  )
}
