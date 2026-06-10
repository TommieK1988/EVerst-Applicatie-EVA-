'use client'

import React from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import type { FormField } from '../types'
import SortableField from './SortableField'
import { generateFieldId } from '../types'

type Props = {
  fields: FormField[]
  selectedId: string | null
  onSelect: (id: string) => void
  onReorder: (fields: FormField[]) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
}

export default function FormCanvas({
  fields,
  selectedId,
  onSelect,
  onReorder,
  onDelete,
  onDuplicate,
}: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = fields.findIndex(f => f.id === active.id)
    const newIndex = fields.findIndex(f => f.id === over.id)
    onReorder(arrayMove(fields, oldIndex, newIndex))
  }

  function handleDuplicate(id: string) {
    const field = fields.find(f => f.id === id)
    if (!field) return
    const copy: FormField = {
      ...field,
      id: generateFieldId(),
      name: field.name + '_kopie',
      label: field.label + ' (kopie)',
    }
    const idx = fields.findIndex(f => f.id === id)
    const next = [...fields]
    next.splice(idx + 1, 0, copy)
    onReorder(next)
    onDuplicate(copy.id)
  }

  if (fields.length === 0) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        color: 'var(--text-muted)',
        textAlign: 'center',
      }}>
        <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ marginBottom: 16, opacity: 0.4 }}>
          <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
        </svg>
        <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Formulier is leeg</p>
        <p style={{ fontSize: 13 }}>Klik op een veldtype in de linkerkolom om te beginnen.</p>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 640, margin: '0 auto' }}>
            {fields.map(field => (
              <SortableField
                key={field.id}
                field={field}
                isSelected={selectedId === field.id}
                onSelect={() => onSelect(field.id)}
                onDelete={() => onDelete(field.id)}
                onDuplicate={() => handleDuplicate(field.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}
