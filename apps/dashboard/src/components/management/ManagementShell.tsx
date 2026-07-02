'use client'

import { createContext, useContext, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { syncManagementAction } from '@/app/(platform)/management/actions'
import { Button } from '@/components/ui/button'
import { CalendarCheck } from 'lucide-react'
import type { GebruikerLayout } from '@everts/database/platform-types'
import type {
  ManagementProject, ManagementAK, ManagementDoelstelling,
  FunnelData, CalculatorStat, MaandSnapshotSamenvatting,
} from '@/lib/dashboard/aggregaties'
import MaandcijfersModal from './MaandcijfersModal'

type ManagementLayouts = {
  lopend: GebruikerLayout[]
  gereed: GebruikerLayout[]
  servicedesk: GebruikerLayout[]
}

export type ManagementData = {
  projecten: ManagementProject[]
  akData: ManagementAK[]
  doelstellingen: ManagementDoelstelling[]
  lopend: ManagementProject[]
  gereed: ManagementProject[]
  servicedesk: ManagementProject[]
  funnel: FunnelData
  calculators: CalculatorStat[]
  snapshots: MaandSnapshotSamenvatting[]
  layouts: ManagementLayouts
  user_id: string | null
}

const ManagementContext = createContext<ManagementData | null>(null)

export function useManagementData(): ManagementData {
  const ctx = useContext(ManagementContext)
  if (!ctx) throw new Error('useManagementData moet binnen <ManagementShell> gebruikt worden')
  return ctx
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
  children: React.ReactNode
}

function fDatum(iso: string | null): string {
  if (!iso) return 'Nooit'
  return new Date(iso).toLocaleString('nl-NL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function ManagementShell({
  projecten, akData, doelstellingen, funnel, calculators, snapshots,
  laatstGesynchroniseerd, user_id, layouts, children,
}: Props) {
  const pathname = usePathname()
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [modalOpen, setModalOpen]   = useState(false)
  const [isPending, startTransition] = useTransition()

  const lopend      = useMemo(() => projecten.filter(p => p.dossier_sectie === 'opdrachten' && !p.is_gereed), [projecten])
  const gereed      = useMemo(() => projecten.filter(p => p.is_gereed), [projecten])
  const servicedesk = useMemo(() => projecten.filter(p => p.dossier_sectie === 'servicedesk' && !p.is_gereed), [projecten])

  const data = useMemo<ManagementData>(() => ({
    projecten, akData, doelstellingen, lopend, gereed, servicedesk,
    funnel, calculators, snapshots, layouts, user_id,
  }), [projecten, akData, doelstellingen, lopend, gereed, servicedesk, funnel, calculators, snapshots, layouts, user_id])

  const opDashboard = pathname === '/management/dashboard'

  function handleSync() {
    setSyncResult(null)
    startTransition(async () => {
      try {
        const r = await syncManagementAction()
        setSyncResult(
          r.fouten > 0
            ? `⚠ ${r.fouten} fouten — ${r.foutMelding ?? ''}`
            : `✓ ${r.nieuw} nieuw · ${r.bijgewerkt} bijgewerkt`,
        )
      } catch {
        // Server-action gekilld (bv. 300s-timeout) of netwerkfout: nooit de pagina
        // laten crashen — toon een nette melding. De geplande sync houdt de data actueel.
        setSyncResult('⚠ Synchronisatie afgebroken (duurde te lang). De geplande sync houdt de cijfers actueel; probeer het later opnieuw.')
      }
    })
  }

  return (
    <ManagementContext.Provider value={data}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Actiebalk ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          marginBottom: 16, flexShrink: 0, gap: 8,
        }}>
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
          {opDashboard && (
            <>
              <Button variant="outline" size="md" onClick={() => setModalOpen(true)}>
                <CalendarCheck className="h-4 w-4 mr-1" /> Maandcijfers vaststellen
              </Button>
              <Button asChild variant="outline" size="md">
                <Link href="/management/instellingen">Instellingen</Link>
              </Button>
            </>
          )}
          <Button variant="primary" size="md" loading={isPending} onClick={handleSync}>
            {isPending ? 'Synchroniseren…' : 'Synchroniseer'}
          </Button>
        </div>

        {/* ── Content ── */}
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          {children}
        </div>

        <MaandcijfersModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          bestaandePeriodes={snapshots.map(s => s.periode)}
          onDone={(msg) => setSyncResult(msg)}
        />
      </div>
    </ManagementContext.Provider>
  )
}
