'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { formatDateShort, formatCurrency } from '@/lib/houtrotherstel/utils'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

interface ProjectRegistratiesTabProps {
  registraties: any[]
  projectId: string
}

type FilterStatus = 'alle' | 'onderhanden' | 'afgerond'

export default function ProjectRegistratiesTab({
  registraties,
  projectId,
}: ProjectRegistratiesTabProps) {
  const [filter, setFilter] = useState<FilterStatus>('alle')

  const gefilterd = filter === 'alle'
    ? registraties
    : registraties.filter((r) => r.status === filter)

  const filters: { value: FilterStatus; label: string }[] = [
    { value: 'alle', label: `Alle (${registraties.length})` },
    { value: 'onderhanden', label: `Onderhanden (${registraties.filter(r => r.status === 'onderhanden').length})` },
    { value: 'afgerond', label: `Afgerond (${registraties.filter(r => r.status === 'afgerond').length})` },
  ]

  return (
    <Card>
      <CardHeader>
        <h2 className="font-semibold text-slate-800">Registraties</h2>
        <Button asChild variant="primary" size="sm">
          <Link href={`/houtrotherstel/registraties/nieuw?project=${projectId}`}>
            <Plus className="w-3.5 h-3.5" />
            Toevoegen
          </Link>
        </Button>
      </CardHeader>

      {/* Filter tabs */}
      <div className="flex gap-1 p-3 border-b border-neutral-200 overflow-x-auto">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={filter === f.value ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilter(f.value)}
            className={filter === f.value ? 'bg-brand-50 text-brand-700 hover:bg-brand-100' : ''}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Lijst */}
      <div className="divide-y divide-slate-100">
        {gefilterd.length === 0 ? (
          <EmptyState
            title="Geen registraties"
            description="Geen registraties in deze categorie"
            tone="neutral"
            size="sm"
          />
        ) : (
          gefilterd.map((r: any) => (
            <Link
              key={r.id}
              href={`/houtrotherstel/registraties/${r.id}`}
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  {r.location_block && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {r.location_block}
                    </span>
                  )}
                  {r.floor && (
                    <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                      {r.floor}
                    </span>
                  )}
                  {r.room_or_unit && (
                    <span className="text-xs text-slate-600">{r.room_or_unit}</span>
                  )}
                  {r.component_type && (
                    <span className="text-xs text-slate-500">· {r.component_type}</span>
                  )}
                  {r.element_number && (
                    <span className="text-xs text-slate-400 ">{r.element_number}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span>{formatDateShort(r.registration_date)}</span>
                  {r.medewerker_naam && (
                    <span>· {r.medewerker_naam}</span>
                  )}
                  {r.repair_name_snapshot && (
                    <span className="hidden sm:inline">· {r.repair_name_snapshot}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {(r.actual_sale_price || r.sale_price_snapshot) > 0 && (
                  <span className="text-xs font-medium text-slate-600 hidden sm:inline">
                    {formatCurrency(r.actual_sale_price || r.sale_price_snapshot)}
                  </span>
                )}
                <StatusBadge status={r.status} size="sm" />
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500" />
              </div>
            </Link>
          ))
        )}
      </div>
    </Card>
  )
}
