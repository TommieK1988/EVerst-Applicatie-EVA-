'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, MoreVertical, Trash2, Eye, EyeOff } from 'lucide-react'
import { updateSection, verwijderSection } from '@/app/actions/quotes'
import QuoteLinesTable from './QuoteLinesTable'
import type { QuoteSection, QuoteType, Discipline } from '@/lib/types-quotes'

const DISCIPLINE_COLORS: Record<Discipline, string> = {
  schilderwerk: 'bg-blue-100 text-blue-700 border-blue-200',
  bouwkundig:   'bg-amber-100 text-amber-700 border-amber-200',
  dakwerk:      'bg-orange-100 text-orange-700 border-orange-200',
  meerwerk:     'bg-purple-100 text-purple-700 border-purple-200',
  overig:       'bg-slate-100 text-slate-600 border-slate-200',
}

const DISCIPLINE_LABELS: Record<Discipline, string> = {
  schilderwerk: 'Schilderwerk',
  bouwkundig:   'Bouwkundig',
  dakwerk:      'Dakwerk',
  meerwerk:     'Meerwerk',
  overig:       'Overig',
}

interface Props {
  section: QuoteSection
  quoteId: string
  type: QuoteType
}

export default function QuoteSectionBlock({ section, quoteId, type }: Props) {
  const [open, setOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [, startTransition] = useTransition()

  function toggleDetail() {
    startTransition(() => {
      updateSection(section.id, quoteId, { toon_detail: !section.toon_detail })
    })
  }

  function verwijder() {
    if (!confirm(`Sectie "${section.naam}" en alle regels verwijderen?`)) return
    startTransition(() => {
      verwijderSection(section.id, quoteId)
    })
  }

  function updateNaam(naam: string) {
    if (naam === section.naam) return
    startTransition(() => {
      updateSection(section.id, quoteId, { naam })
    })
  }

  const disc = section.discipline as Discipline | null
  const disciplineCls = disc ? DISCIPLINE_COLORS[disc] : 'bg-slate-100 text-slate-600 border-slate-200'
  const lines = section.lines ?? []
  const isOptie = section.is_optioneel
  const heeftStelposten = lines.some(l => l.is_stelpost)

  // Nummering prefix voor naam
  const nummerPrefix = section.nummer ? `${section.nummer} ` : ''

  // Inspringen op basis van niveau
  const niveauIndent = section.niveau === 2 ? 'ml-4' : section.niveau === 3 ? 'ml-8' : ''

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${
      isOptie ? 'border-amber-300' : 'border-slate-200'
    } ${niveauIndent}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${
        isOptie ? 'bg-amber-50 border-amber-100' : 'border-slate-100'
      }`}>
        <button
          onClick={() => setOpen(o => !o)}
          className="p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        {/* Niveau-indicator */}
        {section.niveau > 1 && (
          <span className="text-xs text-slate-400 font-mono flex-shrink-0">
            {'→'.repeat(section.niveau - 1)}
          </span>
        )}

        {disc && (
          <span className={`text-xs px-2 py-0.5 rounded-md border font-medium flex-shrink-0 ${disciplineCls}`}>
            {DISCIPLINE_LABELS[disc]}
          </span>
        )}

        {/* OPTIE badge */}
        {isOptie && (
          <span className="text-xs px-2 py-0.5 rounded-md border bg-amber-100 text-amber-700 border-amber-300 font-bold flex-shrink-0">
            OPTIE
          </span>
        )}

        {/* Stelpost indicator */}
        {heeftStelposten && !isOptie && (
          <span className="text-xs px-1.5 py-0.5 rounded border bg-orange-50 text-orange-600 border-orange-200 flex-shrink-0">
            stelpost
          </span>
        )}

        <input
          type="text"
          defaultValue={`${nummerPrefix}${section.naam}`}
          onBlur={(e) => {
            // Strip het nummering-prefix als de gebruiker het bewaard laat
            const val = e.target.value.startsWith(nummerPrefix)
              ? e.target.value.slice(nummerPrefix.length)
              : e.target.value
            updateNaam(val)
          }}
          className="flex-1 min-w-0 text-sm font-semibold text-slate-800 bg-transparent border-0 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 -mx-1"
        />

        <span className="text-sm font-medium text-slate-600 ml-auto flex-shrink-0">
          € {section.subtotaal.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
        </span>

        <button
          onClick={toggleDetail}
          title={section.toon_detail ? 'Detailregels verbergen' : 'Detailregels tonen'}
          className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
        >
          {section.toon_detail ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>

        <div className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen(m => !m)}
            className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-32">
                <button
                  onClick={() => { setMenuOpen(false); verwijder() }}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Verwijder sectie
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {open && (
        <QuoteLinesTable
          quoteId={quoteId}
          sectionId={section.id}
          lines={lines}
          type={type}
        />
      )}
    </div>
  )
}
