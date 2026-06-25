'use client'

import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor,
  useDraggable, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import {
  addDays, addMinutes, differenceInCalendarDays, differenceInMinutes,
  eachDayOfInterval, format, isWeekend, parseISO, startOfDay,
} from 'date-fns'
import { AlertTriangle, Trash2, X } from 'lucide-react'
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
  KLEUR, MIN_BAR_W, PeriodeNav, PeriodeScrubber, PlanningShell, RIJ_HOOGTE,
  usePlanningController, verschuifTs, type PlanningLayout,
} from './layout/index'
import { crewKleur } from '@/lib/utils/crew'
import VerlofModal from './VerlofModal'

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_H  = 28
const ROW_PAD = 6
/** Vaste rijhoogte — taken worden niet meer gestapeld in lanes (één strook). */
const RIJ_VAST = ROW_PAD * 2 + ITEM_H

const DAG_MS = 86_400_000

const CREW_KLEUREN = ['#7c3aed', '#0f9b8e', '#2f9e44', '#1f8a5b', '#f59e0b', '#3b82f6']

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

type SortKey = 'voornaam' | 'afdeling' | 'functie' | 'ploeg'
const SORT_OPTIES: { key: SortKey; label: string }[] = [
  { key: 'voornaam', label: 'Voornaam' },
  { key: 'afdeling', label: 'Afdeling' },
  { key: 'functie',  label: 'Functie' },
  { key: 'ploeg',    label: 'Ploeg' },
]

// ─── Conflict-detectie (op echte tijdstippen) ───────────────────────────────────

type Interval = { s: number; e: number } // ms-bereik [start, eind)

/**
 * Conflictsegmenten op basis van werkelijke tijdstippen, los van de gerenderde
 * balkbreedte: (a) waar twee werk-taken in tijd overlappen, en (b) waar werk binnen
 * een blok-periode valt (verlof/afwezigheid/feestdag/ATV).
 */
function berekenConflicten(work: Interval[], blokken: Interval[]): Interval[] {
  const segs: Interval[] = []
  const sorted = [...work].sort((a, b) => a.s - b.s)
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].s >= sorted[i].e) break
      segs.push({ s: Math.max(sorted[i].s, sorted[j].s), e: Math.min(sorted[i].e, sorted[j].e) })
    }
  }
  for (const w of work) {
    for (const b of blokken) {
      const s = Math.max(w.s, b.s)
      const e = Math.min(w.e, b.e)
      if (s < e) segs.push({ s, e })
    }
  }
  return segs
}

