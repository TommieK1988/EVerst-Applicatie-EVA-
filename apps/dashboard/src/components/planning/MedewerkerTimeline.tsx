'use client'

import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  addDays, addMinutes, differenceInCalendarDays, differenceInDays, differenceInMinutes,
  eachDayOfInterval, format, isToday, isWeekend, parseISO,
  startOfDay, startOfMonth, startOfWeek,
} from 'date-fns'
import { nl } from 'date-fns/locale'
import { Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import toast from 'react-hot-toast'

import type {
  Medewerker, MedewerkerAfwezigheid, MedewerkerAfwezigheidType, MedewerkerRooster,
  PlanningItemVerrijkt, PlanningUursoort,
  BedrijfsagendaItemMetDoelgroep, BedrijfsagendaType, BedrijfsagendaVirtueel,
} from '@everts/database/platform-types'
import { bedrijfsagendaTypeKleur, medewerkerAfwezigheidLabels } from '@everts/database/platform-types'
import { verplaatsPlanningItem, verwijderPlanningItem } from '@/app/(platform)/planning/actions'
import {
  buildGridUnits, buildHeader, KLEUR, LABEL_W, PeriodeNav, PeriodeScrubber, PlanningShell,
  RIJ_HOOGTE, usePlanningLayout, verschuifTs, viewBereik, type PlanningLayout, type View,
} from './layout'
import { useKleurweergave, KleurweergaveToggle, type Kleurweergave } from './KleurweergaveToggle'
import VerlofModal from './VerlofModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H   = 28
const LANE_GAP = 3
const ROW_PAD  = 6

const CREW_KLEUREN = ['#7c3aed', '#0f9b8e', '#2f9e44', '#1f8a5b', '#f59e0b', '#3b82f6']

function rijHoogteVoor(numLanes: number): number {
  const n = Math.max(1, numLanes)
  return ROW_PAD * 2 + n * ITEM_H + (n - 1) * LANE_GAP
}

const AFWEZIGHEID_KLEUR: Record<MedewerkerAfwezigheidType, string> = {
  verlof:   '#3b82f6',
  ziek:     '#ef4444',
  training: '#10b981',
  overig:   '#6b7280',
}

const dialogLabelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 700,
  color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
  display: 'block', marginBottom: 4,
}

// ─── Lane types ───────────────────────────────────────────────────────────────

type LanedBar =
  | { kind: 'entry';   left: number; width: number; lane: number; entry: PlanningItemVerrijkt & { dossier_id?: string } }
  | { kind: 'verlof';  left: number; width: number; lane: number; item: MedewerkerAfwezigheid }
  | { kind: 'agenda';  left: number; width: number; lane: number; item: BedrijfsagendaItemMetDoelgroep }
  | { kind: 'feestdag'; left: number; width: number; lane: number; item: BedrijfsagendaVirtueel }

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
}

function itemGeldtVoorMedewerker(
  item: BedrijfsagendaItemMetDoelgroep,
  med: { id: string; afdeling: string | null },
): boolean {
  if (item.doelgroep_afdelingen.length === 0 && item.doelgroep_medewerkers.length === 0) return true
  if (item.doelgroep_medewerkers.includes(med.id)) return true
  if (med.afdeling && item.doelgroep_afdelingen.includes(med.afdeling)) return true
  return false
}

function dossierKleur(dossier_id: string): string {
  const hues = [210, 145, 30, 280, 170, 350, 50, 200, 260, 100]
  let hash = 0
  for (let i = 0; i < dossier_id.length; i++) hash = (hash * 31 + dossier_id.charCodeAt(i)) & 0xFFFFFF
  return `hsl(${hues[hash % hues.length]}, 55%, 42%)`
}

function medKleur(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xFFFFFF
  return CREW_KLEUREN[h % CREW_KLEUREN.length]
}

// ─── Lane assignment ──────────────────────────────────────────────────────────

