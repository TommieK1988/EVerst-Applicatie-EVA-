'use client'

import React from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { FormField } from '../types'
import { FIELD_TYPE_LABELS } from '../types'

type Props = {
  field: FormField
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onDuplicate: () => void
}

export default function SortableField({ field, isSelected, onSelect, onDelete, onDuplicate }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative',
  }

  const isStructural = field.type === 'heading' || field.type === 'paragraph' || field.type === 'divider'

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onSelect}
    >
      <div
        style={{
          border: `2px solid ${isSelected ? 'hsl(var(--primary))' : 'var(--border)'}`,
          borderRadius: 8,
          padding: '10px 12px',
          background: isSelected ? 'var(--primary-subtle, #f0f4ff)' : 'var(--bg)',
          cursor: 'pointer',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            style={{
              cursor: 'grab',
              color: 'var(--text-muted)',
              flexShrink: 0,
              padding: '2px 4px',
              borderRadius: 4,
            }}
            onClick={e => e.stopPropagation()}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <circle cx="9" cy="6" r="1" fill="currentColor" strokeWidth={0}/>
              <circle cx="15" cy="6" r="1" fill="currentColor" strokeWidth={0}/>
              <circle cx="9" cy="12" r="1" fill="currentColor" strokeWidth={0}/>
              <circle cx="15" cy="12" r="1" fill="currentColor" strokeWidth={0}/>
              <circle cx="9" cy="18" r="1" fill="currentColor" strokeWidth={0}/>
              <circle cx="15" cy="18" r="1" fill="currentColor" strokeWidth={0}/>
            </svg>
          </div>

          {/* Field info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {field.type === 'divider' ? (
              <hr style={{ border: 'none', borderTop: '2px solid var(--border)', margin: '2px 0' }}/>
            ) : field.type === 'heading' ? (
              <strong style={{ fontSize: 15, color: 'var(--text)' }}>{field.label || 'Titel'}</strong>
            ) : field.type === 'paragraph' ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>{field.label || 'Toelichting'}</p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>
                    {field.label || '(geen label)'}
                  </span>
                  {field.required && (
                    <span style={{ color: '#e53e3e', fontSize: 13 }}>*</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    background: 'var(--surface-2)',
                    padding: '1px 6px',
                    borderRadius: 10,
                  }}>
                    {FIELD_TYPE_LABELS[field.type]}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {field.name}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Actions */}
          <div
            style={{ display: 'flex', gap: 2 }}
            onClick={e => e.stopPropagation()}
          >
            {!isStructural && (
              <button
                type="button"
                title="Dupliceren"
                onClick={onDuplicate}
                style={{
                  border: 'none', background: 'transparent',
                  padding: 4, cursor: 'pointer', borderRadius: 4,
                  color: 'var(--text-muted)',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
            )}
            <button
              type="button"
              title="Verwijderen"
              onClick={onDelete}
              style={{
                border: 'none', background: 'transparent',
                padding: 4, cursor: 'pointer', borderRadius: 4,
                color: 'var(--text-muted)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#fee2e2'
                e.currentTarget.style.color = '#ef4444'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Conditions indicator */}
        {field.conditions && field.conditions.length > 0 && (
          <div style={{
            marginTop: 6, fontSize: 10, color: '#009439',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            {field.conditions.length} {field.conditions.length === 1 ? 'conditie' : 'condities'}
          </div>
        )}

        {/* Sub-fields preview for repeatable */}
        {field.type === 'repeatable' && (
          <div style={{
            marginTop: 8,
            padding: '6px 8px',
            background: 'var(--surface-2, #f9fafb)',
            borderRadius: 5,
            border: '1px dashed var(--border)',
          }}>
            {(!field.children || field.children.length === 0) ? (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Geen sub-velden — klik om toe te voegen
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {field.children.map(child => (
                  <div key={child.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{
                      fontSize: 9, padding: '1px 4px', borderRadius: 4,
                      background: 'var(--surface)', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em',
                    }}>
                      {child.type.slice(0, 4)}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text)' }}>
                      {child.label || '(geen label)'}
                      {child.required && <span style={{ color: '#e53e3e', marginLeft: 2 }}>*</span>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
