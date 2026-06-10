'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Plus } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import RegistratiesTable from '@/components/registraties/RegistratiesTable'
import { getAllRegistraties, getAllProjecten } from '@/lib/local-store'

export default function RegistratiesLijst() {
  const searchParams = useSearchParams()
  const [registraties, setRegistraties] = useState<any[]>([])
  const [projecten, setProjecten] = useState<any[]>([])

  useEffect(() => {
    setRegistraties(getAllRegistraties())
    setProjecten(getAllProjecten())
  }, [])

  const filters = {
    project: searchParams.get('project') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  }

  let gefilterd = registraties
  if (filters.project) gefilterd = gefilterd.filter(r => r.project_id === filters.project)
  if (filters.status) gefilterd = gefilterd.filter(r => r.status === filters.status)
  if (filters.search) {
    const q = filters.search.toLowerCase()
    gefilterd = gefilterd.filter(r =>
      r.element_number?.toLowerCase().includes(q) ||
      r.room_or_unit?.toLowerCase().includes(q) ||
      r.damage_description?.toLowerCase().includes(q) ||
      r.repair_name_snapshot?.toLowerCase().includes(q)
    )
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <PageHeader
        title="Registraties"
        description={`${gefilterd.length} registratie${gefilterd.length !== 1 ? 's' : ''}`}
        actions={
          <Link
            href="/registraties/nieuw"
            className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Nieuwe registratie</span>
          </Link>
        }
      />
      <RegistratiesTable
        registraties={gefilterd}
        projecten={projecten}
        currentFilters={filters}
        userRole="admin"
      />
    </div>
  )
}
