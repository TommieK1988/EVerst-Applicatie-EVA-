'use client'

import { useEffect, useRef } from 'react'

/** Invulveld voor een nieuwe (sub)groep, als rij op de plek waar de groep komt. */
export interface NieuweGroepInvoer {
  /** Ouder van de nieuwe groep; null = hoofdgroep onderaan. */
  parentId: string | null
  naam: string
  onNaam: (naam: string) => void
  onBevestig: () => void
  onAnnuleer: () => void
}

export function NieuweGroepRij({ invoer, colCount, indent, label }: {
  invoer: NieuweGroepInvoer
  colCount: number
  indent: number
  label: string
}) {
  const ref = useRef<HTMLTableRowElement>(null)
  // Onderaan een lange groep staat het veld vaak buiten beeld.
  useEffect(() => { ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [])
  return (
    <tr ref={ref} className="border-b border-brand-500/20 bg-brand-50">
      <td colSpan={colCount} className="py-1.5 pr-3" style={{ paddingLeft: `${indent}px` }}>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-600 whitespace-nowrap">{label}</span>
          <input
            autoFocus
            value={invoer.naam}
            onChange={e => invoer.onNaam(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') invoer.onBevestig()
              if (e.key === 'Escape') invoer.onAnnuleer()
            }}
            placeholder="Naam van de groep…"
            className="w-72 text-xs px-2 py-1 border border-brand-500/40 rounded focus:outline-none focus:ring-1 focus:ring-brand-500 bg-white"
          />
          <button
            type="button"
            onClick={invoer.onBevestig}
            disabled={!invoer.naam.trim()}
            className="text-xs font-semibold bg-brand-500 text-white px-2.5 py-1 rounded hover:bg-brand-700 disabled:opacity-40"
          >
            Toevoegen
          </button>
          <button type="button" onClick={invoer.onAnnuleer} className="text-xs text-neutral-500 hover:text-neutral-700 px-1">
            Annuleren
          </button>
        </div>
      </td>
    </tr>
  )
}
