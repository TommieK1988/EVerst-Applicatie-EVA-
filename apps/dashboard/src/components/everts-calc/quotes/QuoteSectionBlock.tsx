'use client'

import { useState, useTransition } from 'react'
import { ChevronDown, ChevronRight, MoreVertical, Trash2, Eye, EyeOff } from 'lucide-react'
import { updateSection, verwijderSection } from '@/app/(platform)/everts-calc/actions/quotes'
import QuoteLinesTable from './QuoteLinesTable'
import type { QuoteSection, QuoteType, Discipline } from '@/lib/everts-calc/types-quotes'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useDialogen } from '@/components/ui/dialogen'

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
  const { bevestig } = useDialogen()

  function toggleDetail() {
    startTransition(() => {
      updateSection(section.id, quoteId, { toon_detail: !section.toon_detail })
    })
  }

  async function verwijder() {
    if (!await bevestig({ titel: `Sectie "${section.naam}" en alle regels verwijderen?`, bevestigLabel: 'Verwijderen', destructief: true })) return
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
    <Card className={`${isOptie ? 'border-amber-300' : ''} ${niveauIndent}`}>
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${
        isOptie ? 'bg-amber-50 border-amber-100' : 'border-slate-100'
      }`}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setOpen(o => !o)}
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </Button>

        {/* Niveau-indicator */}
        {section.niveau > 1 && (
          <span className="text-xs text-slate-400  flex-shrink-0">
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

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleDetail}
          title={section.toon_detail ? 'Detailregels verbergen' : 'Detailregels tonen'}
          className="flex-shrink-0"
        >
          {section.toon_detail ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </Button>

        <div className="relative flex-shrink-0">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setMenuOpen(m => !m)}
          >
            <MoreVertical className="w-4 h-4" />
          </Button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-20 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-32">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => { setMenuOpen(false); verwijder() }}
                  className="flex items-center gap-2 w-full justify-start px-3"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Verwijder sectie
                </Button>
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
    </Card>
  )
}
