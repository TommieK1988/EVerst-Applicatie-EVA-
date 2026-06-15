import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getManagementAk,
  getManagementDoelstellingen,
  getManagementDimensies,
} from '@/lib/dashboard/queries'
import ManagementInstellingen from '@/components/management/ManagementInstellingen'

export const metadata: Metadata = { title: 'Management — Instellingen' }
export const dynamic = 'force-dynamic'

export default async function ManagementInstellingenPage() {
  const [akData, doelstellingen, dimensies] = await Promise.all([
    getManagementAk(),
    getManagementDoelstellingen(),
    getManagementDimensies(),
  ])

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Button asChild variant="ghost" size="sm">
          <Link href="/management"><ArrowLeft className="h-4 w-4" /> Terug</Link>
        </Button>
        <div>
          <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            Management — Instellingen
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Algemene kosten (AK) per werkmaatschappij en doelstellingen per werkmaatschappij / projectleider.
          </p>
        </div>
      </div>

      <ManagementInstellingen
        akData={akData}
        doelstellingen={doelstellingen}
        filialen={dimensies.filialen}
        projectleiders={dimensies.projectleiders}
      />
    </div>
  )
}
