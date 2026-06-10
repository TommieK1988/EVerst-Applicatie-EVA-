'use client'

import { useState, useTransition } from 'react'
import { Trash2, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { maakLine, updateLine, verwijderLine } from '@/app/actions/quotes'
import type { QuoteLine, QuoteType } from '@/lib/types-quotes'

interface Props {
  quoteId: string
  sectionId?: string | null
  lines: QuoteLine[]
  type: QuoteType
}

export default function QuoteLinesTable({ quoteId, sectionId, lines, type }: Props) {
  const [, startTransition] = useTransition()
  const isIntern = type === 'interne_calculatie'

  function handleLineBlur(lineId: string, field: string, raw: string, huidig: QuoteLine) {
    const numFields = ['hoeveelheid', 'eenheidsprijs', 'btw_pct', 'kostprijs_pe', 'uren_pe']
    const isNum = numFields.includes(field)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const val: any = isNum ? (raw === '' ? null : parseFloat(raw) || 0) : raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const huidigVal = (huidig as any)[field]
    if (String(val) === String(huidigVal ?? '')) return
    startTransition(() => { updateLine(lineId, quoteId, { [field]: val }) })
  }

  function voegRegelToe() {
    startTransition(() => {
      maakLine({
        quote_id: quoteId,
        section_id: sectionId ?? null,
        omschrijving: '',
        hoeveelheid: 1,
        eenheid: 'st',
        eenheidsprijs: 0,
        volgorde: lines.length,
      })
    })
  }

  function verwijder(lineId: string) {
    startTransition(() => { verwijderLine(lineId, quoteId) })
  }

  return (
    <div>
      <table className="w-full text-xs">
        <colgroup>
          <col className="w-6" />
          {/* Omschrijving: flex-1 via min-w-0 */}
          <col style={{ width: '99%' }} />
          <col className="w-16" />
          <col className="w-12" />
          <col className="w-20" />
          {isIntern && <col className="w-20" />}
          {isIntern && <col className="w-16" />}
          {isIntern && <col className="w-14" />}
          <col className="w-24" />
          <col className="w-7" />
        </colgroup>
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/50">
            <th className="px-2 py-1.5" />
            <th className="text-left px-2 py-1.5 font-medium text-slate-400">Omschrijving</th>
            <th className="text-right px-2 py-1.5 font-medium text-slate-400">Hoev.</th>
            <th className="text-left px-2 py-1.5 font-medium text-slate-400">Eenh.</th>
            <th className="text-right px-2 py-1.5 font-medium text-slate-400">Prijs/eenh</th>
            {isIntern && <th className="text-right px-2 py-1.5 font-medium text-slate-400">KP/eenh</th>}
            {isIntern && <th className="text-right px-2 py-1.5 font-medium text-slate-400">Uren</th>}
            {isIntern && <th className="text-right px-2 py-1.5 font-medium text-slate-400">Marge%</th>}
            <th className="text-right px-2 py-1.5 font-medium text-slate-400">Totaal</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((line, idx) => (
            <LineRow
              key={line.id}
              idx={idx + 1}
              line={line}
              isIntern={isIntern}
              onBlur={handleLineBlur}
              onDelete={() => verwijder(line.id)}
            />
          ))}
        </tbody>
      </table>

      <div className="px-2 py-2 border-t border-slate-100">
        <button
          onClick={voegRegelToe}
          className="flex items-center gap-1.5 text-xs text-everts hover:text-everts/80 font-medium transition-colors"
        >
          <Plus className="w-3 h-3" />
          Regel toevoegen
        </button>
      </div>
    </div>
  )
}