function berekenLanes(
  dagLen: number,
  ppd:    number,
  vs:     Date,
  entries:    (PlanningItemVerrijkt & { dossier_id?: string })[],
  afwezigheid: MedewerkerAfwezigheid[],
  agendaItems: BedrijfsagendaItemMetDoelgroep[],
  feestdagen:  BedrijfsagendaVirtueel[],
): LanedBar[] {
  type RawBar =
    | { kind: 'entry';   left: number; width: number; entry: PlanningItemVerrijkt & { dossier_id?: string } }
    | { kind: 'verlof';  left: number; width: number; item: MedewerkerAfwezigheid }
    | { kind: 'agenda';  left: number; width: number; item: BedrijfsagendaItemMetDoelgroep }
    | { kind: 'feestdag'; left: number; width: number; item: BedrijfsagendaVirtueel }

  const raw: RawBar[] = []

  for (const entry of entries) {
    const startDt = parseISO(entry.start_dt)
    const eindDt  = parseISO(entry.eind_dt)
    const dayOff  = differenceInCalendarDays(startDt, vs)
    const duurMin = differenceInMinutes(eindDt, startDt)
    const left    = dayOff * ppd
    const width   = Math.max(ppd * 0.05, (duurMin / 1440) * ppd)
    if (left + width > 0 && left < dagLen * ppd)
      raw.push({ kind: 'entry', entry, left, width })
  }

  for (const a of afwezigheid) {
    const dayOffStart = differenceInCalendarDays(parseISO(a.start_datum), startOfDay(vs))
    const dayOffEind  = differenceInCalendarDays(parseISO(a.eind_datum),  startOfDay(vs))
    let left: number, width: number
    if (a.start_tijd && a.eind_tijd) {
      const sMin = parseTime(a.start_tijd), eMin = parseTime(a.eind_tijd)
      left  = dayOffStart * ppd + (sMin / 1440) * ppd
      width = Math.max(ppd * 0.05, ((eMin - sMin) / 1440) * ppd)
    } else {
      left  = dayOffStart * ppd
      width = (dayOffEind - dayOffStart + 1) * ppd
    }
    if (left + width > 0 && left < dagLen * ppd)
      raw.push({ kind: 'verlof', item: a, left, width })
  }

  for (const item of agendaItems) {
    const dayOff = differenceInCalendarDays(parseISO(item.start_datum), startOfDay(vs))
    let left: number, width: number
    if (!item.hele_dag && item.start_tijd && item.eind_tijd) {
      const sMin = parseTime(item.start_tijd), eMin = parseTime(item.eind_tijd)
      left  = dayOff * ppd + (sMin / 1440) * ppd
      width = Math.max(ppd * 0.03, ((eMin - sMin) / 1440) * ppd)
    } else {
      const duur = Math.max(1, Math.round((new Date(item.eind_datum).getTime() - new Date(item.start_datum).getTime()) / 86400000) + 1)
      left  = dayOff * ppd
      width = duur * ppd
    }
    if (left + width > 0 && left < dagLen * ppd)
      raw.push({ kind: 'agenda', item, left, width })
  }

  for (const f of feestdagen) {
    const dayOff = differenceInCalendarDays(parseISO(f.start_datum), startOfDay(vs))
    const left = dayOff * ppd, width = ppd
    if (left + width > 0 && left < dagLen * ppd)
      raw.push({ kind: 'feestdag', item: f, left, width })
  }

  raw.sort((a, b) => a.left - b.left)

  const laneRight: number[] = []
  return raw.map(bar => {
    const cLeft  = Math.max(0, bar.left)
    const cRight = cLeft + Math.min(bar.width, dagLen * ppd - cLeft)
    let lane = laneRight.findIndex(r => r <= cLeft)
    if (lane === -1) { lane = laneRight.length; laneRight.push(0) }
    laneRight[lane] = cRight
    return { ...bar, lane } as LanedBar
  })
}

// ─── PlanningItemEditDialog ───────────────────────────────────────────────────

