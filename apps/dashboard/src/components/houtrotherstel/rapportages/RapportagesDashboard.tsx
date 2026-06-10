'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChart3, Euro, TrendingUp, ClipboardList, Download, FileText
} from 'lucide-react'
import StatCard from '@/components/houtrotherstel/shared/StatCard'
import StatusBadge from '@/components/houtrotherstel/shared/StatusBadge'
import { formatCurrency, formatNumber, formatDateShort } from '@/lib/houtrotherstel/utils'

interface RapportagesDashboardProps {
  registraties: any[]
  projecten: any[]
  projectStats: any[]
  currentFilters: Record<string, string | undefined>
}

export default function RapportagesDashboard({
  registraties,
  projecten,
  projectStats,
  currentFilters,
}: RapportagesDashboardProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overzicht' | 'projecten' | 'categorieen' | 'medewerkers' | 'registraties'>('overzicht')

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams()
    Object.entries({ ...currentFilters, [key]: value }).forEach(([k, v]) => {
      if (v) params.set(k, v)
    })
    if (!value) params.delete(key)
    router.push(`/houtrotherstel/rapportages?${params.toString()}`)
  }

  // Berekeningen
  const stats = useMemo(() => {
    const totalVerkoopprijs = registraties.reduce((sum, r) =>
      sum + (Number(r.actual_sale_price || r.sale_price_snapshot) || 0), 0)
    const totalKostprijs = registraties.reduce((sum, r) =>
      sum + (Number(r.actual_cost_price || r.cost_price_snapshot) || 0), 0)
    const totalMarge = totalVerkoopprijs - totalKostprijs
    const totalUren = registraties.reduce((sum, r) =>
      sum + (Number(r.actual_labor_hours || r.labor_hours_snapshot) || 0), 0)

    return { totalVerkoopprijs, totalKostprijs, totalMarge, totalUren }
  }, [registraties])

  // Per categorie
  const perCategorie = useMemo(() => {
    const map: Record<string, { count: number; verkoopprijs: number; kostprijs: number }> = {}
    registraties.forEach(r => {
      const cat = r.standard_repairs?.category || r.component_type || 'Overig'
      if (!map[cat]) map[cat] = { count: 0, verkoopprijs: 0, kostprijs: 0 }
      map[cat].count++
      map[cat].verkoopprijs += Number(r.actual_sale_price || r.sale_price_snapshot) || 0
      map[cat].kostprijs += Number(r.actual_cost_price || r.cost_price_snapshot) || 0
    })
    return Object.entries(map)
      .sort((a, b) => b[1].verkoopprijs - a[1].verkoopprijs)
  }, [registraties])

  // Per medewerker
  const perMedewerker = useMemo(() => {
    const map: Record<string, { naam: string; count: number; verkoopprijs: number; uren: number }> = {}
    registraties.forEach(r => {
      const uid = r.profiles?.id || 'unknown'
      if (!map[uid]) map[uid] = { naam: r.profiles?.full_name || 'Onbekend', count: 0, verkoopprijs: 0, uren: 0 }
      map[uid].count++
      map[uid].verkoopprijs += Number(r.actual_sale_price || r.sale_price_snapshot) || 0
      map[uid].uren += Number(r.actual_labor_hours || r.labor_hours_snapshot) || 0
    })
    return Object.values(map).sort((a, b) => b.verkoopprijs - a.verkoopprijs)
  }, [registraties])

  // Status verdeling
  const perStatus = useMemo(() => {
    const map: Record<string, number> = {}
    registraties.forEach(r => {
      map[r.status] = (map[r.status] || 0) + 1
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [registraties])

  const exportNaarExcel = () => {
    import('xlsx').then(({ utils, writeFile }) => {
      const wsData = registraties.map(r => ({
        'Datum': formatDateShort(r.registration_date),
        'Project': r.projects?.name,
        'Projectnummer': r.projects?.project_number,
        'Medewerker': r.profiles?.full_name,
        'Component': r.component_type,
        'Reparatie': r.repair_name_snapshot,
        'Status': r.status,
        'Verkoopprijs': Number(r.actual_sale_price || r.sale_price_snapshot) || 0,
        'Kostprijs': Number(r.actual_cost_price || r.cost_price_snapshot) || 0,
        'Arbeidsuren': Number(r.actual_labor_hours || r.labor_hours_snapshot) || 0,
      }))

      const ws = utils.json_to_sheet(wsData)
      const wb = utils.book_new()
      utils.book_append_sheet(wb, ws, 'Registraties')
      writeFile(wb, `rapportage_${new Date().toISOString().split('T')[0]}.xlsx`)
    })
  }

  const tabs = [
    { value: 'overzicht', label: 'Overzicht' },
    { value: 'projecten', label: 'Per project' },
    { value: 'categorieen', label: 'Per categorie' },
    { value: 'medewerkers', label: 'Per medewerker' },
    { value: 'registraties', label: 'Alle registraties' },
  ] as const

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Project</label>
            <select
              value={currentFilters.project || ''}
              onChange={(e) => updateFilter('project', e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-everts"
            >
              <option value="">Alle projecten</option>
              {projecten.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
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
      </div>

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Totaal verkoopwaarde"
          value={formatCurrency(stats.totalVerkoopprijs)}
          icon={<Euro className="w-5 h-5" />}
          color="blue"
        />
        <StatCard
          title="Totaal marge"
          value={formatCurrency(stats.totalMarge)}
          icon={<TrendingUp className="w-5 h-5" />}
          color={stats.totalMarge >= 0 ? 'green' : 'red'}
          subtitle={stats.totalVerkoopprijs > 0
            ? `${((stats.totalMarge / stats.totalVerkoopprijs) * 100).toFixed(1)}%`
            : '-'}
        />
        <StatCard
          title="Aantal registraties"
          value={registraties.length}
          icon={<ClipboardList className="w-5 h-5" />}
          color="purple"
        />
        <StatCard
          title="Totaal arbeidsuren"
          value={`${formatNumber(stats.totalUren, 1)} u`}
          icon={<BarChart3 className="w-5 h-5" />}
          color="yellow"
        />
      </div>

      {/* Export knoppen */}
      <div className="flex gap-2 justify-end">
        <button
          onClick={exportNaarExcel}
          className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700
            text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Download className="w-4 h-4" />
          Export Excel
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-300
            hover:border-slate-400 text-slate-700 text-sm font-medium rounded-lg transition-colors"
        >
          <FileText className="w-4 h-4" />
          Afdrukken
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${activeTab === tab.value
                  ? 'border-blue-600 text-everts'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab inhoud */}
      {activeTab === 'overzicht' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Status verdeling */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Statusverdeling</h3>
            <div className="space-y-3">
              {perStatus.map(([status, count]) => (
                <div key={status} className="flex items-center gap-3">
                  <StatusBadge status={status} size="sm" />
                  <div className="flex-1 bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-everts-light h-2 rounded-full"
                      style={{ width: `${(count / registraties.length * 100).toFixed(0)}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-slate-700 w-8 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top categorieën */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-800 mb-4">Top categorieën (verkoopwaarde)</h3>
            <div className="space-y-3">
              {perCategorie.slice(0, 8).map(([cat, data]) => (
                <div key={cat} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-700 truncate">{cat}</div>
                    <div className="text-xs text-slate-400">{data.count} registraties</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-800">{formatCurrency(data.verkoopprijs)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'projecten' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Project</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden sm:table-cell">Registraties</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Verkoopprijs</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden md:table-cell">Kostprijs</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden lg:table-cell">Marge</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden lg:table-cell">Marge %</th>
              </tr>
            </thead>
            <tbody>
              {projectStats.map((ps: any) => {
                const marge = ps.totaal_verkoopprijs - ps.totaal_kostprijs
                const margePerc = ps.totaal_verkoopprijs > 0
                  ? (marge / ps.totaal_verkoopprijs * 100)
                  : 0

                return (
                  <tr key={ps.project_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{ps.project_name}</div>
                      <div className="text-xs text-slate-400">#{ps.project_number}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">
                      {ps.totaal_registraties}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-everts-dark">
                      {formatCurrency(ps.totaal_verkoopprijs)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600 hidden md:table-cell">
                      {formatCurrency(ps.totaal_kostprijs)}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className={marge >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {formatCurrency(marge)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <span className={margePerc >= 20 ? 'text-green-600 font-medium' :
                        margePerc >= 10 ? 'text-yellow-600 font-medium' : 'text-red-600 font-medium'}>
                        {margePerc.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200">
                <td className="px-4 py-3 font-semibold text-slate-800">Totaal</td>
                <td className="px-4 py-3 text-right font-semibold hidden sm:table-cell">{registraties.length}</td>
                <td className="px-4 py-3 text-right font-semibold text-everts-dark">
                  {formatCurrency(stats.totalVerkoopprijs)}
                </td>
                <td className="px-4 py-3 text-right font-semibold hidden md:table-cell">
                  {formatCurrency(stats.totalKostprijs)}
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className={`font-semibold ${stats.totalMarge >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(stats.totalMarge)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right hidden lg:table-cell">
                  <span className="font-semibold">
                    {stats.totalVerkoopprijs > 0
                      ? `${((stats.totalMarge / stats.totalVerkoopprijs) * 100).toFixed(1)}%`
                      : '-'}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {activeTab === 'categorieen' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Categorie</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Aantal</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Verkoopprijs</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden sm:table-cell">Kostprijs</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden md:table-cell">Marge</th>
              </tr>
            </thead>
            <tbody>
              {perCategorie.map(([cat, data]) => (
                <tr key={cat} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{cat}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{data.count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-everts-dark">{formatCurrency(data.verkoopprijs)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">{formatCurrency(data.kostprijs)}</td>
                  <td className="px-4 py-3 text-right hidden md:table-cell">
                    <span className={`font-medium ${(data.verkoopprijs - data.kostprijs) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.verkoopprijs - data.kostprijs)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'medewerkers' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Medewerker</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Registraties</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Verkoopwaarde</th>
                <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs hidden sm:table-cell">Arbeidsuren</th>
              </tr>
            </thead>
            <tbody>
              {perMedewerker.map((m) => (
                <tr key={m.naam} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.naam}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{m.count}</td>
                  <td className="px-4 py-3 text-right font-semibold text-everts-dark">{formatCurrency(m.verkoopprijs)}</td>
                  <td className="px-4 py-3 text-right text-slate-600 hidden sm:table-cell">
                    {formatNumber(m.uren, 1)} u
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'registraties' && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0">
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs whitespace-nowrap">Datum</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs">Project</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs hidden sm:table-cell">Reparatie</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-500 text-xs hidden md:table-cell">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-500 text-xs">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {registraties.map((r: any) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      {formatDateShort(r.registration_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800 truncate max-w-[140px]">{r.projects?.name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 hidden sm:table-cell">
                      {r.repair_name_snapshot || r.component_type || '-'}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <StatusBadge status={r.status} size="sm" />
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-slate-700">
                      {formatCurrency(r.actual_sale_price || r.sale_price_snapshot)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
