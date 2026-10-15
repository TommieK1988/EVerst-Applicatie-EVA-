'use client'

import { useState } from 'react'
import { cn } from '@/lib/everts-calc/utils'
import type { Calculatieregel } from '@/lib/everts-calc/types'
import { type ColId } from './kolommen'
import { ActieMenu, SelectieVinkje, type RegelActie } from './ActieMenu'
import { BulletTextarea } from '@/components/ui/bullet-textarea'

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
  const [menuOpen, setMenuOpen] = useState(false)
  // De vinkjeskolom staat vooraan zodra het grid hem tekent (niet in een bevroren calculatie).
  const metVinkje = colOrder[0] === 'selectie'


  return (
    <tr
      data-regel-id={regel.id}
      className={cn(
        'group border-b border-slate-100 bg-white hover:bg-neutral-50 transition-colors',
        isGeselecteerd ? 'bg-everts/10 ring-1 ring-inset ring-everts/30' : '',
        isDragging ? 'opacity-40' : '',
        isDragOver ? 'border-t-2 border-t-everts' : ''
      )}
      draggable={!!onDragStart && !readOnly}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', regel.id); onDragStart?.(e) }}
      onDragOver={onDragOver}
      onDrop={e => { e.preventDefault(); onDrop?.(e) }}
      onDragEnd={onDragEnd}
      // Selecteren gaat alleen via het vinkje: een klik op de regel zelf selecteert niets.
      onContextMenu={e => {
        if (readOnly || (e.target as HTMLElement).closest('input,textarea,select')) return
        e.preventDefault(); setMenuOpen(true)
      }}
      style={{ cursor: onDragStart ? 'grab' : undefined }}
    >
      {metVinkje && (
        <td className="px-1 py-1 align-top">
          <span className="mt-1 flex justify-center">
            {onSelecteer && (
              <SelectieVinkje aan={!!isGeselecteerd} onWissel={shift => onSelecteer(!shift, shift)} label="Selecteer tekstregel" />
            )}
          </span>
        </td>
      )}
      <td colSpan={colOrder.length - (metVinkje ? 1 : 0)} className="px-2 py-1">
        <div className="flex items-start gap-1">
          <span
            className="mt-1 flex-shrink-0 py-0.5 text-xs italic text-neutral-500"
            title="Telt niet mee in de calculatie, komt wel in de offerte"
          >
            Tekstregel:
          </span>
          <div className="flex-1 min-w-0">
            <BulletTextarea
              value={regel.omschrijving ?? ''}
              onChange={tekst => onWijzig(regel.id, { omschrijving: tekst })}
              streepjeWordtBullet
              toonKnop={false}
              minRows={1}
              maxRows={30}
              placeholder="Tekst voor in de offerte… Begin een regel met - voor een opsomming"
              title="Begin een regel met - voor een opsomming; Enter gaat door met het volgende punt (Ctrl+Shift+8 zet het aan of uit)"
              disabled={readOnly}
              className="text-xs px-1 py-1 border border-transparent rounded bg-transparent
                hover:border-slate-200 focus:bg-white focus:outline-none focus:border-everts/40
                focus:ring-1 focus:ring-everts/20
                text-slate-700 placeholder-slate-400 disabled:cursor-default"
            />
          </div>
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
