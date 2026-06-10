import type { Metadata } from 'next'
import Link from 'next/link'
import { Plus, FileText } from 'lucide-react'
import { getQuotes } from '@/lib/services/quotes'
import QuoteStatusBadge from '@/components/quotes/QuoteStatusBadge'

export const metadata: Metadata = { title: 'Offertes' }

const TYPE_LABEL: Record<string, string> = {
  verkoopofferte: 'Verkoopofferte',
  interne_calculatie: 'Intern',
}

export default async function QuotesPage() {
  const quotes = await getQuotes()

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-slate-500" />
            Offertes
            <span className="text-sm font-normal text-slate-400">({quotes.length})</span>
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Beheer verkoopoffertes en interne calculaties</p>
        </div>
        <Link
          href="/quotes/new"
          className="flex items-center gap-2 px-4 py-2 bg-everts text-white rounded-lg text-sm font-medium hover:bg-everts/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nieuwe offerte
        </Link>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <FileText className="w-12 h-12 text-slate-200 mb-4" />
            <p className="text-slate-500 font-medium">Nog geen offertes</p>
            <p className="text-slate-400 text-sm mt-1 mb-6">Maak je eerste offerte aan vanuit een calculatie</p>
            <Link
              href="/quotes/new"
              className="flex items-center gap-2 px-4 py-2 bg-everts text-white rounded-lg text-sm font-medium hover:bg-everts/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nieuwe offerte
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Nummer</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Klant</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Titel</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Datum</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Geldig tot</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Totaal</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">Type</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-50 transition-colors group">
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${q.id}`} className="font-mono text-xs text-everts font-medium hover:underline">
                        {q.quote_nummer}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      {(q as any).client?.bedrijfsnaam ?? (q as any).client?.naam ?? <span className="text-slate-400 italic">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${q.id}`} className="text-slate-800 hover:text-everts transition-colors font-medium">
                        {q.titel}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {q.datum ? new Date(q.datum).toLocaleDateString('nl-NL') : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {q.geldig_tot ? new Date(q.geldig_tot).toLocaleDateString('nl-NL') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-800 whitespace-nowrap">
                      {q.totaal_inc_btw > 0
                        ? `€ ${q.totaal_inc_btw.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`
                        : <span className="text-slate-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <QuoteStatusBadge status={q.status} />
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-md border font-medium ${
                        q.type === 'interne_calculatie'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-sky-50 text-sky-700 border-sky-200'
                      }`}>
                        {TYPE_LABEL[q.type] ?? q.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
