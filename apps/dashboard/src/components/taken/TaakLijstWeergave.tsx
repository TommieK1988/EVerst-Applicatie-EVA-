'use client'

import { useState, useTransition, useEffect } from 'react'
import { ChevronDown, ChevronUp, Filter, GripVertical, Lock } from 'lucide-react'
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/taken/utils'
import TaakKaart from './TaakKaart'
import TaakDetailPanel from './TaakDetailPanel'
import { updateTaakVolgorde } from '@/app/(platform)/taken/actions/taken'
import type { TaakMetDetails, TaskStatus, TaskPrioriteit } from '@/lib/taken/supabase/database.types'

interface Props {
  taken: TaakMetDetails[]
  toonFilters?: boolean
  isTemplate?: boolean
  takenInLijst?: { id: string; titel: string }[]
  detailAlsDialog?: boolean
}

const STATUS_VOLGORDE: TaskStatus[] = ['open', 'in_behandeling', 'wacht_op', 'gereed', 'vervallen']
const STATUS_LABELS: Record<TaskStatus, string> = {
  open: 'Open', in_behandeling: 'In behandeling',
  wacht_op: 'Wacht op', gereed: 'Gereed', vervallen: 'Vervallen',
}

function SorteerbareTaakRij({
  taak,
  isGeblokkeerd,
  onClick,
}: {
  taak: TaakMetDetails
  isGeblokkeerd: boolean
  onClick: (t: TaakMetDetails) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: taak.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-start gap-2', isDragging && 'opacity-50', isGeblokkeerd && 'opacity-60')}
    >
      <button
        {...attributes}
        {...listeners}
        className="mt-3 p-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        tabIndex={-1}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0 relative">
        {isGeblokkeerd && (
          <div className="absolute right-2 top-2 z-10">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
          </div>
        )}
        <TaakKaart taak={taak} onClick={onClick} />
      </div>
    </div>
  )
}

