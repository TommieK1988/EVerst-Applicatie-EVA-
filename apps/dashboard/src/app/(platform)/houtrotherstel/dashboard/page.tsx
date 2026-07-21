'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ClipboardList, CheckCircle, AlertTriangle, FolderOpen, TrendingUp, Plus } from 'lucide-react'
import StatCard from '@/components/houtrotherstel/shared/StatCard'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { formatCurrency, formatDateShort } from '@/lib/houtrotherstel/utils'
import { getRegistraties } from '@/services/houtrotherstel/registraties'
import { getProjects } from '@/services/houtrotherstel/projects'

export default function DashboardPage() {
  const [registraties, setRegistraties] = useState<any[]>([])
  const [projecten, setProjecten] = useState<any[]>([])

  useEffect(() => {
    getRegistraties().then(setRegistraties).catch(() => setRegistraties([]))
    getProjects()
      .then(rows => setProjecten(rows.filter(p => p.status === 'actief')))
      .catch(() => setProjecten([]))
  }, [])

  const openCount = registraties.filter(r => r.status === 'open').length
  const inUitvoeringCount = registraties.filter(r => ['in_uitvoering', 'ingepland'].includes(r.status)).length
  const gereedCount = registraties.filter(r => r.status === 'gereed').length
  const gecontroleerCount = registraties.filter(r => r.status === 'gecontroleerd').length
  const afgekeurdCount = registraties.filter(r => r.status === 'afgekeurd').length
  const totalVerkoopwaarde = registraties.reduce((sum, r) =>
    sum + (Number(r.actual_sale_price || r.sale_price_snapshot) || 0), 0)

  return (
    <div className="space-y-6 pb-20 lg:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
            Houtrotherstel
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Hier is een overzicht van de actuele situatie
          </p>
        </div>
        <Link
          href="/houtrotherstel/registraties/nieuw"
          className="inline-flex items-center gap-2 bg-everts hover:bg-everts-dark text-white
            font-medium px-4 py-2.5 rounded-lg text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Nieuwe registratie
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Open registraties"
          value={openCount}
          icon={<ClipboardList className="w-5 h-5" />}
          color="blue"
          subtitle={`${inUitvoeringCount} in uitvoering`}
        />
        <StatCard
          title="Gereed"
          value={gereedCount}
          icon={<CheckCircle className="w-5 h-5" />}
          color="green"
          subtitle={`${gecontroleerCount} gecontroleerd`}
        />
        <StatCard
          title="Afgekeurd"
          value={afgekeurdCount}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={afgekeurdCount > 0 ? 'red' : 'slate'}
          subtitle="Actie vereist"
        />
        <StatCard
          title="Verkoopwaarde"
          value={formatCurrency(totalVerkoopwaarde)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="purple"
          subtitle="Alle registraties"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Recente registraties</h2>
            <Link href="/houtrotherstel/registraties" className="text-sm text-everts hover:underline">
              Alles bekijken
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {registraties.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">Geen registraties.</p>
            ) : registraties.map((r) => (
              <Link
                key={r.id}
                href={`/houtrotherstel/registraties/${r.id}`}
                className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {r.projects?.name}
                    </span>
                    <span className="text-slate-400 text-xs hidden sm:inline">
                      #{r.projects?.project_number}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {formatDateShort(r.registration_date)} · {r.repair_name_snapshot}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm font-medium text-slate-700 hidden sm:inline">
                    {formatCurrency(r.actual_sale_price || r.sale_price_snapshot)}
                  </span>
                  <StatusBadge status={r.status} size="sm" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-800">Actieve projecten</h2>
            <Link href="/houtrotherstel/projecten" className="text-sm text-everts hover:underline">Alles</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {projecten.length === 0 ? (
              <p className="p-5 text-sm text-slate-400">Geen actieve projecten.</p>
            ) : projecten.map((p) => (
              <Link
                key={p.id}
                href={`/houtrotherstel/projecten/${p.id}`}
                className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="w-8 h-8 bg-everts-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <FolderOpen className="w-4 h-4 text-everts" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                  <div className="text-xs text-slate-500">{p.city} · #{p.project_number}</div>
                </div>
              </Link>
            ))}
            <Link
              href="/houtrotherstel/projecten/nieuw"
              className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors text-everts"
            >
              <div className="w-8 h-8 border-2 border-dashed border-blue-300 rounded-lg flex items-center justify-center flex-shrink-0">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Nieuw project aanmaken</span>
            </Link>
          </div>
        </div>
      </div>

      {afgekeurdCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {afgekeurdCount} registratie{afgekeurdCount !== 1 ? 's' : ''} afgekeurd
            </p>
            <p className="text-xs text-red-600 mt-0.5">Er zijn registraties die herstel vereisen.</p>
            <Link href="/houtrotherstel/registraties?status=afgekeurd" className="text-xs text-red-700 font-medium hover:underline mt-1 inline-block">
              Bekijk afgekeurde registraties →
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
