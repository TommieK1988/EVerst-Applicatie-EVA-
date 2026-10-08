'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useManagementData } from './ManagementShell'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { berekenManagementKpi } from '@/lib/dashboard/aggregaties'
import { berekenWijzigingen, type WerkCijfers } from '@/lib/dashboard/wijzigingen'
import DashboardView from './DashboardView'
import GroteWijzigingen from './GroteWijzigingen'
import WerkVerloopDialog from './WerkVerloopDialog'
import { maandLabel, maandParam } from './maand'

export default function DashboardPagina({ periodes, gekozen, vorigeRegels }: {
  /** Vastgestelde maanden, nieuwste eerst. */
  periodes: string[]
  gekozen: string | null
  vorigeRegels: WerkCijfers[] | null
}) {
  const { projecten, akData, doelstellingen } = useManagementData()
  const router = useRouter()
  const [laden, startLaden] = useTransition()
  const [verloopWerk, setVerloopWerk] = useState<WerkCijfers | null>(null)

  const kpi = useMemo(
    () => berekenManagementKpi(projecten, akData, doelstellingen),
    [projecten, akData, doelstellingen],
  )
  const wijzigingen = useMemo(
    () => (vorigeRegels ? berekenWijzigingen(projecten, vorigeRegels) : null),
    [projecten, vorigeRegels],
  )
  const live = verloopWerk?.bouw7_id
    ? projecten.find(p => p.bouw7_id === verloopWerk.bouw7_id) ?? null
    : null

  const maandKeuze = periodes.length > 1 && gekozen ? (
    <Select
      value={maandParam(gekozen)}
      disabled={laden}
      onValueChange={v => startLaden(() => router.push(`/management/dashboard?vergelijk=${v}`, { scroll: false }))}
    >
      <SelectTrigger aria-label="Vergelijk met vastgestelde maand" className="h-8 w-auto min-w-[220px] text-[12px] font-normal">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periodes.map(p => <SelectItem key={p} value={maandParam(p)}>Vergelijk met {maandLabel(p)}</SelectItem>)}
      </SelectContent>
    </Select>
  ) : null

  return (
    <>
      <DashboardView
        kpi={kpi}
        naKpi={
          <div className={laden ? 'opacity-60 transition-opacity' : undefined}>
            <GroteWijzigingen
              wijzigingen={wijzigingen}
              sindsLabel={gekozen ? maandLabel(gekozen) : null}
              kopActies={maandKeuze}
              onKiesWerk={setVerloopWerk}
            />
          </div>
        }
      />
      <WerkVerloopDialog werk={verloopWerk} live={live} onClose={() => setVerloopWerk(null)} />
    </>
  )
}