function PlanningItemEditDialog({
  entry, medewerkers, dossierMap, onClose, onSaved,
}: {
  entry:       PlanningItemVerrijkt & { dossier_id?: string }
  medewerkers: Medewerker[]
  dossierMap:  Record<string, string>
  onClose:     () => void
  onSaved:     () => void
}) {
  const [isPending, startTransition] = useTransition()
  const startDt = parseISO(entry.start_dt)
  const eindDt  = parseISO(entry.eind_dt)

  const [form, setForm] = useState({
    medewerker_id: entry.medewerker_id,
    start_datum:   format(startDt, 'yyyy-MM-dd'),
    start_tijd:    format(startDt, 'HH:mm'),
    eind_datum:    format(eindDt,  'yyyy-MM-dd'),
    eind_tijd:     format(eindDt,  'HH:mm'),
    uren:          String(entry.uren),
  })

  function handleSave(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await verplaatsPlanningItem(entry.id, {
        start_dt:      new Date(`${form.start_datum}T${form.start_tijd}`).toISOString(),
        eind_dt:       new Date(`${form.eind_datum}T${form.eind_tijd}`).toISOString(),
        medewerker_id: form.medewerker_id,
        dossier_id:    entry.dossier_id ?? '',
        uursoort_id:   entry.planning_activiteiten?.uursoort_id ?? null,
        uren:          Number(form.uren),
      })
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Planitem bijgewerkt')
      onSaved()
    })
  }

  function handleDelete() {
    if (!confirm('Planitem verwijderen?')) return
    startTransition(async () => {
      const result = await verwijderPlanningItem(entry.id)
      if (!result.ok) { toast.error(result.error); return }
      toast.success('Planitem verwijderd')
      onSaved()
    })
  }

  const dossierNaam = dossierMap[entry.dossier_id ?? ''] ?? '—'
  const taakNaam    = entry.planning_activiteiten?.titel ?? '—'

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
        width: 420,
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.3)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
              {dossierNaam}
            </div>
            <div style={{ fontSize: 10, color: 'var(--fg-muted)', marginTop: 2 }}>
              {taakNaam}
            </div>
          </div>
          <button type="button" onClick={onClose} className="eva-btn-ghost" style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Medewerker */}
          <div>
            <label style={dialogLabelStyle}>Medewerker</label>
            <select
              className="eva-input"
              value={form.medewerker_id}
              onChange={e => setForm(f => ({ ...f, medewerker_id: e.target.value }))}
            >
              {medewerkers.map(m => (
                <option key={m.id} value={m.id}>
                  {[m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')}
                </option>
              ))}
            </select>
          </div>

          {/* Start */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={dialogLabelStyle}>Startdatum</label>
              <input type="date" className="eva-input" value={form.start_datum}
                onChange={e => setForm(f => ({ ...f, start_datum: e.target.value }))} required />
            </div>
            <div>
              <label style={dialogLabelStyle}>Starttijd</label>
              <input type="time" className="eva-input" value={form.start_tijd}
                onChange={e => setForm(f => ({ ...f, start_tijd: e.target.value }))} required />
            </div>
          </div>

          {/* Eind */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={dialogLabelStyle}>Einddatum</label>
              <input type="date" className="eva-input" value={form.eind_datum}
                onChange={e => setForm(f => ({ ...f, eind_datum: e.target.value }))} required />
            </div>
            <div>
              <label style={dialogLabelStyle}>Eindtijd</label>
              <input type="time" className="eva-input" value={form.eind_tijd}
                onChange={e => setForm(f => ({ ...f, eind_tijd: e.target.value }))} required />
            </div>
          </div>

          {/* Uren */}
          <div>
            <label style={dialogLabelStyle}>Uren</label>
            <input type="number" className="eva-input" value={form.uren}
              min="0" max="24" step="0.5"
              onChange={e => setForm(f => ({ ...f, uren: e.target.value }))} required />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="eva-btn-ghost"
              style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <Trash2 size={13} />
              Verwijderen
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={onClose} className="eva-btn-ghost">Annuleren</button>
              <button type="submit" disabled={isPending} className="eva-btn-primary">
                {isPending ? 'Bezig…' : 'Opslaan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── TimelineEntry ────────────────────────────────────────────────────────────

const hdlStyle: React.CSSProperties = {
  position: 'absolute', top: 0, bottom: 0, width: 8,
  cursor: 'ew-resize', zIndex: 5,
  background: 'rgba(255,255,255,0.20)', borderRadius: 2,
}

function TimelineEntry({
  entry, left, width, top, dossier_id, dossier_titel, kleur: kleurOverride, ppd, onEdit, onResized,
}: {
  entry:         PlanningItemVerrijkt
  left:          number
  width:         number
  top:           number
  dossier_id:    string
  dossier_titel: string
  kleur?:        string
  ppd:           number
  onEdit:        () => void
  onResized:     (id: string, newStartDt: string, newEindDt: string) => void
}) {
  const kleur = kleurOverride ?? dossierKleur(dossier_id)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `timeline-entry-${entry.id}`,
    data: { type: 'timeline-entry', entry, dossier_id },
  })
  const taakTitel = entry.planning_activiteiten?.titel ?? '—'

  const resizeRef        = useRef<{ type: 'left' | 'right'; startX: number } | null>(null)
  const suppressClickRef = useRef(false)

  function startResize(ev: React.PointerEvent, type: 'left' | 'right') {
    ev.stopPropagation()
    ev.preventDefault()
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    resizeRef.current = { type, startX: ev.clientX }
    suppressClickRef.current = true
  }

  function onResizeMove(ev: React.PointerEvent) {
    if (!resizeRef.current) return
    ev.stopPropagation()
  }

  function onResizeUp(ev: React.PointerEvent) {
    if (!resizeRef.current) return
    const dx   = ev.clientX - resizeRef.current.startX
    const type = resizeRef.current.type
    resizeRef.current = null
    const days = Math.round(dx / ppd)
    if (days === 0) return
    let ns = entry.start_dt, ne = entry.eind_dt
    if (type === 'left')  { ns = verschuifTs(entry.start_dt, days); if (ns >= ne) return }
    if (type === 'right') { ne = verschuifTs(entry.eind_dt,  days); if (ne <= ns) return }
    onResized(entry.id, ns, ne)
  }

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (suppressClickRef.current) { suppressClickRef.current = false; return }
        onEdit()
      }}
      style={{
        position: 'absolute',
        top, height: ITEM_H,
        left, width: Math.max(0, width - 2),
        borderRadius: 5,
        background: kleur,
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
        display: 'flex', alignItems: 'center',
        paddingLeft: 7,
        overflow: 'hidden',
        userSelect: 'none',
        zIndex: 4,
        boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
      }}
      title={`${dossier_titel} — ${taakTitel} (${entry.uren}u)`}
    >
      {/* DS white left-highlight strip */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: 'rgba(255,255,255,0.45)',
        borderRadius: '2px 0 0 2px',
        pointerEvents: 'none',
      }} />
      <div style={{ ...hdlStyle, left: 0 }}
        onPointerDown={ev => startResize(ev, 'left')}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />
      {width > 40 && (
        <span style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
          color: 'white',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {width > 80 ? dossier_titel : taakTitel}
        </span>
      )}
      <div style={{ ...hdlStyle, right: 0 }}
        onPointerDown={ev => startResize(ev, 'right')}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeUp}
      />
    </div>
  )
}

