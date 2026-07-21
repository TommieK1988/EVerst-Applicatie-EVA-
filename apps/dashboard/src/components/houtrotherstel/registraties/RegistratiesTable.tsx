'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Filter, ChevronRight, Image as ImageIcon, X } from 'lucide-react'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import EmptyState from '@/components/houtrotherstel/shared/EmptyState'
import { formatDateShort, formatCurrency, debounce } from '@/lib/houtrotherstel/utils'
import { REGISTRATIE_STATUSSEN } from '@/lib/houtrotherstel/types'

interface RegistratiesTableProps {
  registraties: any[]
  projecten: any[]
  currentFilters: Record<string, string | undefined>
  userRole: string
}

export default function RegistratiesTable({
  registraties,
  projecten,
  currentFilters,
  userRole,
}: RegistratiesTableProps) {
  const router = useRouter()
  const [showFilters, setShowFilters] = useState(false)
  const [localSearch, setLocalSearch] = useState(currentFilters.search || '')

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams()
    Object.entries({ ...currentFilters, [key]: value }).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })
    if (!value) params.delete(key)
    router.push(`/houtrotherstel/registraties?${params.toString()}`)
  }

  const clearFilters = () => {
    router.push('/houtrotherstel/registraties')
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedSearch = useCallback(
    debounce((value: string) => updateFilter('search', value), 400),
    [currentFilters]
  )

  const hasActiveFilters = Object.values(currentFilters).some(Boolean)

  return (
    <div className="space-y-4">
      {/* Zoek en filterbalk */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Zoeken op element, woning, omschrijving..."
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value)
              debouncedSearch(e.target.value)
            }}
            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-everts/20 focus:border-everts"
          />
          {localSearch && (
            <button
              onClick={() => { setLocalSearch(''); updateFilter('search', '') }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2.5 border rounded-lg text-sm font-medium transition-colors
            ${hasActiveFilters
              ? 'border-blue-300 bg-everts-50 text-everts-dark'
              : 'border-slate-300 text-slate-700 hover:border-slate-400'
            }`}
        >
          <Filter className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
          {hasActiveFilters && (
            <span className="bg-everts text-white text-xs w-4 h-4 rounded-full flex items-center justify-center">
              {Object.values(currentFilters).filter(Boolean).length}
            </span>
          )}
        </button>
      </div>

      {/* Filter paneel */}
      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Project</label>
              <select
                value={currentFilters.project || ''}
                onChange={(e) => updateFilter('project', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-everts"
              >
                <option value="">Alle projecten</option>
                {projecten.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (#{p.project_number})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Status</label>
              <select
                value={currentFilters.status || ''}
                onChange={(e) => updateFilter('status', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-everts"
              >
                <option value="">Alle statussen</option>
                {Object.entries(REGISTRATIE_STATUSSEN).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Datum van</label>
              <input
                type="date"
                value={currentFilters.date_from || ''}
                onChange={(e) => updateFilter('date_from', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-everts"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Datum tot</label>
              <input
                type="date"
                value={currentFilters.date_to || ''}
                onChange={(e) => updateFilter('date_to', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-everts"
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-sm text-red-600 hover:underline"
            >
              Alle filters wissen
            </button>
          )}
        </div>
      )}

      {/* Registraties lijst */}
      {registraties.length === 0 ? (
        <EmptyState
          title="Geen registraties gevonden"
          description="Er zijn geen registraties die voldoen aan de huidige filters."
          actionLabel="Nieuwe registratie"
          actionHref="/houtrotherstel/registraties/nieuw"
        />
      ) : (
        <>
          {/* Desktop tabel */}
          <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Datum</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Project</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Locatie</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Reparatie</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Status</th>
                  {userRole !== 'medewerker' && (
                    <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Bedrag</th>
                  )}
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {registraties.map((r: any) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => router.push(`/houtrotherstel/registraties/${r.id}`)}
                  >
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateShort(r.registration_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 truncate max-w-[150px]">
                        {r.projects?.name}
                      </div>
                      <div className="text-xs text-slate-400">#{r.projects?.project_number}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700">
                        {[r.location_block, r.floor, r.room_or_unit].filter(Boolean).join(' · ') || '-'}
                      </div>
                      {r.element_number && (
                        <div className="text-xs text-slate-400 ">{r.element_number}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-700 truncate max-w-[180px]">
                        {r.repair_name_snapshot || r.component_type || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                    {userRole !== 'medewerker' && (
                      <td className="px-4 py-3 text-right text-slate-700 font-medium whitespace-nowrap">
                        {(r.actual_sale_price || r.sale_price_snapshot)
                          ? formatCurrency(r.actual_sale_price || r.sale_price_snapshot)
                          : '-'
                        }
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-slate-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobiele kaarten */}
          <div className="md:hidden space-y-3">
            {registraties.map((r: any) => (
              <Link
                key={r.id}
                href={`/houtrotherstel/registraties/${r.id}`}
                className="block bg-white rounded-xl border border-slate-200 p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-slate-800 truncate">{r.projects?.name}</div>
                    <div className="text-xs text-slate-400">
                      {formatDateShort(r.registration_date)} · #{r.projects?.project_number}
                    </div>
                  </div>
                  <StatusBadge status={r.status} size="sm" />
                </div>

                <div className="text-sm text-slate-600">
                  {[r.location_block, r.floor, r.room_or_unit, r.component_type]
                    .filter(Boolean).join(' · ') || 'Locatie niet opgegeven'}
                </div>

                {r.repair_name_snapshot && (
                  <div className="text-xs text-slate-400 mt-1">{r.repair_name_snapshot}</div>
                )}

                <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {r.repair_photos?.length > 0 && (
                      <span className="flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        {r.repair_photos.length}
                      </span>
                    )}
                    <span>{r.profiles?.full_name}</span>
                  </div>
                  {(r.actual_sale_price || r.sale_price_snapshot) && userRole !== 'medewerker' && (
                    <span className="text-sm font-medium text-slate-700">
                      {formatCurrency(r.actual_sale_price || r.sale_price_snapshot)}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <div className="text-xs text-slate-400 text-center py-2">
            {registraties.length} registratie{registraties.length !== 1 ? 's' : ''} weergegeven
          </div>
        </>
      )}
    </div>
  )
}
