import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getManagementAk,
  getManagementDoelstellingen,
  getManagementDimensies,
  getManagementOhw,
  getManagementProjectenKeuze,
  HUIDIG_BOEKJAAR,
} from '@/lib/dashboard/queries'
import ManagementInstellingen from '@/components/management/ManagementInstellingen'
import { vereisModuleToegang } from '@/lib/auth/rechten'

export const metadata: Metadata = { title: 'Management — Instellingen' }
export const dynamic = 'force-dynamic'

export default async function ManagementInstellingenPage() {
  await vereisModuleToegang('management', 'beheren')

  const [akData, doelstellingen, dimensies, ohwData, projectKeuze] = await Promise.all([
    getManagementAk(),
    getManagementDoelstellingen(),
    getManagementDimensies(),
    getManagementOhw(HUIDIG_BOEKJAAR),
    getManagementProjectenKeuze(),
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
            Algemene kosten (AK) en doelstellingen per werkmaatschappij / projectleider, en OHW-correcties per dossier.
          </p>
        </div>
      </div>

      <ManagementInstellingen
        akData={akData}
        doelstellingen={doelstellingen}
        ohwData={ohwData}
        projectKeuze={projectKeuze}
        filialen={dimensies.filialen}
        projectleiders={dimensies.projectleiders}
      />
    </div>
  )
}
