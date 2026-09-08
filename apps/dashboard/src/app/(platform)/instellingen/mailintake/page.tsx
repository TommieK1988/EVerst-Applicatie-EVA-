import type { Metadata } from 'next'
import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'
import { getPostbussen, getAliassen } from '@/lib/mailintake/data'
import { getNabehandelStand } from '@/lib/mailintake/actions'

import MailintakeInstellingen from './MailintakeInstellingen'

export const metadata: Metadata = { title: 'Mailintake' }
export const dynamic = 'force-dynamic'

export default async function MailintakeInstellingenPage() {
  const { rechten } = await vereisRecht('mailintake', 'lezen')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient() as any
  const [postbussen, aliassen, stand, { data: medewerkers }, { data: werkmaatschappijen }] = await Promise.all([
    getPostbussen(),
    getAliassen(),
    getNabehandelStand(),
    supabase.from('medewerkers').select('id, voornaam, achternaam').eq('actief', true).order('achternaam').limit(300),
    supabase.from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').order('naam').limit(50),
  ])

  return (
    <MailintakeInstellingen
      postbussen={JSON.parse(JSON.stringify(postbussen))}
      aliassen={JSON.parse(JSON.stringify(aliassen))}
      nabehandelStand={stand}
      medewerkers={(medewerkers ?? []).map((m: any) => ({
        id: m.id, naam: [m.voornaam, m.achternaam].filter(Boolean).join(' '),
      }))}
      werkmaatschappijen={werkmaatschappijen ?? []}
      magBeheren={rechten.mailintake === 'beheren'}
    />
  )
}
