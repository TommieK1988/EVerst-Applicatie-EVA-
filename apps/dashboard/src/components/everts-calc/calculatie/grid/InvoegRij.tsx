'use client'

import { Plus, BookOpen } from 'lucide-react'

/**
 * Vaste invoegrij onder de regels van een groep: toevoegen zonder eerst een groep te
 * hoeven aanklikken of de sneltoets te kennen.
 */
export function InvoegRij({ colCount, indent, kanSubgroep, onRegel, onTekstregel, onSubgroep, onBibliotheek }: {
  colCount: number
  indent: number
  kanSubgroep: boolean
  onRegel: () => void
  onTekstregel: () => void
  onSubgroep: () => void
  onBibliotheek: () => void
}) {
  const knop = 'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-neutral-500 hover:bg-brand-50 hover:text-brand-700'
  return (
    <tr className="border-b border-neutral-100">
      <td colSpan={colCount} className="py-1" style={{ paddingLeft: `${indent}px` }}>
        <div className="flex items-center gap-1">
          <button type="button" className={knop} onClick={onRegel}><Plus className="h-3 w-3" /> Regel</button>
          <button type="button" className={knop} onClick={onTekstregel}><Plus className="h-3 w-3" /> Tekstregel</button>
          {kanSubgroep && <button type="button" className={knop} onClick={onSubgroep}><Plus className="h-3 w-3" /> Subgroep</button>}
          <span className="mx-1 h-3 w-px bg-neutral-200" />
          <button type="button" className={knop} onClick={onBibliotheek}><BookOpen className="h-3 w-3" /> Uit bibliotheek…</button>
        </div>
      </td>
    </tr>
  )
}
