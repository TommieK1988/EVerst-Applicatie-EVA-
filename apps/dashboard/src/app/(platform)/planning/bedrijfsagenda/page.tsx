import type { Metadata } from 'next'
import { getYear } from 'date-fns'
import { createAdminClient, createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { haalAlleRegels } from './actions'
import BedrijfsagendaView from '@/components/planning/BedrijfsagendaView'
import { PageHeader } from '@/components/ui'

export const metadata: Metadata = { title: 'Bedrijfsagenda' }

export default async function BedrijfsagendaPage() {
  const jaar = getYear(new Date())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any

  const [huidigeJaar, volgendJaar, afdRes, medRes] = await Promise.all([
    haalAlleRegels(jaar),
    haalAlleRegels(jaar + 1),
    admin.from('medewerker_afdelingen').select('id, naam').eq('actief', true).order('naam'),
    admin.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam, afdeling').eq('actief', true).order('achternaam'),
  ])

  const regels      = [...huidigeJaar, ...volgendJaar]
  const afdelingen  = afdRes.data ?? []
  const medewerkers = medRes.data ?? []

  let user_id: string | null = null
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sessionClient = createServerClient() as any
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch { /* geen sessie */ }

  const layouts = user_id ? await laadLayouts(user_id, 'bedrijfsagenda-lijst') : []

  return (
    <div className="eva-page-full">
      <PageHeader eyebrow="Planning" title="Bedrijfsagenda" />
      <p className="eva-page-desc">Bedrijfsbrede evenementen, feestdagen, verjaardagen en jubilea.</p>
      <BedrijfsagendaView
        regels={regels}
        layouts={layouts}
        user_id={user_id}
        afdelingen={afdelingen}
        medewerkers={medewerkers}
      />
    </div>
  )
}