function LineRow({
  idx, line, isIntern, onBlur, onDelete,
}: {
  idx: number
  line: QuoteLine
  isIntern: boolean
  onBlur: (lineId: string, field: string, raw: string, huidig: QuoteLine) => void
  onDelete: () => void
}) {
  const [localH, setLocalH] = useState(String(line.hoeveelheid))
  const [localP, setLocalP] = useState(String(line.eenheidsprijs))
  const [werkOpen, setWerkOpen] = useState(false)
  const [werkText, setWerkText] = useState(line.opmerking ?? '')

  const localTotal = (parseFloat(localH) || 0) * (parseFloat(localP) || 0)
  const heeftWerkomschrijving = (line.opmerking ?? '').trim().length > 0

  const marge = isIntern && line.kostprijs_pe && line.kostprijs_pe > 0
    ? ((line.eenheidsprijs - line.kostprijs_pe) / line.eenheidsprijs * 100).toFixed(1)
    : null

  return (
    <>
      <tr className="group hover:bg-slate-50/50 border-b border-slate-50">
        <td className="px-2 py-1 text-slate-400 text-center align-top pt-2">{idx}</td>

        {/* Omschrijving — zo breed mogelijk */}
        <td className="px-2 py-1 align-top">
          <div className="flex items-start gap-1">
            <button
              onClick={() => setWerkOpen(o => !o)}
              className={`mt-0.5 flex-shrink-0 p-0.5 rounded transition-colors ${
                heeftWerkomschrijving
                  ? 'text-everts hover:text-everts/70'
                  : 'text-slate-200 hover:text-slate-400'
              }`}
              title="Werkomschrijving tonen/verbergen"
            >
              {werkOpen
                ? <ChevronDown className="w-3 h-3" />
                : <ChevronRight className="w-3 h-3" />}
            </button>
            <input
              type="text"
              defaultValue={line.omschrijving}
              onBlur={(e) => onBlur(line.id, 'omschrijving', e.target.value, line)}
              className="w-full bg-transparent border-0 text-slate-700 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 py-0.5 text-xs"
              placeholder="Omschrijving..."
            />
          </div>
        </td>

        <td className="px-2 py-1 align-top">
          <input
            type="number"
            value={localH}
            onChange={(e) => setLocalH(e.target.value)}
            onBlur={(e) => onBlur(line.id, 'hoeveelheid', e.target.value, line)}
            className="w-full bg-transparent border-0 text-right text-slate-700 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 py-0.5 text-xs"
            step="any"
          />
        </td>
        <td className="px-2 py-1 align-top">
          <input
            type="text"
            defaultValue={line.eenheid}
            onBlur={(e) => onBlur(line.id, 'eenheid', e.target.value, line)}
            className="w-full bg-transparent border-0 text-slate-600 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 py-0.5 text-xs"
          />
        </td>
        <td className="px-2 py-1 align-top">
          <input
            type="number"
            value={localP}
            onChange={(e) => setLocalP(e.target.value)}
            onBlur={(e) => onBlur(line.id, 'eenheidsprijs', e.target.value, line)}
            className="w-full bg-transparent border-0 text-right text-slate-700 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 py-0.5 text-xs"
            step="0.01"
          />
        </td>
        {isIntern && (
          <>
            <td className="px-2 py-1 align-top">
              <input
                type="number"
                defaultValue={line.kostprijs_pe ?? ''}
                onBlur={(e) => onBlur(line.id, 'kostprijs_pe', e.target.value, line)}
                className="w-full bg-transparent border-0 text-right text-slate-500 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 py-0.5 text-xs"
                step="0.01"
                placeholder="—"
              />
            </td>
            <td className="px-2 py-1 align-top">
              <input
                type="number"
                defaultValue={line.uren_pe ?? ''}
                onBlur={(e) => onBlur(line.id, 'uren_pe', e.target.value, line)}
                className="w-full bg-transparent border-0 text-right text-slate-500 focus:outline-none focus:bg-white focus:border focus:border-everts/30 focus:rounded px-1 py-0.5 text-xs"
                step="0.001"
                placeholder="—"
              />
            </td>
            <td className="px-2 py-1 text-right text-slate-400 align-top pt-2">
              {marge !== null ? `${marge}%` : '—'}
            </td>
          </>
        )}
        <td className="px-2 py-1 text-right font-medium text-slate-700 whitespace-nowrap align-top pt-2">
          € {localTotal.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </td>
        <td className="px-1 py-1 align-top">
          <button
            onClick={onDelete}
            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </td>
      </tr>

      {/* Werkomschrijving rij */}
      {werkOpen && (
        <tr className="bg-slate-50/40">
          <td />
          <td colSpan={isIntern ? 8 : 5} className="px-4 pb-2 pt-1">
            <div className="pl-4 border-l-2 border-everts/20">
              <div className="text-xs text-slate-400 mb-1 font-medium">Werkomschrijving</div>
              <textarea
                value={werkText}
                onChange={(e) => setWerkText(e.target.value)}
                onBlur={(e) => onBlur(line.id, 'opmerking', e.target.value, line)}
                rows={3}
                placeholder="Uitgebreide werkomschrijving..."
                className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 focus:outline-none focus:ring-1 focus:ring-everts/30 focus:border-everts resize-none leading-relaxed bg-white"
              />
            </div>
          </td>
          <td />
        </tr>
      )}
    </>
  )
}
