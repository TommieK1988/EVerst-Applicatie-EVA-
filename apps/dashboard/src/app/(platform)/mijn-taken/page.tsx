import type { Metadata } from 'next'
import { createClient as createServerClient } from '@everts/database/server'
import { laadLayouts } from '@/app/actions/layouts'
import { vereisModuleToegang, getCurrentMedewerker, getEffectieveRechten } from '@/lib/auth/rechten'
import { heeftModuleToegang } from '@/lib/auth/rechten-shared'
import { getMijnTakenRijen, getAlleTakenRijen } from '@/lib/taken/services/taken'
import TakenActieveDossiers from '@/components/taken/TakenActieveDossiers'

export const metadata: Metadata = { title: 'Mijn acties' }

export default async function MijnTakenPage() {
  await vereisModuleToegang('mijn_taken')

  let user_id: string | null = null
  try {
    const sessionClient = await createServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    user_id = user?.id ?? null
  } catch {
    // niet ingelogd of session unavailable
  }

  const medewerker = await getCurrentMedewerker()
  const rechten = await getEffectieveRechten(medewerker)
  const magAlleTaken = heeftModuleToegang(rechten, 'alle_taken')

  const [data, layouts] = await Promise.all([
    magAlleTaken
      ? getAlleTakenRijen()
      : (user_id ? getMijnTakenRijen(user_id) : Promise.resolve([])),
    user_id ? laadLayouts(user_id, 'mijn-taken') : [],
  ])

  return (
    <TakenActieveDossiers
      data={data}
      layouts={layouts}
      user_id={user_id}
      titel="Mijn acties"
      subtitel={magAlleTaken ? 'Open acties, per dossier gebundeld.' : 'Al jouw toegewezen open acties, per dossier gebundeld.'}
      scherm="mijn-taken"
      variant="mijn-taken"
      magAlleTaken={magAlleTaken}
      beginSortering={[{ id: 'deadline', desc: false }]}
    />
  )
}
