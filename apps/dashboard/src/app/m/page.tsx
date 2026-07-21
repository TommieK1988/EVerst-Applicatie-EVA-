import { createClient } from '@everts/database/server'
import { telMijnOpenTaken } from '@/lib/taken/services/taken'
import { getCurrentMedewerker } from '@/lib/auth/rechten'
import MobielHome from '@/components/mobiel/MobielHome'

export const metadata = { title: 'EVA Mobiel' }

export default async function MobielHomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Alleen een teller ophalen, geen taakrijen — dit is het eerste scherm dat laadt.
  const [openTaken, medewerker] = await Promise.all([
    user ? telMijnOpenTaken(user.id).catch(() => 0) : Promise.resolve(0),
    getCurrentMedewerker().catch(() => null),
  ])

  return <MobielHome naam={medewerker?.voornaam ?? null} openTaken={openTaken} />
}
