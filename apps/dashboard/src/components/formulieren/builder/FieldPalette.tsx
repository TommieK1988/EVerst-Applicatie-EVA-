'use client'

import React from 'react'
import { FIELD_TYPE_GROUPS, FIELD_TYPE_LABELS, type FormFieldType } from '../types'

const FIELD_ICONS: Record<FormFieldType, string> = {
  text:       'M4 6h16M4 12h10',
  textarea:   'M4 6h16M4 10h16M4 14h12M4 18h8',
  number:     'M7 20l4-16m2 16l4-16M6 9h14M4 15h14',
  date:       'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  time:       'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  dropdown:   'M19 9l-7 7-7-7',
  radio:      'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  checkbox:   'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  boolean:    'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806',
  photo:      'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  signature:  'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  location:   'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
  barcode:    'M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z',
  file:       'M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13',
  repeatable: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  heading:    'M4 6h16M4 12h16',
  paragraph:  'M4 6h16M4 10h16M4 14h12',
  divider:    'M5 12h14',
}

type Props = {
  onAdd: (type: FormFieldType) => void
}

export default function FieldPalette({ onAdd }: Props) {
  return (
    <aside style={{
      width: 220,
      flexShrink: 0,
      borderRight: '1px solid var(--border)',
      overflowY: 'auto',
      padding: '16px 12px',
      background: 'var(--surface)',
    }}>
      <p style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: 12,
      }}>
        Veldtypen
      </p>

      {FIELD_TYPE_GROUPS.map(group => (
        <div key={group.label} style={{ marginBottom: 20 }}>
          <p style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: 6,
            paddingLeft: 4,
          }}>
            {group.label}
          </p>
          {group.types.map(type => (
            <button
              key={type}
              type="button"
              onClick={() => onAdd(type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '6px 8px',
                borderRadius: 6,
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                fontSize: 13,
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                style={{ flexShrink: 0, color: 'var(--text-muted)' }}
              >
                <path d={FIELD_ICONS[type]} />
              </svg>
              <span style={{ fontSize: 12 }}>{FIELD_TYPE_LABELS[type]}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  )
}
