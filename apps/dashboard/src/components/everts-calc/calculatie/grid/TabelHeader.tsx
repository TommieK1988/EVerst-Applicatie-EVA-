'use client'

import { useState, useEffect } from 'react'
import { type ColId, COL_MAP } from './kolommen'

// ─── TabelHeader ──────────────────────────────────────────────────────────────

export interface TabelHeaderProps {
  colOrder: ColId[]
  colWidths: Record<ColId, number>
  /** Zichtbare naam per kolom: eigen naam van de gebruiker, anders die uit de instellingen, anders de standaard. */
  kolomNamen: Record<string, string>
  onHernoem: (col: ColId, naam: string) => void
  onStartResize: (col: ColId, e: React.MouseEvent) => void
  dragOverCol: ColId | null
  onColDragStart: (col: ColId) => void
  onColDragOver: (e: React.DragEvent, col: ColId) => void
  onColDrop: (col: ColId) => void
  onColDragEnd: () => void
}

export function TabelHeader({
  colOrder, colWidths, kolomNamen, onHernoem, onStartResize, dragOverCol,
  onColDragStart, onColDragOver, onColDrop, onColDragEnd,
}: TabelHeaderProps) {
  // Dubbelklik op een kop = hernoemen. De <th> is draggable, dus tijdens het
  // bewerken zetten we dat uit — anders pakt de browser de drag i.p.v. de cursor.
  const [bewerkt,  setBewerkt]  = useState<ColId | null>(null)
  const [naamEdit, setNaamEdit] = useState('')

  const start = (id: ColId) => { setBewerkt(id); setNaamEdit(kolomNamen[id] ?? '') }
  const commit = () => {
    if (bewerkt) onHernoem(bewerkt, naamEdit)
    setBewerkt(null)
  }

  return (
    <thead className="sticky top-0 z-10">
      <tr className="bg-white border-b-2 border-slate-200 shadow-sm">
        {colOrder.map(id => {
          const col = COL_MAP[id]
          const inBewerking = bewerkt === id
          return (
            <th
              key={id}
              data-col={id}
              title={col.title ? `${col.title} — dubbelklik om te hernoemen` : 'Dubbelklik om te hernoemen'}
              draggable={id !== 'acties' && !inBewerking}
              onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onColDragStart(id) }}
              onDragOver={e => onColDragOver(e, id)}
              onDrop={() => onColDrop(id)}
              onDragEnd={onColDragEnd}
              onDoubleClick={() => { if (id !== 'acties') start(id) }}
              className={[
                'relative px-2 py-2 text-[11px] font-normal uppercase tracking-wide',
                'whitespace-normal break-words leading-tight align-bottom',
                'select-none cursor-grab active:cursor-grabbing',
                col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                col.thCls ?? (!col.thStyle ? 'text-slate-500' : ''),
                dragOverCol === id ? 'border-l-2 border-everts' : '',
              ].filter(Boolean).join(' ')}
              style={{ width: colWidths[id], ...col.thStyle }}
            >
              {inBewerking ? (
                <input
                  autoFocus
                  value={naamEdit}
                  placeholder={col.label}
                  onChange={e => setNaamEdit(e.target.value)}
                  onBlur={commit}
                  onKeyDown={e => {
                    if (e.key === 'Enter')  (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setBewerkt(null)
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  className="w-full normal-case tracking-normal text-[11px] px-1 py-0.5 rounded
                    border border-everts/50 bg-white text-slate-800 focus:outline-none"
                />
              ) : (
                kolomNamen[id] ?? col.label
              )}
              {id !== 'acties' && !inBewerking && (
                <div
                  className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-everts/40 z-20"
                  onMouseDown={e => { e.preventDefault(); e.stopPropagation(); onStartResize(id, e) }}
                />
              )}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}

// ─── KolomNaamVeld ────────────────────────────────────────────────────────────

/** Hernoemveld in het kolommen-menu; bewaart pas bij verlaten of Enter. */
export function KolomNaamVeld({
  waarde, standaard, onCommit,
}: {
  waarde: string
  standaard: string
  onCommit: (naam: string) => void
}) {
  const [tekst, setTekst] = useState(waarde)
  useEffect(() => { setTekst(waarde) }, [waarde])

  return (
    <input
      value={tekst}
      placeholder={standaard}
      onChange={e => setTekst(e.target.value)}
      onBlur={() => { if (tekst !== waarde) onCommit(tekst) }}
      onKeyDown={e => {
        if (e.key === 'Enter')  (e.target as HTMLInputElement).blur()
        if (e.key === 'Escape') setTekst(waarde)
      }}
      className="flex-1 min-w-0 text-xs px-1.5 py-0.5 rounded border border-transparent bg-transparent
        text-slate-700 placeholder-slate-400
        hover:border-slate-200 focus:bg-white focus:border-everts/40 focus:outline-none"
    />
  )
}
