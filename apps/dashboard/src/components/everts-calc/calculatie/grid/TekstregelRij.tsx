'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import { cn } from '@/lib/everts-calc/utils'
import type { Calculatieregel } from '@/lib/everts-calc/types'
import { type ColId } from './kolommen'
import { ActieMenu, SelectieVinkje, type RegelActie } from './ActieMenu'

/**
 * Rij voor een tekstregel: één tekstvlak over de volle breedte van het rekenblad,
 * zonder aantal, prijs of componenten. Bewust een eigen component en niet een
 * variant binnen `CalculatieregelRij` — die rij hangt vol hooks en cel-logica die
 * voor een tekstregel allemaal niet van toepassing is.
 *
 * Slepen, selecteren en verwijderen werken exact als bij een gewone regel, zodat
 * de tekst tussen de posten op zijn plek te zetten is.
 */
export function TekstregelRij({
  regel, colOrder, onWijzig, onVerwijder,
  isGeselecteerd, onSelecteer, onActie,
  isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd,
  readOnly = false,
}: {
  regel: Calculatieregel
  colOrder: ColId[]
  onWijzig: (id: string, veld: Partial<Calculatieregel>) => void
  onVerwijder: () => void
  isGeselecteerd?: boolean
  onSelecteer?: (ctrlKey: boolean, shiftKey: boolean) => void
  onActie?: (actie: RegelActie) => void
  isDragging?: boolean
  isDragOver?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent) => void
  onDragEnd?: () => void
  readOnly?: boolean
}) {
  const veld = useRef<HTMLTextAreaElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Hoogte volgt de inhoud, zodat een lange toelichting niet in een scrollbalkje verdwijnt.
  const pasHoogteAan = useCallback(() => {
    const el = veld.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { pasHoogteAan() }, [pasHoogteAan, regel.omschrijving])

  return (
    <tr
      className={cn(
        'group border-b border-slate-100 bg-sky-50/40 hover:bg-sky-100/50 transition-colors',
        isGeselecteerd ? 'bg-everts/10 ring-1 ring-inset ring-everts/30' : '',
        isDragging ? 'opacity-40' : '',
        isDragOver ? 'border-t-2 border-t-everts' : ''
      )}
      draggable={!!onDragStart && !readOnly}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', regel.id); onDragStart?.(e) }}
      onDragOver={onDragOver}
      onDrop={e => { e.preventDefault(); onDrop?.(e) }}
      onDragEnd={onDragEnd}
      onMouseDown={e => {
        if (e.shiftKey && !(e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) {
          e.preventDefault()
        }
      }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('input,select,textarea,button,a,[role="button"]')) return
        onSelecteer?.(e.ctrlKey || e.metaKey, e.shiftKey)
      }}
      onContextMenu={e => {
        if (readOnly || (e.target as HTMLElement).closest('input,textarea,select')) return
        e.preventDefault(); setMenuOpen(true)
      }}
      style={{ cursor: onDragStart ? 'grab' : undefined }}
    >
      <td colSpan={colOrder.length} className="px-2 py-1" style={{ paddingLeft: '4px' }}>
        <div className="flex items-start gap-2">
          {onSelecteer && !readOnly && (
            <span className="mt-1.5 flex-shrink-0">
              <SelectieVinkje aan={!!isGeselecteerd} onWissel={shift => onSelecteer(!shift, shift)} label="Selecteer tekstregel" />
            </span>
          )}
          <span
            className="mt-1 flex-shrink-0 text-[9px] font-medium tracking-wide px-1.5 py-0.5 rounded
              bg-sky-100 text-sky-700 border border-sky-200"
            title="Tekstregel — telt niet mee in de calculatie, komt wel in de offerte"
          >
            TEKST
          </span>
          <textarea
            ref={veld}
            value={regel.omschrijving ?? ''}
            onChange={e => { onWijzig(regel.id, { omschrijving: e.target.value }); pasHoogteAan() }}
            placeholder="Tekstregel voor in de offerte…"
            rows={1}
            disabled={readOnly}
            className="flex-1 min-w-0 text-xs px-2 py-1 border border-transparent rounded bg-transparent
              hover:border-slate-200 focus:bg-white focus:outline-none focus:border-everts/40
              focus:ring-1 focus:ring-everts/20 resize-none overflow-hidden
              text-slate-700 placeholder-slate-400 disabled:cursor-default"
          />
          {!readOnly && (
            <ActieMenu
              open={menuOpen} onOpenChange={setMenuOpen}
              label="Acties voor tekstregel"
              className="sticky right-1 mt-0.5 flex-shrink-0"
              items={[
                { label: 'Dupliceren', sneltoets: 'Ctrl D', onSelect: () => onActie?.('dupliceren') },
                { label: 'Kopiëren', sneltoets: 'Ctrl C', onSelect: () => onActie?.('kopieren') },
                { label: 'Verplaatsen naar groep…', sneltoets: 'Ctrl M', onSelect: () => onActie?.('verplaatsen') },
                { soort: 'scheiding' },
                { label: 'Verwijderen', sneltoets: 'Delete', gevaarlijk: true, onSelect: () => onActie ? onActie('verwijderen') : onVerwijder() },
              ]}
            />
          )}
        </div>
      </td>
    </tr>
  )
}
