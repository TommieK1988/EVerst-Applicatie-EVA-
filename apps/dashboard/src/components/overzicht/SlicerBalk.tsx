'use client'

import React, { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check, X } from 'lucide-react'

export type SlicerOptie = { value: string; label: string }
export type SlicerDef = {
  key: string
  label: string
  opties: SlicerOptie[]
  /** Meerdere waarden selecteerbaar (default true). */
  multi?: boolean
}
export type SlicerWaarde = Record<string, string[]>

type Props = {
  slicers: SlicerDef[]
  waarde: SlicerWaarde
  onChange: (key: string, values: string[]) => void
  /** Wis alle slicers ineens. */
  onReset?: () => void
}

function SlicerDropdown({
  def, geselecteerd, onChange,
}: {
  def: SlicerDef
  geselecteerd: string[]
  onChange: (values: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const multi = def.multi ?? true

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (value: string) => {
    if (multi) {
      onChange(geselecteerd.includes(value)
        ? geselecteerd.filter(v => v !== value)
        : [...geselecteerd, value])
    } else {
      onChange(geselecteerd.includes(value) ? [] : [value])
      setOpen(false)
    }
  }

  const actief = geselecteerd.length > 0
  const samenvatting = actief
    ? (geselecteerd.length === 1
        ? (def.opties.find(o => o.value === geselecteerd[0])?.label ?? geselecteerd[0])
        : `${geselecteerd.length} gekozen`)
    : null

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 8,
          border: `1px solid ${actief ? 'var(--accent)' : 'var(--border)'}`,
          background: actief ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'var(--surface)',
          color: 'var(--text)', fontSize: 12.5, fontWeight: 500,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: actief ? 'var(--accent)' : 'var(--text-muted)' }}>{def.label}</span>
        {samenvatting && (
          <span style={{ fontWeight: 600 }}>· {samenvatting}</span>
        )}
        {actief
          ? <X size={13} onClick={(e) => { e.stopPropagation(); onChange([]) }} style={{ opacity: 0.6 }} />
          : <ChevronDown size={13} style={{ opacity: 0.5 }} />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 50,
          minWidth: 200, maxHeight: 320, overflowY: 'auto',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 4,
        }}>
          {def.opties.length === 0 && (
            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
              Geen opties
            </div>
          )}
          {def.opties.map(o => {
            const sel = geselecteerd.includes(o.value)
            return (
              <button
                key={o.value}
                onClick={() => toggle(o.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 9px', borderRadius: 7, border: 'none',
                  background: sel ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
                  color: 'var(--text)', fontSize: 12.5, textAlign: 'left', cursor: 'pointer',
                }}
              >
                <span style={{
                  width: 15, height: 15, borderRadius: 4, flexShrink: 0,
                  border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                  background: sel ? 'var(--accent)' : 'transparent',
                  display: 'grid', placeItems: 'center',
                }}>
                  {sel && <Check size={11} color="white" strokeWidth={3} />}
                </span>
                {o.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function SlicerBalk({ slicers, waarde, onChange, onReset }: Props) {
  const aantalActief = slicers.reduce((n, s) => n + ((waarde[s.key]?.length ?? 0) > 0 ? 1 : 0), 0)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '2px 0',
    }}>
      {slicers.map(s => (
        <SlicerDropdown
          key={s.key}
          def={s}
          geselecteerd={waarde[s.key] ?? []}
          onChange={(values) => onChange(s.key, values)}
        />
      ))}
      {aantalActief > 0 && onReset && (
        <button
          onClick={onReset}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 8px', borderRadius: 8, border: 'none',
            background: 'transparent', color: 'var(--text-muted)',
            fontSize: 12, cursor: 'pointer',
          }}
        >
          <X size={13} /> Wis filters
        </button>
      )}
    </div>
  )
}
