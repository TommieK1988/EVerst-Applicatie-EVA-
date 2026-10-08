'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SubTabs } from '@/components/ui/sub-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import type { ManagementProject, MaandSnapshotSamenvatting } from '@/lib/dashboard/aggregaties'
import type { SnapshotRegel } from '@/lib/dashboard/snapshot-queries'
import { berekenWijzigingen, type WerkCijfers } from '@/lib/dashboard/wijzigingen'
import { useManagementData } from './ManagementShell'
import DashboardView from './DashboardView'
import ManagementProjectenTabel from './ManagementProjectenTabel'
import GroteWijzigingen from './GroteWijzigingen'
import WerkVerloopDialog from './WerkVerloopDialog'
import { maandLabel } from './maand'

export type SnapshotDetailDeel = 'dashboard' | 'werken' | 'wijzigingen'

export type SnapshotDetailData = {
  periode: string
  deel: SnapshotDetailDeel
  /** Werken van deze maand; alleen geladen voor de tabbladen Werken en Wijzigingen. */
  regels: SnapshotRegel[] | null
  vorigePeriode: string | null
  /** Werken van de maand ervóór; alleen geladen voor Wijzigingen. */
  vorigeRegels: WerkCijfers[] | null
}

function fDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/** Een bevroren regel in de vorm die de live projectentabel verwacht. */
function alsProject(r: SnapshotRegel): ManagementProject {
  return { ...r, bouw7_laatst_sync: null, ohw_omzet: 0, ohw_resultaat: 0 }
}

/** Eén vastgestelde maand: bevroren dashboard, de werken van toen, en wat er t.o.v. de maand ervoor verschoof. */
export default function SnapshotDetail({ snapshot, data }: {
  snapshot: MaandSnapshotSamenvatting
  data: SnapshotDetailData
}) {
  const { projecten, layouts, user_id } = useManagementData()
  const [verloopWerk, setVerloopWerk] = useState<WerkCijfers | null>(null)

  const rows = useMemo(() => (data.regels ?? []).map(alsProject), [data.regels])
  const wijzigingen = useMemo(
    () => (data.regels && data.vorigeRegels ? berekenWijzigingen(data.regels, data.vorigeRegels) : null),
    [data.regels, data.vorigeRegels],
  )
  const live = verloopWerk?.bouw7_id
    ? projecten.find(p => p.bouw7_id === verloopWerk.bouw7_id) ?? null
    : null

  return (
    <div className="flex h-full flex-col gap-4 pb-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <div className="text-[15px] font-bold text-neutral-900">Vastgestelde cijfers — {maandLabel(snapshot.periode)}</div>
          <div className="text-[12px] text-neutral-500">
            Vastgesteld op {fDatum(snapshot.vastgesteld_op)}{snapshot.vastgesteld_door_naam ? ` door ${snapshot.vastgesteld_door_naam}` : ''}
            {snapshot.opmerking ? ` · ${snapshot.opmerking}` : ''}
          </div>
        </div>
        <Button asChild variant="outline" size="md">
          <Link href="/management/historie"><ArrowLeft className="h-4 w-4 mr-1" /> Terug naar overzicht</Link>
        </Button>
      </div>

      <div className="rounded-md bg-info-50 px-3 py-2 text-[12px] text-info-700">
        Dit zijn de bevroren cijfers zoals vastgesteld — niet de huidige live-stand.
      </div>

      <div className="-mb-4">
        <SubTabs delen={[
          { deel: 'dashboard', label: 'Dashboard', actief: data.deel === 'dashboard' },
          { deel: 'werken', label: 'Werken', actief: data.deel === 'werken' },
          { deel: 'wijzigingen', label: 'Wijzigingen', actief: data.deel === 'wijzigingen' },
        ]} />
      </div>

      {data.deel === 'dashboard' && <DashboardView kpi={snapshot.kpi} />}

      {data.deel === 'werken' && (
        rows.length === 0
          ? <EmptyState title="Geen werken bewaard" description="Bij deze vaststelling zijn geen werkenregels opgeslagen." tone="neutral" />
          : (
            <div className="min-h-[480px] flex-1">
              <ManagementProjectenTabel
                rows={rows} variant="lopend" scherm="management-historie"
                layouts={layouts.historie} user_id={user_id}
                onRijKlik={p => setVerloopWerk(p)}
              />
            </div>
          )
      )}

      {data.deel === 'wijzigingen' && (
        data.vorigePeriode
          ? <GroteWijzigingen
              wijzigingen={wijzigingen}
              sindsLabel={maandLabel(data.vorigePeriode)}
              onKiesWerk={setVerloopWerk}
            />
          : <EmptyState title="Geen eerdere vaststelling"
              description="Dit is de oudste vastgestelde maand; er is niets om mee te vergelijken." tone="neutral" />
      )}

      <WerkVerloopDialog werk={verloopWerk} live={live} onClose={() => setVerloopWerk(null)} />
    </div>
  )
}