function afwezigheidInterval(a: MedewerkerAfwezigheid): Interval {
  if (a.start_tijd && a.eind_tijd) {
    return {
      s: new Date(`${a.start_datum}T${a.start_tijd}`).getTime(),
      e: new Date(`${a.eind_datum}T${a.eind_tijd}`).getTime(),
    }
  }
  return { s: parseISO(a.start_datum).getTime(), e: parseISO(a.eind_datum).getTime() + DAG_MS }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function parseTime(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number)
  return h * 60 + (m || 0)
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

function volledigeNaam(m: Pick<Medewerker, 'voornaam' | 'tussenvoegsel' | 'achternaam'>): string {
  return [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' ')
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
                  {volledigeNaam(m)}
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
  const { totalW, xVoor, breedteVoor } = layout
  const top = 0

  function renderBar(
    id: string, titel: string, start_datum: string, eind_datum: string, kleur: string,
    start_tijd?: string | null, eind_tijd?: string | null,
  ) {
    let left: number, width: number
    if (start_tijd && eind_tijd) {
      left  = xVoor(`${start_datum}T${start_tijd}`)
      width = Math.max(MIN_BAR_W, xVoor(`${start_datum}T${eind_tijd}`) - left)
    } else {
      left  = xVoor(start_datum)
      width = breedteVoor(start_datum, addDays(parseISO(eind_datum), 1).toISOString())
    }
    if (left + width <= 0 || left >= totalW) return null
    const cLeft  = Math.max(0, left)
    const cWidth = Math.min(width, totalW - cLeft) - 2
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
  medewerker, top, dagen, layout, entries, conflicten, roosters, afwezigheid,
  overCellId, dossierMap, projectleiders,
  feestdagenDagen, feestdagenNamen, atvDagen, onEditEntry, onResizedEntry,
}: {
  medewerker:        Medewerker
  top:               number
  dagen:             Date[]
  layout:            PlanningLayout
  entries:           (PlanningItemVerrijkt & { dossier_id?: string })[]
  conflicten:        Interval[]
  roosters:          MedewerkerRooster[]
  afwezigheid:       MedewerkerAfwezigheid[]
  overCellId:        string | null
  dossierMap:        Record<string, string>
  projectleiders:    Record<string, { kleur: string | null; naam: string | null }>
  feestdagenDagen:   Set<string>
  feestdagenNamen:   Record<string, string>
  atvDagen:          Set<string>
  onEditEntry:       (entry: PlanningItemVerrijkt & { dossier_id?: string }) => void
  onResizedEntry:    (id: string, ns: string, ne: string) => void
}) {
  const { ppd, totalW, xVoor, breedteVoor } = layout
  const dagLenW = totalW

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

  function afwezigheidOpDag(dag: Date): MedewerkerAfwezigheid | undefined {
    const iso = dag.toISOString().slice(0, 10)
    return afwezigheid.find(a => iso >= a.start_datum && iso <= a.eind_datum)
  }

  return (
    <>
      {/* Drop-cells + dag-achtergrond (verlof/afwezigheid/feestdag/ATV als shading) */}
      {dagen.map((dag, i) => {
        const iso    = dag.toISOString().slice(0, 10)
        const buiten = buitenRooster(dag)
        const afwez  = afwezigheidOpDag(dag)
        const feest  = feestdagenDagen.has(iso)
        const atv    = atvDagen.has(iso)
        const cellId = `tcell-${medewerker.id}-${iso}`
        const bg     = feest ? 'rgba(251,146,60,0.12)'
                     : atv   ? 'rgba(8,145,178,0.10)'
                     : afwez ? `${AFWEZIGHEID_KLEUR[afwez.type]}1f`
                     : (buiten && !isWeekend(dag)) ? 'rgba(0,0,0,0.04)'
                     : 'transparent'
        const geblokkeerd = feest || atv
        const cellTitle   = feest ? feestdagenNamen[iso]
                          : atv   ? 'ATV-dag'
                          : afwez ? medewerkerAfwezigheidLabels[afwez.type]
                          : undefined
        return (
          <DroppableTimelineCell
            key={cellId}
            id={cellId}
            medewerker_id={medewerker.id}
            datum={iso}
            left={xVoor(dag.toISOString())}
            width={breedteVoor(dag.toISOString(), addDays(dag, 1).toISOString())}
            top={top}
            hoogte={RIJ_VAST}
            background={bg}
            isOver={overCellId === cellId}
            geblokkeerd={geblokkeerd}
            title={cellTitle}
          />
        )
      })}

      {/* Rij-onderlijn */}
      <div style={{
        position: 'absolute', top: top + RIJ_VAST - 1,
        left: 0, right: 0, height: 1, background: KLEUR.border,
        pointerEvents: 'none',
      }} />

      {/* Werk-taken op één strook (geen stapeling) */}
      {entries.map(entry => {
        const left  = xVoor(entry.start_dt)
        const rawW  = breedteVoor(entry.start_dt, entry.eind_dt)
        const width = Math.max(MIN_BAR_W, rawW)
        if (left + width <= 0 || left >= dagLenW) return null
        const cLeft  = Math.max(0, left)
        const cWidth = Math.min(width, dagLenW - cLeft)
        if (cWidth <= 0) return null

        const dossier_id = entry.dossier_id ?? ''
        const titel      = dossierMap[dossier_id] ?? dossier_id
        // Balkkleur = kleur van de projectleider van het dossier.
        const pl         = projectleiders[dossier_id]
        const entryKleur = pl?.kleur ?? crewKleur(pl?.naam ?? titel ?? '—')
        return (
          <TimelineEntry
            key={`entry-${entry.id}`}
            entry={entry}
            left={cLeft}
            width={cWidth}
            top={top + ROW_PAD}
            dossier_id={dossier_id}
            dossier_titel={titel}
            kleur={entryKleur}
            ppd={ppd}
            onEdit={() => onEditEntry(entry)}
            onResized={onResizedEntry}
          />
        )
      })}

      {/* Conflict-gloed — overlappend werk of werk tijdens verlof/feestdag/ATV */}
      {conflicten.map((seg, i) => {
        const left  = xVoor(new Date(seg.s).toISOString())
        const rawW  = xVoor(new Date(seg.e).toISOString()) - left
        const width = Math.max(MIN_BAR_W, rawW)
        if (left + width <= 0 || left >= dagLenW) return null
        const cLeft  = Math.max(0, left)
        const cWidth = Math.min(width, dagLenW - cLeft)
        if (cWidth <= 0) return null
        return (
          <div
            key={`conflict-${i}`}
            title="Dubbel ingepland / conflict"
            style={{
              position: 'absolute',
              top: top + 2, height: RIJ_VAST - 4,
              left: cLeft, width: cWidth,
              borderRadius: 5,
              background: 'rgba(239,68,68,0.22)',
              border: '1px solid rgba(239,68,68,0.75)',
              boxShadow: '0 0 7px 1px rgba(239,68,68,0.55)',
              pointerEvents: 'none', zIndex: 7,
            }}
          />
        )
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
  projectleiders?: Record<string, { kleur: string | null; naam: string | null }>
  ploegNamen?:  Record<string, string>
  uursoorten?:  PlanningUursoort[]
  agendaItems?: BedrijfsagendaItemMetDoelgroep[]
  feestdagen?:  BedrijfsagendaVirtueel[]
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function MedewerkerTimeline({
  medewerkers, entries: initialEntries, roosters, afwezigheid, dossierMap,
  projectleiders = {}, ploegNamen = {}, agendaItems = [], feestdagen = [],
}: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const {
    view, peildatum, layout, wrapRef, scrollRef,
    handlePeildatum, handleView, handleVandaag, handleScrub,
  } = usePlanningController({ defaultView: 'maand' })
  const { vs, ve, ppd } = layout

  const [entries,   setEntries]   = useState(initialEntries)
  const [activeItem,    setActiveItem]    = useState<{ entry: PlanningItemVerrijkt; dossier_id: string } | null>(null)
  const [overCellId,    setOverCellId]    = useState<string | null>(null)
  const [verlofModalOpen, setVerlofModalOpen] = useState(false)
  const [editingEntry,  setEditingEntry]  = useState<(PlanningItemVerrijkt & { dossier_id?: string }) | null>(null)

  const [selAfdelingen, setSelAfdelingen] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<SortKey>('voornaam')

  useEffect(() => { setEntries(initialEntries) }, [initialEntries])

  const dagen = useMemo(() => eachDayOfInterval({ start: vs, end: ve }), [vs, ve])

  const afdelingOpties = useMemo(
    () => [...new Set(medewerkers.map(m => m.afdeling).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'nl')),
    [medewerkers],
  )

  const zichtbareMedewerkers = useMemo(() => {
    let list = medewerkers
    if (selAfdelingen.length > 0) list = list.filter(m => m.afdeling && selAfdelingen.includes(m.afdeling))
    const cmp = (a: string | null, b: string | null) => (a ?? '').localeCompare(b ?? '', 'nl')
    // Lege sorteerwaarde (geen afdeling/functie/ploeg) onderaan, dan op voornaam.
    const opWaarde = (a: Medewerker, b: Medewerker, get: (m: Medewerker) => string) => {
      const av = get(a).trim()
      const bv = get(b).trim()
      if (!av && !bv) return cmp(a.voornaam, b.voornaam)
      if (!av) return 1
      if (!bv) return -1
      return cmp(av, bv) || cmp(a.voornaam, b.voornaam)
    }
    return [...list].sort((a, b) => {
      if (sortBy === 'afdeling') return opWaarde(a, b, m => m.afdeling ?? '')
      if (sortBy === 'functie')  return opWaarde(a, b, m => m.functie ?? '')
      if (sortBy === 'ploeg')    return opWaarde(a, b, m => ploegNamen[m.ploeg_id ?? ''] ?? '')
      return cmp(a.voornaam, b.voornaam) || cmp(a.achternaam, b.achternaam)
    })
  }, [medewerkers, selAfdelingen, sortBy, ploegNamen])

  const medewerkerKleuren = useMemo(() => Object.fromEntries(medewerkers.map(m => [m.id, m.kleur])), [medewerkers])

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

  // Blok-intervallen die voor iedereen gelden (feestdag/ATV) — voor conflictdetectie.
  const feestAtvIntervals = useMemo<Interval[]>(() => {
    const arr: Interval[] = []
    for (const iso of feestdagenDagen) { const t = parseISO(iso).getTime(); arr.push({ s: t, e: t + DAG_MS }) }
    for (const iso of atvDagen)        { const t = parseISO(iso).getTime(); arr.push({ s: t, e: t + DAG_MS }) }
    return arr
  }, [feestdagenDagen, atvDagen])

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

  // Per-medewerker layout: zichtbare entries + conflictsegmenten + vaste rijhoogte + top.
  const medewerkerLayout = useMemo(() => {
    const vsMs = vs.getTime()
    const veMs = ve.getTime() + DAG_MS
    let accTop = heeftAgendaRij ? RIJ_HOOGTE : 0
    return zichtbareMedewerkers.map(m => {
      const alle    = entriesPerMedewerker[m.id] ?? []
      const myEntries = alle.filter(e => {
        const s = parseISO(e.start_dt).getTime()
        const en = parseISO(e.eind_dt).getTime()
        return en >= vsMs && s <= veMs
      })
      const myAfw = afwezigheidPerMedewerker[m.id] ?? []
      const work: Interval[]   = myEntries.map(e => ({ s: parseISO(e.start_dt).getTime(), e: parseISO(e.eind_dt).getTime() }))
      const blokken: Interval[] = [...feestAtvIntervals, ...myAfw.map(afwezigheidInterval)]
      const conflicten = berekenConflicten(work, blokken)
      const row = { medewerker: m, top: accTop, entries: myEntries, conflicten, heeftConflict: conflicten.length > 0 }
      accTop += RIJ_VAST
      return row
    })
  }, [zichtbareMedewerkers, entriesPerMedewerker, afwezigheidPerMedewerker, feestAtvIntervals, vs, ve, heeftAgendaRij])

  const bodyHoogte = (heeftAgendaRij ? RIJ_HOOGTE : 0) + zichtbareMedewerkers.length * RIJ_VAST

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
      {medewerkerLayout.map(({ medewerker: m, heeftConflict }) => (
        <Link key={m.id} href={`/medewerkers/${m.id}`} style={{ textDecoration: 'none', display: 'block' }}>
          <div style={{
            height: RIJ_VAST, display: 'flex', alignItems: 'center',
            paddingLeft: 12, paddingRight: 8, gap: 8, borderBottom: `1px solid ${KLEUR.border}`,
            background: KLEUR.bgElev,
          }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%', background: medewerkerKleuren[m.id] ?? medKleur(m.id),
              display: 'grid', placeItems: 'center', color: 'white',
              fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, flexShrink: 0,
            }}>
              {[m.voornaam[0], m.achternaam[0]].join('').toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600, color: KLEUR.fg,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {volledigeNaam(m)}
              </div>
              {(m.functie || m.afdeling) && (
                <div style={{
                  fontSize: 9, color: KLEUR.fgMuted,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {[m.functie, m.afdeling].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
            {heeftConflict && (
              <span title="Dubbel ingepland / conflict" style={{ display: 'inline-flex', color: '#ef4444', flexShrink: 0 }}>
                <AlertTriangle size={15} />
              </span>
            )}
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
      {medewerkerLayout.map(({ medewerker: m, top, entries: rijEntries, conflicten }) => (
        <TimelineRij
          key={m.id}
          medewerker={m}
          top={top}
          dagen={dagen}
          layout={layout}
          entries={rijEntries}
          conflicten={conflicten}
          roosters={roosters.filter(r => r.medewerker_id === m.id)}
          afwezigheid={afwezigheidPerMedewerker[m.id] ?? []}
          overCellId={overCellId}
          dossierMap={dossierMap}
          projectleiders={projectleiders}
          feestdagenDagen={feestdagenDagen}
          feestdagenNamen={feestdagenNamen}
          atvDagen={atvDagen}
          onEditEntry={entry => setEditingEntry(entry)}
          onResizedEntry={onResizedEntry}
        />
      ))}
    </>
  )

  // ─── Slicer + sorteer-balk (bovenin) ─────────────────────────────────────────
  const segGroep = (children: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 2, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }}>
      {children}
    </div>
  )
  const sortControl = segGroep(
    SORT_OPTIES.map(o => (
      <button key={o.key} onClick={() => setSortBy(o.key)} style={{
        padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer',
        background: sortBy === o.key ? 'var(--accent)' : 'transparent',
        color: sortBy === o.key ? 'white' : 'var(--fg-muted)',
        fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      }}>
        {o.label}
      </button>
    )),
  )

  const slicerBalk = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
      {afdelingOpties.length >= 2 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Afdeling</span>
          {afdelingOpties.map(afd => {
            const actief = selAfdelingen.includes(afd)
            return (
              <button key={afd} onClick={() => setSelAfdelingen(prev =>
                actief ? prev.filter(a => a !== afd) : [...prev, afd]
              )} style={{
                padding: '3px 10px', borderRadius: 20, border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
                background: actief ? 'var(--accent)' : 'transparent',
                color: actief ? 'white' : 'var(--fg-muted)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer',
              }}>
                {afd}
              </button>
            )
          })}
          {selAfdelingen.length > 0 && (
            <button onClick={() => setSelAfdelingen([])} style={{
              padding: '3px 8px', borderRadius: 20, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--fg-muted)', fontSize: 10, cursor: 'pointer',
            }}>
              × wis
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sorteer</span>
        {sortControl}
      </div>
    </div>
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
        {slicerBalk}
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
              rightSlot={
                <button
                  type="button"
                  onClick={() => setVerlofModalOpen(true)}
                  className="eva-btn-ghost"
                >
                  + Verlof
                </button>
              }
            />
          }
          scrubber={<PeriodeScrubber view={view} peildatum={peildatum} vs={layout.periodeVs} onChange={handleScrub} />}
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
