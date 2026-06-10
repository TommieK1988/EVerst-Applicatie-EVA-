'use client'

import { useState, useEffect } from 'react'
import { FileText, Download, TrendingUp, BarChart3, Euro } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import StatusBadge from '@/components/shared/StatusBadge'
import { getProjecten, getScenarios, berekenProjectKostprijs } from '@/lib/local-store'
import { berekenProjectTotalen, formatEuro, formatPct } from '@/lib/calculations'
import { getMargeKleur } from '@/lib/utils'
import type { Project } from '@/lib/types'

interface ProjectRegel {
  project: Project
  kostprijs: number
  verkoopprijs: number
  marge_pct: number
}

export default function RapportagesOverzicht() {
  const [regels, setRegels] = useState<ProjectRegel[]>([])
  const [sorteer, setSorteer] = useState<'marge' | 'verkoopprijs' | 'naam'>('verkoopprijs')

  useEffect(() => {
    const projecten = getProjecten()
    const data: ProjectRegel[] = projecten.map(project => {
      const scenarios = getScenarios(project.id)
      const standaard = scenarios.find(s => s.is_standaard) || scenarios[0]
      if (!standaard) return { project, kostprijs: 0, verkoopprijs: 0, marge_pct: 0 }
      const kostprijs = berekenProjectKostprijs(project.id, standaard.id)
      const totalen = berekenProjectTotalen(kostprijs, standaard)
      return { project, kostprijs: totalen.kostprijs, verkoopprijs: totalen.verkoopprijs, marge_pct: totalen.marge_pct }
    })
    setRegels(data)
  }, [])

  const gesorteerd = [...regels].sort((a, b) => {
    if (sorteer === 'marge') return b.marge_pct - a.marge_pct
    if (sorteer === 'verkoopprijs') return b.verkoopprijs - a.verkoopprijs
    return a.project.naam.localeCompare(b.project.naam)
  })

  // Totalen
  const totaalKostprijs = regels.reduce((s, r) => s + r.kostprijs, 0)
  const totaalVerkoopprijs = regels.reduce((s, r) => s + r.verkoopprijs, 0)
  const gemiddeldeMarge = regels.length > 0
    ? regels.reduce((s, r) => s + r.marge_pct, 0) / regels.length
    : 0
  const offertePipeline = regels.filter(r => r.project.status === 'offerte').reduce((s, r) => s + r.verkoopprijs, 0)

  const exportExcel = async () => {
    const { utils, writeFile } = await import('xlsx')
    const data = gesorteerd.map(r => ({
      'Code': r.project.code,
      'Project': r.project.naam,
      'Opdrachtgever': r.project.opdrachtgever,
      'Discipline': r.project.discipline,
      'Status': r.project.status,
      'Kostprijs': r.kostprijs,
      'Verkoopprijs': r.verkoopprijs,
      'Marge %': r.marge_pct.toFixed(1),
    }))
    const ws = utils.json_to_sheet(data)
    const wb = utils.book_new()
    utils.book_append_sheet(wb, ws, 'Calculatieoverzicht')
    writeFile(wb, 'EvertsCalc-Overzicht.xlsx')
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rapportages"
        description="Financieel overzicht van alle projecten"
        actions={
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium px-4 py-2.5 rounded-lg text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </button>
        }
      />

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Totale kostprijs',
            waarde: formatEuro(totaalKostprijs),
            icon: Euro,
            kleur: 'text-slate-700',
            sub: `${regels.length} projecten`,
          },
          {
            label: 'Totale verkoopprijs',
            waarde: formatEuro(totaalVerkoopprijs),
            icon: TrendingUp,
            kleur: 'text-everts',
            sub: 'alle projecten',
          },
          {
            label: 'Gem. marge',
            waarde: formatPct(gemiddeldeMarge),
            icon: BarChart3,
            kleur: gemiddeldeMarge >= 15 ? 'text-everts' : gemiddeldeMarge >= 10 ? 'text-amber-600' : 'text-red-600',
            sub: 'over alle projecten',
          },
          {
            label: 'Offerte pipeline',
            waarde: formatEuro(offertePipeline),
            icon: FileText,
            kleur: 'text-blue-600',
            sub: 'lopende offertes',
          },
        ].map(kpi => (
          <div key={kpi.label} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">{kpi.label}</span>
              <kpi.icon className={`w-4 h-4 ${kpi.kleur}`} />
            </div>
            <div className={`text-xl font-bold ${kpi.kleur}`}>{kpi.waarde}</div>
            <div className="text-xs text-slate-400 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabel */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 text-sm">Calculatieoverzicht per project</h3>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Sorteren op:
            {(['verkoopprijs', 'marge', 'naam'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSorteer(s)}
                className={`px-2 py-1 rounded ${sorteer === s ? 'bg-everts-50 text-everts-dark font-medium' : 'hover:bg-slate-50'}`}
              >
                {s === 'verkoopprijs' ? 'Prijs' : s === 'marge' ? 'Marge' : 'Naam'}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="calc-table w-full">
            <thead>
              <tr>
                <th>Code</th>
                <th>Project</th>
                <th>Opdrachtgever</th>
                <th>Status</th>
                <th className="text-right">Kostprijs</th>
                <th className="text-right">Verkoopprijs</th>
                <th className="text-right">Marge</th>
                <th className="w-32">Marge indicator</th>
              </tr>
            </thead>
            <tbody>
              {gesorteerd.map(({ project, kostprijs, verkoopprijs, marge_pct }) => {
                const mKleur = getMargeKleur(marge_pct)
                const margeWidth = Math.min(100, Math.max(0, (marge_pct / 30) * 100))

                return (
                  <tr key={project.id}>
                    <td><span className="font-mono text-xs text-slate-400">{project.code}</span></td>
                    <td>
                      <span className="font-medium text-slate-800 text-sm">{project.naam}</span>
                    </td>
                    <td><span className="text-sm text-slate-500">{project.opdrachtgever}</span></td>
                    <td><StatusBadge status={project.status} type="project" size="sm" /></td>
                    <td className="text-right font-mono text-sm text-slate-600">{formatEuro(kostprijs)}</td>
                    <td className="text-right font-mono font-semibold text-sm">{formatEuro(verkoopprijs)}</td>
                    <td className={`text-right font-mono font-bold text-sm ${mKleur.tekst}`}>
                      {formatPct(marge_pct)}
                    </td>
                    <td>
                      <div className="marge-balk">
                        <div className={`marge-balk-inner ${mKleur.balk}`} style={{ width: `${margeWidth}%` }} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {gesorteerd.length > 1 && (
              <tfoot>
                <tr className="bg-everts-50/50 font-semibold">
                  <td colSpan={4} className="px-3 py-2.5 text-sm text-everts-dark">
                    Totaal ({gesorteerd.length} projecten)
                  </td>
                  <td className="text-right px-3 font-mono text-sm text-everts-dark">{formatEuro(totaalKostprijs)}</td>
                  <td className="text-right px-3 font-mono font-bold text-sm text-everts-dark">{formatEuro(totaalVerkoopprijs)}</td>
                  <td className={`text-right px-3 font-mono font-bold text-sm ${getMargeKleur(gemiddeldeMarge).tekst}`}>
                    {formatPct(gemiddeldeMarge)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