// ─── DroppableTimelineCell ────────────────────────────────────────────────────

function DroppableTimelineCell({
  id, medewerker_id, datum, left, width, top, hoogte, background, isOver, geblokkeerd, title,
}: {
  id:            string
  medewerker_id: string
  datum:         string
  left:          number
  width:         number
  top:           number
  hoogte:        number
  background:    string
  isOver:        boolean
  geblokkeerd?:  boolean
  title?:        string
}) {
  const { setNodeRef } = useDroppable({ id, data: { medewerker_id, datum } })
  return (
    <div
      ref={geblokkeerd ? undefined : setNodeRef}
      title={title}
      style={{
        position: 'absolute',
        top, height: hoogte,
        left, width,
        background: isOver && !geblokkeerd ? 'rgba(31,122,58,0.15)' : background,
        transition: 'background 0.1s',
        cursor: geblokkeerd ? 'not-allowed' : undefined,
      }}
    />
  )
}

// ─── AgendaTimelineRij (bedrijfsagenda-rij bovenaan) ─────────────────────────

function AgendaTimelineRij({
  items, feestdagen, layout, dagen,
}: {
  items:      BedrijfsagendaItemMetDoelgroep[]
  feestdagen: BedrijfsagendaVirtueel[]
  layout:     PlanningLayout
  dagen:      Date[]
}) {
  const { ppd, vs } = layout
  const top = 0

  function renderBar(
    id: string, titel: string, start_datum: string, eind_datum: string, kleur: string,
    start_tijd?: string | null, eind_tijd?: string | null,
  ) {
    const dayOff = differenceInCalendarDays(parseISO(start_datum), startOfDay(vs))
    let left: number, width: number
    if (start_tijd && eind_tijd) {
      const sMin = parseTime(start_tijd), eMin = parseTime(eind_tijd)
      left  = dayOff * ppd + (sMin / 1440) * ppd
      width = Math.max(ppd * 0.03, ((eMin - sMin) / 1440) * ppd)
    } else {
      const duur = Math.max(1, Math.round((new Date(eind_datum).getTime() - new Date(start_datum).getTime()) / 86400000) + 1)
      left  = dayOff * ppd
      width = duur * ppd
    }
    if (left + width <= 0 || left >= dagen.length * ppd) return null
    const cLeft  = Math.max(0, left)
    const cWidth = Math.min(width, dagen.length * ppd - cLeft) - 2
    return (
      <div
        key={id}
        title={`${titel} · ${start_datum}${eind_datum !== start_datum ? ` – ${eind_datum}` : ''}${start_tijd ? ` ${start_tijd}–${eind_tijd}` : ''}`}
        style={{
          position: 'absolute',
          top: top + 5, height: RIJ_HOOGTE - 10,
          left: cLeft, width: cWidth,
          borderRadius: 5, background: kleur, opacity: 0.85,
          display: 'flex', alignItems: 'center',
          paddingLeft: 7, overflow: 'hidden',
          zIndex: 4, pointerEvents: 'auto',
        }}
      >
        {cWidth > 40 && (
          <span style={{
            fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
            color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {titel}
          </span>
        )}
      </div>
    )
  }

  return (
    <>
      <div style={{
        position: 'absolute', top, left: 0, right: 0, height: RIJ_HOOGTE,
        background: 'rgba(var(--accent-rgb, 59,130,246), 0.04)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: top + RIJ_HOOGTE - 1,
        left: 0, right: 0, height: 1, background: KLEUR.border,
        pointerEvents: 'none',
      }} />
      {items.map(item =>
        renderBar(
          item.id, item.titel, item.start_datum, item.eind_datum,
          item.kleur ?? bedrijfsagendaTypeKleur[item.type as BedrijfsagendaType] ?? '#64748b',
          item.start_tijd, item.eind_tijd,
        )
      )}
      {feestdagen.map(f =>
        renderBar(f.id, f.titel, f.start_datum, f.eind_datum, f.kleur ?? '#f97316')
      )}
    </>
  )
}

// ─── TimelineRij ──────────────────────────────────────────────────────────────

function TimelineRij({
  medewerker, top, rijHoogte, dagen, layout, bars, roosters, afwezigheid,
  overCellId, dossierMap, kleurweergave, medewerkerKleuren, uursoortKleuren,
  feestdagenDagen, feestdagenNamen, atvDagen, onEditEntry, onResizedEntry,
}: {
  medewerker:        Medewerker
  top:               number
  rijHoogte:         number
  dagen:             Date[]
  layout:            PlanningLayout
  bars:              LanedBar[]
  roosters:          MedewerkerRooster[]
  afwezigheid:       MedewerkerAfwezigheid[]
  overCellId:        string | null
  dossierMap:        Record<string, string>
  kleurweergave:     Kleurweergave
  medewerkerKleuren: Record<string, string | null>
  uursoortKleuren:   Record<string, string>
  feestdagenDagen:   Set<string>
  feestdagenNamen:   Record<string, string>
  atvDagen:          Set<string>
  onEditEntry:       (entry: PlanningItemVerrijkt & { dossier_id?: string }) => void
  onResizedEntry:    (id: string, ns: string, ne: string) => void
}) {
  const { ppd } = layout

  function buitenRooster(dag: Date): boolean {
    const iso    = dag.toISOString().slice(0, 10)
    const dagNum = dag.getDay() === 0 ? 7 : dag.getDay()
    const actief = roosters.find(r => {
      const tot = r.geldig_tot ?? '9999-12-31'
      return iso >= r.geldig_vanaf && iso <= tot
    })
    if (!actief) return isWeekend(dag)
    return !(actief.werkdagen ?? []).includes(dagNum)
  }

  function isAfwezig(dag: Date): boolean {
    const iso = dag.toISOString().slice(0, 10)
    return afwezigheid.some(a => iso >= a.start_datum && iso <= a.eind_datum)
  }

  return (
    <>
      {/* Drop-cells + dag-achtergrond */}
      {dagen.map((dag, i) => {
        const iso         = dag.toISOString().slice(0, 10)
        const buiten      = buitenRooster(dag)
        const afwez       = isAfwezig(dag)
        const feest       = feestdagenDagen.has(iso)
        const atv         = atvDagen.has(iso)
        const cellId      = `tcell-${medewerker.id}-${iso}`
        const bg          = feest  ? 'rgba(251,146,60,0.12)'
                          : atv    ? 'rgba(8,145,178,0.10)'
                          : (buiten && !isWeekend(dag)) ? 'rgba(0,0,0,0.04)'
                          : 'transparent'
        const geblokkeerd = feest || atv
        const cellTitle   = feest ? feestdagenNamen[iso]
                          : atv   ? 'ATV-dag'
                          : undefined
        return (
          <DroppableTimelineCell
            key={cellId}
            id={cellId}
            medewerker_id={medewerker.id}
            datum={iso}
            left={i * ppd}
            width={ppd}
            top={top}
            hoogte={rijHoogte}
            background={bg}
            isOver={overCellId === cellId}
            geblokkeerd={geblokkeerd}
            title={cellTitle}
          />
        )
      })}

      {/* Rij-onderlijn */}
      <div style={{
        position: 'absolute', top: top + rijHoogte - 1,
        left: 0, right: 0, height: 1, background: KLEUR.border,
        pointerEvents: 'none',
      }} />

      {/* Bars per lane */}
      {bars.map((bar, idx) => {
        const cLeft  = Math.max(0, bar.left)
        const cWidth = Math.min(bar.width, dagen.length * ppd - cLeft) - 2
        const barTop = top + ROW_PAD + bar.lane * (ITEM_H + LANE_GAP)
        if (cWidth <= 0) return null

        if (bar.kind === 'entry') {
          const { entry } = bar
          const dossier_id = entry.dossier_id ?? ''
          const titel      = dossierMap[dossier_id] ?? dossier_id
          const uursoortId = entry.planning_activiteiten?.uursoort_id as string | undefined
          const entryKleur = kleurweergave === 'uursoort'
            ? (uursoortId ? (uursoortKleuren[uursoortId] ?? '#4a7c9e') : '#4a7c9e')
            : (medewerkerKleuren[medewerker.id] ?? medKleur(medewerker.id))
          return (
            <TimelineEntry
              key={`entry-${entry.id}`}
              entry={entry}
              left={cLeft}
              width={cWidth}
              top={barTop}
              dossier_id={dossier_id}
              dossier_titel={titel}
              kleur={entryKleur}
              ppd={ppd}
              onEdit={() => onEditEntry(entry)}
              onResized={onResizedEntry}
            />
          )
        }

        if (bar.kind === 'verlof') {
          const a     = bar.item
          const kleur = AFWEZIGHEID_KLEUR[a.type]
          const label = medewerkerAfwezigheidLabels[a.type]
          return (
            <div
              key={`verlof-${a.id}-${idx}`}
              title={`${label}${a.start_tijd ? ` · ${a.start_tijd}–${a.eind_tijd}` : ''}${a.opmerking ? ` · ${a.opmerking}` : ''}`}
              style={{
                position: 'absolute',
                top: barTop, height: ITEM_H,
                left: cLeft, width: cWidth,
                borderRadius: 5,
                background: kleur + '28',
                borderLeft: `3px solid ${kleur}`,
                display: 'flex', alignItems: 'center',
                paddingLeft: 6, overflow: 'hidden',
                zIndex: 5, pointerEvents: 'none',
              }}
            >
              {cWidth > 32 && (
                <span style={{
                  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                  color: kleur, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {label}
                </span>
              )}
            </div>
          )
        }

        if (bar.kind === 'agenda') {
          const item  = bar.item
          const kleur = item.kleur ?? bedrijfsagendaTypeKleur[item.type as BedrijfsagendaType] ?? '#64748b'
          return (
            <div
              key={`agenda-${item.id}-${idx}`}
              title={`${item.titel}${item.start_tijd ? ` · ${item.start_tijd}–${item.eind_tijd}` : ''}`}
              style={{
                position: 'absolute',
                top: barTop, height: ITEM_H,
                left: cLeft, width: cWidth,
                borderRadius: 5, background: kleur, opacity: 0.75,
                border: '2px solid var(--bg-elev)',
                display: 'flex', alignItems: 'center',
                paddingLeft: 6, overflow: 'hidden',
                zIndex: 6, pointerEvents: 'none',
              }}
            >
              {cWidth > 40 && (
                <span style={{
                  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                  color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {item.titel}
                </span>
              )}
            </div>
          )
        }

        if (bar.kind === 'feestdag') {
          const f = bar.item
          return (
            <div
              key={`feestdag-${f.id}-${idx}`}
              title={f.titel}
              style={{
                position: 'absolute',
                top: barTop, height: ITEM_H,
                left: cLeft, width: cWidth,
                borderRadius: 5, background: f.kleur ?? '#f97316', opacity: 0.85,
                display: 'flex', alignItems: 'center',
                paddingLeft: 7, overflow: 'hidden',
                zIndex: 4, pointerEvents: 'none',
              }}
            >
              {cWidth > 40 && (
                <span style={{
                  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
                  color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {f.titel}
                </span>
              )}
            </div>
          )
        }

        return null
      })}
    </>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  medewerkers:  Medewerker[]
  entries:      (PlanningItemVerrijkt & { dossier_id?: string })[]
  roosters:     MedewerkerRooster[]
  afwezigheid:  MedewerkerAfwezigheid[]
  dossierMap:   Record<string, string>
  uursoorten?:  PlanningUursoort[]
  agendaItems?: BedrijfsagendaItemMetDoelgroep[]
  feestdagen?:  BedrijfsagendaVirtueel[]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedewerkerTimeline({
  medewerkers, entries: initialEntries, roosters, afwezigheid, dossierMap,
  uursoorten = [], agendaItems = [], feestdagen = [],
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [peildatum, setPeildatum] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [view,      setView]      = useState<View>('week')
  const [viewStart, setViewStart] = useState(
    () => viewBereik('week', startOfWeek(new Date(), { weekStartsOn: 1 })).vs)
  const [entries,   setEntries]   = useState(initialEntries)
  const [activeItem,    setActiveItem]    = useState<{ entry: PlanningItemVerrijkt; dossier_id: string } | null>(null)
  const [overCellId,    setOverCellId]    = useState<string | null>(null)
  const [verlofModalOpen, setVerlofModalOpen] = useState(false)
  const [editingEntry,  setEditingEntry]  = useState<(PlanningItemVerrijkt & { dossier_id?: string }) | null>(null)

  const wrapRef = useRef<HTMLDivElement>(null)
  const [availableW, setAvailableW] = useState(800)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setAvailableW(Math.max(100, entry.contentRect.width - LABEL_W))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const [kleurweergave, setKleurweergave] = useKleurweergave()

  const layout = usePlanningLayout({ peildatum, view, availableW })
  const vs = viewStart
  const ve = useMemo(() => addDays(viewStart, layout.totalDays - 1), [viewStart, layout.totalDays])
  const { spans: effSpans, cols: effCols } = useMemo(
    () => buildHeader(view, vs, ve, layout.ppd), [view, vs, ve, layout.ppd])
  const effGridUnits = useMemo(
    () => buildGridUnits(view, vs, ve, layout.ppd), [view, vs, ve, layout.ppd])
  const effectiefLayout = useMemo<PlanningLayout>(() => ({
    ...layout,
    vs, ve,
    spans: effSpans, cols: effCols, gridUnits: effGridUnits,
    dagOffset: (iso: string) => differenceInDays(startOfDay(parseISO(iso)), startOfDay(vs)),
    xVoor: (iso: string) => Math.max(0, Math.min(layout.totalW,
      differenceInDays(startOfDay(parseISO(iso)), startOfDay(vs)) * layout.ppd)),
  }), [layout, vs, ve, effSpans, effCols, effGridUnits])

  const dagen  = useMemo(() => eachDayOfInterval({ start: vs, end: ve }), [vs, ve])

  const medewerkerKleuren = useMemo(() => Object.fromEntries(medewerkers.map(m => [m.id, m.kleur])), [medewerkers])
  const uursoortKleuren   = useMemo(() => Object.fromEntries(uursoorten.filter(u => u.kleur).map(u => [u.id, u.kleur])), [uursoorten])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  )

  const entriesPerMedewerker = useMemo(() => {
    const map: Record<string, typeof entries> = {}
    for (const e of entries) {
      if (!map[e.medewerker_id]) map[e.medewerker_id] = []
      map[e.medewerker_id].push(e)
    }
    return map
  }, [entries])

  const roostersPerMedewerker    = useMemo(() => groupBy(roosters,    r => r.medewerker_id), [roosters])
  const afwezigheidPerMedewerker = useMemo(() => groupBy(afwezigheid, a => a.medewerker_id), [afwezigheid])

  const feestdagenDagen = useMemo(() => new Set(feestdagen.map(f => f.start_datum)), [feestdagen])
  const feestdagenNamen = useMemo(
    () => Object.fromEntries(feestdagen.map(f => [f.start_datum, f.titel])),
    [feestdagen],
  )
  const atvDagen = useMemo(() => {
    const set = new Set<string>()
    for (const item of agendaItems) {
      if (item.type === 'atv_dag') {
        const s = new Date(item.start_datum)
        const e = new Date(item.eind_datum)
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1))
          set.add(d.toISOString().slice(0, 10))
      }
    }
    return set
  }, [agendaItems])

  const agendaItemsInBereik = useMemo(() => {
    const start = vs.toISOString().slice(0, 10)
    const einde = ve.toISOString().slice(0, 10)
    return agendaItems.filter(a => a.eind_datum >= start && a.start_datum <= einde)
  }, [agendaItems, vs, ve])

  const feestdagenInBereik = useMemo(() => {
    const start = vs.toISOString().slice(0, 10)
    const einde = ve.toISOString().slice(0, 10)
    return feestdagen.filter(f => f.eind_datum >= start && f.start_datum <= einde)
  }, [feestdagen, vs, ve])

  const heeftAgendaRij = agendaItems.length > 0 || feestdagen.length > 0

  // Per-medewerker layout: bars (with lanes) + rijhoogte + absolute top
  const medewerkerLayout = useMemo(() => {
    let accTop = heeftAgendaRij ? RIJ_HOOGTE : 0
    return medewerkers.map(m => {
      const bars = berekenLanes(
        dagen.length,
        layout.ppd,
        vs,
        entriesPerMedewerker[m.id] ?? [],
        afwezigheidPerMedewerker[m.id] ?? [],
        agendaItemsInBereik.filter(item => itemGeldtVoorMedewerker(item, m)),
        feestdagenInBereik,
      )
      const numLanes  = bars.length ? Math.max(...bars.map(b => b.lane)) + 1 : 0
      const rijHoogte = rijHoogteVoor(numLanes)
      const row = { medewerker: m, top: accTop, bars, rijHoogte }
      accTop += rijHoogte
      return row
    })
  }, [
    medewerkers, entriesPerMedewerker, afwezigheidPerMedewerker,
    agendaItemsInBereik, feestdagenInBereik, dagen, layout.ppd, vs, heeftAgendaRij,
  ])

  const bodyHoogte = (heeftAgendaRij ? RIJ_HOOGTE : 0) +
    medewerkerLayout.reduce((s, ml) => s + ml.rijHoogte, 0)

  async function onDragEnd(event: DragEndEvent) {
    setActiveItem(null)
    setOverCellId(null)
    const cellData = event.over?.data.current as { medewerker_id: string; datum: string } | undefined
    if (!cellData) return
    const active = event.active.data.current
    if (!active?.type?.startsWith('timeline')) return

    const entry      = active.entry as PlanningItemVerrijkt
    const dossier_id = active.dossier_id as string
    const origStart  = parseISO(entry.start_dt)
    const origEind   = parseISO(entry.eind_dt)
    const duur       = differenceInMinutes(origEind, origStart)
    const nieuwStart = new Date(`${cellData.datum}T${format(origStart, 'HH:mm:ss')}`)
    const nieuwEind  = addMinutes(nieuwStart, duur)

    const result = await verplaatsPlanningItem(entry.id, {
      start_dt:      nieuwStart.toISOString(),
      eind_dt:       nieuwEind.toISOString(),
      medewerker_id: cellData.medewerker_id !== entry.medewerker_id ? cellData.medewerker_id : undefined,
      dossier_id,
      uursoort_id:   entry.planning_activiteiten?.uursoort_id ?? null,
      uren:          entry.uren,
    })

    if (!result.ok) { toast.error(result.error); return }

    setEntries(prev => prev.map(e => {
      if (e.id !== entry.id) return e
      return { ...e, start_dt: nieuwStart.toISOString(), eind_dt: nieuwEind.toISOString(), medewerker_id: cellData.medewerker_id }
    }))
    startTransition(() => router.refresh())
  }

  async function onResizedEntry(id: string, ns: string, ne: string) {
    const entry = entries.find(e => e.id === id)
    if (!entry) return
    const result = await verplaatsPlanningItem(id, {
      start_dt:    ns,
      eind_dt:     ne,
      medewerker_id: entry.medewerker_id,
      dossier_id:  entry.dossier_id ?? '',
      uursoort_id: entry.planning_activiteiten?.uursoort_id ?? null,
      uren:        entry.uren,
    })
    if (!result.ok) { toast.error(result.error); return }
    setEntries(prev => prev.map(e => e.id === id ? { ...e, start_dt: ns, eind_dt: ne } : e))
    startTransition(() => router.refresh())
  }

  const labelKolom = (
    <div>
      {heeftAgendaRij && (
        <div style={{
          height: RIJ_HOOGTE, display: 'flex', alignItems: 'center',
          paddingLeft: 12, borderBottom: `1px solid ${KLEUR.border}`,
          background: 'rgba(var(--accent-rgb, 59,130,246), 0.06)',
        }}>
          <span style={{
            fontSize: 9, fontWeight: 700,
            color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.1em',
          }}>Bedrijfsagenda</span>
        </div>
      )}
      {medewerkerLayout.map(({ medewerker: m, rijHoogte }) => (
        <Link key={m.id} href={`/medewerkers/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            height: rijHoogte, display: 'flex', alignItems: 'center',
            paddingLeft: 12, gap: 8, borderBottom: `1px solid ${KLEUR.border}`,
            background: KLEUR.bgElev,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: medewerkerKleuren[m.id] ?? medKleur(m.id),
              display: 'grid', placeItems: 'center', color: 'white',
              fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, flexShrink: 0,
            }}>
              {[m.voornaam[0], m.achternaam[0]].join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: KLEUR.fg,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {[m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')}
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )

  const body = (
    <>
      {heeftAgendaRij && (
        <AgendaTimelineRij
          items={agendaItemsInBereik}
          feestdagen={feestdagenInBereik}
          layout={layout}
          dagen={dagen}
        />
      )}
      {medewerkerLayout.map(({ medewerker: m, top, bars, rijHoogte }) => (
        <TimelineRij
          key={m.id}
          medewerker={m}
          top={top}
          rijHoogte={rijHoogte}
          dagen={dagen}
          layout={layout}
          bars={bars}
          roosters={roostersPerMedewerker[m.id] ?? []}
          afwezigheid={afwezigheidPerMedewerker[m.id] ?? []}
          overCellId={overCellId}
          dossierMap={dossierMap}
          kleurweergave={kleurweergave}
          medewerkerKleuren={medewerkerKleuren}
          uursoortKleuren={uursoortKleuren}
          feestdagenDagen={feestdagenDagen}
          feestdagenNamen={feestdagenNamen}
          atvDagen={atvDagen}
          onEditEntry={entry => setEditingEntry(entry)}
          onResizedEntry={onResizedEntry}
        />
      ))}
    </>
  )

  return (
    <DndContext
      sensors={sensors}
      onDragStart={e => {
        const d = e.active.data.current
        if (d?.type?.startsWith('timeline')) setActiveItem({ entry: d.entry, dossier_id: d.dossier_id })
      }}
      onDragOver={e => setOverCellId(e.over ? String(e.over.id) : null)}
      onDragEnd={onDragEnd}
      onDragCancel={() => { setActiveItem(null); setOverCellId(null) }}
    >
      <div ref={wrapRef}>
        <PlanningShell
          layout={effectiefLayout}
          toolbar={
            <>
              <PeriodeNav
                peildatum={peildatum}
                view={view}
                onPeildatum={pd => { setPeildatum(pd); setViewStart(viewBereik(view, pd).vs) }}
                onView={v => {
                  setView(v)
                  let pd = peildatum
                  if (v === 'maand') pd = startOfMonth(peildatum)
                  if (v === 'week' || v === '2weken') pd = startOfWeek(peildatum, { weekStartsOn: 1 })
                  setPeildatum(pd)
                  setViewStart(viewBereik(v, pd).vs)
                }}
                onVandaag={() => {
                  const pd = startOfWeek(new Date(), { weekStartsOn: 1 })
                  setPeildatum(pd)
                  setViewStart(viewBereik(view, pd).vs)
                }}
                rightSlot={
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => setVerlofModalOpen(true)}
                      className="eva-btn-ghost"
                    >
                      + Verlof
                    </button>
                    <KleurweergaveToggle waarde={kleurweergave} onChange={setKleurweergave} />
                  </div>
                }
              />
              <PeriodeScrubber view={view} peildatum={peildatum} vs={viewStart} onChange={setViewStart} />
            </>
          }
          labelHeader="Medewerker"
          labelKolom={labelKolom}
          body={body}
          bodyHoogte={bodyHoogte}
        />
      </div>

      <DragOverlay>
        {activeItem && (
          <div style={{
            height: ITEM_H, width: 160,
            background: dossierKleur(activeItem.dossier_id),
            borderRadius: 5, opacity: 0.9,
            display: 'flex', alignItems: 'center', paddingLeft: 8,
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          }}>
            <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: 'white' }}>
              {dossierMap[activeItem.dossier_id] ?? '—'}
            </span>
          </div>
        )}
      </DragOverlay>

      {verlofModalOpen && (
        <VerlofModal
          medewerkers={medewerkers}
          periodeStart={vs.toISOString().slice(0, 10)}
          periodeEinde={ve.toISOString().slice(0, 10)}
          onClose={() => setVerlofModalOpen(false)}
          onSaved={() => {
            setVerlofModalOpen(false)
            startTransition(() => router.refresh())
          }}
        />
      )}

      {editingEntry && (
        <PlanningItemEditDialog
          entry={editingEntry}
          medewerkers={medewerkers}
          dossierMap={dossierMap}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null)
            startTransition(() => router.refresh())
          }}
        />
      )}
    </DndContext>
  )
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of arr) {
    const k = key(item)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}
