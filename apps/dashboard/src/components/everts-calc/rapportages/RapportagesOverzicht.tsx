'use client'

import { useState, useEffect } from 'react'
import { FileText, Download, TrendingUp, BarChart3, Euro } from 'lucide-react'
import PageHeader from '@/components/everts-calc/shared/PageHeader'
import StatusBadge from '@/components/everts-calc/shared/StatusBadge'
import { getProjecten, getScenarios, berekenProjectKostprijs } from '@/lib/everts-calc/local-store'
import { berekenProjectTotalen, formatEuro, formatPct } from '@/lib/everts-calc/calculations'
import { getMargeKleur } from '@/lib/everts-calc/utils'
import type { Project } from '@/lib/everts-calc/types'
import { Button } from '@/components/ui'
import { Card, CardHeader } from '@/components/ui'
import { StatCard } from '@/components/ui'
import { Progress } from '@/components/ui'

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
          <Button variant="outline" size="md" onClick={exportExcel}>
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
        }
      />

      {/* KPI kaarten */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Totale kostprijs"
          value={formatEuro(totaalKostprijs)}
          icon={<Euro className="w-5 h-5" />}
          tone="info"
          trend={{ direction: 'flat', value: `${regels.length} projecten` }}
        />
        <StatCard
          label="Totale verkoopprijs"
          value={formatEuro(totaalVerkoopprijs)}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="brand"
          trend={{ direction: 'flat', value: 'alle projecten' }}
        />
        <StatCard
          label="Gem. marge"
          value={formatPct(gemiddeldeMarge)}
          icon={<BarChart3 className="w-5 h-5" />}
          tone={gemiddeldeMarge >= 15 ? 'success' : gemiddeldeMarge >= 10 ? 'warning' : 'error'}
          trend={{ direction: 'flat', value: 'over alle projecten' }}
        />
        <StatCard
          label="Offerte pipeline"
          value={formatEuro(offertePipeline)}
          icon={<FileText className="w-5 h-5" />}
          tone="info"
          trend={{ direction: 'flat', value: 'lopende offertes' }}
        />
      </div>

      {/* Tabel */}
      <Card>
        <CardHeader>
          <span>Calculatieoverzicht per project</span>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-normal normal-case tracking-normal text-neutral-500 mr-1">Sorteren op:</span>
            {(['verkoopprijs', 'marge', 'naam'] as const).map(s => (
              <Button
                key={s}
                variant={sorteer === s ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setSorteer(s)}
              >
                {s === 'verkoopprijs' ? 'Prijs' : s === 'marge' ? 'Marge' : 'Naam'}
              </Button>
            ))}
          </div>
        </CardHeader>
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
                    <td><span className=" text-xs text-slate-400">{project.code}</span></td>
                    <td>
                      <span className="font-medium text-slate-800 text-sm">{project.naam}</span>
                    </td>
                    <td><span className="text-sm text-slate-500">{project.opdrachtgever}</span></td>
                    <td><StatusBadge status={project.status} type="project" size="sm" /></td>
                    <td className="text-right  text-sm text-slate-600">{formatEuro(kostprijs)}</td>
                    <td className="text-right  font-semibold text-sm">{formatEuro(verkoopprijs)}</td>
                    <td className={`text-right  font-bold text-sm ${mKleur.tekst}`}>
                      {formatPct(marge_pct)}
                    </td>
                    <td>
                      <Progress
                        value={margeWidth}
                        size="md"
                        tone={marge_pct >= 15 ? 'success' : marge_pct >= 10 ? 'warning' : 'error'}
                      />
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
                  <td className="text-right px-3  text-sm text-everts-dark">{formatEuro(totaalKostprijs)}</td>
                  <td className="text-right px-3  font-bold text-sm text-everts-dark">{formatEuro(totaalVerkoopprijs)}</td>
                  <td className={`text-right px-3  font-bold text-sm ${getMargeKleur(gemiddeldeMarge).tekst}`}>
                    {formatPct(gemiddeldeMarge)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  )
}
