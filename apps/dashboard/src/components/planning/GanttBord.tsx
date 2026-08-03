'use client'

import { addDays, parseISO, startOfDay } from 'date-fns'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { OPDRACHT_STATUSSEN } from '@/components/dossiers/types'
import { NAAR_NIEUW_TABBLAD } from '@/components/dossiers/open-dossier'
import { crewKleur } from '@/lib/utils/crew'
import {
  KLEUR, PeriodeNav, PeriodeScrubber, PlanningShell, RIJ_HOOGTE,
  usePlanningController,
} from './layout/index'
import type { OpdrachtRij } from '@/app/(platform)/planning/project/page'

const SUBSTATUS_KLEUR: Record<string, string> = {
  nieuwe_opdracht:   '#3a7fb8',
  werkvoorbereiding: '#e08a1e',
  onderhanden:       '#009439',
  uitvoering_gereed: '#8650c4',
}

/** De pagina laadt alleen opdrachten vóór de financiële afronding — die statussen kunnen hier dus niet voorkomen. */
const STATUS_OPTIES = OPDRACHT_STATUSSEN.filter(
  s => s.key !== 'financieel_gereed' && s.key !== 'financieel_afgesloten',
)
const STANDAARD_STATUSSEN = ['onderhanden', 'werkvoorbereiding']

type SortKey = 'start' | 'eind' | 'naam'
const SORT_OPTIES: { key: SortKey; label: string }[] = [
  { key: 'start', label: 'Startdatum' },
  { key: 'eind',  label: 'Einddatum' },
  { key: 'naam',  label: 'Projectnaam' },
]