export default function TaakLijstWeergave({ taken, toonFilters = true, isTemplate, takenInLijst = [], detailAlsDialog = false }: Props) {
  const [geselecteerdeTaak, setGeselecteerdeTaak] = useState<TaakMetDetails | null>(null)
  const [filterStatus, setFilterStatus]       = useState<TaskStatus | 'alle'>('alle')
  const [filterPrioriteit, setFilterPrioriteit] = useState<TaskPrioriteit | 'alle'>('alle')
  const [groepeerOp, setGroepeerOp]           = useState<'status' | 'prioriteit' | 'geen'>('status')
  const [ingeklapt, setIngeklapt]             = useState<Set<string>>(new Set())
  const [sorteerModus, setSorteerModus]       = useState(false)
  const [gesorteerd, setGesorteerd]           = useState<TaakMetDetails[]>([])
  const [, startTransition]                   = useTransition()

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const gereedeIds = new Set(taken.filter(t => t.status === 'gereed').map(t => t.id))

  const isGeblokkeerd = (taak: TaakMetDetails) =>
    !!taak.blocked_by_task_id && !gereedeIds.has(taak.blocked_by_task_id)

  const toggleSorteerModus = () => {
    if (!sorteerModus) {
      setGesorteerd([...taken].sort((a, b) => (a.volgorde ?? 0) - (b.volgorde ?? 0)))
      setGroepeerOp('geen')
    }
    setSorteerModus(v => !v)
  }

  // Sync fresh server data into gesorteerd (preserving local order) after revalidation
  useEffect(() => {
    if (!sorteerModus || gesorteerd.length === 0) return
    const taakMap = new Map(taken.map(t => [t.id, t]))
    setGesorteerd(prev => prev.map(t => taakMap.get(t.id) ?? t))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taken])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIdx = gesorteerd.findIndex(t => t.id === active.id)
    const newIdx = gesorteerd.findIndex(t => t.id === over.id)
    if (oldIdx === -1 || newIdx === -1) return

    const volgend = arrayMove(gesorteerd, oldIdx, newIdx)
    setGesorteerd(volgend)
    startTransition(() => updateTaakVolgorde(volgend.map((t, i) => ({ id: t.id, volgorde: i * 10 }))))
  }

  const gefilterd = taken.filter(t => {
    if (filterStatus !== 'alle' && t.status !== filterStatus) return false
    if (filterPrioriteit !== 'alle' && t.prioriteit !== filterPrioriteit) return false
    return true
  })

  const toggleGroep = (key: string) => {
    setIngeklapt(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const renderGroep = (label: string, sleutel: string, items: TaakMetDetails[]) => {
    if (items.length === 0) return null
    const open = !ingeklapt.has(sleutel)
    return (
      <div key={sleutel} className="mb-4">
        <button
          onClick={() => toggleGroep(sleutel)}
          className="flex items-center gap-2 w-full text-left mb-2 group"
        >
          {open
            ? <ChevronDown className="w-4 h-4 text-slate-400" />
            : <ChevronUp className="w-4 h-4 text-slate-400" />
          }
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
          <span className="text-xs text-slate-400 bg-slate-100 rounded-full px-1.5 py-0.5">{items.length}</span>
        </button>
        {open && (
          <div className="space-y-2 pl-6">
            {items.map(taak => (
              <div key={taak.id} className={cn('relative', isGeblokkeerd(taak) && 'opacity-60')}>
                {isGeblokkeerd(taak) && (
                  <div className="absolute right-2 top-2 z-10">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                )}
                <TaakKaart taak={taak} onClick={setGeselecteerdeTaak} />
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderInhoud = () => {
    if (sorteerModus) {
      return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={gesorteerd.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {gesorteerd.map(taak => (
                <SorteerbareTaakRij
                  key={taak.id}
                  taak={taak}
                  isGeblokkeerd={isGeblokkeerd(taak)}
                  onClick={setGeselecteerdeTaak}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )
    }

    if (groepeerOp === 'status') {
      return STATUS_VOLGORDE.map(status => {
        const items = gefilterd.filter(t => t.status === status)
        return renderGroep(STATUS_LABELS[status], status, items)
      })
    }
    if (groepeerOp === 'prioriteit') {
      return (['urgent', 'hoog', 'normaal', 'laag'] as TaskPrioriteit[]).map(p => {
        const items = gefilterd.filter(t => t.prioriteit === p)
        const labels = { urgent: 'Urgent', hoog: 'Hoog', normaal: 'Normaal', laag: 'Laag' }
        return renderGroep(labels[p], p, items)
      })
    }
    return (
      <div className="space-y-2">
        {gefilterd.map(taak => (
          <div key={taak.id} className={cn('relative', isGeblokkeerd(taak) && 'opacity-60')}>
            {isGeblokkeerd(taak) && (
              <div className="absolute right-2 top-2 z-10">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
              </div>
            )}
            <TaakKaart taak={taak} onClick={setGeselecteerdeTaak} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={detailAlsDialog ? 'w-full' : 'flex gap-6 h-full'}>
      <div className="flex-1 min-w-0">
        {toonFilters && (
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-slate-400" />

            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as any)}
              disabled={sorteerModus}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-everts/30 disabled:opacity-40"
            >
              <option value="alle">Alle statussen</option>
              {STATUS_VOLGORDE.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>

            <select
              value={filterPrioriteit}
              onChange={e => setFilterPrioriteit(e.target.value as any)}
              disabled={sorteerModus}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-everts/30 disabled:opacity-40"
            >
              <option value="alle">Alle prioriteiten</option>
              <option value="urgent">Urgent</option>
              <option value="hoog">Hoog</option>
              <option value="normaal">Normaal</option>
              <option value="laag">Laag</option>
            </select>

            <select
              value={groepeerOp}
              onChange={e => setGroepeerOp(e.target.value as any)}
              disabled={sorteerModus}
              className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-everts/30 disabled:opacity-40"
            >
              <option value="status">Groepeer op status</option>
              <option value="prioriteit">Groepeer op prioriteit</option>
              <option value="geen">Niet groeperen</option>
            </select>

            <button
              onClick={toggleSorteerModus}
              className={cn(
                'ml-auto text-xs px-2.5 py-1.5 rounded-lg border transition-colors flex items-center gap-1.5',
                sorteerModus
                  ? 'bg-everts text-white border-everts'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              )}
            >
              <GripVertical className="w-3.5 h-3.5" />
              {sorteerModus ? 'Klaar met sorteren' : 'Sorteren'}
            </button>
          </div>
        )}

        {(sorteerModus ? gesorteerd : gefilterd).length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <p className="text-sm">Geen taken gevonden</p>
          </div>
        ) : (
          renderInhoud()
        )}
      </div>

      {/* Zijpaneel-modus (standaard /taken pagina's) */}
      {!detailAlsDialog && geselecteerdeTaak && (
        <TaakDetailPanel
          taak={geselecteerdeTaak}
          onSluit={() => setGeselecteerdeTaak(null)}
          isTemplate={isTemplate}
          takenInLijst={takenInLijst}
        />
      )}

      {/* Dialog-modus (dossier context) */}
      {detailAlsDialog && geselecteerdeTaak && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
            padding: '64px 24px 24px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setGeselecteerdeTaak(null) }}
        >
          <TaakDetailPanel
            taak={geselecteerdeTaak}
            onSluit={() => setGeselecteerdeTaak(null)}
            isTemplate={isTemplate}
            takenInLijst={takenInLijst}
          />
        </div>
      )}
    </div>
  )
}
