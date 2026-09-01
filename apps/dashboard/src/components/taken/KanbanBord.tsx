'use client'

import { useState, useTransition } from 'react'
import {
  DndContext, DragEndEvent, DragOverEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from '@dnd-kit/core'
import { useDroppable } from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Plus } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/taken/utils'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import TaakKaart from './TaakKaart'
import TaakDetailPanel from './TaakDetailPanel'
import NieuweTaakDialog from './NieuweTaakDialog'
import type { TaakMetDetails, TaskStatus, DbTaskList } from '@/lib/taken/supabase/database.types'

// ─── Kolom-configuratie ───────────────────────────────────────────────────────

const KOLOMMEN: { status: TaskStatus; label: string; kleur: string }[] = [
  { status: 'open',           label: 'Open',           kleur: 'border-t-slate-400' },
  { status: 'in_behandeling', label: 'In behandeling', kleur: 'border-t-blue-400'  },
  { status: 'wacht_op',       label: 'Wacht op',       kleur: 'border-t-amber-400' },
  { status: 'gereed',         label: 'Gereed',          kleur: 'border-t-emerald-400' },
]

// ─── Sorteerbare taak ─────────────────────────────────────────────────────────

function SortableTaak({
  taak,
  onClick,
}: {
  taak: TaakMetDetails
  onClick: (t: TaakMetDetails) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: taak.id, data: { type: 'taak', status: taak.status } })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(isDragging && 'opacity-40')}
    >
      <TaakKaart taak={taak} onClick={onClick} compact />
    </div>
  )
}

// ─── Droppable kolom ──────────────────────────────────────────────────────────

function KanbanKolom({
  status,
  label,
  kleur,
  taken,
  lijsten,
  onTaakClick,
}: {
  status: TaskStatus
  label: string
  kleur: string
  taken: TaakMetDetails[]
  lijsten?: DbTaskList[]
  onTaakClick: (t: TaakMetDetails) => void
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
    data: { type: 'kolom', status },
  })

  return (
    <div
      className={cn(
        'flex-shrink-0 w-72 bg-slate-50 rounded-xl border-t-4 border border-slate-200 flex flex-col transition-colors',
        kleur,
        isOver && 'bg-slate-100 border-slate-300'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">{label}</span>
          <span className="text-xs text-slate-400 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 font-medium">
            {taken.length}
          </span>
        </div>
        <NieuweTaakDialog
          lijsten={lijsten}
          trigger={
            <button className="text-slate-400 hover:text-slate-600 hover:bg-white rounded p-0.5 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          }
        />
      </div>

      {/* Taken drop-zone */}
      <div ref={setNodeRef} className="flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px]">
        <SortableContext
          items={taken.map(t => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {taken.map(taak => (
            <SortableTaak key={taak.id} taak={taak} onClick={onTaakClick} />
          ))}
        </SortableContext>

        {taken.length === 0 && (
          <p className="text-center py-6 text-xs text-slate-400 select-none">
            Sleep acties hierheen
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Hoofd-component ──────────────────────────────────────────────────────────

interface Props {
  taken: TaakMetDetails[]
  lijsten?: DbTaskList[]
  isTemplate?: boolean
  /** Sjabloon-context: bepaalt de toewijzings- en deadline-opties in het detailpaneel. */
  context?: 'dossier' | 'medewerker'
  takenInLijst?: { id: string; titel: string }[]
}

export default function KanbanBord({ taken, lijsten, isTemplate, context = 'dossier', takenInLijst = [] }: Props) {
  const [lokaalTaken, setLokaalTaken]             = useState<TaakMetDetails[]>(taken)
  const [actieveTaak, setActieveTaak]             = useState<TaakMetDetails | null>(null)
  const [geselecteerdeTaak, setGeselecteerdeTaak] = useState<TaakMetDetails | null>(null)
  const [, startTransition]                       = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  const takenPerStatus = (status: TaskStatus) =>
    lokaalTaken.filter(t => t.status === status)

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActieveTaak(lokaalTaken.find(t => t.id === active.id) ?? null)
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    // over kan een kolom zijn (data.type === 'kolom') of een taak (data.type === 'taak')
    const nieuweStatus = (over.data.current?.status) as TaskStatus | undefined
    if (!nieuweStatus) return

    setLokaalTaken(prev =>
      prev.map(t => t.id === active.id ? { ...t, status: nieuweStatus } : t)
    )
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActieveTaak(null)
    if (!over) return

    const nieuweStatus = (over.data.current?.status) as TaskStatus | undefined
    const taak = lokaalTaken.find(t => t.id === active.id)
    if (!nieuweStatus || !taak) return

    // Alleen server call als status daadwerkelijk veranderd is
    if (taak.status !== nieuweStatus) {
      // `handleDragOver` heeft de kaart al verplaatst. Weigert de server -- een actie met een
      // formulier, kwaliteitsronde of toolbox sluit alleen via die doorloop -- dan moet hij
      // terugspringen, anders staat er iets op het bord wat niet in de database staat.
      const vorigeStatus = taak.status
      startTransition(async () => {
        try {
          await updateTaakStatus(active.id as string, nieuweStatus)
        } catch (e) {
          setLokaalTaken(prev =>
            prev.map(t => t.id === active.id ? { ...t, status: vorigeStatus } : t)
          )
          toast.error(e instanceof Error ? e.message : 'Fout bij wijzigen status')
        }
      })
    }
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        {KOLOMMEN.map(kolom => (
          <KanbanKolom
            key={kolom.status}
            status={kolom.status}
            label={kolom.label}
            kleur={kolom.kleur}
            taken={takenPerStatus(kolom.status)}
            lijsten={lijsten}
            onTaakClick={setGeselecteerdeTaak}
          />
        ))}

        <DragOverlay>
          {actieveTaak && <TaakKaart taak={actieveTaak} compact />}
        </DragOverlay>
      </DndContext>

      {geselecteerdeTaak && (
        <TaakDetailPanel
          taak={geselecteerdeTaak}
          onSluit={() => setGeselecteerdeTaak(null)}
          isTemplate={isTemplate}
          context={context}
          takenInLijst={takenInLijst}
        />
      )}
    </div>
  )
}
