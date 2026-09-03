import { PageHeader } from '@/components/ui'
import { createClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisSessie } from '@/lib/auth/rechten'
import { getTeamWeken, getProjectRegels } from '@/lib/uren/goedkeuring'
import { getUrenInstellingen } from '@/lib/uren/instellingen'
import { getTeBeoordelenVerlof } from '@/lib/uren/verlof'
import GoedkeurenClient from '@/components/uren/GoedkeurenClient'

export const metadata = { title: 'Uren goedkeuren' }
export const dynamic = 'force-dynamic'

/**
 * Goedkeuren van weekstaten, in twee stappen: eerst de teamleider de hele week, daarna elke
 * projectleider de regels op zijn eigen dossiers.
 *
 * Staat de modus op 'bouw7' — de huidige praktijk — dan wordt er niet híér geaccordeerd maar in
 * Bouw7 zelf; dit scherm laat dan alleen zien wat er loopt. Dat onderscheid moet zichtbaar zijn,
 * anders zit een teamleider te wachten op een knop die er niet is.
 */
export default async function UrenGoedkeurenPage() {
  await vereisSessie()

  // Layouts van de Bouw7-tabel horen bij de gebruiker, niet bij het scherm.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  const [weken, regels, verlof, instellingen, layouts] = await Promise.all([
    getTeamWeken(),
    getProjectRegels(),
    getTeBeoordelenVerlof(),
    getUrenInstellingen(),
    userId ? laadLayouts(userId, 'uren-bouw7') : Promise.resolve([]),
  ])

  return (
    <div className="eva-page">
      <PageHeader eyebrow="Uren" title="Goedkeuren" />
      <GoedkeurenClient
        weken={weken}
        regels={regels}
        verlof={verlof}
        bedrijfsModus={instellingen.goedkeuring_modus}
        layouts={layouts}
        userId={userId}
      />
    </div>
  )
}
