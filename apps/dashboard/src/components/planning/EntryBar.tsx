'use client'

import { useDraggable } from '@dnd-kit/core'
import type { PlanningItemVerrijkt } from '@everts/database/platform-types'

type Props = {
  entry: PlanningItemVerrijkt
  left: number
  width: number
  kleur: string
  onDelete?: (id: string) => void
  disabled?: boolean
}

export default function EntryBar({ entry, left, width, kleur, onDelete, disabled }: Props) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `item-${entry.id}`,
    disabled,
    data: { type: 'item', item: entry },
  })

  const opacity = isDragging ? 0.35 : 1
  const naam = [entry.medewerkers?.voornaam, entry.medewerkers?.achternaam].filter(Boolean).join(' ')
  const label = entry.planning_activiteiten?.titel ?? '—'

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        position: 'absolute',
        top: 5, bottom: 5,
        left, width: width - 2,
        borderRadius: 5,
        background: kleur,
        opacity,
        cursor: disabled ? 'default' : 'grab',
        display: 'flex', alignItems: 'center',
        paddingLeft: 7, paddingRight: onDelete ? 22 : 7,
        overflow: 'hidden',
        userSelect: 'none',
        zIndex: 1,
      }}
      title={`${label} — ${naam} (${entry.uren}u)`}
    >
      {width > 40 && (
        <span style={{
          fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600,
          color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      )}
      {onDelete && (
        <button
          onPointerDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); onDelete(entry.id) }}
          style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 3,
            color: 'white', fontSize: 10, fontWeight: 700, cursor: 'pointer',
            padding: '1px 4px', lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  )
}
