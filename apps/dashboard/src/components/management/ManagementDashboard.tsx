'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { syncManagementAction } from '@/app/(platform)/management/actions'
import { Button } from '@/components/ui/button'
import { CalendarCheck } from 'lucide-react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import {
  berekenManagementKpi,
  type ManagementProject, type ManagementAK, type ManagementDoelstelling, type ManagementOhw,
  type FunnelData, type CalculatorStat, type MaandSnapshotSamenvatting,
} from '@/lib/dashboard/aggregaties'
import ManagementProjectenTabel from './ManagementProjectenTabel'
import DashboardView from './DashboardView'
import FunnelView from './FunnelView'
import CalculatorsView from './CalculatorsView'
import HistorieView from './HistorieView'
import MaandcijfersModal from './MaandcijfersModal'

/* Types blijven hier geëxporteerd voor bestaande imports (queries, tabel, instellingen). */
export type { ManagementProject, ManagementAK, ManagementDoelstelling, ManagementOhw }

type ManagementLayouts = {
  lopend: GebruikerLayout[]
  gereed: GebruikerLayout[]
  servicedesk: GebruikerLayout[]
}

type Props = {
  projecten: ManagementProject[]
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  funnel: FunnelData
  calculators: CalculatorStat[]
  snapshots: MaandSnapshotSamenvatting[]
  laatstGesynchroniseerd: string | null
  user_id: string | null
  layouts: ManagementLayouts
}

type View = 'dashboard' | 'lopend' | 'gereed' | 'servicedesk' | 'funnel' | 'calculators' | 'historie'

function fDatum(iso: string | null): string {
  if (!iso) return 'Nooit'
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function ManagementDashboard({
  projecten, akData, doelstellingen, funnel, calculators, snapshots,
  laatstGesynchroniseerd, user_id, layouts,
}: Props) {
  const [view, setView]             = useState<View>('dashboard')
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [isPending, startTransition] = useTransition()

  const lopend      = useMemo(() => projecten.filter(p => p.dossier_sectie === 'opdrachten' && !p.is_gereed), [projecten])
  const gereed      = useMemo(() => projecten.filter(p => p.is_gereed), [projecten])
  const servicedesk = useMemo(() => projecten.filter(p => p.dossier_sectie === 'servicedesk' && !p.is_gereed), [projecten])

  const kpi = useMemo(() => berekenManagementKpi(projecten, akData, doelstellingen), [projecten, akData, doelstellingen])

  function handleSync() {
    setSyncResult(null)
    startTransition(async () => {
      const r = await syncManagementAction()
      setSyncResult(
        r.fouten > 0
          ? `⚠ ${r.fouten} fouten — ${r.foutMelding ?? ''}`
          : `✓ ${r.nieuw} nieuw · ${r.bijgewerkt} bijgewerkt`,
      )
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Actiebalk ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, flexShrink: 0, gap: 12,
      }}>
        {/* Filter-tabs (DS-patroon: pill-stijl) */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([
            { key: 'dashboard',   label: 'Dashboard' },
            { key: 'lopend',      label: `Lopende Werken (${lopend.length})` },
            { key: 'gereed',      label: `Gereed Werken (${gereed.length})` },
            { key: 'servicedesk', label: `Servicedesk (${servicedesk.length})` },
            { key: 'funnel',      label: 'Verkoop' },
            { key: 'calculators', label: 'Calculators' },
            { key: 'historie',    label: `Historie${snapshots.length ? ` (${snapshots.length})` : ''}` },
          ] as const).map(({ key, label }) => {
            const actief = view === key
            return (
              <button
                key={key}
                onClick={() => setView(key)}
                style={{
                  height: 30, padding: '0 14px', borderRadius: 6, border: '1px solid',
                  borderColor: actief ? 'var(--brand-300)' : 'var(--neutral-200)',
                  background:  actief ? 'var(--brand-50)'  : 'white',
                  color:       actief ? 'var(--brand-700)' : 'var(--neutral-600)',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', transition: 'all 120ms',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>

        {/* Acties */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 11, color: 'var(--neutral-400)' }}>
            Sync: {fDatum(laatstGesynchroniseerd)}
          </span>
          {syncResult && (
            <span style={{
              fontSize: 12, fontWeight: 600,
              color: syncResult.startsWith('⚠') ? 'var(--error-500)' : 'var(--success-700)',
            }}>
              {syncResult}
            </span>
          )}
          <Button variant="outline" size="md" onClick={() => setModalOpen(true)}>
            <CalendarCheck className="h-4 w-4 mr-1" /> Maandcijfers vaststellen
          </Button>
          <Button asChild variant="outline" size="md">
            <Link href="/management/instellingen">Instellingen</Link>
          </Button>
          <Button variant="primary" size="md" loading={isPending} onClick={handleSync}>
            {isPending ? 'Synchroniseren…' : 'Synchroniseer'}
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        {view === 'dashboard'   && <DashboardView kpi={kpi} />}
        {view === 'funnel'      && <FunnelView funnel={funnel} />}
        {view === 'calculators' && <CalculatorsView calculators={calculators} />}
        {view === 'historie'    && <HistorieView snapshots={snapshots} />}
        {view === 'lopend' && (
          <ManagementProjectenTabel rows={lopend} variant="lopend"
            scherm="management-lopend" layouts={layouts.lopend} user_id={user_id} />
        )}
        {view === 'gereed' && (
          <ManagementProjectenTabel rows={gereed} variant="gereed"
            scherm="management-gereed" layouts={layouts.gereed} user_id={user_id} />
        )}
        {view === 'servicedesk' && (
          <ManagementProjectenTabel rows={servicedesk} variant="servicedesk"
            scherm="management-servicedesk" layouts={layouts.servicedesk} user_id={user_id} />
        )}
      </div>

      <MaandcijfersModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        bestaandePeriodes={snapshots.map(s => s.periode)}
        onDone={(msg) => setSyncResult(msg)}
      />
    </div>
  )
}