export default function GanttBord({ opdrachten }: { opdrachten: OpdrachtRij[] }) {
  const {
    view, peildatum, layout, wrapRef, scrollRef,
    handlePeildatum, handleView, handleVandaag, handleScrub,
  } = usePlanningController({ defaultView: 'maand' })

  const [kleurModus, setKleurModus] = useState<'status' | 'projectleider'>('projectleider')
  const [sortBy, setSortBy] = useState<SortKey>('eind')
  const [geselecteerdeCategorieen, setGeselecteerdeCategorieen] = useState<string[]>([])
  const [geselecteerdeStatussen, setGeselecteerdeStatussen] = useState<string[]>(STANDAARD_STATUSSEN)

  const { vs, ve } = layout

  const uniekeCat = useMemo(
    () => [...new Set(opdrachten.map(o => o.categorie).filter(Boolean) as string[])].sort(),
    [opdrachten],
  )

  const gefilterd = useMemo(
    () => opdrachten
      .filter(d => d.planning_start || d.planning_eind || d.verwacht_startdatum || d.verwacht_einddatum)
      .filter(d => geselecteerdeCategorieen.length === 0 || geselecteerdeCategorieen.includes(d.categorie ?? ''))
      .filter(d => geselecteerdeStatussen.includes(d.opdracht_substatus ?? '')),
    [opdrachten, geselecteerdeCategorieen, geselecteerdeStatussen],
  )

  const gesorteerd = useMemo(() => {
    const start = (o: OpdrachtRij) => o.planning_start ?? o.verwacht_startdatum ?? ''
    const eind  = (o: OpdrachtRij) => o.planning_eind  ?? o.verwacht_einddatum  ?? ''
    const cmpLeegLaatst = (a: string, b: string) =>
      (a === '' ? 1 : 0) - (b === '' ? 1 : 0) || a.localeCompare(b)
    return [...gefilterd].sort((a, b) => {
      if (sortBy === 'naam') return (a.titel ?? '').localeCompare(b.titel ?? '', 'nl')
      if (sortBy === 'eind')  return cmpLeegLaatst(eind(a), eind(b))
      return cmpLeegLaatst(start(a), start(b))
    })
  }, [gefilterd, sortBy])

  function getKleur(o: OpdrachtRij) {
    if (kleurModus === 'projectleider')
      return o.projectleider_kleur ?? crewKleur(o.projectleider_naam ?? '—')
    return SUBSTATUS_KLEUR[o.opdracht_substatus ?? ''] ?? '#888'
  }

  function balk(start: Date, eind: Date) {
    const left  = layout.xVoor(startOfDay(start).toISOString())
    const right = layout.xVoor(addDays(startOfDay(eind), 1).toISOString())
    const w = Math.max(1, right - left) - 2
    return { left, width: w }
  }

  const bodyHoogte = gesorteerd.length * RIJ_HOOGTE

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
      {gesorteerd.map(o => {
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
      {gesorteerd.map((o, i) => {
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
                {...NAAR_NIEUW_TABBLAD}
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
    : [...new Map(gesorteerd.map(o => [
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

  const segGroep = (
    children: React.ReactNode,
  ) => (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
      {children}
    </div>
  )
  const segKnop = (actief: boolean, label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
      background: actief ? 'var(--accent)' : 'transparent',
      color: actief ? 'white' : 'var(--fg-muted)',
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      {label}
    </button>
  )

  const sortControl = segGroep(
    SORT_OPTIES.map(o => segKnop(sortBy === o.key, o.label, () => setSortBy(o.key))),
  )
  const kleurToggle = segGroep(
    (['status', 'projectleider'] as const).map(modus =>
      segKnop(kleurModus === modus, modus === 'status' ? 'Status' : 'Medewerker', () => setKleurModus(modus)),
    ),
  )
  const rightSlot = (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sorteer</span>
      {sortControl}
      {kleurToggle}
    </div>
  )

  const pil = (key: string, label: string, actief: boolean, onClick: () => void) => (
    <button key={key} onClick={onClick} style={{
      padding: '3px 10px', borderRadius: 20, border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
      background: actief ? 'var(--accent)' : 'transparent',
      color: actief ? 'white' : 'var(--fg-muted)',
      fontSize: 10, fontWeight: 600, cursor: 'pointer',
    }}>
      {label}
    </button>
  )

  const slicerRij = (titel: string, children: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
      <span style={{
        fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)',
        textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2,
      }}>
        {titel}
      </span>
      {children}
    </div>
  )

  const statusSlicer = slicerRij('Status', (
    <>
      {STATUS_OPTIES.map(s => pil(
        s.key,
        s.label,
        geselecteerdeStatussen.includes(s.key),
        () => setGeselecteerdeStatussen(prev =>
          prev.includes(s.key) ? prev.filter(k => k !== s.key) : [...prev, s.key]
        ),
      ))}
      {pil('__alles', 'Alles', false, () => setGeselecteerdeStatussen(STATUS_OPTIES.map(s => s.key)))}
    </>
  ))

  const categorieSlicer = uniekeCat.length >= 2
    ? slicerRij('Categorie', (
        <>
          {uniekeCat.map(cat => pil(
            cat,
            cat,
            geselecteerdeCategorieen.includes(cat),
            () => setGeselecteerdeCategorieen(prev =>
              prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
            ),
          ))}
          {geselecteerdeCategorieen.length > 0 && (
            <button onClick={() => setGeselecteerdeCategorieen([])} style={{
              padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--fg-muted)',
              fontSize: 10, cursor: 'pointer',
            }}>
              × wis
            </button>
          )}
        </>
      ))
    : null

  return (
    <div ref={wrapRef}>
      {balkStijl}
      {statusSlicer}
      {categorieSlicer}
      {gesorteerd.length === 0 ? (
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
            Geen opdrachten gevonden binnen de gekozen status en categorie.
            Pas de filters aan, of stel start- en einddatum in op de opdracht om ze hier te tonen.
          </div>
        </>
      ) : (
        <PlanningShell
          layout={layout}
          scrollRef={scrollRef}
          toolbar={
            <PeriodeNav
              peildatum={peildatum}
              view={view}
              onPeildatum={handlePeildatum}
              onView={handleView}
              onVandaag={handleVandaag}
              rightSlot={rightSlot}
            />
          }
          scrubber={<PeriodeScrubber view={view} peildatum={peildatum} vs={layout.periodeVs} onChange={handleScrub} />}
          labelHeader="Opdracht"
          labelKolom={labelKolom}
          body={body}
          bodyHoogte={bodyHoogte}
          legenda={legenda}
        />
      )}
    </div>
  )
}
