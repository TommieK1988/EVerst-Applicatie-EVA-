'use client'

import { useState } from 'react'
import { Calendar, MessageSquare, Paperclip, User, CheckSquare } from 'lucide-react'
import { cn } from '@/lib/taken/utils'
import { format, parseISO, isPast, isToday } from 'date-fns'
import { nl } from 'date-fns/locale'
import { TaakStatusBadge, TaakPrioriteitBadge } from './TaakStatusBadge'
import { updateTaakStatus } from '@/app/(platform)/taken/actions/taken'
import type { TaakMetDetails, TaskStatus } from '@/lib/taken/supabase/database.types'

interface Props {
  taak: TaakMetDetails
  onClick?: (taak: TaakMetDetails) => void
  compact?: boolean
}

export default function TaakKaart({ taak, onClick, compact = false }: Props) {
  const [loading, setLoading] = useState(false)

  const deadlineKleur = () => {
    if (!taak.deadline) return 'text-slate-400'
    const d = parseISO(taak.deadline)
    if (taak.status === 'gereed') return 'text-slate-400'
    if (isPast(d) && !isToday(d)) return 'text-red-600'
    if (isToday(d)) return 'text-orange-600'
    return 'text-slate-500'
  }

  const toggleGereed = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setLoading(true)
    const nieuweStatus: TaskStatus = taak.status === 'gereed' ? 'open' : 'gereed'
    try {
      await updateTaakStatus(taak.id, nieuweStatus)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout bij wijzigen status')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        'bg-white border border-slate-200 rounded-lg transition-all cursor-pointer',
        'hover:border-slate-300 hover:shadow-sm',
        compact ? 'p-3' : 'p-4',
        taak.status === 'gereed' && 'opacity-60'
      )}
      onClick={() => onClick?.(taak)}
    >
      <div className="flex items-start gap-3">
        {/* Gereed-checkbox */}
        <button
          onClick={toggleGereed}
          disabled={loading}
          aria-label={taak.status === 'gereed' ? 'Markeer als open' : 'Markeer als gereed'}
          className={cn(
            // relative + after-pseudo vergroot de touch-hitbox tot ~36px
            // zonder het visuele 16px-vinkje of de layout te veranderen
            'relative mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors',
            "after:absolute after:-inset-2.5 after:content-['']",
            taak.status === 'gereed'
              ? 'bg-emerald-500 border-emerald-500'
              : 'border-slate-300 hover:border-emerald-400'
          )}
        >
          {taak.status === 'gereed' && (
            <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 10">
              <path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          {/* Titel */}
          <p className={cn(
            'text-sm font-medium text-slate-800 leading-snug',
            taak.status === 'gereed' && 'line-through text-slate-500'
          )}>
            {taak.titel}
          </p>

          {/* Badges */}
          {!compact && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <TaakStatusBadge status={taak.status} size="sm" />
              {taak.prioriteit !== 'normaal' && (
                <TaakPrioriteitBadge prioriteit={taak.prioriteit} size="sm" />
              )}
              {taak.lijst && (
                <span className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                  {taak.lijst.naam}
                </span>
              )}
            </div>
          )}

          {/* Meta */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {taak.deadline && (
              <span className={cn('flex items-center gap-1 text-xs', deadlineKleur())}>
                <Calendar className="w-3 h-3" />
                {format(parseISO(taak.deadline), 'd MMM', { locale: nl })}
              </span>
            )}
            {taak.assignees.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <User className="w-3 h-3" />
                {taak.assignees.length}
              </span>
            )}
            {taak.subtaken.length > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <CheckSquare className="w-3 h-3" />
                {taak.subtaken.length}
              </span>
            )}
            {taak.comments_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <MessageSquare className="w-3 h-3" />
                {taak.comments_count}
              </span>
            )}
            {taak.attachments_count > 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Paperclip className="w-3 h-3" />
                {taak.attachments_count}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
