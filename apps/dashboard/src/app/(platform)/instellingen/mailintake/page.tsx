import type { Metadata } from 'next'
import { createAdminClient } from '@everts/database/server'

import { vereisRecht } from '@/lib/auth/rechten'
// Niet `rechten.mailintake === 'beheren'`: die vergelijking mist de beheerder,
// die via isBeheerder overal doorkomt. vereisRecht gebruikt dezelfde helper,
// dus anders kom je wel op de pagina maar staat alles op alleen-lezen.
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { getPostbussen, getAliassen } from '@/lib/mailintake/data'
import { getNabehandelStand } from '@/lib/mailintake/actions'

import MailintakeInstellingen from './MailintakeInstellingen'

export const metadata: Metadata = { title: 'Mailintake' }
export const dynamic = 'force-dynamic'

export default async function MailintakeInstellingenPage() {
  const { rechten } = await vereisRecht('mailintake', 'lezen')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createAdminClient()
  const [postbussen, aliassen, stand, { data: medewerkers }, { data: werkmaatschappijen }] = await Promise.all([
    getPostbussen(),
    getAliassen(),
    getNabehandelStand(),
    supabase.from('medewerkers').select('id, voornaam, tussenvoegsel, achternaam, auth_user_id')
      .eq('actief', true).order('achternaam').limit(300),
    supabase.from('bedrijfsgegevens').select('id, naam').eq('type', 'werkmaatschappij').order('naam').limit(50),
  ])

  return (
    <MailintakeInstellingen
      postbussen={JSON.parse(JSON.stringify(postbussen))}
      aliassen={JSON.parse(JSON.stringify(aliassen))}
      nabehandelStand={stand}
      medewerkers={(medewerkers ?? []).map(m => ({
        id: m.id,
        naam: [m.voornaam, m.tussenvoegsel, m.achternaam].filter(Boolean).join(' '),
        // Zonder EVA-account kan een actie niet aan iemand hangen; het scherm
        // waarschuwt daarvoor in plaats van hem stil te laten verdwijnen.
        heeftLogin: m.auth_user_id != null,
      }))}
      werkmaatschappijen={werkmaatschappijen ?? []}
      magBeheren={heeftModuleToegang(rechten, 'mailintake', 'beheren')}
    />
  )
}
